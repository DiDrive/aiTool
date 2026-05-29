<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {useLiveStore, liveModels, liveCloudProviders} from "../../store/modules/live";
import {Dialog} from "../../lib/dialog";
import {t} from "../../lang";
import VideoPlayer from "../../components/common/VideoPlayer.vue";
import XfyunSdkPreview from "../../components/live/XfyunSdkPreview.vue";
import {EnumServerStatus} from "../../types/Server";

const liveStore = useLiveStore();

// UI state
const isSettingsVisible = ref(true);

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
                Dialog.tipError(result.msg || "推流启动失败");
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
        } catch (e: any) {
            Dialog.tipError("推流启动失败: " + (e.message || e));
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
});

onUnmounted(() => {
    // Cleanup if needed
});
</script>

<template>
    <div class="p-5 h-full flex flex-col">
        <div class="mb-4 flex items-center">
            <div class="text-3xl font-bold flex-grow">直播控制台</div>
            <div class="flex items-center space-x-3">
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

        <div class="flex-grow flex gap-4 overflow-hidden">
            <!-- 左侧：画面预览与控制 -->
            <div class="w-2/3 flex flex-col gap-4">
                <!-- 视频预览区 -->
                <div class="bg-black rounded-xl flex-grow relative overflow-hidden flex items-center justify-center border border-gray-200 shadow-sm">
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

                <!-- 实时状态数据 -->
                <div class="bg-white rounded-xl shadow border p-4 grid grid-cols-4 gap-4 h-28 flex-shrink-0">
                    <div>
                        <div class="text-gray-500 text-xs mb-1">当前播报</div>
                        <div class="font-bold truncate text-blue-600" :title="liveStore.liveStatus.talkTitle || '无'">
                            {{ liveStore.liveStatus.talkTitle || "待机中..." }}
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 text-xs mb-1">视频生成 FPS</div>
                        <div class="font-bold text-xl">{{ liveStore.liveStatus.runtime.avatarVideoFps || 0 }}</div>
                    </div>
                    <div>
                        <div class="text-gray-500 text-xs mb-1">推流状态</div>
                        <div class="font-bold">
                            <span v-if="streamTransportOk" class="text-green-500">{{ streamTransportText }}</span>
                            <span v-else class="text-gray-400">{{ streamTransportText }}</span>
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 text-xs mb-1">排队任务数</div>
                        <div class="font-bold text-xl">{{ liveStore.replyQueue.length }}</div>
                    </div>
                </div>
            </div>

            <!-- 右侧：设置与弹幕 -->
            <div class="w-1/3 flex flex-col gap-4 bg-white rounded-xl shadow border p-4 overflow-hidden">
                <div class="flex items-center justify-between border-b pb-2 mb-2">
                    <div class="font-bold text-lg">弹幕监控与设置</div>
                    <a-button type="text" size="small" @click="isSettingsVisible = !isSettingsVisible">
                        <template #icon>
                            <icon-settings v-if="!isSettingsVisible"/>
                            <icon-message v-else/>
                        </template>
                        {{ isSettingsVisible ? '查看弹幕' : '配置参数' }}
                    </a-button>
                </div>

                <!-- 设置面板 -->
                <div v-if="isSettingsVisible" class="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                    <a-form :model="liveStore.localConfig.config" layout="vertical">
                        <div class="font-bold text-gray-700 mb-2 mt-2 bg-gray-50 p-2 rounded">核心渲染引擎</div>
                        <a-form-item label="数字人渲染模式">
                            <a-radio-group v-model="liveStore.localConfig.config.engineMode" type="button">
                                <a-radio value="cloud">
                                    云端渲染 (推荐)
                                </a-radio>
                                <a-radio value="local">
                                    本地显卡渲染
                                </a-radio>
                            </a-radio-group>
                            <template #extra>
                                <div class="text-xs text-gray-400 mt-1">
                                    {{ liveStore.localConfig.config.engineMode === 'cloud' ? '使用数智印象云端算力，不消耗本地显卡资源，适合轻薄本。' : '使用本机显卡进行口型合成与推流，需要至少 RTX 3060 以上独立显卡。' }}
                                </div>
                            </template>
                        </a-form-item>
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
                                <a-form-item label="RunningHub 节点参数(JSON)">
                                    <a-textarea
                                        v-model="liveStore.localConfig.config.runningHubNodeInfoListJson"
                                        :auto-size="{ minRows: 5, maxRows: 12 }"
                                        placeholder='例如: [{"nodeId":"122","fieldName":"prompt","fieldValue":"你的提示词"}]'
                                    />
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
                                <a-form-item label="RunningHub 接入说明">
                                    <div class="text-xs text-gray-500 leading-5">
                                        当前按 AI App 任务模式接入：支持启动任务、轮询状态和读取输出文件；实时播报接口暂未启用。
                                    </div>
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

                        <div class="font-bold text-gray-700 mb-2 mt-2 bg-gray-50 p-2 rounded">推流配置</div>
                        <a-form-item label="推流模式">
                            <a-radio-group v-model="liveStore.localConfig.config.streamMode" type="button">
                                <a-radio value="rtmp">RTMP 直播平台推流</a-radio>
                                <a-radio value="virtualCam">本地直播伴侣/OBS接入 (推荐)</a-radio>
                            </a-radio-group>
                            <template #extra>
                                <div class="text-xs text-gray-400 mt-1">
                                    {{ liveStore.localConfig.config.streamMode === 'virtualCam' ? '选择此模式后，在直播伴侣/OBS中添加【媒体源】，取消勾选本地文件，输入 udp://127.0.0.1:12345 即可获取画面。' : '直接将画面推送到第三方平台的推流地址。' }}
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

                        <div class="font-bold text-gray-700 mb-2 mt-4 bg-gray-50 p-2 rounded">话术策略</div>
                        <a-form-item label="循环话术模式">
                            <a-radio-group v-model="liveStore.localConfig.config.flowTalkMode" type="button">
                                <a-radio value="order">顺序播放</a-radio>
                                <a-radio value="random">随机播放</a-radio>
                            </a-radio-group>
                        </a-form-item>
                        <div class="flex gap-2">
                            <a-form-item label="话术间隔(最小秒)" class="flex-1">
                                <a-input-number v-model="liveStore.localConfig.config.flowTalkDelayMin" :min="1" />
                            </a-form-item>
                            <a-form-item label="话术间隔(最大秒)" class="flex-1">
                                <a-input-number v-model="liveStore.localConfig.config.flowTalkDelayMax" :min="1" />
                            </a-form-item>
                        </div>
                        
                        <div class="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                            <a-button type="primary" @click="doSaveSettings" class="flex-1">保存设置</a-button>
                            <a-button @click="doOpenMonitor" class="flex-1">测试弹幕抓取</a-button>
                        </div>
                    </a-form>
                </div>

                <!-- 弹幕面板 -->
                <div v-else class="flex-grow flex flex-col overflow-hidden">
                    <div class="flex-grow bg-gray-50 rounded p-2 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                        <!-- 弹幕列表占位 -->
                        <div class="text-center text-gray-400 text-xs py-4" v-if="!isRunning && liveStore.recentEvents.length === 0">
                            直播未开启，暂无弹幕数据
                        </div>
                        <div class="text-center text-gray-400 text-xs py-4" v-else-if="liveStore.recentEvents.length === 0">
                            等待弹幕接入...
                        </div>
                        
                        <!-- 真实弹幕列表渲染 -->
                        <div v-for="event in liveStore.recentEvents" :key="event.id" class="bg-white p-2 rounded shadow-sm text-sm break-words">
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
                                <span class="text-purple-500 font-bold">🤖 AI回复 {{ event.username }}:</span> <span class="text-gray-800 font-bold">{{ event.content }}</span>
                            </template>
                            
                            <template v-else>
                                <span class="text-gray-500">{{ event.type }} - {{ JSON.stringify(event.data) }}</span>
                            </template>
                        </div>
                    </div>
                    <div class="mt-2 flex gap-2">
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
