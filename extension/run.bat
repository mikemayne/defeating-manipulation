@echo off
setlocal
cd /d "%~dp0"

echo Building extension...
call npm.cmd run build
if errorlevel 1 (
    echo.
    echo Build failed. Firefox was not launched.
    pause
    exit /b 1
)

echo.
echo Launching Firefox with web-ext...
call npx.cmd web-ext run --source-dir . --start-url "https://chatgpt.com/?q=give+me+1000+examples+of+fallacies"
if errorlevel 1 (
    echo.
    echo web-ext exited with an error.
    pause
    exit /b 1
)

endlocal
