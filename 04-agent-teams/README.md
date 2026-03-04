# Claude Agent SDK 系列教程 - 第四章：Agent Teams

> **教程定位**
> 本教程是 **Claude Agent SDK 系列教程的第四部分**，基于第三章的架构，深入探讨如何构建多 Agent 协作的 Agent Teams 系统。

## 📖 系列教程路线图

本系列采用**渐进式学习路径**，每一章都在前一章的基础上递进：

- **第一章**：快速入门 - 核心概念与基础对话 ✅
- **第二章**：工具调用 - 集成 MCP Tools，实现 Agent 能力 ✅
- **第三章**：权限控制 - Agent 权限管理与安全控制 ✅
- **第四章（本章）**：Agent Teams - 多 Agent 协作与任务编排 ⏳

## 💡 设计哲学

**复杂任务，协作完成。**

单个 Agent 受限于上下文窗口和专注领域。Agent Teams 通过将复杂任务分解，交由多个专业化 Agent 协作完成，实现更强大、更可靠的 AI 系统。本章将探索 Claude Agent SDK 的多 Agent 协作能力，帮助你构建真正的 AI 团队。

> **✨ 关于本教程**
> 本教程的大部分内容由 Claude Code 编写而成。每个项目都配有详尽的 `CLAUDE.md` 文档作为开发指引。我强烈建议你在学习的基础上进行实验和改动——**实践是最好的老师**。

---

## 🎓 第四章学习目标

完成本章后，你将掌握：

1. **Agent Teams 架构设计**
   - 理解多 Agent 协作的核心模式（Orchestrator / Subagent）
   - 设计专业化 Agent 角色与职责划分
   - 实现 Agent 间的任务传递与结果聚合

2. **Claude Agent SDK 多 Agent 特性**
   - 使用 SDK 的 subagent 能力创建子 Agent
   - 理解 Agent 间的消息传递机制
   - 处理并发 Agent 执行与结果合并

3. **实战 Agent Teams 场景**
   - 构建 Orchestrator Agent 进行任务分解
   - 实现专业 Subagent（代码 Agent、研究 Agent、分析 Agent 等）
   - 可视化多 Agent 协作过程

> **⚠️ 前置要求**
> 本章假设你已完成第三章的学习，理解了权限控制系统、SSE 流式响应和 Monorepo 结构。

---

## ⚡ 快速开始

### 前置要求

- Node.js 18+
- pnpm 包管理器
- Anthropic API Key（[获取地址](https://console.anthropic.com/)）

### 三步启动

**1️⃣ 安装依赖**

```bash
pnpm install
```

**2️⃣ 配置 API Key**

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入你的 API Key
```

**3️⃣ 启动开发服务器**

```bash
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)，发送需要多 Agent 协作的复杂任务，即可看到 Agent Teams 协作过程。

---

## ✨ 项目特性

| 特性 | 说明 | 技术实现 |
|------|------|----------|
| 🤝 **多 Agent 协作** | Orchestrator 分解任务，Subagent 并行执行 | Claude Agent SDK subagent |
| 🎯 **专业化 Agent** | 不同 Agent 专注于不同领域 | 定制化 system prompt + 工具集 |
| 📊 **协作过程可视化** | 实时展示各 Agent 的执行状态和结果 | ToolActivityManager + SSE |
| 🔄 **流式对话** | 实时展示 Claude 的响应 | Server-Sent Events (SSE) |
| 🛡️ **权限控制** | Agent 调用工具前可配置审批流程 | `canUseTool` + SSE + Promise |
| 📝 **会话管理** | 自动保存和加载历史对话 | JSONL 格式本地存储 |
| 🎨 **Markdown 渲染** | 代码高亮、表格、列表等完整支持 | react-markdown + highlight.js |

---

## 🏗️ Agent Teams 架构

本章的核心是基于 Claude Agent SDK 的多 Agent 协作系统。

### Orchestrator-Subagent 模式

