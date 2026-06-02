import { defineStore } from "pinia";
import { computed } from "vue";
import { t } from "../../lang";
import { Dialog } from "../../lib/dialog";
import { mapError } from "../../lib/error";
import { ObjectUtil } from "../../lib/util";
import { StorageService } from "../../service/StorageService";
import { VideoTemplateService } from "../../service/VideoTemplateService";
import { VideoActionService } from "../../service/VideoActionService";
import { CloudProviderProfileService, CloudProviderType } from "../../service/CloudProviderProfileService";
import { CloudTemplateRecord, CloudTemplateService } from "../../service/CloudTemplateService";
import { DigitalHumanClipRecord, DigitalHumanClipService } from "../../service/DigitalHumanClipService";
import { DigitalHumanIdentityRecord, DigitalHumanIdentityService } from "../../service/DigitalHumanIdentityService";
import {
    DigitalHumanLiveExecutionConfigRecord,
    DigitalHumanLiveExecutionConfigService,
} from "../../service/DigitalHumanLiveExecutionConfigService";
import { DigitalHumanScenePackRecord, DigitalHumanScenePackService } from "../../service/DigitalHumanScenePackService";
import { LiveStatusType } from "../../types/Live";
import { EnumServerStatus, ServerRecord } from "../../types/Server";
import store from "../index";
import { useServerStore } from "./server";
import { useModelStore } from "../../module/Model/store/model";

const serverStore = useServerStore();

export const liveModels = [
    {value: "wav2lip", title: "Wav2Lip标准版"},
    {value: "wav2lip384", title: "Wav2Lip清晰版"},
    {value: "musetalk", title: "MuseTalk高画质版"},
    {value: "infinitetalk", title: "InfiniteTalk实时版"},
]

export const liveCloudProviders = [
    {value: "custom", title: "自定义接口"},
    {value: "runninghub", title: "RunningHub"},
    {value: "heygem", title: "Heygem/其他"},
] as const;

const SCENE_ID = "live";
const EMPTY_LIVE_STATUS = {
    id: SCENE_ID,
    status: "stopped",
    statusMsg: "",
    avatar: {
        enable: false,
        width: 0,
        height: 0,
    },
    video: {
        enable: false,
        width: 0,
        height: 0,
    },
    audio: {
        enable: false,
    },
    avatars: [] as {
        id: string;
        title: string;
        url: string;
        status: "init";
        statusMsg: "";
    }[],
    videoTitle: "",
    talkTitle: "",
    talkContent: "",
    avatarRtmp: "",
    avatarHls: "",
    videoRtmp: "",
    videoHls: "",
    audioRtmp: "",
    audioHls: "",
    runtime: {
        avatarStatus: "",
        avatarVideoFps: 0,
        avatarAudioFps: 0,
        videoStatus: "",
        videoVideoFps: 0,
        videoAudioFps: 0,
        audioStatus: "",
        audioFps: 0,
    },
};

