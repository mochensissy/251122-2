#!/bin/bash

echo "=========================================="
echo "      GitHub推送脚本"
echo "=========================================="
echo

# 检查Git是否安装
if ! command -v git &> /dev/null; then
    echo "错误: Git未安装，请先安装Git"
    exit 1
fi

echo "步骤 1: 初始化Git仓库..."
git init

echo
echo "步骤 2: 添加远程仓库..."
git remote add origin https://github.com/mochensissy/251122-2.git

echo
echo "步骤 3: 添加主要项目文件..."
git add src/
git add package.json package-lock.json
git add vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json
git add tailwind.config.js postcss.config.js eslint.config.js
git add index.html README.md
git add prd/ supabase/ seed_data.sql
git add run-migration-guide.js
git add .gitignore
git add *.md

echo
echo "步骤 4: 创建初始提交..."
git commit -m "初始提交：职业发展AI智能体系统 v2.3

- 企业级RAG + HITL人机协同 HR智能问答系统
- React 18 + TypeScript + Supabase架构  
- 智能文档分块+向量检索+混合搜索
- 三端界面：员工端、专家端、领导审批端
- 支持OpenAI Embeddings API和邮件通知
- 完整的项目文档和配置"

echo
echo "步骤 5: 推送到GitHub..."
echo "这可能需要您输入GitHub凭据..."

git push -u origin main

echo
echo "=========================================="
echo "           推送完成！"
echo "=========================================="
echo
echo "请访问 https://github.com/mochensissy/251122-2 查看推送结果"
echo

# 检查推送状态
if [ $? -eq 0 ]; then
    echo "✅ 推送成功！"
else
    echo "❌ 推送失败，请检查错误信息并重试"
fi
