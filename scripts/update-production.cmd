@echo off
setlocal EnableExtensions DisableDelayedExpansion

if "%~1"=="" goto usage

set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL_EXE%" goto missing_powershell
if not exist "%SCRIPT_DIR%update-production.ps1" goto missing_script

"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%update-production.ps1" %*
exit /b %ERRORLEVEL%

:usage
echo Usage:
echo   scripts\update-production.cmd -ValidateOnly
echo   scripts\update-production.cmd -BusinessPaused
echo.
echo Run -ValidateOnly at any time. Run -BusinessPaused only after business writes are paused.
exit /b 64

:missing_powershell
echo PRODUCTION_UPDATE_FAILED:WINDOWS_POWERSHELL_MISSING 1>&2
exit /b 1

:missing_script
echo PRODUCTION_UPDATE_FAILED:POWERSHELL_SCRIPT_MISSING 1>&2
exit /b 1

