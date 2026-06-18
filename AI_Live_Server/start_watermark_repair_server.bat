@echo off
setlocal
cd /d "%~dp0"

if "%WATERMARK_REPAIR_PORT%"=="" set WATERMARK_REPAIR_PORT=7860
if "%PROPAINTER_ROOT%"=="" set PROPAINTER_ROOT=%~dp0third_party\ProPainter
if "%PROPAINTER_PYTHON%"=="" set PROPAINTER_PYTHON=%PROPAINTER_ROOT%\.venv\Scripts\python.exe
if "%PROPAINTER_COMMAND%"=="" set PROPAINTER_COMMAND="%PROPAINTER_PYTHON%" "%PROPAINTER_ROOT%\inference_propainter.py" -i "{input}" -m "{mask}" -o "{output_dir}" --fp16 --resize_ratio 0.5 --subvideo_length 40 --neighbor_length 5 --ref_stride 20

echo Starting AIGCPanel watermark repair server on port %WATERMARK_REPAIR_PORT%
echo.
echo ProPainter root:
echo   %PROPAINTER_ROOT%
echo ProPainter python:
echo   %PROPAINTER_PYTHON%
echo Low-memory command:
echo   %PROPAINTER_COMMAND%
echo.

"%PROPAINTER_PYTHON%" watermark_repair_server.py
