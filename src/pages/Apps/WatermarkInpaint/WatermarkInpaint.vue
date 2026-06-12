<script setup lang="ts">
import {computed, reactive, ref, watch} from "vue";
import FileSelector from "../../../components/common/FileSelector.vue";
import {doCopy} from "../../../components/common/util";
import {Dialog} from "../../../lib/dialog";
import {FileUtil} from "../../../lib/file";

type MediaType = "image" | "video" | "unknown";
type RepairEngine = "lama" | "sdxl-inpaint" | "propainter" | "comfyui";

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
    confidence?: number;
    source?: "service" | "heuristic" | "manual";
}

const filePath = ref("");
const mediaVideo = ref<HTMLVideoElement | null>(null);
const engine = ref<RepairEngine>("lama");
const serviceUrl = ref("http://127.0.0.1:7860");
const outputName = ref("");
const strength = ref(0.78);
const maskPadding = ref(8);
const keepAudio = ref(true);
const detecting = ref(false);
const detectionMessage = ref("尚未检测");
const detectionSource = ref<"none" | "service" | "heuristic">("none");
const masks = reactive<WatermarkMask[]>([]);

const imageExts = ["jpg", "jpeg", "png", "webp"];
const videoExts = ["mp4", "mov", "mkv", "webm"];
const supportedExts = [...imageExts, ...videoExts];

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
const engineOptions = computed(() => {
    if (mediaType.value === "video") {
        return [
            {label: "ProPainter 视频时序修复", value: "propainter"},
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
    if (value === "video" && !["propainter", "comfyui"].includes(engine.value)) {
        engine.value = "propainter";
    }
    if (value === "image" && !["lama", "sdxl-inpaint", "comfyui"].includes(engine.value)) {
        engine.value = "lama";
    }
});
watch(filePath, () => {
    masks.splice(0, masks.length);
    detectionMessage.value = "尚未检测";
    detectionSource.value = "none";
});

const addMask = () => {
    masks.push({
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
    });
};
const setMasks = (items: WatermarkMask[]) => {
    masks.splice(0, masks.length, ...items);
};
const removeMask = (id: number) => {
    const index = masks.findIndex(item => item.id === id);
    if (index >= 0) {
        masks.splice(index, 1);
    }
};
const applyPreset = (preset: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center") => {
    const current = masks[0] || null;
    if (!current) {
        addMask();
    }
    const mask = masks[0];
    const presets = {
        "top-left": {x: 4, y: 4, width: 18, height: 10, name: "左上角水印"},
        "top-right": {x: 78, y: 4, width: 18, height: 10, name: "右上角水印"},
        "bottom-left": {x: 4, y: 82, width: 18, height: 10, name: "左下角水印"},
        "bottom-right": {x: 78, y: 82, width: 18, height: 10, name: "右下角水印"},
        center: {x: 35, y: 43, width: 30, height: 14, name: "居中水印"},
    };
    Object.assign(mask, presets[preset]);
};
const clampPercent = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value * 10) / 10));
const normalizeDetectedMask = (raw: any, index: number, source: "service" | "heuristic"): WatermarkMask | null => {
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
    return {
        id: Date.now() + index,
        name: raw?.name || raw?.text || `疑似水印 ${index + 1}`,
        x: clampPercent(x),
        y: clampPercent(y),
        width: clampPercent(width, 1, 100),
        height: clampPercent(height, 1, 100),
        feather: Number(raw?.feather ?? 6),
        startTime: raw?.startTime || raw?.start || "00:00:00",
        endTime: raw?.endTime || raw?.end || "",
        confidence: Number(raw?.confidence ?? raw?.score ?? 0.6),
        source,
    };
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
const mergeDetectedMasks = (items: WatermarkMask[]) => {
    const merged: WatermarkMask[] = [];
    items
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .forEach(item => {
            const duplicate = merged.some(existing => {
                const ax2 = item.x + item.width;
                const ay2 = item.y + item.height;
                const bx2 = existing.x + existing.width;
                const by2 = existing.y + existing.height;
                const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(item.x, existing.x));
                const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(item.y, existing.y));
                const overlap = overlapX * overlapY;
                const area = Math.min(item.width * item.height, existing.width * existing.height);
                return area > 0 && overlap / area > 0.35;
            });
            if (!duplicate) {
                merged.push(item);
            }
        });
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
            let minX = imageData.width;
            let minY = imageData.height;
            let maxX = 0;
            let maxY = 0;
            let hit = 0;
            for (let y = 0; y < imageData.height; y += 1) {
                for (let x = 0; x < imageData.width; x += 1) {
                    const i = (y * imageData.width + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const saturation = max === 0 ? 0 : (max - min) / max;
                    const isLightText = max > 188 && saturation < 0.28;
                    if (isLightText) {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                        hit++;
                    }
                }
            }
            if (hit < 24 || maxX <= minX || maxY <= minY) {
                return null;
            }
            const boxWidth = maxX - minX + 1;
            const boxHeight = maxY - minY + 1;
            const density = hit / (boxWidth * boxHeight);
            const aspect = boxWidth / Math.max(1, boxHeight);
            if (density < 0.02 || boxWidth < 16 || boxHeight < 8 || aspect < 1.1) {
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
                confidence: Math.min(0.96, 0.58 + density + Math.min(0.22, aspect / 30)),
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
        .filter(item => item.score > 0.08)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((item, index) => normalizeDetectedMask({
            name: item.name,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            confidence: item.confidence,
        }, index, "heuristic"))
        .filter(Boolean) as WatermarkMask[];
    return mergeDetectedMasks([...lightTextMasks, ...edgeMasks]);
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
        try {
            detected = await tryServiceDetect();
            detectionSource.value = "service";
        } catch (e) {
            const canvas = mediaType.value === "image" ? await canvasFromImage() : canvasFromVideo();
            detected = detectFromCanvas(canvas);
            detectionSource.value = "heuristic";
        }
        setMasks(detected);
        if (detected.length > 0) {
            detectionMessage.value = `检测到 ${detected.length} 个疑似水印区域`;
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

        <div class="grid grid-cols-12 gap-4">
            <div class="col-span-7">
                <div class="panel">
                    <div class="panel-title">素材与预览</div>
                    <div class="flex items-center gap-2 mb-4">
                        <FileSelector v-model="filePath" :extensions="supportedExts"/>
                        <a-button type="primary" :loading="detecting" @click="detectWatermark">
                            <icon-search/>
                            智能检测水印
                        </a-button>
                    </div>
                    <a-alert
                        v-if="filePath"
                        :type="masks.length > 0 ? 'success' : 'info'"
                        class="mb-3"
                    >
                        {{ detectionMessage }}
                        <span v-if="detectionSource === 'service'">，结果来自本地识别服务</span>
                        <span v-else-if="detectionSource === 'heuristic'">，结果来自前端候选检测</span>
                    </a-alert>
                    <div class="preview-box">
                        <div v-if="!filePath" class="empty-preview">
                            <icon-file/>
                            <div class="mt-2">选择图片或视频后在这里预览</div>
                        </div>
                        <div v-else>
                            <div class="text-sm text-gray-500 mb-2">{{ previewTitle }}</div>
                            <div
                                v-if="mediaType === 'image'"
                                class="media-stage"
                            >
                                <img :src="processedUrl" class="media-content"/>
                                <div
                                    v-for="mask in masks"
                                    :key="`image-${mask.id}`"
                                    class="mask-overlay"
                                    :style="{
                                        left: `${mask.x}%`,
                                        top: `${mask.y}%`,
                                        width: `${mask.width}%`,
                                        height: `${mask.height}%`,
                                    }"
                                >
                                    <span>{{ mask.name }}</span>
                                </div>
                            </div>
                            <div
                                v-else-if="mediaType === 'video'"
                                class="media-stage"
                            >
                                <video ref="mediaVideo" :src="processedUrl" class="media-content" controls preload="metadata"/>
                                <div
                                    v-for="mask in masks"
                                    :key="`video-${mask.id}`"
                                    class="mask-overlay"
                                    :style="{
                                        left: `${mask.x}%`,
                                        top: `${mask.y}%`,
                                        width: `${mask.width}%`,
                                        height: `${mask.height}%`,
                                    }"
                                >
                                    <span>{{ mask.name }}</span>
                                </div>
                            </div>
                            <a-alert v-else type="error">暂不支持该文件格式</a-alert>
                        </div>
                    </div>
                    <div class="mt-4 flex flex-wrap gap-2">
                        <a-button @click="applyPreset('top-left')">左上角</a-button>
                        <a-button @click="applyPreset('top-right')">右上角</a-button>
                        <a-button @click="applyPreset('bottom-left')">左下角</a-button>
                        <a-button @click="applyPreset('bottom-right')">右下角</a-button>
                        <a-button @click="applyPreset('center')">居中水印</a-button>
                    </div>
                </div>
            </div>

            <div class="col-span-5">
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
}

.media-content {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}

.mask-overlay {
    position: absolute;
    border: 2px solid #22c55e;
    background: rgba(34, 197, 94, 0.18);
    box-shadow: 0 0 0 9999px rgba(17, 24, 39, 0.08);
    pointer-events: none;
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
}

.mask-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
}

.flow-step {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem;
    background: #f9fafb;
    text-align: center;
}
</style>
