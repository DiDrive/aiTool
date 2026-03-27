import {ipcMain} from "electron";
import {spawn} from "child_process";
import {Log} from "../log/main";
import path from "node:path";
import {AppEnv} from "../env";
import {extraResolveBin} from "../../lib/env";

let ffmpegProcess: any = null;

ipcMain.handle("live:startMockStream", async (event, options: { rtmpUrl: string; rtmpKey: string; streamMode?: string }) => {
    if (ffmpegProcess) {
        throw new Error("Stream is already running");
    }

    const testVideoPath = path.join(AppEnv.appRoot, "test.mp4");
    const ffmpegPath = extraResolveBin("ffmpeg");

    let args: string[] = [];

    if (options.streamMode === "virtualCam") {
        Log.info("live", "Starting mock stream to Virtual Camera (dshow)");
        
        // 虚拟摄像头推流参数 (Windows 下通常使用 dshow 推送给 OBS-Camera)
        // 注意：这要求用户安装了 OBS-VirtualCam 插件并开启
        args = [
            "-re",
            "-stream_loop", "-1",
            "-i", testVideoPath,
            "-f", "dshow",
            "-video_size", "1920x1080",
            "-framerate", "30",
            "-vcodec", "rawvideo",
            "-pix_fmt", "yuv420p",
            "video=OBS-Camera" // 这里默认推送给名为 OBS-Camera 的虚拟设备
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
            });

            ffmpegProcess.on("error", (err: any) => {
                Log.error("live", `FFmpeg process error: ${err}`);
                ffmpegProcess = null;
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
        ffmpegProcess.kill("SIGKILL");
        ffmpegProcess = null;
    }
    return true;
});

export default {
    
};
