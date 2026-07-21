```bat
@echo off
setlocal

:: Always start from the folder containing this file
cd /d "%~dp0"

echo.
echo ========================================
echo   IndustrialMind - Enterprise AI Copilot
echo ========================================
echo.

:: Check .env
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        echo [SETUP] Creating backend\.env...
        copy "backend\.env.example" "backend\.env" >nul
        echo.
        echo Please edit backend\.env and add your GROQ_API_KEY.
        echo.
    )
)

:: Create required directories
if not exist "backend\data\chroma" mkdir "backend\data\chroma"
if not exist "backend\data\uploads" mkdir "backend\data\uploads"
if not exist "backend\eval" mkdir "backend\eval"

:: ----------------------------
:: Install backend dependencies
:: ----------------------------
echo [1/3] Installing backend dependencies...

pushd backend
pip install -r requirements.txt --disable-pip-version-check >nul 2>&1
if errorlevel 1 (
    echo.
    echo Backend dependency installation failed.
    popd
    pause
    exit /b 1
)
popd

:: ----------------------------
:: Install frontend dependencies
:: ----------------------------
echo.
echo [2/3] Installing frontend dependencies...

pushd frontend
call npm install --silent >nul 2>&1
if errorlevel 1 (
    echo.
    echo Frontend dependency installation failed.
    popd
    pause
    exit /b 1
)
popd

:: ----------------------------
:: Start Backend
:: ----------------------------
echo.
echo [3/3] Starting FastAPI backend...

start "IndustrialMind Backend" cmd.exe /k "cd /d %CD%\backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

:: Wait for backend
timeout /t 5 /nobreak >nul

:: ----------------------------
:: Start Frontend
:: ----------------------------
echo Starting React frontend...

start "IndustrialMind Frontend" cmd.exe /k "cd /d %CD%\frontend && call npm run dev"

echo [OK] Backend started.
echo [OK] Frontend started.

:: Give Next.js time to compile on first launch
echo.
echo Opening browser in 8 seconds...
timeout /t 8 /nobreak >nul

start "" "http://localhost:3000"

echo.
echo ========================================
echo   IndustrialMind is running!
echo ----------------------------------------
echo   Frontend : http://localhost:3000
echo   Backend  : http://127.0.0.1:8000
echo   API Docs : http://127.0.0.1:8000/docs
echo ========================================
echo.

pause

