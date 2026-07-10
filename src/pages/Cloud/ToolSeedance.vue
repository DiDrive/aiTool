<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Dialog } from "../../lib/dialog";
import {
    DirectApiPlatformRecord,
    DirectApiPlatformService,
} from "../../service/DirectApiPlatformService";
import { FileRelayConfigService } from "../../service/FileRelayConfigService";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { RunningHubModelConfigType } from "../Apps/RunningHubStudio/type";
import { usePageDraft } from "../../hooks/pageDraft";
import { ffprobeAudioInfo, ffprobeVideoInfo } from "../../lib/ffprobe";
import { model as modelStore } from "../../module/Model/store/model";
import { SeedanceLongVideoChainTaskParam } from "./SeedanceLongVideoChainTask";

type CreationMode = "frames" | "reference";
type SeedanceAssetType = "image" | "video" | "audio";

type SeedanceAsset = {
    id: string;
    type: SeedanceAssetType;
    role: "reference_image" | "reference_video" | "reference_audio";
    url: string;
    size?: number;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
};

type MentionAsset = {
    id: string;
    label: string;
    type: SeedanceAssetType | "frame";
    url: string;
    source: "first_frame" | "last_frame" | "asset";
};

type BatchSeedanceAsset = {
    type: SeedanceAssetType;
    url: string;
    label: string;
    role: "reference_image" | "reference_video" | "reference_audio";
};

type BatchSeedanceRow = {
    rowIndex: number;
    batchSequence: number;
    title: string;
    prompt: string;
    firstFrame: string;
    lastFrame: string;
    imageUrls: string[];
    videoUrls: string[];
    audioUrls: string[];
    imageAssets: BatchSeedanceAsset[];
    videoAssets: BatchSeedanceAsset[];
    audioAssets: BatchSeedanceAsset[];
    model: string;
    ratio: string;
    duration: number;
    totalDuration?: number;
    segmentPrompts?: string[];
    resolution: string;
    generateAudio: boolean;
    watermark: boolean;
    status: "ready" | "submitting" | "success" | "fail";
    taskId?: number;
    error?: string;
};

type BatchPromptAssetGroup = "required" | "pickOne" | "optional";

type BatchPromptGeneratorSettings = {
    theme: string;
    referenceFormat: string;
    creativeDirection: string;
    count: number;
    modelKey: string;
    videoModel: string;
    ratio: string;
    duration: number;
    resolution: string;
    requiredAssetIds: string[];
    pickOneAssetIds: string[];
    optionalAssetIds: string[];
};

const route = useRoute();
const router = useRouter();
const platforms = ref<DirectApiPlatformRecord[]>([]);
const platformId = ref(0);
const prompt = ref("");
const title = ref("");
const mode = ref<CreationMode>("reference");
const model = ref("seedance-2.0-fast");
const ratio = ref("16:9");
const duration = ref(4);
const resolution = ref("720p");
const generateAudio = ref(true);
const watermark = ref(false);
const webSearch = ref(false);
const firstFrame = ref("");
const lastFrame = ref("");
const assets = ref<SeedanceAsset[]>([]);
const batchAssetLibrary = ref<SeedanceAsset[]>([]);
const batchAssetLibraryVisible = ref(false);
const batchFilePath = ref("");
const batchRows = ref<BatchSeedanceRow[]>([]);
const selectedBatchRowKeys = ref<number[]>([]);
const batchSubmitting = ref(false);
const batchPromptGeneratorVisible = ref(false);
const batchPromptGenerating = ref(false);
const promptModelOptions = ref<Array<{ id: string; providerTitle: string; modelName: string }>>([]);
const batchPromptGenerator = ref<BatchPromptGeneratorSettings>({
    theme: "",
    referenceFormat: "",
    creativeDirection: "有梗但合理，优先用角色关系、场景和产品特点制造反差；允许影视化节奏、抽象反差或网络短视频结构，但不要照搬台词和生硬热梗。",
    count: 3,
    modelKey: "",
    videoModel: "seedance-2.0-fast",
    ratio: "16:9",
    duration: 15,
    resolution: "720p",
    requiredAssetIds: [],
    pickOneAssetIds: [],
    optionalAssetIds: [],
});
const batchRowEditorVisible = ref(false);
const batchRowEditingKey = ref<number | null>(null);
const batchSegmentRegenerating = ref(false);
const batchRowRegenerating = ref(false);
const batchRowEditor = ref<Pick<BatchSeedanceRow, "title" | "prompt" | "ratio" | "duration" | "totalDuration" | "segmentPrompts" | "resolution" | "model">>({
    title: "",
    prompt: "",
    ratio: "16:9",
    duration: 4,
    totalDuration: undefined,
    segmentPrompts: [],
    resolution: "720p",
    model: "seedance-2.0-fast",
});

const normalizeBatchPromptGeneratorSettings = () => {
    batchPromptGenerator.value = {
        theme: String(batchPromptGenerator.value?.theme || ""),
        referenceFormat: String(batchPromptGenerator.value?.referenceFormat || ""),
        creativeDirection: String(batchPromptGenerator.value?.creativeDirection || "有梗但合理，优先用角色关系、场景和产品特点制造反差；允许影视化节奏、抽象反差或网络短视频结构，但不要照搬台词和生硬热梗。"),
        count: Math.max(1, Math.min(50, Number(batchPromptGenerator.value?.count) || 3)),
        modelKey: String(batchPromptGenerator.value?.modelKey || ""),
        videoModel: normalizeUiVideoModel(String(batchPromptGenerator.value?.videoModel || "seedance-2.0-fast")),
        ratio: normalizeRatioValue(batchPromptGenerator.value?.ratio || "16:9", "16:9"),
        duration: normalizeTotalDuration(batchPromptGenerator.value?.duration || 15),
        resolution: String(batchPromptGenerator.value?.resolution || "720p"),
        requiredAssetIds: Array.isArray(batchPromptGenerator.value?.requiredAssetIds) ? batchPromptGenerator.value.requiredAssetIds : [],
        pickOneAssetIds: Array.isArray(batchPromptGenerator.value?.pickOneAssetIds) ? batchPromptGenerator.value.pickOneAssetIds : [],
        optionalAssetIds: Array.isArray(batchPromptGenerator.value?.optionalAssetIds) ? batchPromptGenerator.value.optionalAssetIds : [],
    };
    if (batchPromptGenerator.value.videoModel === "seedance-2.0-fast" && batchPromptGenerator.value.resolution === "1080p") {
        batchPromptGenerator.value.resolution = "720p";
    }
};
const mentionAssetIds = ref<string[]>([]);
const assetPickerVisible = ref(false);
const assetPickerKeyword = ref("");
const promptTextareaRef = ref<any>(null);
const mentionRange = ref<{ start: number; end: number } | null>(null);
const draggingUpload = ref(false);
const mentionPromptSyncReady = ref(false);
const pageDraft = usePageDraft("ToolSeedance", {
    platformId,
    prompt,
    title,
    mode,
    model,
    ratio,
    duration,
    resolution,
    generateAudio,
    watermark,
    webSearch,
    firstFrame,
    lastFrame,
    assets,
    mentionAssetIds,
});

const BATCH_ASSET_LIBRARY_STORAGE_GROUP = "SeedanceBatchAssetLibrary";
const BATCH_ASSET_LIBRARY_STORAGE_KEY = "default";
const BATCH_WORKSPACE_STORAGE_GROUP = "SeedanceBatchWorkspace";
const BATCH_WORKSPACE_STORAGE_KEY = "default";

const batchWorkspaceDraft = usePageDraft(BATCH_WORKSPACE_STORAGE_KEY, {
    batchFilePath,
    batchRows,
    selectedBatchRowKeys,
    batchPromptGenerator,
}, {
    storageGroup: BATCH_WORKSPACE_STORAGE_GROUP,
    delay: 200,
});

const restoreBatchWorkspace = async () => {
    const saved = await window.$mapi.storage.get(BATCH_WORKSPACE_STORAGE_GROUP, BATCH_WORKSPACE_STORAGE_KEY, null);
    if (saved && typeof saved === "object") {
        await batchWorkspaceDraft.restore();
        return;
    }
    // Migrate the existing page-level draft once so current batch work is retained.
    const legacy = await window.$mapi.storage.get("pageDraft", "ToolSeedance", null);
    if (legacy && typeof legacy === "object") {
        batchFilePath.value = String(legacy.batchFilePath || "");
        batchRows.value = Array.isArray(legacy.batchRows) ? legacy.batchRows : [];
        selectedBatchRowKeys.value = Array.isArray(legacy.selectedBatchRowKeys) ? legacy.selectedBatchRowKeys : [];
        if (legacy.batchPromptGenerator && typeof legacy.batchPromptGenerator === "object") {
            batchPromptGenerator.value = {
                ...batchPromptGenerator.value,
                ...legacy.batchPromptGenerator,
            };
        }
    }
    batchWorkspaceDraft.restored.value = true;
    await batchWorkspaceDraft.save();
};

const modeOptions: Array<{ label: string; value: CreationMode; desc: string }> = [
    { label: "首尾帧", value: "frames", desc: "控制开始和结束画面" },
    { label: "全能参考", value: "reference", desc: "图片、视频、音频混合参考" },
];

const modelOptions = ["seedance-2.0", "seedance-2.0-fast"];
const normalizeUiVideoModel = (value: string) => {
    const raw = String(value || "").trim();
    if (raw === "kw-video-v2-fast") {
        return "seedance-2.0-fast";
    }
    if (raw === "kw-video-v2") {
        return "seedance-2.0";
    }
    return modelOptions.includes(raw) ? raw : "seedance-2.0-fast";
};
const ratioOptions = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"];
const baseResolutionOptions = ["480p", "720p"];
const hdResolutionOptions = ["480p", "720p", "1080p"];
const durationOptions = [
    { label: "自动", value: -1 },
    ...Array.from({ length: 12 }, (_, index) => {
        const value = index + 4;
        return { label: `${value}s`, value };
    }),
];
const batchDurationOptions = [
    ...durationOptions.filter(item => item.value >= 4),
    { label: "30s（自动分段）", value: 30 },
    { label: "45s（自动分段）", value: 45 },
    { label: "60s（自动分段）", value: 60 },
];
const referenceRoleMap = {
    image: "reference_image",
    video: "reference_video",
    audio: "reference_audio",
} as const;
const referenceRoles = new Set(Object.values(referenceRoleMap));
const urlKeyOfAssetType = (type: SeedanceAssetType) => {
    return type === "image" ? "image_url" : type === "video" ? "video_url" : "audio_url";
};
const referenceRoleOfAssetType = (type: SeedanceAssetType) => referenceRoleMap[type];
const buildVideoContentItem = (
    type: "image" | "video" | "audio",
    url: string,
    role: "first_frame" | "last_frame" | "reference_image" | "reference_video" | "reference_audio"
) => {
    const key = urlKeyOfAssetType(type);
    return {
        type: key,
        [key]: { url },
        role,
    };
};

const contentUrlOf = (item: any) => {
    if (!item || !referenceRoles.has(item.role)) {
        return "";
    }
    const key = item.type;
    return String(item?.[key]?.url || "").trim();
};
const isKwjmPlatform = (platform: DirectApiPlatformRecord | null) => platform?.content.platformType === "kwjm";
const platformVideoModel = (platform: DirectApiPlatformRecord | null, value: string) => {
    if (!isKwjmPlatform(platform)) {
        return value;
    }
    return value.includes("fast") ? "kw-video-v2-fast" : "kw-video-v2";
};
const getEffectiveDirectFileRelay = async (platform: DirectApiPlatformRecord | null) => {
    const relay = platform?.content.directFileRelay;
    if (relay?.enabled && relay.provider === "modeltop-assets" && String(platform?.content.apiKey || "").trim()) {
        return relay;
    }
    if (
        relay?.enabled &&
        relay.provider === "123pan" &&
        String(relay.clientID || "").trim() &&
        String(relay.clientSecret || "").trim() &&
        String(relay.parentFileID || "").trim()
    ) {
        return relay;
    }
    return await FileRelayConfigService.getPan123Relay();
};
const referenceFilters = {
    image: [{ name: "Image", extensions: ["jpeg", "jpg", "png", "webp", "bmp", "tiff", "gif"] }],
    video: [{ name: "Video", extensions: ["mp4", "mov"] }],
    audio: [{ name: "Audio", extensions: ["wav", "mp3"] }],
};

const MB = 1024 * 1024;
const imageLimits = {
    maxCount: 9,
    maxSize: 30 * MB,
    minSide: 300,
    maxSide: 6000,
    minAspect: 0.4,
    maxAspect: 2.5,
    requestBodyMaxSize: 64 * MB,
};
const videoLimits = {
    maxCount: 3,
    maxSize: 50 * MB,
    minDuration: 2,
    maxDuration: 15,
    totalDuration: 15,
    minSide: 300,
    maxSide: 6000,
    minPixels: 409600,
    maxPixels: 927408,
    minAspect: 0.4,
    maxAspect: 2.5,
    minFps: 24,
    maxFps: 60,
};
const audioLimits = {
    maxCount: 3,
    maxSize: 15 * MB,
    minDuration: 2,
    maxDuration: 15,
    totalDuration: 15,
};

const currentPlatform = computed(() => {
    return platforms.value.find(item => item.id === platformId.value) || null;
});

const resolutionOptions = computed(() => {
    return model.value === "seedance-2.0" ? hdResolutionOptions : baseResolutionOptions;
});

const loadPlatforms = async () => {
    platforms.value = await DirectApiPlatformService.listByCapability("seedance");
    const defaultPlatform = await DirectApiPlatformService.getDefault("seedance");
    platformId.value = platforms.value.some(item => item.id === platformId.value)
        ? platformId.value
        : defaultPlatform?.id || platforms.value[0]?.id || 0;
};

const loadBatchAssetLibrary = async () => {
    const saved = await window.$mapi.storage.get(BATCH_ASSET_LIBRARY_STORAGE_GROUP, BATCH_ASSET_LIBRARY_STORAGE_KEY, []);
    const savedLibrary = Array.isArray(saved) ? saved.filter(item => item?.url && item?.type) : [];
    if (savedLibrary.length) {
        batchAssetLibrary.value = savedLibrary;
        return;
    }
    const oldDraft = await window.$mapi.storage.get("pageDraft", "ToolSeedance", null);
    const oldLibrary = Array.isArray(oldDraft?.batchAssetLibrary)
        ? oldDraft.batchAssetLibrary.filter((item: any) => item?.url && item?.type)
        : [];
    batchAssetLibrary.value = oldLibrary;
    if (oldLibrary.length) {
        await saveBatchAssetLibrary();
    }
};

const saveBatchAssetLibrary = async () => {
    await window.$mapi.storage.set(BATCH_ASSET_LIBRARY_STORAGE_GROUP, BATCH_ASSET_LIBRARY_STORAGE_KEY, batchAssetLibrary.value);
};

const hydrateFromTask = async () => {
    const editTaskId = Number(route.query.editTaskId || 0);
    if (!editTaskId) {
        return;
    }
    const record = await TaskService.get(editTaskId);
    if (!record || record.biz !== "DirectApiTask") {
        return;
    }
    const body = JSON.parse(String(record.modelConfig?.requestBodyJson || "{}"));
    const input = record.param?.input || {};
    platformId.value = Number(record.modelConfig?.providerProfileId || platformId.value || 0);
    title.value = "";
    mode.value = input.mode === "frames" ? "frames" : "reference";
    prompt.value = String(input.prompt || "");
    model.value = normalizeUiVideoModel(String(body.model || model.value));
    ratio.value = String(body.ratio || ratio.value);
    resolution.value = String(body.resolution || resolution.value);
    duration.value = normalizeDuration(body.duration);
    generateAudio.value = body.generate_audio !== false;
    watermark.value = !!body.watermark;
    webSearch.value = Array.isArray(body.tools) && body.tools.some((item: any) => item?.type === "web_search");
    firstFrame.value = String(input.firstFrame || "");
    lastFrame.value = String(input.lastFrame || "");
    assets.value = Array.isArray(input.assets) ? input.assets : [];
    const selectedIds = Array.isArray(input.mentionAssetIds) ? input.mentionAssetIds.map((item: any) => String(item)) : [];
    const validAssetIds = new Set(assets.value.map(item => item.id));
    mentionAssetIds.value = selectedIds.filter((id: string) => validAssetIds.has(id));
    if (!firstFrame.value || !lastFrame.value) {
        const content = Array.isArray(body.content) ? body.content : [];
        firstFrame.value =
            firstFrame.value ||
            String(content.find((item: any) => item?.role === "first_frame")?.image_url?.url || "");
        lastFrame.value =
            lastFrame.value ||
            String(content.find((item: any) => item?.role === "last_frame")?.image_url?.url || "");
    }
    if (!mentionAssetIds.value.length) {
        const referencedUrls = new Set((Array.isArray(body.content) ? body.content : []).map(contentUrlOf).filter(Boolean));
        mentionAssetIds.value = assets.value
            .filter(item => referencedUrls.has(String(item.url || "").trim()))
            .map(item => item.id);
    }
};

