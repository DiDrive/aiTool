import os
import threading
import time
import base64
import json
import hmac
import hashlib
import subprocess
from email.utils import formatdate
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
from urllib.error import HTTPError
from fastapi import FastAPI, Request
import uvicorn

app = FastAPI()

@app.middleware("http")
async def trace_requests(request: Request, call_next):
    path = request.url.path or ""
    if path in ("/scene/start", "/api/scene/start"):
        request_trace["start"] += 1
    elif path in ("/status", "/api/status", "/scene/status", "/api/scene/status"):
        request_trace["status"] += 1
    elif path in ("/scene/talk", "/api/scene/talk"):
        request_trace["talk"] += 1
    elif path in ("/scene/stop", "/api/scene/stop"):
        request_trace["stop"] += 1
    request_trace["last_path"] = path
    request_trace["last_at"] = time.time()
    response = await call_next(request)
    return response


scene_id = "live"
state_lock = threading.Lock()
loop_thread = None
loop_stop_event = threading.Event()
talk_until_ts = 0.0
xfyun_session = ""
xfyun_last_session = ""
xfyun_stream_url = ""
xfyun_start_ts = 0.0
xfyun_last_stop_ts = 0.0
xfyun_ping_fail_count = 0
xfyun_last_ping_error = ""
relay_lock = threading.Lock()
relay_process = None
relay_source_url = ""
relay_target_url = ""
relay_started_at = 0.0
relay_last_error = ""
relay_last_log = ""
relay_output_mode = ""
xfyun_debug_cache = {
    "start_request": {},
    "start_response": {},
    "last_error": "",
    "updated_at": 0.0,
}
request_trace = {
    "start": 0,
    "status": 0,
    "talk": 0,
    "stop": 0,
    "last_path": "",
    "last_at": 0.0,
}

live_state = {
    "is_running": False,
    "status": "stopped",
    "status_msg": "",
    "talking": False,
    "talk_title": "",
    "talk_content": "",
    "video_title": "",
    "stream_mode": "rtmp",
    "rtmp_url": "",
    "rtmp_key": "",
    "fps": 0.0,
    "last_tick": time.time(),
    "current_talk_id": "",
}


def response_ok(data=None):
    return {"code": 0, "msg": "ok", "data": data or {}}


def response_error(code: int, msg: str):
    return {"code": code, "msg": msg, "data": {}}


def emit_action(action_type: str, msg: str = ""):
    payload = {"Action": action_type if not msg else f"{action_type}:{msg}"}
    encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("utf-8")
    print(f"AigcPanelRunResult[live][{encoded}]")


def full_rtmp_url():
    rtmp_url = (live_state.get("rtmp_url") or "").rstrip("/")
    rtmp_key = live_state.get("rtmp_key") or ""
    if not rtmp_url or not rtmp_key:
        return ""
    return f"{rtmp_url}/{rtmp_key}"


def relay_is_running():
    with relay_lock:
        return relay_process is not None and relay_process.poll() is None


def relay_target_from_config(config: dict):
    rtmp_url = str(config.get("rtmpUrl", "") or "").rstrip("/")
    rtmp_key = str(config.get("rtmpKey", "") or "").strip()
    if not rtmp_url or not rtmp_key:
        return ""
    return f"{rtmp_url}/{rtmp_key}"


def relay_target_for_mode(stream_mode: str, config: dict):
    mode = str(stream_mode or "rtmp").strip()
    if mode == "virtualCam":
        return str(os.getenv("AIGCPANEL_VIRTUALCAM_UDP_URL", "udp://127.0.0.1:12345?pkt_size=1316") or "").strip()
    return relay_target_from_config(config)


def relay_target_from_live_state():
    mode = str(live_state.get("stream_mode", "rtmp") or "rtmp")
    if mode == "virtualCam":
        return str(os.getenv("AIGCPANEL_VIRTUALCAM_UDP_URL", "udp://127.0.0.1:12345?pkt_size=1316") or "").strip()
    return full_rtmp_url()


def relay_mode_from_target(target_url: str):
    t = str(target_url or "").lower()
    if t.startswith("udp://"):
        return "virtualCam"
    return "rtmp"


def relay_output_args_for_target(target_url: str):
    mode = relay_mode_from_target(target_url)
    if mode == "virtualCam":
        return [
            "-f",
            "mpegts",
            target_url,
        ]
    return [
        "-f",
        "flv",
        target_url,
    ]


def relay_read_stderr(proc: subprocess.Popen):
    global relay_last_error, relay_last_log
    try:
        if not proc or not proc.stderr:
            return
        while True:
            line = proc.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="ignore").strip()
            if not text:
                continue
            relay_last_log = text
            lower = text.lower()
            if "error" in lower or "failed" in lower:
                relay_last_error = text
    except Exception:
        pass


