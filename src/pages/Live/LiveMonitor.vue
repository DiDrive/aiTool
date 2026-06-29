<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {useLiveStore, liveModels, liveCloudProviders} from "../../store/modules/live";
import {Dialog} from "../../lib/dialog";
import {t} from "../../lang";
import AudioPlayer from "../../components/common/AudioPlayer.vue";
import VideoPlayer from "../../components/common/VideoPlayer.vue";
import XfyunSdkPreview from "../../components/live/XfyunSdkPreview.vue";
import {EnumServerStatus} from "../../types/Server";
import { DigitalHumanScenePackRecord, DigitalHumanScenePackService } from "../../service/DigitalHumanScenePackService";

const liveStore = useLiveStore();

// UI state
const isSettingsVisible = ref(true);
const scenePackRecords = ref<DigitalHumanScenePackRecord[]>([]);

// Computed properties for status
const statusText = computed(() => {
    switch (liveStore.status) {
        case "stopped": return "未开播";
        case "starting": return "正在启动...";
        case "running": return "直播中";
        case "stopping": return "正在停止...";
        case "error": return "运行异常";
        default: return "未知状态";
    }
});

const statusColor = computed(() => {
    switch (liveStore.status) {
        case "stopped": return "text-gray-500 bg-gray-100";
        case "starting": return "text-blue-500 bg-blue-100";
        case "running": return "text-green-500 bg-green-100";
        case "stopping": return "text-orange-500 bg-orange-100";
        case "error": return "text-red-500 bg-red-100";
        default: return "text-gray-500 bg-gray-100";
    }
});

const isRunning = computed(() => liveStore.status === "running");
const isStarting = computed(() => liveStore.status === "starting");
const isStopped = computed(() => liveStore.status === "stopped");
const isMockStreamMode = computed(() => liveStore.localConfig.config.engineMode === "cloud");
const isCloudApiConfigured = computed(() => liveStore.hasCloudApiConfigured());
const selectedCloudProvider = computed(() => liveStore.getCloudProvider());
const isRunningHubProvider = computed(() => selectedCloudProvider.value === "runninghub");
const useCloudSdkPreview = computed(() => {
    return liveStore.localConfig.config.engineMode === "cloud" && !isRunningHubProvider.value && !!liveStore.localConfig.config.cloudSdkEnabled;
});
const isLocalVirtualCamMode = computed(
    () => liveStore.localConfig.config.engineMode === "local" && liveStore.localConfig.config.streamMode === "virtualCam"
);
const streamTransportOk = computed(() => {
    if (isMockStreamMode.value) {
        return liveStore.mockStream.running;
    }
    if (isLocalVirtualCamMode.value) {
        return isRunning.value;
    }
    return !!liveStore.liveStatus.videoRtmp;
});
const streamTransportText = computed(() => {
    if (isMockStreamMode.value) {
        if (!liveStore.mockStream.running) return isCloudApiConfigured.value ? "云端推流未运行" : "本地推流未运行";
        if (isCloudApiConfigured.value) {
            if (isRunningHubProvider.value) return "RunningHub 任务执行中";
            return liveStore.localConfig.config.streamMode === "virtualCam" ? "云端输出中(UDP/伴侣接入)" : "云端推流中(RTMP)";
        }
        return liveStore.mockStream.mode === "virtualCam" ? "本地推流中(直播伴侣)" : "本地推流中(RTMP)";
    }
    if (isLocalVirtualCamMode.value) {
        return isRunning.value ? "本地引擎输出中(直播伴侣接入)" : "等待本地引擎输出";
    }
    return liveStore.liveStatus.videoRtmp ? "正常" : "未连接";
});
const cloudRawPreviewUrl = computed(() => {
    if (liveStore.localConfig.config.engineMode !== "cloud") {
        return "";
    }
    return liveStore.liveStatus.videoHls || "";
});
const cloudPreviewUrl = computed(() => {
    const raw = cloudRawPreviewUrl.value.trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("blob:")) {
        return raw;
    }
    return "";
});
const cloudPreviewHint = computed(() => {
    if (liveStore.localConfig.config.engineMode !== "cloud" || !isRunning.value) return "";
    if (cloudPreviewUrl.value) return "";
    const raw = cloudRawPreviewUrl.value.trim();
    if (!raw) return "当前云端未返回可播放预览流，推流状态请以右侧状态为准";
    if (raw.toLowerCase().startsWith("rtmp://")) {
        return "云端返回的是 RTMP 地址，浏览器无法直接播放。请在直播平台侧或伴侣/OBS中查看画面。";
    }
    return "当前预览地址格式暂不支持浏览器直放，请在平台侧确认是否出画。";
});
const hasPreviewVideo = computed(() => {
    if (!isRunning.value) {
        return false;
    }
    if (liveStore.localConfig.config.engineMode === "cloud") {
        return useCloudSdkPreview.value || !!cloudPreviewUrl.value;
    }
    if (liveStore.localConfig.config.engineMode === "local" && liveStore.localConfig.config.streamMode === "rtmp") {
        return !!liveStore.liveStatus.videoHls;
    }
    return false;
});
const currentSceneRuntime = computed(() => liveStore.scenePackRuntime);
const selectedScenePackId = computed({
    get() {
        return Number(liveStore.localConfig.config.scenePackId || 0);
    },
    set(val: number) {
        liveStore.localConfig.config.scenePackId = Number(val || 0);
    },
});
const previewFallbackType = computed(() => {
    if (currentSceneRuntime.value.currentClipVideo) {
        return "video";
    }
    if (currentSceneRuntime.value.currentClipAudio) {
        return "audio";
    }
    if (currentSceneRuntime.value.currentClipCoverImage) {
        return "image";
    }
    return "none";
});
const showScenePackPreview = computed(() => {
    if (!Number(currentSceneRuntime.value.selectedScenePackId || 0)) {
        return false;
    }
    if (hasPreviewVideo.value) {
        return false;
    }
    return previewFallbackType.value !== "none";
});
const engineModeLabel = computed(() => {
    return liveStore.localConfig.config.engineMode === "cloud" ? "云端 API 渲染" : "本地引擎渲染";
});
const streamModeLabel = computed(() => {
    return liveStore.localConfig.config.streamMode === "virtualCam" ? "伴侣 / OBS 接入" : "RTMP 推流";
});
const currentPreviewTitle = computed(() => {
    return currentSceneRuntime.value.currentClipTitle || liveStore.liveStatus.talkTitle || "待机中...";
});
const runningHubNodeTemplatePlaceholder =
    '例如: [{"nodeId":"122","fieldName":"video","fieldValue":"{{clip.videoUrl}}"},{"nodeId":"123","fieldName":"audio","fieldValue":"{{clip.audioUrl}}"},{"nodeId":"124","fieldName":"avatarId","fieldValue":"{{binding.avatarId}}"}]';
