# Open Meetup

> 一个交互式演示工具，基于 **React + Socket.IO + TypeScript**。
> 支持主持人控制演示流程、参与者实时同步、Ticket 验证系统。

## ✨ 核心能力

- **交互式演示**：5 页内容由主持人统一控场
  1. 欢迎开场致辞
  2. HELLO 黑客松详情介绍
  3. 新闻资讯
  4. 重新认识你的豆包
  5. 自我介绍环节
- **房间管理**：授权口令创建房间、单房间存活机制
- **Ticket 系统**：首次加入分配唯一 Ticket，验证后快速入场
- **电子名片**：头像上传，自我介绍环节展示参与者 Grid
- **扫码入会**：二维码 + 链接分享，Ticket 用户一键加入
- **断线重连**：localStorage 持久化会话，自动恢复连接
- **状态同步**：在线/离线实时更新

## 🔐 安全设计

- 主持人权限由服务端判定，客户端不可伪造
- Ticket 验证在服务端完成
- 重连必须携带合法 `sessionId`
- Socket ACK 超时保护

## 🧱 技术栈

- **Client**: React 18、Vite 5、TypeScript、TailwindCSS、Socket.IO Client、qrcode.react
- **Server**: Node.js、Express、Socket.IO、TypeScript

## 🏗️ 架构概览

```mermaid
flowchart LR
  U1[Host 浏览器] -- Socket.IO --> S[Open Meetup Server]
  U2[Participant 浏览器] -- Socket.IO --> S
  S --> RM[RoomManager\n房间状态/鉴权/生命周期]
  S --> API[/api/room/*]
```

## 🚀 快速开始

### 环境要求

- Node.js **>= 18**
- npm **>= 9**

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`
- 健康检查：`http://localhost:3001/health`

### 构建

```bash
npm run build
```

## 🧪 典型使用流程

### 主持人

1. 访问首页，输入授权口令（默认：`12345678`）
2. 指定 6 位房间号，创建房间
3. 点击「扫码加入」分享二维码给参与者
4. 使用左右按钮控制演示页面进度
5. 点击「结束房间」可关闭房间

### 参与者

1. 扫描主持人分享的二维码或访问链接
2. 选择入场方式：
   - **首次加入**：填写昵称 + 上传电子名片 → 系统分配 Ticket
   - **有 Ticket**：输入 Ticket 编号 → 验证后直接入场
3. 跟随主持人浏览 5 页内容
4. 第 5 页可查看所有参与者头像 Grid

## ⚙️ 环境变量

### Server

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 服务端端口 |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `HOST_PASSWORD` | `12345678` | 创建房间授权口令 |

### Client

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_SERVER_URL` | `http://localhost:3001` | Socket/HTTP 服务端地址 |
| `VITE_SOCKET_ACK_TIMEOUT_MS` | `6000` | Socket ACK 超时毫秒数 |

## 📜 脚本说明

### 根目录

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动前后端开发服务 |
| `npm run dev:server` | 启动后端开发服务 |
| `npm run dev:client` | 启动前端开发服务 |
| `npm run build` | 构建前后端 |
| `npm run install:all` | 安装根目录 + 子项目依赖 |

### Server（`server/`）

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | ts-node-dev 热更新启动 |
| `npm run build` | TypeScript 编译 |
| `npm run start` | 启动编译产物 |

### Client（`client/`）

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务 |
| `npm run build` | 构建前端 |
| `npm run preview` | 本地预览构建产物 |

## 🔌 Socket 事件约定

### Client → Server

- `room:create` - 创建房间（需授权口令）
- `room:join` - 加入房间
- `room:reconnect` - 断线重连
- `room:leave` - 离开房间
- `room:end` - 结束房间（仅主持人）
- `control:next` - 下一页
- `control:prev` - 上一页

### Server → Client

- `session:restored` - 会话恢复结果
- `room:user-joined` - 用户加入
- `room:user-left` - 用户离开
- `room:closed` - 房间关闭
- `state:sync` - 状态同步

## 🌐 REST API

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/room/check` | GET | 验证房间是否存在 |
| `/api/room/ticket-check` | GET | 验证 Ticket 有效性 |
| `/health` | GET | 服务健康检查 |

### API 示例

```bash
# 检查房间是否存在
curl "http://localhost:3001/api/room/check?roomId=ABC123"

# 验证 Ticket
curl "http://localhost:3001/api/room/ticket-check?roomId=ABC123&ticket=TKT-XYZ789"
```

## ❗ 常见错误码

- `BAD_REQUEST` - 参数无效
- `ROOM_EXISTS` - 房间已存在（单房间模式）
- `ROOM_NOT_FOUND` - 房间不存在
- `ROOM_CLOSED` - 房间已关闭
- `INVALID_PASSWORD` - 授权口令错误
- `NOT_AUTHENTICATED` - 未认证
- `NOT_AUTHORIZED` - 无权限
- `SESSION_EXPIRED` - 会话过期

## 📁 项目结构

```text
open-meetup/
├── client/                 # React 前端
│   └── src/
│       ├── components/     # 页面组件
│       ├── context/        # MeetingContext 状态管理
│       ├── pages/          # HostPage, ParticipantPage
│       └── socket.ts       # Socket.IO 封装
├── server/                 # Express + Socket.IO 服务端
│   └── src/
│       ├── handlers.ts     # Socket 事件处理
│       ├── roomManager.ts  # 房间状态管理
│       └── index.ts        # HTTP API
├── package.json            # workspace 入口脚本
├── LICENSE
└── README.md
```

## 📄 开源许可

本项目采用 [MIT License](./LICENSE)。
