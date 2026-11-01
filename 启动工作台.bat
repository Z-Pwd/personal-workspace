@echo off
chcp 65001 >nul
title 个人工作台 - 本地服务
cd /d "%~dp0"
echo ============================================
echo   个人工作台正在启动...
echo   浏览器会自动打开 http://127.0.0.1:7788
echo   关闭此窗口即停止服务（数据已存到本地文件）
echo ============================================
node server\server.mjs
echo.
echo 服务已停止，按任意键关闭窗口。
pause >nul