const cloudClipRequestTemplatePlaceholder =
    '例如: {"sceneId":"{{runtime.scenePackId}}","data":{"avatarId":"{{binding.avatarId}}","videoUrl":"{{clip.videoUrl}}","audioUrl":"{{clip.audioUrl}}","text":"{{clip.text}}"}}';
const cloudClipTemplateExamples = ["{{clip.videoUrl}}", "{{clip.audioUrl}}", "{{clip.text}}", "{{binding.avatarId}}"].join("、");

const loadScenePacks = async () => {
    scenePackRecords.value = await DigitalHumanScenePackService.list();
};

const doActivateScenePack = async (scenePackId: number) => {
    const nextId = Number(scenePackId || 0);
    if (!nextId) {
        liveStore.resetScenePackRuntime();
        await liveStore.saveLocalConfig();
        return;
    }
    const ok = await liveStore.activateScenePack(nextId);
    if (ok) {
        Dialog.tipSuccess("已切换直播编排方案");
    }
};

const doPlaySceneClip = async (type: "welcome" | "talk" | "product" | "transition") => {
    await liveStore.playScenePackClipType(type);
};

const doReturnIdle = async () => {
    await liveStore.returnToIdleClip();
};

const ensureLocalEngineReady = () => {
    if (liveStore.localConfig.config.engineMode !== "local") {
        return true;
    }
    if (!liveStore.server) {
        Dialog.tipError("本地渲染不可用：未找到直播服务引擎，请先在服务管理中安装并启动带 live 能力的本地服务");
        return false;
    }
    if (liveStore.server.status !== EnumServerStatus.RUNNING) {
        Dialog.tipError("本地渲染不可用：直播服务未运行，请先到服务管理启动本地直播引擎");
        return false;
    }
    if (!liveStore.server.functions?.includes("live")) {
        Dialog.tipError("本地渲染不可用：当前服务不支持 live 能力，请切换为支持直播的服务");
        return false;
    }
    return true;
};

// 视频预览控制
const previewVolume = ref(50);
const previewMuted = ref(true);
const videoRef = ref<HTMLVideoElement | null>(null);

const onVolumeChange = (val: number) => {
    if (videoRef.value) {
        videoRef.value.volume = val / 100;
        previewMuted.value = val === 0;
    }
};

const toggleMute = () => {
    previewMuted.value = !previewMuted.value;
    if (videoRef.value) {
        videoRef.value.muted = previewMuted.value;
        if (!previewMuted.value && previewVolume.value === 0) {
            previewVolume.value = 50;
            videoRef.value.volume = 0.5;
        }
    }
};

// Actions
const doStart = async () => {
    const isCloudMode = liveStore.localConfig.config.engineMode === 'cloud';
    if (isCloudMode) {
        Dialog.tipSuccess(isCloudApiConfigured.value ? "正在连接云端数字人渲染引擎..." : "未配置云端 API，正在启动本地模拟推流...");
        liveStore.status = "starting";
        liveStore.statusMsg = "";
        try {
            const result = await liveStore.startCloudStream();
            if (result?.ignored) {
                return;
            }
            if (!result.ok) {
                liveStore.statusMsg = result.msg || "推流启动失败";
                Dialog.tipError(liveStore.statusMsg);
                liveStore.status = "error";
                return;
            }
            if (result.fallback) {
                Dialog.tipError("当前未连接到云端接口，已进入本地模拟推流，不会触发远端数字人开播请求");
            }
            if (result.recovered) {
                Dialog.tipSuccess("云端开播已自动恢复，推流继续中");
            }
            if (result.autoDetected && result.apiBaseUrl) {
                Dialog.tipSuccess("已自动连接本地直播引擎: " + result.apiBaseUrl);
            }
            liveStore.status = "running";
            await liveStore.queryCloudStreamStatus();
            await liveStore.syncScenePackExecution({
                silent: true,
            });
        } catch (e: any) {
            liveStore.statusMsg = "推流启动失败: " + (e.message || e);
            Dialog.tipError(liveStore.statusMsg);
            liveStore.status = "error";
        }
        return;
    }
    if (!liveStore.localConfig.config.liveMonitorUrl) {
        Dialog.tipError("请先配置直播间抓取地址");
        return;
    }
    if (liveStore.localConfig.config.streamMode === 'rtmp' && (!liveStore.localConfig.config.rtmpUrl || !liveStore.localConfig.config.rtmpKey)) {
        Dialog.tipError("请先配置 RTMP 推流地址和推流码");
        return;
    }

    if (!ensureLocalEngineReady()) {
        return;
    }
    const dependencyCheck = await liveStore.validateLocalStartDependencies();
    if (!dependencyCheck.ok) {
        Dialog.tipError(dependencyCheck.msg);
        return;
    }
    await liveStore.start();
};

