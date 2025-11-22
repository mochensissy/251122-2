# 职业发展AI智能体系统

> **企业级RAG + HITL人机协同 HR智能问答系统**

[![版本](https://img.shields.io/badge/版本-v2.3-blue.svg)](./V2.3_RELEASE_NOTES.md)
[![状态](https://img.shields.io/badge/状态-生产就绪-green.svg)](./PROJECT_STATUS.md)
[![技术栈](https://img.shields.io/badge/技术-React%20%2B%20Supabase%20%2B%20RAG-orange.svg)](#技术栈)

## 简介

一个面向企业内部员工的职业发展政策智能问答系统,结合AI检索和人工专家服务,提供精准、高效的政策咨询体验。

### 核心特性

- 🤖 **智能问答** - AI自动回答常见政策问题
- 🎯 **个性化匹配** - 基于员工画像精准推荐
- 👥 **人机协同** - AI无法回答时自动升级到人工专家
- 📚 **知识增长** - 专家答案经审批后自动入库
- 🔍 **企业级RAG** - 智能文档分块+向量检索+混合搜索
- 📧 **自动通知** - 关键节点自动发送邮件提醒
- 🌐 **真实语义** - 支持OpenAI Embeddings API

## 快速开始

### 先决条件

- Node.js 18+
- npm 或 yarn
- Supabase账号(已配置)

### 安装

```bash
# 克隆仓库
git clone <repository-url>
cd project

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

系统将自动启动,访问浏览器即可使用。

### 首次使用

系统已完成初始化,包含:
- ✅ 14条示例政策文档
- ✅ 3项系统配置
- ✅ 完整的三端界面

详细使用教程请查看 [快速启动指南](./QUICK_START.md)

## 功能概览

### 三端界面

#### 1. 员工端
- 填写用户画像(序列/职级/角色)
- 智能对话问答
- 问题上报机制
- 对话历史查看

#### 2. 专家端
- 待办任务队列
- 知识库管理
- 文档上传与索引
- 系统配置
- AI问答测试

#### 3. 领导审批端
- 审批队列
- 批准/驳回答案
- 实时通知提示

### 技术亮点

#### 企业级RAG架构

**智能文档分块**
- 基于语义边界切分(500-1000字符)
- 保持上下文连贯(50字符重叠)
- 识别保留文档结构

**混合检索策略**
```
最终分数 = 向量相似度(70%) + 关键词匹配(30%)
```

**元数据过滤**
- 根据用户画像自动过滤
- 支持职级范围匹配
- 通配符支持(全员/全职级)

详细架构说明: [RAG架构文档](./RAG_ARCHITECTURE.md)

#### 邮件通知系统

自动发送4种通知:
1. 员工上报 → 通知专家
2. 专家提交 → 通知领导
3. 领导批准 → 通知员工
4. 领导驳回 → 通知专家

详细配置: [邮件设置指南](./EMAIL_SETUP.md)

#### 真实Embedding API

- 支持OpenAI text-embedding-3-small
- 智能回退到模拟向量
- 批量处理优化
- 成本控制(<$0.10/月)

详细配置: [Embedding设置指南](./EMBEDDING_SETUP.md)

## 项目结构

```
project/
├── src/
│   ├── App.tsx                    # 主应用(三端界面)
│   ├── components/                # React组件
│   │   ├── DocumentList.tsx      # 文档列表
│   │   ├── FileUploader.tsx      # 文件上传
│   │   ├── RAGChat.tsx           # RAG问答
│   │   └── RAGManagement.tsx     # RAG管理
│   └── lib/
│       ├── supabase.ts           # Supabase客户端
│       ├── rag.ts                # RAG检索入口
│       ├── rag-engine.ts         # RAG核心引擎
│       ├── notification-service.ts # 通知服务
│       ├── file-parser.ts        # 文件解析
│       └── batch-processor.ts    # 批量处理
├── supabase/
│   ├── migrations/               # 数据库迁移
│   └── functions/                # Edge Functions
│       ├── generate-embeddings/  # 向量生成服务
│       └── send-notification-email/ # 邮件发送服务
├── .env                          # 环境变量配置
├── README.md                     # 本文档
├── PROJECT_STATUS.md             # 项目状态详解
├── QUICK_START.md                # 快速启动指南
├── V2.3_RELEASE_NOTES.md         # 版本发布说明
├── EMBEDDING_SETUP.md            # Embedding配置
├── EMAIL_SETUP.md                # 邮件配置
└── RAG_ARCHITECTURE.md           # RAG架构详解
```

## 技术栈

### 前端
- React 18.3.1
- TypeScript 5.9.3
- Tailwind CSS 3.4.18
- Vite 5.4.2
- Lucide React 0.344.0

### 后端
- Supabase (数据库 + Edge Functions)
- PostgreSQL + pgvector
- OpenAI Embeddings API (可选)

### 核心技术
- 企业级RAG检索引擎
- 向量相似度搜索(HNSW索引)
- 全文搜索(GIN索引)
- 混合检索算法
- 智能文档分块

## 配置说明

### 环境变量

```bash
# .env 文件

# Supabase配置(必需)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Embedding API(可选,默认false)
VITE_USE_REAL_EMBEDDINGS=false

# 邮件通知(可选,默认false)
VITE_EMAIL_NOTIFICATIONS_ENABLED=false
```

### 启用高级功能

#### 启用真实Embedding API
1. 查看 [EMBEDDING_SETUP.md](./EMBEDDING_SETUP.md)
2. 部署 `generate-embeddings` Edge Function
3. 设置 `VITE_USE_REAL_EMBEDDINGS=true`

#### 启用邮件通知
1. 查看 [EMAIL_SETUP.md](./EMAIL_SETUP.md)
2. 部署 `send-notification-email` Edge Function
3. 设置 `VITE_EMAIL_NOTIFICATIONS_ENABLED=true`

## 数据库结构

系统使用8张核心表:

| 表名 | 用途 |
|------|------|
| user_profiles | 用户画像 |
| knowledge_docs | 知识库文档 |
| document_chunks | 文档分块(含向量) |
| chunk_metadata | 分块元数据 |
| escalation_tasks | 上报任务 |
| conversations | 对话历史 |
| system_settings | 系统配置 |
| search_logs | 检索日志 |

详细说明: [项目状态文档](./PROJECT_STATUS.md)

## 开发指南

### 构建生产版本

```bash
npm run build
```

### 类型检查

```bash
npm run typecheck
```

### 代码规范

```bash
npm run lint
```

### 测试流程

1. **基础测试**
   - 员工端: 填写画像 → 提问 → 查看回答
   - 专家端: 查看文档 → 上传新文档 → 重建索引
   - 领导端: 审批待办任务

2. **HITL流程测试**
   - 提出新问题 → 上报 → 专家解答 → 领导审批 → 验证入库

3. **高级功能测试**
   - 上传大文档,检查分块效果
   - 测试语义检索(如"年假"匹配"休假")
   - 验证邮件通知发送

详细测试清单: [快速启动指南](./QUICK_START.md)

## 部署指南

### 开发环境
```bash
npm run dev
```

### 生产环境

1. 构建静态文件
```bash
npm run build
```

2. 部署 `dist` 目录到:
   - Vercel
   - Netlify
   - Cloudflare Pages
   - 或任何静态托管服务

3. 配置环境变量(在托管平台设置)

4. 部署Edge Functions到Supabase
```bash
supabase functions deploy generate-embeddings
supabase functions deploy send-notification-email
```

详细部署指南待补充。

## 版本历史

### v2.3 (2025-11-20) - 当前版本
- ✅ 真实Embedding API集成
- ✅ 邮件通知系统
- ✅ 代码结构优化

### v2.2 (2025-11-19)
- ✅ RAG检索精准度优化
- ✅ 分块级别精准检索

### v2.1 (2025-11-19)
- ✅ 分块检索修复
- ✅ 多分块合并显示

### v2.0 (2025-11-19)
- ✅ 企业级RAG架构
- ✅ 智能文档分块
- ✅ 混合检索策略

### v1.0 (2025-11-19)
- ✅ 基础三端界面
- ✅ HITL工作流
- ✅ 情感识别

完整更新日志: [CHANGELOG.md](./CHANGELOG.md)

## 文档索引

### 必读文档
- [快速启动指南](./QUICK_START.md) - 首次使用必读
- [项目状态文档](./PROJECT_STATUS.md) - 了解整体进展
- [v2.3发布说明](./V2.3_RELEASE_NOTES.md) - 最新更新详解

### 配置文档
- [Embedding配置指南](./EMBEDDING_SETUP.md) - 启用真实API
- [邮件配置指南](./EMAIL_SETUP.md) - 启用邮件通知

### 技术文档
- [RAG架构详解](./RAG_ARCHITECTURE.md) - 深入理解检索引擎
- [分块修复说明](./RAG_CHUNK_FIX.md) - v2.1修复详情
- [精准度优化](./RAG_PRECISION_FIX.md) - v2.2优化详情
- [批量优化方案](./BATCH_OPTIMIZATION.md) - 性能优化

## 常见问题

### Q: AI总是回答"找不到答案"?
A: 检查专家端知识库是否有文档,并确保文档已建立索引。

### Q: 如何切换到真实Embedding API?
A: 查看 [EMBEDDING_SETUP.md](./EMBEDDING_SETUP.md) 完整指南。

### Q: 邮件通知没有发送?
A: 检查 `.env` 中 `VITE_EMAIL_NOTIFICATIONS_ENABLED` 是否为 `true`,并确认Edge Function已部署。

### Q: 如何添加新的政策文档?
A: 专家端 → 知识库管理 → 文件上传 → 选择文档 → 系统自动分块和索引。

### Q: 生产环境部署需要注意什么?
A:
1. 修改RLS策略为基于用户认证
2. 配置真实的SMTP服务
3. 启用OpenAI API(可选)
4. 设置合适的速率限制

更多问题: [项目状态文档](./PROJECT_STATUS.md)

## 后续计划

### v2.4 路线图
- [ ] 查询结果缓存
- [ ] 数据统计面板
- [ ] 移动端优化
- [ ] 员工邮箱完善

### v3.0 路线图
- [ ] 用户认证系统
- [ ] 角色权限控制
- [ ] 操作审计日志
- [ ] 生产部署指南

详细计划: [项目状态文档](./PROJECT_STATUS.md)

## 贡献指南

欢迎贡献代码、文档或建议!

贡献方向:
- 更智能的中文分词算法
- 更丰富的情感识别规则
- UI/UX优化建议
- 示例政策文档模板
- 部署最佳实践

## 许可证

本项目为企业内部使用系统,暂未开源。

## 技术支持

遇到问题?

1. 查看相关文档(见文档索引)
2. 检查浏览器控制台日志
3. 查看Supabase Dashboard日志
4. 阅读常见问题章节

---

**系统状态**: 🟢 生产就绪

**最新版本**: v2.3 企业增强版

**更新时间**: 2025-11-20

---

Made with ❤️ for HR Teams