def stop_relay():
    global relay_process, relay_source_url, relay_target_url, relay_started_at, relay_output_mode, relay_last_log
    with relay_lock:
        proc = relay_process
        relay_process = None
        relay_source_url = ""
        relay_target_url = ""
        relay_started_at = 0.0
        relay_output_mode = ""
        relay_last_log = ""
    if proc and proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def start_relay(source_url: str, target_url: str):
    global relay_process, relay_source_url, relay_target_url, relay_started_at, relay_last_error, relay_output_mode, relay_last_log
    source = str(source_url or "").strip()
    target = str(target_url or "").strip()
    if not source or not target:
        return False, "中转参数不完整"
    stop_relay()
    ffmpeg_bin = str(os.getenv("AIGCPANEL_FFMPEG_PATH", "ffmpeg") or "ffmpeg").strip() or "ffmpeg"
    args = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "info",
        "-rw_timeout",
        "15000000",
        "-fflags",
        "nobuffer",
        "-flags",
        "low_delay",
        "-thread_queue_size",
        "512",
        "-i",
        source,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-r",
        "25",
        "-g",
        "50",
        "-keyint_min",
        "50",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-b:a",
        "128k",
        "-max_muxing_queue_size",
        "1024",
    ]
    args.extend(relay_output_args_for_target(target))
    try:
        proc = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError:
        relay_last_error = f"未找到 FFmpeg 可执行文件: {ffmpeg_bin}"
        return False, relay_last_error
    except Exception as e:
        relay_last_error = f"启动中转失败: {str(e) or 'unknown'}"
        return False, relay_last_error

    time.sleep(1.0)
    if proc.poll() is not None:
        err_text = ""
        try:
            if proc.stderr:
                err_text = proc.stderr.read().decode("utf-8", errors="ignore").strip()
        except Exception:
            err_text = ""
        relay_last_error = err_text or f"FFmpeg 进程退出: {proc.poll()}"
        return False, relay_last_error

    with relay_lock:
        relay_process = proc
        relay_source_url = source
        relay_target_url = target
        relay_started_at = time.time()
        relay_output_mode = relay_mode_from_target(target)
        relay_last_log = ""
    stderr_thread = threading.Thread(target=relay_read_stderr, args=(proc,), daemon=True)
    stderr_thread.start()
    relay_last_error = ""
    return True, ""


def ensure_relay_running(source_url: str, target_url: str):
    global relay_last_error
    source = str(source_url or "").strip()
    target = str(target_url or "").strip()
    if not source or not target:
        return False, "未配置 RTMP 目标地址"
    with relay_lock:
        proc = relay_process
        same_target_running = (
            proc is not None
            and proc.poll() is None
            and relay_target_url == target
            and relay_source_url == source
        )
    if proc is not None and proc.poll() is not None and not relay_last_error:
        relay_last_error = f"中转进程已退出，退出码 {proc.poll()}"
    if same_target_running:
        return True, ""
    ok, msg = start_relay(source, target)
    if not ok:
        relay_last_error = msg or "中转推流启动失败"
    return ok, msg


def xfyun_enabled():
    return str(os.getenv("AIGCPANEL_XFYUN_ENABLED", "0")).strip().lower() in ("1", "true", "yes", "on")


def xfyun_debug_enabled():
    return str(os.getenv("AIGCPANEL_XFYUN_DEBUG", "0")).strip().lower() in ("1", "true", "yes", "on")


def xfyun_mask_sensitive(value):
    if isinstance(value, dict):
        result = {}
        for k, v in value.items():
            key = str(k).lower()
            if key in ("api_key", "apikey", "api_secret", "apisecret", "authorization", "signature"):
                result[k] = "***"
            else:
                result[k] = xfyun_mask_sensitive(v)
        return result
    if isinstance(value, list):
        return [xfyun_mask_sensitive(item) for item in value]
    if isinstance(value, str) and len(value) > 120:
        return value[:117] + "..."
    return value


def xfyun_debug_log(tag: str, payload):
    safe_payload = xfyun_mask_sensitive(payload)
    if tag == "start.request":
        xfyun_debug_cache["start_request"] = safe_payload
    elif tag == "start.response":
        xfyun_debug_cache["start_response"] = safe_payload
    elif tag == "start.error":
        xfyun_debug_cache["last_error"] = str(safe_payload)
    xfyun_debug_cache["updated_at"] = time.time()
    if not xfyun_debug_enabled():
        return
    print(f"[xfyun-debug] {tag}: {json.dumps(safe_payload, ensure_ascii=False)}")


