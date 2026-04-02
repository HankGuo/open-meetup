# Open Meetup

[简体中文文档](./README.zh-CN.md)

Open Meetup is a LAN-first, single-room interactive presentation system designed for in-person workshops, trainings, and meetup sessions.

It replaces static slide flow with real-time interaction while keeping deployment and operations simple.

## Product Positioning

- One active room at a time
- One host controls pacing and orchestration
- Participants join by name or ticket
- Setup phase and live phase are clearly separated
- LAN-friendly startup with minimal operator cognitive load
- No Docker required for the default workflow

## Core Capabilities

- `canvas` page:
  - Host-edited free canvas (Excalidraw-based)
  - Displayed read-only during live playback
- `showcase` page:
  - Participant submissions (`url` or `image`)
  - Optional ranking crowns (gold/silver/bronze for top 3)
  - Latest submission wins for each participant
- Ticket-based identity continuity:
  - Host and participants are both bound to tickets
  - Ticket validity is always checked on the backend
  - First create/join shows mandatory ticket reminder dialog
- Layout template workflow:
  - Export orchestration template (`version: 1`)
  - Re-import template during setup phase
- Image transport without socket base64 payload:
  - Binary upload via HTTP
  - Submission payload keeps URL + description only

## Runtime Model

- Room state: in-memory (`MemoryStore`)
- Uploaded files: local filesystem (`server/uploads`)
- On room end/close:
  - managed uploads are cleaned
  - client local storage keys with `open-meetup:` prefix are cleared
- On server restart:
  - in-memory room state is reset

## Architecture Overview

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + Socket.IO + TypeScript
- Storage:
  - runtime room state in memory
  - uploaded assets in local directory

## Requirements

- Node.js 20+
- npm 10+
- Host and participant devices in the same LAN for LAN scenario

## Quick Start

1. Install dependencies:

```bash
npm run install:all
```

2. Start:

```bash
npm start
```

3. Share the printed LAN URL with participants.

The startup script prints a URL like:

`http://192.168.x.x:8080`

By default, it also tries to copy that URL to clipboard.

## Stop and Logs

```bash
npm stop
npm run logs
```

## Startup Options

Use options after `--`:

```bash
npm start -- --host-password <password> --port <client_port>
```

- `--host-password`: host authorization password
- `--port`: frontend access port (LAN share port)

Example:

```bash
npm start -- --host-password 12345678 --port 8080
```

## Configuration

### Commonly used

| Key             | Default    | Description                              |
| --------------- | ---------- | ---------------------------------------- |
| `HOST_PASSWORD` | `12345678` | Host password                            |
| `LAN_PORT`      | `8080`     | Frontend LAN access port for `npm start` |

### Backend/runtime related

| Key                                    | Default                       | Description                                       |
| -------------------------------------- | ----------------------------- | ------------------------------------------------- |
| `HOST`                                 | `0.0.0.0`                     | Backend bind host                                 |
| `PORT`                                 | `3001`                        | Backend HTTP/Socket.IO port                       |
| `MAX_PARTICIPANTS_PER_ROOM`            | `50`                          | Default participant limit used when creating room |
| `ROOM_CLEANUP_INTERVAL_MS`             | `30000`                       | Cleanup interval for offline timeout checks       |
| `TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS` | `60`                          | Max ticket-check requests per window              |
| `CORS_ALLOW_ORIGIN`                    | `*` (non-production fallback) | Allowed CORS origins                              |
| `TRUST_PROXY`                          | `false`                       | Express trust proxy setting                       |

Notes:

- Room participant limit can be customized by host in room creation form.
- Hard bounds are `1 ~ 500`.

## Scripts

| Command                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `npm start`             | Start backend and frontend in LAN-friendly mode |
| `npm stop`              | Stop processes started by `npm start`           |
| `npm run logs`          | Tail backend/frontend logs                      |
| `npm run build`         | Build server and client                         |
| `npm test`              | Build + server tests + client tests             |
| `npm run lint`          | ESLint checks                                   |
| `npm run format`        | Prettier format check                           |
| `npm run sim:bulk-join` | Bulk join simulation (independent testing tool) |

## API and Protocol

High-level references:

- HTTP API: [docs/API.md](./docs/API.md)
- Socket events: [docs/API.md](./docs/API.md)
- Development guide: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)

Main HTTP endpoints:

- `GET /health`
- `GET /api/room/current`
- `GET /api/room/ticket-check?ticket=...`
- `POST /api/uploads/image`
- `GET /uploads/:roomId/:fileName`

## Security Notes

- Ticket validation is backend-authoritative.
- Upload path segments are sanitized at HTTP and storage layers.
- Storage layer enforces resolved-path boundary checks to prevent traversal.
- Empty/invalid image payloads are rejected.

## Testing and Quality Gates

```bash
npm run lint
npm run format
npm test
```

Current test coverage includes:

- Server unit/integration tests (`node --test`)
- Frontend unit tests (`vitest`)

## Project Structure

```text
open-meetup/
├── client/                         # React frontend
├── server/                         # Express + Socket.IO backend
├── scripts/                        # startup/stop/log and simulator scripts
├── docs/                           # developer and API docs
├── .env.example
├── README.md
└── README.zh-CN.md
```

## Limitations (Current Design)

- Single active room only
- Runtime state is not persisted across backend restarts
- Designed primarily for LAN and small-to-medium in-person sessions

## License

MIT License. See [LICENSE](./LICENSE).
