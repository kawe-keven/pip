@echo off
setlocal

cd /d "%~dp0overlay" || (
  echo Nao foi possivel encontrar a pasta overlay do Pip.
  pause
  exit /b 1
)

set "npm_config_cache=%TEMP%\Pip\npm-cache"

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>nul || (
  echo Node.js nao esta instalado ou nao esta no PATH.
  echo Instale a versao LTS em https://nodejs.org/ e abra este arquivo novamente.
  pause
  exit /b 1
)

where npm >nul 2>nul || (
  echo npm nao foi encontrado. Reinstale o Node.js incluindo o npm.
  pause
  exit /b 1
)

set "ELECTRON_DIR=%CD%\node_modules\electron\dist"
set "ELECTRON_EXE=%ELECTRON_DIR%\electron.exe"

if not exist "%ELECTRON_EXE%" goto install_dependencies
if not exist "%ELECTRON_DIR%\icudtl.dat" goto install_dependencies
if not exist "%ELECTRON_DIR%\resources\default_app.asar" goto install_dependencies
goto launch_pip

:install_dependencies
  echo Reparando ou preparando o Electron do Pip...
  set "ELECTRON_SKIP_BINARY_DOWNLOAD="
  call npm ci --include=dev --foreground-scripts --ignore-scripts=false
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias do Pip.
    echo Verifique sua conexao com a internet e tente novamente.
    pause
    exit /b 1
  )
  call node "%CD%\node_modules\electron\install.js"
  if errorlevel 1 goto install_failed
  if not exist "%ELECTRON_EXE%" goto install_failed
  if not exist "%ELECTRON_DIR%\icudtl.dat" goto install_failed
  if not exist "%ELECTRON_DIR%\resources\default_app.asar" goto install_failed

:launch_pip
start "" /D "%CD%" "%ELECTRON_EXE%" "%CD%"
if errorlevel 1 (
  echo Nao foi possivel iniciar o Pip.
  pause
  exit /b 1
)

endlocal
exit /b 0

:install_failed
echo O Electron continuou incompleto apos a instalacao das dependencias.
echo Confira as mensagens do npm acima. Depois, execute pip.bat novamente.
pause
exit /b 1