const shortTaskText = (value: string, fallback = "Seedance") => {
    const text = String(value || "")
        .replace(/@\S+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (text) {
        return text.slice(0, 28);
    }
    return fallback;
};

const buildSeedanceTaskTitle = () => {
    const assetName = activeReferenceAssets().map(item => item.url).find(Boolean) || assets.value.map(item => item.url).find(Boolean);
    const frameName = firstFrame.value || lastFrame.value || "";
    const sourceName = String(assetName || frameName || "")
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "");
    const base = shortTaskText(prompt.value, sourceName || "Seedance");
    return `${base}_视频_${new Date().toLocaleString()}`;
};

onMounted(async () => {
    bindPageDropUpload();
    if (!route.query.editTaskId) {
        await pageDraft.restore();
    } else {
        pageDraft.restored.value = true;
    }
    await restoreBatchWorkspace();
    normalizeBatchPromptGeneratorSettings();
    await loadBatchAssetLibrary();
    await loadPlatforms();
    await modelStore.init();
    promptModelOptions.value = await modelStore.enabledModels();
    if (!promptModelOptions.value.some(item => item.id === batchPromptGenerator.value.modelKey)) {
        batchPromptGenerator.value.modelKey = promptModelOptions.value[0]?.id || "";
    }
    await hydrateFromTask();
    model.value = normalizeUiVideoModel(model.value);
    ensureSelectedMentionTokens();
    if (!route.query.editTaskId) {
        syncMentionIdsFromPrompt();
    }
    await nextTick();
    mentionPromptSyncReady.value = true;
});

onBeforeUnmount(() => {
    unbindPageDropUpload();
});

watch(model, value => {
    const normalized = normalizeUiVideoModel(value);
    if (normalized !== value) {
        model.value = normalized;
        return;
    }
    if (normalized === "seedance-2.0-fast" && resolution.value === "1080p") {
        resolution.value = "720p";
    }
});

watch(() => batchPromptGenerator.value.videoModel, value => {
    if (normalizeUiVideoModel(value) === "seedance-2.0-fast" && batchPromptGenerator.value.resolution === "1080p") {
        batchPromptGenerator.value.resolution = "720p";
    }
});

watch(() => batchRowEditor.value.totalDuration, value => {
    if (!batchRowEditorVisible.value) return;
    const count = Number(value || 0) > 15 ? batchSegmentDurations(value).length : 0;
    const current = batchRowEditor.value.segmentPrompts || [];
    batchRowEditor.value.segmentPrompts = count
        ? Array.from({ length: count }, (_, index) => current[index] || `${batchRowEditor.value.prompt}\n连续剧情第 ${index + 1} 段。`)
        : [];
});

const isLocalFilePath = (value: string) => {
    return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
};

const isPreviewableImage = (value: string) => {
    return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || isLocalFilePath(value);
};

const isPreviewableVideo = (value: string) => {
    return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || isLocalFilePath(value);
};

const isPlayableAudio = (value: string) => {
    return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || isLocalFilePath(value);
};

const displayUrl = (value: string) => {
    if (/^[a-zA-Z]:[\\/]/.test(value)) {
        return `file:///${value.replace(/\\/g, "/")}`;
    }
    if (/^\\\\/.test(value)) {
        return `file:${value.replace(/\\/g, "/")}`;
    }
    return value;
};

const fileExt = (value: string) => {
    return String(value || "")
        .replace(/[?#].*$/, "")
        .split(".")
        .pop()
        ?.toLowerCase() || "";
};

const detectAssetType = (file: File, path: string): SeedanceAssetType | "" => {
    const mime = String(file.type || "").toLowerCase();
    const ext = fileExt(path || file.name);
    if (mime.startsWith("image/") || ["jpeg", "jpg", "png", "webp", "bmp", "tiff", "gif"].includes(ext)) {
        return "image";
    }
    if (mime.startsWith("video/") || ["mp4", "mov"].includes(ext)) {
        return "video";
    }
    if (mime.startsWith("audio/") || ["wav", "mp3"].includes(ext)) {
        return "audio";
    }
    return "";
};

const formatMB = (value: number) => {
    return (value / MB).toFixed(1) + "MB";
};

const localFileSize = async (path: string) => {
    if (!isLocalFilePath(path)) {
        return 0;
    }
    const stat = await window.$mapi.file.stat(path);
    return Number(stat?.size || 0);
};

const imageInfo = async (path: string) => {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("无法读取图片尺寸"));
        image.src = displayUrl(path);
    });
};

const within = (value: number, min: number, max: number) => value >= min && value <= max;

const validateImageUpload = async (path: string): Promise<{ ok: true; asset: Partial<SeedanceAsset> } | { ok: false; message: string }> => {
    const ext = fileExt(path);
    if (!["jpeg", "jpg", "png", "webp", "bmp", "tiff", "gif"].includes(ext)) {
        return { ok: false, message: shortName(path) + " 格式不支持，图片仅支持 jpeg、png、webp、bmp、tiff、gif" };
    }
    const size = await localFileSize(path);
    if (size > imageLimits.maxSize) {
        return { ok: false, message: shortName(path) + " 大小为 " + formatMB(size) + "，单张图片需小于 30MB" };
    }
    const { width, height } = await imageInfo(path);
    const aspect = width / height;
    if (!within(width, imageLimits.minSide, imageLimits.maxSide) || !within(height, imageLimits.minSide, imageLimits.maxSide)) {
        return { ok: false, message: shortName(path) + " 尺寸为 " + width + "x" + height + "px，宽高需在 300-6000px 之间" };
    }
    if (!within(aspect, imageLimits.minAspect, imageLimits.maxAspect)) {
        return { ok: false, message: shortName(path) + " 宽高比为 " + aspect.toFixed(2) + "，需在 0.4-2.5 之间" };
    }
    return { ok: true, asset: { size, width, height } };
};

const validateVideoUpload = async (path: string): Promise<{ ok: true; asset: Partial<SeedanceAsset> } | { ok: false; message: string }> => {
    const ext = fileExt(path);
    if (!["mp4", "mov"].includes(ext)) {
        return { ok: false, message: shortName(path) + " 格式不支持，视频仅支持 mp4、mov" };
    }
    const size = await localFileSize(path);
    if (size > videoLimits.maxSize) {
        return { ok: false, message: shortName(path) + " 大小为 " + formatMB(size) + "，单个视频不能超过 50MB" };
    }
    const info = await ffprobeVideoInfo(path);
    const aspect = info.width / info.height;
    const pixels = info.width * info.height;
    if (!within(info.duration, videoLimits.minDuration, videoLimits.maxDuration)) {
        return { ok: false, message: shortName(path) + " 时长为 " + info.duration.toFixed(1) + "s，单个视频需在 2-15s 之间" };
    }
    if (!within(info.width, videoLimits.minSide, videoLimits.maxSide) || !within(info.height, videoLimits.minSide, videoLimits.maxSide)) {
        return { ok: false, message: shortName(path) + " 尺寸为 " + info.width + "x" + info.height + "px，宽高需在 300-6000px 之间" };
    }
    if (!within(aspect, videoLimits.minAspect, videoLimits.maxAspect)) {
        return { ok: false, message: shortName(path) + " 宽高比为 " + aspect.toFixed(2) + "，需在 0.4-2.5 之间" };
    }
    if (!within(pixels, videoLimits.minPixels, videoLimits.maxPixels)) {
        return { ok: false, message: shortName(path) + " 画面像素为 " + pixels + "，需在 409600-927408 之间" };
    }
    if (!within(info.fps, videoLimits.minFps, videoLimits.maxFps)) {
        return { ok: false, message: shortName(path) + " 帧率为 " + info.fps.toFixed(2) + " FPS，需在 24-60 FPS 之间" };
    }
    return { ok: true, asset: { size, duration: info.duration, width: info.width, height: info.height, fps: info.fps } };
};

const validateAudioUpload = async (path: string): Promise<{ ok: true; asset: Partial<SeedanceAsset> } | { ok: false; message: string }> => {
    const ext = fileExt(path);
    if (!["wav", "mp3"].includes(ext)) {
        return { ok: false, message: shortName(path) + " 格式不支持，音频仅支持 wav、mp3" };
    }
    const size = await localFileSize(path);
    if (size > audioLimits.maxSize) {
        return { ok: false, message: shortName(path) + " 大小为 " + formatMB(size) + "，单个音频不能超过 15MB" };
    }
    const info = await ffprobeAudioInfo(path);
    if (!within(info.duration, audioLimits.minDuration, audioLimits.maxDuration)) {
        return { ok: false, message: shortName(path) + " 时长为 " + info.duration.toFixed(1) + "s，单个音频需在 2-15s 之间" };
    }
    return { ok: true, asset: { size, duration: info.duration } };
};

const validateUpload = async (type: SeedanceAssetType, path: string) => {
    try {
        if (type === "image") {
            return await validateImageUpload(path);
        }
        if (type === "video") {
            return await validateVideoUpload(path);
        }
        return await validateAudioUpload(path);
    } catch (e: any) {
        return { ok: false as const, message: shortName(path) + " 读取失败：" + String(e?.message || e || "无法识别文件") };
    }
};

const uploadLimitMessage = (messages: string[]) => {
    if (!messages.length) {
        return;
    }
    Dialog.tipError(messages.slice(0, 3).join("\n"));
};

const shortName = (value: string) => {
    const raw = String(value || "");
    if (/^asset:\/\//i.test(raw)) {
        return raw.replace(/^asset:\/\//i, "");
    }
    return raw.replace(/\\/g, "/").split("/").pop() || raw;
};

const assetTypeText = (type: MentionAsset["type"]) => {
    return ({ image: "图片", video: "视频", audio: "音频", frame: "帧" } as const)[type];
};

const normalizeDuration = (value: unknown) => {
    const numeric = Number(value);
    if (numeric === -1) {
        return -1;
    }
    if (!Number.isFinite(numeric)) {
        return 4;
    }
    return Math.min(15, Math.max(4, Math.round(numeric)));
};

const normalizeTotalDuration = (value: unknown) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 15;
    return Math.min(180, Math.max(4, Math.round(numeric)));
};

const batchSegmentDurations = (value: unknown) => {
    const durations: number[] = [];
    let remaining = normalizeTotalDuration(value);
    while (remaining > 15) {
        durations.push(15);
        remaining -= 15;
    }
    if (remaining > 0) durations.push(remaining);
    if (durations.length > 1 && durations[durations.length - 1] < 4) {
        durations[durations.length - 2] -= 4 - durations[durations.length - 1];
        durations[durations.length - 1] = 4;
    }
    return durations;
};

const normalizeRatioValue = (value: unknown, fallback: string) => {
    const raw = String(value || "").trim();
    if (!raw) {
        return fallback;
    }
    if (ratioOptions.includes(raw)) {
        return raw;
    }
    const timeMatch = raw.match(/^(\d{1,2}):0?(\d{1,2})(?::\d{1,2})?$/);
    if (timeMatch) {
        const normalized = `${Number(timeMatch[1])}:${Number(timeMatch[2])}`;
        return ratioOptions.includes(normalized) ? normalized : fallback;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0 && numeric < 1) {
        const totalMinutes = Math.round(numeric * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const normalized = `${hours}:${minutes}`;
        return ratioOptions.includes(normalized) ? normalized : fallback;
    }
    return fallback;
};

const batchSequenceText = (value: number) => {
    return String(Math.max(1, Number(value || 1))).padStart(2, "0");
};

const buildBatchSegmentTitle = (row: Pick<BatchSeedanceRow, "title" | "batchSequence">) => {
    const baseTitle = String(row.title || "未命名").trim() || "未命名";
    return `片段_${baseTitle}_${batchSequenceText(row.batchSequence)}`;
};

watch(duration, value => {
    const normalized = normalizeDuration(value);
    if (duration.value !== normalized) {
        duration.value = normalized;
    }
});

const pickFrame = async (target: "first" | "last") => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return;
    }
    const result = await validateUpload("image", filePath);
    if (!result.ok) {
        uploadLimitMessage([result.message]);
        return;
    }
    if (target === "first") {
        firstFrame.value = filePath;
    } else {
        lastFrame.value = filePath;
    }
};

const addReferenceAsset = (type: SeedanceAssetType, url: string, meta: Partial<SeedanceAsset> = {}) => {
    assets.value.push({
        id: Date.now() + "-" + Math.random(),
        type,
        role: referenceRoleMap[type],
        url,
        ...meta,
    });
};

const addBatchLibraryAsset = (type: SeedanceAssetType, url: string, meta: Partial<SeedanceAsset> = {}) => {
    const key = `${type}:${url}`;
    if (batchAssetLibrary.value.some(item => `${item.type}:${item.url}` === key)) {
        return false;
    }
    batchAssetLibrary.value.push({
        id: Date.now() + "-" + Math.random(),
        type,
        role: referenceRoleMap[type],
        url,
        ...meta,
    });
    return true;
};

const addReferenceAssetsByType = (type: SeedanceAssetType, valid: Array<{ url: string; meta: Partial<SeedanceAsset> }>, errors: string[]) => {
    if (!valid.length) {
        return 0;
    }
    const groupError = validateReferenceGroupLimit(type, valid.map(item => item.meta));
    if (groupError) {
        errors.push(groupError);
        return 0;
    }
    valid.forEach(item => addReferenceAsset(type, item.url, item.meta));
    return valid.length;
};

const currentAssetsOf = (type: SeedanceAssetType) => assets.value.filter(item => item.type === type);

const validateReferenceGroupLimit = (type: SeedanceAssetType, newItems: Array<Partial<SeedanceAsset>>) => {
    return "";
};

const validateReferenceSubmissionLimit = () => {
    const currentImages = activeReferenceAssets().filter(item => item.type === "image");
    if (currentImages.length > imageLimits.maxCount) {
        return "本次引用图片最多 " + imageLimits.maxCount + " 张";
    }
    const totalImageSize = currentImages.reduce((sum, item) => sum + Number(item.size || 0), 0);
    if (totalImageSize > imageLimits.requestBodyMaxSize) {
        return "本次引用图片总体大小约 " + formatMB(totalImageSize) + "，请求体需不超过 64MB；请减少引用或压缩后再传";
    }

    const currentVideos = activeReferenceAssets().filter(item => item.type === "video");
    if (currentVideos.length > videoLimits.maxCount) {
        return "本次引用视频最多 " + videoLimits.maxCount + " 个";
    }
    const totalVideoDuration = currentVideos.reduce((sum, item) => sum + Number(item.duration || 0), 0);
    if (totalVideoDuration > videoLimits.totalDuration) {
        return "本次引用视频总时长为 " + totalVideoDuration.toFixed(1) + "s，不能超过 15s";
    }

    const currentAudios = activeReferenceAssets().filter(item => item.type === "audio");
    if (currentAudios.length > audioLimits.maxCount) {
        return "本次引用音频最多 " + audioLimits.maxCount + " 段";
    }
    const totalAudioDuration = currentAudios.reduce((sum, item) => sum + Number(item.duration || 0), 0);
    if (totalAudioDuration > audioLimits.totalDuration) {
        return "本次引用音频总时长为 " + totalAudioDuration.toFixed(1) + "s，不能超过 15s";
    }
    return "";
};

const pickReference = async (type: SeedanceAssetType) => {
    const filePath = await window.$mapi.file.openFile({
        filters: referenceFilters[type],
        properties: ["multiSelections"],
    });
    if (!filePath) {
        return;
    }
    const list = Array.isArray(filePath) ? filePath : [filePath];
    const valid: Array<{ url: string; meta: Partial<SeedanceAsset> }> = [];
    const errors: string[] = [];
    for (const url of list) {
        const result = await validateUpload(type, url);
        if (result.ok) {
            valid.push({ url, meta: result.asset });
        } else {
            errors.push(result.message);
        }
    }
    const groupError = validateReferenceGroupLimit(type, valid.map(item => item.meta));
    if (groupError) {
        errors.push(groupError);
    } else {
        valid.forEach(item => addReferenceAsset(type, item.url, item.meta));
    }
    uploadLimitMessage(errors);
};

