@echo off
cd /d "%~dp0"
if not exist data\notion mkdir data\notion
echo Paste the token of your Notion integration, then press Enter.
set /p NOTION=Token:
if "%NOTION%"=="" exit /b 1
> data\notion\token.txt <nul set /p =%NOTION%
echo.
echo Saved. Your agents can read the pages you shared on their next message.
pause