def xfyun_config():
    return {
        "host": os.getenv("AIGCPANEL_XFYUN_HOST", "vms.cn-huadong-1.xf-yun.com").strip(),
        "scheme": os.getenv("AIGCPANEL_XFYUN_SCHEME", "https").strip() or "https",
        "app_id": os.getenv("AIGCPANEL_XFYUN_APP_ID", "").strip(),
        "api_key": os.getenv("AIGCPANEL_XFYUN_API_KEY", "").strip(),
        "api_secret": os.getenv("AIGCPANEL_XFYUN_API_SECRET", "").strip(),
        "avatar_id": os.getenv("AIGCPANEL_XFYUN_AVATAR_ID", "").strip(),
        "vcn": os.getenv("AIGCPANEL_XFYUN_VCN", "x4_xiaoxuan").strip() or "x4_xiaoxuan",
        "uid": os.getenv("AIGCPANEL_XFYUN_UID", "aigcpanel").strip() or "aigcpanel",
        "width": int(os.getenv("AIGCPANEL_XFYUN_WIDTH", "720")),
        "height": int(os.getenv("AIGCPANEL_XFYUN_HEIGHT", "1280")),
        "protocol": os.getenv("AIGCPANEL_XFYUN_PROTOCOL", "rtmp").strip() or "rtmp",
    }


def xfyun_validate_config():
    cfg = xfyun_config()
    required = ("app_id", "api_key", "api_secret", "avatar_id")
    miss = [k for k in required if not cfg.get(k)]
    if miss:
        return False, f"讯飞配置缺失: {','.join(miss)}"
    return True, ""


