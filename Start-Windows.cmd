@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 goto missing_node
call npm ci --no-audit --no-fund
if errorlevel 1 goto failed
node node_modules\electron\install.js
if errorlevel 1 goto failed
call npm run prepare:ffmpeg:win
if errorlevel 1 goto failed
call npm run verify:release-assets
if errorlevel 1 goto failed
set "BLOCKOUT_FFMPEG=%~dp0vendor\ffmpeg\win-x64\ffmpeg.exe"
set "BLOCKOUT_FFPROBE=%~dp0vendor\ffmpeg\win-x64\ffprobe.exe"
set "BLOCKOUT_APP_ID=com.blockout.zhcn"
set "BLOCKOUT_WINDOWS_CONFIG_NAMESPACE=blockout-zh-cn"
call npm run build
if errorlevel 1 goto failed
call npm start -- --skipBuild
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo 请先从 https://nodejs.org 安装 Node.js 24 LTS，再运行此文件。
pause
exit /b 1
:failed
echo 安装或启动失败。请保留上方错误信息，并按 docs\DEPLOY-WINDOWS.zh-CN.md 排查。
pause
exit /b 1