const doStop = async () => {
    if (isStarting.value) {
        Dialog.tipSuccess("正在启动中，请稍候后再停止");
        return;
    }
    if (liveStore.localConfig.config.engineMode === 'cloud') {
        liveStore.status = "stopping";
        liveStore.statusMsg = "";
        try {
            const result = await liveStore.stopCloudStream();
            if (!result.ok) {
                Dialog.tipError(result.msg || "推流停止失败");
            }
            liveStore.status = "stopped";
            await liveStore.queryCloudStreamStatus();
        } catch (e: any) {
            console.error(e);
            liveStore.status = "stopped";
        }
        return;
    }
    if (!liveStore.server) {
        liveStore.status = "stopped";
        return;
    }
    await liveStore.stop();
};

const doSaveSettings = async () => {
    await liveStore.saveLocalConfig();
    Dialog.tipSuccess("设置已保存");
};

const doOpenMonitor = async () => {
    await liveStore.startMonitor();
};

const manualReplyText = ref("");
const doManualReply = () => {
    if (!manualReplyText.value.trim()) return;
    try {
        const textToSend = manualReplyText.value;
        
        // 记录到发送历史，防止回声
        liveStore.recentSentMessages.push({ text: textToSend, time: Date.now() });
        if (liveStore.recentSentMessages.length > 20) liveStore.recentSentMessages.shift();

        window.$mapi.event.callPage("monitor", "MonitorData", {
            type: "SendMessage",
            data: {
                platform: liveStore.localConfig.config.liveMonitorType,
                text: textToSend
            }
        }).then(() => {
            // Also add it to recentEvents to show it in the list
            liveStore.recentEvents.push({
                id: Date.now() + Math.random().toString(),
                time: new Date(),
                type: 'AI_Reply',
                username: '手动发送',
                content: textToSend
            });
            if (liveStore.recentEvents.length > 50) {
                liveStore.recentEvents.shift();
            }
            manualReplyText.value = "";
        }).catch(err => {
            Dialog.tipError("发送失败, 请确认是否已开启弹幕监听窗口");
            console.log("手动发送失败:", err);
        });
    } catch (e) {
        console.error(e);
    }
};

onMounted(async () => {
    await liveStore.init();
    await loadScenePacks();
});

onUnmounted(() => {
    // Cleanup if needed
});
</script>

