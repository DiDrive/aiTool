import { FileUtil } from "../../../lib/file";
import { CloudTemplateTaskService } from "../../../service/CloudTemplateTaskService";
import { CloudTemplateRecord, CloudTemplateService } from "../../../service/CloudTemplateService";
import { DirectApiPlatformService } from "../../../service/DirectApiPlatformService";
import { TaskRecord, TaskService } from "../../../service/TaskService";
import { TaskBiz } from "../../../store/modules/task";
import { RunningHubModelConfigType } from "../RunningHubStudio/type";

type MarketingChannel = "direct" | "cloud";
type NarrationMode = "none" | "voiceover" | "character";
type SubtitleMode = "none" | "caption";
type MarketingAssetType = "character" | "scene" | "prop";

type MarketingAssetRef = {
    id?: string;
    type: MarketingAssetType;
    name?: string;
    url: string;
    prompt?: string;
    note?: string;
};

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
    assetIds?: string[];
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
    referenceImageUrls?: string[];
    marketingAssets?: MarketingAssetRef[];
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

const uniqueNonEmptyStrings = (values: string[]) => {
    return Array.from(new Set(values.map(item => String(item || "").trim()).filter(Boolean)));
};

const buildImageAssetUrls = (param: MarketingChainParam, scene: MarketingChainScene, extraUrls: string[] = []) => {
    const selectedIds = Array.isArray(scene.assetIds) ? scene.assetIds : [];
    const readyAssets = Array.isArray(param.marketingAssets) ? param.marketingAssets : [];
    const scopedAssetUrls = (selectedIds.length
        ? readyAssets.filter(item => item.id && selectedIds.includes(item.id))
        : readyAssets
    ).map(item => item.url);
    return uniqueNonEmptyStrings([
        ...scopedAssetUrls,
        ...(readyAssets.length ? [] : Array.isArray(param.referenceImageUrls) ? param.referenceImageUrls : []),
        ...extraUrls,
    ]);
};

const marketingAssetTypeLabel = (type: MarketingAssetType) => {
    if (type === "scene") return "场景资产";
    if (type === "prop") return "道具资产";
    return "人物资产";
};

const buildAssetReferenceInstruction = (param: MarketingChainParam, scene: MarketingChainScene) => {
    const assets = assetsForScene(param, scene);
    if (!assets.length) {
        return "";
    }
    const types = Array.from(new Set(assets.map(asset => marketingAssetTypeLabel(asset.type)))).join("、");
    return `参考输入图：已提供${types || "一致性资产"}，生成时保持对应人物、场景或道具的核心外观一致；允许改变姿态、表情、机位和动作。不要把参考图文件名、说明文字或水印画进画面。`;
};

const assetsForScene = (param: MarketingChainParam, scene: MarketingChainScene) => {
    const selectedIds = Array.isArray(scene.assetIds) ? scene.assetIds : [];
    const source = (Array.isArray(param.marketingAssets) ? param.marketingAssets : []).filter(item => item.url);
    return selectedIds.length ? source.filter(item => item.id && selectedIds.includes(item.id)) : source;
};

const assetUrlsByType = (assets: MarketingAssetRef[], type: MarketingAssetType) => {
    return assets.filter(item => item.type === type).map(item => item.url).filter(Boolean);
};

const fieldText = (field: any) => {
    return [field?.name, field?.label, field?.placeholder]
        .map(item => String(item || "").toLowerCase())
        .join(" ");
};

const fieldLooksLike = (field: any, patterns: Array<string | RegExp>) => {
    const text = fieldText(field);
    return patterns.some(pattern => typeof pattern === "string" ? text.includes(pattern.toLowerCase()) : pattern.test(text));
};

const defaultCloudFieldValue = (field: any, fallback: any = "") => {
    return typeof field?.defaultValue !== "undefined" && field.defaultValue !== null && String(field.defaultValue).trim() !== ""
        ? field.defaultValue
        : fallback;
};

