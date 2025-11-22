@echo off
echo Git状态诊断和修复工具
echo ========================

echo 1. 检查Git状态
git status

echo.
echo 2. 检查远程仓库
git remote -v

echo.
echo 3. 检查提交历史
git log --oneline -n 3

echo.
echo 4. 尝试添加文件
git add -A

echo.
echo 5. 检查是否有变化
git status --porcelain

echo.
echo 6. 创建提交（如果有变化）
git diff --cached --quiet
if errorlevel 1 (
    echo 有文件要提交，创建提交...
    git commit -m "职业发展AI智能体系统 v2.3"
    
    echo.
    echo 7. 推送到GitHub
    git push -u origin main
) else (
    echo 没有文件要提交，可能已经提交过了
    echo 直接尝试推送...
    git push -u origin main
)

echo.
echo 诊断完成
pause
