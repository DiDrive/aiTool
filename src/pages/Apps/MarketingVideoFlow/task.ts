import { FileUtil } from "../../../lib/file";
import { CloudTemplateTaskService } from "../../../service/CloudTemplateTaskService";
import { DirectApiPlatformService } from "../../../service/DirectApiPlatformService";
import { TaskRecord, TaskService } from "../../../service/TaskService";
import { TaskBiz } from "../../../store/modules/task";
import { RunningHubModelConfigType } from "../RunningHubStudio/type";

type MarketingChannel = "direct" | "cloud";
type NarrationMode = "none" | "voiceover" | "character";
type SubtitleMode = "none" | "caption";

type MarketingChainScene = {
    id: string;
    title: string;
    duration: number;
    subtitle: string;
    captionOverride?: string;
    voiceoverLine?: string;
    narrationMode?: NarrationMode;
    subtitleMode?: SubtitleMode;
    imagePrompt: string;
    videoPrompt: string;
    referenceImageUrl?: string;
};

type MarketingReferenceAnalysis = {
    plot?: string;
    structure?: string;
    shotLanguage?: string;
    visualStyle?: string;
    rhythm?: string;
    characterAction?: string;
    captionAudio?: string;
    reusableRules?: string;
};

type MarketingChainDraft = {
    title: string;
    referenceAnalysis?: MarketingReferenceAnalysis;
    scenes: MarketingChainScene[];
};

type MarketingChainParam = {
    draft: MarketingChainDraft;
    form: {
        ratio: string;
        videoModel?: string;
    };
    imageChannel: MarketingChannel;
    videoChannel: MarketingChannel;
    imagePlatformId?: number;
    videoPlatformId?: number;
    imageTemplateId?: number;
    videoTemplateId?: number;
};

type MarketingChainSceneState = {
    sceneId: string;
    imageTaskId?: number;
    videoTaskId?: number;
    referenceImageUrl?: string;
    status?: "queue" | "image-running" | "video-submitted" | "success";
};

type MarketingChainJobResult = {
    currentIndex: number;
    scenes: MarketingChainSceneState[];
};

