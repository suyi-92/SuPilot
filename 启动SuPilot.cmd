@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

set "SUPILOT_APP_DIR=%~dp0release\win-unpacked"
if not exist "%SUPILOT_APP_DIR%\SuPilot.exe" goto missing
if not exist "%SUPILOT_APP_DIR%\resources\app.asar" goto missing

rem Some developer shells inherit this flag; the launcher always starts the GUI.
set "ELECTRON_RUN_AS_NODE="
start "" /D "%SUPILOT_APP_DIR%" "%SUPILOT_APP_DIR%\SuPilot.exe"
if errorlevel 1 goto failed
exit /b 0

:missing
echo 未找到完整的 SuPilot 桌面产物：
echo "%SUPILOT_APP_DIR%"
echo.
echo 请在本脚本所在的项目根目录运行：
echo   pnpm install --frozen-lockfile
echo   pnpm package:win
echo.
echo 构建完成后再次双击本脚本。请保留 win-unpacked 目录内的全部文件。
pause
exit /b 1

:failed
echo SuPilot 启动失败，请检查应用目录是否完整或被安全软件拦截。
echo "%SUPILOT_APP_DIR%\SuPilot.exe"
pause
exit /b 1
