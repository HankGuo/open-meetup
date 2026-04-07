# Development Guide / 开发指南

## 1. Project Structure / 项目结构

- `server/` Node.js + TypeScript + Socket.IO backend
- `client/` React + Vite + TypeScript frontend
- `scripts/meetup-cli.cjs` cross-platform start/stop/log helper
- `docs/` developer and API documentation

## 2. Local Setup / 本地准备

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

## 3. Run / 启动

```bash
npm run start
```

Server default: `http://0.0.0.0:3001`  
Client default: `http://0.0.0.0:5173`

Stop:

```bash
npm run stop
```

Logs:

```bash
npm run logs
```

## 4. Quality Gates / 质量门禁

Build:

```bash
npm run build
```

All tests (server + client):

```bash
npm test
```

Lint:

```bash
npm run lint
```

Format check:

```bash
npm run format
```

## 5. Coding Conventions / 代码约定

- Keep `RoomManager` focused on room orchestration; validation/state sync/upload cleanup should stay in dedicated modules.
- Do not store user identity in browser storage; only store ticket and always verify with backend.
- Uploaded assets must pass filename/path validation in both HTTP layer and storage layer.
- Any new page type should register rules in:
  - `server/src/pageCatalog.ts`
  - `client/src/pageCatalog.ts`

## 6. Environment Variables / 环境变量

- `HOST_PASSWORD` host authorization password (default: `12345678`)
- `PORT` server port (default: `3001`)
- `HOST` bind host (default: `0.0.0.0`)
- `MAX_PARTICIPANTS_PER_ROOM` default participant limit for new room (default: `50`)
- `SOCKET_PING_INTERVAL_MS` Socket.IO heartbeat interval (default: `10000`)
- `SOCKET_PING_TIMEOUT_MS` Socket.IO heartbeat timeout (default: `10000`)
- `CORS_ALLOW_ORIGIN` CORS policy
- `TRUST_PROXY` Express proxy trust config

## 7. Release Checklist / 发布前检查

- `npm run build` passes
- `npm test` passes
- `npm run lint` passes
- `npm run format` passes
- README and docs are updated with any protocol/event changes
