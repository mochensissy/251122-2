@echo off
chcp 65001 >nul
echo ================================================================================
echo                          GitHub推送修复工具
echo ================================================================================
echo.

REM 检查Git状态
echo 检查当前Git状态...
git status

if %errorlevel% neq 0 (
    echo ❌ Git状态检查失败
    goto :error
)

echo.
echo 当前Git状态如上所示。
echo.

REM 检查是否已有提交
echo 检查是否有现有提交...
git log --oneline -n 1 >nul 2>&1

if %errorlevel% equ 0 (
    echo ✅ 发现现有提交，正在推送到GitHub...
    git push -u origin main
    
    if %errorlevel% equ 0 (
        echo.
        echo 🎉 推送成功！
        echo 仓库地址：https://github.com/mochensissy/251122-2
        goto :success
    ) else (
        echo ❌ 推送失败，可能需要认证
        goto :auth_error
    )
) else (
    echo ℹ️ 没有现有提交，创建新提交...
    echo.
    
    REM 强制添加所有文件
    echo 正在添加文件...
    git add -A
    git add src/
    git add *.json *.js *.ts *.tsx *.html *.md
    git add prd/ supabase/ .gitignore 2>nul
    
    echo.
    echo 检查暂存区状态...
    git status --porcelain
    
    REM 检查是否有文件要提交
    git diff --cached --quiet
    if %errorlevel% neq 0 (
        echo ✅ 有文件要提交，创建提交...
        git commit -m "初始提交：职业发展AI智能体系统 v2.3 - 企业级RAG+AI问答系统"
        
        if %errorlevel% equ 0 (
            echo ✅ 提交创建成功，正在推送...
            git push -u origin main
            
            if %errorlevel% equ 0 (
                goto :success
            ) else (
                goto :auth_error
            )
        ) else (
            echo ❌ 提交创建失败
            goto :error
        )
    ) else (
        echo ⚠️ 没有文件被添加到暂存区
        echo 请检查项目目录和.gitignore设置
        goto :error
    )
)

:success
echo.
echo ================================================================================
echo                              🎉 推送完成！🎉
echo ================================================================================
echo.
echo ✅ 项目已成功推送到 GitHub
echo    地址：https://github.com/mochensissy/251122-2
echo.
goto :end

:auth_error
echo.
echo ❌ 推送失败 - 认证问题
echo.
echo 解决方案：
echo 1. 使用Personal Access Token替代密码
echo 2. 检查网络连接
echo 3. 确认仓库访问权限
echo.
echo 如果是认证问题，请手动执行：
echo git push -u origin main
echo 并使用Personal Access Token进行认证
goto :end

:error
echo.
echo ❌ 操作失败
echo.
echo 请手动执行以下命令进行诊断：
echo git status
echo git log --oneline
echo git remote -v
echo.
echo 或参考：手动推送步骤.md
goto :end

:end
echo.
echo 按任意键退出...
pause >nul
