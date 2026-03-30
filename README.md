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
- **单房间机制**：系统运行期间有且只有一个有效房间
- **Ticket 系统**：首次加入分配唯一 Ticket，验证后快速入场
- **电子名片**：头像上传，自我介绍环节展示参与者 Grid
- **扫码入会**：二维码 + 链接分享，Ticket 用户一键加入

## 🔐 安全设计

- 主持人权限由服务端判定，客户端不可伪造
- Ticket 验证在服务端完成
- 授权口令创建房间

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
npm run install:all
```

### 启动开发服务器

```bash
npm run dev
```

- 服务器运行在 http://localhost:3001
- 前端运行在 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

## 📋 概念说明

### Title（标题）

- Title 是房间的显示名称，由主持人在创建房间时指定
- 当前系统为**单房间模型**，不再暴露 RoomID 概念

### 单房间原则

- 系统运行期间，**有且只有一个有效房间**存在
- 当前已有房间时，新的创建请求会被拒绝（需先结束当前房间）
- 房间结束（主持人点击"结束房间"或所有参与者离开）后，系统恢复无房间状态

### 参与者与房间关系

- 参与者与房间 ID **不存在任何直接关联**
- 参与者仅与当前唯一有效的房间建立连接关系
- 用户通过 Ticket 或首次加入方式进入当前房间

### Ticket 系统

- **首次加入**：填写昵称 + 上传头像 → 系统分配唯一 Ticket → 存储在 localStorage
- **Ticket 复用**：有 Ticket 用户直接输入 Ticket 快速加入
- Ticket 用于标识用户身份，支持断线重连

## 🎯 用户流程

### 主持人流程

1. 访问首页 → 系统检测无房间 → 显示创建房间表单
2. 填写 **Title（标题）**、**昵称**、**授权口令** → 创建房间
3. 进入主持人控制台 → 控制 5 页演示内容
4. 点击"结束房间"可关闭房间

### 参与者流程

#### 首次加入
1. 访问首页 → 系统检测有房间 → 显示加入表单
2. 填写 **昵称**、**上传头像** → 点击加入
3. 系统分配 Ticket → 显示 Ticket 弹窗（请妥善保管）
4. 进入会议室

#### Ticket 加入
1. 访问首页 → 系统检测有房间 → 显示加入表单
2. 输入 **Ticket** → 点击加入
3. 进入会议室

## 📁 项目结构

```
open-meetup/
├── client/                 # React 前端
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   │   ├── ContentViewer.tsx   # 内容查看器
│   │   │   ├── HostControls.tsx     # 主持人控制按钮
│   │   │   ├── JoinPage.tsx         # 加入房间页面
│   │   │   ├── Lobby.tsx            # 房间创建页面
│   │   │   ├── MeetingStage.tsx     # 演示舞台
│   │   │   ├── SelfIntroPage.tsx   # 自我介绍页面
│   │   │   └── ...
│   │   ├── context/
│   │   │   └── MeetingContext.tsx  # 会议状态管理
│   │   ├── pages/
│   │   │   ├── HostPage.tsx         # 主持人页面
│   │   │   └── ParticipantPage.tsx  # 参与者页面
│   │   ├── socket.ts               # Socket.IO 客户端
│   │   ├── types.ts                # 类型定义
│   │   └── App.tsx                 # 应用入口
│   └── package.json
├── server/                 # Node.js 后端
│   ├── src/
│   │   ├── index.ts       # HTTP 服务器入口
│   │   ├── handlers.ts    # Socket 事件处理
│   │   └── roomManager.ts # 房间管理逻辑
│   └── package.json
└── package.json            # 工作空间根配置
```

## 🔌 API 接口

### GET /api/room/current

获取当前房间状态。

**响应**

```json
// 有房间
{
  "exists": true,
  "title": "Open Meetup",
  "status": "active",
  "currentStep": 0,
  "hostId": "user-xxx"
}

// 无房间
{
  "exists": false
}
```

## 🔌 Socket 事件

### 客户端 → 服务端

| 事件 | 参数 | 说明 |
|------|------|------|
| `room:create` | `{ userName, title, password }` | 创建房间 |
| `room:join` | `{ userName, ticket?, avatar? }` | 加入房间 |
| `room:reconnect` | `{ userId, sessionId }` | 会话恢复 |
| `room:leave` | `{}` | 离开房间 |
| `room:end` | `{}` | 结束房间（仅主持人） |
| `control:next` | `{}` | 下一页 |
| `control:prev` | `{}` | 上一页 |
| `control:end` | `{}` | 结束会议（保留房间） |
| `page:update` | `{ pageIndex, content }` | 更新页面内容（仅主持人） |

### 服务端 → 客户端

| 事件 | 参数 | 说明 |
|------|------|------|
| `state:sync` | `RoomStateSync` | 房间状态同步 |
| `room:user-joined` | `{ user }` | 用户加入 |
| `room:user-left` | `{ user }` | 用户离开 |
| `room:user-online` | `{ user }` | 用户上线 |
| `room:user-offline` | `{ user }` | 用户离线 |
| `room:closed` | `{ reason }` | 房间关闭 |

## ⚙️ 配置说明

### 服务端端口

默认端口：`3001`

修改方式：编辑 `server/src/index.ts`

```typescript
const PORT = process.env.PORT || 3001;
```

### 前端 API 地址

默认：`http://localhost:3001`

修改方式：编辑 `client/.env`

```
VITE_SERVER_URL=http://localhost:3001
```

### 授权口令

默认：`12345678`

修改方式：编辑 `server/src/config.ts`

```typescript
export const HOST_PASSWORD = process.env.HOST_PASSWORD || '12345678';
```

## 🐛 故障排除

### "无法连接服务器"

- 检查服务器是否启动（端口 3001）
- 检查前端 `VITE_SERVER_URL` 配置

### "Invalid user name / Invalid ticket"

- 确认昵称不为空
- Ticket 加入场景请确认 ticket 未输错且房间仍在有效期内

### 页面显示异常

- 尝试强制刷新：Cmd+Shift+R（Mac）或 Ctrl+Shift+R（Windows）
- 清除浏览器缓存

### 房间状态异常

- 服务器重启会清空房间状态（内存）
- 主持人离开会自动结束房间
