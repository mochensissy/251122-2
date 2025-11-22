# GitHub推送指南

本指南将帮助您将项目推送到GitHub仓库：https://github.com/mochensissy/251122-2.git

## 快速推送步骤

### 1. 打开命令提示符或PowerShell
在项目目录中打开命令行界面。

### 2. 初始化Git仓库
```bash
git init
```

### 3. 添加远程仓库
```bash
git remote add origin https://github.com/mochensissy/251122-2.git
```

### 4. 添加文件（选择性添加主要文件）
```bash
git add src/
git add package.json package-lock.json
git add vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json
git add tailwind.config.js postcss.config.js eslint.config.js
git add index.html README.md
git add prd/ supabase/ seed_data.sql
git add run-migration-guide.js
git add .gitignore
git add *.md
```

### 5. 创建初始提交
```bash
git commit -m "初始提交：职业发展AI智能体系统 v2.3

- 企业级RAG + HITL人机协同 HR智能问答系统
- React 18 + TypeScript + Supabase架构
- 智能文档分块+向量检索+混合搜索
- 三端界面：员工端、专家端、领导审批端
- 支持OpenAI Embeddings API和邮件通知
- 完整的项目文档和配置"
```

### 6. 推送到GitHub
```bash
git push -u origin main
```

## 注意事项

1. **.gitignore已配置**：自动排除node_modules、dist等大型目录
2. **编码问题**：如果遇到中文路径问题，请确保命令行使用UTF-8编码
3. **权限问题**：确保GitHub账号有权限推送到该仓库
4. **网络问题**：如推送失败，可能需要配置Git代理或使用SSH方式

## 替代方案

如果直接推送遇到问题，可以考虑：

1. 先在GitHub网页端创建空仓库，然后推送
2. 使用GitHub Desktop客户端
3. 使用VS Code的Git功能

## 文件结构说明

推送的文件包括：
- ✅ 前端源码 (src/)
- ✅ 配置文件 (package.json, vite.config.ts等)
- ✅ Supabase配置 (supabase/)
- ✅ 项目文档 (README.md等)
- ✅ 配置文件 (.gitignore等)

排除的文件：
- ❌ node_modules/ (依赖包)
- ❌ dist/ (构建输出)
- ❌ .cursor/ (编辑器缓存)
- ❌ 系统文件

## 完成检查

推送成功后，你应该能在GitHub仓库中看到：
- 完整的项目文件结构
- 详细的README.md文档
- 清晰的代码组织结构

如果有任何问题，请检查GitHub仓库的访问权限。
