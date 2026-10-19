@echo off
title AAST Finance Manager

echo [1/2] Starting Backend Server...
cd backend
:: start /b runs the command in the background of the current window
start /b npm run dev

:: Wait for 4 seconds to give the backend time to connect to MongoDB
timeout /t 4 /nobreak > nul

echo.
echo [2/2] Starting Frontend Server...
cd ../frontend
start /b npm run dev

echo.
echo ====================================================
echo ✅ Both servers are now running in this window!
echo 🚀 Backend: http://localhost:5000
echo 💻 Frontend: http://localhost:5175
echo.
echo [IMPORTANT] To completely stop both servers, simply close this command prompt window.
echo ====================================================
