<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from "vue";
import {doCopy, doOpenFile, doSaveFile} from "../../../components/common/util";
import {Dialog} from "../../../lib/dialog";
import {FileUtil} from "../../../lib/file";
import {model as modelStore} from "../../../module/Model/store/model";

type MediaType = "image" | "video" | "unknown";
type RepairEngine = "lama" | "sdxl-inpaint" | "ffmpeg-delogo" | "vsr-sttn" | "propainter" | "comfyui";
type DetectionMode = "watermark" | "hybrid" | "text";
type VideoDetectionScan = "sample" | "frame";

interface WatermarkMask {
    id: number;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    feather: number;
    startTime: string;
    endTime: string;
    text?: string;
    evidence?: string;
    confidence?: number;
    source?: "vision" | "local" | "service" | "heuristic" | "manual";
}

const filePath = ref("");
const mediaVideo = ref<HTMLVideoElement | null>(null);
const engine = ref<RepairEngine>("lama");
const serviceUrl = ref("http://127.0.0.1:7860");
const outputName = ref("");
const strength = ref(0.78);
const maskPadding = ref(12);
const keepAudio = ref(true);
const detecting = ref(false);
const repairing = ref(false);
const outputPath = ref("");
const repairLog = ref("");
const repairLogPath = ref("");
const detectionMessage = ref("尚未检测");
const detectionSource = ref<"none" | "vision" | "local" | "service" | "heuristic">("none");
const selectedVisionModel = ref("");
const detectionMode = ref<DetectionMode>("watermark");
const videoDetectionScan = ref<VideoDetectionScan>("frame");
const masks = reactive<WatermarkMask[]>([]);
const selectedMaskId = ref<number | null>(null);
const dragState = ref<null | {
    id: number;
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    rect: DOMRect;
    mask: Pick<WatermarkMask, "x" | "y" | "width" | "height">;
}>(null);

const imageExts = ["jpg", "jpeg", "png", "webp"];
const videoExts = ["mp4", "mov", "mkv", "webm"];
const supportedExts = [...imageExts, ...videoExts];
const requiredRepairServiceVersion = "2026-06-22-propainter-auto-weights";

const ext = computed(() => FileUtil.getExt(filePath.value));
const mediaType = computed<MediaType>(() => {
    if (imageExts.includes(ext.value)) {
        return "image";
    }
    if (videoExts.includes(ext.value)) {
        return "video";
    }
    return "unknown";
});
const previewTitle = computed(() => {
    if (!filePath.value) {
        return "等待选择素材";
    }
    return FileUtil.getBaseName(filePath.value, true);
});
const processedUrl = computed(() => {
    if (!filePath.value) {
        return "";
    }
    if (filePath.value.startsWith("http://") || filePath.value.startsWith("https://")) {
        return filePath.value;
    }
    return `file://${filePath.value}`;
});
const outputPreviewUrl = computed(() => {
    if (!outputPath.value) {
        return "";
    }
    if (/^(https?:\/\/|file:\/\/)/i.test(outputPath.value)) {
        return outputPath.value;
    }
    return `file://${outputPath.value}`;
});
const repairButtonText = computed(() => {
    if (mediaType.value === "image") {
        return "本地修复图片";
    }
    if (engine.value === "propainter") {
        return "ProPainter 修复视频";
    }
    if (engine.value === "vsr-sttn") {
        return "VSR/STTN 修复硬字幕";
    }
    if (engine.value === "comfyui") {
        return "ComfyUI 修复视频";
    }
    return "本地修复视频";
});
const engineOptions = computed(() => {
    if (mediaType.value === "video") {
        return [
            {label: "ProPainter 视频时序修复（推荐）", value: "propainter"},
            {label: "本地快速修复（静态角标/小水印）", value: "ffmpeg-delogo"},
            {label: "VSR/STTN 硬字幕/文字专用", value: "vsr-sttn"},
            {label: "ComfyUI 视频修复工作流", value: "comfyui"},
        ];
    }
    return [
        {label: "LaMa 快速图像修复", value: "lama"},
        {label: "SDXL Inpaint 高质量修复", value: "sdxl-inpaint"},
        {label: "ComfyUI 图像修复工作流", value: "comfyui"},
    ];
});
const normalizedOutputName = computed(() => {
    if (outputName.value.trim()) {
        return outputName.value.trim();
    }
    if (!filePath.value) {
        return "";
    }
    const base = FileUtil.getBaseName(filePath.value, false);
    return `${base}-inpaint.${ext.value || "png"}`;
});
const enabledModels = computed(() => {
    const records: Array<{providerId: string; providerTitle: string; modelId: string; modelName: string; supportsVision: boolean}> = [];
    modelStore.providers.forEach(provider => {
        if (!provider.data.enabled) {
            return;
        }
        provider.data.models.forEach(model => {
            if (!model.enabled) {
                return;
            }
            records.push({
                providerId: provider.id,
                providerTitle: provider.title,
                modelId: model.id,
                modelName: model.name,
                supportsVision: isVisionModel(provider.id, provider.title, model.id, model.name, model.types),
            });
        });
    });
    return records;
});
const visionModels = computed(() => enabledModels.value.filter(item => item.supportsVision));
const payload = computed(() => ({
    input: filePath.value,
    mediaType: mediaType.value,
    engine: engine.value,
    serviceUrl: serviceUrl.value,
    outputName: normalizedOutputName.value,
    repair: {
        strength: strength.value,
        maskPadding: maskPadding.value,
        keepAudio: mediaType.value === "video" ? keepAudio.value : undefined,
    },
    masks: masks.map(mask => ({
        name: mask.name,
        confidence: mask.confidence,
        source: mask.source,
        boxPercent: {
            x: mask.x,
            y: mask.y,
            width: mask.width,
            height: mask.height,
        },
        feather: mask.feather,
        timeRange: mediaType.value === "video"
            ? {
                start: mask.startTime || "00:00:00",
                end: mask.endTime || "auto",
            }
            : undefined,
    })),
}));

watch(mediaType, value => {
    if (value === "video" && !["ffmpeg-delogo", "vsr-sttn", "propainter", "comfyui"].includes(engine.value)) {
        engine.value = "propainter";
    }
    if (value === "image" && !["lama", "sdxl-inpaint", "comfyui"].includes(engine.value)) {
        engine.value = "lama";
    }
});
watch(filePath, () => {
    masks.splice(0, masks.length);
    outputPath.value = "";
    detectionMessage.value = "尚未检测";
    detectionSource.value = "none";
});
onMounted(async () => {
    await modelStore.init();
    const savedModel = await window.$mapi.config.get("watermarkVisionModel", "");
    const defaultVision = visionModels.value[0];
    const defaultAny = enabledModels.value[0];
    const savedEnabled = enabledModels.value.find(item => `${item.providerId}|${item.modelId}` === savedModel);
    selectedVisionModel.value = savedEnabled
        ? savedModel
        : defaultVision
            ? `${defaultVision.providerId}|${defaultVision.modelId}`
            : defaultAny
                ? `${defaultAny.providerId}|${defaultAny.modelId}`
                : "";
});