const pickBatchLibraryAsset = async (type: SeedanceAssetType) => {
    const filePath = await window.$mapi.file.openFile({
        filters: referenceFilters[type],
        properties: ["multiSelections"],
    });
    if (!filePath) {
        return;
    }
    const list = Array.isArray(filePath) ? filePath : [filePath];
    const errors: string[] = [];
    let added = 0;
    for (const url of list) {
        const result = await validateUpload(type, url);
        if (!result.ok) {
            errors.push(result.message);
            continue;
        }
        if (addBatchLibraryAsset(type, url, result.asset)) {
            added += 1;
        }
    }
    uploadLimitMessage(errors);
    if (added) {
        await saveBatchAssetLibrary();
        Dialog.tipSuccess(`已加入素材库 ${added} 个素材`);
    }
};

const droppedFilePath = (file: File) => {
    return String((file as any)?.path || (file as any)?.webkitRelativePath || "").trim();
};

const hasDraggedFiles = (event: DragEvent) => {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
};

const onDragEnterUpload = (event: DragEvent) => {
    if (hasDraggedFiles(event)) {
        event.preventDefault();
        event.stopPropagation();
        draggingUpload.value = true;
    }
};

const onDragOverUpload = (event: DragEvent) => {
    if (hasDraggedFiles(event)) {
        event.preventDefault();
        event.stopPropagation();
        draggingUpload.value = true;
    }
};

const onDragLeaveUpload = (event: DragEvent) => {
    const current = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget as Node | null;
    if (!current || !related || !current.contains(related)) {
        draggingUpload.value = false;
    }
};

const handleReferenceDrop = async (files: File[]) => {
    const groups: Record<SeedanceAssetType, Array<{ url: string; meta: Partial<SeedanceAsset> }>> = {
        image: [],
        video: [],
        audio: [],
    };
    const errors: string[] = [];
    for (const file of files) {
        const path = droppedFilePath(file);
        const type = detectAssetType(file, path);
        if (!path) {
            errors.push(file.name + " 无法获取本地路径，请使用上传按钮选择文件");
            continue;
        }
        if (!type) {
            errors.push(file.name + " 格式不支持，仅支持图片、视频、音频素材");
            continue;
        }
        const result = await validateUpload(type, path);
        if (result.ok) {
            groups[type].push({ url: path, meta: result.asset });
        } else {
            errors.push(result.message);
        }
    }
    let added = 0;
    added += addReferenceAssetsByType("image", groups.image, errors);
    added += addReferenceAssetsByType("video", groups.video, errors);
    added += addReferenceAssetsByType("audio", groups.audio, errors);
    uploadLimitMessage(errors);
    if (added && !errors.length) {
        Dialog.tipSuccess("已添加 " + added + " 个素材，可在输入框用 @ 引用");
    }
};

const handleFrameDrop = async (files: File[]) => {
    const errors: string[] = [];
    let added = 0;
    for (const file of files) {
        const path = droppedFilePath(file);
        const type = detectAssetType(file, path);
        if (!path) {
            errors.push(file.name + " 无法获取本地路径，请使用上传按钮选择文件");
            continue;
        }
        if (type !== "image") {
            errors.push(file.name + " 不是图片；首尾帧模式仅支持拖入图片");
            continue;
        }
        const result = await validateUpload("image", path);
        if (!result.ok) {
            errors.push(result.message);
            continue;
        }
        if (!firstFrame.value) {
            firstFrame.value = path;
            added += 1;
        } else if (!lastFrame.value) {
            lastFrame.value = path;
            added += 1;
        } else {
            errors.push(file.name + " 未添加；首帧和尾帧已存在");
        }
    }
    uploadLimitMessage(errors);
    if (added && !errors.length) {
        Dialog.tipSuccess("已添加 " + added + " 张帧图");
    }
};

const onDropUpload = async (event: DragEvent) => {
    if (!hasDraggedFiles(event)) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    draggingUpload.value = false;
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) {
        return;
    }
    if (mode.value === "frames") {
        await handleFrameDrop(files);
        return;
    }
    await handleReferenceDrop(files);
};

const bindPageDropUpload = () => {
    window.addEventListener("dragenter", onDragEnterUpload, true);
    window.addEventListener("dragover", onDragOverUpload, true);
    window.addEventListener("drop", onDropUpload, true);
};

const unbindPageDropUpload = () => {
    window.removeEventListener("dragenter", onDragEnterUpload, true);
    window.removeEventListener("dragover", onDragOverUpload, true);
    window.removeEventListener("drop", onDropUpload, true);
};

const removeAsset = (id: string) => {
    const asset = mentionAssets.value.find(item => item.id === id);
    assets.value = assets.value.filter(item => item.id !== id);
    mentionAssetIds.value = mentionAssetIds.value.filter(item => item !== id);
    if (asset) {
        removeMentionToken(asset);
    }
};

const removeFrame = (target: "first" | "last") => {
    if (target === "first") {
        const asset = mentionAssets.value.find(item => item.id === "first-frame");
        firstFrame.value = "";
        mentionAssetIds.value = mentionAssetIds.value.filter(item => item !== "first-frame");
        if (asset) {
            removeMentionToken(asset);
        }
    } else {
        const asset = mentionAssets.value.find(item => item.id === "last-frame");
        lastFrame.value = "";
        mentionAssetIds.value = mentionAssetIds.value.filter(item => item !== "last-frame");
        if (asset) {
            removeMentionToken(asset);
        }
    }
};

const mentionAssets = computed<MentionAsset[]>(() => {
    const list: MentionAsset[] = [];
    if (mode.value === "frames" && firstFrame.value) {
        list.push({
            id: "first-frame",
            label: `首帧 ${shortName(firstFrame.value)}`,
            type: "frame",
            url: firstFrame.value,
            source: "first_frame",
        });
    }
    if (mode.value === "frames" && lastFrame.value) {
        list.push({
            id: "last-frame",
            label: `尾帧 ${shortName(lastFrame.value)}`,
            type: "frame",
            url: lastFrame.value,
            source: "last_frame",
        });
    }
    if (mode.value === "reference") {
        for (const item of assets.value.filter(item => item.url)) {
            list.push({
                id: item.id,
                label: shortName(item.url),
                type: item.type,
                url: item.url,
                source: "asset",
            });
        }
    }
    return list;
});

const selectedMentionAssets = computed(() => {
    return mentionAssetIds.value
        .map(id => mentionAssets.value.find(item => item.id === id))
        .filter(Boolean) as MentionAsset[];
});

const activeReferenceAssets = () => {
    const ids = Array.from(new Set(selectedMentionAssets.value
        .filter(item => item.source === "asset")
        .map(item => item.id)));
    return ids
        .map(id => assets.value.find(item => item.id === id))
        .filter(item => item?.url?.trim()) as SeedanceAsset[];
};

const mentionTokenOf = (asset: MentionAsset) => {
    return "@" + asset.label.replace(/\s+/g, "_");
};

const promptMentionLabels = () => batchPromptMentionLabels(prompt.value);

const promptReferencesMentionAsset = (asset: MentionAsset) => {
    return prompt.value.includes(mentionTokenOf(asset)) ||
        promptMentionLabels().some(label => batchMentionLabelMatchesAsset(label, asset.label));
};

const mentionLabelOf = (asset: MentionAsset, index: number) => {
    if (asset.type === "image" || asset.type === "frame") {
        return `参考图${index + 1}`;
    }
    if (asset.type === "video") {
        return `参考视频${index + 1}`;
    }
    return `参考音频${index + 1}`;
};

const splitSpeechFromVisualText = (value: string) => {
    const speeches: string[] = [];
    const visualText = value.replace(/(说|说道|喊|念|口播|对白|台词)[：:]\s*([^。！？；;\n]+[。！？]?)/g, (_match, verb, line) => {
        const index = speeches.length + 1;
        speeches.push(String(line || "").trim());
        return `${verb}台词${index}`;
    });
    return { visualText, speeches };
};

const buildPromptText = () => {
    let text = prompt.value.trim();
    const referencedAssets = selectedMentionAssets.value.filter(item => item.source === "asset");
    if (!referencedAssets.length) {
        return text.replace(/@\S+/g, "").trim();
    }
    const legend = referencedAssets.map((asset, index) => {
        const label = mentionLabelOf(asset, index);
        const matchedLabels = promptMentionLabels().filter(item => batchMentionLabelMatchesAsset(item, asset.label));
        text = text.split(mentionTokenOf(asset)).join(`「${label}」`);
        matchedLabels.forEach(item => {
            text = replaceBatchMention(text, item, `「${label}」`);
        });
        return `${label} = ${assetTypeText(asset.type)}「${asset.label}」`;
    });
    text = text.replace(/@\S+/g, "").replace(/\s{2,}/g, " ").trim();
    const speechSplit = splitSpeechFromVisualText(text);
    const speechLines = speechSplit.speeches.map((line, index) => `台词${index + 1}：「${line}」`);
    return [
        "参考素材绑定（必须严格遵守，不要互换、融合或串用）：",
        ...legend,
        "生成时凡是提到某个参考素材编号，只能使用该编号对应素材的身份、外观、服装、车辆、场景或动作信息；多个角色同时出现时，必须分别保持各自参考图的人物身份，不要把一个角色的脸、身体或服装套到另一个角色身上。",
        "台词、字幕或对白中的姓名、自称、品牌名只作为口播文本，不得据此改变参考素材绑定的人物身份或长相；如果台词姓名与参考素材外观冲突，必须以参考素材外观为准。",
        "画面身份优先级最高：视觉外观只来自参考素材编号和画面动作描述；禁止因为台词里出现名人姓名而生成该名人的脸。",
        "",
        "画面/动作要求（只决定画面，不把台词里的姓名当作人物身份）：",
        speechSplit.visualText,
        ...(speechLines.length ? ["", "口播/字幕要求（只决定嘴型、字幕和声音，不参与人物外观身份）：", ...speechLines] : []),
    ].filter(Boolean).join("\n");
};

const syncMentionIdsFromPrompt = () => {
    const visibleAssetsById = new Map(mentionAssets.value.map(asset => [asset.id, asset]));
    const selectedIds = Array.from(new Set(mentionAssetIds.value)).filter(id => {
        const asset = visibleAssetsById.get(id);
        return !asset || promptReferencesMentionAsset(asset);
    });
    const mentionedIds = mentionAssets.value
        .filter(asset => promptReferencesMentionAsset(asset))
        .map(asset => asset.id);
    mentionAssetIds.value = Array.from(new Set([...selectedIds, ...mentionedIds]));
};

const ensureSelectedMentionTokens = () => {
    const missingTokens = selectedMentionAssets.value
        .filter(asset => !promptReferencesMentionAsset(asset))
        .map(mentionTokenOf);
    if (!missingTokens.length) {
        return;
    }
    prompt.value = `${prompt.value.trimEnd()}${prompt.value.trim() ? " " : ""}${missingTokens.join(" ")} `.trimEnd();
};

const filteredMentionAssets = computed(() => {
    const keyword = assetPickerKeyword.value.trim().toLowerCase();
    if (!keyword) {
        return mentionAssets.value;
    }
    return mentionAssets.value.filter(item => item.label.toLowerCase().includes(keyword));
});

const openMentionPicker = () => {
    if (!mentionAssets.value.length) {
        Dialog.tipError("请先上传素材");
        return;
    }
    assetPickerKeyword.value = "";
    assetPickerVisible.value = true;
};

const getPromptTextarea = () => {
    return promptTextareaRef.value?.$el?.querySelector?.("textarea") as HTMLTextAreaElement | null;
};

const syncMentionPicker = async () => {
    await nextTick();
    const textarea = getPromptTextarea();
    const cursor = typeof textarea?.selectionStart === "number" ? textarea.selectionStart : prompt.value.length;
    const beforeCursor = prompt.value.slice(0, cursor);
    const match = beforeCursor.match(/@([^\s@]*)$/);
    assetPickerVisible.value = Boolean(match && mentionAssets.value.length);
    assetPickerKeyword.value = match?.[1] || "";
    mentionRange.value = match ? { start: cursor - match[0].length, end: cursor } : null;
    if (mentionPromptSyncReady.value) {
        syncMentionIdsFromPrompt();
    }
};

watch(prompt, syncMentionPicker);

const selectMentionAsset = (asset: MentionAsset) => {
    const token = mentionTokenOf(asset);
    const range = mentionRange.value;
    if (range) {
        const prefix = prompt.value.slice(0, range.start).trimEnd();
        const suffix = prompt.value.slice(range.end).trimStart();
        prompt.value = `${prefix}${prefix ? " " : ""}${token} ${suffix}`.trimEnd();
    } else {
        prompt.value = `${prompt.value.trimEnd()}${prompt.value.trim() ? " " : ""}${token} `;
    }
    if (!mentionAssetIds.value.includes(asset.id)) {
        mentionAssetIds.value.push(asset.id);
    }
    assetPickerVisible.value = false;
    assetPickerKeyword.value = "";
    mentionRange.value = null;
};

const hideMentionPickerLater = () => {
    window.setTimeout(() => {
        assetPickerVisible.value = false;
        mentionRange.value = null;
    }, 120);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mentionTokenRanges = (text: string) => {
    const ranges: Array<{ start: number; end: number; asset: MentionAsset }> = [];
    for (const asset of mentionAssets.value) {
        const token = mentionTokenOf(asset);
        if (!token) {
            continue;
        }
        const reg = new RegExp(escapeRegExp(token), "g");
        let match: RegExpExecArray | null;
        while ((match = reg.exec(text))) {
            ranges.push({ start: match.index, end: match.index + token.length, asset });
        }
    }
    return ranges.sort((a, b) => a.start - b.start);
};

const trimRemovedTokenWhitespace = (text: string, start: number, end: number) => {
    let removeStart = start;
    let removeEnd = end;
    if (removeStart > 0 && /\s/.test(text[removeStart - 1])) {
        removeStart -= 1;
    } else if (removeEnd < text.length && /\s/.test(text[removeEnd])) {
        removeEnd += 1;
    }
    return {
        value: `${text.slice(0, removeStart)}${text.slice(removeEnd)}`,
        cursor: removeStart,
    };
};

const removePromptTokenRange = async (range: { start: number; end: number; asset: MentionAsset }) => {
    const result = trimRemovedTokenWhitespace(prompt.value, range.start, range.end);
    prompt.value = result.value;
    mentionAssetIds.value = mentionAssetIds.value.filter(id => id !== range.asset.id);
    await nextTick();
    const textarea = getPromptTextarea();
    textarea?.setSelectionRange(result.cursor, result.cursor);
};

const handlePromptKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
    }
    const textarea = event.target as HTMLTextAreaElement | null;
    if (!textarea || typeof textarea.selectionStart !== "number" || typeof textarea.selectionEnd !== "number") {
        return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const ranges = mentionTokenRanges(prompt.value);
    if (start !== end) {
        const touchedRanges = ranges.filter(item => start < item.end && end > item.start);
        if (!touchedRanges.length) {
            return;
        }
        const removeStart = Math.min(start, ...touchedRanges.map(item => item.start));
        const removeEnd = Math.max(end, ...touchedRanges.map(item => item.end));
        const removedIds = new Set(touchedRanges.map(item => item.asset.id));
        event.preventDefault();
        prompt.value = `${prompt.value.slice(0, removeStart)}${prompt.value.slice(removeEnd)}`;
        mentionAssetIds.value = mentionAssetIds.value.filter(id => !removedIds.has(id));
        void nextTick(() => {
            const currentTextarea = getPromptTextarea();
            currentTextarea?.setSelectionRange(removeStart, removeStart);
        });
        return;
    }
    const range = ranges.find(item => {
        if (event.key === "Backspace") {
            return start > item.start && start <= item.end;
        }
        return start >= item.start && start < item.end;
    });
    if (!range) {
        return;
    }
    event.preventDefault();
    void removePromptTokenRange(range);
};

const removeMentionToken = (asset: MentionAsset) => {
    const token = escapeRegExp(mentionTokenOf(asset));
    prompt.value = prompt.value
        .replace(new RegExp(token, "g"), "")
        .replace(/\s{2,}/g, " ")
        .trimStart();
};

const removeMention = (id: string) => {
    const asset = mentionAssets.value.find(item => item.id === id);
    mentionAssetIds.value = mentionAssetIds.value.filter(item => item !== id);
    if (asset) {
        removeMentionToken(asset);
    }
};

const buildContent = () => {
    const content: any[] = [];
    syncMentionIdsFromPrompt();
    const cleanPrompt = buildPromptText();
    if (cleanPrompt) {
        content.push({ type: "text", text: cleanPrompt });
    }
    if (mode.value === "frames") {
        if (firstFrame.value) {
            content.push(buildVideoContentItem("image", firstFrame.value, "first_frame"));
        }
        if (lastFrame.value) {
            content.push(buildVideoContentItem("image", lastFrame.value, "last_frame"));
        }
    }
    if (mode.value === "reference") {
        for (const item of activeReferenceAssets()) {
            content.push(buildVideoContentItem(item.type, item.url, referenceRoleOfAssetType(item.type)));
        }
    }
    return content;
};

