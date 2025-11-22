@echo off
chcp 65001 >nul
echo 正在初始化Git仓库...

REM 初始化Git
git init

REM 添加远程仓库
git remote add origin https://github.com/mochensissy/251122-2.git

REM 添加文件（排除大型目录）
git add src/ package.json package-lock.json vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json tailwind.config.js postcss.config.js eslint.config.js index.html README.md prd/ supabase/ seed_data.sql run-migration-guide.js .gitignore

REM 创建初始提交
git commit -m "初始提交：职业发展AI智能体系统 v2.3

- 企业级RAG + HITL人机协同 HR智能问答系统
- React 18 + TypeScript + Supabase架构
- 智能文档分块+向量检索+混合搜索
- 三端界面：员工端、专家端、领导审批端
- 支持OpenAI Embeddings API和邮件通知
- 完整的项目文档和配置"

echo 正在推送到GitHub...
git push -u origin main

echo 完成！
pause
