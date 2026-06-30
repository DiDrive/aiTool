import { FileUtil } from "../../../lib/file";
import { ffmpegBurnSrtSubtitle, ffmpegRenderTimelineClips, VideoTimelineClip } from "../../../lib/ffmpeg";
import { subtitleGenerateSrtContent } from "../../../lib/subtitle";
import { CloudTemplateTaskService } from "../../../service/CloudTemplateTaskService";
import { CloudTemplateRecord, CloudTemplateService } from "../../../service/CloudTemplateService";
import { DirectApiPlatformService } from "../../../service/DirectApiPlatformService";
import { FileRelayConfigService } from "../../../service/FileRelayConfigService";
import { TaskRecord, TaskService } from "../../../service/TaskService";
import { TaskBiz } from "../../../store/modules/task";
import { RunningHubModelConfigType } from "../RunningHubStudio/type";

type MarketingChannel = "direct" | "cloud";
type VideoReferenceRole = "reference_image" | "first_frame";
type StoryboardImageMode = "single_frame" | "scene_grid";
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
    scriptBeat?: string;
    subtitle: string;
    captionOverride?: string;
    voiceoverLine?: string;
    narrationMode?: NarrationMode;
    subtitleMode?: SubtitleMode;
    imagePrompt: string;
    videoPrompt: string;
    assetIds?: string[];
    requiredAssets?: Array<{
        type: MarketingAssetType;
        name: string;
        reason?: string;
    }>;
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
    scriptText?: string;
    synopsis?: string;
    referenceAnalysis?: MarketingReferenceAnalysis;
    scenes: MarketingChainScene[];
};

