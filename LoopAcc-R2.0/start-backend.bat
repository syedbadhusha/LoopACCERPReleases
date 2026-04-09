@echo off
REM Start the backend server
cd /d "%~dp0backend"
echo Starting backend server on port 5000...
call npm start
