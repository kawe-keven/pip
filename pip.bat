@echo off
setlocal

cd /d "%~dp0overlay" || (
  echo Nao foi possivel encontrar a pasta overlay do Pip.
  pause
  exit /b 1
)

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

if not exist "%ELECTRON_DIR%\electron.exe" goto install_dependencies
if not exist "%ELECTRON_DIR%\icudtl.dat" goto install_dependencies
if not exist "%ELECTRON_DIR%\resources\default_app.asar" goto install_dependencies
goto launch_pip

:install_dependencies
  echo Preparando o Pip pela primeira vez...
  call npm ci
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias do Pip.
    pause
    exit /b 1
  )

:launch_pip
start "" "%ELECTRON_DIR%\electron.exe" "%CD%"
if errorlevel 1 (
  echo Nao foi possivel iniciar o Pip.
  pause
  exit /b 1
)

endlocal
