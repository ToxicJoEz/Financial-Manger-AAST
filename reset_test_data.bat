@echo off
setlocal
title AAST Finance Manager - reset test data
cd /d "%~dp0"

echo.
echo This deletes ALL local courses, students, employees, payments and payroll,
echo then reloads the sample test data. User accounts are kept.
echo A full backup is saved first to: %USERPROFILE%\Documents\AAST Finance backups
echo.
set /p answer=Type RESET to continue:
if /I not "%answer%"=="RESET" (
  echo Cancelled. Nothing was changed.
  pause
  exit /b 1
)

call npm --prefix backend run db:start
if errorlevel 1 goto failed
call npm --prefix backend run db:deploy
if errorlevel 1 goto failed
call npm --prefix backend run db:reset-test-data
if errorlevel 1 goto failed

echo.
echo Done. Test data has been reset.
pause
exit /b 0

:failed
echo.
echo Reset did not complete. See the messages above.
pause
exit /b 1