type MarketingChainParam = {
    draft: MarketingChainDraft;
    form: {
        ratio: string;
        videoModel?: string;
        videoReferenceRole?: VideoReferenceRole;
        storyboardImageMode?: StoryboardImageMode;
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

const isZipOutput = (value: string) => {
    return /\.zip(\?.*)?$/i.test(String(value || "").trim());
};

const isVideoOutput = (value: string) => {
    return /\.(mp4|mov|webm|avi|mkv|m4v)(\?.*)?$/i.test(value) || /^data:video\//i.test(value);
};

const bytesFromBufferLike = (value: any) => {
    if (!value) {
        return new Uint8Array();
    }
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (Array.isArray(value)) {
        return new Uint8Array(value);
    }
    if (value?.buffer instanceof ArrayBuffer) {
        return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength || value.buffer.byteLength);
    }
    return new Uint8Array();
};

const fileLooksLikeZip = async (path: string) => {
    try {
        const bytes = bytesFromBufferLike(await window.$mapi.file.readBuffer(path));
        return bytes[0] === 0x50 && bytes[1] === 0x4b;
    } catch (e) {
        return false;
    }
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
    assets: MarketingAssetRef[],
    fieldIndex = 0
) => {
    const characterAssets = assetUrlsByType(assets, "character");
    const sceneAssets = assetUrlsByType(assets, "scene");
    const propAssets = assetUrlsByType(assets, "prop");
    const allAssets = assets.map(item => item.url).filter(Boolean);
    const wantsArray = ["images", "audios", "videos", "files"].includes(String(field?.type || ""));
    const choose = (items: string[]) => {
        if (wantsArray) {
            return items;
        }
        return items[fieldIndex] || items[0] || "";
    };
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
    let fileFieldIndex = 0;
    schemaFields.forEach(field => {
        const key = String(field.name || "").trim();
        if (!key) {
            return;
        }
        const type = String(field?.type || "");
        const index = ["image", "file", "video", "audio"].includes(type) ? fileFieldIndex++ : 0;
        input[key] = valueForCloudField(field, capability, base, assets, index);
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

const getEffectiveDirectFileRelay = async (platform: any) => {
    const relay = platform?.content?.directFileRelay;
    if (relay?.enabled && relay?.provider === "modeltop-assets" && String(platform?.content?.apiKey || "").trim()) {
        return relay;
    }
    if (
        relay?.enabled &&
            relay?.provider === "123pan" &&
            String(relay.clientID || "").trim() &&
            String(relay.clientSecret || "").trim() &&
            String(relay.parentFileID || "").trim()
    ) {
        return relay;
    }
    return await FileRelayConfigService.getPan123Relay();
};

const resolveDirectVideoReferenceImageUrl = async (directFileRelay: any, value: string) => {
    if (!value || isDataOrRemoteUrl(value)) {
        return value;
    }
    const normalizedValue = await normalizeSeedanceLocalImage(value);
    if (directFileRelay) {
        return normalizedValue;
    }
    throw new Error("素材中转未配置：当前视频参考图是本地文件，但尚未配置可用的全局 123 云盘中转。");
};

const normalizeVideoReferenceRole = (value?: string): VideoReferenceRole => {
    return value === "first_frame" ? "first_frame" : "reference_image";
};

const buildVideoImageReferenceContent = (url: string, role?: string) => ({
    type: "image_url",
    image_url: { url },
    role: normalizeVideoReferenceRole(role),
});

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

const looksLikeImageOrZipOutputUrl = (value: string) => {
    const text = String(value || "").trim();
    if (!text) {
        return false;
    }
    if (isImageOutput(text) || isZipOutput(text)) {
        return true;
    }
    if (!/^(https?:\/\/|file:\/\/|[a-z]:\\|\/)/i.test(text)) {
        return false;
    }
    return !/\.(mp4|mov|webm|avi|mp3|wav|m4a|aac|json|txt)(\?.*)?$/i.test(text);
};

const collectImageOutputCandidates = (value: any, path = "", result: Array<{ value: string; score: number }> = []) => {
    if (!value) {
        return result;
    }
    if (typeof value === "string") {
        const text = value.trim();
        if (looksLikeImageOrZipOutputUrl(text)) {
            const keyScore = /(image|img|fileurl|file_url|url|output|result|remote|local|cover)/i.test(path) ? 3 : 0;
            result.push({ value: text, score: (isImageOutput(text) ? 10 : isZipOutput(text) ? 8 : 1) + keyScore });
        }
        return result;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectImageOutputCandidates(item, `${path}.${index}`, result));
        return result;
    }
    if (typeof value === "object") {
        Object.entries(value).forEach(([key, item]) => collectImageOutputCandidates(item, path ? `${path}.${key}` : key, result));
    }
    return result;
};

const extractTaskOutputImage = (task: TaskRecord | null) => {
    if (!task) {
        return "";
    }
    const preferred = [
        ...(Array.isArray(task.result?.localFiles) ? task.result.localFiles : []),
        ...(Array.isArray(task.jobResult?.End?.localFiles) ? task.jobResult.End.localFiles : []),
        task.result?.image,
        task.result?.url,
        ...(Array.isArray(task.result?.urls) ? task.result.urls : []),
        ...(Array.isArray(task.result?.remoteUrls) ? task.result.remoteUrls : []),
    ]
        .map(item => String(item || "").trim())
        .filter(Boolean);
    const strictImage = preferred.find(isImageOutput) || collectStringValues(task.result?.remoteResults || task.jobResult?.Query?.results || []).find(isImageOutput) || "";
    if (strictImage) {
        return strictImage;
    }
    const zipOutput = preferred.find(isZipOutput) || collectStringValues(task.result?.remoteResults || task.jobResult?.Query?.results || []).find(isZipOutput) || "";
    if (zipOutput) {
        return zipOutput;
    }
    const candidates = collectImageOutputCandidates({
        result: task.result,
        jobResult: task.jobResult,
    }).sort((a, b) => b.score - a.score);
    return candidates[0]?.value || preferred[0] || "";
};

const resolveZipImageOutput = async (value: string) => {
    let zipPath = value;
    if (/^https?:\/\//i.test(zipPath)) {
        zipPath = await window.$mapi.file.download(zipPath);
    }
    const dest = await window.$mapi.file.tempDir("marketing-chain-image-output");
    await window.$mapi.misc.unzip(zipPath, dest);
    const files = await window.$mapi.file.listAll(dest);
    const imageFile = files
        .filter(item => !item.isDirectory && isImageOutput(String(item.path || item.name || "")))
        .sort((a, b) => {
            const aName = String(a.path || a.name || "");
            const bName = String(b.path || b.name || "");
            const score = (name: string) => {
                if (/(^|\/)(result|output|outputs|save|generated|image|000|001)/i.test(name)) {
                    return 0;
                }
                if (/(^|\/)(input|source|upload|reference|mask|thumb|preview|cover)/i.test(name)) {
                    return 2;
                }
                return 1;
            };
            return score(aName) - score(bName) || Number(b.size || 0) - Number(a.size || 0) || aName.localeCompare(bName);
        })[0];
    if (!imageFile) {
        throw new Error("图片任务产物是压缩包，但压缩包里没有找到可用图片");
    }
    return `${dest}/${String(imageFile.path || imageFile.name || "").replace(/^\/+/, "")}`;
};

const resolveTaskOutputImage = async (value: string) => {
    if (!value) {
        return "";
    }
    if (isZipOutput(value)) {
        return await resolveZipImageOutput(value);
    }
    if (!isImageOutput(value) && /^(https?:\/\/|[a-z]:\\|\/)/i.test(value)) {
        let localPath = value;
        if (/^https?:\/\//i.test(localPath)) {
            localPath = await window.$mapi.file.download(localPath);
        }
        if (await fileLooksLikeZip(localPath)) {
            return await resolveZipImageOutput(localPath);
        }
        return localPath;
    }
    return value;
};

const extractTaskOutputVideo = (task: TaskRecord | null) => {
    if (!task) {
        return "";
    }
    const preferred = [
        ...(Array.isArray(task.result?.localFiles) ? task.result.localFiles : []),
        task.result?.video,
        task.result?.url,
        ...(Array.isArray(task.result?.urls) ? task.result.urls : []),
        ...(Array.isArray(task.result?.remoteUrls) ? task.result.remoteUrls : []),
        ...(Array.isArray(task.jobResult?.End?.localFiles) ? task.jobResult.End.localFiles : []),
    ]
        .map(item => String(item || "").trim())
        .filter(Boolean);
    return preferred.find(isVideoOutput) || collectStringValues(task.result?.remoteResults || task.jobResult?.Query?.results || []).find(isVideoOutput) || "";
};

const ensureLocalVideoFile = async (value: string) => {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }
    if (/^https?:\/\//i.test(text)) {
        return await window.$mapi.file.download(text);
    }
    return text;
};

const sceneGridCount = (scene: MarketingChainScene) => {
    if (scene.duration >= 10) return 6;
    if (scene.duration >= 7) return 4;
    return 3;
};

const buildSceneImageModeInstruction = (param: MarketingChainParam, scene: MarketingChainScene) => {
    const sceneIndex = param.draft.scenes.findIndex(item => item.id === scene.id);
    const position = sceneIndex >= 0 ? `第 ${sceneIndex + 1}/${param.draft.scenes.length} 镜` : "当前镜头";
    if (param.form.storyboardImageMode === "single_frame") {
        return [
            `分镜图模式：单张首帧。只生成${position}的一张竖屏首帧参考图。`,
            "画面必须是一个完整单图，不要九宫格、不要拼贴、不要漫画分格、不要多个小画面。",
            "首帧要清晰表达本镜开场动作、主体表情、场景和光线，适合后续作为视频首帧或参考图。",
        ].join("\n");
    }
    const gridCount = sceneGridCount(scene);
    return [
        `分镜图模式：镜头动作宫格。只为${position}生成一张 ${gridCount} 宫格动作分镜板，不要包含其它镜头内容。`,
        `这 ${gridCount} 个宫格必须按时间顺序展示本镜在 ${scene.duration} 秒内的关键动作变化：起始状态、动作推进、情绪/视线变化、结束姿态。`,
        "所有宫格保持同一人物、同一服装、同一场景空间、同一光线方向和统一画风；每格构图略有变化但连续自然。",
        "不要在画面中生成字幕、说明文字、编号、水印或 UI；宫格边界干净，竖屏 9:16 总画面可直接作为图生视频参考。",
    ].join("\n");
};

const buildConsistentImagePrompt = (
    param: MarketingChainParam,
    scene: MarketingChainScene,
    continuityReferenceImageUrl?: string,
    previousScene?: MarketingChainScene
) => {
    const basePrompt = [
        scene.imagePrompt,
        buildSceneImageModeInstruction(param, scene),
    ].filter(Boolean).join("\n\n");
    if (!continuityReferenceImageUrl) {
        return basePrompt;
    }
    return [
        basePrompt,
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
            : `字幕后期要求：本镜字幕文本为“${caption || line || "无"}”，但视频模型不要把任何字幕、标题条、贴纸文字或 UI 文本画进画面；字幕会在最终合成阶段由系统叠加。`;
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
        buildConsistentImagePrompt(param, scene, continuityReferenceImageUrl, previousScene),
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
        buildConsistentImagePrompt(param, scene, continuityReferenceImageUrl, previousScene),
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
    const directFileRelay = await getEffectiveDirectFileRelay(platform);
    const resolvedReferenceImageUrl = await resolveDirectVideoReferenceImageUrl(directFileRelay, referenceImageUrl);
    const sceneIndex = param.draft.scenes.findIndex(item => item.id === scene.id);
    const videoPrompt = buildVideoPromptWithSpeech(
        scene,
        param.draft.referenceAnalysis,
        sceneIndex >= 0 ? sceneIndex : undefined,
        param.draft.scenes.length,
        param.draft.title
    );
    const isKwjmPlatform = platform.content.platformType === "kwjm";
    const normalizedVideoModel = (() => {
        const model = param.form.videoModel || "seedance-2.0-fast";
        if (!isKwjmPlatform) {
            return model;
        }
        return model.includes("fast") ? "kw-video-v2-fast" : "kw-video-v2";
    })();
    const body: Record<string, any> = {
        model: normalizedVideoModel,
        content: [
            { type: "text", text: videoPrompt },
            ...(resolvedReferenceImageUrl ? [buildVideoImageReferenceContent(resolvedReferenceImageUrl, param.form.videoReferenceRole)] : []),
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
        directFileRelay: directFileRelay || undefined,
        submitPath: isKwjmPlatform ? "/v1/videos/generations" : "/api/v3/contents/generations/tasks",
        queryPath: isKwjmPlatform ? "/v1/videos/generations/{id}" : "/api/v3/contents/generations/tasks/{id}",
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
    param.form.videoReferenceRole = normalizeVideoReferenceRole(param.form.videoReferenceRole);
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
        const rawImageUrl = extractTaskOutputImage(imageTask);
        if (!rawImageUrl) {
            throw new Error(`图片任务 #${state.imageTaskId} 已完成，但没有识别到图片产物`);
        }
        const imageUrl = await resolveTaskOutputImage(rawImageUrl);
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

type MarketingFinalizeClip = {
    sceneId: string;
    title?: string;
    videoTaskId?: number;
    videoUrl?: string;
    trimStart?: number;
    trimEnd?: number;
    speedRatio?: number;
    targetDuration?: number;
    subtitle?: string;
};

type MarketingFinalizeParam = {
    draft: MarketingChainDraft;
    clips: MarketingFinalizeClip[];
    burnSubtitle?: boolean;
    subtitleStyle?: {
        fontName?: string;
        fontSize?: number;
        marginV?: number;
    };
};

type MarketingFinalizeJobResult = {
    step?: "Collect" | "Render" | "End";
    clips?: Array<MarketingFinalizeClip & {
        localVideo?: string;
        actualStart?: number;
        actualEnd?: number;
    }>;
    output?: string;
    srt?: string;
};

const clipDurationSeconds = (clip: MarketingFinalizeClip) => {
    const start = Math.max(0, Number(clip.trimStart || 0));
    const end = Number(clip.trimEnd || 0);
    const rawDuration = end > start ? end - start : Number(clip.targetDuration || 0);
    const speed = Number(clip.speedRatio || 1) > 0 ? Number(clip.speedRatio || 1) : 1;
    return Math.max(0.2, rawDuration / speed);
};

const buildFinalizeJobResult = (): MarketingFinalizeJobResult => ({
    step: "Collect",
    clips: [],
});

const resolveFinalizeParam = (record: TaskRecord, bizParam?: Partial<MarketingFinalizeParam>) => {
    const param = ((record.param && Object.keys(record.param).length ? record.param : bizParam) || {}) as MarketingFinalizeParam;
    if (!Array.isArray(param?.clips) || !param.clips.length) {
        throw new Error("最终合成参数缺失：clips");
    }
    return param;
};

const collectFinalizeClipVideos = async (param: MarketingFinalizeParam) => {
    const clips: MarketingFinalizeJobResult["clips"] = [];
    for (const clip of param.clips) {
        let videoUrl = String(clip.videoUrl || "").trim();
        if (!videoUrl && clip.videoTaskId) {
            const task = await TaskService.get(Number(clip.videoTaskId));
            if (task?.status === "fail") {
                throw new Error(task.statusMsg || `视频任务 #${clip.videoTaskId} 失败`);
            }
            if (task?.status !== "success") {
                return { ready: false, clips };
            }
            videoUrl = extractTaskOutputVideo(task);
        }
        if (!videoUrl) {
            throw new Error(`分镜「${clip.title || clip.sceneId}」没有可用视频产物`);
        }
        const localVideo = await ensureLocalVideoFile(videoUrl);
        clips.push({
            ...clip,
            videoUrl,
            localVideo,
        });
    }
    return { ready: true, clips };
};

const renderFinalizeVideo = async (param: MarketingFinalizeParam, clips: NonNullable<MarketingFinalizeJobResult["clips"]>) => {
    let cursor = 0;
    const timelineClips: VideoTimelineClip[] = [];
    const subtitleRecords: Array<{ start: number; end: number; text: string }> = [];
    for (const clip of clips) {
        const duration = clipDurationSeconds(clip);
        clip.actualStart = cursor;
        clip.actualEnd = cursor + duration;
        timelineClips.push({
            video: clip.localVideo || "",
            trimStart: Math.max(0, Number(clip.trimStart || 0)),
            trimEnd: Number(clip.trimEnd || 0) > 0 ? Number(clip.trimEnd || 0) : undefined,
            speedRatio: Number(clip.speedRatio || 1),
        });
        const subtitle = String(clip.subtitle || "").trim();
        if (subtitle) {
            subtitleRecords.push({
                start: Math.round(clip.actualStart * 1000),
                end: Math.round(clip.actualEnd * 1000),
                text: subtitle,
            });
        }
        cursor = clip.actualEnd;
    }
    const rendered = await ffmpegRenderTimelineClips(timelineClips);
    let srt = "";
    let output = rendered;
    if (subtitleRecords.length) {
        srt = await window.$mapi.file.hubSaveContent(subtitleGenerateSrtContent(subtitleRecords), { ext: "srt" });
        if (param.burnSubtitle !== false) {
            output = await ffmpegBurnSrtSubtitle(rendered, srt, param.subtitleStyle || {});
        }
    }
    return { output, srt, clips };
};

const advanceFinalize = async (bizId: string, bizParam?: Partial<MarketingFinalizeParam>) => {
    const record = await TaskService.get(bizId);
    if (!record) {
        throw new Error("最终合成任务不存在");
    }
    const param = resolveFinalizeParam(record, bizParam);
    const jobResult = (record.jobResult && Object.keys(record.jobResult).length ? record.jobResult : buildFinalizeJobResult()) as MarketingFinalizeJobResult;
    if (jobResult.step === "End" && jobResult.output) {
        return "success";
    }
    if (jobResult.step === "Collect") {
        const collected = await collectFinalizeClipVideos(param);
        jobResult.clips = collected.clips;
        await TaskService.update(bizId, {
            status: "running",
            statusMsg: collected.ready ? "视频片段已收集，准备剪辑合成" : "等待视频片段生成完成",
            jobResult,
        });
        if (!collected.ready) {
            return "running";
        }
        jobResult.step = "Render";
        await TaskService.update(bizId, { jobResult });
    }
    if (jobResult.step === "Render") {
        const rendered = await renderFinalizeVideo(param, jobResult.clips || []);
        jobResult.output = await window.$mapi.file.hubSave(rendered.output);
        jobResult.srt = rendered.srt || "";
        jobResult.clips = rendered.clips;
        jobResult.step = "End";
        await TaskService.update(bizId, {
            status: "running",
            statusMsg: "最终成片已生成",
            jobResult,
        });
    }
    return "success";
};

export const MarketingVideoFinalizeTask: TaskBiz = {
    runFunc: async (bizId, bizParam: MarketingFinalizeParam) => {
        const status = await advanceFinalize(bizId, bizParam);
        return status === "success" ? "success" : "querying";
    },
    queryFunc: async (bizId, bizParam: MarketingFinalizeParam) => {
        const status = await advanceFinalize(bizId, bizParam);
        return status === "success" ? "success" : "running";
    },
    successFunc: async (bizId) => {
        const record = await TaskService.get(bizId);
        const jobResult = (record?.jobResult || {}) as MarketingFinalizeJobResult;
        await TaskService.update(bizId, {
            status: "success",
            endTime: Date.now(),
            result: {
                url: jobResult.output || "",
                srt: jobResult.srt || "",
                localFiles: [jobResult.output].filter(Boolean),
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