const ratioValueForCloudField = (field: any, ratio: string) => {
    const normalizedRatio = String(ratio || "9:16").trim();
    const options = Array.isArray(field?.options) ? field.options : [];
    const matchedOption = options.find((item: any) => {
        const text = `${item?.label || ""} ${item?.value || ""}`.toLowerCase();
        return text.includes(normalizedRatio.toLowerCase());
    });
    if (matchedOption) {
        return matchedOption.value;
    }
    if (/9\s*:\s*16/.test(normalizedRatio) && String(field?.name || "").includes("image_3")) {
        return "9:16 portrait 768x1344";
    }
    return defaultCloudFieldValue(field, normalizedRatio);
};

const nodeKeyFromField = (field: any) => {
    const help = String(field?.help || "");
    const nodeId = help.match(/nodeId=([^,\s]+)/i)?.[1] || "";
    const fieldName = help.match(/fieldName=([^,\s]+)/i)?.[1] || "";
    return `${nodeId}:${fieldName}`;
};

const parseCloudFieldOptionsFromNodeInfo = (fieldData: any) => {
    if (Array.isArray(fieldData)) {
        return fieldData;
    }
    const text = String(fieldData || "").trim();
    if (!text) {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            return [];
        }
        if (Array.isArray(parsed[0])) {
            return parsed[0].map((item: any) => ({
                name: String(item || ""),
                index: String(item || ""),
                description: String(item || ""),
            }));
        }
        return parsed;
    } catch (e) {
        return [];
    }
};

const enrichCloudSchemaFields = (template: CloudTemplateRecord, fields: any[]) => {
    let nodeInfoList: any[] = [];
    try {
        const parsed = JSON.parse(template.content.nodeInfoTemplateJson || "[]");
        nodeInfoList = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        nodeInfoList = [];
    }
    const nodeMap = new Map(
        nodeInfoList.map(item => [`${item?.nodeId || ""}:${item?.fieldName || ""}`, item])
    );
    return fields.map(field => {
        const node = nodeMap.get(nodeKeyFromField(field));
        const fieldDataOptions = parseCloudFieldOptionsFromNodeInfo(node?.fieldData);
        if (!fieldDataOptions.length) {
            return field;
        }
        return {
            ...field,
            options: fieldDataOptions.map((item: any) => ({
                label: String(item?.description || item?.name || item?.index || ""),
                value: String(item?.index ?? item?.name ?? item?.description ?? ""),
            })),
        };
    });
};

const valueForCloudField = (
    field: any,
    capability: "image" | "video",
    base: Record<string, any>,
    assets: MarketingAssetRef[]
) => {
    const characterAssets = assetUrlsByType(assets, "character");
    const sceneAssets = assetUrlsByType(assets, "scene");
    const propAssets = assetUrlsByType(assets, "prop");
    const allAssets = assets.map(item => item.url).filter(Boolean);
    const wantsArray = ["images", "audios", "videos", "files"].includes(String(field?.type || ""));
    const choose = (items: string[]) => wantsArray ? items : items[0] || "";
    if (fieldLooksLike(field, ["negative", "反向", "负面"])) return base.negativePrompt || field.defaultValue || "";
    if (fieldLooksLike(field, ["文生/图生", "文生图生", "打开是文生"])) return defaultCloudFieldValue(field, "false");
    if (fieldLooksLike(field, ["count", "number", "数量", "张数", "个数"])) return defaultCloudFieldValue(field, 1);
    if (fieldLooksLike(field, ["duration", "time", "seconds", "时长", "秒"])) return base.duration;
    if (fieldLooksLike(field, ["ratio", "aspect", "size", "画幅", "比例", "尺寸"])) return ratioValueForCloudField(field, base.ratio);
    if (String(field?.type || "") === "select") return defaultCloudFieldValue(field, "");
    if (String(field?.type || "") === "number") return defaultCloudFieldValue(field, 0);
    if (["image", "images", "file", "files"].includes(String(field?.type || ""))) {
        return choose(capability === "video" ? [base.firstFrame, ...allAssets].filter(Boolean) : allAssets);
    }
    if (fieldLooksLike(field, ["character", "person", "role", "avatar", "人物", "角色", "主角"])) return choose(characterAssets.length ? characterAssets : allAssets);
    if (fieldLooksLike(field, ["scene", "background", "environment", "space", "场景", "背景", "环境", "空间"])) return choose(sceneAssets.length ? sceneAssets : allAssets);
    if (fieldLooksLike(field, ["prop", "product", "item", "object", "道具", "产品", "物件", "商品"])) return choose(propAssets.length ? propAssets : allAssets);
    if (fieldLooksLike(field, ["reference", "asset", "素材", "参考", "一致性"])) return choose(allAssets);
    if (fieldLooksLike(field, ["image_prompt", "imageprompt", "图片提示", "生图提示"])) return base.imagePrompt || base.prompt;
    if (fieldLooksLike(field, ["video_prompt", "videoprompt", "视频提示", "生视频提示"])) return base.videoPrompt || base.prompt;
    if (fieldLooksLike(field, ["prompt", "text", "desc", "description", "提示词", "描述", "文案"])) return base.prompt;
    if (fieldLooksLike(field, ["title", "标题", "名称"])) return base.title;
    if (fieldLooksLike(field, ["subtitle", "caption", "字幕"])) return base.subtitle || "";
    if (fieldLooksLike(field, ["voiceover", "line", "台词", "口播", "旁白"])) return base.voiceoverLine || "";
    if (fieldLooksLike(field, ["first", "start", "首帧", "起始帧", "开始帧"])) return choose([base.firstFrame].filter(Boolean));
    if (fieldLooksLike(field, ["last", "end", "tail", "尾帧", "结束帧"])) return choose([base.lastFrame].filter(Boolean));
    return defaultCloudFieldValue(field, "");
};

