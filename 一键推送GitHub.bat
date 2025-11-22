@echo off
chcp 65001 >nul
color 0A
mode con: cols=80 lines=30
title 职业发展AI智能体系统 - GitHub推送工具

echo.
echo ================================================================================
echo                         职业发展AI智能体系统 GitHub推送工具
echo ================================================================================
echo.
echo 正在为您推送项目到 GitHub 仓库：https://github.com/mochensissy/251122-2.git
echo.

REM 检查Git是否安装
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误：未检测到Git，请先安装Git
    echo 下载地址：https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo ✅ Git已安装
echo.

REM 初始化Git仓库
echo 步骤 1/6: 初始化Git仓库...
git init
if %errorlevel% neq 0 (
    echo ❌ Git初始化失败
    pause
    exit /b 1
)
echo ✅ Git仓库已初始化
echo.

REM 配置Git用户信息（如果未配置）
echo 步骤 2/6: 配置Git用户信息...
git config user.name "AI Assistant" 2>nul
git config user.email "ai@assistant.com" 2>nul
echo ✅ Git用户信息已配置
echo.

REM 添加远程仓库
echo 步骤 3/6: 添加远程仓库...
git remote remove origin 2>nul
git remote add origin https://github.com/mochensissy/251122-2.git
if %errorlevel% neq 0 (
    echo ❌ 添加远程仓库失败
    pause
    exit /b 1
)
echo ✅ 远程仓库已添加
echo.

REM 添加文件
echo 步骤 4/6: 添加项目文件...
echo    - 添加源代码...
git add src/
echo    - 添加配置文件...
git add package.json package-lock.json
git add vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json
git add tailwind.config.js postcss.config.js eslint.config.js
echo    - 添加HTML和文档...
git add index.html README.md
echo    - 添加项目配置...
git add prd/ supabase/ seed_data.sql run-migration-guide.js
git add .gitignore
echo    - 添加项目文档...
git add *.md

if %errorlevel% neq 0 (
    echo ❌ 添加文件失败
    pause
    exit /b 1
)
echo ✅ 文件已添加到暂存区
echo.

REM 创建提交
echo 步骤 5/6: 创建初始提交...
git commit -m "初始提交：职业发展AI智能体系统 v2.3

- 企业级RAG + HITL人机协同 HR智能问答系统
- React 18 + TypeScript + Supabase架构
- 智能文档分块+向量检索+混合搜索  
- 三端界面：员工端、专家端、领导审批端
- 支持OpenAI Embeddings API和邮件通知
- 完整的项目文档和配置"
  
if %errorlevel% neq 0 (
    echo ❌ 创建提交失败
    pause
    exit /b 1
)
echo ✅ 初始提交已创建
echo.

REM 推送到GitHub
echo 步骤 6/6: 推送到GitHub...
echo 注意：可能需要您输入GitHub用户名和密码（推荐使用Personal Access Token）
echo.
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo ❌ 推送失败，可能的原因：
    echo    1. 网络连接问题
    echo    2. GitHub认证失败
    echo    3. 仓库权限不足
    echo.
    echo 解决方案：
    echo    1. 检查网络连接
    echo    2. 使用Personal Access Token进行认证
    echo    3. 确认有仓库的推送权限
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================================================
echo                                🎉 推送成功！🎉
echo ================================================================================
echo.
echo ✅ 项目已成功推送到 GitHub 仓库
echo    仓库地址：https://github.com/mochensissy/251122-2
echo.
echo 📋 推送内容：
echo    • React + TypeScript 前端源码
echo    • Supabase 后端配置
echo    • 完整的项目文档
echo    • 所有配置文件
echo.
echo 🔗 请访问仓库查看推送结果
echo.
echo 按任意键退出...
pause >nul
