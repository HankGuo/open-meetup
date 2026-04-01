# Open Meetup

一个单房间实时互动系统，基于 **React + Socket.IO + TypeScript**。

如需快速启动，可直接阅读「2. 快速启动（30 秒）」。

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

## 2. 快速启动（30 秒）

### macOS / Linux（推荐）

```bash
cd open-meetup
npm run install:all
npm run dev:restart -- --host-password 12345678
```

看到以下信息就算成功：

- `Server (local): http://localhost:3001`
- `Client (local): http://localhost:5173`

然后打开浏览器访问：

- 前端：`http://localhost:5173`

### Windows（PowerShell）

如果你没有 `bash`（即不能用 `dev:restart`），用下面这套：

```powershell
cd open-meetup
npm run install:all
$env:HOST_PASSWORD="12345678"
npm run dev
```

打开：`http://localhost:5173`

## 3. 完整新手流程（一步一步）

### 第 0 步：检查环境

```bash
node -v
npm -v
```

要求：

- Node.js >= 18
- npm >= 9

### 第 1 步：安装依赖

```bash
npm run install:all
```

### 第 2 步：启动项目

推荐（带日志、支持参数）：

```bash
npm run dev:restart -- --host-password 12345678
```

常规（不带脚本增强能力）：

```bash
npm run dev
```

### 第 3 步：验证服务是否正常

打开：

- `http://localhost:5173`（前端）
- `http://localhost:3001/health`（后端健康检查）

`/health` 返回 `{"status":"ok", ...}` 即正常。

### 第 4 步：创建房间

1. 打开前端页面
2. 填写：你的姓名、房间标题、授权口令、参与者人数上限
3. 授权口令默认是：`12345678`
4. 创建成功后进入主持人编排台

### 第 5 步：参与者加入

- 首次加入：填昵称后加入，系统发 Ticket
- 后续加入：直接输入 Ticket
- 自动读取本地 Ticket 时，也会先到后端校验

## 4. 默认配置

- 主持人授权口令默认值：`12345678`
- 服务端默认监听：`0.0.0.0:3001`
- 前端默认端口：`5173`
- 创建房间时默认人数上限：`50`（不含主持人）

## 5. 如何改授权口令

### 方法 A：启动脚本参数（最简单）

```bash
npm run dev:restart -- --host-password my-secret-password
```

### 方法 B：环境变量

```bash
HOST_PASSWORD=my-secret-password npm run dev:server
```

## 6. 支持任意 IP 访问（手机/局域网）

本项目已默认支持局域网访问：

- 服务端绑定 `0.0.0.0`
- 前端 Vite 绑定 `0.0.0.0`
- 前端未配置 `VITE_SERVER_URL` 时，会自动按当前页面主机名连接后端

### 操作步骤

1. 保证手机和电脑在同一局域网
2. 启动时看 `dev:restart` 输出中的 `Client (LAN)` 地址
3. 手机上直接访问该地址，例如：`http://192.168.1.23:5173`

如果 `dev:restart` 没打印出 LAN 地址，可手动查本机 IP：

macOS:

```bash
ipconfig getifaddr en0
```

Windows:

```powershell
ipconfig
```

然后访问：`http://<你的IP>:5173`

## 7. 前后端地址规则（避免踩坑）

客户端连接后端顺序如下：

1. 如果设置了 `VITE_SERVER_URL`，优先使用它
2. 如果没设置，自动用“当前页面主机名 + :3001”

所以在局域网访问场景，通常不需要再改前端配置。

## 8. 常用命令速查

```bash
# 安装所有依赖
npm run install:all

# 同时启动前后端
npm run dev

# 推荐启动（支持 host-password、端口参数、日志）
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

## 9. 环境变量清单

### 服务端

- `HOST_PASSWORD`：主持人授权口令，默认 `12345678`
- `HOST`：监听地址，默认 `0.0.0.0`
- `PORT`：服务端端口，默认 `3001`
- `MAX_PARTICIPANTS_PER_ROOM`：创建房间默认人数上限，默认 `50`，范围 `1-500`
- `ROOM_CLEANUP_INTERVAL_MS`：清理间隔，默认 `30000`

### 前端

- `VITE_SERVER_URL`：可选，显式指定后端地址
- `VITE_SOCKET_ACK_TIMEOUT_MS`：Socket ACK 超时，默认 `6000`

## 10. 常见问题

### Q1: 页面打不开 / 白屏

```bash
npm run dev:stop
rm -rf node_modules client/node_modules server/node_modules
npm run install:all
npm run dev:restart -- --host-password 12345678
```

### Q2: 3001 或 5173 端口被占用

先停：

```bash
npm run dev:stop
```

再用新端口启动：

```bash
npm run dev:restart -- --host-password 12345678 --server-port 3101 --client-port 5174
```

### Q3: 提示授权口令错误

- 确认你创建房间时输入的口令，和服务端实际 `HOST_PASSWORD` 一致
- 如果你用的是 `dev:restart -- --host-password ...`，以该参数为准

### Q4: Ticket 无效

- 确认 Ticket 没输错
- 房间已经结束时，所有旧 Ticket 会失效
- 手动输入和本地读取都会走服务端校验，这是正常行为

### Q5: 手机访问不到

- 必须同一局域网
- 用 `http://<电脑IP>:5173`
- 关闭系统防火墙或放行 3001/5173（仅内网测试环境）

## 11. 项目结构（关键文件）

```text
open-meetup/
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
    ├── dev-restart.sh
    ├── dev-stop.sh
    └── bulk-join-simulator/
```

## 12. 发布前检查

```bash
npm run build
npm test
```

都通过再发布。

## 13. 当前交互规则（产品侧简述）

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
- 仅 `showcase` 页面允许提交，其他页面返回 `BAD_REQUEST`
- 提交校验：
  - `submissionMode=url`：必须为有效 `http/https` URL
  - `submissionMode=image`：必须为有效 base64 image data URL
  - `description` 必填，且不超过 120 字
- 同一参与者在同一页面可重复提交，后一次会覆盖前一次（以最后一次提交为准）

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
- 当前实现中的本地清理使用 `localStorage.clear()`，会清空当前站点下全部 localStorage 项

### 13.9 Ticket 提醒与表单行为

- 首次创建/加入并获得新 Ticket 时，会弹出“牢记 Ticket”提醒
- 用户确认后，将当前 Ticket 记录到 `open-meetup:ticket:acknowledged`，同一 Ticket 后续不再重复提醒
- 在房间内顶部区域会显示当前 Ticket 的紧凑信息条
- 表单默认不读取历史自动填充：文本输入项设置 `autoComplete="off"`，口令项使用 `autoComplete="new-password"`

## 14. 许可证（MIT）

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
