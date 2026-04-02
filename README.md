# Open Meetup

一个单房间实时互动系统，基于 **React + Socket.IO + TypeScript**。

如需快速启动，可直接阅读「2. 快速启动（局域网 Docker，一条命令）」。

## 1. 项目作用（按当前代码实现）

该项目提供一个由主持人统一控制的实时互动房间系统，适用于线上分享、演示、培训与工作坊等场景。  
当前实现采用「单房间 + 实时同步 + Ticket 身份」模型，关键能力如下：

- 单房间运行：服务端同一时刻仅允许一个活动房间（`ROOM_EXISTS` 保护）
- 双阶段控制：房间阶段为 `setup`（编排）与 `live`（播放），阶段切换由主持人驱动
- 权限分离：主持人负责房间控制与页面编排，参与者负责互动提交
- Ticket 统一身份：创建/加入时签发 Ticket，后续可通过 Ticket 恢复原身份
- 服务端身份校验：Ticket 输入与本地读取都会先经后端校验后再执行加入
- 页面类型可编排：支持 `canvas` 与 `showcase` 两类页面，`showcase` 支持 `url/image` 提交模式与可选排名
- 同步与清理闭环：主持人结束或离线超时时，服务端统一广播关闭事件，客户端统一清理本地状态

## 2. 快速启动（局域网 Docker，一条命令）

### 第 0 步：准备环境

- 安装 Docker（Docker Desktop 或 Docker Engine）
- 确保主持人电脑和参与者设备在同一局域网

### 第 1 步：启动

```bash
cd open-meetup
npm run lan:up -- --host-password 12345678
```

脚本会自动输出并高亮“主持人访问地址 / 参与者访问地址”，格式如下：

- `http://<你的局域网IP>:8080`

在 macOS 上，脚本会自动把这个地址复制到剪贴板，可直接粘贴到群里。

### 第 2 步：停止 / 看日志

```bash
# 停止
npm run lan:down

# 跟踪日志
npm run lan:logs
```

## 3. 主持人如何快速告诉大家访问地址

局域网模式下不需要主持人自己查端口和拼地址：

1. 运行 `npm run lan:up -- --host-password ...`
2. 终端会直接打印可分享地址（`http://<LAN-IP>:8080`）
3. macOS 自动复制到剪贴板，直接发给参与者
4. 主持人进入「页面编排控制台」后，右侧会显示“参与者访问地址”，可一键复制

也就是说，主持人只要记住一句话：**启动后复制终端里那条地址发出去**。

## 4. 开发模式（仅你迭代代码时）

如果你在开发新功能，建议继续用本地热更新模式：

```bash
# 启动前后端热更新
npm run dev:restart -- --host-password 12345678

# 停止
npm run dev:stop
```

## 5. 默认配置

- 主持人授权口令默认值：`12345678`
- LAN 对外端口默认：`8080`
- 服务端容器监听：`3001`（仅容器内部）
- 创建房间时默认人数上限：`50`（不含主持人）

## 6. 前后端地址规则（避免踩坑）

- 局域网 Docker 模式：前后端同域访问（`http://<LAN-IP>:8080`），无需设置 `VITE_SERVER_URL`
- 开发模式（Vite）：前端自动连接到同主机的 `:3001`
- 如果你显式设置了 `VITE_SERVER_URL`，则以该值为准

## 7. 常用命令速查

```bash
# 局域网模式：启动（推荐给线下活动）
npm run lan:up -- --host-password 12345678

# 局域网模式：停止
npm run lan:down

# 局域网模式：日志
npm run lan:logs

# 本地开发热更新
npm run dev:restart -- --host-password 12345678

# 停止开发进程
npm run dev:stop

# 构建
npm run build

# 测试
npm test

# 批量加入模拟（独立工具，不耦合主流程）
npm run sim:bulk-join
```

## 8. 环境变量清单

### Docker Compose（局域网模式）