def xfyun_signed_url(path: str, method: str = "POST"):
    cfg = xfyun_config()
    host = cfg["host"]
    date = formatdate(timeval=None, localtime=False, usegmt=True)
    signature_origin = f"host: {host}\ndate: {date}\n{method.upper()} {path} HTTP/1.1"
    signature_sha = hmac.new(cfg["api_secret"].encode("utf-8"), signature_origin.encode("utf-8"), hashlib.sha256).digest()
    signature = base64.b64encode(signature_sha).decode("utf-8")
    authorization_origin = (
        f'api_key="{cfg["api_key"]}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")
    query = urlencode({"host": host, "date": date, "authorization": authorization})
    return f'{cfg["scheme"]}://{host}{path}?{query}'


def xfyun_post(path: str, payload: dict):
    url = xfyun_signed_url(path, "POST")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = UrlRequest(url=url, data=body, method="POST")
    req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urlopen(req, timeout=20) as resp:
            text = resp.read().decode("utf-8")
    except HTTPError as e:
        err_text = ""
        try:
            err_text = e.read().decode("utf-8")
        except Exception:
            err_text = str(e) or "request failed"
        try:
            err_data = json.loads(err_text) if err_text else {}
            if isinstance(err_data, dict):
                return False, err_data
        except Exception:
            pass
        return False, {"header": {"code": -1, "message": err_text or str(e) or "request failed"}}
    except Exception as e:
        return False, {"header": {"code": -1, "message": str(e) or "request failed"}}
    try:
        data = json.loads(text) if text else {}
    except Exception:
        return False, {"header": {"code": -1, "message": text or "invalid response"}}
    return True, data


def xfyun_parse_result(result: dict):
    header = result.get("header", {}) if isinstance(result, dict) else {}
    msg = str(header.get("message", "") or "")
    raw_code = header.get("code", None)
    code = -1
    try:
        if raw_code is not None and str(raw_code).strip() != "":
            code = int(str(raw_code).strip())
    except Exception:
        code = -1
    # Some vendor responses may omit/format code unexpectedly while message is still "success".
    if code != 0 and msg.strip().lower() == "success":
        code = 0
    return code, msg, header


def xfyun_human_error(code: int, raw_msg: str):
    if int(code or -1) == 11203:
        return "云端会话忙碌或形象占用，请先停止直播并等待 3-5 秒后重试"
    if int(code or -1) == 11200:
        return "云端参数校验失败，请检查 avatar_id、APPID 及服务区域"
    return raw_msg or "讯飞请求失败"


def xfyun_decode_stream_url(result: dict):
    payload = result.get("payload", {}) if isinstance(result, dict) else {}
    stream_url = ""
    stream_block = payload.get("stream_url", {}) if isinstance(payload, dict) else {}
    encoded_text = stream_block.get("text", "") if isinstance(stream_block, dict) else ""
    if encoded_text:
        try:
            stream_url = base64.b64decode(encoded_text).decode("utf-8")
        except Exception:
            stream_url = ""
    if not stream_url:
        header = result.get("header", {}) if isinstance(result, dict) else {}
        stream_url = str(header.get("stream_url", "") or "")
    return stream_url


def xfyun_ping_with_session(cfg: dict, session_id: str):
    req_payload = {
        "header": {
            "app_id": cfg["app_id"],
            "uid": cfg["uid"],
            "session": session_id,
        }
    }
    success, result = xfyun_post("/v1/private/vms2d_ping", req_payload)
    code, raw_msg, _ = xfyun_parse_result(result)
    return success, code, raw_msg, result


def xfyun_stop_session(cfg: dict, session_id: str):
    if not session_id:
        return False, -1, "empty session"
    req_payload = {
        "header": {
            "app_id": cfg["app_id"],
            "uid": cfg["uid"],
            "session": session_id,
        }
    }
    success, result = xfyun_post("/v1/private/vms2d_stop", req_payload)
    code, raw_msg, _ = xfyun_parse_result(result)
    return success, code, raw_msg


def xfyun_restore_session_from_cache():
    global xfyun_session, xfyun_stream_url, xfyun_start_ts, xfyun_last_stop_ts
    if xfyun_session:
        return
    # Never revive an old session after an explicit stop.
    cached_updated_at = float(xfyun_debug_cache.get("updated_at", 0.0) or 0.0)
    if xfyun_last_stop_ts and cached_updated_at <= xfyun_last_stop_ts:
        return
    cached = xfyun_debug_cache.get("start_response", {}) or {}
    header = cached.get("header", {}) if isinstance(cached, dict) else {}
    cached_session = str(header.get("session", "") or "")
    if not cached_session:
        return
    xfyun_session = cached_session
    decoded = xfyun_decode_stream_url(cached)
    if decoded:
        xfyun_stream_url = decoded
    if not xfyun_start_ts:
        xfyun_start_ts = float(xfyun_debug_cache.get("updated_at", time.time()) or time.time())


def render_loop():
    global talk_until_ts
    while not loop_stop_event.is_set():
        now = time.time()
        with state_lock:
            if not live_state["is_running"]:
                break
            if live_state["talking"] and now >= talk_until_ts:
                talk_id = live_state.get("current_talk_id") or ""
                live_state["talking"] = False
                live_state["talk_title"] = ""
                live_state["talk_content"] = ""
                live_state["video_title"] = "待机循环中"
                live_state["current_talk_id"] = ""
                emit_action("LiveTalkDone", talk_id)
            live_state["fps"] = 24.0 if not live_state["talking"] else 22.0
            live_state["last_tick"] = now
        time.sleep(0.2)


def ensure_loop_started():
    global loop_thread
    if loop_thread and loop_thread.is_alive():
        return
    loop_stop_event.clear()
    loop_thread = threading.Thread(target=render_loop, daemon=True)
    loop_thread.start()


def stop_loop():
    loop_stop_event.set()


def build_scene_status():
    with state_lock:
        running = live_state["is_running"]
        status = "running" if running else "stopped"
        video_rtmp = ""
        video_hls = ""
        if running and xfyun_enabled():
            video_hls = xfyun_stream_url
            if relay_is_running() and relay_target_url and relay_mode_from_target(relay_target_url) == "rtmp":
                video_rtmp = relay_target_url
        elif running and live_state["stream_mode"] == "rtmp":
            video_rtmp = full_rtmp_url()
            video_hls = "http://127.0.0.1:8000/mock/live.m3u8"
        talk_title = live_state["talk_title"] if running else ""
        talk_content = live_state["talk_content"] if running else ""
        video_title = live_state["video_title"] if running else ""
        avatar_status = "talking" if live_state["talking"] else ("idle" if running else "stopped")
        fps = live_state["fps"] if running else 0
        return {
            "id": scene_id,
            "status": status,
            "statusMsg": live_state["status_msg"],
            "avatar": {"enable": True, "width": 720, "height": 720},
            "video": {"enable": True, "width": 1280, "height": 720},
            "audio": {"enable": True},
            "videoTitle": video_title,
            "talkTitle": talk_title,
            "talkContent": talk_content,
            "avatarRtmp": "",
            "avatarHls": "",
            "videoRtmp": video_rtmp,
            "videoHls": video_hls,
            "audioRtmp": "",
            "audioHls": "",
            "runtime": {
                "avatarStatus": avatar_status,
                "avatarVideoFps": fps,
                "avatarAudioFps": 0,
                "videoStatus": "running" if running else "stopped",
                "videoVideoFps": fps,
                "videoAudioFps": 0,
                "audioStatus": "running" if running else "stopped",
                "audioFps": 0,
            },
        }


@app.get("/ping")
async def ping():
    return {"ok": True}


@app.get("/debug/xfyun/last")
@app.get("/api/debug/xfyun/last")
async def xfyun_last_debug():
    xfyun_restore_session_from_cache()
    diagnosis = ""
    if xfyun_enabled() and request_trace.get("start", 0) == 0:
        diagnosis = "尚未收到任何 /scene/start 调用。请确认前端 cloudApiBaseUrl 指向本服务地址。"
    return response_ok(
        {
            "enabled": xfyun_enabled(),
            "debugEnabled": xfyun_debug_enabled(),
            "sessionReady": bool(xfyun_session),
            "lastSessionReady": bool(xfyun_last_session),
            "startRequest": xfyun_debug_cache.get("start_request", {}),
            "startResponse": xfyun_debug_cache.get("start_response", {}),
            "lastError": "" if xfyun_debug_cache.get("last_error", "") == "success" else xfyun_debug_cache.get("last_error", ""),
            "updatedAt": xfyun_debug_cache.get("updated_at", 0.0),
            "pingFailCount": xfyun_ping_fail_count,
            "lastPingError": xfyun_last_ping_error,
            "lastStopAt": xfyun_last_stop_ts,
            "relayRunning": relay_is_running(),
            "relayTarget": relay_target_url,
            "relayLastError": relay_last_error,
            "relayLastLog": relay_last_log,
            "relayMode": relay_output_mode,
            "relayUptimeSec": int(time.time() - relay_started_at) if relay_started_at else 0,
            "requestTrace": {
                "start": request_trace.get("start", 0),
                "status": request_trace.get("status", 0),
                "talk": request_trace.get("talk", 0),
                "stop": request_trace.get("stop", 0),
                "lastPath": request_trace.get("last_path", ""),
                "lastAt": request_trace.get("last_at", 0.0),
            },
            "diagnosis": diagnosis,
        }
    )


@app.post("/scene/start")
@app.post("/api/scene/start")
async def scene_start(request: Request):
    global xfyun_session, xfyun_last_session, xfyun_stream_url, xfyun_start_ts, xfyun_last_stop_ts, xfyun_ping_fail_count, xfyun_last_ping_error
    payload = await request.json()
    scene = payload.get("scene", {})
    config = scene.get("config", {})
    if xfyun_enabled():
        # Give cloud stop a short cooldown window to release avatar/session resources.
        wait_seconds = 2.5 - (time.time() - xfyun_last_stop_ts)
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        xfyun_debug_log(
            "start.request",
            {
                "path": "/v1/private/vms2d_start",
                "sceneId": scene.get("id", ""),
                "streamMode": config.get("streamMode", "rtmp"),
            },
        )
        ok, msg = xfyun_validate_config()
        if not ok:
            xfyun_debug_log("start.error", msg)
            return response_error(-1, msg)
        cfg = xfyun_config()
        # Avoid stale-session conflicts by trying to close previous session first.
        if xfyun_session:
            xfyun_last_session = xfyun_session
            try:
                _ = xfyun_post(
                    "/v1/private/vms2d_stop",
                    {
                        "header": {
                            "app_id": cfg["app_id"],
                            "uid": cfg["uid"],
                            "session": xfyun_session,
                        }
                    },
                )
            except Exception:
                pass
            xfyun_session = ""
            xfyun_stream_url = ""
        elif xfyun_last_session:
            # Try to release lingering cloud session from previous start/stop cycle.
            try:
                _ = xfyun_post(
                    "/v1/private/vms2d_stop",
                    {
                        "header": {
                            "app_id": cfg["app_id"],
                            "uid": cfg["uid"],
                            "session": xfyun_last_session,
                        }
                    },
                )
            except Exception:
                pass
        req_payload = {
            "header": {
                "app_id": cfg["app_id"],
                "uid": cfg["uid"],
            },
            "parameter": {
                "vmr": {
                    "stream": {
                        "protocol": cfg["protocol"],
                    },
                    "avatar_id": cfg["avatar_id"],
                    "width": cfg["width"],
                    "height": cfg["height"],
                }
            },
        }
        xfyun_debug_log(
            "start.request",
            {
                "path": "/v1/private/vms2d_start",
                "header": req_payload.get("header", {}),
                "parameter": req_payload.get("parameter", {}),
            },
        )
        success = False
        result = {}
        code = -1
        raw_msg = ""
        header = {}
        retry_waits = [1.5, 2.5, 4.0, 6.0, 8.0]
        for attempt in range(len(retry_waits) + 1):
            success, result = xfyun_post("/v1/private/vms2d_start", req_payload)
            xfyun_debug_log("start.response", result)
            code, raw_msg, header = xfyun_parse_result(result)
            if code == 11203 and attempt < len(retry_waits):
                # Try to actively release known sessions, then backoff retry.
                if xfyun_session:
                    try:
                        xfyun_stop_session(cfg, xfyun_session)
                    except Exception:
                        pass
                if xfyun_last_session:
                    try:
                        xfyun_stop_session(cfg, xfyun_last_session)
                    except Exception:
                        pass
                time.sleep(retry_waits[attempt])
                continue
            break
        if code == 0:
            xfyun_debug_log("start.error", "")
            pass
        elif not success:
            friendly_msg = xfyun_human_error(code, raw_msg)
            xfyun_debug_log("start.error", friendly_msg)
            return response_error(code if code != -1 else -1, friendly_msg)
        elif code == 11203:
            # If cloud still reports occupied, try to reuse the most recent live session.
            candidate_session = xfyun_last_session or xfyun_session
            if candidate_session:
                ping_success, ping_code, _, ping_result = xfyun_ping_with_session(cfg, candidate_session)
                if ping_success and ping_code == 0:
                    xfyun_session = candidate_session
                    decoded = xfyun_decode_stream_url(ping_result)
                    if decoded:
                        xfyun_stream_url = decoded
                    relay_target = relay_target_for_mode(config.get("streamMode", "rtmp"), config)
                    relay_warning = ""
                    if relay_target and xfyun_stream_url:
                        ok_relay, relay_msg = ensure_relay_running(xfyun_stream_url, relay_target)
                        if not ok_relay:
                            relay_warning = relay_msg or "中转推流启动失败"
                    xfyun_start_ts = time.time()
                    xfyun_ping_fail_count = 0
                    xfyun_last_ping_error = ""
                    xfyun_debug_log("start.error", "")
                    with state_lock:
                        live_state["stream_mode"] = config.get("streamMode", "rtmp")
                        live_state["rtmp_url"] = config.get("rtmpUrl", "")
                        live_state["rtmp_key"] = config.get("rtmpKey", "")
                        live_state["is_running"] = True
                        live_state["status"] = "running"
                        live_state["status_msg"] = relay_warning
                        live_state["talking"] = False
                        live_state["talk_title"] = ""
                        live_state["talk_content"] = ""
                        live_state["video_title"] = "云端渲染中"
                        live_state["fps"] = 0.0
                        live_state["last_tick"] = time.time()
                    scene_data = {
                        "status": "running",
                        "videoHls": xfyun_stream_url,
                        "previewUrl": xfyun_stream_url,
                        "videoRtmp": relay_target if relay_is_running() and relay_mode_from_target(relay_target) == "rtmp" else "",
                    }
                    if relay_warning:
                        return response_ok({"scene": scene_data, "warning": relay_warning})
                    return response_ok({"scene": scene_data})
            friendly_msg = xfyun_human_error(code, raw_msg)
            xfyun_debug_log("start.error", friendly_msg)
            return response_error(code, friendly_msg)
        elif code != 0:
            friendly_msg = xfyun_human_error(code, raw_msg)
            xfyun_debug_log("start.error", friendly_msg)
            return response_error(code, friendly_msg)
        xfyun_session = str(header.get("session", "") or "")
        if xfyun_session:
            xfyun_last_session = xfyun_session
        xfyun_stream_url = xfyun_decode_stream_url(result)
        relay_target = relay_target_for_mode(config.get("streamMode", "rtmp"), config)
        relay_warning = ""
        if relay_target and xfyun_stream_url:
            ok_relay, relay_msg = ensure_relay_running(xfyun_stream_url, relay_target)
            if not ok_relay:
                relay_warning = relay_msg or "中转推流启动失败"
        xfyun_start_ts = time.time()
        xfyun_ping_fail_count = 0
        xfyun_last_ping_error = ""
        with state_lock:
            live_state["stream_mode"] = config.get("streamMode", "rtmp")
            live_state["rtmp_url"] = config.get("rtmpUrl", "")
            live_state["rtmp_key"] = config.get("rtmpKey", "")
            live_state["is_running"] = True
            live_state["status"] = "running"
            live_state["status_msg"] = relay_warning
            live_state["talking"] = False
            live_state["talk_title"] = ""
            live_state["talk_content"] = ""
            live_state["video_title"] = "云端渲染中"
            live_state["fps"] = 0.0
            live_state["last_tick"] = time.time()
        scene_data = {
            "status": "running",
            "videoHls": xfyun_stream_url,
            "previewUrl": xfyun_stream_url,
            "videoRtmp": relay_target if relay_is_running() and relay_mode_from_target(relay_target) == "rtmp" else "",
        }
        if relay_warning:
            return response_ok({"scene": scene_data, "warning": relay_warning})
        return response_ok({"scene": scene_data})
    with state_lock:
        live_state["stream_mode"] = config.get("streamMode", "rtmp")
        live_state["rtmp_url"] = config.get("rtmpUrl", "")
        live_state["rtmp_key"] = config.get("rtmpKey", "")
        live_state["is_running"] = True
        live_state["status"] = "running"
        live_state["status_msg"] = ""
        live_state["talking"] = False
        live_state["talk_title"] = ""
        live_state["talk_content"] = ""
        live_state["video_title"] = "待机循环中"
        live_state["fps"] = 24.0
        live_state["last_tick"] = time.time()
    ensure_loop_started()
    return response_ok({})


@app.post("/scene/talk")
@app.post("/api/scene/talk")
async def scene_talk(request: Request):
    global talk_until_ts
    payload = await request.json()
    text = payload.get("data", {}).get("text", "").strip()
    if not text:
        return response_ok({})
    if xfyun_enabled():
        cfg = xfyun_config()
        if not xfyun_session:
            return response_error(-1, "讯飞会话未建立，请先开播")
        req_payload = {
            "header": {
                "app_id": cfg["app_id"],
                "uid": cfg["uid"],
                "session": xfyun_session,
            },
            "parameters": {
                "tts": {
                    "vcn": cfg["vcn"],
                    "speed": 50,
                    "volume": 50,
                    "pitch": 50,
                }
            },
            "payload": {
                "text": {
                    "encoding": "utf8",
                    "compress": "raw",
                    "format": "plain",
                    "status": 3,
                    "seq": 0,
                    "text": text,
                }
            },
        }
        success, result = xfyun_post("/v1/private/vms2d_ctrl", req_payload)
        if not success:
            return response_error(-1, "讯飞播报请求失败")
        code, raw_msg, header = xfyun_parse_result(result)
        if code != 0:
            return response_error(code, raw_msg or "讯飞播报失败")
        talk_id = payload.get("talkId") or str(header.get("sid", "") or int(time.time() * 1000))
        emit_action("LiveTalkStart", str(talk_id))
        emit_action("LiveTalkDone", str(talk_id))
        return response_ok({"talkId": talk_id})
    with state_lock:
        if not live_state["is_running"]:
            return {"code": -1, "msg": "scene not running", "data": {}}
        talk_id = payload.get("talkId") or str(int(time.time() * 1000))
        live_state["talking"] = True
        live_state["talk_title"] = "AI回复"
        live_state["talk_content"] = text
        live_state["video_title"] = "正在口型驱动"
        live_state["current_talk_id"] = talk_id
        duration = min(12.0, max(2.0, len(text) * 0.22))
        talk_until_ts = time.time() + duration
    emit_action("LiveTalkStart", talk_id)
    return response_ok({"talkId": talk_id})


@app.post("/scene/stop")
@app.post("/api/scene/stop")
async def scene_stop():
    global xfyun_session, xfyun_last_session, xfyun_stream_url, xfyun_start_ts, xfyun_last_stop_ts, xfyun_ping_fail_count, xfyun_last_ping_error
    if xfyun_enabled():
        cfg = xfyun_config()
        stop_warning = ""
        stop_session = xfyun_session or xfyun_last_session
        if stop_session:
            req_payload = {
                "header": {
                    "app_id": cfg["app_id"],
                    "uid": cfg["uid"],
                    "session": stop_session,
                }
            }
            success, result = xfyun_post("/v1/private/vms2d_stop", req_payload)
            if success:
                code, raw_msg, _ = xfyun_parse_result(result)
                if code != 0:
                    stop_warning = xfyun_human_error(code, raw_msg or "讯飞停播失败")
            else:
                _, raw_msg, _ = xfyun_parse_result(result)
                stop_warning = raw_msg or "讯飞停播请求失败"
        xfyun_session = ""
        xfyun_last_session = stop_session or ""
        xfyun_stream_url = ""
        xfyun_start_ts = 0.0
        xfyun_last_stop_ts = time.time()
        xfyun_ping_fail_count = 0
        xfyun_last_ping_error = ""
        stop_relay()
        cached_response = xfyun_debug_cache.get("start_response", {})
        if isinstance(cached_response, dict):
            header = cached_response.get("header", {})
            if isinstance(header, dict):
                header["session"] = ""
                header["stream_url"] = ""
            payload = cached_response.get("payload", {})
            if isinstance(payload, dict):
                stream_block = payload.get("stream_url", {})
                if isinstance(stream_block, dict):
                    stream_block["text"] = ""
        with state_lock:
            live_state["is_running"] = False
            live_state["status"] = "stopped"
            live_state["talking"] = False
            live_state["talk_title"] = ""
            live_state["talk_content"] = ""
            live_state["video_title"] = ""
            live_state["fps"] = 0.0
        if stop_warning:
            return response_ok({"warning": stop_warning})
        return response_ok({})
    with state_lock:
        live_state["is_running"] = False
        live_state["status"] = "stopped"
        live_state["talking"] = False
        live_state["talk_title"] = ""
        live_state["talk_content"] = ""
        live_state["video_title"] = ""
        live_state["fps"] = 0.0
    stop_relay()
    stop_loop()
    return response_ok({})


@app.post("/status")
@app.post("/api/status")
@app.post("/scene/status")
@app.post("/api/scene/status")
async def status():
    global xfyun_stream_url, xfyun_ping_fail_count, xfyun_last_ping_error
    xfyun_restore_session_from_cache()
    if xfyun_enabled():
        cfg = xfyun_config()
        if xfyun_session:
            req_payload = {
                "header": {
                    "app_id": cfg["app_id"],
                    "uid": cfg["uid"],
                    "session": xfyun_session,
                }
            }
            success, result = xfyun_post("/v1/private/vms2d_ping", req_payload)
            if success:
                code, raw_msg, _ = xfyun_parse_result(result)
                if code == 0:
                    decoded = xfyun_decode_stream_url(result)
                    if decoded:
                        xfyun_stream_url = decoded
                    relay_target = relay_target_from_live_state()
                    relay_warning = ""
                    if relay_target and xfyun_stream_url:
                        ok_relay, relay_msg = ensure_relay_running(xfyun_stream_url, relay_target)
                        if not ok_relay:
                            relay_warning = relay_msg or "中转推流启动失败"
                    xfyun_ping_fail_count = 0
                    xfyun_last_ping_error = ""
                    with state_lock:
                        live_state["is_running"] = True
                        live_state["status"] = "running"
                        live_state["status_msg"] = relay_warning
                else:
                    xfyun_ping_fail_count += 1
                    xfyun_last_ping_error = raw_msg or "讯飞状态异常"
                    in_grace = (time.time() - xfyun_start_ts) < 25.0
                    tolerate = xfyun_ping_fail_count < 6
                    keep_running = in_grace or tolerate
                    with state_lock:
                        live_state["is_running"] = keep_running
                        live_state["status"] = "starting" if keep_running else "error"
                        live_state["status_msg"] = (
                            f"云端状态同步中，请稍候...({xfyun_ping_fail_count}/5)"
                            if keep_running
                            else (raw_msg or "讯飞状态异常")
                        )
            else:
                _, raw_msg, _ = xfyun_parse_result(result)
                xfyun_ping_fail_count += 1
                xfyun_last_ping_error = raw_msg or "讯飞状态请求失败"
                in_grace = (time.time() - xfyun_start_ts) < 25.0
                tolerate = xfyun_ping_fail_count < 6
                keep_running = in_grace or tolerate
                with state_lock:
                    live_state["is_running"] = keep_running
                    live_state["status"] = "starting" if keep_running else "error"
                    live_state["status_msg"] = (
                        f"云端状态同步中，请稍候...({xfyun_ping_fail_count}/5)"
                        if keep_running
                        else (raw_msg or "讯飞状态请求失败")
                    )
        else:
            # Try to recover from last known session before declaring stopped.
            recovered = False
            if xfyun_last_session:
                ping_success, ping_code, ping_msg, ping_result = xfyun_ping_with_session(cfg, xfyun_last_session)
                if ping_success and ping_code == 0:
                    xfyun_session = xfyun_last_session
                    decoded = xfyun_decode_stream_url(ping_result)
                    if decoded:
                        xfyun_stream_url = decoded
                    relay_target = relay_target_from_live_state()
                    relay_warning = ""
                    if relay_target and xfyun_stream_url:
                        ok_relay, relay_msg = ensure_relay_running(xfyun_stream_url, relay_target)
                        if not ok_relay:
                            relay_warning = relay_msg or "中转推流启动失败"
                    xfyun_ping_fail_count = 0
                    xfyun_last_ping_error = ""
                    with state_lock:
                        live_state["is_running"] = True
                        live_state["status"] = "running"
                        live_state["status_msg"] = relay_warning
                    recovered = True
                else:
                    xfyun_last_ping_error = ping_msg or "讯飞状态请求失败"
            if not recovered:
                stop_relay()
                xfyun_ping_fail_count = 0
                with state_lock:
                    live_state["is_running"] = False
                    live_state["status"] = "stopped"
                    live_state["status_msg"] = ""
    return response_ok({"scenes": [build_scene_status()]})


@app.post("/config")
@app.post("/api/config")
async def post_config():
    return response_ok(
        {
            "name": "my_local_live_engine",
            "version": "1.0.0",
            "title": "我的本地数字人引擎",
            "ttsProviders": [],
            "functions": {
                "scene/start": {},
                "scene/talk": {},
                "scene/stop": {},
                "status": {},
                "config": {},
            },
        }
    )


@app.get("/config")
@app.get("/api/config")
async def get_config():
    return response_ok(
        {
            "functions": {
                "scene/start": {},
                "scene/talk": {},
                "scene/stop": {},
                "status": {},
                "config": {},
            }
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("AIGCPANEL_SERVER_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