const validateCurrentLimits = async () => {
    if (model.value === "seedance-2.0-fast" && resolution.value === "1080p") {
        return "1080p 仅 seedance-2.0 支持，fast 模型请使用 480p 或 720p";
    }
    if (mode.value === "frames") {
        for (const frame of [firstFrame.value, lastFrame.value].filter(Boolean)) {
            if (isLocalFilePath(frame)) {
                const result = await validateUpload("image", frame);
                if (!result.ok) {
                    return result.message;
                }
            }
        }
        return "";
    }
    for (const item of activeReferenceAssets().filter(item => item.url && isLocalFilePath(item.url))) {
        const result = await validateUpload(item.type, item.url);
        if (!result.ok) {
            return result.message;
        }
        Object.assign(item, result.asset);
    }
    return validateReferenceSubmissionLimit();
};

const normalizeHeaderKey = (value: string) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-（）()【】\[\]：:]/g, "");

const cellValue = (row: Record<string, string>, names: string[]) => {
    const aliases = new Set(names.map(normalizeHeaderKey));
    for (const [key, value] of Object.entries(row)) {
        if (aliases.has(normalizeHeaderKey(key))) {
            return String(value || "").trim();
        }
    }
    return "";
};

const batchPromptMentions = (prompt: string) => {
    const result = new Set<string>();
    const regex = /@[（(]?([^@\s，,。；;：:\n\r）)]+)[）)]?/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(prompt || ""))) {
        const label = String(match[1] || "").trim();
        if (label) {
            result.add(normalizeHeaderKey(label));
        }
    }
    return result;
};

const batchPromptMentionLabels = (prompt: string) => {
    const result = new Set<string>();
    const regex = /@[（(]?([^@\s，,。；;：:\n\r）)]+)[）)]?/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(prompt || ""))) {
        const label = String(match[1] || "").trim();
        if (label) {
            result.add(label);
        }
    }
    return Array.from(result);
};

const stripBatchAssetLabelSuffix = (value: string) => {
    return String(value || "")
        .trim()
        .replace(/(参考)?(图片|图像|照片|素材图|素材|图)$/i, "")
        .trim();
};

const stripBatchAssetDescriptor = (value: string) => {
    return String(value || "")
        .trim()
        .replace(/(特写|近景|远景|正面|侧面|背面|俯视|细节|局部|参考)$/i, "")
        .trim();
};

const batchAssetMentionKeys = (label: string) => {
    const baseName = shortName(label).replace(/\.[^.]+$/, "");
    const values = [
        normalizeHeaderKey(label),
        normalizeHeaderKey(stripBatchAssetLabelSuffix(label)),
        normalizeHeaderKey(stripBatchAssetDescriptor(stripBatchAssetLabelSuffix(label))),
        normalizeHeaderKey(baseName),
        normalizeHeaderKey(stripBatchAssetLabelSuffix(baseName)),
        normalizeHeaderKey(stripBatchAssetDescriptor(stripBatchAssetLabelSuffix(baseName))),
    ];
    return Array.from(new Set(values.filter(Boolean)));
};

const batchFuzzyMatchKey = (assetKey: string, mentionKey: string) => {
    if (!assetKey || !mentionKey) {
        return false;
    }
    if (assetKey === mentionKey) {
        return true;
    }
    const minLength = Math.min(assetKey.length, mentionKey.length);
    if (minLength < 2) {
        return false;
    }
    return assetKey.includes(mentionKey) || mentionKey.includes(assetKey);
};

const batchAssetIsMentioned = (asset: Pick<BatchSeedanceAsset, "label">, mentionedKeys: Set<string>) => {
    return batchAssetMentionKeys(asset.label).some(assetKey => {
        return Array.from(mentionedKeys).some(mentionKey => batchFuzzyMatchKey(assetKey, mentionKey));
    });
};

const batchMentionLabelMatchesAsset = (mentionLabel: string, assetLabel: string) => {
    const mentionKeys = batchAssetMentionKeys(mentionLabel);
    const assetKeys = batchAssetMentionKeys(assetLabel);
    return assetKeys.some(assetKey => mentionKeys.some(mentionKey => batchFuzzyMatchKey(assetKey, mentionKey)));
};