- `HOST_PASSWORD`：主持人授权口令，默认 `12345678`
- `LAN_PORT`：对外访问端口，默认 `8080`
- `MINIO_ROOT_USER`：MinIO 管理账号，默认 `minioadmin`
- `MINIO_ROOT_PASSWORD`：MinIO 管理口令，默认 `minioadmin`
- `MINIO_BUCKET`：对象存储桶名，默认 `open-meetup-assets`
- `MINIO_REGION`：桶区域，默认 `us-east-1`

建议先执行：

```bash
cp .env.example .env
```

### 服务端

- `HOST_PASSWORD`：主持人授权口令，默认 `12345678`
- `HOST`：监听地址，默认 `0.0.0.0`
- `PORT`：服务端端口，默认 `3001`
- `MAX_PARTICIPANTS_PER_ROOM`：创建房间默认人数上限，默认 `50`，范围 `1-500`
- `ROOM_CLEANUP_INTERVAL_MS`：清理间隔，默认 `30000`
- `CORS_ALLOW_ORIGIN`：允许跨域来源，支持逗号分隔（示例：`http://localhost:5173,http://192.168.1.12:5173`）
- `TRUST_PROXY`：可选，`false`（默认）/`true`/正整数（代理跳数）
- `TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS`：Ticket 校验接口单窗口最大请求数，默认 `60`
- `ASSET_STORAGE_PROVIDER`：上传资源存储提供者，默认 `local`，可选 `local|minio`
- `MINIO_ENDPOINT`：当 `ASSET_STORAGE_PROVIDER=minio` 时必填
- `MINIO_PORT`：MinIO 端口，默认 `9000`
- `MINIO_USE_SSL`：是否启用 HTTPS，默认 `false`
- `MINIO_ACCESS_KEY`：当 `ASSET_STORAGE_PROVIDER=minio` 时必填
- `MINIO_SECRET_KEY`：当 `ASSET_STORAGE_PROVIDER=minio` 时必填
- `MINIO_BUCKET`：对象存储桶名，默认 `open-meetup-assets`
- `MINIO_REGION`：桶区域，默认 `us-east-1`

生产环境额外约束：

- 必须显式设置 `HOST_PASSWORD`
- 必须显式设置 `CORS_ALLOW_ORIGIN`，且不能为 `*`

启用 MinIO 示例：

```bash
ASSET_STORAGE_PROVIDER=minio \
MINIO_ENDPOINT=127.0.0.1 \
MINIO_PORT=9000 \
MINIO_USE_SSL=false \
MINIO_ACCESS_KEY=minioadmin \
MINIO_SECRET_KEY=minioadmin \
MINIO_BUCKET=open-meetup-assets \
npm run dev:server
```

### 前端

- `VITE_SERVER_URL`：可选，显式指定后端地址
- `VITE_SOCKET_ACK_TIMEOUT_MS`：Socket ACK 超时，默认 `6000`

## 9. 常见问题

### Q1: 主持人不知道该把哪个地址发给参与者

- 直接使用 `npm run lan:up -- --host-password ...`
- 启动完成后终端会输出“主持人访问地址 / 参与者访问地址”
- macOS 会自动复制该地址到剪贴板

### Q2: 页面打不开 / 白屏（开发模式）

```bash
npm run dev:stop
rm -rf node_modules client/node_modules server/node_modules
npm run install:all
npm run dev:restart -- --host-password 12345678
```

### Q3: 3001 或 5173 端口被占用（开发模式）

先停：

```bash
npm run dev:stop
```

再用新端口启动：

```bash
npm run dev:restart -- --host-password 12345678 --server-port 3101 --client-port 5174
```

### Q4: 提示授权口令错误

- 确认你创建房间时输入的口令，和服务端实际 `HOST_PASSWORD` 一致
- 如果你用的是 `lan:up` 或 `dev:restart -- --host-password ...`，以脚本参数为准

### Q5: Ticket 无效