<template>
    <div class="h-full overflow-y-auto px-5 py-5">
        <div class="mx-auto flex max-w-[1680px] flex-col gap-4">
            <div class="rounded-[24px] border border-slate-200 bg-white px-6 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div class="text-[32px] font-semibold leading-none text-slate-900">直播控制台</div>
                        <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            <span class="rounded-full bg-slate-100 px-3 py-1">{{ engineModeLabel }}</span>
                            <span class="rounded-full bg-slate-100 px-3 py-1">{{ streamModeLabel }}</span>
                            <span class="rounded-full bg-slate-100 px-3 py-1">
                                {{ isSettingsVisible ? "当前查看配置面板" : "当前查看弹幕面板" }}
                            </span>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="px-3 py-1 rounded-full text-sm font-bold flex items-center" :class="statusColor">
                            <span class="w-2 h-2 rounded-full mr-2" :class="isRunning ? 'bg-green-500 animate-pulse' : (isStopped ? 'bg-gray-400' : 'bg-current')"></span>
                            {{ statusText }}
                        </div>
                        <a-button type="primary" status="success" v-if="isStopped || liveStore.status === 'error'" @click="doStart" :loading="isStarting">
                            <template #icon><icon-play-circle /></template>
                            开始直播
                        </a-button>
                        <a-button type="primary" status="danger" v-else-if="isRunning || isStarting" @click="doStop" :disabled="isStarting" :loading="isStarting">
                            <template #icon><icon-stop /></template>
                            {{ isStarting ? "启动中..." : "停止直播" }}
                        </a-button>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
                <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <div class="text-xs text-slate-500">当前播报</div>
                    <div class="mt-2 truncate text-base font-semibold text-blue-600" :title="currentPreviewTitle">
                        {{ currentPreviewTitle }}
                    </div>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <div class="text-xs text-slate-500">视频生成 FPS</div>
                    <div class="mt-2 text-2xl font-semibold text-slate-900">{{ liveStore.liveStatus.runtime.avatarVideoFps || 0 }}</div>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <div class="text-xs text-slate-500">推流状态</div>
                    <div class="mt-2 text-sm font-semibold" :class="streamTransportOk ? 'text-green-600' : 'text-slate-400'">
                        {{ streamTransportText }}
                    </div>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <div class="text-xs text-slate-500">排队任务数</div>
                    <div class="mt-2 text-2xl font-semibold text-slate-900">{{ liveStore.replyQueue.length }}</div>
                </div>
            </div>

            <div class="grid grid-cols-[minmax(0,1fr)_340px] gap-4 max-[1400px]:grid-cols-1">
                <div class="flex min-h-0 flex-col gap-4">
                    <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <div class="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div class="text-sm font-semibold text-slate-900">预览画面</div>
                                <div class="mt-1 text-xs text-slate-500">
                                    优先显示真实直播预览；没有预览流时，回退显示当前编排片段。
                                </div>
                            </div>
                            <div v-if="showScenePackPreview" class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                                编排预演：{{ currentSceneRuntime.currentClipTitle || "待机片" }}
                            </div>
                        </div>
                        <div class="bg-black rounded-[20px] relative overflow-hidden flex items-center justify-center border border-slate-200 shadow-sm min-h-[420px]">
                    <div v-if="!isRunning" class="text-gray-500 flex flex-col items-center z-10">
                        <icon-video-camera class="text-6xl mb-4 opacity-50" />
                        <span class="text-lg">等待开播...</span>
                        <span v-if="liveStore.statusMsg" class="text-red-500 mt-2 text-sm">{{ liveStore.statusMsg }}</span>
                    </div>
                    
                    <XfyunSdkPreview
                        v-if="isRunning && useCloudSdkPreview"
                        class="z-10"
                        :active="isRunning && useCloudSdkPreview"
                        :script-url="liveStore.localConfig.config.cloudSdkScriptUrl"
                        :global-name="liveStore.localConfig.config.cloudSdkGlobalName"
                        :app-id="liveStore.localConfig.config.cloudSdkAppId"
                        :api-key="liveStore.localConfig.config.cloudSdkApiKey"
                        :api-secret="liveStore.localConfig.config.cloudSdkApiSecret"
                        :scene-id="liveStore.localConfig.config.cloudSdkSceneId"
                        :use-inline-player="liveStore.localConfig.config.cloudSdkUseInlinePlayer"
                        :global-params="liveStore.localConfig.config.cloudSdkGlobalParams"
                        :muted="previewMuted"
                        :volume="previewVolume"
                    />

                    <!-- 云端模式优先使用真实预览流地址 -->
                    <video 
                        ref="videoRef"
                        v-else-if="isRunning && liveStore.localConfig.config.engineMode === 'cloud' && cloudPreviewUrl" 
                        class="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
                        :class="{'opacity-30 blur-sm': liveStore.isSpeaking}"
                        :src="cloudPreviewUrl"
                        autoplay 
                        loop 
                        :muted="previewMuted"
                        :volume="previewVolume / 100">
                    </video>

                    <!-- 本地模式且为RTMP推流时的视频流 (HLS 播放器) -->
                    <VideoPlayer
                        v-if="isRunning && liveStore.localConfig.config.engineMode === 'local' && liveStore.localConfig.config.streamMode === 'rtmp' && liveStore.liveStatus.videoHls"
                        :url="liveStore.liveStatus.videoHls"
                        :autoplay="true"
                        :autoplayMuted="previewMuted"
                        :controls="false"
                        class="absolute inset-0 w-full h-full object-contain z-10"
                    />

                    <div
                        v-else-if="showScenePackPreview && previewFallbackType === 'video'"
                        class="absolute inset-0 w-full h-full z-10"
                    >
                        <VideoPlayer
                            :url="currentSceneRuntime.currentClipVideo"
                            :autoplay="true"
                            :loop="currentSceneRuntime.currentClipType === 'idle'"
                            :controls="true"
                            class="absolute inset-0 w-full h-full object-contain"
                        />
                    </div>
                    <div
                        v-else-if="showScenePackPreview && previewFallbackType === 'audio'"
                        class="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-black/80 px-8"
                    >
                        <div class="text-white text-lg font-semibold">
                            当前片段：{{ currentSceneRuntime.currentClipTitle || "音频片段" }}
                        </div>
                        <div class="w-full max-w-xl rounded-2xl bg-white p-3">
                            <AudioPlayer :url="currentSceneRuntime.currentClipAudio" show-wave compact />
                        </div>
                    </div>
                    <div
                        v-else-if="showScenePackPreview && previewFallbackType === 'image'"
                        class="absolute inset-0 z-10 flex items-center justify-center bg-black/60"
                    >
                        <img :src="currentSceneRuntime.currentClipCoverImage" class="max-h-full max-w-full object-contain" />
                    </div>

                    <div
                        v-if="isRunning && liveStore.localConfig.config.engineMode === 'cloud' && !useCloudSdkPreview && !cloudPreviewUrl"
                        class="absolute inset-0 flex flex-col items-center justify-center z-10 text-gray-300"
                    >
                        <icon-video-camera class="text-6xl mb-4 opacity-70" />
                        <div class="text-lg font-medium">云端渲染中</div>
                        <div class="text-sm opacity-80 mt-1 px-6 text-center">{{ cloudPreviewHint }}</div>
                        <div class="text-xs opacity-60 mt-2 px-6 text-center break-all" v-if="cloudRawPreviewUrl">
                            预览源: {{ cloudRawPreviewUrl }}
                        </div>
                    </div>

                    <!-- 模拟打断状态：当为云端/虚拟摄像头模式且 isSpeaking 为 true 时，覆盖显示口型驱动中的画面 -->
                    <div v-if="isRunning && liveStore.isSpeaking && liveStore.localConfig.config.engineMode === 'cloud'" class="absolute inset-0 flex flex-col items-center justify-center z-15 bg-black bg-opacity-60 text-white transition-all duration-300">
                        <div class="relative w-48 h-48 rounded-full overflow-hidden border-4 border-green-400 animate-pulse mb-4 shadow-xl">
                            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Felix" class="w-full h-full object-cover bg-gray-800" />
                        </div>
                        <div class="text-xl font-bold bg-black bg-opacity-60 px-4 py-2 rounded-full flex items-center gap-2">
                            <icon-sound-fill class="animate-bounce text-green-400" />
                            【互动模式】正在回答弹幕...
                        </div>
                        <div class="mt-2 text-sm text-gray-200">
                            正在调用 {{ liveStore.localConfig.model }} 进行实时口型合成
                        </div>
                    </div>

                    <!-- 正常带货状态指示 -->
                    <div v-if="isRunning && !liveStore.isSpeaking" class="absolute top-4 left-4 bg-blue-500 bg-opacity-80 text-white px-3 py-1.5 rounded-lg text-sm font-bold z-20 flex items-center shadow transition-all duration-300">
                        <icon-play-arrow class="mr-1" />
                        【带货模式】循环发呆/商品展示中...
                    </div>

                    <!-- 预览控制条 -->
                    <div v-if="hasPreviewVideo" class="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20 bg-black bg-opacity-50 px-4 py-2 rounded-lg opacity-0 hover:opacity-100 transition-opacity">
                        <div class="flex items-center space-x-3 text-white">
                            <a-button type="text" class="text-white hover:text-blue-400" @click="toggleMute">
                                <template #icon>
                                    <icon-sound-fill v-if="!previewMuted" />
                                    <icon-mute-fill v-else />
                                </template>
                            </a-button>
                            <div class="w-32">
                                <a-slider v-model="previewVolume" @change="onVolumeChange" :min="0" :max="100" />
                            </div>
                        </div>
                        <div class="text-white text-xs opacity-70">
                            仅控制本地预览音量，不影响实际推流
                        </div>
                    </div>

                    <div v-if="isRunning" class="absolute top-4 right-4 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold animate-pulse z-20 pointer-events-none">
                        LIVE
                    </div>
                        </div>
                    </div>

                    <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div class="text-sm font-semibold text-slate-900">数字人直播编排执行</div>
                                <div class="mt-1 text-xs text-slate-500">
                                    选择编排方案后，可手动切到欢迎片、讲解片、商品片，并按规则自动回到待机片。
                                </div>
                            </div>
                            <a-button size="small" @click="loadScenePacks">
                                <template #icon><icon-refresh /></template>
                                刷新方案
                            </a-button>
                        </div>
                        <div class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
                            <div class="rounded-2xl bg-slate-50 px-4 py-4">
                                <div class="text-xs text-slate-500 mb-2">编排方案</div>
                                <a-select v-model="selectedScenePackId" placeholder="请选择编排方案" @change="doActivateScenePack">
                                    <a-option :value="0">不使用编排方案</a-option>
                                    <a-option v-for="item in scenePackRecords" :key="item.id" :value="item.id || 0">
                                        {{ item.title }}
                                    </a-option>
                                </a-select>
                                <div class="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
                                    <div class="break-all">当前方案：{{ currentSceneRuntime.selectedScenePackTitle || "-" }}</div>
                                    <div class="break-all">当前身份：{{ currentSceneRuntime.identityTitle || "-" }}</div>
                                    <div class="break-all">执行配置：{{ currentSceneRuntime.executionConfigTitle || "-" }}</div>
                                    <div class="break-all">默认待机片：{{ currentSceneRuntime.idleClipTitle || "-" }}</div>
                                </div>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                <div class="text-xs text-slate-500 mb-2">片段切换</div>
                                <div class="flex flex-wrap gap-2">
                                    <a-button size="small" type="outline" :disabled="!currentSceneRuntime.selectedScenePackId" @click="doPlaySceneClip('welcome')">欢迎片</a-button>
                                    <a-button size="small" type="outline" :disabled="!currentSceneRuntime.selectedScenePackId" @click="doPlaySceneClip('talk')">讲解片</a-button>
                                    <a-button size="small" type="outline" :disabled="!currentSceneRuntime.selectedScenePackId" @click="doPlaySceneClip('product')">商品片</a-button>
                                    <a-button size="small" type="outline" :disabled="!currentSceneRuntime.selectedScenePackId" @click="doPlaySceneClip('transition')">过渡片</a-button>
                                    <a-button size="small" status="success" :disabled="!currentSceneRuntime.idleClipId" @click="doReturnIdle">回待机</a-button>
                                </div>
                                <div class="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500 max-[720px]:grid-cols-1">
                                    <div class="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                        <div>当前片段：{{ currentSceneRuntime.currentClipTitle || "-" }}</div>
                                        <div class="mt-1">片段类型：{{ currentSceneRuntime.currentClipType || "-" }}</div>
                                    </div>
                                    <div class="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                        <div>自动回待机：{{ currentSceneRuntime.autoReturnToIdle ? "开启" : "关闭" }}</div>
                                        <div class="mt-1">回待机 {{ currentSceneRuntime.idlePaddingMs }}ms / 讲解 {{ currentSceneRuntime.talkPaddingMs }}ms</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex min-h-0 flex-col gap-4">
                    <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <div class="text-sm font-semibold text-slate-900">运行概览</div>
                        <div class="mt-4 space-y-3">
                            <div class="rounded-2xl bg-slate-50 px-4 py-4">
                                <div class="text-xs text-slate-500">当前状态</div>
                                <div class="mt-2 text-base font-semibold text-slate-900">{{ statusText }}</div>
                            </div>
                            <div class="rounded-2xl bg-slate-50 px-4 py-4">
                                <div class="text-xs text-slate-500">直播模式</div>
                                <div class="mt-2 text-base font-semibold text-slate-900">{{ engineModeLabel }}</div>
                            </div>
                            <div class="rounded-2xl bg-slate-50 px-4 py-4">
                                <div class="text-xs text-slate-500">推流方式</div>
                                <div class="mt-2 text-base font-semibold text-slate-900">{{ streamModeLabel }}</div>
                            </div>
                            <div class="rounded-2xl bg-slate-50 px-4 py-4">
                                <div class="text-xs text-slate-500">当前片段</div>
                                <div class="mt-2 break-all text-sm font-semibold text-slate-900">
                                    {{ currentSceneRuntime.currentClipTitle || currentSceneRuntime.idleClipTitle || "未选择" }}
                                </div>
                            </div>
                            <div class="rounded-2xl bg-slate-50 px-4 py-4">
                                <div class="text-xs text-slate-500">执行配置</div>
                                <div class="mt-2 break-all text-sm font-semibold text-slate-900">
                                    {{ currentSceneRuntime.executionConfigTitle || "未绑定，仍走下方兼容配置" }}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="rounded-[24px] border border-amber-200 bg-amber-50 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <div class="text-sm font-semibold text-slate-900">模式说明</div>
                        <div class="mt-3 space-y-3 text-sm text-slate-600">
                            <div class="rounded-2xl bg-white/80 px-4 py-3">
                                <div class="font-semibold text-slate-900">云端模式</div>
                                <div class="mt-1">
                                    不需要你本地部署数字人服务，应用直接请求 `RunningHub / Heygem / 自定义云端接口`。
                                </div>
                            </div>
                            <div class="rounded-2xl bg-white/80 px-4 py-3">
                                <div class="font-semibold text-slate-900">本地模式</div>
                                <div class="mt-1">
                                    也是调接口，但调的是你电脑上的本地直播引擎接口；如果本机没有运行 `live` 服务，这个模式就不能用。
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <div class="text-sm font-semibold text-slate-900">配置与弹幕</div>
                        <div class="mt-1 text-xs text-slate-500">
                            这里改成整行工作区，避免与右侧全局任务栏叠加后把表单和弹幕压成竖排。
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a-button :type="isSettingsVisible ? 'primary' : 'outline'" size="small" @click="isSettingsVisible = true">配置参数</a-button>
                        <a-button :type="!isSettingsVisible ? 'primary' : 'outline'" size="small" @click="isSettingsVisible = false">查看弹幕</a-button>
                    </div>
                </div>

                <div v-if="isSettingsVisible" class="mt-4 max-h-[720px] overflow-y-auto pr-2 custom-scrollbar">
                    <a-form :model="liveStore.localConfig.config" layout="vertical">
                        <div class="grid grid-cols-2 gap-4 max-[1120px]:grid-cols-1">
                            <div class="rounded-2xl bg-slate-50 p-4">
                                <div class="font-bold text-gray-700 mb-3">核心渲染引擎</div>
                                <a-form-item label="数字人渲染模式">
                                    <a-radio-group v-model="liveStore.localConfig.config.engineMode" type="button">
                                        <a-radio value="cloud">
                                            云端渲染 (推荐)
                                        </a-radio>
                                        <a-radio value="local">
                                            本地引擎渲染
                                        </a-radio>
                                    </a-radio-group>
                                    <template #extra>
                                        <div class="text-xs text-gray-400 mt-1">
                                            {{ liveStore.localConfig.config.engineMode === 'cloud' ? '通过云端接口发起开播、播报和状态查询，不依赖本机显卡。' : '通过本机运行的直播引擎接口渲染与推流，不等于第三方云 API。' }}
                                        </div>
                                    </template>
                                </a-form-item>

                                <div
                                    class="mb-4 rounded-2xl border px-4 py-3 text-sm"
                                    :class="liveStore.localConfig.config.engineMode === 'cloud' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-orange-200 bg-orange-50 text-orange-700'"
                                >
                                    <div class="font-semibold text-slate-900">
                                        {{ liveStore.localConfig.config.engineMode === 'cloud' ? '当前选择云端模式' : '当前选择本地模式' }}
                                    </div>
                                    <div class="mt-1">
                                        {{ liveStore.localConfig.config.engineMode === 'cloud'
                                            ? '适合你这种没有本地部署的情况，应用会直接请求云端数字人服务。'
                                            : '需要你本机先启动支持 live 能力的 AI_Live_Server，本页才会真正可用。' }}
                                    </div>
                                </div>

                                <div v-if="liveStore.localConfig.config.engineMode === 'cloud' && currentSceneRuntime.executionConfigId" class="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                    <div class="font-semibold text-slate-900">已绑定直播执行配置</div>
                                    <div class="mt-1">
                                        当前编排将优先复用 `{{ currentSceneRuntime.executionConfigTitle || '已选执行配置' }}`` 中绑定的云端模板；下方 RH / 云接口参数仅作为兼容兜底。
                                    </div>
                                </div>

                                <div v-if="liveStore.localConfig.config.engineMode === 'cloud'">
                                    <a-form-item label="云端供应商">
                                        <a-select v-model="liveStore.localConfig.config.cloudProvider">
                                            <a-option v-for="provider in liveCloudProviders" :key="provider.value" :value="provider.value">
                                                {{ provider.title }}
                                            </a-option>
                                        </a-select>
                                    </a-form-item>

                                    <template v-if="isRunningHubProvider">
                                        <a-form-item label="RunningHub Base URL">
                                            <a-input v-model="liveStore.localConfig.config.runningHubBaseUrl" placeholder="默认: https://www.runninghub.ai" />
                                        </a-form-item>
                                        <a-form-item label="RunningHub API Key">
                                            <a-input-password v-model="liveStore.localConfig.config.runningHubApiKey" placeholder="RunningHub 控制台 API Key" />
                                        </a-form-item>
                                        <a-form-item label="RunningHub WebApp ID">
                                            <a-input v-model="liveStore.localConfig.config.runningHubWebappId" placeholder="AI App 的 webappId" />
                                        </a-form-item>
                                        <a-form-item label="RunningHub 节点参数(JSON 模板)">
                                            <a-textarea
                                                v-model="liveStore.localConfig.config.runningHubNodeInfoListJson"
                                                :auto-size="{ minRows: 5, maxRows: 12 }"
                                                :placeholder="runningHubNodeTemplatePlaceholder"
                                            />
                                            <template #extra>
                                                <div class="text-xs text-gray-400 mt-1">
                                                    RH 的 AI App / Workflow 仍建议配置一次节点模板，但现在支持引用 `clip`、`identity`、`binding` 变量自动映射当前编排片段。
                                                </div>
                                            </template>
                                        </a-form-item>
                                        <a-form-item label="RunningHub Webhook URL">
                                            <a-input v-model="liveStore.localConfig.config.runningHubWebhookUrl" placeholder="可选：任务完成回调地址" />
                                        </a-form-item>
                                        <a-form-item label="RunningHub 机器规格">
                                            <a-select v-model="liveStore.localConfig.config.runningHubInstanceType">
                                                <a-option value="default">default (24GB)</a-option>
                                                <a-option value="plus">plus (48GB)</a-option>
                                            </a-select>
                                        </a-form-item>
                                    </template>

                                    <template v-else>
                                        <a-form-item label="云端 API 地址">
                                            <a-input v-model="liveStore.localConfig.config.cloudApiBaseUrl" placeholder="例如: https://api.example.com/live" />
                                        </a-form-item>
                                        <a-form-item label="云端 API Key">
                                            <a-input-password v-model="liveStore.localConfig.config.cloudApiKey" placeholder="可选：Bearer Token" />
                                        </a-form-item>
                                        <a-form-item label="云端场景ID">
                                            <a-input v-model="liveStore.localConfig.config.cloudSceneId" placeholder="默认: default" />
                                        </a-form-item>
                                        <a-form-item label="开播接口路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudStartPath" placeholder="默认: scene/start" />
                                        </a-form-item>
                                        <a-form-item label="停播接口路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudStopPath" placeholder="默认: scene/stop" />
                                        </a-form-item>
                                        <a-form-item label="状态接口路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudStatusPath" placeholder="默认: scene/status" />
                                        </a-form-item>
                                        <a-form-item label="状态接口回退路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudStatusFallbackPath" placeholder="默认: status" />
                                        </a-form-item>
                                        <a-form-item label="播报接口路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudTalkPath" placeholder="默认: scene/talk" />
                                        </a-form-item>
                                        <a-form-item label="片段执行接口路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudClipPath" placeholder="默认: scene/clip" />
                                        </a-form-item>
                                        <a-form-item label="片段执行请求(JSON 模板)">
                                            <a-textarea
                                                v-model="liveStore.localConfig.config.cloudClipRequestJson"
                                                :auto-size="{ minRows: 5, maxRows: 12 }"
                                                :placeholder="cloudClipRequestTemplatePlaceholder"
                                            />
                                            <template #extra>
                                                <div class="text-xs text-gray-400 mt-1">
                                                    给 HeyGem / 自定义云接口使用。支持 {{ cloudClipTemplateExamples }} 等变量。
                                                </div>
                                            </template>
                                        </a-form-item>
                                        <a-form-item label="预览地址字段路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudPreviewFieldPath" placeholder="可选，支持 a.b.c 或 a|b|c" />
                                        </a-form-item>
                                        <a-form-item label="状态字段路径">
                                            <a-input v-model="liveStore.localConfig.config.cloudStatusFieldPath" placeholder="可选，支持 a.b.c 或 a|b|c" />
                                        </a-form-item>
                                        <a-form-item label="启用浏览器 SDK 预览">
                                            <a-switch v-model="liveStore.localConfig.config.cloudSdkEnabled" />
                                        </a-form-item>
                                        <template v-if="liveStore.localConfig.config.cloudSdkEnabled">
                                            <a-form-item label="SDK 脚本地址">
                                                <a-input v-model="liveStore.localConfig.config.cloudSdkScriptUrl" placeholder="例如: http://127.0.0.1:8000/avatar-sdk-web.js" />
                                            </a-form-item>
                                            <a-form-item label="SDK 全局对象名">
                                                <a-input v-model="liveStore.localConfig.config.cloudSdkGlobalName" placeholder="默认: AvatarPlatform" />
                                            </a-form-item>
                                            <a-form-item label="SDK AppId">
                                                <a-input v-model="liveStore.localConfig.config.cloudSdkAppId" placeholder="供应商 SDK AppId" />
                                            </a-form-item>
                                            <a-form-item label="SDK ApiKey">
                                                <a-input v-model="liveStore.localConfig.config.cloudSdkApiKey" placeholder="供应商 SDK ApiKey" />
                                            </a-form-item>
                                            <a-form-item label="SDK ApiSecret">
                                                <a-input-password v-model="liveStore.localConfig.config.cloudSdkApiSecret" placeholder="供应商 SDK ApiSecret" />
                                            </a-form-item>
                                            <a-form-item label="SDK SceneId">
                                                <a-input v-model="liveStore.localConfig.config.cloudSdkSceneId" placeholder="供应商场景/服务 ID" />
                                            </a-form-item>
                                            <a-form-item label="内置播放器">
                                                <a-switch v-model="liveStore.localConfig.config.cloudSdkUseInlinePlayer" />
                                            </a-form-item>
                                            <a-form-item label="SDK 全局参数(JSON)">
                                                <a-textarea
                                                    v-model="liveStore.localConfig.config.cloudSdkGlobalParams"
                                                    :auto-size="{ minRows: 4, maxRows: 10 }"
                                                    placeholder='例如: {"avatarId":"xxx","vcn":"voice_xxx"}'
                                                />
                                            </a-form-item>
                                        </template>
                                    </template>
                                </div>

                                <a-form-item label="口型驱动模型">
                                    <a-select v-model="liveStore.localConfig.model" placeholder="请选择口型驱动模型">
                                        <a-option v-for="m in liveModels" :key="m.value" :value="m.value">
                                            {{ m.title }}
                                        </a-option>
                                    </a-select>
                                </a-form-item>
                            </div>

                            <div class="rounded-2xl bg-slate-50 p-4">
                                <div class="font-bold text-gray-700 mb-3">推流与话术配置</div>
                                <a-form-item label="推流模式">
                                    <a-radio-group v-model="liveStore.localConfig.config.streamMode" type="button">
                                        <a-radio value="rtmp">RTMP 直播平台推流</a-radio>
                                        <a-radio value="virtualCam">本地直播伴侣/OBS接入</a-radio>
                                    </a-radio-group>
                                    <template #extra>
                                        <div class="text-xs text-gray-400 mt-1">
                                            {{ liveStore.localConfig.config.streamMode === 'virtualCam' ? '在直播伴侣/OBS 中添加媒体源，地址填 udp://127.0.0.1:12345 即可。' : '直接推送到第三方平台的 RTMP 地址。' }}
                                        </div>
                                    </template>
                                </a-form-item>
                                <div v-if="liveStore.localConfig.config.streamMode !== 'virtualCam'">
                                    <a-form-item label="RTMP 推流服务器地址" required>
                                        <a-input v-model="liveStore.localConfig.config.rtmpUrl" placeholder="例如: rtmp://192.168.110.238:1935" />
                                    </a-form-item>
                                    <a-form-item label="推流码 (串流密钥)" required>
                                        <a-input v-model="liveStore.localConfig.config.rtmpKey" placeholder="例如: livehime" />
                                    </a-form-item>
                                </div>
                                <a-form-item label="直播间地址 (用于抓取弹幕)">
                                    <a-input v-model="liveStore.localConfig.config.liveMonitorUrl" placeholder="例如抖音/B站的网页直播间链接" />
                                </a-form-item>
                                <a-form-item label="弹幕抓取平台">
                                    <a-select v-model="liveStore.localConfig.config.liveMonitorType">
                                        <a-option value="douyin">抖音 (Douyin)</a-option>
                                        <a-option value="bilibili">哔哩哔哩 (Bilibili)</a-option>
                                        <a-option value="kuaishou">快手 (Kuaishou)</a-option>
                                    </a-select>
                                </a-form-item>
                                <a-form-item label="AI 回复方式">
                                    <a-select v-model="liveStore.localConfig.config.replyMode">
                                        <a-option value="voice">仅语音播报</a-option>
                                        <a-option value="text">仅打字回复 (公屏)</a-option>
                                        <a-option value="both">语音和打字</a-option>
                                        <a-option value="random">随机 (50%打字 / 50%语音)</a-option>
                                    </a-select>
                                </a-form-item>
                                <a-form-item label="礼物/点赞感谢模式">
                                    <a-select v-model="liveStore.localConfig.config.thanksMode">
                                        <a-option value="local">本地极速话术库 (推荐, 响应快)</a-option>
                                        <a-option value="llm">AI大模型生成 (文案丰富, 有延迟)</a-option>
                                    </a-select>
                                </a-form-item>
                                <a-form-item label="循环话术模式">
                                    <a-radio-group v-model="liveStore.localConfig.config.flowTalkMode" type="button">
                                        <a-radio value="order">顺序播放</a-radio>
                                        <a-radio value="random">随机播放</a-radio>
                                    </a-radio-group>
                                </a-form-item>
                                <div class="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
                                    <a-form-item label="话术间隔(最小秒)">
                                        <a-input-number v-model="liveStore.localConfig.config.flowTalkDelayMin" :min="1" style="width: 100%" />
                                    </a-form-item>
                                    <a-form-item label="话术间隔(最大秒)">
                                        <a-input-number v-model="liveStore.localConfig.config.flowTalkDelayMax" :min="1" style="width: 100%" />
                                    </a-form-item>
                                </div>
                                <div class="mt-4 pt-4 border-t border-gray-200 flex gap-2">
                                    <a-button type="primary" @click="doSaveSettings" class="flex-1">保存设置</a-button>
                                    <a-button @click="doOpenMonitor" class="flex-1">测试弹幕抓取</a-button>
                                </div>
                            </div>
                        </div>
                    </a-form>
                </div>

                <div v-else class="mt-4 flex min-h-[480px] flex-col overflow-hidden">
                    <div class="flex-grow bg-gray-50 rounded-2xl p-3 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                        <div class="text-center text-gray-400 text-xs py-4" v-if="!isRunning && liveStore.recentEvents.length === 0">
                            直播未开启，暂无弹幕数据
                        </div>
                        <div class="text-center text-gray-400 text-xs py-4" v-else-if="liveStore.recentEvents.length === 0">
                            等待弹幕接入...
                        </div>
                        <div v-for="event in liveStore.recentEvents" :key="event.id" class="bg-white p-3 rounded-xl shadow-sm text-sm break-words">
                            <span class="text-gray-400 text-xs mr-1">[{{ new Date(event.time).toLocaleTimeString() }}]</span>
                            <template v-if="event.type === 'Enter'">
                                <span class="text-gray-500">欢迎 <span class="text-blue-500 font-bold">{{ event.username }}</span> 进入直播间</span>
                            </template>
                            <template v-else-if="event.type === 'Like'">
                                <span class="text-pink-500 font-bold">{{ event.username }}</span> <span class="text-gray-500">点赞了直播间</span>
                            </template>
                            <template v-else-if="event.type === 'Gift'">
                                <span class="text-orange-500 font-bold">{{ event.username }}</span> <span class="text-gray-500">送出了 🎁 {{ event.content || '礼物' }}</span>
                            </template>
                            <template v-else-if="event.type === 'Comment'">
                                <span class="text-blue-500 font-bold">{{ event.username }}:</span> <span class="text-gray-800">{{ event.content }}</span>
                            </template>
                            <template v-else-if="event.type === 'AI_Reply'">
                                <span class="text-purple-500 font-bold">AI回复 {{ event.username }}:</span> <span class="text-gray-800 font-bold">{{ event.content }}</span>
                            </template>
                            <template v-else>
                                <span class="text-gray-500">{{ event.type }} - {{ JSON.stringify(event.data) }}</span>
                            </template>
                        </div>
                    </div>
                    <div class="mt-3 flex gap-2">
                        <a-input v-model="manualReplyText" placeholder="手动发送弹幕回复..." @keyup.enter="doManualReply" />
                        <a-button type="primary" @click="doManualReply" :disabled="!manualReplyText">发送</a-button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: #e5e7eb;
    border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #d1d5db;
}
</style>