const addMask = () => {
    const item: WatermarkMask = {
        id: Date.now(),
        name: `水印区域 ${masks.length + 1}`,
        x: 70,
        y: 80,
        width: 20,
        height: 12,
        feather: 6,
        startTime: "00:00:00",
        endTime: "",
        source: "manual",
    };
    masks.push(item);
    selectedMaskId.value = item.id;
};
const setMasks = (items: WatermarkMask[]) => {
    masks.splice(0, masks.length, ...items);
    selectedMaskId.value = items[0]?.id || null;
};
const removeMask = (id: number) => {
    const index = masks.findIndex(item => item.id === id);
    if (index >= 0) {
        masks.splice(index, 1);
    }
    if (selectedMaskId.value === id) {
        selectedMaskId.value = masks[0]?.id || null;
    }
};
const isOverbroadVideoMask = (mask: WatermarkMask) => (
    mask.width >= 55 ||
    mask.height >= 18 ||
    mask.width * mask.height >= 520
);
const compactOverbroadVideoMask = (mask: WatermarkMask, index: number): WatermarkMask => {
    const lower = mask.y + mask.height / 2 >= 55;
    const right = mask.x + mask.width / 2 >= 50;
    if (lower && right) {
        const width = clampPercent(Math.min(Math.max(16, mask.width * 0.58), 34), 8, 45);
        const height = clampPercent(Math.min(Math.max(8, mask.height * 0.58), 14), 4, 16);
        const x = clampPercent(mask.x + mask.width - width, 48, 100 - width);
        const y = clampPercent(mask.y + mask.height - height, 58, 100 - height);
        return {
            ...mask,
            id: mask.id || Date.now() + index,
            name: "右下角水印区域",
            x,
            y,
            width,
            height,
            feather: Math.max(mask.feather || 0, 10),
            confidence: Math.min(mask.confidence || 0.6, 0.58),
            source: "heuristic",
        };
    }
    if (lower) {
        return {
            ...mask,
            id: mask.id || Date.now() + index,
            name: "底部水印区域",
            x: 28,
            y: 72,
            width: 44,
            height: 12,
            feather: Math.max(mask.feather || 0, 10),
            confidence: Math.min(mask.confidence || 0.6, 0.55),
            source: "heuristic",
        };
    }
    return {
        ...mask,
        width: clampPercent(Math.min(mask.width, 28), 2, 40),
        height: clampPercent(Math.min(mask.height, 10), 2, 14),
        feather: Math.max(mask.feather || 0, 8),
        confidence: Math.min(mask.confidence || 0.6, 0.55),
        source: "heuristic",
    };
};
const sanitizeVideoMasks = (items: WatermarkMask[]) => {
    const compacted = items
        .filter(mask => mask.width > 0 && mask.height > 0)
        .map((mask, index) => isOverbroadVideoMask(mask) ? compactOverbroadVideoMask(mask, index) : mask)
        .filter(mask => mask.width <= 45 && mask.height <= 16 && mask.width * mask.height <= 420);
    return mergeDetectedMasks(compacted).slice(0, 3);
};
const maskCenter = (mask: WatermarkMask) => ({
    x: mask.x + mask.width / 2,
    y: mask.y + mask.height / 2,
});
const sameWatermarkTrack = (a: WatermarkMask, b: WatermarkMask) => {
    if (shouldMergeMasks(a, b)) {
        return true;
    }
    const ca = maskCenter(a);
    const cb = maskCenter(b);
    const maxWidth = Math.max(a.width, b.width, 1);
    const maxHeight = Math.max(a.height, b.height, 1);
    const sameCorner =
        (ca.x < 35 && cb.x < 35 || ca.x > 65 && cb.x > 65) &&
        (ca.y < 35 && cb.y < 35 || ca.y > 58 && cb.y > 58);
    return sameCorner && Math.abs(ca.x - cb.x) <= Math.max(5, maxWidth * 1.2) && Math.abs(ca.y - cb.y) <= Math.max(4, maxHeight * 1.4);
};
const stabilizeVideoMasks = (items: WatermarkMask[]) => {
    const compacted = items
        .filter(mask => mask.width > 0 && mask.height > 0)
        .map((mask, index) => isOverbroadVideoMask(mask) ? compactOverbroadVideoMask(mask, index) : mask)
        .filter(mask => mask.width <= 45 && mask.height <= 16 && mask.width * mask.height <= 420);
    const groups: Array<{items: WatermarkMask[]; mask: WatermarkMask}> = [];
    compacted
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .forEach(mask => {
            const group = groups.find(item => item.items.some(existing => sameWatermarkTrack(existing, mask)));
            if (group) {
                group.items.push(mask);
                group.mask = unionMask(group.mask, mask);
            } else {
                groups.push({items: [mask], mask});
            }
        });
    return groups
        .map((group, index) => {
            const support = group.items.length;
            const bestConfidence = Math.max(...group.items.map(item => item.confidence || 0));
            const lowContrastEvidence = group.items.some(item => /低对比度|淡字|浅色文字|候选/.test(item.name));
            const mask = {
                ...group.mask,
                id: Date.now() + index,
                confidence: Math.min(0.98, bestConfidence + Math.min(0.18, (support - 1) * 0.06)),
            };
            return {mask, support, bestConfidence, lowContrastEvidence};
        })
        .filter(item => item.support >= 2 || item.bestConfidence >= 0.62 || item.lowContrastEvidence)
        .sort((a, b) => {
            const supportDiff = b.support - a.support;
            if (supportDiff !== 0) {
                return supportDiff;
            }
            return (b.mask.confidence || 0) - (a.mask.confidence || 0);
        })
        .map(item => item.mask)
        .slice(0, 3);
};
const selectMediaFile = async () => {
    const result = await doOpenFile({extensions: supportedExts});
    if (!result || Array.isArray(result)) {
        return;
    }
    const selectedExt = FileUtil.getExt(result);
    if (!supportedExts.includes(selectedExt)) {
        Dialog.tipError(`请选择支持的文件格式：${supportedExts.join(", ")}`);
        return;
    }
    filePath.value = result;
};
const applyPreset = (preset: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center") => {
    const current = masks[0] || null;
    if (!current) {
        addMask();
    }
    const mask = masks[0];
    const presets = mediaType.value === "video"
        ? {
            "top-left": {x: 4, y: 5, width: 18, height: 10, name: "左上角水印"},
            "top-right": {x: 78, y: 5, width: 18, height: 10, name: "右上角水印"},
            "bottom-left": {x: 3, y: 70, width: 22, height: 12, name: "左下角水印"},
            "bottom-right": {x: 85, y: 86, width: 14, height: 8, name: "右下角水印"},
            center: {x: 35, y: 43, width: 30, height: 14, name: "居中水印"},
        }
        : {
            "top-left": {x: 4, y: 4, width: 18, height: 10, name: "左上角水印"},
            "top-right": {x: 78, y: 4, width: 18, height: 10, name: "右上角水印"},
            "bottom-left": {x: 4, y: 82, width: 18, height: 10, name: "左下角水印"},
            "bottom-right": {x: 78, y: 82, width: 18, height: 10, name: "右下角水印"},
            center: {x: 35, y: 43, width: 30, height: 14, name: "居中水印"},
        };
    Object.assign(mask, presets[preset]);
};
const clampPercent = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value * 10) / 10));
const activeMaskClass = (mask: WatermarkMask) => ({
    active: selectedMaskId.value === mask.id,
});
const applyMaskBounds = (
    mask: WatermarkMask,
    next: {x: number; y: number; width: number; height: number}
) => {
    const minSize = 2;
    const width = clampPercent(next.width, minSize, 100);
    const height = clampPercent(next.height, minSize, 100);
    mask.x = clampPercent(next.x, 0, 100 - width);
    mask.y = clampPercent(next.y, 0, 100 - height);
    mask.width = clampPercent(width, minSize, 100 - mask.x);
    mask.height = clampPercent(height, minSize, 100 - mask.y);
};
const stopMaskEdit = () => {
    window.removeEventListener("pointermove", handleMaskPointerMove);
    window.removeEventListener("pointerup", stopMaskEdit);
    dragState.value = null;
};
const handleMaskPointerMove = (event: PointerEvent) => {
    const state = dragState.value;
    if (!state) {
        return;
    }
    const mask = masks.find(item => item.id === state.id);
    if (!mask) {
        stopMaskEdit();
        return;
    }
    const dx = ((event.clientX - state.startX) / Math.max(1, state.rect.width)) * 100;
    const dy = ((event.clientY - state.startY) / Math.max(1, state.rect.height)) * 100;
    const start = state.mask;
    if (state.mode === "move") {
        applyMaskBounds(mask, {
            x: start.x + dx,
            y: start.y + dy,
            width: start.width,
            height: start.height,
        });
        return;
    }

    const left = state.mode === "nw" || state.mode === "sw" ? start.x + dx : start.x;
    const top = state.mode === "nw" || state.mode === "ne" ? start.y + dy : start.y;
    const right = state.mode === "ne" || state.mode === "se" ? start.x + start.width + dx : start.x + start.width;
    const bottom = state.mode === "sw" || state.mode === "se" ? start.y + start.height + dy : start.y + start.height;
    const x = Math.min(left, right - 2);
    const y = Math.min(top, bottom - 2);
    applyMaskBounds(mask, {
        x,
        y,
        width: Math.max(2, right - x),
        height: Math.max(2, bottom - y),
    });
};
const beginMaskEdit = (event: PointerEvent, mask: WatermarkMask, mode: "move" | "nw" | "ne" | "sw" | "se") => {
    const frame = (event.currentTarget as HTMLElement).closest(".media-frame");
    if (!frame) {
        return;
    }
    selectedMaskId.value = mask.id;
    dragState.value = {
        id: mask.id,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        rect: frame.getBoundingClientRect(),
        mask: {
            x: mask.x,
            y: mask.y,
            width: mask.width,
            height: mask.height,
        },
    };
    window.addEventListener("pointermove", handleMaskPointerMove);
    window.addEventListener("pointerup", stopMaskEdit);
};
const expandDetectedBox = (
    box: {x: number; y: number; width: number; height: number},
    source: "vision" | "local" | "service" | "heuristic"
) => {
    const smallTextBoost = box.height <= 7 || box.width <= 14;
    const sourcePad = source === "vision" ? 1.8 : source === "local" ? 1.2 : 1;
    const padX = Math.max(sourcePad, box.width * (smallTextBoost ? 0.18 : 0.12));
    const padY = Math.max(sourcePad * 0.75, box.height * (smallTextBoost ? 0.35 : 0.22));
    const rightEdgeBoost = box.x + box.width > 82 ? padX * 0.7 : 0;
    const bottomEdgeBoost = box.y + box.height > 86 ? padY * 0.85 : 0;
    const x1 = clampPercent(box.x - padX, 0, 100);
    const y1 = clampPercent(box.y - padY, 0, 100);
    const x2 = clampPercent(box.x + box.width + padX + rightEdgeBoost, 0, 100);
    const y2 = clampPercent(box.y + box.height + padY + bottomEdgeBoost, 0, 100);
    return {
        x: x1,
        y: y1,
        width: clampPercent(x2 - x1, 1, 100),
        height: clampPercent(y2 - y1, 1, 100),
    };
};
const isVisionModel = (providerId?: string, providerTitle?: string, modelId?: string, modelName?: string, types?: string[]) => {
    if (Array.isArray(types) && types.includes("vision")) {
        return true;
    }
    const text = [providerId, providerTitle, modelId, modelName].filter(Boolean).join(" ").toLowerCase();
    const patterns = [
        "vision",
        "vlm",
        "qwen-vl",
        "qwen2-vl",
        "qwen2.5-vl",
        "internvl",
        "llava",
        "yi-vision",
        "grok-vision",
        "hunyuan-vision",
        "gemini",
        "gpt-4o",
        "gpt-4.1",
        "o4-mini",
        "omni",
    ];
    const regexPatterns = [
        /\bglm[-\s]*4(?:\.\d+)?v\b/i,
        /\bglm[-\s]*4v\b/i,
        /\bglm[-\s]*\d+(?:\.\d+)?[-\s]*vision\b/i,
    ];
    return patterns.some(pattern => text.includes(pattern)) || regexPatterns.some(pattern => pattern.test(text));
};
const normalizeDetectedMask = (raw: any, index: number, source: "vision" | "local" | "service" | "heuristic"): WatermarkMask | null => {
    const box = raw?.boxPercent || raw?.box || raw?.bbox || raw?.rect || raw;
    if (!box) {
        return null;
    }
    const x = Number(box.x ?? box.left ?? (Array.isArray(box) ? box[0] : 0));
    const y = Number(box.y ?? box.top ?? (Array.isArray(box) ? box[1] : 0));
    const width = Number(box.width ?? box.w ?? (Array.isArray(box) ? box[2] : 0));
    const height = Number(box.height ?? box.h ?? (Array.isArray(box) ? box[3] : 0));
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        return null;
    }
    const expanded = expandDetectedBox({x, y, width, height}, source);
    return {
        id: Date.now() + index,
        name: raw?.name || raw?.text || `疑似水印 ${index + 1}`,
        text: raw?.text || raw?.content || raw?.label || "",
        evidence: raw?.evidence || raw?.reason || raw?.description || raw?.brand || raw?.logo || "",
        x: expanded.x,
        y: expanded.y,
        width: expanded.width,
        height: expanded.height,
        feather: Number(raw?.feather ?? (source === "vision" ? 10 : 6)),
        startTime: raw?.startTime || raw?.start || "00:00:00",
        endTime: raw?.endTime || raw?.end || "",
        confidence: Number(raw?.confidence ?? raw?.score ?? 0.6),
        source,
    };
};
const hasSpecificWatermarkEvidence = (mask: WatermarkMask) => {
    const text = String(mask.text || "").trim();
    const evidence = String(mask.evidence || "").trim();
    const name = String(mask.name || "").trim();
    const combined = [text, evidence, name].filter(Boolean).join(" ");
    const platformOrMark = /抖音|快手|小红书|微博|微信|视频号|公众号|B站|哔哩|西瓜|头条|腾讯|优酷|爱奇艺|芒果|YouTube|TikTok|Instagram|Facebook|Twitter|XHS|CapCut|剪映|可灵|Kling|即梦|豆包|Runway|Pika|Midjourney|Copyright|版权|©|®|@[\w\-.一-龥]+|AI生成|AIGC/i;
    const cleanedText = [text, evidence]
        .join("")
        .replace(/水印|区域|疑似|候选|位置|左上角|右上角|左下角|右下角|左侧|右侧|顶部|底部|居中|中心|平台|文字|标识|角标|logo|LOGO|半透明|浅色|低对比度|淡字|可见|明显|检测到|画面/g, "")
        .replace(/[^\w@©®一-龥]/g, "");
    return platformOrMark.test(combined) || cleanedText.length >= 2;
};
const filterStrictVisionMasks = (items: WatermarkMask[]) => items.filter(mask => (
    mask.source !== "vision" || hasSpecificWatermarkEvidence(mask)
));
const canvasToDataUrl = async () => {
    const canvas = mediaType.value === "image" ? await canvasFromImage() : canvasFromVideo();
    return canvas.toDataURL("image/png", 0.92);
};
const watermarkCropRegions = [
    {name: "左上角", x: 0, y: 0, width: 34, height: 24},
    {name: "右上角", x: 66, y: 0, width: 34, height: 24},
    {name: "左下角", x: 0, y: 68, width: 34, height: 32},
    {name: "右下角", x: 66, y: 68, width: 34, height: 32},
    {name: "极右下角底边", x: 80, y: 82, width: 20, height: 18},
    {name: "右下角淡字区域", x: 84, y: 86, width: 16, height: 12},
    {name: "底部居中", x: 25, y: 70, width: 50, height: 30},
];
const cropCanvasRegion = (
    canvas: HTMLCanvasElement,
    region: {x: number; y: number; width: number; height: number}
) => {
    const sx = Math.round((region.x / 100) * canvas.width);
    const sy = Math.round((region.y / 100) * canvas.height);
    const sw = Math.max(1, Math.min(canvas.width - sx, Math.round((region.width / 100) * canvas.width)));
    const sh = Math.max(1, Math.min(canvas.height - sy, Math.round((region.height / 100) * canvas.height)));
    const target = document.createElement("canvas");
    const scale = Math.min(3, Math.max(1.6, 720 / Math.max(sw, 1)));
    target.width = Math.round(sw * scale);
    target.height = Math.round(sh * scale);
    const ctx = target.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas context not available");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, target.width, target.height);
    return target.toDataURL("image/png", 0.94);
};
const canvasVisionParts = (
    canvas: HTMLCanvasElement,
    label: string,
    includeCrops: boolean
) => {
    const parts: Array<{type: "text"; text: string} | {type: "image_url"; image_url: {url: string}}> = [
        {type: "text", text: `${label}：下面是完整画面，最终坐标必须返回完整画面的百分比坐标。`},
        {type: "image_url", image_url: {url: canvas.toDataURL("image/png", 0.9)}},
    ];
    if (includeCrops) {
        watermarkCropRegions.forEach(region => {
            parts.push({
                type: "text",
                text: `${label} 局部放大：${region.name}，对应完整画面 x=${region.x}, y=${region.y}, width=${region.width}, height=${region.height}。如果在这张裁剪图发现水印，仍然换算成完整画面百分比坐标返回。`,
            });
            parts.push({
                type: "image_url",
                image_url: {url: cropCanvasRegion(canvas, region)},
            });
        });
    }
    return parts;
};
const parseAiJson = (text: string) => {
    let value = String(text || "").trim();
    value = value.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const starts = ["{", "["].map(char => value.indexOf(char)).filter(index => index >= 0);
    if (!starts.length) {
        throw new Error("AI视觉模型未返回 JSON");
    }
    value = value.slice(Math.min(...starts));
    return JSON.parse(value);
};
const tryVisionDetect = async (): Promise<WatermarkMask[]> => {
    const fallbackVision = visionModels.value[0];
    const fallbackAny = enabledModels.value[0];
    const fallbackValue = fallbackVision ? `${fallbackVision.providerId}|${fallbackVision.modelId}` : "";
    const fallbackAnyValue = fallbackAny ? `${fallbackAny.providerId}|${fallbackAny.modelId}` : "";
    const modelValue = enabledModels.value.some(item => `${item.providerId}|${item.modelId}` === selectedVisionModel.value)
        ? selectedVisionModel.value
        : fallbackValue || fallbackAnyValue;
    if (!modelValue) {
        throw new Error("没有可用的 AI 模型");
    }
    selectedVisionModel.value = modelValue;
    const [providerId, modelId] = modelValue.split("|");
    await window.$mapi.config.set("watermarkVisionModel", modelValue);
    const prompt = [
        "你是一个图片/视频画面水印检测器，只检测可见水印、平台标识、版权字样、半透明 logo、角标文字。",
        "不要检测普通画面物体、云朵、装饰、人物、背景纹理。",
        detectionMode.value === "text"
            ? "当前模式是文字候选检测：可以返回疑似硬字幕、文字水印、平台角标，但需要在 name 中明确写出“字幕候选”或“水印”。"
            : "当前模式是水印检测：不要把剧情字幕、口播字幕、对白字幕、画面内招牌/路牌/正文标题当作水印；用户可能需要保留这些字幕。水印通常是平台标识、账号标识、版权角标、半透明 logo，固定在边角或底部。",
        detectionMode.value === "hybrid"
            ? "如果无法确定是字幕还是水印，请只返回固定位置、低透明度、平台/版权/账号性质明显的候选，不要返回大段对白字幕。"
            : "",
        mediaType.value === "video"
            ? "当前输入是同一个视频的多张抽帧，请综合所有帧：持续出现、固定在边角或固定位置的标识优先判定为水印；只在内容画面中偶然出现的普通文字不要判定为水印。"
            : "当前输入是单张图片，请检查整张图的四角、底部、顶部和中心区域。",
        "请返回严格 JSON，不要 markdown，不要解释。",
        "格式：{\"watermarks\":[{\"name\":\"豆包AI生成水印\",\"text\":\"豆包AI生成\",\"evidence\":\"右下角可读到豆包AI生成字样\",\"x\":86.5,\"y\":91.8,\"width\":12.2,\"height\":5.1,\"confidence\":0.96}]}",
        "严格要求：name/text/evidence 必须写出你实际看见的文字、品牌、logo 或版权/@账号证据；不要返回“右上角水印区域”“左上角水印区域”这类只有位置、没有内容证据的泛称。",
        "如果某个区域只是高亮边缘、几何线条、背景纹理、装饰物、物体轮廓或颜色块，即使在角落也不要当作水印。",
        "坐标必须是百分比，x/y 是左上角，width/height 是宽高。",
        "如果我提供了局部放大裁剪图，裁剪图只是帮助你看清淡水印；最终仍必须返回完整画面的百分比坐标，不要返回裁剪图内部坐标。",
        "返回的是用于图像修复的 mask 框，不是紧贴文字笔画的 OCR 框；必须完整包含水印文字、阴影、描边、透明边缘，并额外留出 10%-25% 安全边。",
        "不要返回整条底部横条、播放器控件区域、黑边、渐变阴影或大面积画面区域；单个可见水印框通常不应超过画面宽度 35% 或高度 15%。",
        "对白字幕通常横跨底部中间且内容随时间变化，默认不是水印；除非当前模式是文字候选检测，否则不要返回这类字幕区域。",
        "右下角、左下角等贴边平台水印尤其要把整段文字全部框住，不要漏掉最后一个字或 logo。",
        mediaType.value === "video"
            ? "如果不同帧中同一水印位置略有差异，请返回能覆盖所有帧的并集框；同一底部平台水印被画面元素分隔时也要合并成一个完整框；如果片头/片尾有额外水印，也可以单独返回。"
            : "",
        "没有水印返回 {\"watermarks\":[]}。",
    ].filter(Boolean).join("\n");
    const frameParts = mediaType.value === "video"
        ? (await videoFramesToCanvases(detectionMode.value !== "watermark")).flatMap((frame, index) =>
            canvasVisionParts(frame.canvas, `视频抽帧 ${index + 1}，时间 ${frame.time.toFixed(1)} 秒`, index === 0 || index === 1)
        )
        : canvasVisionParts(await canvasFromImage(), "图片", true);
    const result = await modelStore.chat(providerId, modelId, prompt, {
        systemPrompt: null,
        contentParts: frameParts,
    });
    if (result.code) {
        throw new Error(result.msg || "AI视觉识别失败");
    }
    const parsed = parseAiJson(result.data?.content || "");
    const rawItems = Array.isArray(parsed) ? parsed : parsed?.watermarks || parsed?.masks || parsed?.boxes || [];
    const masks = rawItems
        .map((item: any, index: number) => normalizeDetectedMask(item, index, "vision"))
        .filter(Boolean) as WatermarkMask[];
    return detectionMode.value === "watermark" ? filterStrictVisionMasks(masks) : masks;
};
const tryLocalDetect = async (): Promise<WatermarkMask[]> => {
    if (!window.$mapi?.watermark?.detect) {
        throw new Error("本地水印识别模块未加载");
    }
    const data = await window.$mapi.watermark.detect({
        input: filePath.value,
    });
    const rawItems = data?.watermarks || [];
    return rawItems
        .map((item: any, index: number) => normalizeDetectedMask(item, index, "local"))
        .filter(Boolean) as WatermarkMask[];
};
const tryServiceDetect = async (): Promise<WatermarkMask[]> => {
    const url = serviceUrl.value.replace(/\/+$/, "");
    const response = await fetch(`${url}/api/watermark/detect`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            input: filePath.value,
            mediaType: mediaType.value,
        }),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const rawItems = data?.watermarks || data?.data?.watermarks || data?.masks || [];
    return rawItems
        .map((item: any, index: number) => normalizeDetectedMask(item, index, "service"))
        .filter(Boolean) as WatermarkMask[];
};
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};
const canvasFromImage = async () => {
    const img = await loadImage(processedUrl.value);
    const maxWidth = 720;
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas context not available");
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
};
const canvasFromVideo = () => {
    const video = mediaVideo.value;
    if (!video || !video.videoWidth || !video.videoHeight) {
        throw new Error("视频尚未加载到可检测帧");
    }
    const maxWidth = 720;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas context not available");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
};
const waitVideoEvent = (video: HTMLVideoElement, eventName: string, timeout = 6000) => {
    return new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            cleanup();
            reject(new Error(`等待视频${eventName}超时`));
        }, timeout);
        const cleanup = () => {
            window.clearTimeout(timer);
            video.removeEventListener(eventName, onDone);
            video.removeEventListener("error", onError);
        };
        const onDone = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("视频读取失败"));
        };
        video.addEventListener(eventName, onDone, {once: true});
        video.addEventListener("error", onError, {once: true});
    });
};
const ensureVideoReady = async () => {
    const video = mediaVideo.value;
    if (!video) {
        throw new Error("视频预览尚未初始化");
    }
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
        await waitVideoEvent(video, "loadedmetadata");
    }
    return video;
};
const videoFrameTimes = (duration: number, preferredTime?: number) => {
    if (!Number.isFinite(duration) || duration <= 0) {
        return [0];
    }
    const ratios = duration <= 6
        ? [0.05, 0.18, 0.35, 0.55, 0.75, 0.92]
        : [0.03, 0.08, 0.16, 0.28, 0.42, 0.58, 0.72, 0.86, 0.96];
    const clampTime = (value: number) => Math.min(Math.max(value, 0.08), Math.max(0.08, duration - 0.08));
    const values = [
        ...(Number.isFinite(preferredTime) ? [clampTime(preferredTime as number)] : []),
        ...ratios.map(ratio => clampTime(duration * ratio)),
    ];
    return Array.from(new Set(values.map(value => Math.round(value * 10) / 10)));
};
const formatVideoTimestamp = (seconds: number) => {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const total = Math.floor(safe);
    const ms = Math.round((safe - total) * 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const base = [h, m, s].map(item => String(item).padStart(2, "0")).join(":");
    return ms > 0 ? `${base}.${String(ms).padStart(3, "0")}` : base;
};
const medianFrameStep = (times: number[]) => {
    const gaps = times
        .slice(1)
        .map((time, index) => time - times[index])
        .filter(gap => Number.isFinite(gap) && gap > 0)
        .sort((a, b) => a - b);
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1;
};
const videoDetectionFrameTimes = (duration: number, preferredTime: number | undefined, scanMode: VideoDetectionScan) => {
    if (scanMode === "sample") {
        return videoFrameTimes(duration, preferredTime).slice(0, 6);
    }
    if (!Number.isFinite(duration) || duration <= 0) {
        return [0];
    }
    const estimatedFps =
        duration <= 12 ? 24 :
            duration <= 45 ? 12 :
                duration <= 120 ? 6 :
                    3;
    const maxFrames =
        duration <= 12 ? 360 :
            duration <= 45 ? 480 :
                duration <= 120 ? 540 :
                    720;
    const desiredStep = 1 / estimatedFps;
    const frameCount = Math.ceil(duration / desiredStep);
    const step = frameCount > maxFrames ? duration / maxFrames : desiredStep;
    const clampTime = (value: number) => Math.min(Math.max(value, 0.03), Math.max(0.03, duration - 0.03));
    const values = Number.isFinite(preferredTime) ? [clampTime(preferredTime as number)] : [];
    for (let time = 0.03; time < duration; time += step) {
        values.push(clampTime(time));
    }
    return Array.from(new Set(values.map(value => Math.round(value * 100) / 100))).sort((a, b) => a - b);
};
const seekVideo = async (video: HTMLVideoElement, time: number) => {
    const target = Math.min(Math.max(time, 0), Math.max(0, Number(video.duration || 0) - 0.05));
    if (Math.abs(video.currentTime - target) < 0.03 && video.videoWidth && video.videoHeight) {
        return;
    }
    video.currentTime = target;
    await waitVideoEvent(video, "seeked");
};
const videoFramesToDataUrls = async () => {
    const video = await ensureVideoReady();
    const originalTime = video.currentTime || 0;
    const wasPaused = video.paused;
    if (!wasPaused) {
        video.pause();
    }
    const frames: Array<{time: number; dataUrl: string}> = [];
    try {
        for (const time of videoFrameTimes(video.duration, originalTime)) {
            await seekVideo(video, time);
            const canvas = canvasFromVideo();
            frames.push({
                time,
                dataUrl: canvas.toDataURL("image/png", 0.9),
            });
        }
    } finally {
        await seekVideo(video, Math.min(originalTime, Math.max(0, Number(video.duration || 0) - 0.05))).catch(() => {});
        if (!wasPaused) {
            video.play().catch(() => {});
        }
    }
    return frames;
};
const videoFramesToCanvases = async (includeCurrentFrame = true) => {
    const video = await ensureVideoReady();
    const originalTime = video.currentTime || 0;
    const wasPaused = video.paused;
    if (!wasPaused) {
        video.pause();
    }
    const frames: Array<{time: number; canvas: HTMLCanvasElement}> = [];
    try {
        for (const time of videoFrameTimes(video.duration, includeCurrentFrame ? originalTime : undefined).slice(0, 6)) {
            await seekVideo(video, time);
            frames.push({
                time,
                canvas: canvasFromVideo(),
            });
        }
    } finally {
        await seekVideo(video, Math.min(originalTime, Math.max(0, Number(video.duration || 0) - 0.05))).catch(() => {});
        if (!wasPaused) {
            video.play().catch(() => {});
        }
    }
    return frames;
};
const unionMask = (a: WatermarkMask, b: WatermarkMask): WatermarkMask => {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.width, b.x + b.width);
    const y2 = Math.max(a.y + a.height, b.y + b.height);
    const confidence = Math.max(a.confidence || 0, b.confidence || 0);
    return {
        ...a,
        id: Math.min(a.id, b.id),
        name: a.name === b.name ? a.name : `${a.name.replace(/水印$/, "")}水印`,
        x: clampPercent(x1, 0, 100),
        y: clampPercent(y1, 0, 100),
        width: clampPercent(x2 - x1, 1, 100),
        height: clampPercent(y2 - y1, 1, 100),
        feather: Math.max(a.feather || 0, b.feather || 0, mediaType.value === "video" ? 10 : 6),
        startTime: a.startTime || b.startTime || "00:00:00",
        endTime: a.endTime || b.endTime || "",
        confidence: confidence || undefined,
        source: a.source === b.source ? a.source : a.source || b.source,
    };
};
const shouldMergeMasks = (a: WatermarkMask, b: WatermarkMask) => {
    const ax2 = a.x + a.width;
    const ay2 = a.y + a.height;
    const bx2 = b.x + b.width;
    const by2 = b.y + b.height;
    const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
    const overlap = overlapX * overlapY;
    const minArea = Math.min(a.width * a.height, b.width * b.height);
    if (minArea > 0 && overlap / minArea > 0.28) {
        return true;
    }

    const centerAy = a.y + a.height / 2;
    const centerBy = b.y + b.height / 2;
    const minHeight = Math.max(1, Math.min(a.height, b.height));
    const verticalOverlapRatio = overlapY / minHeight;
    const sameRow = verticalOverlapRatio > 0.38 || Math.abs(centerAy - centerBy) <= Math.max(3, minHeight * 1.15);
    if (!sameRow) {
        return false;
    }

    const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(ax2, bx2));
    const bothNearBottom = Math.min(a.y, b.y) > 58 || Math.max(ay2, by2) > 82;
    const bothEdgeLike = Math.min(a.x, b.x) < 14 || Math.max(ax2, bx2) > 86 || bothNearBottom;
    const maxUnionWidth = mediaType.value === "video" ? 70 : 55;
    const unionWidth = Math.max(ax2, bx2) - Math.min(a.x, b.x);
    return bothEdgeLike && unionWidth <= maxUnionWidth && gapX <= Math.max(4, minHeight * (bothNearBottom ? 2.8 : 1.8));
};
const mergeDetectedMasks = (items: WatermarkMask[]) => {
    const merged: WatermarkMask[] = [];
    items
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .forEach(item => {
            const mergeIndex = merged.findIndex(existing => shouldMergeMasks(existing, item));
            if (mergeIndex >= 0) {
                merged[mergeIndex] = unionMask(merged[mergeIndex], item);
            } else {
                merged.push(item);
            }
        });
    for (let i = 0; i < merged.length; i += 1) {
        for (let j = i + 1; j < merged.length; j += 1) {
            if (shouldMergeMasks(merged[i], merged[j])) {
                merged[i] = unionMask(merged[i], merged[j]);
                merged.splice(j, 1);
                j -= 1;
            }
        }
    }
    return merged.slice(0, 4);
};
const detectLightTextWatermarks = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): WatermarkMask[] => {
    const regions = [
        {name: "左上角浅色文字水印", x: 0, y: 0, width: 34, height: 22},
        {name: "右上角浅色文字水印", x: 66, y: 0, width: 34, height: 22},
        {name: "左下角浅色文字水印", x: 0, y: 76, width: 38, height: 24},
        {name: "右下角浅色文字水印", x: 62, y: 76, width: 38, height: 24},
        {name: "底部浅色文字水印", x: 22, y: 78, width: 56, height: 22},
    ];
    return regions
        .map((region, index) => {
            const sx = Math.round((region.x / 100) * canvas.width);
            const sy = Math.round((region.y / 100) * canvas.height);
            const sw = Math.max(8, Math.round((region.width / 100) * canvas.width));
            const sh = Math.max(8, Math.round((region.height / 100) * canvas.height));
            const imageData = ctx.getImageData(sx, sy, Math.min(sw, canvas.width - sx), Math.min(sh, canvas.height - sy));
            const data = imageData.data;
            const w = imageData.width;
            const h = imageData.height;
            const binary = new Uint8Array(w * h);
            const visited = new Uint8Array(w * h);
            for (let y = 0; y < h; y += 1) {
                for (let x = 0; x < w; x += 1) {
                    const i = (y * imageData.width + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const saturation = max === 0 ? 0 : (max - min) / max;
                    const isLightText = max > 178 && saturation < 0.32;
                    if (isLightText) {
                        binary[y * w + x] = 1;
                    }
                }
            }
            const components: Array<{minX: number; minY: number; maxX: number; maxY: number; area: number}> = [];
            const stack: number[] = [];
            for (let start = 0; start < binary.length; start += 1) {
                if (!binary[start] || visited[start]) {
                    continue;
                }
                visited[start] = 1;
                stack.push(start);
                let minX = w;
                let minY = h;
                let maxX = 0;
                let maxY = 0;
                let area = 0;
                while (stack.length > 0) {
                    const current = stack.pop() as number;
                    const x = current % w;
                    const y = Math.floor(current / w);
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    area += 1;
                    const neighbors = [current - 1, current + 1, current - w, current + w];
                    for (const next of neighbors) {
                        if (next < 0 || next >= binary.length || visited[next] || !binary[next]) {
                            continue;
                        }
                        const nx = next % w;
                        const ny = Math.floor(next / w);
                        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
                            continue;
                        }
                        visited[next] = 1;
                        stack.push(next);
                    }
                }
                const cw = maxX - minX + 1;
                const ch = maxY - minY + 1;
                const fill = area / Math.max(1, cw * ch);
                const isTextStroke =
                    area >= 3 &&
                    area <= Math.max(160, w * h * 0.025) &&
                    cw >= 2 &&
                    ch >= 3 &&
                    cw <= w * 0.42 &&
                    ch <= h * 0.42 &&
                    fill <= 0.82;
                if (isTextStroke) {
                    components.push({minX, minY, maxX, maxY, area});
                }
            }
            if (components.length < 3) {
                return null;
            }
            const sortedByArea = components.sort((a, b) => b.area - a.area);
            const useful = sortedByArea.slice(0, Math.min(sortedByArea.length, 36));
            const minX = Math.min(...useful.map(item => item.minX));
            const minY = Math.min(...useful.map(item => item.minY));
            const maxX = Math.max(...useful.map(item => item.maxX));
            const maxY = Math.max(...useful.map(item => item.maxY));
            const boxWidth = maxX - minX + 1;
            const boxHeight = maxY - minY + 1;
            const totalArea = useful.reduce((sum, item) => sum + item.area, 0);
            const density = totalArea / Math.max(1, boxWidth * boxHeight);
            const aspect = boxWidth / Math.max(1, boxHeight);
            const nearExpectedEdge =
                region.x === 0 ? minX < w * 0.5 :
                    region.x > 50 ? maxX > w * 0.5 :
                        true;
            if (
                density < 0.015 ||
                boxWidth < 18 ||
                boxHeight < 8 ||
                aspect < 1.2 ||
                aspect > 14 ||
                !nearExpectedEdge
            ) {
                return null;
            }
            const padX = Math.max(8, Math.round(boxWidth * 0.16));
            const padY = Math.max(6, Math.round(boxHeight * 0.32));
            const x = ((sx + Math.max(0, minX - padX)) / canvas.width) * 100;
            const y = ((sy + Math.max(0, minY - padY)) / canvas.height) * 100;
            const width = ((Math.min(imageData.width, maxX + padX) - Math.max(0, minX - padX)) / canvas.width) * 100;
            const height = ((Math.min(imageData.height, maxY + padY) - Math.max(0, minY - padY)) / canvas.height) * 100;
            return normalizeDetectedMask({
                name: region.name,
                x,
                y,
                width,
                height,
                confidence: Math.min(0.96, 0.58 + density * 1.5 + Math.min(0.2, components.length / 40)),
            }, index, "heuristic");
        })
        .filter(Boolean) as WatermarkMask[];
};
const detectLowContrastTextWatermarks = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): WatermarkMask[] => {
    const regions = [
        {name: "右下角低对比度水印", x: 80, y: 82, width: 20, height: 18, align: "right"},
        {name: "右下角淡字水印", x: 84, y: 86, width: 16, height: 12, align: "right"},
        {name: "左下角低对比度水印", x: 0, y: 78, width: 28, height: 20, align: "left"},
    ];
    return regions
        .map((region, index) => {
            const sx = Math.round((region.x / 100) * canvas.width);
            const sy = Math.round((region.y / 100) * canvas.height);
            const sw = Math.max(8, Math.min(canvas.width - sx, Math.round((region.width / 100) * canvas.width)));
            const sh = Math.max(8, Math.min(canvas.height - sy, Math.round((region.height / 100) * canvas.height)));
            const imageData = ctx.getImageData(sx, sy, sw, sh);
            const data = imageData.data;
            const w = imageData.width;
            const h = imageData.height;
            const gray = new Float32Array(w * h);
            const binary = new Uint8Array(w * h);
            const visited = new Uint8Array(w * h);

            for (let y = 0; y < h; y += 1) {
                for (let x = 0; x < w; x += 1) {
                    const i = (y * w + x) * 4;
                    gray[y * w + x] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                }
            }

            for (let y = 2; y < h - 2; y += 1) {
                for (let x = 2; x < w - 2; x += 1) {
                    const i = (y * w + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const saturation = max === 0 ? 0 : (max - min) / max;
                    const center = gray[y * w + x];
                    const neighborMean = (
                        gray[y * w + x - 2] +
                        gray[y * w + x + 2] +
                        gray[(y - 2) * w + x] +
                        gray[(y + 2) * w + x]
                    ) / 4;
                    const localDiff = Math.abs(center - neighborMean);
                    const rightOk = region.align === "right" ? x > w * 0.2 : x < w * 0.85;
                    const lowerOk = y > h * 0.15;
                    if (rightOk && lowerOk && max > 105 && saturation < 0.55 && localDiff > 5.5) {
                        binary[y * w + x] = 1;
                    }
                }
            }

            const components: Array<{minX: number; minY: number; maxX: number; maxY: number; area: number}> = [];
            const stack: number[] = [];
            for (let start = 0; start < binary.length; start += 1) {
                if (!binary[start] || visited[start]) {
                    continue;
                }
                visited[start] = 1;
                stack.push(start);
                let minX = w;
                let minY = h;
                let maxX = 0;
                let maxY = 0;
                let area = 0;
                while (stack.length) {
                    const current = stack.pop() as number;
                    const x = current % w;
                    const y = Math.floor(current / w);
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    area += 1;
                    for (const next of [current - 1, current + 1, current - w, current + w]) {
                        if (next < 0 || next >= binary.length || visited[next] || !binary[next]) {
                            continue;
                        }
                        const nx = next % w;
                        const ny = Math.floor(next / w);
                        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
                            continue;
                        }
                        visited[next] = 1;
                        stack.push(next);
                    }
                }
                const cw = maxX - minX + 1;
                const ch = maxY - minY + 1;
                const fill = area / Math.max(1, cw * ch);
                const textLike =
                    area >= 2 &&
                    area <= Math.max(90, w * h * 0.012) &&
                    cw >= 1 &&
                    ch >= 2 &&
                    cw <= w * 0.3 &&
                    ch <= h * 0.38 &&
                    fill <= 0.78;
                if (textLike) {
                    components.push({minX, minY, maxX, maxY, area});
                }
            }

            const useful = components.filter(item => {
                const cx = (item.minX + item.maxX) / 2;
                const cy = (item.minY + item.maxY) / 2;
                const horizontalOk = region.align === "right" ? cx > w * 0.32 : cx < w * 0.72;
                return horizontalOk && cy > h * 0.2;
            });
            if (useful.length < 3) {
                return null;
            }
            const minX = Math.min(...useful.map(item => item.minX));
            const minY = Math.min(...useful.map(item => item.minY));
            const maxX = Math.max(...useful.map(item => item.maxX));
            const maxY = Math.max(...useful.map(item => item.maxY));
            const boxWidth = maxX - minX + 1;
            const boxHeight = maxY - minY + 1;
            const totalArea = useful.reduce((sum, item) => sum + item.area, 0);
            const density = totalArea / Math.max(1, boxWidth * boxHeight);
            const aspect = boxWidth / Math.max(1, boxHeight);
            const nearEdge = region.align === "right" ? maxX > w * 0.45 : minX < w * 0.55;
            if (!nearEdge || boxWidth < 12 || boxHeight < 5 || aspect < 1.8 || aspect > 18 || density < 0.01) {
                return null;
            }

            const padX = Math.max(6, Math.round(boxWidth * 0.3));
            const padY = Math.max(4, Math.round(boxHeight * 0.55));
            const x1 = Math.max(0, minX - padX);
            const y1 = Math.max(0, minY - padY);
            const x2 = Math.min(w, maxX + padX);
            const y2 = Math.min(h, maxY + padY);
            return normalizeDetectedMask({
                name: region.name,
                x: ((sx + x1) / canvas.width) * 100,
                y: ((sy + y1) / canvas.height) * 100,
                width: ((x2 - x1) / canvas.width) * 100,
                height: ((y2 - y1) / canvas.height) * 100,
                confidence: Math.min(0.9, 0.54 + Math.min(0.22, useful.length / 35) + Math.min(0.14, density * 2)),
            }, index, "heuristic");
        })
        .filter(Boolean) as WatermarkMask[];
};
const detectFromCanvas = (canvas: HTMLCanvasElement): WatermarkMask[] => {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return [];
    }
    const lightTextMasks = detectLightTextWatermarks(ctx, canvas);
    const lowContrastMasks = mediaType.value === "video"
        ? detectLowContrastTextWatermarks(ctx, canvas)
        : [];
    const regions = [
        {name: "左上角疑似水印", x: 0, y: 0, width: 28, height: 18},
        {name: "右上角疑似水印", x: 72, y: 0, width: 28, height: 18},
        {name: "左下角疑似水印", x: 0, y: 78, width: 30, height: 22},
        {name: "右下角疑似水印", x: 70, y: 78, width: 30, height: 22},
        {name: "底部居中疑似水印", x: 28, y: 80, width: 44, height: 18},
        {name: "居中疑似水印", x: 30, y: 38, width: 40, height: 24},
    ];
    const scored = regions.map(region => {
        const sx = Math.round((region.x / 100) * canvas.width);
        const sy = Math.round((region.y / 100) * canvas.height);
        const sw = Math.max(8, Math.round((region.width / 100) * canvas.width));
        const sh = Math.max(8, Math.round((region.height / 100) * canvas.height));
        const imageData = ctx.getImageData(sx, sy, Math.min(sw, canvas.width - sx), Math.min(sh, canvas.height - sy));
        let edgeCount = 0;
        let contrastTotal = 0;
        let samples = 0;
        const data = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        for (let y = 1; y < h; y += 2) {
            for (let x = 1; x < w; x += 2) {
                const i = (y * w + x) * 4;
                const left = (y * w + x - 1) * 4;
                const up = ((y - 1) * w + x) * 4;
                const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                const grayLeft = data[left] * 0.299 + data[left + 1] * 0.587 + data[left + 2] * 0.114;
                const grayUp = data[up] * 0.299 + data[up + 1] * 0.587 + data[up + 2] * 0.114;
                const diff = Math.abs(gray - grayLeft) + Math.abs(gray - grayUp);
                if (diff > 55) {
                    edgeCount++;
                }
                contrastTotal += diff;
                samples++;
            }
        }
        const edgeDensity = samples ? edgeCount / samples : 0;
        const contrast = samples ? contrastTotal / samples / 255 : 0;
        const score = edgeDensity * 0.7 + contrast * 0.3;
        return {
            ...region,
            score,
            confidence: clampPercent(Math.min(0.95, score * 4), 0, 1),
        };
    });
    const edgeMasks = scored
        .filter(item => item.score > 0.18)
        .sort((a, b) => b.score - a.score)
        .slice(0, 1)
        .map((item, index) => normalizeDetectedMask({
            name: item.name,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            confidence: item.confidence,
        }, index, "heuristic"))
        .filter(Boolean) as WatermarkMask[];
    const textMasks = [...lightTextMasks, ...lowContrastMasks];
    return mergeDetectedMasks(textMasks.length > 0 ? textMasks : edgeMasks);
};
const strictWatermarkShape = (mask: WatermarkMask, allowUpperArea = true) => {
    const centerX = mask.x + mask.width / 2;
    const centerY = mask.y + mask.height / 2;
    const nearEdge = centerX <= 38 || centerX >= 62 || centerY <= 30 || centerY >= 68;
    const allowedArea = allowUpperArea || centerY >= 62;
    const aspect = mask.width / Math.max(1, mask.height);
    const sizeOk =
        mask.width >= 3 &&
        mask.height >= 2.5 &&
        mask.width <= 38 &&
        mask.height <= 15 &&
        mask.width * mask.height <= 360;
    return allowedArea && nearEdge && sizeOk && aspect >= 1.1 && aspect <= 18 && (mask.confidence || 0) >= 0.56;
};
const strictMaskName = (name: string) => {
    const cleaned = name
        .replace(/^逐帧/, "")
        .replace(/候选/g, "")
        .replace(/疑似/g, "")
        .replace(/浅色文字水印|低对比度水印|淡字水印/g, "水印区域")
        .replace(/\s+/g, "")
        .trim();
    return cleaned || "水印区域";
};
const detectStrictFromCanvas = (canvas: HTMLCanvasElement): WatermarkMask[] => {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return [];
    }
    const textMasks = [
        ...detectLightTextWatermarks(ctx, canvas),
        ...detectLowContrastTextWatermarks(ctx, canvas),
    ];
    return mergeDetectedMasks(textMasks)
        .filter(mask => strictWatermarkShape(mask, false))
        .map((mask, index) => ({
            ...mask,
            id: Date.now() + index,
            name: strictMaskName(mask.name),
            source: "local",
        }));
};
type TimedWatermarkMask = WatermarkMask & {frameTime: number};
const stripFrameTime = (mask: TimedWatermarkMask): WatermarkMask => {
    const {frameTime, ...rest} = mask;
    return rest;
};
const splitTimedTrack = (items: TimedWatermarkMask[], frameStep: number) => {
    const sorted = [...items].sort((a, b) => a.frameTime - b.frameTime);
    const segments: TimedWatermarkMask[][] = [];
    let current: TimedWatermarkMask[] = [];
    let currentMask: WatermarkMask | null = null;
    let lastTime = -Infinity;
    sorted.forEach(item => {
        const base = stripFrameTime(item);
        const nextMask = currentMask ? unionMask(currentMask, base) : base;
        const gapTooLarge = current.length > 0 && item.frameTime - lastTime > frameStep * 2.5 + 0.05;
        const currentCenter = currentMask ? maskCenter(currentMask) : null;
        const itemCenter = maskCenter(base);
        const movementTooLarge = currentCenter
            ? Math.abs(itemCenter.x - currentCenter.x) > Math.max(8, (currentMask?.width || 1) * 0.9) ||
                Math.abs(itemCenter.y - currentCenter.y) > Math.max(5, (currentMask?.height || 1) * 1.2)
            : false;
        const unionTooLarge = currentMask ? isOverbroadVideoMask(nextMask) : false;
        if (current.length > 0 && (gapTooLarge || movementTooLarge || unionTooLarge)) {
            segments.push(current);
            current = [];
            currentMask = null;
        }
        current.push(item);
        currentMask = currentMask ? unionMask(currentMask, base) : base;
        lastTime = item.frameTime;
    });
    if (current.length > 0) {
        segments.push(current);
    }
    return segments;
};
const buildVideoMaskTracks = (items: TimedWatermarkMask[], times: number[], duration: number, strict = false) => {
    const totalFrames = Math.max(1, times.length);
    const frameStep = medianFrameStep(times);
    const minTrackSupport = strict
        ? totalFrames <= 12 ? 3 : Math.max(4, Math.ceil(totalFrames * 0.035))
        : totalFrames <= 12 ? 2 : Math.max(3, Math.ceil(totalFrames * 0.025));
    const groups: Array<{items: TimedWatermarkMask[]; mask: WatermarkMask}> = [];
    items
        .filter(mask => mask.width > 0 && mask.height > 0)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .forEach(mask => {
            const base = stripFrameTime(mask);
            const group = groups.find(item => item.items.some(existing => sameWatermarkTrack(existing, base)));
            if (group) {
                group.items.push(mask);
                group.mask = unionMask(group.mask, base);
            } else {
                groups.push({items: [mask], mask: base});
            }
        });

    const tracked: WatermarkMask[] = [];
    groups.forEach((group, groupIndex) => {
        const support = group.items.length;
        const bestConfidence = Math.max(...group.items.map(item => item.confidence || 0));
        const lowContrastEvidence = group.items.some(item => /低对比度|淡字|浅色文字/.test(item.name));
        if (strict) {
            if (support < minTrackSupport && !(support >= 3 && bestConfidence >= 0.84)) {
                return;
            }
        } else if (support < minTrackSupport && bestConfidence < 0.72 && !lowContrastEvidence) {
            return;
        }
        splitTimedTrack(group.items, frameStep).forEach((segment, segmentIndex) => {
            const segmentSupport = segment.length;
            const segmentBestConfidence = Math.max(...segment.map(item => item.confidence || 0));
            const minSegmentSupport = strict ? Math.max(3, Math.ceil(totalFrames * 0.018)) : Math.min(2, minTrackSupport);
            if (segmentSupport < minSegmentSupport && segmentBestConfidence < (strict ? 0.86 : 0.78)) {
                return;
            }
            const segmentMask = segment
                .map(stripFrameTime)
                .reduce((merged, item) => unionMask(merged, item));
            const start = Math.max(0, segment[0].frameTime - frameStep * 0.6);
            const end = Math.min(duration, segment[segment.length - 1].frameTime + frameStep * 0.6);
            const supportBoost = Math.min(0.2, segmentSupport / Math.max(6, totalFrames) * 0.65);
            const compacted = isOverbroadVideoMask(segmentMask)
                ? compactOverbroadVideoMask(segmentMask, tracked.length)
                : segmentMask;
            tracked.push({
                ...compacted,
                id: Date.now() + groupIndex * 100 + segmentIndex,
                name: strict ? strictMaskName(compacted.name) : compacted.name.includes("逐帧") ? compacted.name : `逐帧${compacted.name}`,
                confidence: Math.min(0.98, segmentBestConfidence + supportBoost),
                startTime: formatVideoTimestamp(start),
                endTime: end >= duration - frameStep * 1.2 ? "" : formatVideoTimestamp(end),
                source: strict ? "local" : "heuristic",
            });
        });
    });

    return tracked
        .filter(mask => mask.width <= 45 && mask.height <= 16 && mask.width * mask.height <= 420)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, strict ? 3 : 8);
};
const detectFromVideoFrames = async (scanMode: VideoDetectionScan = "sample") => {
    const video = await ensureVideoReady();
    const originalTime = video.currentTime || 0;
    const wasPaused = video.paused;
    if (!wasPaused) {
        video.pause();
    }
    const times = videoDetectionFrameTimes(video.duration, originalTime, scanMode);
    const detected: TimedWatermarkMask[] = [];
    try {
        for (let index = 0; index < times.length; index += 1) {
            const time = times[index];
            if (scanMode === "frame") {
                detectionMessage.value = `正在逐帧识别水印 ${index + 1}/${times.length}...`;
            }
            await seekVideo(video, time);
            const frameMasks = detectFromCanvas(canvasFromVideo()).map(mask => ({
                ...mask,
                confidence: Math.min(0.96, (mask.confidence || 0.55) + 0.02),
                startTime: mask.startTime || "00:00:00",
                endTime: mask.endTime || "",
                frameTime: time,
            }));
            detected.push(...frameMasks);
        }
    } finally {
        await seekVideo(video, Math.min(originalTime, Math.max(0, Number(video.duration || 0) - 0.05))).catch(() => {});
        if (!wasPaused) {
            video.play().catch(() => {});
        }
    }
    return scanMode === "frame"
        ? buildVideoMaskTracks(detected, times, Number(video.duration || 0))
        : stabilizeVideoMasks(detected.map(stripFrameTime));
};
const detectStableWatermarksFromVideoFrames = async () => {
    const video = await ensureVideoReady();
    const originalTime = video.currentTime || 0;
    const wasPaused = video.paused;
    if (!wasPaused) {
        video.pause();
    }
    const times = videoDetectionFrameTimes(video.duration, undefined, "frame");
    const detected: TimedWatermarkMask[] = [];
    try {
        for (let index = 0; index < times.length; index += 1) {
            const time = times[index];
            detectionMessage.value = `正在逐帧稳定检测水印 ${index + 1}/${times.length}...`;
            await seekVideo(video, time);
            const frameMasks = detectStrictFromCanvas(canvasFromVideo()).map(mask => ({
                ...mask,
                confidence: Math.min(0.96, (mask.confidence || 0.58) + 0.02),
                frameTime: time,
            }));
            detected.push(...frameMasks);
        }
    } finally {
        await seekVideo(video, Math.min(originalTime, Math.max(0, Number(video.duration || 0) - 0.05))).catch(() => {});
        if (!wasPaused) {
            video.play().catch(() => {});
        }
    }
    return buildVideoMaskTracks(detected, times, Number(video.duration || 0), true);
};
const detectWatermark = async () => {
    if (!filePath.value) {
        Dialog.tipError("请先选择需要检查的图片或视频素材");
        return;
    }
    if (mediaType.value === "unknown") {
        Dialog.tipError("暂不支持该文件格式");
        return;
    }
    detecting.value = true;
    detectionMessage.value = "正在智能检测水印...";
    try {
        let detected: WatermarkMask[] = [];
        let ranStableStrictDetection = false;
        const strictWatermarkMode = detectionMode.value === "watermark";
        try {
            detected = await tryVisionDetect();
            detectionSource.value = "vision";
        } catch (e) {
            if (strictWatermarkMode) {
                try {
                    detected = await tryServiceDetect();
                    detectionSource.value = "service";
                } catch (e) {
                    detected = [];
                    detectionSource.value = "none";
                }
            } else {
                try {
                    detected = await tryLocalDetect();
                    detectionSource.value = "local";
                } catch (e) {
                    try {
                        detected = await tryServiceDetect();
                        detectionSource.value = "service";
                    } catch (e) {
                        detected = mediaType.value === "image"
                            ? detectFromCanvas(await canvasFromImage())
                            : await detectFromVideoFrames(videoDetectionScan.value);
                        detectionSource.value = "heuristic";
                    }
                }
            }
        }
        if (mediaType.value === "video") {
            if (strictWatermarkMode) {
                detected = detectionSource.value === "vision" && detected.length > 0
                    ? sanitizeVideoMasks(detected)
                    : stabilizeVideoMasks(detected);
                if (videoDetectionScan.value === "frame") {
                    ranStableStrictDetection = true;
                    const stableDetected = await detectStableWatermarksFromVideoFrames().catch(() => []);
                    if (stableDetected.length > 0) {
                        const missingStableMasks = stableDetected.filter(mask => !detected.some(item => shouldMergeMasks(item, mask)));
                        detected = [...detected, ...missingStableMasks].slice(0, 3);
                        if (detectionSource.value !== "vision") {
                            detectionSource.value = "local";
                        }
                    }
                }
            } else {
                const frameScan = videoDetectionScan.value === "frame";
                const shouldMergeLocalCandidates = frameScan || detectionSource.value !== "vision" || detected.length === 0;
                const heuristicDetected = shouldMergeLocalCandidates
                    ? detectionSource.value === "heuristic"
                        ? detected
                        : await detectFromVideoFrames(videoDetectionScan.value).catch(() => [])
                    : [];
                if (frameScan) {
                    const baseMasks = detectionSource.value === "vision" && detected.length > 0
                        ? sanitizeVideoMasks(detected)
                        : detectionSource.value === "heuristic"
                            ? []
                            : stabilizeVideoMasks(detected);
                    const missingVisionMasks = baseMasks.filter(mask => !heuristicDetected.some(item => shouldMergeMasks(item, mask)));
                    detected = [...heuristicDetected, ...missingVisionMasks].slice(0, 8);
                    if (heuristicDetected.length > 0) {
                        detectionSource.value = "heuristic";
                    }
                } else {
                    detected = stabilizeVideoMasks([...detected, ...heuristicDetected]);
                }
            }
        }
        if (strictWatermarkMode && detected.length === 0) {
            const stableDetected = mediaType.value === "image"
                ? detectStrictFromCanvas(await canvasFromImage())
                : !ranStableStrictDetection && videoDetectionScan.value === "frame"
                    ? await detectStableWatermarksFromVideoFrames().catch(() => [])
                    : [];
            if (stableDetected.length > 0) {
                detected = stableDetected;
                detectionSource.value = "local";
            }
        }
        setMasks(detected);
        if (detected.length > 0) {
            detectionMessage.value = strictWatermarkMode
                ? `检测到 ${detected.length} 个水印区域`
                : detectionMode.value === "text"
                    ? `检测到 ${detected.length} 个文字/水印候选区域`
                    : `检测到 ${detected.length} 个水印增强候选区域`;
            Dialog.tipSuccess(detectionMessage.value);
        } else {
            detectionMessage.value = "未检测到明显可见水印";
            Dialog.tipSuccess(detectionMessage.value);
        }
    } catch (e) {
        detectionMessage.value = `检测失败：${(e as Error).message || e}`;
        Dialog.tipError(detectionMessage.value);
    } finally {
        detecting.value = false;
    }
};
const repairByService = async () => {
    const url = serviceUrl.value.replace(/\/+$/, "");
    if (mediaType.value === "video" && engine.value === "propainter" && window.$mapi?.watermark?.startRepairService) {
        Dialog.tipSuccess("正在检查并启动 ProPainter 修复服务...");
        const status = await window.$mapi.watermark.startRepairService({url});
        if (!status?.running) {
            throw new Error(`ProPainter 服务未启动：${status?.message || "请检查服务环境"}`);
        }
        const serviceData = status.data?.data || status.data || {};
        if (serviceData.serviceVersion !== requiredRepairServiceVersion) {
            throw new Error("检测到 7860 端口仍是旧版修复服务，请完全退出当前应用后重新打开，再执行 ProPainter 修复");
        }
    }
    const response = await fetch(`${url}/api/watermark/repair`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload.value),
    });
    if (!response.ok) {
        throw new Error(`修复服务 HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data?.code && data.code !== 0) {
        throw new Error(data?.msg || "修复服务执行失败");
    }
    const output =
        data?.output ||
        data?.file ||
        data?.path ||
        data?.data?.output ||
        data?.data?.file ||
        data?.data?.path ||
        data?.result?.output ||
        data?.result?.file ||
        data?.result?.path;
    if (!output) {
        throw new Error("修复服务未返回 output/file/path");
    }
    outputPath.value = output;
};
const refreshRepairLog = async () => {
    const url = serviceUrl.value.replace(/\/+$/, "");
    try {
        const response = await fetch(`${url}/api/watermark/log`, {method: "GET"});
        if (!response.ok) {
            return;
        }
        const data = await response.json().catch(() => ({}));
        repairLog.value = data?.data?.log || data?.log || "";
        repairLogPath.value = data?.data?.path || data?.path || "";
    } catch {
        repairLog.value = "";
        repairLogPath.value = "";
    }
};
const repairMaterial = async () => {
    if (!filePath.value) {
        Dialog.tipError("请先选择需要处理的图片或视频素材");
        return;
    }
    if (mediaType.value === "unknown") {
        Dialog.tipError("暂不支持该文件格式");
        return;
    }
    if (masks.length === 0) {
        Dialog.tipError("请先智能检测出水印区域");
        return;
    }
    repairing.value = true;
    repairLog.value = "";
    repairLogPath.value = "";
    try {
        if (mediaType.value === "image" && window.$mapi?.watermark?.repairImage) {
            const result = await window.$mapi.watermark.repairImage({
                input: filePath.value,
                masks: masks.map(mask => ({
                    name: mask.name,
                    confidence: mask.confidence || 0.6,
                    source: "local",
                    x: mask.x,
                    y: mask.y,
                    width: mask.width,
                    height: mask.height,
                    feather: mask.feather,
                    padding: maskPadding.value,
                })),
            });
            outputPath.value = result.output;
            Dialog.tipSuccess("本地修复完成");
            return;
        }
        if (mediaType.value === "video" && ["ffmpeg-delogo", "vsr-sttn"].includes(engine.value) && window.$mapi?.watermark?.repairVideo) {
            const result = await window.$mapi.watermark.repairVideo({
                input: filePath.value,
                engine: engine.value as "ffmpeg-delogo" | "vsr-sttn",
                outputName: normalizedOutputName.value,
                keepAudio: keepAudio.value,
                masks: masks.map(mask => ({
                    name: mask.name,
                    confidence: mask.confidence || 0.6,
                    source: "local",
                    x: mask.x,
                    y: mask.y,
                    width: mask.width,
                    height: mask.height,
                    feather: mask.feather,
                    padding: maskPadding.value,
                })),
            });
            outputPath.value = result.output;
            Dialog.tipSuccess(engine.value === "vsr-sttn" ? "VSR/STTN 视频修复完成" : "本地视频修复完成");
            return;
        }
        await repairByService();
        Dialog.tipSuccess(mediaType.value === "video" ? "已提交视频修复并收到结果" : "修复完成");
    } catch (e) {
        const prefix = mediaType.value === "video"
            ? "本地视频修复失败：请检查水印区域是否超出画面，或改用 ProPainter/ComfyUI 服务"
            : "修复失败";
        if (mediaType.value === "video" && ["propainter", "comfyui"].includes(engine.value)) {
            await refreshRepairLog();
        }
        Dialog.tipError(`${prefix}；${(e as Error).message || e}`);
    } finally {
        repairing.value = false;
    }
};
const copyPayload = async () => {
    if (!filePath.value) {
        Dialog.tipError("请先选择需要处理的图片或视频素材");
        return;
    }
    await doCopy(payload.value, "已复制智能修复任务参数");
};
const copyCliPlan = async () => {
    if (!filePath.value) {
        Dialog.tipError("请先选择需要处理的图片或视频素材");
        return;
    }
    const json = JSON.stringify(payload.value, null, 2);
    await doCopy(json, "已复制任务配置，可交给本地修复服务执行");
};
const saveOutputFile = async () => {
    if (!outputPath.value || /^(https?:\/\/|file:\/\/)/i.test(outputPath.value)) {
        Dialog.tipError("当前结果不是可直接保存的本地文件");
        return;
    }
    await doSaveFile(outputPath.value);
};
const openOutputFile = async () => {
    if (!outputPath.value || /^(https?:\/\/)/i.test(outputPath.value)) {
        Dialog.tipError("当前结果不是本地文件");
        return;
    }
    await window.$mapi.app.openPath(outputPath.value.replace(/^file:\/\//i, ""));
};
const revealOutputFile = async () => {
    if (!outputPath.value || /^(https?:\/\/)/i.test(outputPath.value)) {
        Dialog.tipError("当前结果不是本地文件");
        return;
    }
    await window.$mapi.app.showItemInFolder(outputPath.value.replace(/^file:\/\//i, ""));
};
</script>

<template>
    <div class="p-5 watermark-inpaint">
        <div class="app-header mb-4 flex items-center">
            <div class="flex-grow">
                <div class="text-3xl font-bold">水印智能修复</div>
                <div class="text-gray-400 mt-1">检测并标记图片/视频水印区域，使用 LaMa、SDXL Inpaint 或 ProPainter 做内容感知修复</div>
            </div>
        </div>

        <a-alert type="warning" class="mb-4">
            仅用于处理本人拥有权利或已获授权的素材。预览水印、版权样片、第三方受保护内容不应被移除权利标识。
        </a-alert>

        <div class="watermark-layout">
            <div class="min-w-0">
                <div class="panel">
                    <div class="panel-title">素材与预览</div>
                    <div class="media-toolbar">
                        <div class="file-picker-row">
                            <a-button class="file-picker-button" @click="selectMediaFile">
                                <icon-file/>
                                {{ filePath ? "重新选择" : "选择素材" }}
                            </a-button>
                            <a-tooltip :content="filePath || `支持 ${supportedExts.join(', ')}`" mini>
                                <div class="file-name-field">
                                    <span v-if="filePath">{{ previewTitle }}</span>
                                    <span v-else>支持 jpg, jpeg, png, webp, mp4, mov, mkv, webm</span>
                                </div>
                            </a-tooltip>
                        </div>
                        <div
                            class="detect-toolbar"
                            :class="{ 'video-detect-toolbar': mediaType === 'video' }"
                        >
                            <a-select v-model="detectionMode" class="detection-mode-select">
                                <a-option value="watermark">仅水印，保留字幕</a-option>
                                <a-option value="hybrid">水印增强候选</a-option>
                                <a-option value="text">文字/字幕候选</a-option>
                            </a-select>
                            <a-select
                                v-if="mediaType === 'video'"
                                v-model="videoDetectionScan"
                                class="detection-scan-select"
                            >
                                <a-option value="frame">逐帧稳定检测</a-option>
                                <a-option value="sample">快速抽帧检测</a-option>
                            </a-select>
                            <a-select
                                v-model="selectedVisionModel"
                                class="vision-model-select"
                                placeholder="AI视觉模型"
                                allow-search
                            >
                                <a-option
                                    v-for="item in enabledModels"
                                    :key="`${item.providerId}|${item.modelId}`"
                                    :value="`${item.providerId}|${item.modelId}`"
                                >
                                    {{ item.providerTitle }} / {{ item.modelName }}
                                    <span v-if="item.supportsVision" class="text-green-500"> · 视觉</span>
                                </a-option>
                            </a-select>
                            <a-button type="primary" :loading="detecting" class="detect-button" @click="detectWatermark">
                                <icon-search/>
                                智能检测水印
                            </a-button>
                        </div>
                    </div>
                    <a-alert
                        v-if="filePath"
                        :type="masks.length > 0 ? 'success' : 'info'"
                        class="mb-3"
                    >
                        {{ detectionMessage }}
                        <span v-if="detectionSource === 'vision'">，结果来自 AI 视觉模型</span>
                        <span v-if="detectionSource === 'local'">，结果来自应用内置识别</span>
                        <span v-if="detectionSource === 'service'">，结果来自本地识别服务</span>
                        <span v-else-if="detectionSource === 'heuristic'">，结果来自前端候选检测</span>
                        <span v-if="detectionMode === 'watermark'">，已尽量排除对白字幕</span>
                        <span v-if="detectionMode === 'text'">，请删除需要保留的字幕候选后再修复</span>
                    </a-alert>
                    <div class="preview-box">
                        <div v-if="!filePath" class="empty-preview">
                            <icon-file/>
                            <div class="mt-2">选择图片或视频后在这里预览</div>
                        </div>
                        <div v-else>
                            <div class="text-sm text-gray-500 mb-2">{{ previewTitle }}</div>
                            <div v-if="mediaType === 'video'" class="video-edit-hint">点击画面播放/暂停；拖动蓝框调整水印区域</div>
                            <div
                                v-if="mediaType === 'image'"
                                class="media-stage"
                            >
                                <div class="media-frame">
                                    <img :src="processedUrl" class="media-content"/>
                                    <div
                                        v-for="mask in masks"
                                        :key="`image-${mask.id}`"
                                        class="mask-overlay"
                                        :class="activeMaskClass(mask)"
                                        :style="{
                                            left: `${mask.x}%`,
                                            top: `${mask.y}%`,
                                            width: `${mask.width}%`,
                                            height: `${mask.height}%`,
                                        }"
                                        @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'move')"
                                    >
                                        <span>{{ mask.name }}</span>
                                        <i class="resize-handle nw" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'nw')"/>
                                        <i class="resize-handle ne" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'ne')"/>
                                        <i class="resize-handle sw" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'sw')"/>
                                        <i class="resize-handle se" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'se')"/>
                                    </div>
                                </div>
                            </div>
                            <div
                                v-else-if="mediaType === 'video'"
                                class="media-stage"
                            >
                                <div class="media-frame">
                                    <video
                                        ref="mediaVideo"
                                        :src="processedUrl"
                                        class="media-content"
                                        preload="metadata"
                                        muted
                                        loop
                                        playsinline
                                        @click="mediaVideo?.paused ? mediaVideo?.play() : mediaVideo?.pause()"
                                    />
                                    <div
                                        v-for="mask in masks"
                                        :key="`video-${mask.id}`"
                                        class="mask-overlay"
                                        :class="activeMaskClass(mask)"
                                        :style="{
                                            left: `${mask.x}%`,
                                            top: `${mask.y}%`,
                                            width: `${mask.width}%`,
                                            height: `${mask.height}%`,
                                        }"
                                        @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'move')"
                                    >
                                        <span>{{ mask.name }}</span>
                                        <i class="resize-handle nw" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'nw')"/>
                                        <i class="resize-handle ne" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'ne')"/>
                                        <i class="resize-handle sw" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'sw')"/>
                                        <i class="resize-handle se" @pointerdown.stop.prevent="beginMaskEdit($event, mask, 'se')"/>
                                    </div>
                                </div>
                            </div>
                            <a-alert v-else type="error">暂不支持该文件格式</a-alert>
                        </div>
                    </div>
                    <div class="mt-4 flex flex-wrap gap-2">
                        <a-button type="primary" :loading="repairing" :disabled="mediaType === 'unknown' || masks.length === 0" @click="repairMaterial">
                            <icon-tool/>
                            {{ repairButtonText }}
                        </a-button>
                        <a-button @click="applyPreset('top-left')">左上角</a-button>
                        <a-button @click="applyPreset('top-right')">右上角</a-button>
                        <a-button @click="applyPreset('bottom-left')">左下角</a-button>
                        <a-button @click="applyPreset('bottom-right')">右下角</a-button>
                        <a-button @click="applyPreset('center')">居中水印</a-button>
                    </div>
                    <div v-if="repairLog" class="repair-log mt-4">
                        <div class="repair-log-title">
                            <span>ProPainter 日志</span>
                            <span v-if="repairLogPath" class="repair-log-path">{{ repairLogPath }}</span>
                        </div>
                        <pre>{{ repairLog }}</pre>
                    </div>
                    <div v-if="outputPath" class="mt-4">
                        <div class="result-header">
                            <div class="text-sm text-gray-500 min-w-0 truncate">修复结果：{{ outputPath }}</div>
                            <div class="result-actions">
                                <a-button size="small" @click="saveOutputFile">
                                    <icon-download/>
                                    下载
                                </a-button>
                                <a-button size="small" @click="openOutputFile">
                                    打开
                                </a-button>
                                <a-button size="small" @click="revealOutputFile">
                                    定位
                                </a-button>
                            </div>
                        </div>
                        <div class="media-stage">
                            <div class="media-frame">
                                <video v-if="mediaType === 'video'" :src="outputPreviewUrl" class="media-content" controls/>
                                <img v-else :src="outputPreviewUrl" class="media-content"/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="min-w-0">
                <div class="panel mb-4">
                    <div class="panel-title">修复引擎</div>
                    <a-form layout="vertical">
                        <a-form-item label="处理引擎">
                            <a-select v-model="engine">
                                <a-option
                                    v-for="item in engineOptions"
                                    :key="item.value"
                                    :value="item.value"
                                >
                                    {{ item.label }}
                                </a-option>
                            </a-select>
                            <div v-if="mediaType === 'video' && engine === 'ffmpeg-delogo'" class="engine-hint">
                                本地快速修复适合固定不动的小角标/小水印，速度快但本质是邻域插值，复杂背景可能会有模糊或块状痕迹。
                            </div>
                            <div v-if="mediaType === 'video' && engine === 'vsr-sttn'" class="engine-hint">
                                VSR/STTN 主要适合硬字幕、横向文字水印；普通角标、半透明 logo 或复杂背景水印经常会残留，建议优先使用 ProPainter。
                            </div>
                            <div v-if="mediaType === 'video' && engine === 'propainter'" class="engine-hint">
                                ProPainter 更适合普通视频水印、半透明角标和复杂背景；会自动启动本机 7860 修复服务，首次启动需要等待模型环境初始化。
                            </div>
                            <div v-if="mediaType === 'video' && engine === 'comfyui'" class="engine-hint">
                                ComfyUI 模式需要外部修复工作流服务提供兼容接口。
                            </div>
                        </a-form-item>
                        <a-form-item label="本地/远程修复服务地址">
                            <a-input v-model="serviceUrl" placeholder="http://127.0.0.1:7860"/>
                        </a-form-item>
                        <a-form-item label="输出文件名">
                            <a-input v-model="outputName" :placeholder="normalizedOutputName || '自动生成输出文件名'"/>
                        </a-form-item>
                        <a-form-item label="修复强度">
                            <a-slider v-model="strength" :min="0.2" :max="1" :step="0.01"/>
                        </a-form-item>
                        <a-form-item label="水印边缘扩张">
                            <a-input-number v-model="maskPadding" :min="0" :max="64" mode="button"/>
                        </a-form-item>
                        <a-form-item v-if="mediaType === 'video'">
                            <a-checkbox v-model="keepAudio">保留原视频音频</a-checkbox>
                        </a-form-item>
                    </a-form>
                </div>

                <div class="panel">
                    <div class="flex items-center mb-3">
                        <div class="panel-title mb-0 flex-grow">检测结果与水印区域</div>
                        <a-button type="primary" @click="addMask">
                            <icon-plus/>
                            新增区域
                        </a-button>
                    </div>
                    <div v-for="mask in masks" :key="mask.id" class="mask-item">
                        <div class="flex items-center mb-2">
                            <a-input v-model="mask.name" class="flex-grow"/>
                            <a-tag v-if="mask.confidence !== undefined" class="ml-2" color="green">
                                {{ Math.round(mask.confidence * 100) }}%
                            </a-tag>
                            <a-button class="ml-2" status="danger" @click="removeMask(mask.id)">
                                <icon-delete/>
                            </a-button>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <a-input-number v-model="mask.x" :min="0" :max="100" mode="button">
                                <template #prefix>X%</template>
                            </a-input-number>
                            <a-input-number v-model="mask.y" :min="0" :max="100" mode="button">
                                <template #prefix>Y%</template>
                            </a-input-number>
                            <a-input-number v-model="mask.width" :min="1" :max="100" mode="button">
                                <template #prefix>宽%</template>
                            </a-input-number>
                            <a-input-number v-model="mask.height" :min="1" :max="100" mode="button">
                                <template #prefix>高%</template>
                            </a-input-number>
                        </div>
                        <div class="mt-2">
                            <a-input-number v-model="mask.feather" :min="0" :max="32" mode="button">
                                <template #prefix>羽化</template>
                            </a-input-number>
                        </div>
                        <div v-if="mediaType === 'video'" class="grid grid-cols-2 gap-2 mt-2">
                            <a-input v-model="mask.startTime" placeholder="开始 00:00:00"/>
                            <a-input v-model="mask.endTime" placeholder="结束，留空为自动"/>
                        </div>
                    </div>
                    <a-empty v-if="masks.length === 0" description="暂无水印区域，请先点击智能检测水印"/>
                    <div class="flex gap-2 mt-4">
                        <a-button type="primary" @click="copyPayload">
                            <icon-copy/>
                            复制任务参数
                        </a-button>
                        <a-button @click="copyCliPlan">
                            <icon-code/>
                            复制 JSON
                        </a-button>
                    </div>
                </div>
            </div>
        </div>

        <div class="panel mt-4">
            <div class="panel-title">推荐处理链路</div>
            <div class="grid grid-cols-4 gap-3 text-sm">
                <div class="flow-step">1. 选择素材</div>
                <div class="flow-step">2. 智能检测水印</div>
                <div class="flow-step">3. 微调 mask 并修复</div>
                <div class="flow-step">4. 预览并导出成品</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.watermark-inpaint .panel {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    background: #fff;
}

.watermark-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.95fr);
    gap: 1rem;
    align-items: start;
}

.media-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
}

.file-picker-row {
    min-width: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
}

.file-picker-button {
    white-space: nowrap;
}

.file-name-field {
    min-width: 0;
    height: 32px;
    display: flex;
    align-items: center;
    border-radius: 6px;
    padding: 0 0.75rem;
    background: #f3f4f6;
    color: #4b5563;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.file-name-field span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.detect-toolbar {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(150px, 0.55fr) minmax(220px, 1fr) max-content;
    gap: 0.5rem;
    align-items: center;
}

.video-detect-toolbar {
    grid-template-columns: minmax(150px, 0.55fr) minmax(120px, 0.42fr) minmax(220px, 1fr) max-content;
}

.detection-mode-select,
.detection-scan-select,
.vision-model-select {
    width: 100%;
    min-width: 0;
}

.detect-button {
    white-space: nowrap;
}

.result-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 0.5rem;
}

.result-actions {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.5rem;
}

.engine-hint {
    margin-top: 0.5rem;
    color: #6b7280;
    font-size: 12px;
    line-height: 1.5;
}

.video-edit-hint {
    margin-top: -0.25rem;
    margin-bottom: 0.5rem;
    color: #6b7280;
    font-size: 12px;
}

.panel-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
}

.preview-box {
    min-height: 420px;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    padding: 1rem;
    background: #f9fafb;
}

.empty-preview {
    height: 360px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: #9ca3af;
}

.media-stage {
    position: relative;
    width: 100%;
    height: 360px;
    border-radius: 8px;
    overflow: hidden;
    background: #111827;
    display: flex;
    align-items: center;
    justify-content: center;
}

.media-frame {
    position: relative;
    max-width: 100%;
    max-height: 360px;
    line-height: 0;
}

.media-content {
    max-width: 100%;
    max-height: 360px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
}

.mask-overlay {
    position: absolute;
    border: 2px solid #22c55e;
    background: rgba(34, 197, 94, 0.18);
    box-shadow: 0 0 0 9999px rgba(17, 24, 39, 0.08);
    cursor: move;
    pointer-events: auto;
    touch-action: none;
    user-select: none;
}

.mask-overlay.active {
    border-color: #2563eb;
    background: rgba(37, 99, 235, 0.16);
}

.mask-overlay span {
    position: absolute;
    left: 0;
    top: 0;
    transform: translateY(-100%);
    background: #16a34a;
    color: #fff;
    font-size: 12px;
    line-height: 20px;
    padding: 0 6px;
    border-radius: 4px 4px 0 0;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mask-overlay.active span {
    background: #2563eb;
}

.resize-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 2px solid #fff;
    border-radius: 999px;
    background: #2563eb;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
}

.resize-handle.nw {
    left: -6px;
    top: -6px;
    cursor: nwse-resize;
}

.resize-handle.ne {
    right: -6px;
    top: -6px;
    cursor: nesw-resize;
}

.resize-handle.sw {
    left: -6px;
    bottom: -6px;
    cursor: nesw-resize;
}

.resize-handle.se {
    right: -6px;
    bottom: -6px;
    cursor: nwse-resize;
}

.mask-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
}

.repair-log {
    border: 1px solid #fed7aa;
    border-radius: 8px;
    background: #fff7ed;
    padding: 0.75rem;
}

.repair-log-title {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    color: #9a3412;
    font-size: 13px;
    font-weight: 600;
}

.repair-log-path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #c2410c;
    font-weight: 400;
}

.repair-log pre {
    margin-top: 0.5rem;
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: #7c2d12;
    font-size: 12px;
    line-height: 1.45;
}

.flow-step {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem;
    background: #f9fafb;
    text-align: center;
}

@media (max-width: 1180px) {
    .watermark-layout {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 760px) {
    .detect-toolbar {
        grid-template-columns: minmax(0, 1fr);
    }

    .detect-button {
        width: 100%;
    }
}
</style>
