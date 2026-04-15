import {ipcMain} from "electron";
import {spawn} from "child_process";
import {Log} from "../log/main";
import path from "node:path";
import {AppEnv} from "../env";
import {extraResolveBin} from "../../lib/env";

let ffmpegProcess: any = null;
let ffmpegStreamMode: string = "";

const isProcessRunning = (proc: any) => {
    if (!proc) return false;
    if (proc.killed) return false;
    if (proc.exitCode !== null) return false;
    if (proc.signalCode !== null) return false;
    return true;
};

const normalizeApiBaseUrl = (url: string) => {
    return String(url || "").trim().replace(/\/+$/, "");
};

const normalizeApiPath = (apiPath: string, fallbackPath: string) => {
    const val = String(apiPath || "").trim();
    if (!val) {
        return fallbackPath;
    }
    return val.replace(/^\/+/, "");
};

const cloudPost = async (
    apiBaseUrl: string,
    apiPath: string,
    body: Record<string, any>,
    apiKey?: string
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    if (!baseUrl) {
        throw new Error("未配置云端 API 地址");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(`${baseUrl}/${apiPath.replace(/^\/+/, "")}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? {"Authorization": `Bearer ${apiKey}`} : {}),
            },
            body: JSON.stringify(body || {}),
            signal: controller.signal,
        });
        const text = await res.text();
        let json: any = {};
        try {
            json = text ? JSON.parse(text) : {};
        } catch (e) {
            json = {
                code: res.ok ? 0 : res.status,
                msg: text || `HTTP ${res.status}`,
                data: {},
            };
        }
        if (typeof json !== "object" || !json) {
            json = {};
        }
        if (typeof json.code === "undefined") {
            json.code = res.ok ? 0 : res.status;
        }
        if (typeof json.msg === "undefined") {
            json.msg = res.ok ? "" : `HTTP ${res.status}`;
        }
        if (typeof json.data === "undefined") {
            json.data = {};
        }
        return json;
    } finally {
        clearTimeout(timeout);
    }
};

const cloudPing = async (apiBaseUrl: string) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    if (!baseUrl) {
        return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
        const res = await fetch(`${baseUrl}/ping`, {
            method: "GET",
            signal: controller.signal,
        });
        if (!res.ok) {
            return false;
        }
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        return !!json?.ok;
    } catch (e) {
        return false;
    } finally {
        clearTimeout(timeout);
    }
};

ipcMain.handle("live:startMockStream", async (event, options: { rtmpUrl: string; rtmpKey: string; streamMode?: string }) => {
    if (ffmpegProcess && !isProcessRunning(ffmpegProcess)) {
        ffmpegProcess = null;
    }
    if (ffmpegProcess && isProcessRunning(ffmpegProcess)) {
        try {
            ffmpegProcess.kill();
        } catch (e) {
            Log.warn("live", "stop stale ffmpeg failed before restart");
        }
        ffmpegProcess = null;
    }

    const testVideoPath = path.join(AppEnv.appRoot, "test.mp4");
    const ffmpegPath = extraResolveBin("ffmpeg");

    let args: string[] = [];

    if (options.streamMode === "virtualCam") {
        Log.info("live", "Starting mock stream to UDP for OBS/直播伴侣");
        
        // 核心修正：FFmpeg 的 dshow 不能作为输出！
        // 正确的虚拟摄像头/直播伴侣对接方案：通过 UDP 推送 mpegts 流到本地端口
        // 用户在直播伴侣/OBS中添加“媒体源”或“网络流”，地址填入 udp://127.0.0.1:12345 即可获取画面
        args = [
            "-re",
            "-stream_loop", "-1",
            "-i", testVideoPath,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency", // 零延迟优化
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-f", "mpegts",
            "udp://127.0.0.1:12345"
        ];
    } else {
        const fullRtmpUrl = `${options.rtmpUrl.replace(/\/$/, "")}/${options.rtmpKey}`;
        Log.info("live", "Starting mock stream to " + fullRtmpUrl);
        
        // rtmp 循环推流命令
        args = [
            "-re", // 按照原始帧率读取
            "-stream_loop", "-1", // 无限循环
            "-i", testVideoPath, // 输入文件
            "-c:v", "libx264", // 视频编码器
            "-preset", "veryfast", // 编码速度
            "-maxrate", "3000k", // 最大码率
            "-bufsize", "6000k", // 缓冲大小
            "-pix_fmt", "yuv420p", // 像素格式，兼容性最好
            "-g", "50", // 关键帧间隔
            "-c:a", "aac", // 音频编码器
            "-b:a", "128k", // 音频码率
            "-ar", "44100", // 音频采样率
            "-f", "flv", // 输出格式
            fullRtmpUrl // 输出地址
        ];
    }

    return new Promise((resolve, reject) => {
        try {
            ffmpegStreamMode = options.streamMode || "rtmp";
            ffmpegProcess = spawn(ffmpegPath, args);
            
            ffmpegProcess.stdout.on("data", (data: any) => {
                console.log("[FFmpeg stdout]", data.toString());
            });

            ffmpegProcess.stderr.on("data", (data: any) => {
                // FFmpeg usually outputs to stderr
                console.log("[FFmpeg stderr]", data.toString());
            });

            ffmpegProcess.on("close", (code: number) => {
                console.log(`[FFmpeg] process exited with code ${code}`);
                ffmpegProcess = null;
                ffmpegStreamMode = "";
            });

            ffmpegProcess.on("error", (err: any) => {
                Log.error("live", `FFmpeg process error: ${err}`);
                ffmpegProcess = null;
                ffmpegStreamMode = "";
                reject(err);
            });

            // 如果能顺利跑起来没报错，我们就认为成功了
            setTimeout(() => {
                if (ffmpegProcess) {
                    resolve(true);
                }
            }, 1000);
            
        } catch (e) {
            Log.error("live", "Failed to spawn ffmpeg: " + e);
            reject(e);
        }
    });
});

ipcMain.handle("live:stopMockStream", async (event) => {
    if (ffmpegProcess) {
        Log.info("live", "Stopping mock stream");
        ffmpegProcess.kill();
        ffmpegProcess = null;
    }
    ffmpegStreamMode = "";
    return true;
});

ipcMain.handle("live:getMockStreamStatus", async () => {
    if (ffmpegProcess && !isProcessRunning(ffmpegProcess)) {
        ffmpegProcess = null;
        ffmpegStreamMode = "";
    }
    const running = !!ffmpegProcess && isProcessRunning(ffmpegProcess);
    return {
        running,
        mode: running ? ffmpegStreamMode : "",
        pid: running ? ffmpegProcess.pid || 0 : 0,
    };
});

ipcMain.handle("live:probeCloudApiBaseUrl", async (event, options: { candidates?: string[] }) => {
    const defaults = [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:18000",
        "http://localhost:18000",
        "http://127.0.0.1:50617",
        "http://localhost:50617",
    ];
    const input = Array.isArray(options?.candidates) ? options.candidates : [];
    const merged = [...input, ...defaults]
        .map(item => normalizeApiBaseUrl(String(item || "")))
        .filter(item => !!item);
    const deduped = Array.from(new Set(merged));
    for (const baseUrl of deduped) {
        if (await cloudPing(baseUrl)) {
            return {ok: true, apiBaseUrl: baseUrl};
        }
    }
    return {ok: false, apiBaseUrl: ""};
});

ipcMain.handle("live:startCloudStream", async (event, options: {
    apiBaseUrl: string;
    apiKey?: string;
    sceneId?: string;
    startPath?: string;
    streamMode?: "rtmp" | "virtualCam";
    rtmpUrl?: string;
    rtmpKey?: string;
    liveMonitorUrl?: string;
    model?: string;
}) => {
    const scene = {
        id: options.sceneId || "default",
        model: options.model || "",
        config: {
            engineMode: "cloud",
            streamMode: options.streamMode || "rtmp",
            rtmpUrl: options.rtmpUrl || "",
            rtmpKey: options.rtmpKey || "",
            liveMonitorUrl: options.liveMonitorUrl || "",
        },
    };
    return await cloudPost(
        options.apiBaseUrl,
        normalizeApiPath(options.startPath || "", "scene/start"),
        {scene},
        options.apiKey
    );
});

ipcMain.handle("live:stopCloudStream", async (event, options: {
    apiBaseUrl: string;
    apiKey?: string;
    sceneId?: string;
    stopPath?: string;
}) => {
    return await cloudPost(
        options.apiBaseUrl,
        normalizeApiPath(options.stopPath || "", "scene/stop"),
        {sceneId: options.sceneId || "default"},
        options.apiKey
    );
});

ipcMain.handle("live:getCloudStreamStatus", async (event, options: {
    apiBaseUrl: string;
    apiKey?: string;
    sceneId?: string;
    statusPath?: string;
    statusFallbackPath?: string;
}) => {
    const body = {sceneId: options.sceneId || "default"};
    const primaryStatusPath = normalizeApiPath(options.statusPath || "", "scene/status");
    const fallbackStatusPath = normalizeApiPath(options.statusFallbackPath || "", "status");
    try {
        const primaryResult = await cloudPost(options.apiBaseUrl, primaryStatusPath, body, options.apiKey);
        if (!primaryResult?.code || primaryStatusPath === fallbackStatusPath) {
            return primaryResult;
        }
        const fallbackResult = await cloudPost(options.apiBaseUrl, fallbackStatusPath, body, options.apiKey);
        return !fallbackResult?.code ? fallbackResult : primaryResult;
    } catch (e) {
        return await cloudPost(options.apiBaseUrl, fallbackStatusPath, body, options.apiKey);
    }
});

ipcMain.handle("live:talkCloudStream", async (event, options: {
    apiBaseUrl: string;
    apiKey?: string;
    sceneId?: string;
    talkPath?: string;
    text: string;
}) => {
    return await cloudPost(
        options.apiBaseUrl,
        normalizeApiPath(options.talkPath || "", "scene/talk"),
        {sceneId: options.sceneId || "default", data: {text: options.text || ""}},
        options.apiKey
    );
});

export default {
    
};
