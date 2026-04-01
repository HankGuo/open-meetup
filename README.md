# Open Meetup（无脑启动版）

一个单房间实时互动系统，基于 **React + Socket.IO + TypeScript**。

如果你只想跑起来，不想看原理，直接看「30 秒启动」。

## 1. 你会得到什么

- 一个可创建/加入的实时房间系统
- 主持人先编排页面（`setup`），再开始播放（`live`）
- 参与者通过 Ticket 识别身份，可恢复进入
- 互动页支持图片或 URL 提交，支持可选排名

## 2. 30 秒启动（最短路径）

### macOS / Linux（推荐）

```bash
cd /Users/hankia/Develop/AI/open-meetup
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
cd /Users/hankia/Develop/AI/open-meetup
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

## 4. 默认配置（你最关心的）

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

## 10. 常见问题（复制即用）

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

## 12. 发布前检查（建议照抄）

```bash
npm run build
npm test
```

都通过再发布。

## 13. 当前交互规则（产品侧简述）

- 首次创建/加入会提示牢记 Ticket
- 手动/自动再次进入不重复弹 Ticket 提醒
- 主持人结束房间后，所有客户端收到关闭并清理本地状态
- 提交内容支持重复提交，始终取最后一次

