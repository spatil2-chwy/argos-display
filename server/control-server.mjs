import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = join(rootDir, 'dist');
const port = Number.parseInt(process.env.PORT || '6124', 10);
const maxBodyBytes = Number.parseInt(process.env.MAX_BODY_BYTES || `${15 * 1024 * 1024}`, 10);
const configuredImageTtlMs = Number.parseInt(process.env.IMAGE_TTL_MS || '1000', 10);
const defaultImageTtlMs = Number.isFinite(configuredImageTtlMs) ? configuredImageTtlMs : 1000;
const clients = new Set();

let currentDisplay = { type: 'face', face: 'happy' };
let currentImageDisplay = null;
let imageClearTimeout = null;
let lastResponse = null;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.riv': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const client of clients) {
    sendSse(client, event, data);
  }
}

function getCommandKind(command) {
  return typeof command.type === 'string' ? command.type.toLowerCase() : '';
}

function isImageClearCommand(command) {
  const kind = getCommandKind(command);
  return (
    kind === 'reset' ||
    kind === 'clear' ||
    kind === 'clear_image' ||
    kind === 'image_clear' ||
    kind === 'hide_image' ||
    kind === 'hide_live_image' ||
    command.visible === false
  );
}

function isImageDisplayCommand(command) {
  const kind = getCommandKind(command);
  return (
    kind === 'image' ||
    kind === 'live_image' ||
    kind === 'image_display' ||
    kind === 'camera' ||
    kind === 'video'
  );
}

function getImageTtlMs(command) {
  const requestedTtl = command.ttlMs ?? command.durationMs ?? command.refreshMs ?? defaultImageTtlMs;
  const ttlMs = Number.parseInt(`${requestedTtl}`, 10);

  if (!Number.isFinite(ttlMs)) {
    return defaultImageTtlMs;
  }

  return Math.max(100, Math.min(60000, ttlMs));
}

function clearImageDisplay({ broadcastClear = false } = {}) {
  if (imageClearTimeout) {
    clearTimeout(imageClearTimeout);
    imageClearTimeout = null;
  }

  currentImageDisplay = null;

  if (broadcastClear) {
    broadcast('image', { type: 'clear_image' });
  }
}

function setImageDisplay(command) {
  const now = new Date();
  const ttlMs = getImageTtlMs(command);

  if (imageClearTimeout) {
    clearTimeout(imageClearTimeout);
  }

  currentImageDisplay = {
    ...command,
    type: getCommandKind(command) || 'image',
    ttlMs,
    receivedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  imageClearTimeout = setTimeout(() => {
    currentImageDisplay = null;
    imageClearTimeout = null;
    broadcast('image', { type: 'clear_image' });
  }, ttlMs);

  broadcast('image', currentImageDisplay);
  return currentImageDisplay;
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBodyBytes) {
      throw new Error('Request body is too large');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  const body = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body);
}

function canServeStaticFile(filePath) {
  const normalizedPath = normalize(filePath);
  return normalizedPath.startsWith(distDir) && existsSync(normalizedPath) && statSync(normalizedPath).isFile();
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
  const filePath = join(distDir, relativePath);
  const fallbackPath = join(distDir, 'index.html');

  if (canServeStaticFile(filePath)) {
    const extension = extname(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      createReadStream(filePath).pipe(res);
    }
    return true;
  }

  if (existsSync(fallbackPath) && requestedPath !== '/env.js') {
    const html = await readFile(fallbackPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : html);
    return true;
  }

  return false;
}

const server = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, clients: clients.size });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/state') {
    sendJson(res, 200, currentDisplay);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/image' || url.pathname === '/api/image')) {
    sendJson(res, 200, currentImageDisplay || { image: null });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/response' || url.pathname === '/api/response')) {
    sendJson(res, 200, lastResponse || { response: null });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });

    clients.add(res);
    sendSse(res, 'snapshot', currentDisplay);
    sendSse(res, 'image', currentImageDisplay || { type: 'clear_image' });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
    return;
  }

  const displayPaths = new Set(['/display', '/api/display', '/command', '/api/command']);
  if (req.method === 'POST' && displayPaths.has(url.pathname)) {
    try {
      const command = await readJsonBody(req);
      currentDisplay = command;
      if (isImageClearCommand(command)) {
        clearImageDisplay({ broadcastClear: true });
      } else if (isImageDisplayCommand(command)) {
        setImageDisplay(command);
      }
      broadcast('display', command);
      sendJson(res, 202, { ok: true, delivered: clients.size, command });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid request body',
      });
    }
    return;
  }

  const imagePaths = new Set(['/image', '/api/image', '/live-image', '/api/live-image']);
  if (req.method === 'POST' && imagePaths.has(url.pathname)) {
    try {
      const command = await readJsonBody(req);

      if (isImageClearCommand(command)) {
        clearImageDisplay({ broadcastClear: true });
        sendJson(res, 202, { ok: true, delivered: clients.size, image: null });
        return;
      }

      const image = setImageDisplay(command);
      sendJson(res, 202, { ok: true, delivered: clients.size, image });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid request body',
      });
    }
    return;
  }

  const responsePaths = new Set(['/response', '/api/response', '/interaction', '/api/interaction']);
  if (req.method === 'POST' && responsePaths.has(url.pathname)) {
    try {
      const response = await readJsonBody(req);
      lastResponse = {
        ...response,
        receivedAt: new Date().toISOString(),
      };
      broadcast('response', lastResponse);
      sendJson(res, 202, { ok: true, delivered: clients.size, response: lastResponse });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid request body',
      });
    }
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && await serveStatic(req, res)) {
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: 'Not found',
    endpoints: [
      'GET /events',
      'POST /display',
      'GET /state',
      'GET /image',
      'POST /image',
      'GET /response',
      'POST /response',
      'GET /health',
    ],
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Control server listening on http://localhost:${port}`);
  if (existsSync(join(distDir, 'index.html'))) {
    console.log(`Serving built frontend from ${distDir}`);
  }
});