const buildCloudMarketingInput = (
    template: CloudTemplateRecord,
    capability: "image" | "video",
    base: Record<string, any>,
    param: MarketingChainParam,
    scene: MarketingChainScene
) => {
    const assets = assetsForScene(param, scene);
    const allAssetUrls = assets.map(item => item.url).filter(Boolean);
    const characterAssets = assetUrlsByType(assets, "character");
    const sceneAssets = assetUrlsByType(assets, "scene");
    const propAssets = assetUrlsByType(assets, "prop");
    const input: Record<string, any> = {
        ...base,
        image: base.firstFrame || allAssetUrls[0] || "",
        imageUrl: base.firstFrame || allAssetUrls[0] || "",
        images: capability === "video" ? [base.firstFrame, ...allAssetUrls].filter(Boolean) : allAssetUrls,
        imageUrls: capability === "video" ? [base.firstFrame, ...allAssetUrls].filter(Boolean) : allAssetUrls,
        referenceImageUrl: allAssetUrls[0] || "",
        referenceImages: allAssetUrls,
        assetImages: allAssetUrls,
        assetImageUrls: allAssetUrls,
        characterAsset: characterAssets[0] || "",
        characterAssets,
        sceneAsset: sceneAssets[0] || "",
        sceneAssets,
        propAsset: propAssets[0] || "",
        propAssets,
        marketingAssets: assets,
        selectedCapability: capability,
    };
    const schemaFields = enrichCloudSchemaFields(
        template,
        CloudTemplateTaskService.parseInputSchema(template.content.inputSchemaJson || "[]")
    );
    schemaFields.forEach(field => {
        const key = String(field.name || "").trim();
        if (!key) {
            return;
        }
        input[key] = valueForCloudField(field, capability, base, assets);
    });
    const missingRequiredFiles = schemaFields.filter(field => {
        const key = String(field.name || "").trim();
        if (!field.required || !key || !["image", "images", "file", "files", "video", "audio"].includes(String(field.type || ""))) {
            return false;
        }
        const value = input[key];
        return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    });
    if (missingRequiredFiles.length) {
        throw new Error(
            `云端模板「${template.title}」需要输入素材：${missingRequiredFiles.map(item => item.label || item.name).join("、")}。请先上传/生成参考资产，或换成支持文生图的云端生图模板。`
        );
    }
    return input;
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
        "参考上一分镜输入图保持同一短视频的主角、服装基调、光影质感和竖屏风格连续；当前画面按本镜提示重新构图，不照搬上一镜背景。",
        previousScene
            ? `上一镜仅作连续性参考：${previousScene.title}。`
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
    const compact = (value?: string, max = 90) => {
        const text = cleanSentence(value || "");
        return text.length > max ? `${text.slice(0, max)}...` : text;
    };
    const rows = [
        compact(analysis.visualStyle, 120),
        compact(analysis.shotLanguage, 100),
        compact(analysis.rhythm, 80),
    ].filter(Boolean);
    if (!rows.length) {
        return "";
    }
    return `参考视频风格：${rows.join("；")}。只借鉴风格、构图、光线和节奏，不复刻原人物、原场景、原台词或原音乐。`;
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
    return `只生成第 ${sceneIndex + 1}/${totalScenes} 镜「${scene.title}」，不要混入其它分镜内容。`;
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
    const fullPrompt = [prompt, buildAssetReferenceInstruction(param, scene)].filter(Boolean).join("\n\n");
    const imageAssets = buildImageAssetUrls(param, scene, continuityReferenceImageUrl ? [continuityReferenceImageUrl] : []);
    const body: Record<string, any> = {
        model: "gpt-image-2",
        prompt: fullPrompt,
        size: "1024x1536",
        quality: "high",
    };
    if (imageAssets.length) {
        body[imageAssets.length > 1 ? "image[]" : "image"] = await Promise.all(imageAssets.map(item => ensureMultipartImageFile(item)));
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
        submitPath: imageAssets.length ? "/v1/images/edits" : "/v1/images/generations",
        queryPath: "",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: imageAssets.length ? "form-data" : "json",
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
                prompt: fullPrompt,
                imageAssets,
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
    const template = await CloudTemplateService.get(Number(param.imageTemplateId || 0));
    if (!template?.id) {
        throw new Error("云端生图模板不存在");
    }
    const prompt = appendReferenceAnalysisToPrompt(
        buildConsistentImagePrompt(scene, continuityReferenceImageUrl, previousScene),
        param.draft.referenceAnalysis
    );
    const fullPrompt = [prompt, buildAssetReferenceInstruction(param, scene)].filter(Boolean).join("\n\n");
    const imageAssets = buildImageAssetUrls(param, scene, continuityReferenceImageUrl ? [continuityReferenceImageUrl] : []);
    const input = buildCloudMarketingInput(template, "image", {
        title: `${param.draft.title}_${scene.title}_分镜图`,
        prompt: fullPrompt,
        text: fullPrompt,
        imagePrompt: fullPrompt,
        videoPrompt: buildVideoPromptWithSpeech(scene, param.draft.referenceAnalysis, param.draft.scenes.findIndex(item => item.id === scene.id), param.draft.scenes.length, param.draft.title),
        firstFrame: continuityReferenceImageUrl || scene.referenceImageUrl || "",
        firstFrameUrl: continuityReferenceImageUrl || scene.referenceImageUrl || "",
        lastFrame: "",
        lastFrameUrl: "",
        duration: scene.duration,
        ratio: param.form.ratio,
        subtitle: effectiveSceneCaption(scene),
        voiceoverLine: scene.voiceoverLine || "",
        imageAssets,
        continuityReferenceImageUrl: continuityReferenceImageUrl || "",
        draft: param.draft,
        scene,
    }, param, scene);
    const record = await CloudTemplateTaskService.buildTaskRecord(param.imageTemplateId, input);
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
    const template = await CloudTemplateService.get(Number(param.videoTemplateId || 0));
    if (!template?.id) {
        throw new Error("云端生视频模板不存在");
    }
    const sceneIndex = param.draft.scenes.findIndex(item => item.id === scene.id);
    const videoPrompt = buildVideoPromptWithSpeech(
        scene,
        param.draft.referenceAnalysis,
        sceneIndex >= 0 ? sceneIndex : undefined,
        param.draft.scenes.length,
        param.draft.title
    );
    const input = buildCloudMarketingInput(template, "video", {
        title: `${param.draft.title}_${scene.title}_视频`,
        prompt: videoPrompt,
        text: videoPrompt,
        imagePrompt: appendReferenceAnalysisToPrompt(scene.imagePrompt, param.draft.referenceAnalysis),
        videoPrompt,
        firstFrame: referenceImageUrl,
        firstFrameUrl: referenceImageUrl,
        lastFrame: "",
        lastFrameUrl: "",
        duration: scene.duration,
        ratio: param.form.ratio,
        subtitle: effectiveSceneCaption(scene),
        voiceoverLine: scene.voiceoverLine || "",
        draft: param.draft,
        scene,
    }, param, scene);
    const record = await CloudTemplateTaskService.buildTaskRecord(param.videoTemplateId, input);
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
