@echo off
setlocal

set SCRIPT_DIR=%~dp0
set RN_GRADLEW=%SCRIPT_DIR%..\node_modules\@react-native\gradle-plugin\gradlew.bat

call "%RN_GRADLEW%" -p "%SCRIPT_DIR%" %*
