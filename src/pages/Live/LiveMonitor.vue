<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";
import {useLiveStore} from "../../store/modules/live";
import {Dialog} from "../../lib/dialog";
import {t} from "../../lang";

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
    if (!liveStore.localConfig.config.liveMonitorUrl) {
        Dialog.tipError("请先配置直播间抓取地址");
        return;
    }
    if (!liveStore.localConfig.config.rtmpUrl || !liveStore.localConfig.config.rtmpKey) {
        Dialog.tipError("请先配置 RTMP 推流地址和推流码");
        return;
    }
    
    if (liveStore.localConfig.config.engineMode === 'cloud') {
        Dialog.tipSuccess("正在连接云端数字人渲染引擎...");
        liveStore.status = "starting";
        
        // 触发本地 IPC 进行推流 (前端模拟云端下发流，本地 FFmpeg 负责转推)
        try {
            if (window.$mapi.app.callHandleFromMainOrRender) {
                await window.$mapi.app.callHandleFromMainOrRender("live:startMockStream", {
                    rtmpUrl: liveStore.localConfig.config.rtmpUrl,
                    rtmpKey: liveStore.localConfig.config.rtmpKey
                });
            } else if (window.ipcRenderer) {
                await window.ipcRenderer.invoke("live:startMockStream", {
                    rtmpUrl: liveStore.localConfig.config.rtmpUrl,
                    rtmpKey: liveStore.localConfig.config.rtmpKey
                });
            } else {
                await window.$mapi.event.callPage('main', 'live:startMockStream', {
                    rtmpUrl: liveStore.localConfig.config.rtmpUrl,
                    rtmpKey: liveStore.localConfig.config.rtmpKey
                });
            }
            liveStore.status = "running";
        } catch (e: any) {
            Dialog.tipError("推流启动失败: " + (e.message || e));
            liveStore.status = "error";
        }
        return;
    }

    // Check if server exists, bypass if not for local dev
    if (!liveStore.server && liveStore.localConfig.config.engineMode === 'local') {
        Dialog.tipError("未检测到本地显卡或本地直播服务端引擎，无法使用本地模式");
        return;
    }
    await liveStore.start();
};

const doStop = async () => {
    if (liveStore.localConfig.config.engineMode === 'cloud' || !liveStore.server) {
        liveStore.status = "stopping";
        try {
            if (window.$mapi.app.callHandleFromMainOrRender) {
                await window.$mapi.app.callHandleFromMainOrRender("live:stopMockStream", {});
            } else if (window.ipcRenderer) {
                await window.ipcRenderer.invoke("live:stopMockStream", {});
            } else {
                await window.$mapi.event.callPage('main', 'live:stopMockStream', {});
            }
            liveStore.status = "stopped";
        } catch (e: any) {
            console.error(e);
            liveStore.status = "stopped";
        }
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
                <a-button type="primary" status="danger" v-else-if="isRunning || isStarting" @click="doStop">
                    <template #icon><icon-stop /></template>
                    停止直播
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
                    
                    <!-- 本地推流预览 (通过 file 协议直接播放本地 mp4) -->
                    <video 
                        ref="videoRef"
                        v-if="isRunning && liveStore.localConfig.config.engineMode === 'cloud'" 
                        class="absolute inset-0 w-full h-full object-contain"
                        src="http://localhost:5173/test.mp4" 
                        autoplay 
                        loop 
                        :muted="previewMuted"
                        :volume="previewVolume / 100">
                    </video>

                    <!-- 预览控制条 -->
                    <div v-if="isRunning" class="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20 bg-black bg-opacity-50 px-4 py-2 rounded-lg opacity-0 hover:opacity-100 transition-opacity">
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
                            <span v-if="liveStore.liveStatus.videoRtmp" class="text-green-500">正常</span>
                            <span v-else class="text-gray-400">未连接</span>
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 text-xs mb-1">排队任务数</div>
                        <div class="font-bold text-xl">0</div>
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

                        <div class="font-bold text-gray-700 mb-2 mt-2 bg-gray-50 p-2 rounded">推流配置</div>
                        <a-form-item label="RTMP 推流服务器地址" required>
                            <a-input v-model="liveStore.localConfig.config.rtmpUrl" placeholder="例如: rtmp://192.168.110.238:1935" />
                        </a-form-item>
                        <a-form-item label="推流码 (串流密钥)" required>
                            <a-input v-model="liveStore.localConfig.config.rtmpKey" placeholder="例如: livehime" />
                        </a-form-item>
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