const normalizePromptAssetMentions = (promptText: string, sourceAssets: Array<Pick<BatchSeedanceAsset, "label">>) => {
    let text = String(promptText || "");
    const labels = Array.from(new Set(sourceAssets
        .map(asset => String(asset.label || "").replace(/\.[^.]+$/, "").trim())
        .filter(label => label.length >= 2)))
        .sort((a, b) => b.length - a.length);
    for (const label of labels) {
        const matcher = new RegExp(escapeRegExp(label), "g");
        text = text.replace(matcher, (matched, offset: number, fullText: string) => {
            const before = fullText.slice(0, offset);
            const after = fullText.slice(offset + matched.length);
            // 已在 @（素材名）内或名称后已有引用时，不再重复追加。
            if (/@[（(]\s*$/.test(before) || /^\s*@[（(]?/.test(after)) return matched;
            // “尾帧图 @（尾帧）”这一类已写清素材与用途的表达保持原样。
            if (after.startsWith("图") && /^图\s*@[（(]?/.test(after)) return matched;
            return `${matched}@（${label}）`;
        });
    }
    return text;
};

const truthyCell = (value: string, fallback: boolean) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return fallback;
    if (["0", "false", "no", "否", "不", "关闭", "off"].includes(raw)) return false;
    return true;
};

const isRemoteOrDataUrl = (value: string) => /^(https?:\/\/|data:|asset:\/\/)/i.test(String(value || "").trim());

const isAbsoluteLikePath = (value: string) => {
    const raw = String(value || "").trim();
    return isRemoteOrDataUrl(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || /^\\\\/.test(raw);
};

const dirnameOf = (value: string) => {
    const normalized = String(value || "").replace(/\//g, "\\");
    return normalized.slice(0, Math.max(normalized.lastIndexOf("\\"), 0));
};

const resolveBatchAssetPath = (value: string, sheetPath: string) => {
    const raw = String(value || "").trim().replace(/^file:\/\//i, "");
    if (!raw || isAbsoluteLikePath(raw)) return raw;
    const baseDir = dirnameOf(sheetPath);
    return baseDir ? `${baseDir}\\${raw.replace(/^[/\\]+/, "")}` : raw;
};

const splitAssetValues = (value: string, sheetPath: string) => String(value || "")
    .split(/[\n;,，；]+/)
    .map(item => resolveBatchAssetPath(item, sheetPath))
    .filter(Boolean);

const batchReferenceRoleOf = (kind: SeedanceAssetType) => referenceRoleMap[kind];

const isBatchConfigColumn = (key: string) => {
    const normalized = normalizeHeaderKey(key);
    return [
        "标题",
        "任务标题",
        "名称",
        "title",
        "name",
        "提示词",
        "视频提示词",
        "生视频提示词",
        "prompt",
        "videoprompt",
        "text",
        "比例",
        "画幅",
        "ratio",
        "aspectratio",
        "时长",
        "秒数",
        "duration",
        "seconds",
        "清晰度",
        "分辨率",
        "resolution",
        "模型",
        "model",
        "videomodel",
        "生成音频",
        "音频",
        "generateaudio",
        "generate_audio",
        "水印",
        "watermark",
        "首帧",
        "首图",
        "开始帧",
        "firstframe",
        "first_frame",
        "尾帧",
        "尾图",
        "结束帧",
        "lastframe",
        "last_frame",
    ].map(normalizeHeaderKey).includes(normalized);
};

const batchColumnLooksLikeAsset = (key: string, normalized: string, kind: SeedanceAssetType) => {
    const patterns = {
        image: /(图|图片|图像|照片|素材|车头|车尾|车标|车型|车身|内饰|外观|人物|产品|商品|场景|道具|logo|image|images|photo|picture|referenceimage|referenceimages|assetimage)/i,
        video: /(视频|影片|referencevideo|video|videos)/i,
        audio: /(音频|声音|配音|referenceaudio|audio|audios)/i,
    };
    return patterns[kind].test(key) || patterns[kind].test(normalized);
};

const collectBatchAssets = (
    row: Record<string, string>,
    sheetPath: string,
    kind: SeedanceAssetType,
    mentionedKeys: Set<string>
): BatchSeedanceAsset[] => {
    const result: BatchSeedanceAsset[] = [];
    for (const [key, value] of Object.entries(row)) {
        const normalized = normalizeHeaderKey(key);
        const isMentioned = mentionedKeys.has(normalized);
        if (!isMentioned && isBatchConfigColumn(key)) continue;
        if (isMentioned || batchColumnLooksLikeAsset(key, normalized, kind)) {
            const values = splitAssetValues(value, sheetPath);
            values.forEach((url, index) => {
                result.push({
                    type: kind,
                    url,
                    label: values.length > 1 ? `${key}${index + 1}` : key,
                    role: batchReferenceRoleOf(kind),
                });
            });
        }
    }
    const seen = new Set<string>();
    return result.filter(item => {
        const cacheKey = `${item.type}:${item.url}`;
        if (seen.has(cacheKey)) return false;
        seen.add(cacheKey);
        return true;
    });
};

const normalizeBatchRow = (row: Record<string, string>, rowIndex: number, sheetPath: string): BatchSeedanceRow => {
    const rowModel = normalizeUiVideoModel(cellValue(row, ["模型", "model", "videoModel"]) || model.value);
    const rowResolution = cellValue(row, ["清晰度", "分辨率", "resolution"]) || (rowModel === "seedance-2.0-fast" && resolution.value === "1080p" ? "720p" : resolution.value);
    const rowPrompt = normalizePromptAssetMentions(
        cellValue(row, ["提示词", "视频提示词", "生视频提示词", "prompt", "videoPrompt", "text"]),
        batchAssetLibrary.value.map(asset => ({ label: shortName(asset.url).replace(/\.[^.]+$/, "") }))
    );
    const mentionedKeys = batchPromptMentions(rowPrompt);
    const imageAssets = collectBatchAssets(row, sheetPath, "image", mentionedKeys);
    const videoAssets = collectBatchAssets(row, sheetPath, "video", mentionedKeys);
    const audioAssets = collectBatchAssets(row, sheetPath, "audio", mentionedKeys);
    const hasMentions = mentionedKeys.size > 0;
    const usedImageAssets = hasMentions ? imageAssets.filter(item => batchAssetIsMentioned(item, mentionedKeys)) : imageAssets;
    const usedVideoAssets = hasMentions ? videoAssets.filter(item => batchAssetIsMentioned(item, mentionedKeys)) : videoAssets;
    const usedAudioAssets = hasMentions ? audioAssets.filter(item => batchAssetIsMentioned(item, mentionedKeys)) : audioAssets;
    const totalDuration = normalizeTotalDuration(cellValue(row, ["时长", "秒数", "duration", "seconds"]) || duration.value);
    return {
        rowIndex,
        batchSequence: 0,
        title: cellValue(row, ["标题", "任务标题", "名称", "title", "name"]) || `Seedance批量_${rowIndex}`,
        prompt: rowPrompt,
        firstFrame: resolveBatchAssetPath(cellValue(row, ["首帧", "首图", "开始帧", "firstFrame", "first_frame"]), sheetPath),
        lastFrame: resolveBatchAssetPath(cellValue(row, ["尾帧", "尾图", "结束帧", "lastFrame", "last_frame"]), sheetPath),
        imageUrls: usedImageAssets.map(item => item.url),
        videoUrls: usedVideoAssets.map(item => item.url),
        audioUrls: usedAudioAssets.map(item => item.url),
        imageAssets: usedImageAssets,
        videoAssets: usedVideoAssets,
        audioAssets: usedAudioAssets,
        model: rowModel,
        ratio: normalizeRatioValue(cellValue(row, ["比例", "画幅", "ratio", "aspectRatio"]), ratio.value),
        duration: normalizeDuration(totalDuration),
        totalDuration: totalDuration > 15 ? totalDuration : undefined,
        resolution: rowResolution,
        generateAudio: truthyCell(cellValue(row, ["生成音频", "音频", "generateAudio", "generate_audio"]), generateAudio.value),
        watermark: truthyCell(cellValue(row, ["水印", "watermark"]), watermark.value),
        status: "ready",
    };
};

const assetPoolBatchAssets = (row: BatchSeedanceRow) => {
    const mentionedKeys = batchPromptMentions(normalizePromptAssetMentions(
        row.prompt,
        batchAssetLibrary.value.map(asset => ({ label: shortName(asset.url).replace(/\.[^.]+$/, "") }))
    ));
    if (!mentionedKeys.size) {
        return [];
    }
    return batchAssetLibrary.value
        .filter(item => item.url && batchAssetIsMentioned({ label: shortName(item.url).replace(/\.[^.]+$/, "") }, mentionedKeys))
        .map(item => ({
            type: item.type,
            url: item.url,
            label: shortName(item.url).replace(/\.[^.]+$/, ""),
            role: referenceRoleOfAssetType(item.type),
        } as BatchSeedanceAsset));
};

const batchRowAssets = (row: BatchSeedanceRow) => {
    const promptForBinding = normalizePromptAssetMentions(
        row.prompt,
        [
            ...batchAssetLibrary.value.map(asset => ({ label: shortName(asset.url).replace(/\.[^.]+$/, "") })),
            ...row.imageAssets,
            ...row.videoAssets,
            ...row.audioAssets,
        ]
    );
    const mentionedKeys = batchPromptMentions(promptForBinding);
    const declaredAssets = [
        ...row.imageAssets,
        ...row.videoAssets,
        ...row.audioAssets,
    ];
    // 提示词改写后只保留仍被 @ 引用的表格素材，防止旧行素材继续混入人物参考。
    const activeDeclaredAssets = mentionedKeys.size
        ? declaredAssets.filter(asset => batchAssetIsMentioned(asset, mentionedKeys))
        : declaredAssets;
    const combined = [
        ...activeDeclaredAssets,
        ...assetPoolBatchAssets(row),
    ];
    const seen = new Set<string>();
    return combined.filter(item => {
        const key = `${item.type}:${item.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const batchTailFrameReference = (row: BatchSeedanceRow) => {
    return batchRowAssets(row).find(asset => asset.type === "image" && batchMentionLabelMatchesAsset("尾帧", asset.label));
};

const appendTailFrameInstruction = (text: string, tailFrame?: Pick<BatchSeedanceAsset, "label">, force = false) => {
    if (!tailFrame || (!force && !batchAssetIsMentioned(tailFrame, batchPromptMentions(text)))) {
        return text.trim();
    }
    const label = String(tailFrame.label || "").replace(/\.[^.]+$/, "").trim();
    if (!label) return text.trim();
    const instruction = `尾帧图 @（${label}）作为视频的尾帧，结尾画面必须与该参考图保持一致。`;
    const alreadyExplained = new RegExp(`尾帧图\\s*@?[（(]?\\s*${escapeRegExp(label)}\\s*[）)]?\\s*作为视频的尾帧`, "i").test(text);
    return alreadyExplained ? text.trim() : [text.trim(), instruction].filter(Boolean).join("\n");
};

const batchTailFrameInstruction = (row: BatchSeedanceRow, text: string) => appendTailFrameInstruction(text, batchTailFrameReference(row));

const batchAssetTypeText = (type: SeedanceAssetType) => ({ image: "参考图", video: "参考视频", audio: "参考音频" } as const)[type];

const replaceBatchMention = (text: string, label: string, replacement: string) => {
    const raw = String(label || "").trim();
    if (!raw) {
        return text;
    }
    const escaped = escapeRegExp(raw);
    return text.replace(new RegExp(`@[（(]?\\s*${escaped}\\s*[）)]?`, "g"), replacement);
};

const buildBatchPromptText = (row: BatchSeedanceRow) => {
    let text = batchTailFrameInstruction(row, normalizePromptAssetMentions(
        row.prompt,
        [
            ...batchAssetLibrary.value.map(asset => ({ label: shortName(asset.url).replace(/\.[^.]+$/, "") })),
            ...row.imageAssets,
            ...row.videoAssets,
            ...row.audioAssets,
        ]
    ));
    const assets = batchRowAssets(row);
    if (!assets.length) {
        return text;
    }
    const counters: Record<SeedanceAssetType, number> = { image: 0, video: 0, audio: 0 };
    const mentionLabels = batchPromptMentionLabels(row.prompt);
    const legend = assets.map(asset => {
        counters[asset.type] += 1;
        const numberedLabel =
            asset.type === "image"
                ? `参考图${counters.image}`
                : asset.type === "video"
                  ? `参考视频${counters.video}`
                  : `参考音频${counters.audio}`;
        const sourceLabel = String(asset.label || shortName(asset.url)).trim();
        const matchedMentionLabels = mentionLabels.filter(label => batchMentionLabelMatchesAsset(label, sourceLabel));
        const tokens = Array.from(new Set([
            sourceLabel,
            stripBatchAssetLabelSuffix(sourceLabel),
            shortName(asset.url).replace(/\.[^.]+$/, ""),
            numberedLabel,
            ...matchedMentionLabels,
        ].filter(Boolean)));
        tokens.forEach(token => {
            text = replaceBatchMention(text, token.replace(/^@/, ""), `「${numberedLabel}」`);
        });
        return `${numberedLabel} = ${batchAssetTypeText(asset.type)}「${sourceLabel}」(${shortName(asset.url)})`;
    });
    text = text.replace(/@\S+/g, "").replace(/\s{2,}/g, " ").trim();
    return [
        "参考素材绑定（必须严格遵守，不要互换、融合或串用）：",
        ...legend,
        "生成时凡是提到某个参考素材编号，只能使用该编号对应素材的身份、外观、服装、产品、场景、道具或动作信息；多个角色/产品/场景同时出现时，必须分别保持各自参考素材的一致性。",
        "如果台词、字幕、品牌名或人物称呼与参考素材外观冲突，必须以参考素材为准；不要因为文字内容改变参考素材里的主体身份和长相。",
        "",
        "画面/动作要求：",
        text,
    ].filter(Boolean).join("\n");
};

const buildBatchContent = (row: BatchSeedanceRow) => {
    const content: any[] = [];
    const promptText = buildBatchPromptText(row);
    if (promptText) content.push({ type: "text", text: promptText });
    if (row.firstFrame) content.push(buildVideoContentItem("image", row.firstFrame, "first_frame"));
    if (row.lastFrame) content.push(buildVideoContentItem("image", row.lastFrame, "last_frame"));
    for (const asset of batchRowAssets(row)) {
        content.push(buildVideoContentItem(asset.type, asset.url, asset.role));
    }
    return content;
};

const unresolvedBatchMentions = (row: BatchSeedanceRow) => {
    const mentions = Array.from(batchPromptMentions(row.prompt));
    if (!mentions.length) {
        return [];
    }
    const assetKeys = batchRowAssets(row).flatMap(asset => batchAssetMentionKeys(asset.label));
    return mentions.filter(mentionKey => !assetKeys.some(assetKey => batchFuzzyMatchKey(assetKey, mentionKey)));
};

const batchAssetCountOf = (row: BatchSeedanceRow, type: SeedanceAssetType) => {
    return batchRowAssets(row).filter(item => item.type === type).length;
};

const batchDurationText = (row: BatchSeedanceRow) => {
    const total = normalizeTotalDuration(row.totalDuration || row.duration);
    return total > 15 ? `${total}s / ${Math.ceil(total / 15)}段` : `${row.duration}s`;
};

const removeBatchLibraryAsset = (id: string) => {
    batchAssetLibrary.value = batchAssetLibrary.value.filter(item => item.id !== id);
    void saveBatchAssetLibrary();
};

const batchRowKey = (row: BatchSeedanceRow) => row.batchSequence || row.rowIndex;

const selectedBatchRows = computed(() => {
    const selected = new Set(selectedBatchRowKeys.value);
    return batchRows.value.filter(row => selected.has(batchRowKey(row)));
});

const batchAllSelected = computed(() => {
    return batchRows.value.length > 0 && selectedBatchRows.value.length === batchRows.value.length;
});

const batchSomeSelected = computed(() => {
    return selectedBatchRows.value.length > 0 && selectedBatchRows.value.length < batchRows.value.length;
});

const toggleAllBatchRows = (checked: boolean) => {
    selectedBatchRowKeys.value = checked ? batchRows.value.map(batchRowKey) : [];
};

const invertBatchSelection = () => {
    const selected = new Set(selectedBatchRowKeys.value);
    selectedBatchRowKeys.value = batchRows.value
        .filter(row => !selected.has(batchRowKey(row)))
        .map(batchRowKey);
};

const promptAssetName = (asset: SeedanceAsset) => shortName(asset.url).replace(/\.[^.]+$/, "").trim();

const promptGeneratorAssets = (group: BatchPromptAssetGroup) => {
    const idKey = group === "required"
        ? "requiredAssetIds"
        : group === "pickOne"
          ? "pickOneAssetIds"
          : "optionalAssetIds";
    const ids = new Set(batchPromptGenerator.value[idKey]);
    return batchAssetLibrary.value.filter(asset => ids.has(asset.id));
};

const assetMentionToken = (asset: SeedanceAsset) => `@（${promptAssetName(asset)}）`;

const promptMentionsAsset = (text: string, asset: SeedanceAsset) => {
    return batchMentionLabelMatchesAsset(promptAssetName(asset), Array.from(batchPromptMentionLabels(text))[0] || "") ||
        batchPromptMentionLabels(text).some(label => batchMentionLabelMatchesAsset(label, promptAssetName(asset)));
};

const ensurePromptAssetMentions = (text: string, requiredAssets: SeedanceAsset[], pickOneAssets: SeedanceAsset[], index: number) => {
    const missingRequired = requiredAssets.filter(asset => !promptMentionsAsset(text, asset));
    const hasPickOne = !pickOneAssets.length || pickOneAssets.some(asset => promptMentionsAsset(text, asset));
    const fallbackPick = !hasPickOne ? pickOneAssets[index % pickOneAssets.length] : null;
    const tokens = [...missingRequired, ...(fallbackPick ? [fallbackPick] : [])].map(assetMentionToken);
    return tokens.length ? `${tokens.join(" ")} ${text}`.trim() : text.trim();
};

const parseBatchPromptGeneratorResult = (raw: string) => {
    const cleaned = String(raw || "")
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
    const start = cleaned.search(/[\[{]/);
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start < 0 || end < start) {
        throw new Error("AI 未返回可解析的批量提示词 JSON");
    }
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.rows) ? parsed.rows : []);
    if (!rows.length) {
        throw new Error("AI 返回结果中没有可用的提示词行");
    }
    return rows;
};

const balancePromptSegments = (promptText: string, count: number) => {
    const sentences = String(promptText || "").match(/[^。！？；]+[。！？；]?/g)?.map(item => item.trim()).filter(Boolean) || [];
    if (!sentences.length) return Array.from({ length: count }, () => promptText);
    const buckets = Array.from({ length: count }, () => [] as string[]);
    const targetLength = Math.ceil(sentences.join("").length / count);
    let bucketIndex = 0;
    let bucketLength = 0;
    sentences.forEach((sentence, index) => {
        if (bucketIndex < count - 1 && bucketLength >= targetLength && count - bucketIndex <= sentences.length - index) {
            bucketIndex += 1;
            bucketLength = 0;
        }
        buckets[bucketIndex].push(sentence);
        bucketLength += sentence.length;
    });
    return buckets.map((bucket, index) => bucket.join("") || `连续剧情第 ${index + 1} 段：承接上一段继续推进事件。`);
};

const splitLongVideoPrompt = async (providerId: string, modelId: string, promptText: string, totalDuration: number, supplied: string[] = []) => {
    const segmentCount = Math.ceil(totalDuration / 15);
    if (supplied.length === segmentCount) {
        return supplied;
    }
    try {
        const result = await modelStore.chat(providerId, modelId, [
            `把下面的完整视频故事拆成 ${segmentCount} 段连续的 Seedance 提示词，每段不超过 15 秒。`,
            "只返回 JSON 数组：[{\"prompt\":\"第1段提示词\"}]。每段必须是可独立提交的完整提示词，明确写出本段主体/人物、场景、动作目标、冲突变化、镜头语言和与下一段的衔接动作；不能只写一句事件摘要。后一段承接前段尾帧的动作、人物、服装、车辆、光线和场景；不要重复开场。最后一段才允许使用原故事中已有的 @（尾帧）收束要求，前面各段不得主动写尾帧收束。",
            "不要出现模型、比例、时长、清晰度等参数。",
            `完整故事：${promptText}`,
            supplied.length ? `上一轮错误拆出的分段（必须重写合并为 ${segmentCount} 段，不能遗漏其中任何事件）：${supplied.join("\n")}` : "",
        ].join("\n\n"), {
            systemPrompt: "你是连续短视频分段编剧。你只输出可直接用于生成的分段剧情提示词 JSON，不写解释。",
        }, { loading: false });
        if (!result.code) {
            const parsed = parseBatchPromptGeneratorResult(result.data?.content || "");
            const prompts = parsed.map((item: any) => String(item?.prompt || item || "").trim()).filter(Boolean);
            if (prompts.length === segmentCount) return prompts;
        }
    } catch (e) {
    }
    return balancePromptSegments(supplied.length ? supplied.join("\n") : promptText, segmentCount);
};

const generateBatchPrompts = async () => {
    const settings = batchPromptGenerator.value;
    const theme = settings.theme.trim();
    const count = Math.max(1, Math.min(50, Number(settings.count) || 1));
    const [providerId, modelId] = String(settings.modelKey || "").split("|");
    const requiredAssets = promptGeneratorAssets("required");
    const pickOneAssets = promptGeneratorAssets("pickOne");
    const optionalAssets = promptGeneratorAssets("optional");
    const tailFrameAssets = [...requiredAssets, ...pickOneAssets, ...optionalAssets]
        .filter(asset => asset.type === "image" && batchMentionLabelMatchesAsset("尾帧", promptAssetName(asset)));
    if (!theme) {
        Dialog.tipError("请先填写生成主题");
        return;
    }
    if (!providerId || !modelId) {
        Dialog.tipError("请先在模型中心启用一个文本模型");
        return;
    }
    if (settings.requiredAssetIds.length && !requiredAssets.length) {
        Dialog.tipError("必选素材已不存在，请重新选择");
        return;
    }
    if (settings.pickOneAssetIds.length && !pickOneAssets.length) {
        Dialog.tipError("至少选一个素材已不存在，请重新选择");
        return;
    }
    if (batchRows.value.length) {
        await Dialog.confirm("生成新的批量提示词会替换当前批量清单，是否继续？", "确认生成");
    }
    const assetLines = (assets: SeedanceAsset[]) => assets.map(asset => `- ${promptAssetName(asset)}（${asset.type}，引用格式：${assetMentionToken(asset)}）`).join("\n") || "- 无";
    const longVideoInstruction = normalizeTotalDuration(settings.duration) > 15
        ? `这是 ${settings.duration} 秒连续视频。每项额外返回 segments 数组，按最多 15 秒拆成连续剧情段；每段只写本段发生的事件和镜头推进，后一段必须承接前一段的动作与情绪，最后一段才负责完整收束。格式：{"title":"...","prompt":"完整故事概述","segments":[{"prompt":"第1段提示词"},{"prompt":"第2段提示词"}]}`
        : "";
    const promptText = [
        `请为 Seedance 2.0 生成 ${count} 条可直接提交的视频提示词。`,
        `主题：${theme}`,
        settings.referenceFormat.trim() ? `制作规则（只用于约束，绝不能原句复述或改写成剧情）：${settings.referenceFormat.trim()}` : "",
        `创意偏好：${settings.creativeDirection.trim() || "有梗但合理，用情境反差推动剧情。"}`,
        "必须遵守：每条 prompt 只能引用下列素材名称；引用时必须严格写成 @（素材名），不能改名、不能引用未提供素材。",
        "每条都必须使用的素材：",
        assetLines(requiredAssets),
        "每条至少使用一个的素材（从中自行选择最合适的一个或多个）：",
        assetLines(pickOneAssets),
        "可按镜头需要使用的素材：",
        assetLines(optionalAssets),
        "每条必须是原创的短视频剧情，不是产品描述、规则清单，也不能复述上述制作规则。先从主题、角色关系和素材用途里找一个合理的冲突，再设计反差或反转；梗必须推动事件，拿掉梗后剧情仍应成立。",
        "可以借鉴影视化节奏、抽象反差和热门短视频的叙事结构，但禁止照抄或杜撰影视名台词、品牌口号、网络原句、广告语和无来由的流行梗。除非主题明确要求，不要把素材名中的人物自动写成真实明星身份，也不要给车辆、人物或道具编造不在素材中的外观和功能。",
        "素材使用要符合名称语义：人物素材只承担角色和外观参考，车头/车尾/车把手等局部素材只用于对应镜头或车辆一致性，不能把局部当成完整车辆主体。没有被选中的人物、物品或场景不得凭空加入。",
        tailFrameAssets.length
            ? `如果本条引用以下尾帧素材之一，必须在故事最后明确写出“尾帧图 @（素材名）作为视频的尾帧，结尾画面必须与该参考图保持一致”：${tailFrameAssets.map(asset => assetMentionToken(asset)).join("、")}。`
            : "",
        "提示词要写清人物/主体在做什么、为什么这样做、事件如何变化、镜头如何跟拍，并有完整起承转合。不同条目必须使用不同剧情梗，不得只是替换同义词或素材名称。",
        "每条先选择一个明确且可拍的梗机制，再写成事件：身份/目标错位、认真执行荒诞规则、误会升级后反转、视觉预期被打破、角色把小事当成大事。不要只写“发生争执、发现秘密、最后和解”这类空泛情节；反转必须在画面动作里看得见。",
        longVideoInstruction,
        "只返回 JSON 数组，不要 Markdown 或说明。每项格式：{\"title\":\"有梗的片段标题\",\"prompt\":\"完整剧情视频提示词\"}。提示词正文中不要写模型名称、画幅比例、时长、清晰度或其他提交参数。",
    ].filter(Boolean).join("\n\n");
    batchPromptGenerating.value = true;
    try {
        const result = await modelStore.chat(providerId, modelId, promptText, {
            systemPrompt: "你是懂中文短视频语境的剧情策划和 Seedance 提示词专家。你最重要的任务是创作有梗但合乎情境、有冲突且有转折的原创微剧情，而不是复述规则、硬塞热梗或拼贴名台词。梗必须来自角色关系、场景反差或事件误会，并自然收束。不要照搬影视台词、广告语、品牌口号或网络原句；不要虚构真实人物身份。提示词正文绝不能出现模型名称、画幅比例、时长、清晰度或其他提交参数。必须严格输出合法 JSON，并保留用户要求的 @（素材名）引用格式。",
        }, { loading: false });
        if (result.code) {
            throw new Error(result.msg || "AI 提示词生成失败");
        }
        const generated = parseBatchPromptGeneratorResult(result.data?.content || "");
        const nextRows: BatchSeedanceRow[] = [];
        for (const [index, item] of generated.slice(0, count).entries()) {
            const basePrompt = normalizePromptAssetMentions(
                ensurePromptAssetMentions(String(item?.prompt || item?.提示词 || "").trim(), requiredAssets, pickOneAssets, index),
                batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))
            );
            const mentionedTailFrame = tailFrameAssets.find(asset => batchAssetIsMentioned(
                { label: promptAssetName(asset) },
                batchPromptMentions(basePrompt)
            ));
            const generatedPrompt = appendTailFrameInstruction(
                basePrompt,
                mentionedTailFrame ? { label: promptAssetName(mentionedTailFrame) } : undefined
            );
            const suppliedSegments = Array.isArray(item?.segments) ? item.segments.map((segment: any) => String(segment?.prompt || segment || "").trim()).filter(Boolean) : [];
            const totalDuration = normalizeTotalDuration(settings.duration);
            const segmentPrompts = totalDuration > 15
                ? await splitLongVideoPrompt(providerId, modelId, generatedPrompt, totalDuration, suppliedSegments)
                : undefined;
            nextRows.push({
                rowIndex: index + 1,
                batchSequence: index + 1,
                title: String(item?.title || item?.标题 || `片段${index + 1}`).trim(),
                prompt: generatedPrompt,
                firstFrame: "",
                lastFrame: "",
                imageUrls: [],
                videoUrls: [],
                audioUrls: [],
                imageAssets: [],
                videoAssets: [],
                audioAssets: [],
                model: normalizeUiVideoModel(settings.videoModel),
                ratio: normalizeRatioValue(settings.ratio, "16:9"),
                duration: normalizeDuration(settings.duration),
                totalDuration: totalDuration > 15 ? totalDuration : undefined,
                segmentPrompts: segmentPrompts?.map(segmentPrompt => normalizePromptAssetMentions(
                    segmentPrompt,
                    batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))
                )),
                resolution: settings.resolution,
                generateAudio: generateAudio.value,
                watermark: watermark.value,
                status: "ready",
            });
        }
        if (!nextRows.length) {
            throw new Error("AI 未生成有效提示词");
        }
        batchRows.value = nextRows;
        batchFilePath.value = `AI生成批量提示词_${new Date().toLocaleString()}`;
        selectedBatchRowKeys.value = [];
        batchPromptGeneratorVisible.value = false;
        Dialog.tipSuccess(`已生成 ${nextRows.length} 条批量提示词，请检查后再提交`);
    } catch (e: any) {
        Dialog.tipError(e?.message || "AI 提示词生成失败");
    } finally {
        batchPromptGenerating.value = false;
    }
};

const editBatchRow = (row: BatchSeedanceRow) => {
    batchRowEditingKey.value = batchRowKey(row);
    const totalDuration = normalizeTotalDuration(row.totalDuration || row.duration);
    const segmentCount = totalDuration > 15 ? batchSegmentDurations(totalDuration).length : 0;
    const savedSegments = row.segmentPrompts || [];
    const normalizedSegments = segmentCount && savedSegments.length !== segmentCount
        ? balancePromptSegments(savedSegments.length ? savedSegments.join("\n") : row.prompt, segmentCount)
        : savedSegments;
    batchRowEditor.value = {
        title: row.title,
        prompt: normalizePromptAssetMentions(row.prompt, batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))),
        ratio: row.ratio,
        duration: row.duration,
        totalDuration,
        segmentPrompts: segmentCount ? Array.from({ length: segmentCount }, (_, index) => normalizePromptAssetMentions(
            normalizedSegments[index] || `${row.prompt}\n连续剧情第 ${index + 1} 段。`,
            batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))
        )) : [],
        resolution: row.resolution,
        model: row.model,
    };
    batchRowEditorVisible.value = true;
};

const saveBatchRowEdit = () => {
    const row = batchRows.value.find(item => batchRowKey(item) === batchRowEditingKey.value);
    if (!row) return;
    row.title = batchRowEditor.value.title.trim() || row.title;
    row.prompt = normalizePromptAssetMentions(batchRowEditor.value.prompt, batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) })));
    row.ratio = normalizeRatioValue(batchRowEditor.value.ratio, row.ratio);
    row.duration = normalizeDuration(batchRowEditor.value.totalDuration || batchRowEditor.value.duration);
    row.totalDuration = normalizeTotalDuration(batchRowEditor.value.totalDuration || batchRowEditor.value.duration) > 15
        ? normalizeTotalDuration(batchRowEditor.value.totalDuration)
        : undefined;
    row.segmentPrompts = (batchRowEditor.value.segmentPrompts || [])
        .slice(0, batchSegmentDurations(batchRowEditor.value.totalDuration || batchRowEditor.value.duration).length)
        .map(item => normalizePromptAssetMentions(String(item || "").trim(), batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))))
        .filter(Boolean);
    row.resolution = batchRowEditor.value.resolution;
    row.model = normalizeUiVideoModel(batchRowEditor.value.model);
    row.status = "ready";
    row.error = "";
    batchRowEditorVisible.value = false;
};

const regenerateBatchRowSegments = async () => {
    const totalDuration = normalizeTotalDuration(batchRowEditor.value.totalDuration || batchRowEditor.value.duration);
    const [providerId, modelId] = String(batchPromptGenerator.value.modelKey || "").split("|");
    if (totalDuration <= 15 || !providerId || !modelId || !batchRowEditor.value.prompt.trim()) {
        Dialog.tipError("请先选择可用提示词模型，并填写超过 15 秒的完整提示词");
        return;
    }
    batchSegmentRegenerating.value = true;
    try {
        batchRowEditor.value.segmentPrompts = (await splitLongVideoPrompt(
            providerId,
            modelId,
            batchRowEditor.value.prompt.trim(),
            totalDuration,
            []
        )).map(segmentPrompt => normalizePromptAssetMentions(segmentPrompt, batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))));
        Dialog.tipSuccess("已重新拆分连续提示词");
    } catch (e: any) {
        Dialog.tipError(e?.message || "分段提示词生成失败");
    } finally {
        batchSegmentRegenerating.value = false;
    }
};

const regenerateBatchRowPrompt = async () => {
    const row = batchRows.value.find(item => batchRowKey(item) === batchRowEditingKey.value);
    const [providerId, modelId] = String(batchPromptGenerator.value.modelKey || "").split("|");
    const currentPrompt = batchRowEditor.value.prompt.trim();
    if (!row || !providerId || !modelId || !currentPrompt) {
        Dialog.tipError("请先选择可用提示词模型，并保留一段当前提示词作为重写依据");
        return;
    }
    const mentionedLabels = Array.from(batchPromptMentionLabels(currentPrompt));
    const referenceTokens = mentionedLabels.map(label => `@（${label}）`);
    const totalDuration = normalizeTotalDuration(batchRowEditor.value.totalDuration || batchRowEditor.value.duration);
    batchRowRegenerating.value = true;
    try {
        const result = await modelStore.chat(providerId, modelId, [
            "重写下面这条 Seedance 视频提示词，产出一条全新的、可直接生成的中文微剧情。",
            `标题方向：${batchRowEditor.value.title || row.title}`,
            `创意偏好：${batchPromptGenerator.value.creativeDirection || "有梗但合理，用人物关系、目标错位或反差推进剧情。"}`,
            `当前提示词：${currentPrompt}`,
            referenceTokens.length ? `必须保留并使用这些素材引用，名称和 @ 格式不得改动：${referenceTokens.join("、")}` : "没有指定素材引用。",
            "要求：换一个更有画面感的梗和剧情推进，保留合理的人物/主体关系、清晰的起承转合和可拍动作；不要照抄影视台词、广告语或网络原句。不要写模型、比例、时长、清晰度等提交参数。",
            "只返回 JSON 数组，格式：[{\"title\":\"片段标题\",\"prompt\":\"完整视频提示词\"}]，不要 Markdown 或解释。",
        ].join("\n\n"), {
            systemPrompt: "你是懂中文短视频语境的剧情策划和 Seedance 提示词专家。写出的剧情必须有合理的冲突、反差或反转，并严格保留指定的 @（素材名）引用。",
        }, { loading: false });
        if (result.code) throw new Error(result.msg || "AI 提示词重新生成失败");
        const regenerated = parseBatchPromptGeneratorResult(result.data?.content || "")[0] || {};
        let nextPrompt = String(regenerated?.prompt || regenerated?.提示词 || "").trim();
        const nextMentionLabels = Array.from(batchPromptMentionLabels(nextPrompt));
        const missingTokens = mentionedLabels.filter(label => !nextMentionLabels.some(nextLabel => batchMentionLabelMatchesAsset(label, nextLabel)));
        if (missingTokens.length) nextPrompt = `${missingTokens.map(label => `@（${label}）`).join(" ")} ${nextPrompt}`.trim();
        batchRowEditor.value.title = String(regenerated?.title || regenerated?.标题 || batchRowEditor.value.title).trim();
        batchRowEditor.value.prompt = batchTailFrameInstruction(row, normalizePromptAssetMentions(
            nextPrompt,
            batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))
        ));
        batchRowEditor.value.segmentPrompts = totalDuration > 15
            ? (await splitLongVideoPrompt(providerId, modelId, batchRowEditor.value.prompt, totalDuration, [])).map(segmentPrompt => normalizePromptAssetMentions(
                segmentPrompt,
                batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))
            ))
            : [];
        Dialog.tipSuccess("已生成新的剧情提示词，请检查后保存");
    } catch (e: any) {
        Dialog.tipError(e?.message || "AI 提示词重新生成失败");
    } finally {
        batchRowRegenerating.value = false;
    }
};

const removeBatchRow = async (row: BatchSeedanceRow) => {
    await Dialog.confirm(`确认删除「${row.title || `第 ${row.batchSequence} 条`}」吗？`, "删除批量任务");
    const key = batchRowKey(row);
    batchRows.value = batchRows.value.filter(item => batchRowKey(item) !== key);
    selectedBatchRowKeys.value = selectedBatchRowKeys.value.filter(item => item !== key);
};

const clearAllBatchRows = async () => {
    if (!batchRows.value.length) return;
    await Dialog.confirm(`确认清空全部 ${batchRows.value.length} 条提示词吗？此操作不可撤销。`, "清空批量清单");
    batchRows.value = [];
    selectedBatchRowKeys.value = [];
};

const validateBatchRow = async (row: BatchSeedanceRow, directFileRelay: Awaited<ReturnType<typeof getEffectiveDirectFileRelay>>) => {
    if (!row.prompt.trim() && buildBatchContent(row).length === 0) return "缺少提示词或参考素材";
    const unresolvedMentions = unresolvedBatchMentions(row);
    if (unresolvedMentions.length) return `提示词引用了未匹配的素材：${unresolvedMentions.join("、")}`;
    if (row.model === "seedance-2.0-fast" && row.resolution === "1080p") return "Seedance fast 不支持 1080p，请改为 480p 或 720p";
    for (const image of [row.firstFrame, row.lastFrame, ...batchRowAssets(row).filter(item => item.type === "image").map(item => item.url)].filter(Boolean)) {
        if (!isRemoteOrDataUrl(image)) {
            const result = await validateUpload("image", image);
            if (!result.ok) return result.message;
        }
    }
    for (const video of batchRowAssets(row).filter(item => item.type === "video").map(item => item.url)) {
        if (!isRemoteOrDataUrl(video)) {
            if (!directFileRelay) return "本地视频参考需要先配置 123 云盘或平台素材中转";
            const result = await validateUpload("video", video);
            if (!result.ok) return result.message;
        }
    }
    for (const audio of batchRowAssets(row).filter(item => item.type === "audio").map(item => item.url)) {
        if (!isRemoteOrDataUrl(audio)) {
            const result = await validateUpload("audio", audio);
            if (!result.ok) return result.message;
        }
    }
    return "";
};

const pickBatchSpreadsheet = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Excel/CSV", extensions: ["xlsx", "csv"] }],
    });
    if (!filePath || Array.isArray(filePath)) return;
    try {
        const parsed = await window.$mapi.file.readSpreadsheetRows(filePath);
        batchFilePath.value = filePath;
        const rows = (parsed.rows || [])
            .map((row, index) => normalizeBatchRow(row, index + 2, filePath))
            .filter(row => row.prompt || row.firstFrame || row.lastFrame || row.imageUrls.length || row.videoUrls.length || row.audioUrls.length);
        rows.forEach((row, index) => {
            row.batchSequence = index + 1;
        });
        batchRows.value = rows;
        selectedBatchRowKeys.value = [];
        if (!batchRows.value.length) {
            Dialog.tipError("批量清单没有可提交的数据行");
            return;
        }
        Dialog.tipSuccess(`已读取 ${batchRows.value.length} 条批量任务`);
    } catch (e: any) {
        Dialog.tipError(e?.message || "批量清单读取失败");
    }
};

const exportBatchSpreadsheet = async () => {
    if (!batchRows.value.length) {
        Dialog.tipError("当前没有可导出的批量提示词");
        return;
    }
    const maxSegments = Math.max(0, ...batchRows.value.map(row => (row.segmentPrompts || []).length));
    const headers = [
        "标题", "提示词", "总时长", "分段时长", "模型", "比例", "清晰度", "生成音频", "水印",
        ...Array.from({ length: maxSegments }, (_, index) => `第${index + 1}段提示词`),
    ];
    const rows = batchRows.value.map(row => {
        const totalDuration = normalizeTotalDuration(row.totalDuration || row.duration);
        const values: Record<string, unknown> = {
            "标题": row.title,
            "提示词": row.prompt,
            "总时长": `${totalDuration}s`,
            "分段时长": totalDuration > 15 ? batchSegmentDurations(totalDuration).map(item => `${item}s`).join(" + ") : "",
            "模型": row.model,
            "比例": row.ratio,
            "清晰度": row.resolution,
            "生成音频": row.generateAudio ? "是" : "否",
            "水印": row.watermark ? "是" : "否",
        };
        (row.segmentPrompts || []).forEach((prompt, index) => {
            values[`第${index + 1}段提示词`] = prompt;
        });
        return values;
    });
    const defaultName = `Seedance批量提示词_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.xlsx`;
    const filePath = await window.$mapi.file.openSave({
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
        defaultPath: defaultName,
    });
    if (!filePath) return;
    try {
        await window.$mapi.file.writeSpreadsheetRows(filePath, headers, rows);
        Dialog.tipSuccess("批量提示词已导出为 Excel");
    } catch (e: any) {
        Dialog.tipError(e?.message || "Excel 导出失败");
    }
};

const submitBatchRow = async (
    row: BatchSeedanceRow,
    platform: DirectApiPlatformRecord,
    directFileRelay: Awaited<ReturnType<typeof getEffectiveDirectFileRelay>>
) => {
    const body: any = {
        model: platformVideoModel(platform, row.model),
        content: buildBatchContent(row),
        generate_audio: row.generateAudio,
        resolution: row.resolution,
        ratio: row.ratio,
        duration: row.duration,
        watermark: row.watermark,
    };
    const modelConfig: RunningHubModelConfigType = {
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
        directFileRelay: directFileRelay || undefined,
        submitPath: isKwjmPlatform(platform) ? "/v1/videos/generations" : "/api/v3/contents/generations/tasks",
        queryPath: isKwjmPlatform(platform) ? "/v1/videos/generations/{id}" : "/api/v3/contents/generations/tasks/{id}",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: "json",
    };
    const totalDuration = normalizeTotalDuration(row.totalDuration || row.duration);
    if (totalDuration > 15) {
        const segmentCount = Math.ceil(totalDuration / 15);
        const suppliedPrompts = (row.segmentPrompts || []).filter(Boolean);
        const [providerId, modelId] = String(batchPromptGenerator.value.modelKey || "").split("|");
        const segmentPrompts = providerId && modelId
            ? await splitLongVideoPrompt(providerId, modelId, row.prompt, totalDuration, suppliedPrompts)
            : balancePromptSegments(suppliedPrompts.length ? suppliedPrompts.join("\n") : row.prompt, segmentCount);
        const tailFrame = batchTailFrameReference(row);
        const finalSegmentPrompts = tailFrame && batchAssetIsMentioned(tailFrame, batchPromptMentions(row.prompt))
            ? segmentPrompts.map((segmentPrompt, index) => index === segmentPrompts.length - 1
                ? appendTailFrameInstruction(segmentPrompt, tailFrame, true)
                : segmentPrompt)
            : segmentPrompts;
        const chainParam: SeedanceLongVideoChainTaskParam = {
            title: row.title || `连续视频_${row.batchSequence}`,
            totalDuration,
            segmentPrompts: finalSegmentPrompts.map(segmentPrompt => normalizePromptAssetMentions(
                segmentPrompt,
                batchAssetLibrary.value.map(asset => ({ label: promptAssetName(asset) }))
            )),
            baseContent: buildBatchContent(row),
            finalOnlyAssetUrls: batchRowAssets(row)
                .filter(asset => batchMentionLabelMatchesAsset("尾帧", asset.label))
                .map(asset => asset.url),
            modelConfig,
            generateAudio: row.generateAudio,
            ratio: row.ratio,
            resolution: row.resolution,
            watermark: row.watermark,
        };
        return await TaskService.submit({
            biz: "SeedanceLongVideoChainTask",
            title: `连续_${buildBatchSegmentTitle(row)}`,
            serverName: "",
            serverTitle: "",
            serverVersion: "",
            modelConfig,
            param: chainParam,
        } as TaskRecord);
    }
    return await TaskService.submit({
        biz: "DirectApiTask",
        title: buildBatchSegmentTitle(row),
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: {
            input: {
                source: "ToolSeedanceBatch",
                batchFilePath: batchFilePath.value,
                batchRowIndex: row.rowIndex,
                batchSequence: row.batchSequence,
                batchSegmentTitle: buildBatchSegmentTitle(row),
                mode: row.firstFrame || row.lastFrame ? "frames" : "reference",
                prompt: row.prompt,
                firstFrame: row.firstFrame,
                lastFrame: row.lastFrame,
                assets: batchRowAssets(row).map(asset => ({
                    id: `${row.rowIndex}-${asset.type}-${asset.url}`,
                    type: asset.type,
                    role: asset.role,
                    url: asset.url,
                })),
            },
        },
    } as TaskRecord);
};

const submitBatchRows = async (rows: BatchSeedanceRow[], emptyMessage: string) => {
    const platform = currentPlatform.value;
    if (!platform) {
        Dialog.tipError("请先在模型栏配置可用平台");
        return;
    }
    if (!platform.content.apiKey.trim()) {
        Dialog.tipError("当前平台未配置 API Key");
        return;
    }
    if (!rows.length) {
        Dialog.tipError(emptyMessage);
        return;
    }
    batchSubmitting.value = true;
    let success = 0;
    let fail = 0;
    try {
        const directFileRelay = await getEffectiveDirectFileRelay(platform);
        for (const row of rows) {
            row.status = "submitting";
            row.error = "";
            try {
                const validateError = await validateBatchRow(row, directFileRelay);
                if (validateError) throw new Error(validateError);
                row.taskId = Number(await submitBatchRow(row, platform, directFileRelay));
                row.status = "success";
                success += 1;
            } catch (e: any) {
                row.status = "fail";
                row.error = e?.message || "提交失败";
                fail += 1;
            }
        }
        Dialog.tipSuccess(`批量提交完成：成功 ${success} 条，失败 ${fail} 条`);
    } finally {
        batchSubmitting.value = false;
    }
};

const submitBatch = async () => {
    if (!batchRows.value.length) {
        Dialog.tipError("请先导入 Excel/CSV 批量清单");
        return;
    }
    await Dialog.confirm(`确认提交全部 ${batchRows.value.length} 条批量任务吗？`, "确认提交批量任务");
    await submitBatchRows(batchRows.value, "请先导入 Excel/CSV 批量清单");
};

const submitSelectedBatch = async () => {
    if (!selectedBatchRows.value.length) {
        Dialog.tipError("请先勾选要提交的批量任务");
        return;
    }
    await Dialog.confirm(`确认提交已选中的 ${selectedBatchRows.value.length} 条批量任务吗？`, "确认提交批量任务");
    await submitBatchRows(selectedBatchRows.value, "请先勾选要提交的批量任务");
};

const submit = async () => {
    const platform = currentPlatform.value;
    if (!platform) {
        Dialog.tipError("请先在模型栏配置可用平台");
        return;
    }
    if (!platform.content.apiKey.trim()) {
        Dialog.tipError("当前平台未配置 API Key");
        return;
    }
    const content = buildContent();
    if (content.length === 0) {
        Dialog.tipError("请输入提示词，或用 @ 引用已上传素材");
        return;
    }
    const limitError = await validateCurrentLimits();
    if (limitError) {
        Dialog.tipError(limitError);
        return;
    }
    const localVideoAsset = activeReferenceAssets().find(item => {
        return item.type === "video" && item.url.trim() && !/^https?:\/\//i.test(item.url.trim()) && !/^asset:\/\//i.test(item.url.trim());
    });
    const directFileRelay = await getEffectiveDirectFileRelay(platform);
    if (localVideoAsset && !directFileRelay) {
        Dialog.tipError("视频参考当前需要先配置全局 123 云盘中转；图片和音频可自动处理");
        return;
    }
    const body: any = {
        model: platformVideoModel(platform, model.value),
        content,
        generate_audio: generateAudio.value,
        resolution: resolution.value,
        ratio: ratio.value,
        duration: normalizeDuration(duration.value),
        watermark: watermark.value,
    };
    if (webSearch.value) {
        body.tools = [{ type: "web_search" }];
    }
    const selectedReferenceAssets = activeReferenceAssets();
    const modelConfig: RunningHubModelConfigType = {
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
        directFileRelay: directFileRelay || undefined,
        submitPath: isKwjmPlatform(platform) ? "/v1/videos/generations" : "/api/v3/contents/generations/tasks",
        queryPath: isKwjmPlatform(platform) ? "/v1/videos/generations/{id}" : "/api/v3/contents/generations/tasks/{id}",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: "json",
    };
    const record: TaskRecord = {
        biz: "DirectApiTask",
        title: title.value.trim() || buildSeedanceTaskTitle(),
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: {
            input: {
                mode: mode.value,
                prompt: prompt.value,
                firstFrame: firstFrame.value,
                lastFrame: lastFrame.value,
                assets: mode.value === "reference" ? selectedReferenceAssets : [],
                mentionAssetIds: mode.value === "reference" ? selectedReferenceAssets.map(item => item.id) : [],
            },
        },
    };
    await TaskService.submit(record);
    Dialog.tipSuccess("任务已提交");
};
</script>

<template>
    <div class="relative flex h-full min-h-[720px] flex-col overflow-hidden bg-[#f6f7f9]">
        <div class="flex-shrink-0 border-b border-gray-100 bg-white px-8 py-5">
            <div class="flex flex-wrap items-center gap-3">
                <div class="min-w-[122px] shrink-0">
                    <div class="whitespace-nowrap text-[28px] font-semibold leading-tight text-gray-900">Seedance 2.0</div>
                </div>
                <a-select v-model="platformId" class="!w-56" placeholder="选择平台">
                    <a-option v-for="item in platforms" :key="item.id" :value="item.id || 0">
                        {{ item.title }}
                    </a-option>
                </a-select>
                <a-button type="primary" @click="batchPromptGeneratorVisible = true">AI生成批量提示词</a-button>
                <a-button @click="pickBatchSpreadsheet">导入批量表</a-button>
                <a-button @click="batchAssetLibraryVisible = true">素材库{{ batchAssetLibrary.length ? `(${batchAssetLibrary.length})` : "" }}</a-button>
                <a-button type="primary" status="success" :disabled="!selectedBatchRows.length" :loading="batchSubmitting" @click="submitSelectedBatch">
                    提交选中{{ selectedBatchRows.length ? `(${selectedBatchRows.length})` : "" }}
                </a-button>
                <a-button @click="router.push('/server')">平台设置</a-button>
            </div>
        </div>

        <div class="min-h-0 flex-grow overflow-y-auto px-4 py-6 xl:px-8">
            <div v-if="!platforms.length" class="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center">
                <div class="text-lg font-semibold text-gray-900">还没有可用平台</div>
                <div class="mt-1 text-sm text-gray-500">先到模型栏配置 ExchangeToken 或其他支持 Seedance 的平台。</div>
                <a-button class="mt-4" type="primary" @click="router.push('/server')">去配置</a-button>
            </div>

            <div v-else class="space-y-4">
            <div v-if="batchRows.length" class="rounded-lg bg-white p-4 shadow-sm">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-sm font-semibold text-gray-800">批量清单：{{ shortName(batchFilePath) }}</div>
                        <div class="mt-1 text-xs text-gray-500">
                            Excel 可只写标题、提示词、比例、时长；提示词里的 @ 名称会从素材库按文件名自动匹配。
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a-checkbox :model-value="batchAllSelected" :indeterminate="batchSomeSelected" @change="toggleAllBatchRows">全选</a-checkbox>
                        <a-button size="small" @click="invertBatchSelection">反选</a-button>
                        <a-button size="small" @click="pickBatchSpreadsheet">重新导入</a-button>
                        <a-button size="small" @click="exportBatchSpreadsheet">导出 Excel</a-button>
                        <a-button size="small" status="danger" @click="clearAllBatchRows">全部删除</a-button>
                        <a-button size="small" type="primary" status="success" :disabled="!selectedBatchRows.length" :loading="batchSubmitting" @click="submitSelectedBatch">
                            提交选中{{ selectedBatchRows.length ? `(${selectedBatchRows.length})` : "" }}
                        </a-button>
                        <a-button size="small" type="outline" :loading="batchSubmitting" @click="submitBatch">提交全部</a-button>
                    </div>
                </div>
                <div class="max-h-[280px] overflow-auto rounded border border-gray-100">
                    <table class="w-full min-w-[760px] table-fixed text-left text-xs">
                        <colgroup>
                            <col class="w-9" />
                            <col class="w-8" />
                            <col class="w-28" />
                            <col class="w-48" />
                            <col class="w-20" />
                            <col class="w-32" />
                            <col class="w-16" />
                            <col class="w-20" />
                        </colgroup>
                        <thead class="sticky top-0 bg-gray-50 text-gray-500">
                            <tr>
                                <th class="px-3 py-2 font-medium">选择</th>
                                <th class="px-3 py-2 font-medium">行</th>
                                <th class="px-3 py-2 font-medium">标题</th>
                                <th class="px-3 py-2 font-medium">提示词</th>
                                <th class="px-3 py-2 font-medium">素材</th>
                                <th class="px-3 py-2 font-medium">参数</th>
                                <th class="px-3 py-2 font-medium">状态</th>
                                <th class="px-3 py-2 font-medium">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in batchRows" :key="row.rowIndex" class="h-12 border-t border-gray-100">
                                <td class="whitespace-nowrap px-3 py-2">
                                    <a-checkbox v-model="selectedBatchRowKeys" :value="batchRowKey(row)" />
                                </td>
                                <td class="whitespace-nowrap px-3 py-2 text-gray-500">{{ row.rowIndex }}</td>
                                <td class="truncate whitespace-nowrap px-3 py-2 text-gray-700" :title="row.title">{{ row.title }}</td>
                                <td class="truncate whitespace-nowrap px-3 py-2 text-gray-700" :title="row.prompt">{{ row.prompt }}</td>
                                <td class="whitespace-nowrap px-3 py-2 text-gray-500">
                                    图{{ batchAssetCountOf(row, 'image') + (row.firstFrame ? 1 : 0) + (row.lastFrame ? 1 : 0) }} / 视频{{ batchAssetCountOf(row, 'video') }} / 音频{{ batchAssetCountOf(row, 'audio') }}
                                </td>
                                <td class="truncate whitespace-nowrap px-3 py-2 text-gray-500" :title="`${row.model} · ${row.ratio} · ${batchDurationText(row)} · ${row.resolution}`">{{ row.model }} · {{ row.ratio }} · {{ batchDurationText(row) }} · {{ row.resolution }}</td>
                                <td class="truncate whitespace-nowrap px-3 py-2">
                                    <a-tag v-if="row.status === 'ready'">待提交</a-tag>
                                    <a-tag v-else-if="row.status === 'submitting'" color="arcoblue">提交中</a-tag>
                                    <a-tag v-else-if="row.status === 'success'" color="green">已提交 #{{ row.taskId }}</a-tag>
                                    <a-tag v-else color="red">{{ row.error || "失败" }}</a-tag>
                                </td>
                                <td class="whitespace-nowrap px-3 py-2">
                                    <a-button size="mini" @click="editBatchRow(row)">编辑</a-button>
                                    <a-button size="mini" status="danger" class="ml-1" @click="removeBatchRow(row)">删除</a-button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="grid grid-cols-[148px_minmax(0,1fr)] gap-4 xl:grid-cols-[184px_minmax(0,1fr)] xl:gap-5">
                <div class="space-y-3">
                    <button
                        v-for="item in modeOptions"
                        :key="item.value"
                        type="button"
                        class="w-full rounded-lg border px-4 py-4 text-left transition-colors"
                        :class="mode === item.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent bg-white text-gray-700 hover:bg-gray-50'"
                        @click="mode = item.value"
                    >
                        <div class="text-sm font-semibold">{{ item.label }}</div>
                        <div class="mt-1 text-xs opacity-70">{{ item.desc }}</div>
                    </button>
                </div>

                <div
                    class="relative min-w-0 rounded-lg bg-white p-5 shadow-sm transition-colors"
                    :class="draggingUpload ? 'ring-2 ring-blue-400 bg-blue-50/40' : ''"
                    @dragenter.prevent="onDragEnterUpload"
                    @dragover.prevent="draggingUpload = true"
                    @dragleave.prevent="onDragLeaveUpload"
                    @drop.prevent="onDropUpload"
                >
                    <div
                        v-if="draggingUpload"
                        class="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-white/80 text-sm font-medium text-blue-600 shadow-sm backdrop-blur"
                    >
                        松开后自动识别图片、视频、音频并添加
                    </div>
                    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <a-tag color="arcoblue">{{ model }}</a-tag>
                            <a-tag>{{ modeOptions.find(item => item.value === mode)?.label }}</a-tag>
                            <a-tag>{{ ratio }}</a-tag>
                            <a-tag>{{ resolution }}</a-tag>
                            <a-tag>{{ duration }}s</a-tag>
                        </div>
                        <div class="text-xs text-gray-400">在底部输入框输入 @ 可引用已上传素材</div>
                    </div>

                    <div v-if="mode === 'frames'" class="grid grid-cols-2 gap-4">
                        <div class="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
                            <div class="mb-3 flex items-center justify-between">
                                <div class="text-sm font-semibold text-gray-700">首帧</div>
                                <a-button size="small" @click="pickFrame('first')">上传图片</a-button>
                            </div>
                            <div class="aspect-video rounded-lg bg-white flex items-center justify-center overflow-hidden">
                                <img v-if="firstFrame && isPreviewableImage(firstFrame)" :src="displayUrl(firstFrame)" class="h-full w-full object-contain" />
                                <div v-else class="text-xs text-gray-400">未选择</div>
                            </div>
                            <div v-if="firstFrame" class="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500">
                                <span class="min-w-0 truncate">{{ shortName(firstFrame) }}</span>
                                <a-button size="mini" status="danger" @click="removeFrame('first')">移除</a-button>
                            </div>
                        </div>
                        <div class="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
                            <div class="mb-3 flex items-center justify-between">
                                <div class="text-sm font-semibold text-gray-700">尾帧</div>
                                <a-button size="small" @click="pickFrame('last')">上传图片</a-button>
                            </div>
                            <div class="aspect-video rounded-lg bg-white flex items-center justify-center overflow-hidden">
                                <img v-if="lastFrame && isPreviewableImage(lastFrame)" :src="displayUrl(lastFrame)" class="h-full w-full object-contain" />
                                <div v-else class="text-xs text-gray-400">未选择</div>
                            </div>
                            <div v-if="lastFrame" class="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500">
                                <span class="min-w-0 truncate">{{ shortName(lastFrame) }}</span>
                                <a-button size="mini" status="danger" @click="removeFrame('last')">移除</a-button>
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-4">
                        <div class="flex flex-wrap gap-2">
                            <a-button @click="pickReference('image')">上传图片</a-button>
                            <a-button @click="pickReference('video')">上传视频</a-button>
                            <a-button @click="pickReference('audio')">上传音频</a-button>
                        </div>
                        <div v-if="assets.length" class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                            <div
                                v-for="asset in assets"
                                :key="asset.id"
                                class="rounded-lg border border-gray-100 bg-gray-50 p-3"
                            >
                                <a-popover trigger="hover" position="top">
                                    <div class="h-28 rounded-lg bg-white flex cursor-default items-center justify-center overflow-hidden text-xs text-gray-400">
                                        <img v-if="asset.type === 'image' && isPreviewableImage(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-contain" />
                                        <video v-else-if="asset.type === 'video' && isPreviewableVideo(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-contain" muted />
                                        <div v-else-if="asset.type === 'audio' && isPlayableAudio(asset.url)" class="flex h-full w-full flex-col items-center justify-center gap-2 px-3">
                                            <div class="text-lg text-gray-500">♪</div>
                                            <div class="max-w-full truncate text-xs text-gray-500">{{ shortName(asset.url) }}</div>
                                        </div>
                                        <span v-else class="px-3 text-center">{{ shortName(asset.url) }}</span>
                                    </div>
                                    <template #content>
                                        <div class="w-56">
                                            <div class="mb-2 text-xs text-gray-500">{{ assetTypeText(asset.type) }}</div>
                                            <img v-if="asset.type === 'image' && isPreviewableImage(asset.url)" :src="displayUrl(asset.url)" class="max-h-48 w-full rounded object-contain" />
                                            <video v-else-if="asset.type === 'video' && isPreviewableVideo(asset.url)" :src="displayUrl(asset.url)" class="max-h-48 w-full rounded object-contain" controls />
                                            <div v-else-if="asset.type === 'audio' && isPlayableAudio(asset.url)" class="space-y-2">
                                                <div class="break-all text-sm text-gray-700">{{ shortName(asset.url) }}</div>
                                                <audio :src="displayUrl(asset.url)" controls class="w-full" />
                                            </div>
                                            <div v-else class="break-all text-sm text-gray-700">{{ shortName(asset.url) }}</div>
                                        </div>
                                    </template>
                                </a-popover>
                                <div class="mt-2 flex items-center gap-2">
                                    <a-tag>{{ assetTypeText(asset.type) }}</a-tag>
                                    <div class="min-w-0 flex-grow truncate text-xs text-gray-600">{{ shortName(asset.url) }}</div>
                                    <a-button size="mini" status="danger" @click="removeAsset(asset.id)">删除</a-button>
                                </div>
                            </div>
                        </div>
                        <div v-else class="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                            上传图片、视频或音频后，可在输入框用 @ 引用。
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>

        <div class="flex-shrink-0 border-t border-gray-100 bg-[#f6f7f9] px-4 py-4 xl:px-8">
            <div class="relative mx-auto max-w-[840px] rounded-[22px] border border-gray-100 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                <div class="relative">
                <div
                    v-if="assetPickerVisible"
                    class="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
                >
                    <div class="px-3 pt-3 text-xs text-gray-400">可能@的内容</div>
                    <button
                        v-for="asset in filteredMentionAssets"
                        :key="asset.id"
                        type="button"
                        class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                        @mousedown.prevent
                        @click="selectMentionAsset(asset)"
                    >
                        <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                            <img v-if="(asset.type === 'image' || asset.type === 'frame') && isPreviewableImage(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-cover" />
                            <video v-else-if="asset.type === 'video' && isPreviewableVideo(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-cover" muted />
                            <span v-else-if="asset.type === 'audio'">♪</span>
                            <span v-else>{{ assetTypeText(asset.type) }}</span>
                        </div>
                        <div class="min-w-0">
                            <div class="truncate text-sm text-gray-800">{{ asset.label }}</div>
                            <div class="text-xs text-gray-400">{{ assetTypeText(asset.type) }}</div>
                        </div>
                    </button>
                    <div v-if="!filteredMentionAssets.length" class="px-3 py-4 text-center text-xs text-gray-400">没有匹配素材</div>
                </div>
                <div class="rounded-lg bg-gray-50 p-3">
                    <div v-if="selectedMentionAssets.length" class="mb-2 flex flex-wrap items-center gap-2">
                        <a-popover v-for="asset in selectedMentionAssets" :key="asset.id" trigger="hover" position="top">
                            <div class="group flex max-w-[220px] cursor-default items-center gap-2 rounded-md bg-white px-1.5 py-1 shadow-sm ring-1 ring-gray-100">
                                <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                                    <img v-if="(asset.type === 'image' || asset.type === 'frame') && isPreviewableImage(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-cover" />
                                    <video v-else-if="asset.type === 'video' && isPreviewableVideo(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-cover" muted />
                                    <span v-else-if="asset.type === 'audio'">♪</span>
                                    <span v-else>{{ assetTypeText(asset.type) }}</span>
                                </div>
                                <div class="min-w-0 flex-grow">
                                    <div class="truncate text-xs text-gray-700">{{ asset.label }}</div>
                                    <div class="text-xs text-gray-400">{{ assetTypeText(asset.type) }}</div>
                                </div>
                                <button class="hidden h-5 w-5 flex-shrink-0 rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-500 group-hover:block" type="button" @click="removeMention(asset.id)">x</button>
                            </div>
                            <template #content>
                                <div class="w-60">
                                    <div class="mb-2 break-all text-xs font-medium text-gray-700">{{ asset.label }}</div>
                                    <img v-if="(asset.type === 'image' || asset.type === 'frame') && isPreviewableImage(asset.url)" :src="displayUrl(asset.url)" class="max-h-56 w-full rounded object-contain" />
                                    <video v-else-if="asset.type === 'video' && isPreviewableVideo(asset.url)" :src="displayUrl(asset.url)" class="max-h-56 w-full rounded object-contain" controls />
                                    <div v-else-if="asset.type === 'audio' && isPlayableAudio(asset.url)" class="space-y-2">
                                        <audio :src="displayUrl(asset.url)" controls class="w-full" />
                                    </div>
                                    <div v-else class="break-all text-sm text-gray-700">{{ asset.label }}</div>
                                </div>
                            </template>
                        </a-popover>
                        <button class="h-8 w-8 rounded-full bg-white text-lg text-gray-500 shadow-sm hover:text-blue-600" type="button" @click="openMentionPicker">+</button>
                    </div>
                        <a-textarea
                            ref="promptTextareaRef"
                            v-model="prompt"
                            :auto-size="{ minRows: 2, maxRows: 5 }"
                            placeholder="描述画面、角色、动作和镜头。输入 @ 选择已上传素材。"
                            @input="syncMentionPicker"
                            @keydown="handlePromptKeydown"
                            @keyup="syncMentionPicker"
                            @click="syncMentionPicker"
                            @focus="syncMentionPicker"
                            @blur="hideMentionPickerLater"
                        />
                    </div>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                    <a-select v-model="model" class="!w-44">
                        <a-option v-for="item in modelOptions" :key="item" :value="item">{{ item }}</a-option>
                    </a-select>
                    <a-select v-model="mode" class="!w-28">
                        <a-option v-for="item in modeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                    </a-select>
                    <a-select v-model="ratio" class="!w-24">
                        <a-option v-for="item in ratioOptions" :key="item" :value="item">{{ item }}</a-option>
                    </a-select>
                    <a-select v-model="resolution" class="!w-24">
                        <a-option v-for="item in resolutionOptions" :key="item" :value="item">{{ item }}</a-option>
                    </a-select>
                    <a-select v-model="duration" class="!w-24">
                        <a-option v-for="item in durationOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                    </a-select>
                    <a-button @click="openMentionPicker">@素材</a-button>
                    <a-popover trigger="click" position="top">
                        <a-button>更多</a-button>
                        <template #content>
                            <div class="w-52 space-y-3">
                                <div class="flex items-center justify-between"><span>生成音频</span><a-switch v-model="generateAudio" /></div>
                                <div class="flex items-center justify-between"><span>水印</span><a-switch v-model="watermark" /></div>
                                <div class="flex items-center justify-between"><span>Web Search</span><a-switch v-model="webSearch" /></div>
                                <a-input v-model="title" allow-clear placeholder="任务标题" />
                            </div>
                        </template>
                    </a-popover>
                    <div class="flex-grow"></div>
                    <a-button type="primary" shape="circle" size="large" @click="submit">
                        <icon-send />
                    </a-button>
                </div>
            </div>
        </div>

        <a-modal v-model:visible="batchPromptGeneratorVisible" width="920px" title="AI生成批量提示词" :footer="false" title-align="start">
            <div class="space-y-5">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-gray-700">生成主题</div>
                        <a-textarea v-model="batchPromptGenerator.theme" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="例如：世界杯赛场中展示一款新能源车，氛围热烈、电影感、镜头有节奏" />
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-gray-700">参考格式或补充要求</div>
                        <a-textarea v-model="batchPromptGenerator.referenceFormat" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="可粘贴已有提示词格式、品牌规范、禁用元素或镜头要求" />
                    </div>
                </div>
                <div class="space-y-2">
                    <div class="text-sm font-medium text-gray-700">创意偏好</div>
                    <a-textarea v-model="batchPromptGenerator.creativeDirection" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="例如：荒诞反差、轻喜剧误会、悬念反转、影视感追逐；梗必须自然，不要照搬台词" />
                </div>
                <div class="flex flex-wrap items-end gap-4">
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-gray-700">生成条数</div>
                        <a-input-number v-model="batchPromptGenerator.count" :min="1" :max="50" class="!w-32" />
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-gray-700">视频模型</div>
                        <a-select v-model="batchPromptGenerator.videoModel" class="!w-44">
                            <a-option v-for="item in modelOptions" :key="item" :value="item">{{ item }}</a-option>
                        </a-select>
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-gray-700">比例</div>
                        <a-select v-model="batchPromptGenerator.ratio" class="!w-28">
                            <a-option v-for="item in ratioOptions" :key="item" :value="item">{{ item }}</a-option>
                        </a-select>
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-gray-700">时长</div>
                        <a-select v-model="batchPromptGenerator.duration" class="!w-24">
                            <a-option v-for="item in batchDurationOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                        </a-select>
                    </div>
                    <div class="space-y-2">
                        <div class="text-sm font-medium text-gray-700">清晰度</div>
                        <a-select v-model="batchPromptGenerator.resolution" class="!w-24">
                            <a-option value="480p">480p</a-option>
                            <a-option value="720p">720p</a-option>
                            <a-option value="1080p" :disabled="batchPromptGenerator.videoModel === 'seedance-2.0-fast'">1080p</a-option>
                        </a-select>
                    </div>
                    <div class="min-w-[280px] flex-1 space-y-2">
                        <div class="text-sm font-medium text-gray-700">提示词模型</div>
                        <a-select v-model="batchPromptGenerator.modelKey" placeholder="从模型中心选择已启用模型">
                            <a-option v-for="item in promptModelOptions" :key="item.id" :value="item.id">
                                {{ item.providerTitle }} · {{ item.modelName }}
                            </a-option>
                        </a-select>
                    </div>
                </div>
                <div v-if="!batchAssetLibrary.length" class="rounded border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
                    素材库还是空的。先上传素材，再按本次生成规则勾选必选、至少选一个或可选素材。
                </div>
                <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div class="rounded border border-red-100 bg-red-50/40 p-3">
                        <div class="mb-1 text-sm font-semibold text-gray-800">必选</div>
                        <div class="mb-3 text-xs text-gray-500">每一条提示词都会引用这些素材。</div>
                        <a-checkbox-group v-model="batchPromptGenerator.requiredAssetIds" class="flex max-h-56 flex-col gap-2 overflow-auto">
                            <a-checkbox v-for="asset in batchAssetLibrary" :key="asset.id" :value="asset.id">{{ promptAssetName(asset) }}</a-checkbox>
                        </a-checkbox-group>
                    </div>
                    <div class="rounded border border-amber-100 bg-amber-50/40 p-3">
                        <div class="mb-1 text-sm font-semibold text-gray-800">至少选一个</div>
                        <div class="mb-3 text-xs text-gray-500">每一条至少从这组引用一个素材。</div>
                        <a-checkbox-group v-model="batchPromptGenerator.pickOneAssetIds" class="flex max-h-56 flex-col gap-2 overflow-auto">
                            <a-checkbox v-for="asset in batchAssetLibrary" :key="asset.id" :value="asset.id">{{ promptAssetName(asset) }}</a-checkbox>
                        </a-checkbox-group>
                    </div>
                    <div class="rounded border border-blue-100 bg-blue-50/40 p-3">
                        <div class="mb-1 text-sm font-semibold text-gray-800">可选</div>
                        <div class="mb-3 text-xs text-gray-500">AI 按镜头需要决定是否引用。</div>
                        <a-checkbox-group v-model="batchPromptGenerator.optionalAssetIds" class="flex max-h-56 flex-col gap-2 overflow-auto">
                            <a-checkbox v-for="asset in batchAssetLibrary" :key="asset.id" :value="asset.id">{{ promptAssetName(asset) }}</a-checkbox>
                        </a-checkbox-group>
                    </div>
                </div>
                <div class="flex justify-end gap-2 border-t border-gray-100 pt-4">
                    <a-button @click="batchPromptGeneratorVisible = false">取消</a-button>
                    <a-button type="primary" :loading="batchPromptGenerating" @click="generateBatchPrompts">生成并进入批量清单</a-button>
                </div>
            </div>
        </a-modal>

        <a-modal v-model:visible="batchRowEditorVisible" width="720px" title="编辑批量任务" :footer="false" title-align="start">
            <div class="space-y-4">
                <a-input v-model="batchRowEditor.title" placeholder="片段标题" />
                <div class="space-y-2">
                    <div class="flex items-center justify-between gap-3">
                        <div class="text-sm font-medium text-gray-700">视频提示词</div>
                        <a-button size="mini" type="outline" :loading="batchRowRegenerating" @click="regenerateBatchRowPrompt">AI重新生成</a-button>
                    </div>
                    <a-textarea v-model="batchRowEditor.prompt" :auto-size="{ minRows: 8, maxRows: 16 }" placeholder="视频提示词；素材引用请使用 @（素材名）" />
                </div>
                <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <a-select v-model="batchRowEditor.model"><a-option v-for="item in modelOptions" :key="item" :value="item">{{ item }}</a-option></a-select>
                    <a-select v-model="batchRowEditor.ratio"><a-option v-for="item in ratioOptions" :key="item" :value="item">{{ item }}</a-option></a-select>
                    <a-input-number v-model="batchRowEditor.totalDuration" :min="4" :max="180" placeholder="总时长" />
                    <a-select v-model="batchRowEditor.resolution"><a-option value="480p">480p</a-option><a-option value="720p">720p</a-option><a-option value="1080p">1080p</a-option></a-select>
                </div>
                <div v-if="Number(batchRowEditor.totalDuration || 0) > 15" class="space-y-3 rounded border border-blue-100 bg-blue-50/40 p-3">
                    <div class="flex items-center justify-between gap-3">
                        <div class="text-sm font-semibold text-gray-800">连续分段提示词</div>
                        <a-button size="mini" :loading="batchSegmentRegenerating" @click="regenerateBatchRowSegments">AI重新拆分</a-button>
                    </div>
                    <div v-for="(_, index) in batchRowEditor.segmentPrompts" :key="index" class="space-y-1">
                        <div class="text-xs text-gray-500">第 {{ index + 1 }} 段 · {{ batchSegmentDurations(batchRowEditor.totalDuration)[index] }}s</div>
                        <a-textarea v-model="batchRowEditor.segmentPrompts[index]" :auto-size="{ minRows: 3, maxRows: 7 }" />
                    </div>
                </div>
                <div class="flex justify-end gap-2"><a-button @click="batchRowEditorVisible = false">取消</a-button><a-button type="primary" @click="saveBatchRowEdit">保存</a-button></div>
            </div>
        </a-modal>

        <a-modal v-model:visible="batchAssetLibraryVisible" width="980px" title="批量素材库" :footer="false" title-align="start">
            <div class="space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-sm font-medium text-gray-800">供批量表提示词 @ 自动匹配</div>
                        <div class="mt-1 text-xs text-gray-500">
                            文件名会作为匹配名，例如 尾帧图.png 可匹配 @（尾帧）或 @尾帧；未被某行 @ 到的素材不会提交。
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <a-button @click="pickBatchLibraryAsset('image')">上传图片</a-button>
                        <a-button @click="pickBatchLibraryAsset('video')">上传视频</a-button>
                        <a-button @click="pickBatchLibraryAsset('audio')">上传音频</a-button>
                    </div>
                </div>

                <div class="flex flex-wrap gap-2 text-xs text-gray-500">
                    <a-tag>全部 {{ batchAssetLibrary.length }}</a-tag>
                    <a-tag>图片 {{ batchAssetLibrary.filter(item => item.type === 'image').length }}</a-tag>
                    <a-tag>视频 {{ batchAssetLibrary.filter(item => item.type === 'video').length }}</a-tag>
                    <a-tag>音频 {{ batchAssetLibrary.filter(item => item.type === 'audio').length }}</a-tag>
                </div>

                <div v-if="batchAssetLibrary.length" class="max-h-[560px] overflow-auto rounded border border-gray-100 bg-gray-50 p-3">
                    <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                        <div
                            v-for="asset in batchAssetLibrary"
                            :key="asset.id"
                            class="rounded-lg border border-gray-100 bg-white p-3"
                        >
                            <a-popover trigger="hover" position="top">
                                <div class="h-32 rounded bg-gray-50 flex cursor-default items-center justify-center overflow-hidden text-xs text-gray-400">
                                    <img v-if="asset.type === 'image' && isPreviewableImage(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-contain" />
                                    <video v-else-if="asset.type === 'video' && isPreviewableVideo(asset.url)" :src="displayUrl(asset.url)" class="h-full w-full object-contain" muted />
                                    <div v-else-if="asset.type === 'audio' && isPlayableAudio(asset.url)" class="flex h-full w-full flex-col items-center justify-center gap-2 px-3">
                                        <div class="text-lg text-gray-500">♪</div>
                                        <div class="max-w-full truncate text-xs text-gray-500">{{ shortName(asset.url) }}</div>
                                    </div>
                                    <span v-else class="px-3 text-center">{{ shortName(asset.url) }}</span>
                                </div>
                                <template #content>
                                    <div class="w-64">
                                        <div class="mb-2 text-xs text-gray-500">{{ assetTypeText(asset.type) }}</div>
                                        <img v-if="asset.type === 'image' && isPreviewableImage(asset.url)" :src="displayUrl(asset.url)" class="max-h-56 w-full rounded object-contain" />
                                        <video v-else-if="asset.type === 'video' && isPreviewableVideo(asset.url)" :src="displayUrl(asset.url)" class="max-h-56 w-full rounded object-contain" controls />
                                        <div v-else-if="asset.type === 'audio' && isPlayableAudio(asset.url)" class="space-y-2">
                                            <div class="break-all text-sm text-gray-700">{{ shortName(asset.url) }}</div>
                                            <audio :src="displayUrl(asset.url)" controls class="w-full" />
                                        </div>
                                        <div v-else class="break-all text-sm text-gray-700">{{ shortName(asset.url) }}</div>
                                    </div>
                                </template>
                            </a-popover>
                            <div class="mt-2 flex items-center gap-2">
                                <a-tag>{{ assetTypeText(asset.type) }}</a-tag>
                                <div class="min-w-0 flex-grow truncate text-xs text-gray-700" :title="shortName(asset.url)">
                                    {{ shortName(asset.url) }}
                                </div>
                                <a-button size="mini" status="danger" @click="removeBatchLibraryAsset(asset.id)">删除</a-button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-else class="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
                    还没有素材。先上传所有可复用素材，再导入 Excel 批量生成。
                </div>
            </div>
        </a-modal>
    </div>
</template>
