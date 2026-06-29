import { CloudTemplateRecord } from "../../service/CloudTemplateService";
import { CloudTemplateTaskService } from "../../service/CloudTemplateTaskService";
import { DigitalHumanClipRecord, DigitalHumanClipService } from "../../service/DigitalHumanClipService";
import { DirectApiPlatformRecord } from "../../service/DirectApiPlatformService";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { TaskBiz } from "../../store/modules/task";

export type DigitalHumanClipChainDraft = {
    id: string;
    title: string;
    clipType: string;
    displayMode: string;
    script: string;
    durationSeconds: number;
    savedClipId?: number;
};

export type DigitalHumanClipChainParam = {
    productTitle: string;
    productId?: string;
    identityId?: number;
    identityTitle?: string;
    audioTemplateId?: number;
    audioPrompt?: string;
    visualPrompt?: string;
    referenceImage?: string;
    referenceVideo?: string;
    referenceAudio?: string;
    generationChannel: "cloud-template" | "seedance";
    videoTemplate?: CloudTemplateRecord | null;
    seedancePlatform?: DirectApiPlatformRecord | null;
    seedanceModel?: string;
    seedanceRatio?: string;
    seedanceResolution?: string;
    generateAudio?: boolean;
    drafts: DigitalHumanClipChainDraft[];
};

type DigitalHumanClipChainState = {
    draftId: string;
    savedClipId?: number;
    audioTaskId?: number;
    videoTaskId?: number;
    audioUrl?: string;
    videoUrl?: string;
    status?: "queue" | "audio-running" | "video-running" | "success";
};

type DigitalHumanClipChainJobResult = {
    currentIndex: number;
    states: DigitalHumanClipChainState[];
};

const collectStringValues = (value: any, result: string[] = []) => {
    if (!value) return result;
    if (typeof value === "string") {
        if (value.trim()) result.push(value.trim());
        return result;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectStringValues(item, result));
        return result;
    }
    if (typeof value === "object") {
        Object.values(value).forEach(item => collectStringValues(item, result));
    }
    return result;
};

const taskOutputCandidates = (task: TaskRecord | null) => {
    if (!task) return [];
    return [
        ...(Array.isArray(task.result?.localFiles) ? task.result.localFiles : []),
        task.result?.audio,
        task.result?.video,
        task.result?.image,
        task.result?.url,
        ...(Array.isArray(task.result?.urls) ? task.result.urls : []),
        ...(Array.isArray(task.result?.remoteUrls) ? task.result.remoteUrls : []),
        ...collectStringValues(task.result?.remoteResults || task.jobResult?.Query?.results || []),
    ]
        .map(item => String(item || "").trim())
        .filter(Boolean);
};

