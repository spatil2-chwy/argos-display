import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
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
const defaultProviderId = 'puffle-go2-display';
const defaultResourceId = 'screen_001';
const defaultManifestPath = join(rootDir, 'argos-display.manifest.json');
const manifestPath = process.env.ARGOS_MANIFEST_PATH
  ? resolve(rootDir, process.env.ARGOS_MANIFEST_PATH)
  : defaultManifestPath;
const cliArgs = process.argv.slice(2);
const cliPositionals = cliArgs.filter((arg) => !arg.startsWith('-'));

const legacyDisplayPaths = new Set(['display', 'api/display', 'command', 'api/command']);
const legacyImagePaths = new Set(['image', 'api/image', 'live-image', 'api/live-image']);
const legacyResponsePaths = new Set(['response', 'api/response', 'interaction', 'api/interaction']);
const resourceDisplayPaths = new Set(legacyDisplayPaths);
const resourceImagePaths = new Set(legacyImagePaths);
const resourceResponsePaths = new Set(legacyResponsePaths);

const resourceStates = new Map();

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

function normalizePathname(pathname) {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function encodeRouteSegment(segment) {
  return encodeURIComponent(segment);
}

function getResourceKey(providerId, resourceId) {
  return `${providerId}/${resourceId}`;
}

function getResourceBasePath(resource) {
  return `/argos/providers/${encodeRouteSegment(resource.providerId)}/resources/${encodeRouteSegment(resource.resourceId)}`;
}

function normalizeManifestResource(resource) {
  const providerId = resource.providerId || resource.provider || resource.providerName;
  const resourceId = resource.resourceId || resource.resource || resource.id || resource.name;

  if (typeof providerId !== 'string' || providerId.trim() === '') {
    throw new Error('Manifest resources must include a providerId');
  }

  if (typeof resourceId !== 'string' || resourceId.trim() === '') {
    throw new Error('Manifest resources must include a resourceId');
  }

  return {
    providerId: providerId.trim(),
    resourceId: resourceId.trim(),
  };
}

function getCliOption(names) {
  for (let index = 0; index < cliArgs.length; index += 1) {
    const arg = cliArgs[index];

    for (const name of names) {
      if (arg === name) {
        const nextArg = cliArgs[index + 1];
        return nextArg && !nextArg.startsWith('-') ? nextArg : '';
      }

      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }

  return '';
}

function getNpmConfigOption(keys, positionalIndex = 0) {
  for (const key of keys) {
    const value = process.env[key];
    if (!value) continue;

    if (value === 'true') {
      return cliPositionals[positionalIndex] || '';
    }

    return value;
  }

  return '';
}

function getConfiguredProviderId() {
  return (
    getCliOption(['--provider', '--provider-id', '--providerId']) ||
    process.env.ARGOS_PROVIDER_ID ||
    getNpmConfigOption(['npm_config_provider', 'npm_config_provider_id'], 0) ||
    ''
  ).trim();
}

function getConfiguredResourceId() {
  const providerConsumedFirstPositional = (
    process.env.npm_config_provider === 'true' ||
    process.env.npm_config_provider_id === 'true'
  );

  return (
    getCliOption(['--resource', '--resource-id', '--resourceId']) ||
    process.env.ARGOS_RESOURCE_ID ||
    getNpmConfigOption(
      ['npm_config_resource', 'npm_config_resource_id'],
      providerConsumedFirstPositional ? 1 : 0,
    ) ||
    ''
  ).trim();
}

function resolveDefaultResource(resources, manifestDefaultResource) {
  const configuredProviderId = getConfiguredProviderId();
  const configuredResourceId = getConfiguredResourceId();

  if (!configuredProviderId && !configuredResourceId) {
    return manifestDefaultResource;
  }

  const matchingResources = resources.filter((resource) => (
    (!configuredProviderId || resource.providerId === configuredProviderId) &&
    (!configuredResourceId || resource.resourceId === configuredResourceId)
  ));

  if (matchingResources.length > 0) {
    return matchingResources[0];
  }

  const requestedResource = {
    providerId: configuredProviderId || manifestDefaultResource.providerId,
    resourceId: configuredResourceId || manifestDefaultResource.resourceId,
  };
  const knownResources = resources
    .map((resource) => `${resource.providerId}/${resource.resourceId}`)
    .join(', ');

  throw new Error(
    `Requested Argos resource ${requestedResource.providerId}/${requestedResource.resourceId} ` +
    `is not listed in ${manifestPath}. Known resources: ${knownResources}`,
  );
}

function loadArgosManifest() {
  const fallbackResource = {
    providerId: getConfiguredProviderId() || defaultProviderId,
    resourceId: getConfiguredResourceId() || defaultResourceId,
  };

  if (!existsSync(manifestPath)) {
    return {
      defaultResource: fallbackResource,
      resources: [fallbackResource],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const rawResources = Array.isArray(parsed.resources)
      ? parsed.resources
      : Array.isArray(parsed.providerResources)
        ? parsed.providerResources
        : [];
    const resources = rawResources.map(normalizeManifestResource);

    if (resources.length === 0) {
      resources.push(fallbackResource);
    }

    const manifestDefaultResource = parsed.default
      ? normalizeManifestResource(parsed.default)
      : {
          providerId: parsed.defaultProviderId || parsed.defaultProvider || resources[0].providerId,
          resourceId: parsed.defaultResourceId || parsed.defaultResource || resources[0].resourceId,
        };
    const defaultResource = resolveDefaultResource(resources, manifestDefaultResource);

    const hasDefault = resources.some((resource) => (
      resource.providerId === defaultResource.providerId &&
      resource.resourceId === defaultResource.resourceId
    ));

    if (!hasDefault) {
      resources.unshift(defaultResource);
    }

    return { defaultResource, resources };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Requested Argos resource')) {
      throw error;
    }

    console.warn(`Unable to read Argos manifest at ${manifestPath}:`, error);
    return {
      defaultResource: fallbackResource,
      resources: [fallbackResource],
    };
  }
}

const argosManifest = loadArgosManifest();
const manifestResourceKeys = new Set(
  argosManifest.resources.map((resource) => getResourceKey(resource.providerId, resource.resourceId)),
);

function createResourceState() {
  return {
    clients: new Set(),
    currentDisplay: { type: 'face', face: 'happy' },
    currentImageDisplay: null,
    imageClearTimeout: null,
    lastResponse: null,
  };
}

function getResourceState(resource) {
  const key = getResourceKey(resource.providerId, resource.resourceId);

  if (!resourceStates.has(key)) {
    resourceStates.set(key, createResourceState());
  }

  return resourceStates.get(key);
}

function getManifestResponse() {
  const resources = argosManifest.resources.map((resource) => ({
    ...resource,
    basePath: getResourceBasePath(resource),
    endpoints: [
      `GET ${getResourceBasePath(resource)}/events`,
      `POST ${getResourceBasePath(resource)}/display`,
      `POST ${getResourceBasePath(resource)}/image`,
      `POST ${getResourceBasePath(resource)}/response`,
      `GET ${getResourceBasePath(resource)}/health`,
      `GET ${getResourceBasePath(resource)}/state`,
      `GET ${getResourceBasePath(resource)}/image`,
      `GET ${getResourceBasePath(resource)}/response`,
    ],
  }));

  return {
    defaultProviderId: argosManifest.defaultResource.providerId,
    defaultResourceId: argosManifest.defaultResource.resourceId,
    defaultBasePath: getResourceBasePath(argosManifest.defaultResource),
    resources,
  };
}

function getResourceRoute(pathname) {
  const normalizedPathname = normalizePathname(pathname);
  const match = normalizedPathname.match(/^\/argos\/providers\/([^/]+)\/resources\/([^/]+)(?:\/(.+))?$/);

  if (!match) {
    return null;
  }

  const providerId = decodeURIComponent(match[1]);
  const resourceId = decodeURIComponent(match[2]);
  const resource = { providerId, resourceId };
  const key = getResourceKey(providerId, resourceId);

  if (!manifestResourceKeys.has(key)) {
    return {
      isKnownResource: false,
      resource,
      actionPath: match[3] || '',
    };
  }

  return {
    isKnownResource: true,
    resource,
    actionPath: (match[3] || '').replace(/\/+$/, ''),
  };
}

function getLegacyRoute(pathname) {
  return {
    isKnownResource: true,
    resource: argosManifest.defaultResource,
    actionPath: normalizePathname(pathname).slice(1),
  };
}

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

function broadcast(resourceState, event, data) {
  for (const client of resourceState.clients) {
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

function clearImageDisplay(resourceState, { broadcastClear = false } = {}) {
  if (resourceState.imageClearTimeout) {
    clearTimeout(resourceState.imageClearTimeout);
    resourceState.imageClearTimeout = null;
  }

  resourceState.currentImageDisplay = null;

  if (broadcastClear) {
    broadcast(resourceState, 'image', { type: 'clear_image' });
  }
}

function setImageDisplay(resourceState, command) {
  const now = new Date();
  const ttlMs = getImageTtlMs(command);

  if (resourceState.imageClearTimeout) {
    clearTimeout(resourceState.imageClearTimeout);
  }

  resourceState.currentImageDisplay = {
    ...command,
    type: getCommandKind(command) || 'image',
    ttlMs,
    receivedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  resourceState.imageClearTimeout = setTimeout(() => {
    resourceState.currentImageDisplay = null;
    resourceState.imageClearTimeout = null;
    broadcast(resourceState, 'image', { type: 'clear_image' });
  }, ttlMs);

  broadcast(resourceState, 'image', resourceState.currentImageDisplay);
  return resourceState.currentImageDisplay;
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
  const resourceRoute = getResourceRoute(url.pathname);

  if (resourceRoute && !resourceRoute.isKnownResource) {
    sendJson(res, 404, {
      ok: false,
      error: 'Unknown Argos provider/resource pair',
      providerId: resourceRoute.resource.providerId,
      resourceId: resourceRoute.resource.resourceId,
      manifest: getManifestResponse(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/argos/manifest') {
    sendJson(res, 200, getManifestResponse());
    return;
  }

  const route = resourceRoute || getLegacyRoute(url.pathname);
  const resourceState = getResourceState(route.resource);
  const displayPaths = resourceRoute ? resourceDisplayPaths : legacyDisplayPaths;
  const imagePaths = resourceRoute ? resourceImagePaths : legacyImagePaths;
  const responsePaths = resourceRoute ? resourceResponsePaths : legacyResponsePaths;

  if (req.method === 'GET' && route.actionPath === 'health') {
    sendJson(res, 200, {
      ok: true,
      clients: resourceState.clients.size,
      providerId: route.resource.providerId,
      resourceId: route.resource.resourceId,
    });
    return;
  }

  if (req.method === 'GET' && route.actionPath === 'state') {
    sendJson(res, 200, resourceState.currentDisplay);
    return;
  }

  if (req.method === 'GET' && imagePaths.has(route.actionPath)) {
    sendJson(res, 200, resourceState.currentImageDisplay || { image: null });
    return;
  }

  if (req.method === 'GET' && responsePaths.has(route.actionPath)) {
    sendJson(res, 200, resourceState.lastResponse || { response: null });
    return;
  }

  if (req.method === 'GET' && route.actionPath === 'events') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });

    resourceState.clients.add(res);
    sendSse(res, 'snapshot', resourceState.currentDisplay);
    sendSse(res, 'image', resourceState.currentImageDisplay || { type: 'clear_image' });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      resourceState.clients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && displayPaths.has(route.actionPath)) {
    try {
      const command = await readJsonBody(req);
      resourceState.currentDisplay = command;
      if (isImageClearCommand(command)) {
        clearImageDisplay(resourceState, { broadcastClear: true });
      } else if (isImageDisplayCommand(command)) {
        setImageDisplay(resourceState, command);
      }
      broadcast(resourceState, 'display', command);
      sendJson(res, 202, { ok: true, delivered: resourceState.clients.size, command });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid request body',
      });
    }
    return;
  }

  if (req.method === 'POST' && imagePaths.has(route.actionPath)) {
    try {
      const command = await readJsonBody(req);

      if (isImageClearCommand(command)) {
        clearImageDisplay(resourceState, { broadcastClear: true });
        sendJson(res, 202, { ok: true, delivered: resourceState.clients.size, image: null });
        return;
      }

      const image = setImageDisplay(resourceState, command);
      sendJson(res, 202, { ok: true, delivered: resourceState.clients.size, image });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid request body',
      });
    }
    return;
  }

  if (req.method === 'POST' && responsePaths.has(route.actionPath)) {
    try {
      const response = await readJsonBody(req);
      resourceState.lastResponse = {
        ...response,
        receivedAt: new Date().toISOString(),
      };
      broadcast(resourceState, 'response', resourceState.lastResponse);
      sendJson(res, 202, {
        ok: true,
        delivered: resourceState.clients.size,
        response: resourceState.lastResponse,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid request body',
      });
    }
    return;
  }

  if (!resourceRoute && (req.method === 'GET' || req.method === 'HEAD') && await serveStatic(req, res)) {
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: 'Not found',
    manifest: getManifestResponse(),
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Control server listening on http://localhost:${port}`);
  console.log(`Active Argos resource: ${getResourceBasePath(argosManifest.defaultResource)}`);
  if (existsSync(join(distDir, 'index.html'))) {
    console.log(`Serving built frontend from ${distDir}`);
  }
});
