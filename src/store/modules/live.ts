import { defineStore } from "pinia";
import { computed } from "vue";
import { t } from "../../lang";
import { Dialog } from "../../lib/dialog";
import { mapError } from "../../lib/error";
import { ObjectUtil } from "../../lib/util";
import { StorageService } from "../../service/StorageService";
import { VideoTemplateService } from "../../service/VideoTemplateService";
import { LiveStatusType } from "../../types/Live";
import { EnumServerStatus, ServerRecord } from "../../types/Server";
import store from "../index";
import { useServerStore } from "./server";
import { useModelStore } from "../../module/Model/store/model";

const serverStore = useServerStore();

export const liveModels = [
    {value: "wav2lip", title: "Wav2Lip标准版"},
    {value: "wav2lip384", title: "Wav2Lip清晰版"},
]

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
                    ]
                },
                rtmpUrl: "",
                rtmpKey: "",
            },
        },
        status: "stopped" as LiveStatusType,
        statusMsg: "",
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
            await this.statusUpdate();
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
        async statusUpdate() {
            // console.log('update live', JSON.stringify(this.server))
            if (this.liveStatusTimer) {
                clearTimeout(this.liveStatusTimer);
            }
            
            // 如果是云端模式且正在运行，不要被本地的轮询打断状态
            if (this.localConfig.config.engineMode === 'cloud' && (this.status === 'running' || this.status === 'starting')) {
                // Keep checking just to maintain the loop, but don't reset status
                this.liveStatusTimer = setTimeout(this.statusUpdate, 5000);
                return;
            }

            if (!this.server) {
                if (this.localConfig.config.engineMode === 'cloud' && (this.status === 'running' || this.status === 'starting')) {
                    this.liveStatusTimer = setTimeout(this.statusUpdate, 5000);
                    return;
                }
                
                if (this.status !== "stopped") {
                    this.status = "stopped";
                    this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS);
                }
                this.liveStatusTimer = setTimeout(this.statusUpdate, 2000);
                return;
            }
            // console.log('server', {
            //     serverInfo,
            //     server: ObjectUtil.clone(this.server),
            // })
            if (this.server.status !== EnumServerStatus.RUNNING) {
                // 如果是云端模式且正在运行，忽略本地 server 的状态
                if (this.localConfig.config.engineMode === 'cloud' && (this.status === 'running' || this.status === 'starting')) {
                    this.liveStatusTimer = setTimeout(this.statusUpdate, 5000);
                    return;
                }
                this.liveStatus = ObjectUtil.clone(EMPTY_LIVE_STATUS);
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
            if (this.localConfig.video.enable) {
                const storageFlowVideos = (await StorageService.list("LiveKnowledge")).filter(s => {
                    return s.content.type === "flowVideo" && s.content.enable;
                });
                if (!(storageFlowVideos && storageFlowVideos.length > 0)) {
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
            if (!(storageFlowTalks && storageFlowTalks.length > 0)) {
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
            const storageUsers = await StorageService.list("LiveKnowledge");
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
                    systems.push({
                        id: "System" + s.id,
                        title: s.title,
                        talks: [{value: s.content.reply}, ...s.content.replies],
                        systemType: s.content.systemType,
                        video: s.content.url,
                    });
                }
            }
            return {avatars, flowVideos, flowTalks, users, systems};
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
            await this.saveLocalConfig();
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
                    enable: this.localConfig.video.enable,
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
                data: await this.buildData(),
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
                return;
            }
        },
        async stop() {
            this.status = "stopping";
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
        async talk(text) {
            const res = await this.apiRequest("scene/talk", {sceneId: SCENE_ID, data: {text}});
            if (res.code) {
                Dialog.tipError(t("common.sendFailed") + ":" + res.msg);
                return;
            }
            Dialog.tipSuccess(t("common.sendSuccess"));
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
        async handleAutoReply(username: string, content: string, eventType: "Comment" | "Like" | "Gift") {
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
                    }

                    if (finalReplyText) {
                        // 记录 AI 回复到面板
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
                        
                        // 更新当前播报状态
                        this.liveStatus.talkTitle = "回复 " + username;
                        this.liveStatus.talkContent = finalReplyText;
                        
                        const replyMode = this.localConfig.config.replyMode || 'voice';
                        let doVoice = false;
                        let doText = false;
                        
                        // 点赞和礼物默认只用语音播报，不刷屏打字
                        if (eventType === "Like" || eventType === "Gift") {
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

                        if (doVoice) {
                            // 将生成的文本加入播报历史并进行语音合成（如果需要的话，调用后端的 talk 接口）
                            if (this.localConfig.config.engineMode === 'local' && this.server) {
                                this.talk(finalReplyText);
                            } else {
                                // 如果没有启动本地直播服务，直接在前端调用选定的 TTS 模型念出来
                                this.playTtsFrontend(finalReplyText);
                            }
                        }
                        
                        if (doText) {
                            // 通过 IPC 向 monitor 窗口发送打字回复指令
                            try {
                                // 记录到发送历史，防止回声
                                this.recentSentMessages.push({ text: finalReplyText, time: Date.now() });
                                if (this.recentSentMessages.length > 20) this.recentSentMessages.shift();

                                window.$mapi.event.callPage("monitor", "MonitorData", {
                                    type: "SendMessage",
                                    data: {
                                        platform: this.localConfig.config.liveMonitorType,
                                        text: finalReplyText
                                    }
                                }).catch(err => {
                                    console.log("打字回复发送失败, 可能是监听窗口未打开", err);
                                });
                            } catch (e) {
                                console.error("打字回复发送异常:", e);
                            }
                        }
                    }
                } catch (e) {
                    console.error("LLM 自动回复失败:", e);
                }
            }
        },
        async playTtsFrontend(text: string) {
            const providerName = this.localConfig.config.ttsProvider;
            if (!providerName) return;

            const ttsServer = serverStore.records.find(s => s.name === providerName);
            if (!ttsServer || ttsServer.status !== EnumServerStatus.RUNNING) return;

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
                    audio.play().catch(e => console.error("音频播放失败:", e));
                }
            } catch (e) {
                console.error("前端调用 TTS 播放失败:", e);
            }
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