const pathToDataUrl = async (path: string) => {
    if (!path || /^(data:|https?:\/\/)/i.test(path)) {
        return path;
    }
    const buffer = await window.$mapi.file.readBuffer(path);
    if (!buffer) {
        throw new Error("参考图片读取失败");
    }
    const ext = FileUtil.getExt(path);
    const mime = FileUtil.extensionToType(ext) || "image/png";
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${mime};base64,${window.btoa(binary)}`;
};

const isDataOrRemoteUrl = (value: string) => {
    return /^(data:|https?:\/\/)/i.test(value);
};

const SEEDANCE_MIN_IMAGE_PIXELS = 409600;
const SEEDANCE_MAX_IMAGE_PIXELS = 2086876;

const dataUrlToBytes = (value: string) => {
    const raw = String(value || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
    const binary = window.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const loadImageElement = async (url: string) => {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("参考图读取失败"));
        img.src = url;
    });
    return img;
};

const normalizeSeedanceLocalImage = async (value: string) => {
    if (!value || isDataOrRemoteUrl(value)) {
        return value;
    }
    const dataUrl = await pathToDataUrl(value);
    if (!/^data:image\//i.test(dataUrl)) {
        return value;
    }
    const img = await loadImageElement(dataUrl);
    const pixels = img.naturalWidth * img.naturalHeight;
    if (pixels >= SEEDANCE_MIN_IMAGE_PIXELS && pixels <= SEEDANCE_MAX_IMAGE_PIXELS) {
        return value;
    }
    const targetPixels =
        pixels > SEEDANCE_MAX_IMAGE_PIXELS
            ? Math.floor(SEEDANCE_MAX_IMAGE_PIXELS * 0.98)
            : Math.ceil(SEEDANCE_MIN_IMAGE_PIXELS * 1.02);
    const scale = Math.sqrt(targetPixels / pixels);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return value;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const normalizedDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const file = await window.$mapi.file.hubFile("jpg", {
        returnFullPath: true,
        saveGroup: "image",
        savePathParam: {
            source: "seedance-reference",
            width: canvas.width,
            height: canvas.height,
        },
    });
    await window.$mapi.file.writeBuffer(file, dataUrlToBytes(normalizedDataUrl));
    return file;
};

const isImageOutput = (value: string) => {
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value) || /^data:image\//i.test(value);
};

const isLocalImagePath = (value: string) => {
    return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
};

const ensureMultipartImageFile = async (value: string) => {
    return value;
};

const directFileRelayEnabled = (platform: any) => {
    const relay = platform?.content?.directFileRelay;
    return Boolean(
        relay?.enabled &&
            relay?.provider === "123pan" &&
            String(relay.clientID || "").trim() &&
            String(relay.clientSecret || "").trim() &&
            String(relay.parentFileID || "").trim()
    );
};

const resolveDirectVideoReferenceImageUrl = async (platform: any, value: string) => {
    if (!value || isDataOrRemoteUrl(value)) {
        return value;
    }
    const normalizedValue = await normalizeSeedanceLocalImage(value);
    if (directFileRelayEnabled(platform)) {
        return normalizedValue;
    }
    throw new Error("123 云盘资产入库失败：当前视频参考图是本地文件，但 Seedance 平台未配置可用的 123 云盘中转。请在平台设置中填写 Client ID、Client Secret、Folder ID 并开启资产模式。");
};

const collectStringValues = (value: any, result: string[] = []) => {
    if (!value) {
        return result;
    }
    if (typeof value === "string") {
        if (value.trim()) {
            result.push(value.trim());
        }
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

const extractTaskOutputImage = (task: TaskRecord | null) => {
    if (!task) {
        return "";
    }
    const preferred = [
        ...(Array.isArray(task.result?.localFiles) ? task.result.localFiles : []),
        task.result?.image,
        task.result?.url,
        ...(Array.isArray(task.result?.urls) ? task.result.urls : []),
        ...(Array.isArray(task.result?.remoteUrls) ? task.result.remoteUrls : []),
    ]
        .map(item => String(item || "").trim())
        .filter(Boolean);
    return preferred.find(isImageOutput) || preferred[0] || collectStringValues(task.result?.remoteResults || task.jobResult?.Query?.results || []).find(isImageOutput) || "";
};

const buildConsistentImagePrompt = (
    scene: MarketingChainScene,
    continuityReferenceImageUrl?: string,
    previousScene?: MarketingChainScene
) => {
    if (!continuityReferenceImageUrl) {
        return scene.imagePrompt;
    }
    return [
        scene.imagePrompt,
        "",
        "视觉连续性要求：参考图来自上一分镜，用它保持同一条短视频的主角、场景和整体风格连续。",
        "1. 主角一致：保持主要人物的脸型、五官、发型、体型、年龄感、穿搭基调和整体气质一致；根据当前分镜重新生成姿态、表情和动作。",
        "2. 场景一致：如果当前分镜与上一分镜属于同一地点、同一时间段或同一段事件，保持空间布局、背景元素、道具、光线方向、色温和镜头质感一致，只改变当前分镜需要的动作与机位。",
        "3. 风格一致：如果当前分镜是不同地点或不同时间，不要照搬上一分镜背景，但要保持同一套视觉风格、色彩倾向、光影层次、真实感短视频质感和竖屏构图。",
        previousScene
            ? `上一分镜信息：标题「${previousScene.title}」，台词/字幕「${effectiveSceneCaption(previousScene)}」。请据此判断当前分镜是否属于相同场景。`
            : "",
    ].join("\n");
};

const cleanSentence = (value: string) => {
    return String(value || "").replace(/\s+/g, " ").trim();
};

const effectiveSceneCaption = (scene: MarketingChainScene) => {
    if (scene.subtitleMode === "none") {
        return "";
    }
    return cleanSentence(scene.captionOverride || scene.voiceoverLine || scene.subtitle || "");
};

const buildReferenceAnalysisInstruction = (analysis?: MarketingReferenceAnalysis) => {
    if (!analysis) {
        return "";
    }
    const rows = [
        analysis.plot ? `剧情推进：${analysis.plot}` : "",
        analysis.structure ? `分镜结构：${analysis.structure}` : "",
        analysis.shotLanguage ? `镜头语言：${analysis.shotLanguage}` : "",
        analysis.visualStyle ? `视觉风格：${analysis.visualStyle}` : "",
        analysis.rhythm ? `节奏：${analysis.rhythm}` : "",
        analysis.characterAction ? `主体动作：${analysis.characterAction}` : "",
        analysis.captionAudio ? `字幕/声音：${analysis.captionAudio}` : "",
        analysis.reusableRules ? `可复用规则：${analysis.reusableRules}` : "",
    ].filter(Boolean);
    if (!rows.length) {
        return "";
    }
    return [
        "参考视频拆解应用要求：",
        ...rows,
        "生成时必须迁移上述剧情结构、镜头节奏、构图/光影/色彩和字幕声音规律；但必须换成当前主题的新人物、新场景和新画面，不能复刻参考视频原人物、原动作细节、原台词或原音乐。",
    ].join("\n");
};

const appendReferenceAnalysisToPrompt = (prompt: string, analysis?: MarketingReferenceAnalysis) => {
    const instruction = buildReferenceAnalysisInstruction(analysis);
    return [prompt, instruction].filter(item => String(item || "").trim()).join("\n\n");
};

const extractProtectedTerms = (values: string[]) => {
    const terms = new Set<string>();
    const source = values.filter(Boolean).join("\n");
    const quotePattern = /[「『“"‘《]([^」』”"’》]{2,12})[」』”"’》]/g;
    let match: RegExpExecArray | null;
    while ((match = quotePattern.exec(source))) {
        const value = String(match[1] || "").trim();
        if (/^[\u4e00-\u9fa5A-Za-z0-9._-]{2,12}$/.test(value)) {
            terms.add(value);
        }
    }
    if (source.includes("他趣")) {
        terms.add("他趣");
    }
    return Array.from(terms).slice(0, 8);
};

const buildProtectedTermInstruction = (terms: string[]) => {
    if (!terms.length) {
        return "";
    }
    const extra = terms.includes("他趣") ? "；其中“他趣”必须读作“他-趣 / tā qù”，不要改成“其他 / qí tā”" : "";
    return `专有名词保护：以下词必须逐字保留并按原字发音，不要同音替换、不要改写成近义词：${terms.join("、")}${extra}。`;
};

const buildScenePositionInstruction = (scene: MarketingChainScene, sceneIndex?: number, totalScenes?: number) => {
    if (sceneIndex === undefined || totalScenes === undefined) {
        return "";
    }
    return [
        `当前分镜定位：第 ${sceneIndex + 1}/${totalScenes} 镜，标题「${scene.title}」。`,
        "本次只生成这一镜，不要把其它分镜的动作、场景和信息混进来；如果参考视频结构包含街访、痛点、讲解、收束等步骤，请只迁移当前分镜对应的步骤。",
    ].join("\n");
};

const buildVideoPromptWithSpeech = (
    scene: MarketingChainScene,
    analysis?: MarketingReferenceAnalysis,
    sceneIndex?: number,
    totalScenes?: number,
    draftTitle?: string
) => {
    const line = cleanSentence(scene.voiceoverLine || "");
    const caption = effectiveSceneCaption(scene);
    const protectedTermInstruction = buildProtectedTermInstruction(
        extractProtectedTerms([draftTitle || "", scene.title, line, caption, scene.videoPrompt])
    );
    const speechInstruction =
        scene.narrationMode === "none"
            ? "音频/台词要求：不要生成对白、旁白或人物开口；只保留自然环境声或轻微氛围音。"
            : line
              ? scene.narrationMode === "character"
                  ? `音频/台词要求：让画面中的主要角色自然开口说出这句中文台词：“${line}”。需要口型、情绪和语速匹配台词，不要省略，不要改写。`
                  : `音频/台词要求：使用自然普通话画外音完整朗读这句台词：“${line}”。画面角色可以不张口，但必须有清晰旁白，不要省略，不要改写。`
              : "音频/台词要求：如无明确台词，可使用轻微环境声，不要生成无关对白。";
    const subtitleInstruction =
        scene.subtitleMode === "none"
            ? "字幕要求：不要生成画面字幕、口播字幕、标题条或贴纸文字。"
            : `字幕要求：画面字幕应与本镜台词一致；当前字幕：${caption || line || "无"}`;
    return [
        buildScenePositionInstruction(scene, sceneIndex, totalScenes),
        appendReferenceAnalysisToPrompt(scene.videoPrompt, analysis),
        "",
        speechInstruction,
        protectedTermInstruction,
        subtitleInstruction,
    ].filter(Boolean).join("\n");
};

const submitDirectImageTask = async (
    param: MarketingChainParam,
    scene: MarketingChainScene,
    continuityReferenceImageUrl?: string,
    previousScene?: MarketingChainScene
) => {
    const platform = await DirectApiPlatformService.get(Number(param.imagePlatformId || 0));
    if (!platform || !platform.content.apiKey.trim()) {
        throw new Error("请先配置可用的 GPT Image 2 平台");
    }
    const prompt = appendReferenceAnalysisToPrompt(
        buildConsistentImagePrompt(scene, continuityReferenceImageUrl, previousScene),
        param.draft.referenceAnalysis
    );
    const body: Record<string, any> = {
        model: "gpt-image-2",
        prompt,
        size: "1024x1536",
        quality: "high",
    };
    if (continuityReferenceImageUrl) {
        body.image = await ensureMultipartImageFile(continuityReferenceImageUrl);
    } else {
        body.n = 1;
    }
    const modelConfig: RunningHubModelConfigType = {
        capability: "image",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: "短视频分镜图",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        submitPath: continuityReferenceImageUrl ? "/v1/images/edits" : "/v1/images/generations",
        queryPath: "",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: continuityReferenceImageUrl ? "form-data" : "json",
    };
    return await TaskService.submit({
        biz: "DirectApiTask",
        title: `${param.draft.title}_${scene.title}_分镜图`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: {
            input: {
                source: "MarketingVideoFlow",
                draft: param.draft,
                scene,
                prompt,
                continuityReferenceImageUrl: continuityReferenceImageUrl || "",
            },
        },
    });
};

const submitCloudImageTask = async (
    param: MarketingChainParam,
    scene: MarketingChainScene,
    continuityReferenceImageUrl?: string,
    previousScene?: MarketingChainScene
) => {
    if (!param.imageTemplateId) {
        throw new Error("请先选择云端生图模板");
    }
    const prompt = appendReferenceAnalysisToPrompt(
        buildConsistentImagePrompt(scene, continuityReferenceImageUrl, previousScene),
        param.draft.referenceAnalysis
    );
    const record = await CloudTemplateTaskService.buildTaskRecord(param.imageTemplateId, {
        title: `${param.draft.title}_${scene.title}_分镜图`,
        prompt,
        text: prompt,
        image: continuityReferenceImageUrl || "",
        imageUrl: continuityReferenceImageUrl || "",
        referenceImageUrl: continuityReferenceImageUrl || "",
        continuityReferenceImageUrl: continuityReferenceImageUrl || "",
        selectedCapability: "image",
        draft: param.draft,
        scene,
    });
    return await TaskService.submit(record);
};

const submitImageTask = async (
    param: MarketingChainParam,
    scene: MarketingChainScene,
    continuityReferenceImageUrl?: string,
    previousScene?: MarketingChainScene
) => {
    return param.imageChannel === "cloud"
        ? await submitCloudImageTask(param, scene, continuityReferenceImageUrl, previousScene)
        : await submitDirectImageTask(param, scene, continuityReferenceImageUrl, previousScene);
};

const submitDirectVideoTask = async (
    param: MarketingChainParam,
    scene: MarketingChainScene,
    referenceImageUrl: string
) => {
    const platform = await DirectApiPlatformService.get(Number(param.videoPlatformId || 0));
    if (!platform || !platform.content.apiKey.trim()) {
        throw new Error("请先配置可用的 Seedance 平台");
    }
    const resolvedReferenceImageUrl = await resolveDirectVideoReferenceImageUrl(platform, referenceImageUrl);
    const sceneIndex = param.draft.scenes.findIndex(item => item.id === scene.id);
    const videoPrompt = buildVideoPromptWithSpeech(
        scene,
        param.draft.referenceAnalysis,
        sceneIndex >= 0 ? sceneIndex : undefined,
        param.draft.scenes.length,
        param.draft.title
    );
    const body: Record<string, any> = {
        model: param.form.videoModel || "seedance-2.0-fast",
        content: [
            { type: "text", text: videoPrompt },
            ...(resolvedReferenceImageUrl
                ? [
                      {
                          type: "image_url",
                          image_url: { url: resolvedReferenceImageUrl },
                          role: "first_frame",
                      },
                  ]
                : []),
        ],
        ratio: param.form.ratio,
        duration: scene.duration,
        resolution: "720p",
        generate_audio: true,
        watermark: false,
    };
    const modelConfig: RunningHubModelConfigType = {
        capability: "video",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: "短视频片段",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        directFileRelay: platform.content.directFileRelay,
        submitPath: "/api/v3/contents/generations/tasks",
        queryPath: "/api/v3/contents/generations/tasks/{id}",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: "json",
    };
    return await TaskService.submit({
        biz: "DirectApiTask",
        title: `${param.draft.title}_${scene.title}_视频`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { source: "MarketingVideoFlow", draft: param.draft, scene, prompt: videoPrompt } },
    });
};

const submitCloudVideoTask = async (
    param: MarketingChainParam,
    scene: MarketingChainScene,
    referenceImageUrl: string
) => {
    if (!param.videoTemplateId) {
        throw new Error("请先选择云端生视频模板");
    }
    const sceneIndex = param.draft.scenes.findIndex(item => item.id === scene.id);
    const videoPrompt = buildVideoPromptWithSpeech(
        scene,
        param.draft.referenceAnalysis,
        sceneIndex >= 0 ? sceneIndex : undefined,
        param.draft.scenes.length,
        param.draft.title
    );
    const record = await CloudTemplateTaskService.buildTaskRecord(param.videoTemplateId, {
        title: `${param.draft.title}_${scene.title}_视频`,
        prompt: videoPrompt,
        text: videoPrompt,
        image: referenceImageUrl,
        imageUrl: referenceImageUrl,
        selectedCapability: "video",
        draft: param.draft,
        scene,
    });
    return await TaskService.submit(record);
};

const submitVideoTask = async (
    param: MarketingChainParam,
    scene: MarketingChainScene,
    referenceImageUrl: string
) => {
    return param.videoChannel === "cloud"
        ? await submitCloudVideoTask(param, scene, referenceImageUrl)
        : await submitDirectVideoTask(param, scene, referenceImageUrl);
};

const buildInitialJobResult = (param: MarketingChainParam): MarketingChainJobResult => {
    if (!Array.isArray(param?.draft?.scenes)) {
        throw new Error("链路任务参数缺失：draft.scenes");
    }
    return {
        currentIndex: 0,
        scenes: param.draft.scenes.map(scene => ({
            sceneId: scene.id,
            referenceImageUrl: scene.referenceImageUrl || "",
            status: "queue",
        })),
    };
};

const resolveChainParam = (record: TaskRecord, bizParam?: Partial<MarketingChainParam>) => {
    const param = ((record.param && Object.keys(record.param).length ? record.param : bizParam) || {}) as MarketingChainParam;
    if (!Array.isArray(param?.draft?.scenes)) {
        throw new Error("链路任务参数缺失：draft.scenes");
    }
    param.form = param.form || { ratio: "9:16" };
    param.form.ratio = param.form.ratio || "9:16";
    return param;
};

const updateChainRecord = async (bizId: string, record: TaskRecord, jobResult: MarketingChainJobResult) => {
    await TaskService.update(bizId, {
        jobResult,
        status: "running",
        statusMsg: `图生视频链路 ${Math.min(jobResult.currentIndex + 1, jobResult.scenes.length)}/${jobResult.scenes.length}`,
    });
};

const advanceChain = async (bizId: string, bizParam?: Partial<MarketingChainParam>) => {
    const record = await TaskService.get(bizId);
    if (!record) {
        throw new Error("链路任务不存在");
    }
    const param = resolveChainParam(record, bizParam);
    const jobResult = (record.jobResult && Object.keys(record.jobResult).length ? record.jobResult : buildInitialJobResult(param)) as MarketingChainJobResult;
    while (jobResult.currentIndex < param.draft.scenes.length) {
        const scene = param.draft.scenes[jobResult.currentIndex];
        const state = jobResult.scenes[jobResult.currentIndex];
        if (state.referenceImageUrl && !state.videoTaskId) {
            state.videoTaskId = Number(await submitVideoTask(param, scene, state.referenceImageUrl));
            state.status = "video-submitted";
            jobResult.currentIndex += 1;
            await updateChainRecord(bizId, record, jobResult);
            continue;
        }
        if (!state.imageTaskId) {
            const previousState = jobResult.scenes[jobResult.currentIndex - 1];
            const previousScene = param.draft.scenes[jobResult.currentIndex - 1];
            const continuityReferenceImageUrl = previousState?.referenceImageUrl || "";
            state.imageTaskId = Number(await submitImageTask(param, scene, continuityReferenceImageUrl, previousScene));
            state.status = "image-running";
            await updateChainRecord(bizId, record, jobResult);
            return "running";
        }
        const imageTask = await TaskService.get(state.imageTaskId);
        if (imageTask?.status === "fail") {
            throw new Error(imageTask.statusMsg || `图片任务 #${state.imageTaskId} 失败`);
        }
        if (imageTask?.status !== "success") {
            return "running";
        }
        const imageUrl = extractTaskOutputImage(imageTask);
        if (!imageUrl) {
            throw new Error(`图片任务 #${state.imageTaskId} 已完成，但没有识别到图片产物`);
        }
        state.referenceImageUrl = imageUrl;
        state.videoTaskId = Number(await submitVideoTask(param, scene, imageUrl));
        state.status = "video-submitted";
        jobResult.currentIndex += 1;
        await updateChainRecord(bizId, record, jobResult);
    }
    await TaskService.update(bizId, {
        statusMsg: "图生视频链路已完成，视频任务已全部提交",
        jobResult,
    });
    return "success";
};

export const MarketingVideoChainTask: TaskBiz = {
    runFunc: async (bizId, bizParam: MarketingChainParam) => {
        const status = await advanceChain(bizId, bizParam);
        return status === "success" ? "success" : "querying";
    },
    queryFunc: async (bizId, bizParam: MarketingChainParam) => {
        const status = await advanceChain(bizId, bizParam);
        return status === "success" ? "success" : "running";
    },
    successFunc: async (bizId) => {
        await TaskService.update(bizId, {
            status: "success",
            endTime: Date.now(),
            result: {
                message: "图生视频链路已完成，视频任务已全部提交",
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