export const liveStore = defineStore("live", {
    state: () => ({
        server: computed(() => {
            return serverStore.records.find(item => item.functions.includes("live")) as ServerRecord | undefined;
        }) as any,
        available: computed(() => {
            const server = serverStore.records.find(item => item.functions.includes("live")) as
                | ServerRecord
                | undefined;
            return server && server.status === EnumServerStatus.RUNNING;
        }),
        serverConfig: {
            ttsProviders: [] as {
                name: string;
                title: string;
                param: {
                    name: string;
                    type: string;
                    title: string;
                    [key: string]: any;
                }[];
                setting: {
                    [key: string]: any;
                };
            }[],
        },
        localConfig: {
            model: "wav2lip" as typeof liveModels[number]["value"],
            mode: "avatar" as "avatar" | "audio",
            avatar: {
                width: 720,
                height: 720,
                avatarId: 0,
            },
            audio: {},
            video: {
                enable: false,
                width: 1280,
                height: 800,
            },
            config: {
                flowVideoMode: "order" as "order" | "random",
                flowTalkMode: "order" as "order" | "random",
                flowTalkDelayMin: 5,
                flowTalkDelayMax: 10,
                ttsProvider: "",
                ttsProviderParam: {} as {
                    [key: string]: any;
                },
                ttsProviderSetting: {} as {
                    [key: string]: any;
                },
                eventDefaultUsername: "宝子",
                eventEnterIgnoreSecond: 120,
                liveMonitorType: "douyin",
                liveMonitorUrl: "",
                engineMode: "cloud" as "local" | "cloud",
                replyMode: "voice" as "voice" | "text" | "both" | "random",
                thanksMode: "local" as "local" | "llm",
                prompt: {
                    persona: "你现在是一个正在直播的带货主播，性格开朗热情，喜欢称呼观众为宝宝。你的回答必须口语化、简短（20字以内），绝对不能包含任何动作描写（如*笑*、*挥手*）和表情符号。",
                    replyComment: "直播间有一个叫\"{user}\"的观众刚刚发了一条弹幕：\"{content}\"。请结合你的人设回复他。",
                    replyLike: "直播间有一个叫\"{user}\"的观众刚刚给你点赞了。请结合你的人设，用一句话简短热情地感谢他，并呼吁大家继续点赞关注。",
                    replyGift: "观众\"{user}\"刚刚给你送了一个礼物：\"{content}\"。请结合你的人设，用一句非常激动、热情的话感谢老板，祝老板发财。",
                    replyEnter: "观众\"{user}\"刚刚进入了直播间。请结合你的人设，用一句简短、热情的话欢迎他，并引导他关注或了解产品。",
                },
                localThanks: {
                    like: [
                        "感谢{user}宝宝的点赞，点点关注不迷路哦！",
                        "谢谢{user}的喜欢，大家动动发财的小手一起点点赞！",
                        "感谢{user}送出的免费小心心，爱你哟！"
                    ],
                    gift: [
                        "哇！感谢{user}老板送的{content}！老板大气，老板发大财！",
                        "谢谢{user}宝宝的{content}，太破费啦，比心比心！",
                        "感谢{user}的{content}，礼物走一走，活到九十九！"
                    ],
                    enter: [
                        "欢迎{user}宝宝来到直播间，喜欢主播点点关注哦！",
                        "欢迎{user}进直播间，大家没点关注的把关注点一点！",
                        "欢迎{user}，有什么想了解的商品可以弹幕告诉我哦！"
                    ]
                },
                streamMode: "rtmp" as "rtmp" | "virtualCam",
                rtmpUrl: "",
                rtmpKey: "",
                cloudProvider: "custom" as "custom" | "runninghub" | "heygem",
                cloudApiBaseUrl: "",
                cloudApiKey: "",
                cloudSceneId: "default",
                cloudStartPath: "scene/start",
                cloudStopPath: "scene/stop",
                cloudStatusPath: "scene/status",
                cloudStatusFallbackPath: "status",
                cloudTalkPath: "scene/talk",
                cloudClipPath: "scene/clip",
                cloudClipRequestJson: "{}",
                cloudPreviewFieldPath: "",
                cloudStatusFieldPath: "",
                runningHubBaseUrl: "https://www.runninghub.ai",
                runningHubApiKey: "",
                runningHubWebappId: "",
                runningHubNodeInfoListJson: "[]",
                runningHubWebhookUrl: "",
                runningHubInstanceType: "default",
                cloudSdkEnabled: false,
                cloudSdkScriptUrl: "",
                cloudSdkGlobalName: "AvatarPlatform",
                cloudSdkAppId: "",
                cloudSdkApiKey: "",
                cloudSdkApiSecret: "",
                cloudSdkSceneId: "",
                cloudSdkUseInlinePlayer: true,
                cloudSdkGlobalParams: "{}",
                scenePackId: 0,
            },
        },
        status: "stopped" as LiveStatusType,
        statusMsg: "",
        mockStream: {
            running: false,
            mode: "" as "" | "rtmp" | "virtualCam",
            pid: 0,
        },
        liveStatusTimer: undefined as any,
        liveStatus: ObjectUtil.clone(EMPTY_LIVE_STATUS),
        liveRuntime: {
            liveMonitorEvent: null as any,
        },
        liveDataUpdateTimer: undefined as any,
        
        // 新增：用于在前端展示的实时弹幕列表
        recentEvents: [] as any[],
        // 记录最近发送的消息，用于防回声（避免抓取自己发送的消息）
        recentSentMessages: [] as {text: string, time: number}[],
        // 播报队列系统
        replyQueue: [] as { username: string; text: string; eventType: string; doVoice: boolean; doText: boolean }[],
        isSpeaking: false, // 标记当前是否正在播报语音
        pendingTalkWaiters: [] as { resolve: () => void; timer: any }[],
        engineActionListenerBound: false,
        cloudStatusFailCount: 0,
        cloudStartGraceUntil: 0,
        cloudSessionExpectedRunning: false,
        cloudStartInFlight: false,
        cloudLastStartAt: 0,
        cloudTaskId: "",
        cloudTaskProvider: "",
        scenePackRuntime: {
            selectedScenePackId: 0,
            selectedScenePackTitle: "",
            identityId: 0,
            identityTitle: "",
            executionConfigId: 0,
            executionConfigTitle: "",
            currentClipId: 0,
            currentClipTitle: "",
            currentClipType: "",
            currentClipVideo: "",
            currentClipAudio: "",
            currentClipCoverImage: "",
            currentClipText: "",
            currentClipDurationSeconds: 0,
            idleClipId: 0,
            idleClipTitle: "",
            idleClipVideo: "",
            idleClipAudio: "",
            autoReturnToIdle: true,
            idlePaddingMs: 800,
            talkPaddingMs: 400,
            productInsertMode: "auto" as "auto" | "manual" | "disabled",
            overlayPosition: "right" as "left" | "right" | "bottom" | "full",
            defaultDisplayMode: "normal",
            queues: {
                welcome: [] as number[],
                talk: [] as number[],
                product: [] as number[],
                transition: [] as number[],
            },
            cursors: {
                welcome: 0,
                talk: 0,
                product: 0,
                transition: 0,
            },
            returnTimer: undefined as any,
        },
    }),
    actions: {
        async init() {
            const localConfig = await $mapi.storage.get("live", "config", {});
            // console.log('live.init', localConfig)
            this.localConfig.model = localConfig.model || this.localConfig.model;
            this.localConfig.mode = localConfig.mode || this.localConfig.mode;
            this.localConfig.avatar.width = localConfig.avatar?.width || this.localConfig.avatar.width;
            this.localConfig.avatar.height = localConfig.avatar?.height || this.localConfig.avatar.height;
            this.localConfig.avatar.avatarId = localConfig.avatar?.avatarId || this.localConfig.avatar.avatarId;
            this.localConfig.video.enable = localConfig.video?.enable || this.localConfig.video.enable;
            this.localConfig.video.width = localConfig.video?.width || this.localConfig.video.width;
            this.localConfig.video.height = localConfig.video?.height || this.localConfig.video.height;
            this.localConfig.config.flowVideoMode =
                localConfig.config?.flowVideoMode || this.localConfig.config.flowVideoMode;
            this.localConfig.config.flowTalkMode =
                localConfig.config?.flowTalkMode || this.localConfig.config.flowTalkMode;
            this.localConfig.config.flowTalkDelayMin =
                localConfig.config?.flowTalkDelayMin || this.localConfig.config.flowTalkDelayMin;
            this.localConfig.config.flowTalkDelayMax =
                localConfig.config?.flowTalkDelayMax || this.localConfig.config.flowTalkDelayMax;
            this.localConfig.config.ttsProvider =
                localConfig.config?.ttsProvider || this.localConfig.config.ttsProvider;
            this.localConfig.config.ttsProviderParam =
                localConfig.config?.ttsProviderParam || this.localConfig.config.ttsProviderParam;
            this.localConfig.config.ttsProviderSetting =
                localConfig.config?.ttsProviderSetting || this.localConfig.config.ttsProviderSetting;
            this.localConfig.config.eventDefaultUsername =
                localConfig.config?.eventDefaultUsername || this.localConfig.config.eventDefaultUsername;
            this.localConfig.config.eventEnterIgnoreSecond =
                localConfig.config?.eventEnterIgnoreSecond || this.localConfig.config.eventEnterIgnoreSecond;
            this.localConfig.config.liveMonitorType =
                localConfig.config?.liveMonitorType || this.localConfig.config.liveMonitorType;
            this.localConfig.config.liveMonitorUrl =
                localConfig.config?.liveMonitorUrl || this.localConfig.config.liveMonitorUrl;
            this.localConfig.config.engineMode =
                localConfig.config?.engineMode || this.localConfig.config.engineMode;
            this.localConfig.config.replyMode =
                localConfig.config?.replyMode || this.localConfig.config.replyMode;
            this.localConfig.config.thanksMode =
                localConfig.config?.thanksMode || this.localConfig.config.thanksMode;
            
            // 初始化 prompt 配置
            if (localConfig.config?.prompt) {
                this.localConfig.config.prompt = { ...this.localConfig.config.prompt, ...localConfig.config.prompt };
            }
            // 初始化 localThanks 配置
            if (localConfig.config?.localThanks) {
                this.localConfig.config.localThanks = { ...this.localConfig.config.localThanks, ...localConfig.config.localThanks };
            }

            this.localConfig.config.rtmpUrl =
                localConfig.config?.rtmpUrl || this.localConfig.config.rtmpUrl;
            this.localConfig.config.rtmpKey =
                localConfig.config?.rtmpKey || this.localConfig.config.rtmpKey;
            this.localConfig.config.cloudProvider =
                localConfig.config?.cloudProvider || this.localConfig.config.cloudProvider || "custom";
            this.localConfig.config.cloudApiBaseUrl =
                localConfig.config?.cloudApiBaseUrl || this.localConfig.config.cloudApiBaseUrl;
            this.localConfig.config.cloudApiKey =
                localConfig.config?.cloudApiKey || this.localConfig.config.cloudApiKey;
            this.localConfig.config.cloudSceneId =
                localConfig.config?.cloudSceneId || this.localConfig.config.cloudSceneId || "default";
            this.localConfig.config.cloudStartPath =
                localConfig.config?.cloudStartPath || this.localConfig.config.cloudStartPath || "scene/start";
            this.localConfig.config.cloudStopPath =
                localConfig.config?.cloudStopPath || this.localConfig.config.cloudStopPath || "scene/stop";
            this.localConfig.config.cloudStatusPath =
                localConfig.config?.cloudStatusPath || this.localConfig.config.cloudStatusPath || "scene/status";
            this.localConfig.config.cloudStatusFallbackPath =
                localConfig.config?.cloudStatusFallbackPath || this.localConfig.config.cloudStatusFallbackPath || "status";
            this.localConfig.config.cloudTalkPath =
                localConfig.config?.cloudTalkPath || this.localConfig.config.cloudTalkPath || "scene/talk";
            this.localConfig.config.cloudClipPath =
                localConfig.config?.cloudClipPath || this.localConfig.config.cloudClipPath || "scene/clip";
            this.localConfig.config.cloudClipRequestJson =
                localConfig.config?.cloudClipRequestJson || this.localConfig.config.cloudClipRequestJson || "{}";
            this.localConfig.config.cloudPreviewFieldPath =
                localConfig.config?.cloudPreviewFieldPath || this.localConfig.config.cloudPreviewFieldPath || "";
            this.localConfig.config.cloudStatusFieldPath =
                localConfig.config?.cloudStatusFieldPath || this.localConfig.config.cloudStatusFieldPath || "";
            this.localConfig.config.runningHubBaseUrl =
                localConfig.config?.runningHubBaseUrl || this.localConfig.config.runningHubBaseUrl || "https://www.runninghub.ai";
            this.localConfig.config.runningHubApiKey =
                localConfig.config?.runningHubApiKey || this.localConfig.config.runningHubApiKey || "";
            this.localConfig.config.runningHubWebappId =
                localConfig.config?.runningHubWebappId || this.localConfig.config.runningHubWebappId || "";
            this.localConfig.config.runningHubNodeInfoListJson =
                localConfig.config?.runningHubNodeInfoListJson || this.localConfig.config.runningHubNodeInfoListJson || "[]";
            this.localConfig.config.runningHubWebhookUrl =
                localConfig.config?.runningHubWebhookUrl || this.localConfig.config.runningHubWebhookUrl || "";
            this.localConfig.config.runningHubInstanceType =
                localConfig.config?.runningHubInstanceType || this.localConfig.config.runningHubInstanceType || "default";
            this.localConfig.config.cloudSdkEnabled =
                localConfig.config?.cloudSdkEnabled ?? this.localConfig.config.cloudSdkEnabled ?? false;
            this.localConfig.config.cloudSdkScriptUrl =
                localConfig.config?.cloudSdkScriptUrl || this.localConfig.config.cloudSdkScriptUrl || "";
            this.localConfig.config.cloudSdkGlobalName =
                localConfig.config?.cloudSdkGlobalName || this.localConfig.config.cloudSdkGlobalName || "AvatarPlatform";
            this.localConfig.config.cloudSdkAppId =
                localConfig.config?.cloudSdkAppId || this.localConfig.config.cloudSdkAppId || "";
            this.localConfig.config.cloudSdkApiKey =
                localConfig.config?.cloudSdkApiKey || this.localConfig.config.cloudSdkApiKey || "";
            this.localConfig.config.cloudSdkApiSecret =
                localConfig.config?.cloudSdkApiSecret || this.localConfig.config.cloudSdkApiSecret || "";
            this.localConfig.config.cloudSdkSceneId =
                localConfig.config?.cloudSdkSceneId || this.localConfig.config.cloudSdkSceneId || "";
            this.localConfig.config.cloudSdkUseInlinePlayer =
                localConfig.config?.cloudSdkUseInlinePlayer ?? this.localConfig.config.cloudSdkUseInlinePlayer ?? true;
            this.localConfig.config.cloudSdkGlobalParams =
                localConfig.config?.cloudSdkGlobalParams || this.localConfig.config.cloudSdkGlobalParams || "{}";
            this.localConfig.config.scenePackId =
                Number(localConfig.config?.scenePackId || this.localConfig.config.scenePackId || 0);
            this.localConfig.config.streamMode =
                localConfig.config?.streamMode || this.localConfig.config.streamMode || "rtmp";
            if (!this.engineActionListenerBound) {
                window.addEventListener("live-engine-action", this.onEngineActionBroadcast as EventListener);
                this.engineActionListenerBound = true;
            }
            if (Number(this.localConfig.config.scenePackId || 0) > 0) {
                await this.activateScenePack(Number(this.localConfig.config.scenePackId || 0), {
                    persist: false,
                });
            }
            await this.statusUpdate();
        },
        clearScenePackReturnTimer() {
            if (this.scenePackRuntime.returnTimer) {
                clearTimeout(this.scenePackRuntime.returnTimer);
                this.scenePackRuntime.returnTimer = undefined;
            }
        },
        resetScenePackRuntime() {
            this.clearScenePackReturnTimer();
            this.scenePackRuntime.selectedScenePackId = 0;
            this.scenePackRuntime.selectedScenePackTitle = "";
            this.scenePackRuntime.identityId = 0;
            this.scenePackRuntime.identityTitle = "";
            this.scenePackRuntime.executionConfigId = 0;
            this.scenePackRuntime.executionConfigTitle = "";
            this.scenePackRuntime.currentClipId = 0;
            this.scenePackRuntime.currentClipTitle = "";
            this.scenePackRuntime.currentClipType = "";
            this.scenePackRuntime.currentClipVideo = "";
            this.scenePackRuntime.currentClipAudio = "";
            this.scenePackRuntime.currentClipCoverImage = "";
            this.scenePackRuntime.currentClipText = "";
            this.scenePackRuntime.currentClipDurationSeconds = 0;
            this.scenePackRuntime.idleClipId = 0;
            this.scenePackRuntime.idleClipTitle = "";
            this.scenePackRuntime.idleClipVideo = "";
            this.scenePackRuntime.idleClipAudio = "";
            this.scenePackRuntime.autoReturnToIdle = true;
            this.scenePackRuntime.idlePaddingMs = 800;
            this.scenePackRuntime.talkPaddingMs = 400;
            this.scenePackRuntime.productInsertMode = "auto";
            this.scenePackRuntime.overlayPosition = "right";
            this.scenePackRuntime.defaultDisplayMode = "normal";
            this.scenePackRuntime.queues.welcome = [];
            this.scenePackRuntime.queues.talk = [];
            this.scenePackRuntime.queues.product = [];
            this.scenePackRuntime.queues.transition = [];
            this.scenePackRuntime.cursors.welcome = 0;
            this.scenePackRuntime.cursors.talk = 0;
            this.scenePackRuntime.cursors.product = 0;
            this.scenePackRuntime.cursors.transition = 0;
        },
        scenePackSequenceMode(type: "welcome" | "talk" | "product" | "transition") {
            if (type === "talk" || type === "welcome") {
                return this.localConfig.config.flowTalkMode || "order";
            }
            return this.localConfig.config.flowVideoMode || "order";
        },
        pickSceneClipId(type: "welcome" | "talk" | "product" | "transition") {
            const queue = this.scenePackRuntime.queues[type] || [];
            if (!queue.length) {
                return 0;
            }
            if (this.scenePackSequenceMode(type) === "random") {
                const index = Math.floor(Math.random() * queue.length);
                return Number(queue[index] || 0);
            }
            const cursor = Number(this.scenePackRuntime.cursors[type] || 0) % queue.length;
            const clipId = Number(queue[cursor] || 0);
            this.scenePackRuntime.cursors[type] = (cursor + 1) % queue.length;
            return clipId;
        },
        applySceneClip(record: DigitalHumanClipRecord) {
            this.scenePackRuntime.currentClipId = Number(record.id || 0);
            this.scenePackRuntime.currentClipTitle = record.title || "";
            this.scenePackRuntime.currentClipType = record.content.clipType || "";
            this.scenePackRuntime.currentClipVideo = record.content.videoUrl || "";
            this.scenePackRuntime.currentClipAudio = record.content.audioUrl || "";
            this.scenePackRuntime.currentClipCoverImage = record.content.coverImage || "";
            this.scenePackRuntime.currentClipText = record.content.text || "";
            this.scenePackRuntime.currentClipDurationSeconds = Number(record.content.durationSeconds || 0);
            this.liveStatus.talkTitle = record.title || "";
            this.liveStatus.talkContent = record.content.text || "";
            this.liveStatus.videoTitle =
                record.content.clipType === "idle"
                    ? "待机循环中"
                    : record.title || "编排片段执行中";
        },
        scenePackCurrentVideoUrl() {
            return String(this.scenePackRuntime.currentClipVideo || this.scenePackRuntime.idleClipVideo || "").trim();
        },
        scenePackCurrentAudioUrl() {
            return String(this.scenePackRuntime.currentClipAudio || this.scenePackRuntime.idleClipAudio || "").trim();
        },
        hasScenePackPlaybackVideo() {
            return !!this.scenePackCurrentVideoUrl();
        },
        hasScenePackSelected() {
            return Number(this.scenePackRuntime.selectedScenePackId || 0) > 0;
        },
        effectiveLocalVideoEnabled() {
            return !!this.localConfig.video.enable || (this.localConfig.config.engineMode === "local" && this.hasScenePackPlaybackVideo());
        },
        buildScenePackFlowOverrides() {
            if (this.localConfig.config.engineMode !== "local" || !this.hasScenePackSelected()) {
                return null;
            }
            const videoUrl = this.scenePackCurrentVideoUrl();
            const text = String(this.scenePackRuntime.currentClipText || "").trim();
            return {
                flowVideos: videoUrl
                    ? [
                          {
                              id: `ScenePackClipVideo${this.scenePackRuntime.currentClipId || this.scenePackRuntime.idleClipId || 0}`,
                              title: this.scenePackRuntime.currentClipTitle || this.scenePackRuntime.idleClipTitle || "编排片段",
                              video: videoUrl,
                          },
                      ]
                    : [],
                flowTalks:
                    !videoUrl && text
                        ? [
                              {
                                  id: `ScenePackClipTalk${this.scenePackRuntime.currentClipId || 0}`,
                                  title: this.scenePackRuntime.currentClipTitle || "编排话术",
                                  talks: [{ value: text }],
                                  video: "",
                              },
                          ]
                        : [],
            };
        },
        async syncLocalSceneExecution(option: { silent?: boolean } = {}) {
            const configPost = {
                id: SCENE_ID,
                config: {
                    flowVideoMode: this.localConfig.config.flowVideoMode,
                    flowTalkMode: this.localConfig.config.flowTalkMode,
                    flowTalkDelayMin: this.localConfig.config.flowTalkDelayMin,
                    flowTalkDelayMax: this.localConfig.config.flowTalkDelayMax,
                },
                data: await this.buildData(),
            };
            const res = await this.apiRequest("scene/update", {
                scene: ObjectUtil.clone(configPost),
            });
            if (res.code) {
                if (!option.silent) {
                    Dialog.tipError(t("error.updateFailed") + ":" + res.msg);
                }
                return false;
            }
            const textOnlyTalk =
                !this.scenePackCurrentVideoUrl() &&
                !!String(this.scenePackRuntime.currentClipText || "").trim() &&
                this.scenePackRuntime.currentClipType !== "idle";
            if (textOnlyTalk) {
                await this.talk(String(this.scenePackRuntime.currentClipText || "").trim(), {
                    silent: true,
                });
            }
            return true;
        },
        async syncCloudSceneExecution(option: { silent?: boolean } = {}) {
            if (!this.hasCloudApiConfigured()) {
                return true;
            }
            const clipHasVideo = !!this.scenePackCurrentVideoUrl();
            const clipHasAudio = !!this.scenePackCurrentAudioUrl();
            const textOnlyTalk =
                !clipHasVideo &&
                !clipHasAudio &&
                !!String(this.scenePackRuntime.currentClipText || "").trim() &&
                this.scenePackRuntime.currentClipType !== "idle";
            if (this.isRunningHubProvider() || clipHasVideo || clipHasAudio || this.getCloudProvider() === "heygem") {
                return await this.submitCloudSceneClipExecution(option);
            }
            const hasClipBridgeTemplate =
                !!String(this.localConfig.config.cloudClipPath || "").trim() ||
                !!String(this.localConfig.config.cloudClipRequestJson || "").trim();
            if (hasClipBridgeTemplate && !textOnlyTalk) {
                return await this.submitCloudSceneClipExecution(option);
            }
            if (textOnlyTalk) {
                return await this.talkCloud(String(this.scenePackRuntime.currentClipText || "").trim(), {
                    silent: option.silent ?? true,
                });
            }
            return true;
        },
        async syncScenePackExecution(option: { silent?: boolean } = {}) {
            if (this.status !== "running") {
                return true;
            }
            if (!this.hasScenePackSelected()) {
                return true;
            }
            if (this.localConfig.config.engineMode === "local") {
                return await this.syncLocalSceneExecution(option);
            }
            return await this.syncCloudSceneExecution(option);
        },
        scheduleScenePackReturnToIdle(delayMs: number) {
            this.clearScenePackReturnTimer();
            this.scenePackRuntime.returnTimer = setTimeout(async () => {
                await this.returnToIdleClip({
                    silent: true,
                });
            }, Math.max(0, delayMs));
        },
        async setCurrentSceneClip(clipId: number, option: { scheduleReturn?: boolean; silent?: boolean } = {}) {
            const record = await DigitalHumanClipService.get(Number(clipId || 0));
            if (!record?.id) {
                if (!option.silent) {
                    Dialog.tipError("片段不存在或已被删除");
                }
                return false;
            }
            this.clearScenePackReturnTimer();
            this.applySceneClip(record);
            const shouldScheduleReturn =
                option.scheduleReturn !== false &&
                this.scenePackRuntime.autoReturnToIdle &&
                Number(this.scenePackRuntime.idleClipId || 0) > 0 &&
                record.content.clipType !== "idle";
            if (shouldScheduleReturn) {
                const durationMs = Math.max(0, Number(record.content.durationSeconds || 0) * 1000);
                const paddingMs =
                    record.content.clipType === "product"
                        ? Number(this.scenePackRuntime.idlePaddingMs || 0)
                        : Number(this.scenePackRuntime.talkPaddingMs || 0);
                this.scheduleScenePackReturnToIdle((durationMs || 5000) + paddingMs);
            }
            await this.syncScenePackExecution({
                silent: true,
            });
            return true;
        },
        async returnToIdleClip(option: { silent?: boolean } = {}) {
            if (!Number(this.scenePackRuntime.idleClipId || 0)) {
                if (!option.silent) {
                    Dialog.tipError("当前编排方案未配置待机片");
                }
                return false;
            }
            return await this.setCurrentSceneClip(Number(this.scenePackRuntime.idleClipId || 0), {
                scheduleReturn: false,
                silent: option.silent,
            });
        },
        async playScenePackClipType(type: "welcome" | "talk" | "product" | "transition") {
            if (!Number(this.scenePackRuntime.selectedScenePackId || 0)) {
                Dialog.tipError("请先选择直播编排方案");
                return false;
            }
            const clipId = this.pickSceneClipId(type);
            if (!clipId) {
                Dialog.tipError(`当前方案未配置${type === "welcome" ? "欢迎片" : type === "talk" ? "讲解片" : type === "product" ? "商品片" : "过渡片"}`);
                return false;
            }
            return await this.setCurrentSceneClip(clipId);
        },
        async activateScenePack(scenePackId: number, option: { persist?: boolean } = {}) {
            const record = await DigitalHumanScenePackService.get(Number(scenePackId || 0));
            if (!record?.id) {
                this.resetScenePackRuntime();
                if (option.persist !== false) {
                    this.localConfig.config.scenePackId = 0;
                    await this.saveLocalConfig();
                }
                return false;
            }
            this.clearScenePackReturnTimer();
            this.scenePackRuntime.selectedScenePackId = Number(record.id || 0);
            this.scenePackRuntime.selectedScenePackTitle = record.title || "";
            this.scenePackRuntime.identityId = Number(record.content.identityId || 0);
            this.scenePackRuntime.identityTitle = record.content.identityTitle || "";
            this.scenePackRuntime.executionConfigId = Number(record.content.executionConfigId || 0);
            this.scenePackRuntime.executionConfigTitle = record.content.executionConfigTitle || "";
            this.scenePackRuntime.idleClipId = Number(record.content.idleClipId || 0);
            this.scenePackRuntime.autoReturnToIdle =
                typeof record.content.autoReturnToIdle === "boolean" ? record.content.autoReturnToIdle : true;
            this.scenePackRuntime.idlePaddingMs = Number(record.content.idlePaddingMs || 0);
            this.scenePackRuntime.talkPaddingMs = Number(record.content.talkPaddingMs || 0);
            this.scenePackRuntime.productInsertMode = (record.content.productInsertMode || "auto") as any;
            this.scenePackRuntime.overlayPosition = (record.content.overlayPosition || "right") as any;
            this.scenePackRuntime.defaultDisplayMode = (record.content.defaultDisplayMode || "normal") as any;
            this.scenePackRuntime.queues.welcome = [...(record.content.welcomeClipIds || [])];
            this.scenePackRuntime.queues.talk = [...(record.content.talkClipIds || [])];
            this.scenePackRuntime.queues.product = [...(record.content.productClipIds || [])];
            this.scenePackRuntime.queues.transition = [...(record.content.transitionClipIds || [])];
            this.scenePackRuntime.cursors.welcome = 0;
            this.scenePackRuntime.cursors.talk = 0;
            this.scenePackRuntime.cursors.product = 0;
            this.scenePackRuntime.cursors.transition = 0;
            this.localConfig.config.scenePackId = Number(record.id || 0);
            if (option.persist !== false) {
                await this.saveLocalConfig();
            }
            if (Number(this.scenePackRuntime.idleClipId || 0) > 0) {
                await this.returnToIdleClip({
                    silent: true,
                });
            }
            const idleRecord = await DigitalHumanClipService.get(Number(this.scenePackRuntime.idleClipId || 0));
            this.scenePackRuntime.idleClipTitle = idleRecord?.title || "";
            this.scenePackRuntime.idleClipVideo = idleRecord?.content.videoUrl || "";
            this.scenePackRuntime.idleClipAudio = idleRecord?.content.audioUrl || "";
            return true;
        },
        onEngineActionBroadcast(event: any) {
            const data = event?.detail || {};
            if (data.type === "LiveTalkDone") {
                const waiter = this.pendingTalkWaiters.shift();
                if (waiter) {
                    clearTimeout(waiter.timer);
                    waiter.resolve();
                }
            }
        },
        waitLocalTalkDone(timeoutMs = 30000): Promise<void> {
            return new Promise(resolve => {
                const timer = setTimeout(() => {
                    const idx = this.pendingTalkWaiters.findIndex(item => item.resolve === resolve);
                    if (idx >= 0) {
                        this.pendingTalkWaiters.splice(idx, 1);
                    }
                    resolve();
                }, timeoutMs);
                this.pendingTalkWaiters.push({
                    resolve,
                    timer,
                });
            });
        },
        flushPendingTalkWaiters() {
            if (!this.pendingTalkWaiters.length) {
                return;
            }
            for (const waiter of this.pendingTalkWaiters) {
                clearTimeout(waiter.timer);
                waiter.resolve();
            }
            this.pendingTalkWaiters = [];
        },
        async validateLocalStartDependencies(): Promise<{ok: boolean; msg: string}> {
            if (this.localConfig.config.engineMode !== "local") {
                return {ok: true, msg: ""};
            }
            if (!liveModels.some(item => item.value === this.localConfig.model)) {
                return {
                    ok: false,
                    msg: "本地渲染不可用：当前口型模型配置无效，请在直播控制台重新选择可用模型",
                };
            }
            if (this.localConfig.mode === "avatar") {
                const avatarId = Number(this.localConfig.avatar.avatarId || 0);
                if (!avatarId) {
                    return {
                        ok: false,
                        msg: "本地渲染不可用：未选择数字人形象，请先在数字人管理中选择并保存模板",
                    };
                }
                const avatar = await VideoTemplateService.get(avatarId);
                if (!avatar || !avatar.video) {
                    return {
                        ok: false,
                        msg: "本地渲染不可用：数字人模板不存在或视频路径为空，请重新选择数字人素材",
                    };
                }
                const avatarExists = await $mapi.file.exists(avatar.video);
                if (!avatarExists) {
                    return {
                        ok: false,
                        msg: "本地渲染不可用：数字人模板视频文件不存在，请检查素材路径后重试",
                    };
                }
            }
            const liveKnowledge = await StorageService.list("LiveKnowledge");
            const scenePackSelected = this.hasScenePackSelected();
            const flowTalks = liveKnowledge.filter(s => s.content.type === "flowTalk" && s.content.enable);
            if (!flowTalks.length && !scenePackSelected) {
                return {
                    ok: false,
                    msg: "本地渲染不可用：未配置循环话术，请先在直播知识库启用至少一条循环话术",
                };
            }
            if (!scenePackSelected) {
                for (const item of flowTalks) {
                    if (item.content?.url) {
                        const exists = await $mapi.file.exists(item.content.url);
                        if (!exists) {
                            return {
                                ok: false,
                                msg: "本地渲染不可用：循环话术关联素材文件不存在，请在直播知识库修复素材路径",
                            };
                        }
                    }
                }
            }
            if (this.effectiveLocalVideoEnabled()) {
                const flowVideos = liveKnowledge.filter(s => s.content.type === "flowVideo" && s.content.enable);
                if (!flowVideos.length && !scenePackSelected) {
                    return {
                        ok: false,
                        msg: "本地渲染不可用：未启用循环视频素材，请先在直播知识库配置循环视频",
                    };
                }
                if (scenePackSelected && this.scenePackCurrentVideoUrl()) {
                    const exists = await $mapi.file.exists(this.scenePackCurrentVideoUrl());
                    if (!exists) {
                        return {
                            ok: false,
                            msg: "本地渲染不可用：当前编排片段视频不存在，请检查数字人直播片段素材路径",
                        };
                    }
                } else {
                    for (const item of flowVideos) {
                        if (!item.content?.url) {
                            return {
                                ok: false,
                                msg: "本地渲染不可用：循环视频素材路径为空，请在直播知识库补全素材路径",
                            };
                        }
                        const exists = await $mapi.file.exists(item.content.url);
                        if (!exists) {
                            return {
                                ok: false,
                                msg: "本地渲染不可用：循环视频素材文件不存在，请检查素材路径后重试",
                            };
                        }
                    }
                }
            }
            const actions = await VideoActionService.list();
            for (const action of actions) {
                if (!action.video) {
                    return {
                        ok: false,
                        msg: "本地渲染不可用：动作库存在空视频路径，请在数字人动作库修复后再开播",
                    };
                }
                const exists = await $mapi.file.exists(action.video);
                if (!exists) {
                    return {
                        ok: false,
                        msg: "本地渲染不可用：动作库素材文件不存在，请在数字人动作库修复素材路径",
                    };
                }
            }
            try {
                const statusRes = await this.apiRequest("status", {sceneId: SCENE_ID});
                if (statusRes.code) {
                    return {
                        ok: false,
                        msg: "本地渲染不可用：引擎状态检查失败，请确认服务端口未被占用并重启直播服务",
                    };
                }
            } catch (e) {
                return {
                    ok: false,
                    msg: "本地渲染不可用：引擎通信失败，请确认服务端口可用并在服务管理中重启引擎",
                };
            }
            return {ok: true, msg: ""};
        },
        async saveLocalConfig() {
            await $mapi.storage.set("live", "config", ObjectUtil.clone(this.localConfig));
        },
        async onKnowledgeUpdate() {
            if (this.status !== "running") {
                return;
            }
            Dialog.tipSuccess(t("live.knowledgeUpdateHint"));
            if (this.liveDataUpdateTimer) {
                clearTimeout(this.liveDataUpdateTimer);
            }
            this.liveDataUpdateTimer = setTimeout(async () => {
                await this.update();
            }, 5 * 1000);
        },
        async callLiveHandle(handle: string, payload: any = {}) {
            const appAny = (window as any)?.$mapi?.app as any;
            if (appAny?.callHandleFromMainOrRender) {
                return await appAny.callHandleFromMainOrRender(handle, payload);
            }
            if (window.ipcRenderer) {
                return await window.ipcRenderer.invoke(handle, payload);
            }
            return await window.$mapi.event.callPage("main", handle, payload);
        },
        getCloudProvider() {
            return (this.localConfig.config.cloudProvider || "custom") as "custom" | "runninghub" | "heygem";
        },
        isRunningHubProvider() {
            return this.getCloudProvider() === "runninghub";
        },
        hasCloudApiConfigured() {
            if (this.isRunningHubProvider()) {
                return !!String(this.localConfig.config.runningHubApiKey || "").trim() && !!String(this.localConfig.config.runningHubWebappId || "").trim();
            }
            return !!String(this.localConfig.config.cloudApiBaseUrl || "").trim();
        },
        normalizeCloudApiBaseUrl(rawUrl: string) {
            const trimmed = String(rawUrl || "").trim().replace(/\/+$/, "");
            if (!trimmed) {
                return "";
            }
            if (/^https?:\/\//i.test(trimmed)) {
                return trimmed;
            }
            // 兼容用户只填 127.0.0.1:8000 / localhost:8000 的情况
            if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(trimmed)) {
                return `http://${trimmed}`;
            }
            return trimmed;
        },
        parseRunningHubNodeInfoList() {
            const raw = String(this.localConfig.config.runningHubNodeInfoListJson || "").trim();
            if (!raw) {
                return [];
            }
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                throw new Error("RunningHub 节点参数 JSON 格式不正确");
            }
        },
        parseCloudClipRequestJson() {
            const raw = String(this.localConfig.config.cloudClipRequestJson || "").trim();
            if (!raw) {
                return {};
            }
            try {
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === "object" ? parsed : {};
            } catch (e) {
                throw new Error("云端片段执行请求 JSON 格式不正确");
            }
        },
        currentCloudApiKey() {
            if (this.isRunningHubProvider()) {
                return String(this.localConfig.config.runningHubApiKey || "").trim();
            }
            return String(this.localConfig.config.cloudApiKey || "").trim();
        },
        currentIdentityBinding(provider: "runninghub" | "heygem" | "custom", identity: DigitalHumanIdentityRecord | null) {
            const bindings = identity?.content?.bindings || {};
            if (provider === "runninghub") {
                return bindings.runninghub || {};
            }
            if (provider === "heygem") {
                return bindings.heygem || {};
            }
            return bindings.custom || {};
        },
        normalizeLiveProviderType(providerType?: CloudProviderType | string) {
            const value = String(providerType || "").trim().toLowerCase();
            if (value === "runninghub") {
                return "runninghub" as "runninghub" | "heygem" | "custom";
            }
            if (value === "heygem") {
                return "heygem" as "runninghub" | "heygem" | "custom";
            }
            return "custom" as "runninghub" | "heygem" | "custom";
        },
        sceneExecutionSlotByClipType(clipType?: string) {
            const value = String(clipType || "").trim();
            if (value === "idle") return "idle";
            if (value === "welcome") return "welcome";
            if (value === "talk") return "talk";
            if (value === "product" || value === "holding") return "product";
            if (value === "transition") return "transition";
            return "default";
        },
        async resolveSceneExecutionTemplateBinding(option: { clipType?: string } = {}) {
            const executionConfigId = Number(this.scenePackRuntime.executionConfigId || 0);
            if (!executionConfigId) {
                return null;
            }
            const executionConfig = await DigitalHumanLiveExecutionConfigService.get(executionConfigId);
            if (!executionConfig?.id) {
                return null;
            }
            const slot = this.sceneExecutionSlotByClipType(option.clipType || this.scenePackRuntime.currentClipType || "idle");
            const slotKey = `${slot}TemplateId`;
            const templateId = Number((executionConfig.content as any)[slotKey] || executionConfig.content.defaultTemplateId || 0);
            if (!templateId) {
                return {
                    executionConfig,
                    template: null,
                    providerProfile: null,
                    slot,
                };
            }
            const template = await CloudTemplateService.get(templateId);
            const providerProfile = template?.content?.providerProfileId
                ? await CloudProviderProfileService.get(Number(template.content.providerProfileId || 0))
                : null;
            return {
                executionConfig,
                template,
                providerProfile,
                slot,
            };
        },
        parseJsonTemplateContent(raw: string, fallback: any, errorMsg: string) {
            const text = String(raw || "").trim();
            if (!text) {
                return fallback;
            }
            try {
                const parsed = JSON.parse(text);
                return typeof parsed === "undefined" ? fallback : parsed;
            } catch (e) {
                throw new Error(errorMsg);
            }
        },
        cloudSceneTemplateLookup(expr: string, context: any) {
            const normalized = String(expr || "").trim();
            if (!normalized) {
                return "";
            }
            if (normalized === "provider") {
                return context.provider;
            }
            if (normalized === "binding") {
                return context.binding || {};
            }
            if (normalized.startsWith("binding.")) {
                return this.cloudGetByPath(context.binding || {}, normalized.slice("binding.".length));
            }
            if (normalized === "clip") {
                return context.clip || {};
            }
            if (normalized.startsWith("clip.")) {
                return this.cloudGetByPath(context.clip || {}, normalized.slice("clip.".length));
            }
            if (normalized === "identity") {
                return context.identity || {};
            }
            if (normalized.startsWith("identity.")) {
                return this.cloudGetByPath(context.identity || {}, normalized.slice("identity.".length));
            }
            if (normalized === "runtime") {
                return context.runtime || {};
            }
            if (normalized.startsWith("runtime.")) {
                return this.cloudGetByPath(context.runtime || {}, normalized.slice("runtime.".length));
            }
            return this.cloudGetByPath(context, normalized);
        },
        cloudApplyTemplateValue(value: any, context: any): any {
            if (Array.isArray(value)) {
                return value.map(item => this.cloudApplyTemplateValue(item, context));
            }
            if (value && typeof value === "object") {
                const next: Record<string, any> = {};
                for (const [key, item] of Object.entries(value)) {
                    next[key] = this.cloudApplyTemplateValue(item, context);
                }
                return next;
            }
            if (typeof value !== "string") {
                return value;
            }
            const raw = String(value);
            const exact = raw.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
            if (exact) {
                const resolved = this.cloudSceneTemplateLookup(exact[1], context);
                return typeof resolved === "undefined" ? "" : resolved;
            }
            return raw.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_all, expr) => {
                const resolved = this.cloudSceneTemplateLookup(expr, context);
                if (resolved === null || typeof resolved === "undefined") {
                    return "";
                }
                if (typeof resolved === "object") {
                    try {
                        return JSON.stringify(resolved);
                    } catch (e) {
                        return "";
                    }
                }
                return String(resolved);
            });
        },
        async buildSceneClipExecutionContext() {
            const sceneBinding = await this.resolveSceneExecutionTemplateBinding();
            const provider = sceneBinding?.providerProfile
                ? this.normalizeLiveProviderType(sceneBinding.providerProfile.content.providerType)
                : this.getCloudProvider();
            const providerKey = provider === "runninghub" ? "runninghub" : provider === "heygem" ? "heygem" : "custom";
            const identityId = Number(this.scenePackRuntime.identityId || 0);
            const identity = identityId ? await DigitalHumanIdentityService.get(identityId) : null;
            const clip = {
                id: Number(this.scenePackRuntime.currentClipId || 0),
                title: this.scenePackRuntime.currentClipTitle || this.scenePackRuntime.idleClipTitle || "",
                type: this.scenePackRuntime.currentClipType || "idle",
                text: String(this.scenePackRuntime.currentClipText || "").trim(),
                videoUrl: this.scenePackCurrentVideoUrl(),
                audioUrl: this.scenePackCurrentAudioUrl(),
                coverImage: this.scenePackRuntime.currentClipCoverImage || "",
                durationSeconds: Number(this.scenePackRuntime.currentClipDurationSeconds || 0),
                displayMode: this.scenePackRuntime.defaultDisplayMode || "normal",
                overlayPosition: this.scenePackRuntime.overlayPosition || "right",
            };
            const binding = this.currentIdentityBinding(providerKey, identity);
            return {
                provider,
                clip,
                binding,
                identity: identity
                    ? {
                          id: Number(identity.id || 0),
                          title: identity.title || "",
                          ...identity.content,
                      }
                    : {
                          id: 0,
                          title: this.scenePackRuntime.identityTitle || "",
                      },
                runtime: {
                    scenePackId: Number(this.scenePackRuntime.selectedScenePackId || 0),
                    scenePackTitle: this.scenePackRuntime.selectedScenePackTitle || "",
                    executionConfigId: Number(this.scenePackRuntime.executionConfigId || 0),
                    executionConfigTitle: this.scenePackRuntime.executionConfigTitle || "",
                    currentClipId: Number(this.scenePackRuntime.currentClipId || 0),
                    currentClipTitle: this.scenePackRuntime.currentClipTitle || "",
                    currentClipType: this.scenePackRuntime.currentClipType || "",
                },
                execution: {
                    slot: sceneBinding?.slot || "default",
                    templateId: Number(sceneBinding?.template?.id || 0),
                    templateTitle: sceneBinding?.template?.title || "",
                    providerProfileId: Number(sceneBinding?.providerProfile?.id || 0),
                    providerProfileTitle: sceneBinding?.providerProfile?.title || "",
                },
            };
        },
        async buildRunningHubSceneNodeInfoList() {
            const sceneBinding = await this.resolveSceneExecutionTemplateBinding();
            const rawList = sceneBinding?.template?.content?.nodeInfoTemplateJson
                ? this.parseJsonTemplateContent(sceneBinding.template.content.nodeInfoTemplateJson, [], "执行模板的节点参数 JSON 格式不正确")
                : this.parseRunningHubNodeInfoList();
            const context = await this.buildSceneClipExecutionContext();
            return this.cloudApplyTemplateValue(rawList, context);
        },
        async buildCloudSceneBridgeRequestBody() {
            const sceneBinding = await this.resolveSceneExecutionTemplateBinding();
            const rawBody = sceneBinding?.template?.content?.requestBodyTemplateJson
                ? this.parseJsonTemplateContent(sceneBinding.template.content.requestBodyTemplateJson, {}, "执行模板的请求体 JSON 格式不正确")
                : this.parseCloudClipRequestJson();
            const context = await this.buildSceneClipExecutionContext();
            const applied = this.cloudApplyTemplateValue(rawBody, context);
            if (applied && Object.keys(applied).length > 0) {
                return applied;
            }
            return {
                sceneId: this.localConfig.config.cloudSceneId || "default",
                data: {
                    action: "scene-clip-sync",
                    provider: context.provider,
                    clip: context.clip,
                    identity: context.identity,
                    binding: context.binding,
                },
            };
        },
        async submitCloudSceneClipExecution(option: { silent?: boolean } = {}) {
            const sceneBinding = await this.resolveSceneExecutionTemplateBinding();
            const provider = sceneBinding?.providerProfile
                ? this.normalizeLiveProviderType(sceneBinding.providerProfile.content.providerType)
                : this.getCloudProvider();
            const resolved = sceneBinding?.providerProfile?.content?.baseUrl
                ? {
                      apiBaseUrl: this.normalizeCloudApiBaseUrl(sceneBinding.providerProfile.content.baseUrl || ""),
                      autoDetected: false,
                  }
                : await this.resolveCloudApiBaseUrl();
            if (!resolved.apiBaseUrl) {
                if (!option.silent) {
                    Dialog.tipError("云端片段执行失败：未找到可用云端 API 地址");
                }
                return false;
            }
            try {
                const payload: any = {
                    provider,
                    apiBaseUrl: resolved.apiBaseUrl,
                    apiKey: String(sceneBinding?.providerProfile?.content?.apiKey || this.currentCloudApiKey() || "").trim(),
                    sceneId: this.localConfig.config.cloudSceneId || "default",
                };
                if (provider === "runninghub") {
                    payload.webappId = sceneBinding?.template?.content?.webappId || this.localConfig.config.runningHubWebappId;
                    payload.nodeInfoList = await this.buildRunningHubSceneNodeInfoList();
                    payload.webhookUrl = sceneBinding?.template?.content?.webhookUrl || this.localConfig.config.runningHubWebhookUrl;
                    payload.instanceType = sceneBinding?.template?.content?.instanceType || this.localConfig.config.runningHubInstanceType;
                } else {
                    payload.clipPath =
                        sceneBinding?.template?.content?.submitPath || this.localConfig.config.cloudClipPath || "scene/clip";
                    payload.requestBody = await this.buildCloudSceneBridgeRequestBody();
                }
                const result: any = await this.callLiveHandle("live:syncCloudSceneClip", payload);
                const taskId = String(this.cloudPickFirstValue(result, ["data.taskId", "taskId"]) || "");
                if (taskId) {
                    this.cloudTaskId = taskId;
                    this.cloudTaskProvider = provider;
                }
                const previewUrl = String(
                    this.cloudPickFirstValue(
                        result,
                        provider === "runninghub"
                            ? this.runningHubStatusPaths().previewPaths
                            : ["data.previewUrl", "data.videoHls", "previewUrl", "videoHls"]
                    ) || ""
                );
                if (previewUrl) {
                    this.liveStatus.videoHls = previewUrl;
                }
                if (result?.code) {
                    if (!option.silent) {
                        Dialog.tipError(this.mapCloudErrorMessage(result?.code, result?.msg || "云端片段执行失败"));
                    }
                    return false;
                }
                return true;
            } catch (e: any) {
                if (!option.silent) {
                    Dialog.tipError(this.mapCloudInvokeError(e, "云端片段执行失败"));
                }
                return false;
            }
        },
        mapCloudInvokeError(e: any, fallback = "云端请求失败") {
            const raw = String(e?.message || e || "").trim();
            const upper = raw.toUpperCase();
            if (!raw) {
                return fallback;
            }
            if (upper.includes("FETCH FAILED") || upper.includes("ECONNREFUSED") || upper.includes("ENOTFOUND")) {
                return "云端接口连接失败，请检查云端 API 地址和服务是否已启动";
            }
            if (upper.includes("ABORT") || upper.includes("TIMEOUT")) {
                return "云端接口请求超时，请稍后重试";
            }
            return raw;
        },
        async resolveCloudApiBaseUrl() {
            if (this.isRunningHubProvider()) {
                const baseUrl = this.normalizeCloudApiBaseUrl(this.localConfig.config.runningHubBaseUrl || "https://www.runninghub.ai");
                return { apiBaseUrl: baseUrl, autoDetected: false };
            }
            const configured = this.normalizeCloudApiBaseUrl(this.localConfig.config.cloudApiBaseUrl || "");
            if (configured) {
                return { apiBaseUrl: configured, autoDetected: false };
            }
            try {
                if (!this.server) {
                    return { apiBaseUrl: "", autoDetected: false };
                }
                const serverInfo = await serverStore.serverInfo(this.server);
                const configRes: any = await $mapi.server.config(serverInfo);
                const detected = this.normalizeCloudApiBaseUrl(configRes?.data?.httpUrl || "");
                if (detected) {
                    return { apiBaseUrl: detected, autoDetected: true };
                }
            } catch (e) {
            }
            try {
                const probeRes: any = await this.callLiveHandle("live:probeCloudApiBaseUrl", {
                    candidates: [],
                });
                const probed = this.normalizeCloudApiBaseUrl(probeRes?.apiBaseUrl || "");
                if (probeRes?.ok && probed) {
                    return { apiBaseUrl: probed, autoDetected: true };
                }
            } catch (e) {
            }
            return { apiBaseUrl: "", autoDetected: false };
        },
        cloudPathList(customPath: string, defaultPaths: string[]) {
            const custom = String(customPath || "").trim();
            if (!custom) {
                return defaultPaths;
            }
            const paths = custom
                .split("|")
                .map(item => item.trim())
                .filter(item => item.length > 0);
            return paths.length ? paths : defaultPaths;
        },
        cloudGetByPath(source: any, path: string) {
            if (!source || !path) {
                return undefined;
            }
            const parts = String(path)
                .split(".")
                .map(item => item.trim())
                .filter(item => item.length > 0);
            let current: any = source;
            for (const part of parts) {
                if (current === null || typeof current === "undefined") {
                    return undefined;
                }
                if (/^\d+$/.test(part)) {
                    current = current[Number(part)];
                } else {
                    current = current[part];
                }
            }
            return current;
        },
        cloudPickFirstValue(source: any, paths: string[]) {
            for (const path of paths) {
                const value = this.cloudGetByPath(source, path);
                if (value !== null && typeof value !== "undefined" && value !== "") {
                    return value;
                }
            }
            return "";
        },
        mapCloudErrorMessage(code: any, msg: string) {
            const rawCode = String(code ?? "");
            const rawMsg = String(msg || "");
            const codeUpper = rawCode.toUpperCase();
            const msgUpper = rawMsg.toUpperCase();
            if (rawCode === "11203") {
                return "云端会话忙碌或形象占用，请先停止直播后等待 3-5 秒再重试";
            }
            if (rawCode === "11200") {
                return "云端参数校验失败，请检查 avatar_id、APPID 及服务区域";
            }
            if (rawCode === "401" || rawCode === "403" || codeUpper.includes("AUTH") || msgUpper.includes("UNAUTHORIZED") || msgUpper.includes("TOKEN")) {
                return "云端鉴权失败，请检查 API Key";
            }
            if (rawCode === "402" || codeUpper.includes("QUOTA") || msgUpper.includes("QUOTA") || msgUpper.includes("BALANCE")) {
                return "云端额度不足，请检查套餐或余额";
            }
            if (rawCode === "404" || codeUpper.includes("MODEL") || msgUpper.includes("MODEL")) {
                return "云端模型不可用，请检查模型配置";
            }
            if (rawCode === "408" || rawCode === "504" || codeUpper.includes("TIMEOUT") || msgUpper.includes("TIMEOUT") || msgUpper.includes("TIMED OUT")) {
                return "云端请求超时，请稍后重试";
            }
            return rawMsg || "云端请求失败";
        },
        mapCloudStatus(rawStatus: string) {
            const val = String(rawStatus || "").toLowerCase();
            if (val === "running") return "running";
            if (val === "starting" || val === "pending" || val === "init") return "starting";
            if (val === "stopping") return "stopping";
            if (val === "error" || val === "failed") return "error";
            if (val === "stopped" || val === "idle") return "stopped";
            return "stopped";
        },
        runningHubStatusPaths() {
            return {
                taskIdPaths: ["data.taskId", "taskId"],
                statusPaths: ["data.taskStatus", "data.status", "status", "data"],
                previewPaths: ["data.previewUrl", "data.videoHls", "data.scene.previewUrl", "data.scene.videoHls", "results.0.url", "data.0.fileUrl", "data.fileUrl"],
            };
        },
        async queryCloudStreamStatus() {
            const resolved = await this.resolveCloudApiBaseUrl();
            if (!resolved.apiBaseUrl) {
                return await this.queryMockStreamStatus();
            }
            try {
                const payload: any = {
                    provider: this.getCloudProvider(),
                    apiBaseUrl: resolved.apiBaseUrl,
                    apiKey: this.currentCloudApiKey(),
                    sceneId: this.localConfig.config.cloudSceneId || "default",
                    statusPath: this.localConfig.config.cloudStatusPath,
                    statusFallbackPath: this.localConfig.config.cloudStatusFallbackPath,
                };
                if (this.isRunningHubProvider()) {
                    payload.taskId = this.cloudTaskId;
                }
                const result: any = await this.callLiveHandle("live:getCloudStreamStatus", {
                    ...payload,
                });
                const providerDefaults = this.isRunningHubProvider() ? this.runningHubStatusPaths() : {
                    taskIdPaths: [],
                    statusPaths: [
                        "data.scene.status",
                        "data.scenes.0.status",
                        "scene.status",
                        "scenes.0.status",
                        "data.status",
                        "status",
                    ],
                    previewPaths: [
                        "data.scene.videoHls",
                        "data.scene.previewUrl",
                        "data.scenes.0.videoHls",
                        "data.scenes.0.previewUrl",
                        "scene.videoHls",
                        "scene.previewUrl",
                        "scenes.0.videoHls",
                        "scenes.0.previewUrl",
                        "data.videoHls",
                        "data.previewUrl",
                    ],
                };
                const statusPathList = this.cloudPathList(this.localConfig.config.cloudStatusFieldPath, providerDefaults.statusPaths);
                const previewPathList = this.cloudPathList(this.localConfig.config.cloudPreviewFieldPath, providerDefaults.previewPaths);
                const taskId = String(this.cloudPickFirstValue(result, providerDefaults.taskIdPaths) || this.cloudTaskId || "");
                if (taskId) {
                    this.cloudTaskId = taskId;
                    this.cloudTaskProvider = this.getCloudProvider();
                }
                const status = String(this.cloudPickFirstValue(result, statusPathList) || "");
                const previewUrl = String(this.cloudPickFirstValue(result, previewPathList) || "");
                const mappedStatus = this.mapCloudStatus(status);
                const running = result?.code === 0 && (mappedStatus === "running" || mappedStatus === "starting" || !!previewUrl);
                this.mockStream.running = running;
                this.mockStream.mode = running ? (this.localConfig.config.streamMode as any) : "";
                this.mockStream.pid = 0;
                this.liveStatus.status = mappedStatus;
                this.liveStatus.videoHls = previewUrl || "";
                if (result?.code) {
                    this.statusMsg = this.mapCloudErrorMessage(result?.code, result?.msg || "云端状态查询失败");
                }
                return this.mockStream;
            } catch (e) {
                this.mockStream.running = false;
                this.mockStream.mode = "";
                this.mockStream.pid = 0;
                this.liveStatus.status = "error";
                this.liveStatus.videoHls = "";
                if (!this.statusMsg) {
                    this.statusMsg = "云端状态查询失败";
                }
                return this.mockStream;
            }
        },
        async startCloudStream() {
            if (this.cloudStartInFlight) {
                return {ok: true, ignored: true, msg: "开播请求处理中，已自动忽略重复点击"};
            }
            const now = Date.now();
            if (now - this.cloudLastStartAt < 3000) {
                return {ok: true, ignored: true, msg: "请求过于频繁，已自动忽略本次点击"};
            }
            this.cloudStartInFlight = true;
            this.cloudLastStartAt = now;
            const sceneBinding = await this.resolveSceneExecutionTemplateBinding({
                clipType: this.scenePackRuntime.currentClipType || "idle",
            });
            const provider = sceneBinding?.providerProfile
                ? this.normalizeLiveProviderType(sceneBinding.providerProfile.content.providerType)
                : this.getCloudProvider();
            const resolved = sceneBinding?.providerProfile?.content?.baseUrl
                ? {
                      apiBaseUrl: this.normalizeCloudApiBaseUrl(sceneBinding.providerProfile.content.baseUrl || ""),
                      autoDetected: false,
                  }
                : await this.resolveCloudApiBaseUrl();
            if (!resolved.apiBaseUrl) {
                this.statusMsg = "未找到可用云端 API 地址";
                this.liveStatus.videoHls = "";
                this.cloudStartInFlight = false;
                return {
                    ok: false,
                    fallback: false,
                    msg: provider === "runninghub"
                        ? "未找到可用 RunningHub 地址，请检查 RunningHub Base URL 配置"
                        : "未找到可用云端 API 地址，请填写当前服务地址（例如 http://127.0.0.1:18000）",
                };
            }
            try {
                const payload: any = {
                    provider,
                    apiBaseUrl: resolved.apiBaseUrl,
                    apiKey: String(sceneBinding?.providerProfile?.content?.apiKey || this.currentCloudApiKey() || "").trim(),
                    sceneId: this.localConfig.config.cloudSceneId || "default",
                    startPath: this.localConfig.config.cloudStartPath,
                    streamMode: this.localConfig.config.streamMode,
                    rtmpUrl: this.localConfig.config.rtmpUrl,
                    rtmpKey: this.localConfig.config.rtmpKey,
                    liveMonitorUrl: this.localConfig.config.liveMonitorUrl,
                    model: this.localConfig.model,
                };
                if (provider === "runninghub") {
                    payload.webappId = sceneBinding?.template?.content?.webappId || this.localConfig.config.runningHubWebappId;
                    payload.nodeInfoList = await this.buildRunningHubSceneNodeInfoList();
                    payload.webhookUrl = sceneBinding?.template?.content?.webhookUrl || this.localConfig.config.runningHubWebhookUrl;
                    payload.instanceType = sceneBinding?.template?.content?.instanceType || this.localConfig.config.runningHubInstanceType;
                }
                const result: any = await this.callLiveHandle("live:startCloudStream", {
                    ...payload,
                });
                const taskId = String(this.cloudPickFirstValue(result, ["data.taskId", "taskId"]) || "");
                if (taskId) {
                    this.cloudTaskId = taskId;
                    this.cloudTaskProvider = provider;
                }
                if (result?.code) {
                    // Some cloud providers return transient errors while session is actually becoming ready.
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    const status = await this.queryCloudStreamStatus();
                    if (status?.running) {
                        this.statusMsg = "";
                        this.cloudStatusFailCount = 0;
                        this.cloudStartGraceUntil = Date.now() + 20000;
                        this.cloudSessionExpectedRunning = true;
                        return {
                            ok: true,
                            recovered: true,
                            fallback: false,
                            autoDetected: resolved.autoDetected,
                            apiBaseUrl: resolved.apiBaseUrl,
                        };
                    }
                    this.cloudSessionExpectedRunning = false;
                    return {ok: false, msg: this.mapCloudErrorMessage(result?.code, result?.msg || "云端开播失败")};
                }
                const previewPathList = this.cloudPathList(
                    this.localConfig.config.cloudPreviewFieldPath,
                    provider === "runninghub"
                        ? this.runningHubStatusPaths().previewPaths
                        : ["data.scene.videoHls", "data.scene.previewUrl", "data.videoHls", "data.previewUrl", "scene.videoHls", "scene.previewUrl"]
                );
                const previewUrl = String(this.cloudPickFirstValue(result, previewPathList) || "");
                this.liveStatus.videoHls = previewUrl || "";
                this.statusMsg = "";
                this.cloudStatusFailCount = 0;
                this.cloudStartGraceUntil = Date.now() + 20000;
                this.cloudSessionExpectedRunning = true;
                return {ok: true, fallback: false, autoDetected: resolved.autoDetected, apiBaseUrl: resolved.apiBaseUrl};
            } catch (e: any) {
                this.cloudSessionExpectedRunning = false;
                const msg = this.mapCloudInvokeError(e, "云端开播失败");
                this.statusMsg = msg;
                return {ok: false, fallback: false, msg};
            } finally {
                this.cloudStartInFlight = false;
            }
        },
        async stopCloudStream() {
            const resolved = await this.resolveCloudApiBaseUrl();
            if (!resolved.apiBaseUrl) {
                await this.callLiveHandle("live:stopMockStream", {});
                this.liveStatus.videoHls = "";
                this.cloudSessionExpectedRunning = false;
                this.cloudTaskId = "";
                this.cloudTaskProvider = "";
                return {ok: true, fallback: true};
            }
            const result: any = await this.callLiveHandle("live:stopCloudStream", {
                provider: this.getCloudProvider(),
                apiBaseUrl: resolved.apiBaseUrl,
                apiKey: this.currentCloudApiKey(),
                sceneId: this.localConfig.config.cloudSceneId || "default",
                stopPath: this.localConfig.config.cloudStopPath,
                taskId: this.cloudTaskId,
            });
            if (result?.code) {
                return {ok: false, msg: this.mapCloudErrorMessage(result?.code, result?.msg || "云端停播失败")};
            }
            this.liveStatus.videoHls = "";
            this.cloudStatusFailCount = 0;
            this.cloudStartGraceUntil = 0;
            this.cloudSessionExpectedRunning = false;
            this.cloudTaskId = "";
            this.cloudTaskProvider = "";
            this.clearScenePackReturnTimer();
            return {ok: true, fallback: false};
        },
        async talkCloud(text: string, option: {silent?: boolean} = {}) {
            if (this.isRunningHubProvider()) {
                if (!option.silent) {
                    Dialog.tipError("RunningHub 当前按任务提交模式接入，暂不支持实时播报接口");
                }
                return false;
            }
            const resolved = await this.resolveCloudApiBaseUrl();
            if (!resolved.apiBaseUrl) {
                if (!option.silent) {
                    Dialog.tipError("云端播报失败：未配置云端 API 地址");
                }
                return false;
            }
            const result: any = await this.callLiveHandle("live:talkCloudStream", {
                provider: this.getCloudProvider(),
                apiBaseUrl: resolved.apiBaseUrl,
                apiKey: this.currentCloudApiKey(),
                sceneId: this.localConfig.config.cloudSceneId || "default",
                talkPath: this.localConfig.config.cloudTalkPath,
                text,
            });
            if (result?.code) {
                if (!option.silent) {
                    Dialog.tipError(this.mapCloudErrorMessage(result?.code, result?.msg || "云端播报失败"));
                }
                return false;
            }
            return true;
        },
        async queryMockStreamStatus() {
            try {
                const result: any = await this.callLiveHandle("live:getMockStreamStatus", {});
                const running = !!result?.running;
                const mode = (result?.mode || "") as "" | "rtmp" | "virtualCam";
                const pid = Number(result?.pid || 0);
                this.mockStream.running = running;
                this.mockStream.mode = running ? mode : "";
                this.mockStream.pid = running ? pid : 0;
                return this.mockStream;
            } catch (e) {
                this.mockStream.running = false;
                this.mockStream.mode = "";
                this.mockStream.pid = 0;
                return this.mockStream;
            }
        },
        async statusUpdate() {
            // console.log('update live', JSON.stringify(this.server))
            if (this.liveStatusTimer) {
                clearTimeout(this.liveStatusTimer);
            }
            
            const isCloudMode = this.localConfig.config.engineMode === "cloud";

            if (isCloudMode && (this.status === "running" || this.status === "starting" || this.status === "stopping")) {
                const cloudStatus = await this.queryCloudStreamStatus();
                if (cloudStatus.running) {
                    this.cloudStatusFailCount = 0;
                    this.status = this.liveStatus.status === "starting" ? "starting" : "running";
                    if (!this.hasCloudApiConfigured() && !this.statusMsg) {
                        this.statusMsg = "未配置云端 API，当前为本地模拟推流";
                    }
                } else if (this.status !== "stopping") {
                    this.cloudStatusFailCount += 1;
                    const inStartGrace = Date.now() < this.cloudStartGraceUntil;
                    const failThreshold = this.cloudSessionExpectedRunning ? 12 : 3;
                    const shouldHoldState = inStartGrace || this.cloudStatusFailCount < failThreshold;
                    if (shouldHoldState) {
                        if (this.status !== "running") {
                            this.status = "starting";
                        }
                        if (this.statusMsg === "" || this.statusMsg === "云端状态查询失败") {
                            this.statusMsg = "云端状态同步中，请稍候...";
                        }
                    } else {
                        this.status = this.liveStatus.status === "error" ? "error" : "stopped";
                        if (this.statusMsg === "" || this.statusMsg === "本地推流未运行" || this.statusMsg === "云端状态查询失败" || this.statusMsg === "云端状态同步中，请稍候...") {
                            this.statusMsg = this.hasCloudApiConfigured() ? "云端推流未运行" : "本地推流未运行";
                        }
                    }
                }
                this.liveStatusTimer = setTimeout(this.statusUpdate, 5000);
                return;
            }

            if (!this.server) {
                if (isCloudMode && (this.status === 'running' || this.status === 'starting')) {
                    this.liveStatusTimer = setTimeout(this.statusUpdate, 5000);
                    return;
                }
                
                if (this.status !== "stopped") {
                    this.status = "stopped";
                    this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS);
                }
                this.statusMsg = "";
                this.liveStatusTimer = setTimeout(this.statusUpdate, 2000);
                return;
            }
            // console.log('server', {
            //     serverInfo,
            //     server: ObjectUtil.clone(this.server),
            // })
            if (this.server.status !== EnumServerStatus.RUNNING) {
                // 云端模拟或本地直播伴侣模式下，忽略本地 server 状态
                if (isCloudMode && (this.status === 'running' || this.status === 'starting')) {
                    this.liveStatusTimer = setTimeout(this.statusUpdate, 5000);
                    return;
                }
                this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS);
                this.statusMsg = "";
                this.liveStatusTimer = setTimeout(this.statusUpdate, 2000);
                return;
            }
            const res = await this.apiRequest("status", {});
            // console.log('res', JSON.stringify(res, null, 2))
            if (res.code) {
                this.liveStatusTimer = setTimeout(this.statusUpdate, 2000);
                return;
            }
            const resData = res.data as any;
            const data = resData.scenes?.[0] || null;

            if (data) {
                this.liveStatus.id = data.id || SCENE_ID;
                this.liveStatus.status = data.status || "stopped";
                this.liveStatus.statusMsg = data.statusMsg || "";
                this.liveStatus.avatar.enable = data.avatar.enable;
                this.liveStatus.avatar.width = data.avatar.width;
                this.liveStatus.avatar.height = data.avatar.height;
                this.liveStatus.video.enable = data.video.enable;
                this.liveStatus.video.width = data.video.width;
                this.liveStatus.video.height = data.video.height;
                this.liveStatus.audio.enable = data.audio.enable;
                this.liveStatus.videoTitle = data.videoTitle;
                this.liveStatus.talkTitle = data.talkTitle;
                this.liveStatus.talkContent = data.talkContent;
                this.liveStatus.avatarRtmp = data.avatarRtmp || "";
                this.liveStatus.avatarHls = data.avatarHls || "";
                this.liveStatus.videoRtmp = data.videoRtmp || "";
                this.liveStatus.videoHls = data.videoHls || "";
                this.liveStatus.audioRtmp = data.audioRtmp || "";
                this.liveStatus.audioHls = data.audioHls || "";
                this.liveStatus.runtime.avatarStatus = data.runtime.avatarStatus || "";
                this.liveStatus.runtime.avatarVideoFps = data.runtime.avatarVideoFps || 0;
                this.liveStatus.runtime.avatarAudioFps = data.runtime.avatarAudioFps || 0;
                this.liveStatus.runtime.videoStatus = data.runtime.videoStatus || "";
                this.liveStatus.runtime.videoVideoFps = data.runtime.videoVideoFps || 0;
                this.liveStatus.runtime.videoAudioFps = data.runtime.videoAudioFps || 0;
                this.liveStatus.runtime.audioStatus = data.runtime.audioStatus || "";
                this.liveStatus.runtime.audioFps = data.runtime.audioFps || 0;
            } else {
                this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS);
            }
            if (this.liveStatus.status === "stopped") {
                this.status = "stopped";
            } else if (this.liveStatus.status === "running") {
                this.status = "running";
            }
            
            // 只有在非云端模拟模式且有服务器的情况下，才继续轮询后端真实状态
            if (this.server) {
                this.liveStatusTimer = setTimeout(this.statusUpdate, 5000);
            }
        },
        async apiRequest(
            url: string,
            param: {
                [key: string]: any;
            } = {}
        ) {
            if (!this.server) {
                return {
                    code: -1,
                    msg: "没有可用的直播服务器",
                    data: {},
                };
            }
            const serverInfo = await serverStore.serverInfo(this.server);
            return await $mapi.server.callFunctionWithException(serverInfo, "apiRequest", {
                id: "live",
                result: {},
                url,
                param,
            });
        },
        async configUpdate() {
            const res = await this.apiRequest("config", {});
            let ttsProviders: any[] = [];
            if (0 === res.code) {
                const resData = res.data as any;
                ttsProviders = resData.ttsProviders || [];
            }
            for (const server of serverStore.records) {
                if (server.status !== EnumServerStatus.RUNNING) {
                    continue;
                }
                const res = await $mapi.server.config(await serverStore.serverInfo(server));
                if (res.code) {
                    continue;
                }
                const config = res.data;
                
                // 判断服务是否包含语音合成功能 (不再硬编码服务名称，支持 InfiniteTalk, indexTTS2 等任意实现了该接口的模型)
                let param = [];
                let hasTts = false;
                if (config.functions && "soundTts" in config.functions) {
                    param = config.functions.soundTts.param || [];
                    hasTts = true;
                } else if (config.functions && "soundClone" in config.functions) {
                    param = config.functions.soundClone.param || [];
                    hasTts = true;
                }
                
                if (!hasTts) {
                    continue;
                }

                const setting = {};
                if (config.httpUrl) {
                    setting["httpUrl"] = config.httpUrl;
                }

                ttsProviders.push({
                    name: server.name,
                    title: server.title,
                    param: param,
                    setting: setting,
                });
            }
            // console.log('ttsProviders', ttsProviders)
            this.serverConfig.ttsProviders = ttsProviders;
            if (!this.localConfig.config.ttsProvider && this.serverConfig.ttsProviders.length > 0) {
                this.localConfig.config.ttsProvider = this.serverConfig.ttsProviders[0].name;
            }
        },
        async buildData() {
            const avatars: any[] = [];
            if (this.localConfig.mode === "avatar") {
                const videoTemplate = await VideoTemplateService.get(this.localConfig.avatar.avatarId);
                if (!videoTemplate) {
                    throw t("live.noAvatarSelected");
                }
                avatars.push({
                    id: "Avatar" + videoTemplate.id,
                    title: videoTemplate.name,
                    url: videoTemplate.video,
                });
            }
            const flowVideos: any[] = [];
            if (this.effectiveLocalVideoEnabled()) {
                const storageFlowVideos = (await StorageService.list("LiveKnowledge")).filter(s => {
                    return s.content.type === "flowVideo" && s.content.enable;
                });
                if (!(storageFlowVideos && storageFlowVideos.length > 0) && !this.hasScenePackSelected()) {
                    throw t("live.noLoopMaterialSelected");
                }
                for (const s of storageFlowVideos) {
                    flowVideos.push({
                        id: "FlowVideo" + s.id,
                        title: s.title,
                        video: s.content.url,
                    });
                }
            }
            const flowTalks: any[] = [];
            const storageFlowTalks = (await StorageService.list("LiveKnowledge")).filter(s => {
                return s.content.type === "flowTalk" && s.content.enable;
            });
            if (!(storageFlowTalks && storageFlowTalks.length > 0) && !this.hasScenePackSelected()) {
                throw t("live.noLoopMaterialSelected");
            }
            for (const s of storageFlowTalks) {
                s.content.replies = s.content.replies.map(r => {
                    return {
                        value: r.value,
                    };
                });
                flowTalks.push({
                    id: "FlowTalk" + s.id,
                    title: s.title,
                    talks: [{value: s.content.reply}, ...s.content.replies],
                    video: s.content.url,
                });
            }
            const users: any[] = [];
            const systems: any[] = [];
            const videoActions: any[] = []; // 新增：将动作库发送给后端
            
            // 获取并封装数字人动作库资产
            const storageActions = await VideoActionService.list();
            for (const a of storageActions) {
                videoActions.push({
                    id: "Action" + a.id,
                    name: a.name,
                    tags: a.tags.split(',').map(t => t.trim()).filter(Boolean),
                    video: a.video,
                    type: a.type // 'idle' 或 'action'
                });
            }

            // 获取知识库数据
            const storageUsers = await StorageService.list("LiveKnowledge");
            
            // 过滤并处理不同类型的知识库条目
            for (const s of storageUsers) {
                if (!s.content.enable) {
                    continue;
                }
                s.content.replies = s.content.replies.map(r => {
                    return {
                        value: r.value,
                    };
                });
                if (s.content.type === "user") {
                    users.push({
                        id: "User" + s.id,
                        title: s.title,
                        talks: [{value: s.content.reply}, ...s.content.replies],
                        keywords: s.content.keywords,
                        video: s.content.url,
                    });
                } else if (s.content.type === "system") {
                    // 注意：Enter, Like, Gift 等高频互动事件已统一由前端大模型/本地话术接管并实时生成音频播报
                    // 这里的 systems 仅保留可能未被前端接管的特殊事件（如 Follow, Share 等）
                    systems.push({
                        id: "System" + s.id,
                        title: s.title,
                        talks: [{value: s.content.reply}, ...s.content.replies],
                        systemType: s.content.systemType,
                        video: s.content.url,
                    });
                }
            }
            const scenePackOverrides = this.buildScenePackFlowOverrides();
            if (scenePackOverrides) {
                if (scenePackOverrides.flowVideos.length > 0) {
                    flowVideos.splice(0, flowVideos.length, ...scenePackOverrides.flowVideos);
                }
                if (scenePackOverrides.flowTalks.length > 0) {
                    flowTalks.splice(0, flowTalks.length, ...scenePackOverrides.flowTalks);
                }
            }
            return {avatars, flowVideos, flowTalks, users, systems, videoActions};
        },
        async update() {
            const configPost = {
                id: SCENE_ID,
                config: {
                    flowVideoMode: this.localConfig.config.flowVideoMode,
                    flowTalkMode: this.localConfig.config.flowTalkMode,
                    flowTalkDelayMin: this.localConfig.config.flowTalkDelayMin,
                    flowTalkDelayMax: this.localConfig.config.flowTalkDelayMax,
                },
                data: await this.buildData(),
            };
            const res = await this.apiRequest("scene/update", {
                scene: ObjectUtil.clone(configPost),
            });
            if (res.code) {
                Dialog.tipError(t("error.updateFailed") + ":" + res.msg);
            } else {
                Dialog.tipSuccess(t("live.knowledgeUpdated"));
            }
        },
        async start() {
            this.clearScenePackReturnTimer();
            await this.saveLocalConfig();
            let sceneData;
            try {
                sceneData = await this.buildData();
            } catch (e) {
                Dialog.tipError(mapError(e));
                return false;
            }
            // console.log('live.start', this.localConfig)
            const configPost = {
                id: SCENE_ID,
                model: this.localConfig.model,
                avatar: {
                    enable: this.localConfig.mode === "avatar",
                    width: this.localConfig.avatar.width,
                    height: this.localConfig.avatar.height,
                },
                audio: {
                    enable: this.localConfig.mode === "audio",
                },
                video: {
                    enable: this.effectiveLocalVideoEnabled(),
                    width: this.localConfig.video.width,
                    height: this.localConfig.video.height,
                },
                config: {
                    flowVideoMode: this.localConfig.config.flowVideoMode,
                    flowTalkMode: this.localConfig.config.flowTalkMode,
                    flowTalkDelayMin: this.localConfig.config.flowTalkDelayMin,
                    flowTalkDelayMax: this.localConfig.config.flowTalkDelayMax,
                    ttsProvider: this.localConfig.config.ttsProvider,
                    ttsProviderParam: this.localConfig.config.ttsProviderParam,
                    ttsProviderSetting: this.localConfig.config.ttsProviderSetting,
                    eventDefaultUsername: this.localConfig.config.eventDefaultUsername,
                    eventEnterIgnoreSecond: this.localConfig.config.eventEnterIgnoreSecond,
                    engineMode: this.localConfig.config.engineMode,
                    replyMode: this.localConfig.config.replyMode,
                    thanksMode: this.localConfig.config.thanksMode,
                    prompt: this.localConfig.config.prompt,
                    localThanks: this.localConfig.config.localThanks,
                    rtmpUrl: this.localConfig.config.rtmpUrl,
                    rtmpKey: this.localConfig.config.rtmpKey,
                },
                data: sceneData,
            };
            const configPostContent = JSON.stringify(configPost, null, 2);
            await $mapi.file.write("data-live-last.json", configPostContent);
            this.status = "starting";
            this.statusMsg = "";
            const res = await this.apiRequest("scene/start", {
                scene: ObjectUtil.clone(configPost),
            });
            if (res.code) {
                this.status = "error";
                this.statusMsg = res.msg;
                Dialog.tipError(t("service.startFailed") + ":" + res.msg);
                return false;
            }
            return true;
        },
        async stop() {
            this.clearScenePackReturnTimer();
            this.status = "stopping";
            this.flushPendingTalkWaiters();
            const res = await this.apiRequest("scene/stop", {sceneId: SCENE_ID});
            // console.log('live.stop', res)
            if (res.code) {
                this.status = "error";
                this.statusMsg = res.msg;
                Dialog.tipError(t("common.stopFailed") + ":" + res.msg);
                return;
            }
            this.statusMsg = "";
        },
        async talk(text, option: {silent?: boolean} = {}) {
            const res = await this.apiRequest("scene/talk", {sceneId: SCENE_ID, data: {text}});
            if (res.code) {
                if (!option.silent) {
                    Dialog.tipError(t("common.sendFailed") + ":" + res.msg);
                }
                return false;
            }
            if (!option.silent) {
                Dialog.tipSuccess(t("common.sendSuccess"));
            }
            return true;
        },
        fireEvent(type, data) {
            this.apiRequest("scene/event", {sceneId: SCENE_ID, type, data});
        },
        async onMonitorBroadcast(data: any) {
            // console.log('MonitorEvent', JSON.stringify(data))
            this.liveRuntime.liveMonitorEvent = data;
            
            // 新增：将弹幕保存到前端数组中用于展示 (最多保留50条)
            this.recentEvents.push({
                id: Date.now() + Math.random().toString(),
                time: new Date(),
                type: data.type,
                ...data.data
            });
            if (this.recentEvents.length > 50) {
                this.recentEvents.shift();
            }

            // {"type":"Comment","data":{"source":"douyin","username":"老*****","content":"111"}}
            StorageService.add("LiveEvent", {
                title: data.type,
                content: data.data,
            });
            if (data.type === "Enter") {
                this.fireEvent("Enter", {
                    username: data.data.username,
                });
                // 触发进场欢迎
                this.handleAutoReply(data.data.username, "", "Enter");
            } else if (data.type === "Like") {
                this.fireEvent("Like", {
                    username: data.data.username,
                });
                // 触发点赞回复
                this.handleAutoReply(data.data.username, "点赞", "Like");
            } else if (data.type === "Gift") {
                this.fireEvent("Gift", {
                    username: data.data.username,
                    content: data.data.content,
                });
                // 触发礼物感谢
                this.handleAutoReply(data.data.username, data.data.content, "Gift");
            } else if (data.type === "Comment") {
                // 判断是否为自己或主播发出的消息 (由前端监控脚本传入)
                const isSelf = data.data.isSelf || false;
                
                // 防回声检查：如果在最近几秒内发送过完全一样的内容，也视为自己发的消息
                const recentMatchIndex = this.recentSentMessages.findIndex(m => m.text === data.data.content && (Date.now() - m.time < 10000));
                const isEcho = recentMatchIndex !== -1;
                
                if (isEcho) {
                    // 清理匹配到的记录
                    this.recentSentMessages.splice(recentMatchIndex, 1);
                }

                if (isSelf || isEcho) {
                    console.log("检测到 AI 或主播自己发送的消息，仅在公屏展示，不触发自动回复:", data.data.content);
                    // 不执行 fireEvent 和后续的大模型回复逻辑，直接返回
                    return;
                }

                this.fireEvent("Comment", {
                    content: data.data.content,
                    username: data.data.username,
                });
                
                // 触发弹幕回复
                this.handleAutoReply(data.data.username, data.data.content, "Comment");
            }
        },
        async handleAutoReply(username: string, content: string, eventType: "Comment" | "Like" | "Gift" | "Enter") {
            // 本地 LLM 自动回复逻辑
            if (this.status === "running") {
                try {
                    const modelStore = useModelStore();
                    const enabledModels = await modelStore.enabledModels();
                    let providerId = "";
                    let modelId = "";
                    
                    if (enabledModels && enabledModels.length > 0) {
                        providerId = enabledModels[0].providerId;
                        modelId = enabledModels[0].modelId;
                    }
                    
                    let finalReplyText = "";

                    if (eventType === "Comment") {
                        // 匹配知识库逻辑
                        let matchedReply = "";
                        const knowledgeRecords = await StorageService.list("LiveKnowledge");
                        for (const record of knowledgeRecords) {
                            if (record.content.enable && record.content.type === "user") {
                                const keywords = record.content.keywords.split(/[,，]/);
                                for (const keyword of keywords) {
                                    if (keyword.trim() && content.includes(keyword.trim())) {
                                        matchedReply = record.content.reply;
                                        break;
                                    }
                                }
                            }
                            if (matchedReply) break;
                        }

                        // 如果匹配到知识库
                        if (matchedReply) {
                            // 替换变量
                            finalReplyText = matchedReply.replace(/{user}/g, username);
                        } else {
                            // 没匹配到知识库，走大模型自动生成
                            if (providerId && modelId) {
                                try {
                                    const promptTemplate = this.localConfig.config.prompt.replyComment;
                                    const prompt = promptTemplate.replace(/{user}/g, username).replace(/{content}/g, content);
                                    const systemPrompt = this.localConfig.config.prompt.persona;
                                    
                                    const chatRes = await modelStore.chat(providerId, modelId, prompt, { systemPrompt: systemPrompt });
                                    if (chatRes.code === 0 && chatRes.data && chatRes.data.content) {
                                        finalReplyText = chatRes.data.content;
                                    }
                                } catch (e) {
                                    console.error("LLM API Exception:", e);
                                }
                            }
                        }
                    } else if (eventType === "Like") {
                        if (this.localConfig.config.thanksMode === "llm" && providerId && modelId) {
                            try {
                                const promptTemplate = this.localConfig.config.prompt.replyLike;
                                const prompt = promptTemplate.replace(/{user}/g, username);
                                const systemPrompt = this.localConfig.config.prompt.persona;

                                const chatRes = await modelStore.chat(providerId, modelId, prompt, { systemPrompt: systemPrompt });
                                if (chatRes.code === 0 && chatRes.data && chatRes.data.content) {
                                    finalReplyText = chatRes.data.content;
                                }
                            } catch (e) { console.error("LLM API Exception:", e); }
                        }
                        
                        if (!finalReplyText) {
                            // 点赞感谢话术 (本地极速)
                            const likeThanks = this.localConfig.config.localThanks.like;
                            const template = likeThanks[Math.floor(Math.random() * likeThanks.length)];
                            finalReplyText = template.replace(/{user}/g, username);
                        }
                    } else if (eventType === "Gift") {
                        if (this.localConfig.config.thanksMode === "llm" && providerId && modelId) {
                            try {
                                const promptTemplate = this.localConfig.config.prompt.replyGift;
                                const prompt = promptTemplate.replace(/{user}/g, username).replace(/{content}/g, content);
                                const systemPrompt = this.localConfig.config.prompt.persona;

                                const chatRes = await modelStore.chat(providerId, modelId, prompt, { systemPrompt: systemPrompt });
                                if (chatRes.code === 0 && chatRes.data && chatRes.data.content) {
                                    finalReplyText = chatRes.data.content;
                                }
                            } catch (e) { console.error("LLM API Exception:", e); }
                        }
                        
                        if (!finalReplyText) {
                            // 礼物感谢话术 (本地极速)
                            const giftThanks = this.localConfig.config.localThanks.gift;
                            const template = giftThanks[Math.floor(Math.random() * giftThanks.length)];
                            finalReplyText = template.replace(/{user}/g, username).replace(/{content}/g, content);
                        }
                    } else if (eventType === "Enter") {
                        if (this.localConfig.config.thanksMode === "llm" && providerId && modelId) {
                            try {
                                const promptTemplate = this.localConfig.config.prompt.replyEnter;
                                const prompt = promptTemplate.replace(/{user}/g, username);
                                const systemPrompt = this.localConfig.config.prompt.persona;

                                const chatRes = await modelStore.chat(providerId, modelId, prompt, { systemPrompt: systemPrompt });
                                if (chatRes.code === 0 && chatRes.data && chatRes.data.content) {
                                    finalReplyText = chatRes.data.content;
                                }
                            } catch (e) { console.error("LLM API Exception:", e); }
                        }
                        
                        if (!finalReplyText) {
                            // 进场欢迎话术 (本地极速)
                            const enterThanks = this.localConfig.config.localThanks.enter;
                            const template = enterThanks[Math.floor(Math.random() * enterThanks.length)];
                            finalReplyText = template.replace(/{user}/g, username);
                        }
                    }

                    if (finalReplyText) {
                        // 记录 AI 回复到面板 (提早展示)
                        this.recentEvents.push({
                            id: Date.now() + Math.random().toString(),
                            time: new Date(),
                            type: 'AI_Reply',
                            username: username,
                            content: finalReplyText
                        });
                        if (this.recentEvents.length > 50) {
                            this.recentEvents.shift();
                        }
                        
                        const replyMode = this.localConfig.config.replyMode || 'voice';
                        let doVoice = false;
                        let doText = false;
                        
                        // 点赞、礼物和进场默认只用语音播报，不刷屏打字
                        if (eventType === "Like" || eventType === "Gift" || eventType === "Enter") {
                            doVoice = true;
                        } else {
                            if (replyMode === 'voice') {
                                doVoice = true;
                            } else if (replyMode === 'text') {
                                doText = true;
                            } else if (replyMode === 'both') {
                                doVoice = true;
                                doText = true;
                            } else if (replyMode === 'random') {
                                if (Math.random() > 0.5) {
                                    doVoice = true;
                                } else {
                                    doText = true;
                                }
                            }
                        }

                        // 将任务推入队列并尝试处理
                        this.replyQueue.push({
                            username,
                            text: finalReplyText,
                            eventType,
                            doVoice,
                            doText
                        });
                        
                        this.processReplyQueue();
                    }
                } catch (e) {
                    console.error("LLM 自动回复失败:", e);
                }
            }
        },
        async processReplyQueue() {
            // 如果正在播报，或者队列为空，则不执行
            if (this.isSpeaking || this.replyQueue.length === 0) {
                return;
            }

            // 取出队首任务并标记为正在播报
            const task = this.replyQueue.shift();
            if (!task) return;
            
            this.isSpeaking = true;
            
            // 更新当前播报状态UI
            this.liveStatus.talkTitle = "回复 " + task.username;
            this.liveStatus.talkContent = task.text;

            // 1. 处理打字回复 (不需要等待)
            if (task.doText) {
                try {
                    this.recentSentMessages.push({ text: task.text, time: Date.now() });
                    if (this.recentSentMessages.length > 20) this.recentSentMessages.shift();

                    window.$mapi.event.callPage("monitor", "MonitorData", {
                        type: "SendMessage",
                        data: {
                            platform: this.localConfig.config.liveMonitorType,
                            text: task.text
                        }
                    }).catch(err => {
                        console.log("打字回复发送失败, 可能是监听窗口未打开", err);
                    });
                } catch (e) {
                    console.error("打字回复发送异常:", e);
                }
            }

            // 2. 处理语音播报 (需要等待播放完毕)
            if (task.doVoice) {
                if (this.localConfig.config.engineMode === 'local' && this.server) {
                    const sent = await this.talk(task.text, {silent: true});
                    if (sent) {
                        await this.waitLocalTalkDone();
                    }
                } else if (this.localConfig.config.engineMode === 'cloud' && this.hasCloudApiConfigured()) {
                    const sent = await this.talkCloud(task.text, {silent: true});
                    if (sent) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                } else {
                    await this.playTtsFrontend(task.text);
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            // 当前任务处理完毕，释放标记并处理下一个
            this.isSpeaking = false;
            this.processReplyQueue();
        },
        async playTtsFrontend(text: string): Promise<void> {
            return new Promise(async (resolve) => {
                const providerName = this.localConfig.config.ttsProvider;
                if (!providerName) {
                    // 兜底：如果没配语音模型，也要停留一段时间，用于展示 UI 的打断动画
                    setTimeout(() => resolve(), 3000);
                    return;
                }

                const ttsServer = serverStore.records.find(s => s.name === providerName);
                if (!ttsServer || ttsServer.status !== EnumServerStatus.RUNNING) {
                    setTimeout(() => resolve(), 3000);
                    return;
                }

                try {
                    const serverInfo = await serverStore.serverInfo(ttsServer);
                    const configRes = await $mapi.server.config(serverInfo);
                    const config = configRes.data;
                    
                    let funcName = "";
                    if (config.functions && "soundTts" in config.functions) {
                        funcName = "soundTts";
                    } else if (config.functions && "soundClone" in config.functions) {
                        funcName = "soundClone";
                    } else {
                        // 兜底：如果没配语音模型，也要停留一段时间，用于展示 UI 的打断动画
                        setTimeout(() => resolve(), 3000);
                        return;
                    }

                    const res = await $mapi.server.callFunctionWithException(serverInfo, funcName, {
                        id: "live_frontend_tts_" + Date.now(),
                        result: {},
                        param: this.localConfig.config.ttsProviderParam || {},
                        text: text
                    });

                    if (res && res.code === 0 && res.data && res.data.file) {
                        const audio = new Audio("file://" + res.data.file);
                        
                        // 监听音频播放结束事件
                        audio.onended = () => {
                            resolve();
                        };
                        
                        // 监听音频错误事件（防止因文件损坏卡死队列）
                        audio.onerror = (e) => {
                            console.error("音频播放出错:", e);
                            resolve();
                        };

                        audio.play().catch(e => {
                            console.error("音频播放失败:", e);
                            resolve(); // 即使报错也释放 Promise，避免队列永久卡死
                        });
                    } else {
                        resolve();
                    }
                } catch (e) {
                    console.error("前端调用 TTS 播放失败:", e);
                    resolve();
                }
            });
        },
        async startMonitor() {
            if (!this.localConfig.config.liveMonitorUrl) {
                Dialog.tipError(t("live.setLiveRoomAddressFirst"));
                return;
            }
            await this.saveLocalConfig();
            window.__page.offBroadcast("MonitorEvent", this.onMonitorBroadcast);
            window.__page.onBroadcast("MonitorEvent", this.onMonitorBroadcast);
            
            try {
                // 使用原版项目中最标准的窗口打开方式
                let scriptType = "server/live_monitor_script";
                if (this.localConfig.config.liveMonitorUrl.includes("bilibili.com")) {
                    scriptType = "local:bilibili";
                } else if (this.localConfig.config.liveMonitorUrl.includes("douyin.com")) {
                    scriptType = "local:douyin";
                } else if (this.localConfig.config.liveMonitorUrl.includes("kuaishou.com")) {
                    scriptType = "local:kuaishou";
                }

                await window.$mapi.app.windowOpen("monitor", {
                    title: "直播监听",
                    width: 1300,
                    height: 800,
                    url: this.localConfig.config.liveMonitorUrl,
                    script: scriptType,
                    openDevTools: false,
                    broadcastPages: ["main"],
                });
            } catch(e) {
                console.error("打开弹幕窗口失败", e);
            }
        },
        async stopMonitor() {
            await $mapi.app.windowClose("monitor");
        },
    },
});

const live = liveStore(store);
live.init().then(() => {
});

export const useLiveStore = () => {
    return live;
};
