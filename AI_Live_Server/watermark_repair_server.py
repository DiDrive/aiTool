import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from PIL import Image, ImageDraw
from pydantic import BaseModel


SERVICE_VERSION = "2026-06-22-propainter-auto-weights"

app = FastAPI(title="AIGCPanel Watermark Repair Server")
LOG_DIR = Path(os.environ.get("WATERMARK_LOG_DIR") or (Path(tempfile.gettempdir()) / "aigcpanel-watermark-logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)
CURRENT_LOG = LOG_DIR / "repair-service.log"
PROPAINTER_WEIGHT_FILES = [
    "raft-things.pth",
    "recurrent_flow_completion.pth",
    "ProPainter.pth",
]
PROPAINTER_DEFAULT_WEIGHT_BASE_URL = "https://github.com/sczhou/ProPainter/releases/download/v0.1.0/"
WEIGHT_DOWNLOAD_LOCK = threading.Lock()
WEIGHT_DOWNLOAD_STATUS: Dict[str, Any] = {
    "state": "idle",
    "message": "",
    "missing": [],
}


def append_log(message: str):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}"
    print(line, flush=True)
    try:
        with CURRENT_LOG.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def propainter_root_path() -> Optional[Path]:
    configured = os.environ.get("PROPAINTER_ROOT", "").strip()
    root = Path(configured) if configured else Path(__file__).resolve().parent / "third_party" / "ProPainter"
    if root.exists():
        return root
    return None


def propainter_weights_dir() -> Optional[Path]:
    root = propainter_root_path()
    if not root:
        return None
    return root / "weights"


def missing_propainter_weights() -> List[str]:
    weights_dir = propainter_weights_dir()
    if not weights_dir:
        return PROPAINTER_WEIGHT_FILES.copy()
    missing = []
    for name in PROPAINTER_WEIGHT_FILES:
        path = weights_dir / name
        if not path.exists() or path.stat().st_size <= 0:
            missing.append(name)
    return missing


def set_weight_status(state: str, message: str = "", missing: Optional[List[str]] = None):
    WEIGHT_DOWNLOAD_STATUS.update({
        "state": state,
        "message": message,
        "missing": missing if missing is not None else missing_propainter_weights(),
    })


def download_file(url: str, target: Path):
    partial = target.with_suffix(target.suffix + ".partial")
    if partial.exists():
        partial.unlink()
    append_log(f"DOWNLOAD WEIGHT: {url} -> {target}")
    with urllib.request.urlopen(url, timeout=60) as response, partial.open("wb") as f:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    partial.replace(target)


def ensure_propainter_weights(background: bool = False):
    if os.environ.get("PROPAINTER_AUTO_DOWNLOAD_WEIGHTS", "1") == "0":
        set_weight_status("disabled", "已关闭 ProPainter 权重自动下载")
        return

    def run():
        try:
            with WEIGHT_DOWNLOAD_LOCK:
                root = propainter_root_path()
                if not root:
                    set_weight_status("error", "找不到 ProPainter 目录，无法自动下载权重")
                    append_log("ProPainter root missing, skip weight auto download")
                    return
                weights_dir = root / "weights"
                weights_dir.mkdir(parents=True, exist_ok=True)
                missing = missing_propainter_weights()
                if not missing:
                    set_weight_status("ready", "ProPainter 权重已就绪", [])
                    return

                base_url = os.environ.get("PROPAINTER_WEIGHT_BASE_URL", PROPAINTER_DEFAULT_WEIGHT_BASE_URL).rstrip("/") + "/"
                set_weight_status("downloading", f"正在下载 ProPainter 权重: {', '.join(missing)}", missing)
                for name in missing:
                    download_file(base_url + name, weights_dir / name)
                set_weight_status("ready", "ProPainter 权重已下载完成", [])
                append_log("ProPainter weights ready")
        except Exception as exc:
            message = f"ProPainter 权重自动下载失败: {exc}"
            set_weight_status("error", message)
            append_log(message)

    if background:
        threading.Thread(target=run, name="propainter-weight-downloader", daemon=True).start()
    else:
        run()


@app.on_event("startup")
def startup_prepare_propainter_weights():
    ensure_propainter_weights(background=True)


class MaskPayload(BaseModel):
    name: str = ""
    confidence: Optional[float] = None
    source: Optional[str] = None
    boxPercent: Optional[Dict[str, float]] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    feather: Optional[float] = None
    timeRange: Optional[Dict[str, str]] = None


class RepairPayload(BaseModel):
    input: str
    mediaType: str = "video"
    engine: str = "propainter"
    outputName: Optional[str] = None
    repair: Dict[str, Any] = {}
    masks: List[MaskPayload] = []


def response_ok(data: Optional[Dict[str, Any]] = None):
    return {"code": 0, "msg": "ok", "data": data or {}}


def response_error(msg: str, code: int = 1):
    return {"code": code, "msg": msg, "data": {}}


def resolve_ffmpeg_bin(name: str) -> str:
    local_candidates = [
        Path(__file__).resolve().parents[1] / "electron" / "resources" / "extra" / "win-x86" / f"{name}.exe",
        Path(__file__).resolve().parents[1] / "electron" / "resources" / "extra" / "win-x64" / f"{name}.exe",
    ]
    for candidate in local_candidates:
        if candidate.exists():
            return str(candidate)
    found = shutil.which(name)
    if found:
        return found
    raise RuntimeError(f"找不到 {name}，请确认 ffmpeg/ffprobe 已安装或打包到 electron/resources/extra")


def run_command(args: List[str], cwd: Optional[str] = None, timeout: Optional[int] = None):
    append_log(f"RUN: {' '.join(args)}")
    proc = subprocess.run(
        args,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        env={
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        },
    )
    if proc.stdout:
        append_log(proc.stdout[-3000:])
    if proc.stderr:
        append_log(proc.stderr[-3000:])
    if proc.returncode != 0:
        log = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(log[-3000:] or f"命令执行失败: {' '.join(args)}")
    return proc.stdout


def ffprobe_video(input_path: str):
    ffprobe = resolve_ffmpeg_bin("ffprobe")
    raw = run_command([
        ffprobe,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        input_path,
    ])
    data = json.loads(raw)
    stream = (data.get("streams") or [{}])[0]
    duration = float((data.get("format") or {}).get("duration") or 0)
    return {
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "duration": duration,
        "fps": stream.get("r_frame_rate") or "24/1",
    }


def parse_time(value: Optional[str]) -> Optional[float]:
    if not value or value == "auto":
        return None
    text = str(value).strip()
    if not text:
        return None
    if ":" not in text:
        return float(text)
    parts = [float(item) for item in text.split(":")]
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + part
    return seconds


def mask_box(mask: MaskPayload):
    box = mask.boxPercent or {}
    return {
        "x": float(box.get("x", mask.x or 0)),
        "y": float(box.get("y", mask.y or 0)),
        "width": float(box.get("width", mask.width or 0)),
        "height": float(box.get("height", mask.height or 0)),
        "feather": float(mask.feather or 8),
        "start": parse_time((mask.timeRange or {}).get("start")),
        "end": parse_time((mask.timeRange or {}).get("end")),
    }


def clamp(value: float, min_value: float, max_value: float):
    return max(min_value, min(max_value, value))


def draw_mask_boxes(
    image: Image.Image,
    boxes: List[Dict[str, float]],
    width: int,
    height: int,
    timestamp: Optional[float] = None,
):
    draw = ImageDraw.Draw(image)
    for box in boxes:
        start = box["start"] if box["start"] is not None else 0
        end = box["end"]
        if timestamp is not None and end is not None and not (start <= timestamp <= end):
            continue
        if timestamp is not None and box["start"] is not None and timestamp < start:
            continue
        padding = max(4, box["feather"], max(box["width"] / 100 * width, box["height"] / 100 * height) * 0.05)
        x = int(clamp(box["x"] / 100 * width - padding, 0, width - 2))
        y = int(clamp(box["y"] / 100 * height - padding, 0, height - 2))
        w = int(clamp(box["width"] / 100 * width + padding * 2, 2, width - x))
        h = int(clamp(box["height"] / 100 * height + padding * 2, 2, height - y))
        draw.rectangle([x, y, x + w, y + h], fill=255)


def parse_fps(value: str) -> float:
    if "/" in value:
        top, bottom = value.split("/", 1)
        denominator = float(bottom or 1)
        return float(top or 0) / denominator if denominator else 24.0
    return float(value or 24)


def build_mask_asset(input_path: str, masks: List[MaskPayload], work_dir: Path):
    info = ffprobe_video(input_path)
    width = info["width"]
    height = info["height"]
    duration = max(0.05, info["duration"])
    if width <= 0 or height <= 0:
        raise RuntimeError("无法读取视频尺寸")
    boxes = [mask_box(mask) for mask in masks]
    boxes = [box for box in boxes if box["width"] > 0 and box["height"] > 0]
    if not boxes:
        raise RuntimeError("缺少有效水印区域")

    has_time_ranges = any((box["start"] is not None and box["start"] > 0) or box["end"] is not None for box in boxes)
    if not has_time_ranges:
        mask_path = work_dir / "mask.png"
        image = Image.new("L", (width, height), 0)
        draw_mask_boxes(image, boxes, width, height)
        image.save(mask_path)
        return mask_path, info

    mask_dir = work_dir / "mask_frames"
    mask_dir.mkdir(parents=True, exist_ok=True)
    fps = max(1.0, min(60.0, parse_fps(info["fps"])))
    frame_count = max(1, int(duration * fps + 0.5))
    for index in range(frame_count):
        timestamp = index / fps
        image = Image.new("L", (width, height), 0)
        draw_mask_boxes(image, boxes, width, height, timestamp)
        image.save(mask_dir / f"{index:08d}.png")
    return mask_dir, info


def split_command_template(template: str, values: Dict[str, str]):
    import shlex

    command = template.format(**values)
    args = shlex.split(command, posix=os.name != "nt")
    if os.name == "nt":
        args = [
            arg[1:-1] if len(arg) >= 2 and arg[0] == arg[-1] and arg[0] in ("'", '"') else arg
            for arg in args
        ]
    return args


def find_result_video(output_dir: Path, preferred_name: str):
    candidates = []
    for ext in ("*.mp4", "*.mov", "*.mkv", "*.webm"):
        candidates.extend(output_dir.rglob(ext))
    if not candidates:
        raise RuntimeError("ProPainter 执行完成但没有生成视频文件")
    candidates.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    preferred = output_dir / preferred_name
    if preferred.exists():
        return preferred
    return candidates[0]


def run_propainter(input_path: str, mask_path: Path, output_path: Path, work_dir: Path):
    ensure_propainter_weights(background=False)
    output_dir = work_dir / "propainter-output"
    output_dir.mkdir(parents=True, exist_ok=True)
    values = {
        "input": input_path,
        "video": input_path,
        "mask": str(mask_path),
        "output": str(output_path),
        "output_dir": str(output_dir),
    }

    command_template = os.environ.get("PROPAINTER_COMMAND", "").strip()
    if command_template:
        args = split_command_template(command_template, values)
        run_command(args, timeout=None)
    else:
        propainter_root = os.environ.get("PROPAINTER_ROOT", "").strip()
        if not propainter_root:
            raise RuntimeError(
                "未配置 ProPainter。请设置 PROPAINTER_ROOT 指向 ProPainter 项目目录，"
                "或设置 PROPAINTER_COMMAND 自定义推理命令模板。"
            )
        root = Path(propainter_root)
        script = root / "inference_propainter.py"
        if not script.exists():
            raise RuntimeError(f"找不到 ProPainter 推理脚本: {script}")
        python_bin = os.environ.get("PROPAINTER_PYTHON", "python")
        args = [
            python_bin,
            str(script),
            "-i",
            input_path,
            "-m",
            str(mask_path),
            "-o",
            str(output_dir),
        ]
        if os.environ.get("PROPAINTER_FP16", "1") != "0":
            args.append("--fp16")
        run_command(args, cwd=str(root), timeout=None)

    result = find_result_video(output_dir, output_path.name)
    if result.resolve() != output_path.resolve():
        shutil.copyfile(result, output_path)
    return output_path


def mux_audio_if_needed(input_path: str, repaired_path: Path, final_path: Path, keep_audio: bool):
    if not keep_audio:
        if repaired_path.resolve() != final_path.resolve():
            shutil.copyfile(repaired_path, final_path)
        return final_path
    ffmpeg = resolve_ffmpeg_bin("ffmpeg")
    try:
        run_command([
            ffmpeg,
            "-y",
            "-i",
            str(repaired_path),
            "-i",
            input_path,
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-shortest",
            "-movflags",
            "+faststart",
            str(final_path),
        ])
    except Exception:
        if repaired_path.resolve() != final_path.resolve():
            shutil.copyfile(repaired_path, final_path)
    return final_path


@app.get("/api/watermark/status")
def watermark_status():
    weights_dir = propainter_weights_dir()
    return response_ok({
        "serviceVersion": SERVICE_VERSION,
        "engine": "propainter",
        "propainterRoot": os.environ.get("PROPAINTER_ROOT", ""),
        "hasCommandTemplate": bool(os.environ.get("PROPAINTER_COMMAND", "").strip()),
        "weightsDir": str(weights_dir) if weights_dir else "",
        "weightsReady": not missing_propainter_weights(),
        "weightsStatus": WEIGHT_DOWNLOAD_STATUS,
        "log": str(CURRENT_LOG),
    })


@app.get("/api/watermark/log")
def watermark_log():
    if not CURRENT_LOG.exists():
        return response_ok({"log": "", "path": str(CURRENT_LOG)})
    text = CURRENT_LOG.read_text(encoding="utf-8", errors="replace")
    return response_ok({"log": text[-12000:], "path": str(CURRENT_LOG)})


@app.post("/api/watermark/repair")
def repair_watermark(payload: RepairPayload):
    try:
        append_log(f"REPAIR START engine={payload.engine} input={payload.input}")
        if payload.mediaType != "video" or payload.engine not in ("propainter", "comfyui"):
            return response_error("当前服务只处理 ProPainter/ComfyUI 视频修复")
        input_path = str(Path(payload.input).expanduser())
        if not Path(input_path).exists():
            return response_error(f"视频不存在: {input_path}")

        output_name = payload.outputName or f"{Path(input_path).stem}-propainter.mp4"
        if not output_name.lower().endswith((".mp4", ".mov", ".mkv", ".webm")):
            output_name = f"{output_name}.mp4"
        output_root = Path(os.environ.get("WATERMARK_OUTPUT_DIR", tempfile.gettempdir())) / "aigcpanel-watermark"
        output_root.mkdir(parents=True, exist_ok=True)
        safe_name = "".join(ch if ch not in '\\/:*?"<>|' else "_" for ch in output_name)
        final_path = output_root / f"{int(time.time())}_{safe_name}"

        with tempfile.TemporaryDirectory(prefix="aigcpanel-propainter-") as temp_dir:
            work_dir = Path(temp_dir)
            append_log(f"WORK DIR: {work_dir}")
            safe_input = work_dir / f"input{Path(input_path).suffix or '.mp4'}"
            shutil.copyfile(input_path, safe_input)
            append_log(f"SAFE INPUT: {safe_input}")
            mask_path, _ = build_mask_asset(str(safe_input), payload.masks, work_dir)
            append_log(f"MASK: {mask_path}")
            repaired_path = work_dir / "repaired.mp4"
            run_propainter(str(safe_input), mask_path, repaired_path, work_dir)
            mux_audio_if_needed(input_path, repaired_path, final_path, bool(payload.repair.get("keepAudio", True)))

        append_log(f"REPAIR DONE output={final_path}")
        return response_ok({"output": str(final_path), "file": str(final_path), "path": str(final_path)})
    except Exception as exc:
        append_log(f"REPAIR ERROR: {exc}")
        return response_error(str(exc))


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("WATERMARK_REPAIR_PORT", "7860"))
    uvicorn.run(app, host="127.0.0.1", port=port)