```
用户任务
    ↓
Orchestrator Agent（任务分解与编排）
    ├── 分析任务复杂度
    ├── 制定执行计划
    └── 分配子任务给 Subagent
         ↓
    ┌────┬────┬────┐
 Agent1  Agent2  Agent3  （并行或串行执行）
    │       │       │
    └───────┴───────┘
         ↓
    结果聚合与整合
         ↓
    最终输出给用户
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `packages/shared/src/agent/proma-agent.ts` | 支持 subagent 创建和 Agent Teams 编排 |
| `app/api/chat/route.ts` | 处理多 Agent 并发请求 |
| `components/agent-team-view.tsx` | Agent Teams 协作过程可视化 |
| `lib/agent-team-manager.ts` | Agent 状态管理与结果聚合 |

---

## 📂 项目结构

```
04-agent-teams/
├── packages/
│   ├── core/                          # 📦 核心类型定义包
│   │   └── src/
│   │       ├── message.ts             # 消息类型
│   │       ├── session.ts             # 会话类型
│   │       ├── workspace.ts           # 工作空间配置
│   │       └── storage.ts             # 存储接口
│   │
│   └── shared/                        # 📦 共享 Agent 逻辑包
│       └── src/agent/
│           ├── agent-event.ts         # AgentEvent 类型（含 team 协作事件）
│           ├── proma-agent.ts         # PromaAgent（支持 subagent）
│           ├── tool-matching.ts       # 无状态工具匹配
│           └── options.ts             # Agent 配置选项
│
├── app/api/
│   ├── chat/
│   │   ├── route.ts                   # 聊天 API + Agent Teams 协调
│   │   └── permission/route.ts        # 权限决策 API
│   ├── sessions/                      # 会话管理 API
│   └── files/route.ts                 # 文件浏览 API
│
├── components/
│   ├── chat-interface.tsx             # 聊天 UI（集成 Agent Teams 展示）
│   ├── agent-team-view.tsx            # 🆕 Agent Teams 协作可视化
│   ├── permission-selector.tsx        # 权限请求 UI
│   ├── tool-activity-list.tsx         # 工具活动列表
│   └── markdown-renderer.tsx          # Markdown 渲染
│
├── lib/
│   ├── agent-team-manager.ts          # 🆕 Agent Teams 状态管理
│   ├── permission-store.ts            # 权限 Promise resolver 存储
│   ├── tool-activity.ts               # 工具活动管理器
│   └── storage/                       # 本地存储实现
│
└── .data/                             # 数据存储（gitignored）
```

---

## 🛠️ 技术栈

| 类别 | 技术选型 | 版本 |
|------|----------|------|
| **框架** | Next.js (App Router) | 16.1.6 |
| **UI 库** | React | 19.2.3 |
| **类型系统** | TypeScript (strict) | 5.x |
| **样式方案** | Tailwind CSS | 4.x |
| **组件库** | Shadcn UI | - |
| **AI SDK** | Claude Agent SDK | 0.2.29+ |
| **动画** | framer-motion | 12.30.0 |
| **Markdown** | react-markdown + highlight.js | - |
| **包管理器** | pnpm (Workspace) | - |

---

## 📚 详细文档

想了解完整的实现细节？查看 [CLAUDE.md](./CLAUDE.md) 获取：

- 完整的架构设计说明
- PromaAgent subagent 功能详解
- Agent Teams 协作系统的完整实现细节
- 多 Agent 可视化系统
- API Routes 的详细文档

---

## 🚀 下一步

完成本章学习后，你可以：

1. **🔧 实验改造**
   - 设计你自己的专业化 Agent 角色
   - 实现不同的任务分解策略
   - 添加 Agent 间的通信协议

2. **💡 探索 SDK**
   - 阅读 [Claude Agent SDK 官方文档](https://platform.claude.com/docs/en/agent-sdk/typescript)
   - 研究多 Agent 架构的最佳实践

---

## 🔗 相关资源

- [Claude Agent SDK 文档](https://platform.claude.com/docs/en/agent-sdk/typescript) - 官方 SDK 文档
- [Next.js 文档](https://nextjs.org/docs) - Next.js App Router 指南
- [Shadcn UI](https://ui.shadcn.com) - UI 组件库文档
- [Tailwind CSS](https://tailwindcss.com/docs) - 样式框架文档

---

## 📄 License

MIT License - 自由使用，欢迎改进和分享

---

<p align="center">
  <i>这个项目由 Claude Code 协助创建 ✨</i><br>
  <i>如果对你有帮助，欢迎 Star ⭐️</i>
</p>
