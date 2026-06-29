@echo off
setlocal
cd /d "%~dp0"

set VSR_ROOT=%~dp0third_party\video-subtitle-remover
set VSR_PYTHON=%VSR_ROOT%\.venv\Scripts\python.exe

if not exist "%VSR_ROOT%\backend\main.py" (
  echo video-subtitle-remover not found:
  echo   %VSR_ROOT%
  echo Clone it first:
  echo   git clone https://github.com/YaoFANGUK/video-subtitle-remover.git "%VSR_ROOT%"
  exit /b 1
)

if not exist "%VSR_PYTHON%" (
  python -m venv "%VSR_ROOT%\.venv"
)

set NO_PROXY=*
set no_proxy=*

"%VSR_PYTHON%" -m pip install --upgrade pip
"%VSR_PYTHON%" -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
"%VSR_PYTHON%" -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn -r "%VSR_ROOT%\requirements.txt"
echo.
echo VSR environment setup finished.
