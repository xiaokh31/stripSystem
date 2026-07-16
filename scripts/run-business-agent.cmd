@echo off
setlocal EnableExtensions DisableDelayedExpansion

if "%~1"=="" goto usage
if /I "%~1"=="help" goto usage_ok
if /I "%~1"=="--help" goto usage_ok
if /I "%~1"=="-h" goto usage_ok
if /I "%~1"=="/?" goto usage_ok

set "SCRIPT_DIR=%~dp0"
set "GIT_BASH="

if defined BESTAR_GIT_BASH if exist "%BESTAR_GIT_BASH%" set "GIT_BASH=%BESTAR_GIT_BASH%"
if not defined GIT_BASH if exist "%ProgramFiles%\Git\bin\bash.exe" set "GIT_BASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined GIT_BASH if defined ProgramW6432 if exist "%ProgramW6432%\Git\bin\bash.exe" set "GIT_BASH=%ProgramW6432%\Git\bin\bash.exe"
if not defined GIT_BASH if defined ProgramFiles(x86) if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "GIT_BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined GIT_BASH if defined LocalAppData if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "GIT_BASH=%LocalAppData%\Programs\Git\bin\bash.exe"

if not defined GIT_BASH goto missing_bash

set "RUN_SCRIPT=%SCRIPT_DIR%run-business-agent.sh"
set "INSTALL_SCRIPT=%SCRIPT_DIR%install-business-agent-profile.sh"
set "SMOKE_SCRIPT=%SCRIPT_DIR%smoke-business-agent-profile.sh"
set "RUN_SCRIPT=%RUN_SCRIPT:\=/%"
set "INSTALL_SCRIPT=%INSTALL_SCRIPT:\=/%"
set "SMOKE_SCRIPT=%SMOKE_SCRIPT:\=/%"

if not exist "%SCRIPT_DIR%run-business-agent.sh" goto missing_scripts
if not exist "%SCRIPT_DIR%install-business-agent-profile.sh" goto missing_scripts
if not exist "%SCRIPT_DIR%smoke-business-agent-profile.sh" goto missing_scripts

if /I "%~1"=="doctor" goto doctor
if /I "%~1"=="install" goto install
if /I "%~1"=="smoke" goto smoke
if /I "%~1"=="develop" goto develop
if /I "%~1"=="task" goto task
if /I "%~1"=="--version" goto version
if /I "%~1"=="-V" goto version
goto unknown_command

:doctor
if not "%~2"=="" goto usage
echo [business-agent] Git Bash: %GIT_BASH%
"%GIT_BASH%" --version
if errorlevel 1 goto failed_bash
"%GIT_BASH%" -c "command -v jq ^>/dev/null 2^>^&1 ^&^& jq --version"
if errorlevel 1 goto missing_jq
"%GIT_BASH%" -c "command -v codex ^>/dev/null 2^>^&1 ^&^& codex --version"
if errorlevel 1 goto missing_codex
"%GIT_BASH%" -c "command -v sed ^>/dev/null 2^>^&1 ^&^& command -v cmp ^>/dev/null 2^>^&1 ^&^& command -v tee ^>/dev/null 2^>^&1 ^&^& command -v install ^>/dev/null 2^>^&1"
if errorlevel 1 goto missing_shell_tools
echo [business-agent] Windows implementation-only launcher prerequisites are available.
exit /b 0

:install
if not "%~2"=="" goto usage
"%GIT_BASH%" "%INSTALL_SCRIPT%" --replace
exit /b %ERRORLEVEL%

:smoke
if "%~2"=="" goto smoke_full
if /I "%~2"=="--policy-only" if "%~3"=="" goto smoke_policy
goto usage

:smoke_full
"%GIT_BASH%" "%SMOKE_SCRIPT%"
exit /b %ERRORLEVEL%

:smoke_policy
"%GIT_BASH%" "%SMOKE_SCRIPT%" --policy-only
exit /b %ERRORLEVEL%

:develop
if "%~2"=="" goto missing_task
if not "%~3"=="" goto too_many_tasks
set "BUSINESS_AGENT_EXECUTION_MODE=implementation-only"
"%GIT_BASH%" "%RUN_SCRIPT%" task "%~2"
exit /b %ERRORLEVEL%

:task
if "%~2"=="" goto missing_task
if not "%~3"=="" goto too_many_tasks
"%GIT_BASH%" "%RUN_SCRIPT%" task "%~2"
exit /b %ERRORLEVEL%

:version
if not "%~2"=="" goto usage
"%GIT_BASH%" "%RUN_SCRIPT%" --version
exit /b %ERRORLEVEL%

:missing_bash
echo ERROR: Git Bash was not found. 1>&2
echo Install Git for Windows, or set BESTAR_GIT_BASH to the full path of bash.exe. 1>&2
echo Example: $env:BESTAR_GIT_BASH = 'C:\Program Files\Git\bin\bash.exe' 1>&2
exit /b 69

:missing_scripts
echo ERROR: The canonical business-agent shell scripts are missing beside this CMD file. 1>&2
exit /b 66

:failed_bash
echo ERROR: Git Bash was found but could not start. 1>&2
exit /b 69

:missing_jq
echo ERROR: jq is not available in Git Bash PATH. Install jq for Windows and reopen PowerShell. 1>&2
exit /b 69

:missing_codex
echo ERROR: Codex CLI is not available in Git Bash PATH. Install/login to Codex CLI and reopen PowerShell. 1>&2
exit /b 69

:missing_shell_tools
echo ERROR: Git Bash is missing sed, cmp, tee, or install. Repair Git for Windows. 1>&2
exit /b 69

:missing_task
echo ERROR: Provide one quoted Markdown Task path under prompts\tasks. 1>&2
goto usage

:too_many_tasks
echo ERROR: Execute exactly one Task per supervised process. 1>&2
goto usage

:unknown_command
echo ERROR: Unknown command: %~1 1>&2
goto usage

:usage
call :print_usage
exit /b 64

:usage_ok
call :print_usage
exit /b 0

:print_usage
echo Usage from PowerShell:
echo   .\scripts\run-business-agent.cmd doctor
echo   .\scripts\run-business-agent.cmd install
echo   .\scripts\run-business-agent.cmd smoke [--policy-only]
echo   .\scripts\run-business-agent.cmd develop "prompts/tasks/TASK-FILE.md"
echo   .\scripts\run-business-agent.cmd task "prompts/tasks/TASK-FILE.md"
echo.
echo Use develop on a Windows host without Docker or test tooling. It performs
echo implementation only and must finish with external verification pending.
echo Use task only on a host that can satisfy the Task's complete test/build gate.
echo.
echo The CMD launcher locates Git for Windows and delegates to the canonical
echo Bash supervisor. It does not implement a second Task state machine.
exit /b 0
