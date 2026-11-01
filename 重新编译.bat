@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在构建前端（Vue 3 + TDesign）...
call node scripts\build.mjs
if errorlevel 1 (
  echo.
  echo 构建失败，请把上面的红色报错发给我。
) else (
  echo.
  echo 构建完成，刷新浏览器即可看到改动。
)
pause