- 确认 Ticket 没输错
- 房间已经结束时，所有旧 Ticket 会失效
- 手动输入和本地读取都会走服务端校验，这是正常行为

### Q6: 手机访问不到（局域网）

- 必须同一局域网
- 用 `http://<电脑IP>:8080`（Docker LAN 模式默认）
- 如果你使用的是开发模式，再用 `http://<电脑IP>:5173`
- 关闭系统防火墙或放行对应端口（`8080` 或 `5173`）

## 10. 项目结构（关键文件）

```text
open-meetup/
├── docker/
│   ├── Dockerfile.server
│   ├── Dockerfile.web
│   └── nginx.lan.conf
├── docker-compose.lan.yml
├── client/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── pages/
│       ├── serverUrl.ts
│       ├── socket.ts
│       └── App.tsx
├── server/
│   └── src/
│       ├── index.ts
│       ├── handlers.ts
│       ├── roomManager.ts
│       └── config.ts
└── scripts/
    ├── lan-up.sh
    ├── lan-down.sh
    ├── lan-logs.sh
    ├── dev-restart.sh
    ├── dev-stop.sh
    └── bulk-join-simulator/
```

## 11. 发布前检查

```bash
npm run build
npm test
```

都通过再发布。

## 12. 当前交互规则（产品侧简述）

以下规则严格对应当前代码实现（`server/src/roomManager.ts`、`server/src/handlers.ts`、`server/src/index.ts`、`client/src/context/MeetingContext.tsx`、`client/src/components/JoinPage.tsx`）：

### 13.1 初始进入与页面分流

- 前端启动后先请求 `GET /api/room/current`
- 当 `exists=false` 时进入创建房间页（`Lobby`），并清理房间入口相关本地缓存
- 当 `exists=true` 时进入加入房间页（`JoinPage`）
- 首次打开且当前无房间时，不显示 `Room not found` 报错

### 13.2 创建房间规则（主持人）

- `room:create` 必填：`userName`、`title`、`password`
- `participantLimit` 合法范围 `1-500`，未传时使用服务端默认值（`MAX_PARTICIPANTS_PER_ROOM`，默认 `50`）
- 存在活动房间时，创建失败并返回 `ROOM_EXISTS`
- 授权口令与 `HOST_PASSWORD` 不一致时，返回 `INVALID_PASSWORD`
- 创建成功后：
  - 角色为 `host`
  - 房间状态为 `active`
  - 阶段为 `setup`
  - `currentStep=0`
  - 签发 `HOST-XXXXXXXX` 格式 Ticket

### 13.3 加入房间与 Ticket 规则（参与者/主持人重入）

- `room:join` 支持两种路径：
  - 首次加入（无 ticket）：需提供有效昵称
  - Ticket 进入（有 ticket）：忽略昵称，按 Ticket 恢复身份
- Ticket 会在服务端标准化为大写再匹配，格式非法或不存在均返回 `INVALID_TICKET`
- Ticket 命中后不会创建新用户，而是恢复同一 `userId/sessionId/role`
- 无 Ticket 首次加入时受人数上限限制（仅计参与者，不含主持人），超限返回 `ROOM_FULL`
- 首次加入成功会签发 `TKT-XXXXXXXX` Ticket
- 加入页无论手动输入 Ticket 还是自动读取本地 Ticket，都会先调用 `GET /api/room/ticket-check` 校验有效性与身份
- 本地缓存 Ticket 若校验失败，会从本地移除

### 13.4 身份与重连规则

- Socket 建连时可携带 `userId + sessionId` 触发自动重连（`room:reconnect`）
- `sessionId` 不匹配会返回 `SESSION_EXPIRED`
- 前端不在 `localStorage` 持久化身份凭据，仅在内存中维护会话；`localStorage` 仅保留 Ticket 相关信息

### 13.5 权限与阶段规则

