@echo off
echo ==========================================
echo Starting Discord RDP Bridge Compiler
echo ==========================================
echo.

echo [1/3] Checking if Node.js is installed...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in your PATH!
    echo Please install Node.js from https://nodejs.org/ first.
    pause
    exit /b
)

echo [2/3] Installing required packages (discord-rpc, ws, pkg)...
call npm install
call npm install -g pkg

echo [3/3] Compiling server.js into a standalone .exe file...
:: Compiling for Windows x64 using Node 18
call pkg server.js --targets node18-win-x64 --output discord-rdp-bridge.exe

if exist "discord-rdp-bridge.exe" (
    echo.
    echo ==========================================
    echo SUCCESS! 
    echo ==========================================
    echo "discord-rdp-bridge.exe" was created successfully.
    echo You can now run this file on your RDP server.
) else (
    echo.
    echo ERROR: Compilation failed.
)

pause
