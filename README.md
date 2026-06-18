# Local Avatar Display

A local React/Vite display surface. It shows built-in Rive face animations, custom Rive files by URL, subtitles, centered messages, and countdown timers.
It can also show a small push-updated image panel in the top-left corner while the main display keeps running.

Transport: HTTP

## Recommended Run

Use this when you just want to open the page and send commands to it.

Install dependencies once:

```bash
npm ci
```

Build the frontend:

```bash
npm run build
```

Start the local display server:

```bash
PORT=4173 npm run control
```

Open:

```text
http://localhost:4173
```

Send commands to:

```text
http://localhost:4173/display
```

In this mode, the same server hosts the webpage and the HTTP control API.

## Stop And Restart

If the server was started in the foreground with `npm run control`, stop it with:

```text
Ctrl+C
```

If Docker Compose was started in the foreground, stop it with:

```text
Ctrl+C
```

If Docker Compose is running in the background or you want to fully stop the container:

```bash
docker compose down
```

After code changes, restart the mode you are using:

```bash
npm run build
PORT=4173 npm run control
```

Or for Docker:

```bash
docker compose down
docker compose up --build
```

Refresh the browser page after restarting so it loads the newest frontend bundle.

Changes are not reflected the same way in every mode:

```text
Recommended run: rebuild with npm run build, restart npm run control, refresh browser.
Docker: rebuild with docker compose up --build, refresh browser.
Development mode: frontend changes hot-reload, server changes need npm run control restarted.
```

## Quick Test

Change the face:

```bash
curl -X POST http://localhost:4173/display \
  -H "Content-Type: application/json" \
  -d '{"type":"face","face":"excited"}'
```

Show subtitles:

```bash
curl -X POST http://localhost:4173/display \
  -H "Content-Type: application/json" \
  -d '{"type":"subtitle","text":"Hello from my local agent."}'
```

Show a countdown:

```bash
curl -X POST http://localhost:4173/display \
  -H "Content-Type: application/json" \
  -d '{"type":"countdown","seconds":10}'
```

Show a centered message:

```bash
curl -X POST http://localhost:4173/display \
  -H "Content-Type: application/json" \
  -d '{"type":"message","text":"Thinking..."}'
```

Show a face capture preview:

```bash
curl -X POST http://localhost:4173/display \
  -H "Content-Type: application/json" \
  -d '{"type":"face_capture_preview","requestId":"capture-1","imageUrl":"http://localhost:4173/capture.jpg"}'
```

Show a small live image panel:

```bash
curl -X POST http://localhost:4173/image \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"http://localhost:8000/frame.jpg","title":"Camera"}'
```

A provider can keep the panel alive by sending a fresh image about every 300 ms. If no fresh image arrives, the panel clears after 1 second by default.

```bash
curl -X POST http://localhost:4173/image \
  -H "Content-Type: application/json" \
  -d '{"dataUrl":"data:image/jpeg;base64,...","title":"Camera","ttlMs":1000}'
```

Hide the live image panel:

```bash
curl -X POST http://localhost:4173/image \
  -H "Content-Type: application/json" \
  -d '{"type":"clear"}'
```

Reset to the default face:

```bash
curl -X POST http://localhost:4173/display \
  -H "Content-Type: application/json" \
  -d '{"type":"reset"}'
```

## Supported Commands

Built-in faces:

```text
happy, sad, think, confused, curious, excited
```

Face command:

```json
{ "type": "face", "face": "happy" }
```

Subtitle command:

```json
{ "type": "subtitle", "text": "Recognized speech goes here.", "durationMs": 5000 }
```

Countdown command:

```json
{ "type": "countdown", "seconds": 20 }
```

Message command:

```json
{ "type": "message", "text": "Thinking..." }
```

Custom Rive command:

```json
{ "type": "rive", "url": "http://localhost:4173/my-animation.riv" }
```

Face capture preview command:

```json
{
  "type": "face_capture_preview",
  "requestId": "capture-1",
  "imageUrl": "http://localhost:4173/capture.jpg"
}
```

The image may also be supplied as a `dataUrl`, or as `url`/`src`. After the user presses Accept or Reject, the browser sends the result to:

```text
POST /response
```

After a successful response, Accept returns the display to the default `happy` face. Reject switches the display to the `sad` face.

Read the latest response:

```text
GET /response
```

Response example:

```json
{
  "type": "face_capture_preview_response",
  "requestId": "capture-1",
  "action": "accept",
  "accepted": true
}
```

Live image display command:

```json
{
  "type": "image",
  "imageUrl": "http://localhost:8000/frame.jpg",
  "title": "Camera",
  "ttlMs": 1000
}
```

Send this to `POST /image` when you want the top-left panel to update independently from the main avatar/message display. You can also send the same JSON to `POST /display`.

The panel is about 15% of the viewport width. Each request is treated as a fresh frame. The display keeps that frame for `ttlMs` milliseconds, defaulting to `1000`, then clears it unless another frame arrives first. You can send the image as `imageUrl`, `dataUrl`, `url`, `src`, or `image`.

Clear the live image panel:

```json
{ "type": "clear" }
```

Send that clear command to `POST /image`, or use `{ "type": "clear_image" }` with either `POST /image` or `POST /display`.

Reset command:

```json
{ "type": "reset" }
```

## How It Works

The browser subscribes to a Server-Sent Events stream:

```text
GET /events
```

Your agent sends display commands:

```text
POST /display
```

The local control server broadcasts each command to every open browser tab.

Useful server endpoints:

```text
GET  /health
GET  /state
GET  /image
GET  /events
GET  /response
POST /display
POST /image
POST /response
```

## Development Mode

Use this when editing the React app and wanting Vite hot reload.

Terminal 1:

```bash
npm run control
```

This starts the control API on the default port:

```text
http://localhost:6124
```

Terminal 2:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

In dev mode, send commands to:

```text
http://localhost:6124/display
```

The dev frontend automatically connects to `http://localhost:6124/events`.

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

Open:

```text
http://localhost:4173
```

Send commands to:

```text
http://localhost:4173/display
```