- 主持人专属操作：
  - `room:end`
  - `control:start-live`
  - `control:return-setup`
  - `control:next` / `control:prev`
  - `pages:update`
  - `page:update`
- 参与者专属操作：
  - `work:submit`
- `control:next` / `control:prev` 仅允许在 `live` 阶段调用
- `pages:update` / `page:update` 仅允许在 `setup` 阶段调用
- `control:start-live` 要求至少保留 1 个页面，否则返回 `BAD_REQUEST`

### 13.6 页面编排规则

- 页面总数上限 `30`（`MAX_MEETING_PAGES`）
- 页面配置必须满足：
  - `id` 唯一且非空
  - `title` 非空（最长 64）
  - `kind=canvas` 时 `theme` 必须为 `1`
  - `kind=showcase` 时 `theme` 必须为 `3`，且必须有 `submissionMode`（`url|image`）与 `rankingEnabled`（布尔）
- 更新页面列表时会自动清理：
  - 已删除页面对应的 `pageContents`
  - 不再合法的历史提交（页面被删或提交模式不匹配）
- 页面删减后若当前步骤越界，`currentStep` 会自动回收至合法范围

### 13.7 互动提交规则（`showcase` 页面）

- 仅参与者可提交，主持人提交会返回 `NOT_AUTHORIZED`
- 仅 `live` 阶段允许提交，`setup` 阶段提交会返回 `BAD_REQUEST`
- 仅 `showcase` 页面允许提交，其他页面返回 `BAD_REQUEST`
- 提交校验：
  - `submissionMode=url`：必须为有效 `http/https` URL
  - `submissionMode=image`：必须为有效 base64 image data URL
  - `description` 必填，且不超过 120 字
- 同一参与者在同一页面可重复提交，后一次会覆盖前一次（以最后一次提交为准）
- 图片提交会写入统一资源存储，并返回 `/uploads/<roomId>/<fileName>` 访问路径：
  - `ASSET_STORAGE_PROVIDER=local`：写入本地 `server/uploads`
  - `ASSET_STORAGE_PROVIDER=minio`：写入 MinIO Bucket（对象键为 `<roomId>/<fileName>`）
- 覆盖提交、删除互动页、参与者离开/超时、房间关闭时都会触发对应资源清理

### 13.8 房间关闭与本地清理规则

- 主持人主动结束房间：广播 `room:closed`，原因 `HOST_ENDED`
- 主持人离开房间：关闭房间并广播原因 `HOST_LEFT`
- 清理任务（默认每 30 秒）会移除离线超时参与者（离线超过 120 秒）
- 若主持人被清理移除，广播关闭原因 `HOST_TIMEOUT`
- 若房间自然过期，广播关闭原因 `ROOM_EXPIRED`
- 客户端在以下场景统一执行本地清理与状态重置：
  - 主动 `leaveRoom`
  - 主动 `endRoom`
  - 收到 `room:closed`
- 当前实现中的本地清理仅删除 `open-meetup:` 前缀键，不影响同站点其他业务 localStorage 项

### 13.9 Ticket 提醒与表单行为

- 首次创建/加入并获得新 Ticket 时，会弹出“牢记 Ticket”提醒
- 用户确认后，将当前 Ticket 记录到 `open-meetup:ticket:acknowledged`，同一 Ticket 后续不再重复提醒
- 在房间内顶部区域会显示当前 Ticket 的紧凑信息条
- 表单默认不读取历史自动填充：文本输入项设置 `autoComplete="off"`，口令项使用 `autoComplete="new-password"`

## 13. 许可证（MIT）

本项目采用 **MIT License**（见仓库根目录 `LICENSE` 文件）。

你可以：

- 商业使用
- 修改
- 分发
- 私用

你需要：

- 在分发副本或衍生版本时，保留原始版权声明和 MIT 许可声明

免责声明：

- 软件按“原样”提供，不附带任何明示或暗示担保
- 作者或版权持有人不对使用本软件造成的任何索赔或损失承担责任