const isAudioOutput = (value: string) => /\.(mp3|wav|m4a|aac|flac|ogg)(\?|#|$)/i.test(value);
const isVideoOutput = (value: string) => /\.(mp4|mov|webm|mkv|avi)(\?|#|$)/i.test(value);

const extractTaskOutputAudio = (task: TaskRecord | null) => {
    const values = taskOutputCandidates(task);
    return values.find(isAudioOutput) || values[0] || "";
};

const extractTaskOutputVideo = (task: TaskRecord | null) => {
    const values = taskOutputCandidates(task);
    return values.find(isVideoOutput) || values[0] || "";
};

const fieldLooksLike = (field: any, words: string[]) => {
    const text = [field?.name, field?.label, field?.title, field?.description]
        .map(item => String(item || "").toLowerCase())
        .join(" ");
    return words.some(word => text.includes(String(word).toLowerCase()));
};

const cloudFieldValue = (field: any, param: DigitalHumanClipChainParam, draft: DigitalHumanClipChainDraft, audioUrl?: string) => {
    const type = String(field?.type || "").toLowerCase();
    const fullPrompt = [
        param.visualPrompt || "",
        "商品：" + (param.productTitle || ""),
        "片段类型：" + (draft.clipType || ""),
        "口播文案：" + (draft.script || ""),
        param.audioPrompt ? "音频/情绪提示：" + param.audioPrompt : "",
    ].filter(Boolean).join("\n");
    if (fieldLooksLike(field, ["audio", "voice", "音频", "声音", "音色"])) return audioUrl || param.referenceAudio || "";
    if (fieldLooksLike(field, ["image", "avatar", "photo", "picture", "参考图", "图片", "形象"])) return param.referenceImage || "";
    if (fieldLooksLike(field, ["video", "template", "reference_video", "参考视频", "视频"])) return param.referenceVideo || "";
    if (fieldLooksLike(field, ["prompt2", "audio_prompt", "voice_prompt", "情绪", "音频提示"])) return param.audioPrompt || "";
    if (fieldLooksLike(field, ["duration", "时长", "seconds"])) return Number(draft.durationSeconds || 12);
    if (fieldLooksLike(field, ["ratio", "aspect", "比例"])) return param.seedanceRatio || "9:16";
    if (fieldLooksLike(field, ["text", "script", "voiceover", "口播", "台词", "文案"])) return draft.script || "";
    if (fieldLooksLike(field, ["title", "name", "标题", "名称"])) return draft.title || "";
    if (fieldLooksLike(field, ["prompt", "提示词", "描述"])) return fullPrompt;
    if (type === "number") return Number(field.defaultValue || 0);
    if (type === "boolean" || type === "switch") return typeof field.defaultValue === "boolean" ? field.defaultValue : false;
    return field?.defaultValue ?? "";
};

const buildAudioTaskRecord = async (param: DigitalHumanClipChainParam, draft: DigitalHumanClipChainDraft) => {
    if (!param.audioTemplateId) {
        return null;
    }
    const input = {
        title: draft.title + "_口播音频",
        text: draft.script,
        prompt: draft.script,
        prompt2: param.audioPrompt || "",
        audio: param.referenceAudio || "",
        audioUrl: param.referenceAudio || "",
        referenceAudio: param.referenceAudio || "",
        referenceAudioUrl: param.referenceAudio || "",
        productTitle: param.productTitle || "",
        clipType: draft.clipType || "",
        selectedCapability: "audio",
    };
    const record = await CloudTemplateTaskService.buildTaskRecord(Number(param.audioTemplateId), input);
    record.title = draft.title + "_口播音频";
    return record;
};

const buildCloudVideoTaskRecord = async (
    param: DigitalHumanClipChainParam,
    draft: DigitalHumanClipChainDraft,
    audioUrl?: string
) => {
    const template = param.videoTemplate;
    if (!template?.id) {
        throw new Error("缺少数字人生成模板");
    }
    const prompt = [
        param.visualPrompt || "",
        "商品：" + (param.productTitle || ""),
        "片段标题：" + (draft.title || ""),
        "口播文案：" + (draft.script || ""),
        param.audioPrompt ? "音频/情绪提示：" + param.audioPrompt : "",
    ].filter(Boolean).join("\n");
    const input: Record<string, any> = {
        title: draft.title,
        text: draft.script,
        prompt,
        videoPrompt: prompt,
        imagePrompt: prompt,
        audioPrompt: param.audioPrompt || "",
        prompt2: param.audioPrompt || "",
        selectedCapability: "digital-human",
        image: param.referenceImage || "",
        imageUrl: param.referenceImage || "",
        referenceImageUrl: param.referenceImage || "",
        referenceImages: [param.referenceImage].filter(Boolean),
        video: param.referenceVideo || "",
        videoUrl: param.referenceVideo || "",
        referenceVideoUrl: param.referenceVideo || "",
        audio: audioUrl || param.referenceAudio || "",
        audioUrl: audioUrl || param.referenceAudio || "",
        referenceAudioUrl: audioUrl || param.referenceAudio || "",
        voiceoverLine: draft.script,
        duration: Number(draft.durationSeconds || 12),
        ratio: param.seedanceRatio || "9:16",
        productTitle: param.productTitle || "",
        productId: param.productId || "",
        clipType: draft.clipType,
        displayMode: draft.displayMode,
        identityId: param.identityId || 0,
        identityTitle: param.identityTitle || "",
    };
    const schemaFields = CloudTemplateTaskService.parseInputSchema(template.content.inputSchemaJson || "[]");
    schemaFields.forEach(field => {
        const key = String(field.name || "").trim();
        if (key) input[key] = cloudFieldValue(field, param, draft, audioUrl);
    });
    const missing = schemaFields
        .filter(field => {
            const key = String(field.name || "").trim();
            if (!field.required || !key) return false;
            const value = input[key];
            return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
        })
        .map(field => field.label || field.name);
    if (missing.length) {
        throw new Error("模板「" + template.title + "」缺少必填输入：" + missing.join("、"));
    }
    const record = await CloudTemplateTaskService.buildTaskRecord(Number(template.id), input);
    record.title = draft.title + "_数字人视频";
    return record;
};

const seedancePlatformModel = (platform: DirectApiPlatformRecord, value?: string) => {
    const model = value || "seedance-2.0-fast";
    if (platform.content.platformType !== "kwjm") return model;
    return model.includes("fast") ? "kw-video-v2-fast" : "kw-video-v2";
};

const buildSeedanceVideoTaskRecord = (
    param: DigitalHumanClipChainParam,
    draft: DigitalHumanClipChainDraft,
    audioUrl?: string
): TaskRecord => {
    const platform = param.seedancePlatform;
    if (!platform?.id) throw new Error("缺少 Seedance 平台");
    const prompt = [
        param.visualPrompt || "",
        "商品：" + (param.productTitle || ""),
        "片段标题：" + (draft.title || ""),
        "口播文案：" + (draft.script || ""),
        param.audioPrompt ? "音频/情绪提示：" + param.audioPrompt : "",
    ].filter(Boolean).join("\n");
    const content: any[] = [{ type: "text", text: prompt }];
    if (param.referenceImage) content.push({ type: "image_url", image_url: { url: param.referenceImage }, role: "reference_image" });
    if (param.referenceVideo) content.push({ type: "video_url", video_url: { url: param.referenceVideo }, role: "reference_video" });
    if (audioUrl || param.referenceAudio) content.push({ type: "audio_url", audio_url: { url: audioUrl || param.referenceAudio }, role: "reference_audio" });
    const body = {
        model: seedancePlatformModel(platform, param.seedanceModel),
        content,
        generate_audio: param.generateAudio !== false && !audioUrl,
        resolution: param.seedanceResolution || "720p",
        ratio: param.seedanceRatio || "9:16",
        duration: Number(draft.durationSeconds || 12),
        watermark: false,
    };
    const isKwjm = platform.content.platformType === "kwjm";
    return {
        biz: "DirectApiTask",
        title: draft.title + "_Seedance视频",
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig: {
            capability: "video",
            connectorType: "custom-api",
            providerType: platform.content.platformType,
            providerProfileId: platform.id,
            providerProfileTitle: platform.title,
            templateTitle: "Seedance 2.0",
            templateType: "custom-api",
            baseUrl: platform.content.baseUrl,
            apiKey: platform.content.apiKey,
            proxyUrl: platform.content.proxyUrl || "",
            directFileRelay: platform.content.directFileRelay || undefined,
            submitPath: isKwjm ? "/v1/videos/generations" : "/api/v3/contents/generations/tasks",
            queryPath: isKwjm ? "/v1/videos/generations/{id}" : "/api/v3/contents/generations/tasks/{id}",
            requestBodyJson: JSON.stringify(body, null, 2),
            requestFormat: "json",
        },
        param: { input: { source: "DigitalHumanClipChainTask", draft, audioUrl, prompt } },
    } as any;
};

const buildInitialJobResult = (param: DigitalHumanClipChainParam): DigitalHumanClipChainJobResult => ({
    currentIndex: 0,
    states: param.drafts.map(draft => ({
        draftId: draft.id,
        savedClipId: draft.savedClipId,
        status: "queue",
    })),
});

const updateClipAudio = async (clipId: number, audioUrl: string) => {
    const clip = await DigitalHumanClipService.get(clipId);
    if (!clip?.id) return;
    await DigitalHumanClipService.save({
        ...clip,
        content: {
            ...clip.content,
            audioUrl,
            status: clip.content.videoUrl ? "ready" : clip.content.status || "draft",
        },
    } as DigitalHumanClipRecord);
};

const updateClipVideo = async (clipId: number, videoUrl: string) => {
    const clip = await DigitalHumanClipService.get(clipId);
    if (!clip?.id) return;
    await DigitalHumanClipService.save({
        ...clip,
        content: {
            ...clip.content,
            videoUrl,
            status: "ready",
        },
    } as DigitalHumanClipRecord);
};

const updateChainRecord = async (bizId: string, jobResult: DigitalHumanClipChainJobResult, msg?: string) => {
    await TaskService.update(bizId, {
        jobResult,
        status: "running",
        statusMsg: msg || "数字人直播片段链路执行中",
    });
};

const advanceChain = async (bizId: string, bizParam?: DigitalHumanClipChainParam) => {
    const record = await TaskService.get(bizId);
    if (!record) throw new Error("链路任务不存在");
    const param = ((record.param && Object.keys(record.param).length ? record.param : bizParam) || {}) as DigitalHumanClipChainParam;
    if (!Array.isArray(param.drafts) || !param.drafts.length) throw new Error("链路任务参数缺失：drafts");
    const jobResult = (record.jobResult && Object.keys(record.jobResult).length ? record.jobResult : buildInitialJobResult(param)) as DigitalHumanClipChainJobResult;
    while (jobResult.currentIndex < param.drafts.length) {
        const draft = param.drafts[jobResult.currentIndex];
        const state = jobResult.states[jobResult.currentIndex];
        const label = "片段 " + (jobResult.currentIndex + 1) + "/" + param.drafts.length;
        if (param.audioTemplateId && !state.audioUrl) {
            if (!state.audioTaskId) {
                const audioRecord = await buildAudioTaskRecord(param, draft);
                if (audioRecord) {
                    state.audioTaskId = Number(await TaskService.submit(audioRecord));
                    state.status = "audio-running";
                    await updateChainRecord(bizId, jobResult, label + " 正在生成口播音频");
                    return "running";
                }
            }
            const audioTask = await TaskService.get(Number(state.audioTaskId || 0));
            if (audioTask?.status === "fail") throw new Error(audioTask.statusMsg || "口播音频任务失败");
            if (audioTask?.status !== "success") return "running";
            state.audioUrl = extractTaskOutputAudio(audioTask);
            if (!state.audioUrl) throw new Error("口播音频任务完成，但未识别到音频产物");
            if (state.savedClipId) await updateClipAudio(Number(state.savedClipId), state.audioUrl);
            await updateChainRecord(bizId, jobResult, label + " 已回填音频，准备生成视频");
        }
        if (!state.videoTaskId) {
            const videoRecord =
                param.generationChannel === "seedance"
                    ? buildSeedanceVideoTaskRecord(param, draft, state.audioUrl)
                    : await buildCloudVideoTaskRecord(param, draft, state.audioUrl);
            state.videoTaskId = Number(await TaskService.submit(videoRecord));
            state.status = "video-running";
            await updateChainRecord(bizId, jobResult, label + " 正在生成数字人视频");
            return "running";
        }
        const videoTask = await TaskService.get(Number(state.videoTaskId || 0));
        if (videoTask?.status === "fail") throw new Error(videoTask.statusMsg || "数字人视频任务失败");
        if (videoTask?.status !== "success") return "running";
        state.videoUrl = extractTaskOutputVideo(videoTask);
        if (!state.videoUrl) throw new Error("数字人视频任务完成，但未识别到视频产物");
        if (state.savedClipId) await updateClipVideo(Number(state.savedClipId), state.videoUrl);
        state.status = "success";
        jobResult.currentIndex += 1;
        await updateChainRecord(bizId, jobResult, label + " 已回填视频");
    }
    await TaskService.update(bizId, {
        statusMsg: "数字人直播片段链路已完成",
        jobResult,
    });
    return "success";
};

export const DigitalHumanClipChainTask: TaskBiz = {
    runFunc: async (bizId, bizParam: DigitalHumanClipChainParam) => {
        const status = await advanceChain(bizId, bizParam);
        return status === "success" ? "success" : "querying";
    },
    queryFunc: async (bizId, bizParam: DigitalHumanClipChainParam) => {
        const status = await advanceChain(bizId, bizParam);
        return status === "success" ? "success" : "running";
    },
    successFunc: async (bizId) => {
        await TaskService.update(bizId, {
            status: "success",
            endTime: Date.now(),
            result: {
                message: "数字人直播片段链路已完成",
            },
        });
    },
    failFunc: async (bizId, msg) => {
        await TaskService.update(bizId, {
            status: "fail",
            statusMsg: msg,
            endTime: Date.now(),
        });
    },
};
