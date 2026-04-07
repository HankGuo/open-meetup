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

### `GET /api/room/ticket-check?ticket=...`

Checks whether a ticket is currently valid.

Response:

```json
{
  "valid": true
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

### `GET /uploads/:roomId/:fileName`

Read-only uploaded asset endpoint.  
Both `roomId` and `fileName` are strictly sanitized.

---

## 2. Socket.IO Events

All responses use:

```ts
type SocketResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string } };
```

### Room lifecycle

- `room:create` payload: `{ userName, title, password, participantLimit? }`
- `room:join` payload: `{ userName, ticket? }`
- `room:reconnect` payload: `{ userId, sessionId }`
- `room:leave` payload: `{}`
- `room:end` payload: `{}`

Server push:

- `state:sync` full room state snapshot
- `room:closed` payload: `{ reason }`

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
- Uploaded file path segments must pass strict whitelist validation.
- Storage layer also verifies resolved paths stay inside upload root.
- Invalid ticket/session always returns authentication/authorization errors.
