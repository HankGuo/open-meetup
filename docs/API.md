# API Reference / 接口文档

## 1. HTTP API

### `GET /health`

Server health status.

Response:

```json
{
  "status": "ok",
  "activeRooms": 1,
  "disconnectGraceMs": 300000,
  "socketPingIntervalMs": 10000,
  "socketPingTimeoutMs": 10000
}
```

### `GET /api/room/current`

Returns current room summary.

Response (no room):

```json
{
  "exists": false
}
```

Response (room exists):

```json
{
  "exists": true,
  "title": "My Meetup",
  "participantLimit": 50,
  "status": "active",
  "phase": "setup",
  "currentStep": 0,
  "totalPages": 3,
  "hostId": "..."
}
```

### `POST /api/room/ticket-check`

Checks whether a ticket is currently valid. Uses POST so the ticket never
appears in access logs or proxy logs.

Request body:

```json
{
  "ticket": "TKT-XXXXXXXXXXXX"
}
```

Response:

```json
{
  "valid": true
}
```

Rate limited (per IP, NAT-friendly default 300/min):

```json
{
  "valid": false,
  "error": "Too many requests. Please retry later."
}
```

Invalid / room unavailable:

```json
{
  "valid": false,
  "error": "Ticket invalid or room unavailable."
}
```

### `POST /api/uploads/image`

Raw image upload endpoint.

- Header: `x-open-meetup-ticket: <ticket>`
- Header: `x-open-meetup-page-id: <pageId>`
- Header: `content-type: image/*`
- Body: raw binary image bytes

Response:

```json
{
  "url": "/uploads/<roomId>/<fileName>"
}
```

### `POST /api/uploads/template-asset`

Host-only asset upload for layout templates (setup phase, host ticket required).
Same headers/contract as `POST /api/uploads/image` minus the page id header.

### `GET /uploads/:roomId/:fileName`

Read-only uploaded asset endpoint.  
Both `roomId` and `fileName` are strictly sanitized. Responses always carry
`Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`;
SVG files are served as `Content-Disposition: attachment` (and are rejected
on upload unless `ALLOW_SVG_UPLOAD=1`).

---

## 2. Socket.IO Events

All responses use:

```ts
type SocketResult<T> =
  { success: true; data: T } | { success: false; error: { message: string; code: string } };
```

### Room lifecycle

- `room:create` payload: `{ userName, title, password, participantLimit? }`
  - Wrong passwords are rate-limited per IP (`RATE_LIMITED` after repeated failures).
- `room:join` payload: `{ userName, ticket? }`
  - Duplicate nicknames are rejected; a ticket already bound to a live socket
    is rejected with `SESSION_ACTIVE` (prevents silent ghost-tab takeover).
- `room:reconnect` payload: `{ userId, sessionId }`
- `room:leave` payload: `{}`
- `room:end` payload: `{}`
- `room:kick` payload: `{ userId }` — host only; disconnects the target and
  cleans up their submissions/uploads.

Server push:

- `state:sync` room state snapshot (participants/phase/step/pages — no page contents)
- `content:update` payload: `{ entries: Array<[pageId, PageContent | null]> }` — content delta
- `content:reset` payload: `{ pageContents }` — full content reset after structural page changes
- `room:closed` payload: `{ reason }` — including `SERVER_SHUTDOWN` on graceful shutdown
- `room:kicked` — sent to a participant removed by the host
- `rate:limited` payload: `{ windowMs }` — the connection exceeded the event rate limit

### Host controls

- `control:start-live`
- `control:return-setup`
- `control:next`
- `control:prev`

### Page orchestration

- `pages:update` payload: `{ pages: MeetingPageDefinition[] }`
- `page:update` payload: `{ pageId, content: { type, content } | null }`
- `layout:import` payload: `{ template }`

### Participant interaction

- `work:submit` payload: `{ pageId, url, description }`
- `upload:revert` payload: `{ url }`

---

## 3. Security Constraints

- Ticket is required for image upload and is always verified server-side.
- Uploads are validated by magic bytes, not by the Content-Type header; SVG is rejected by default.
- Uploaded file path segments must pass strict whitelist validation.
- Storage layer also verifies resolved paths stay inside upload root.
- Per-room asset quota and per-page content size limits are enforced server-side.
- Socket connections are rate limited per connection; host password attempts are
  locked out per IP after repeated failures; password comparison is constant-time.
- Invalid ticket/session always returns authentication/authorization errors.
- A ticket bound to a live connection cannot be hijacked by a second connection.
