<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Dialog } from "../../lib/dialog";
import {
    DirectApiPlatformRecord,
    DirectApiPlatformService,
} from "../../service/DirectApiPlatformService";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { RunningHubModelConfigType } from "../Apps/RunningHubStudio/type";
import { usePageDraft } from "../../hooks/pageDraft";

type ImageMode = "generation" | "edit" | "blend";

type ImageAsset = {
    id: string;
    url: string;
};

const route = useRoute();
const router = useRouter();
const platforms = ref<DirectApiPlatformRecord[]>([]);
const platformId = ref(0);
const imageModel = ref("gpt-image-2");
const mode = ref<ImageMode>("generation");
const prompt = ref("");
const title = ref("");
const size = ref("1024x1024");
const quality = ref("high");
const count = ref(1);
const images = ref<ImageAsset[]>([]);
const mask = ref("");
const aspectRatio = ref("1:1");
const thinkingLevel = ref("minimal");
const botType = ref("MID_JOURNEY");
const mjChaos = ref("0");
const mjVersion = ref("7");
const pageDraft = usePageDraft("ToolGptImage2", {
    platformId,
    imageModel,
    mode,
    prompt,
    title,
    size,
    quality,
    count,
    images,
    mask,
    aspectRatio,
    thinkingLevel,
    botType,
    mjChaos,
    mjVersion,
});

const modeOptions: Array<{ label: string; value: ImageMode; desc: string }> = [
    { label: "文生图", value: "generation", desc: "只用提示词生成图片" },
    { label: "图片编辑", value: "edit", desc: "对单图或多图做局部/整体编辑" },
    { label: "多图融合", value: "blend", desc: "把多个素材组合成新画面" },
];

const PIX_IMAGE_MODELS = [
    {
        id: "gpt-image-2",
        label: "GPT Image 2",
        sizes: ["auto", "1024x1024", "2048x2048", "1536x1024", "1024x1536", "1280x960", "960x1280", "2048x1152", "1152x2048", "3840x2160", "2160x3840"],
        qualities: ["auto", "high", "medium", "low"],
        aspectRatios: [] as string[],
        modes: ["generation", "edit", "blend"] as ImageMode[],
        maxImages: 16,
    },
    {
        id: "gemini-3-pro-image",
        label: "Gemini 3 Pro Image",
        sizes: ["1K", "2K", "4K"],
        qualities: [] as string[],
        aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"],
        modes: ["generation", "edit", "blend"] as ImageMode[],
        maxImages: 14,
    },
    {
        id: "gemini-3.1-flash-image",
        label: "Gemini 3.1 Flash Image",
        sizes: ["0.5K", "1K", "2K", "4K"],
        qualities: [] as string[],
        aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"],
        modes: ["generation", "edit", "blend"] as ImageMode[],
        maxImages: 14,
    },
    {
        id: "mj_imagine",
        label: "Midjourney Imagine",
        sizes: [] as string[],
        qualities: ["0.25", "0.5", "1", "2"],
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"],
        modes: ["generation", "blend"] as ImageMode[],
        maxImages: 4,
    },
] as const;

const LEGACY_IMAGE_MODEL = PIX_IMAGE_MODELS[0];

const currentPlatform = computed(() => {
    return platforms.value.find(item => item.id === platformId.value) || null;
});

const isPixPlatform = (platform: DirectApiPlatformRecord | null) => platform?.content.platformType === "pix";

const imageModelOptions = computed(() => isPixPlatform(currentPlatform.value) ? PIX_IMAGE_MODELS : [LEGACY_IMAGE_MODEL]);
const currentImageModel = computed(() => PIX_IMAGE_MODELS.find(item => item.id === imageModel.value) || LEGACY_IMAGE_MODEL);
const sizeOptions = computed(() => [...currentImageModel.value.sizes]);
const qualityOptions = computed(() => [...currentImageModel.value.qualities]);
const aspectRatioOptions = computed(() => [...currentImageModel.value.aspectRatios]);
const automaticMode = computed<ImageMode>(() => {
    const imageCount = images.value.filter(item => item.url.trim()).length;
    if (imageCount === 0) return "generation";
    if (imageModel.value === "mj_imagine" || imageCount > 1) return "blend";
    return "edit";
});
const automaticModeLabel = computed(() => modeOptions.find(item => item.value === automaticMode.value)?.label || "文生图");
const imageMaterialHint = computed(() => {
    const config = currentImageModel.value;
    if (automaticMode.value === "generation") return `未上传参考图，将自动使用文生图模式`;
    if (config.id === "mj_imagine") return `Midjourney 仅支持多图参考，不支持图片编辑；最多 ${config.maxImages} 张`;
    return `${automaticMode.value === "edit" ? "已自动切换为图片编辑" : "已自动切换为多图融合"}，最多支持 ${config.maxImages} 张参考图`;
});

const imageMaxFileSizeMB: Record<string, number> = {
    "gpt-image-2": 25,
    "gemini-3-pro-image": 10,
    "gemini-3.1-flash-image": 10,
};

const validateLocalImageFiles = async (paths: string[]) => {
    const maxSizeMB = imageMaxFileSizeMB[imageModel.value];
    if (!maxSizeMB) return [] as string[];
    const errors: string[] = [];
    for (const filePath of paths) {
        if (!/^[a-zA-Z]:[\\/]/.test(filePath)) continue;
        const stat = await window.$mapi.file.stat(filePath);
        const size = Number(stat?.size || 0);
        if (size > maxSizeMB * 1024 * 1024) {
            errors.push(`${shortName(filePath)} 大小为 ${(size / 1024 / 1024).toFixed(1)}MB，${currentImageModel.value.label} 单张图片不能超过 ${maxSizeMB}MB`);
        }
    }
    return errors;
};

const normalizeImageModelParameters = () => {
    const allowedModels = imageModelOptions.value.map(item => item.id);
    if (!allowedModels.includes(imageModel.value as any)) {
        imageModel.value = allowedModels[0] || "gpt-image-2";
    }
    const config = currentImageModel.value;
    if (!config.modes.includes(mode.value as never)) {
        mode.value = config.modes[0];
    }
    if (config.sizes.length && !config.sizes.includes(size.value as never)) {
        size.value = config.sizes[0];
    }
    if (config.qualities.length && !config.qualities.includes(quality.value as never)) {
        quality.value = config.qualities.includes("1" as never) ? "1" : config.qualities[0];
    }
    if (config.aspectRatios.length && !config.aspectRatios.includes(aspectRatio.value as never)) {
        aspectRatio.value = config.aspectRatios[0];
    }
    count.value = Math.max(1, Math.min(10, Number(count.value) || 1));
};

const loadPlatforms = async () => {
    platforms.value = await DirectApiPlatformService.listByCapability("gpt-image-2");
    const defaultPlatform = await DirectApiPlatformService.getDefault("gpt-image-2");
    platformId.value = platforms.value.some(item => item.id === platformId.value)
        ? platformId.value
        : defaultPlatform?.id || platforms.value[0]?.id || 0;
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
    imageModel.value = String(body.model || imageModel.value);
    const restoredMode = ["generation", "edit", "blend"].includes(input.mode)
        ? input.mode
        : body.image || body["image[]"]
          ? "edit"
          : "generation";
    mode.value = restoredMode as ImageMode;
    prompt.value = String(input.prompt || body.prompt || "");
    size.value = String(body.size || size.value);
    quality.value = String(body.quality || quality.value);
    count.value = Number(body.count || body.n || count.value || 1);
    images.value = Array.isArray(input.images) ? input.images : [];
    if (!images.value.length) {
        const bodyImages = Array.isArray(body.images)
            ? body.images
            : Array.isArray(body["image[]"])
              ? body["image[]"]
              : body.image
                ? [body.image]
                : [];
        images.value = bodyImages.map((url: string) => ({
            id: `${Date.now()}-${Math.random()}`,
            url,
        }));
    }
    mask.value = String(input.mask || body.mask || "");
    aspectRatio.value = String(body.aspect_ratio || aspectRatio.value);
    thinkingLevel.value = String(body.thinking_level || thinkingLevel.value);
    botType.value = String(body.bot_type || botType.value);
    mjChaos.value = String(body.chaos ?? mjChaos.value);
    mjVersion.value = String(body.version || mjVersion.value);
    normalizeImageModelParameters();
};

const shortTaskText = (value: string, fallback = "GPT Image 2") => {
    const text = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    if (text) {
        return text.slice(0, 28);
    }
    return fallback;
};

const buildGptImageTaskTitle = () => {
    const imageName = images.value.map(item => item.url).find(Boolean);
    const sourceName = String(imageName || "")
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "");
    const base = shortTaskText(prompt.value, sourceName || "GPT Image 2");
    return `${base}_图片_${new Date().toLocaleString()}`;
};

onMounted(async () => {
    if (!route.query.editTaskId) {
        await pageDraft.restore();
    } else {
        pageDraft.restored.value = true;
    }
    await loadPlatforms();
    await hydrateFromTask();
    normalizeImageModelParameters();
});

watch([platformId, imageModel], normalizeImageModelParameters);
watch(automaticMode, value => {
    mode.value = value;
}, { immediate: true });

const displayUrl = (value: string) => {
    if (/^[a-zA-Z]:[\\/]/.test(value)) {
        return `file:///${value.replace(/\\/g, "/")}`;
    }
    return value;
};

const canPreview = (value: string) => {
    return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || /^[a-zA-Z]:[\\/]/.test(value);
};

const shortName = (value: string) => {
    return String(value || "").replace(/\\/g, "/").split("/").pop() || value;
};

const pickImages = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
        properties: ["multiSelections"],
    });
    if (!filePath) {
        return;
    }
    const list = (Array.isArray(filePath) ? filePath : [filePath]) as string[];
    const fileErrors = await validateLocalImageFiles(list);
    if (fileErrors.length) {
        Dialog.tipError(fileErrors.slice(0, 3).join("\n"));
        return;
    }
    const remaining = Math.max(0, currentImageModel.value.maxImages - images.value.length);
    if (remaining === 0) {
        Dialog.tipError(`${currentImageModel.value.label} 最多支持 ${currentImageModel.value.maxImages} 张参考图`);
        return;
    }
    if (list.length > remaining) {
        Dialog.tipError(`本次只添加前 ${remaining} 张；${currentImageModel.value.label} 最多支持 ${currentImageModel.value.maxImages} 张参考图`);
    }
    images.value.push(
        ...list.slice(0, remaining).map(url => ({
            id: `${Date.now()}-${Math.random()}`,
            url,
        }))
    );
};

const pickMask = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return;
    }
    mask.value = filePath;
};

const removeImage = (id: string) => {
    images.value = images.value.filter(item => item.id !== id);
};

const submit = async () => {
    const platform = currentPlatform.value;
    if (!platform) {
        Dialog.tipError("请先在设置里配置可用平台");
        return;
    }
    if (!platform.content.apiKey.trim()) {
        Dialog.tipError("当前平台未配置 API Key");
        return;
    }
    if (!prompt.value.trim()) {
        Dialog.tipError("请输入提示词");
        return;
    }
    const validImages = images.value.map(item => item.url.trim()).filter(Boolean);
    const effectiveMode = automaticMode.value;
    const isEdit = effectiveMode !== "generation";
    const pix = isPixPlatform(platform);
    const modelConfigDef = currentImageModel.value;
    if (isEdit && validImages.length === 0) {
        Dialog.tipError("当前模式需要至少一张图片素材");
        return;
    }
    if (pix && mask.value) {
        Dialog.tipError("PIX 图片接口当前未声明 mask 参数，请先移除 mask 后提交");
        return;
    }
    if (validImages.length > modelConfigDef.maxImages) {
        Dialog.tipError(`${modelConfigDef.label} 最多支持 ${modelConfigDef.maxImages} 张参考图`);
        return;
    }
    const fileErrors = await validateLocalImageFiles(validImages);
    if (fileErrors.length) {
        Dialog.tipError(fileErrors.slice(0, 3).join("\n"));
        return;
    }
    const requestedCount = Number(count.value || 1);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 50) {
        Dialog.tipError("生成数量需为 1-50 的整数");
        return;
    }
    if (pix && modelConfigDef.sizes.length && !modelConfigDef.sizes.includes(size.value as never)) {
        Dialog.tipError(`${modelConfigDef.label} 不支持尺寸 ${size.value}`);
        return;
    }
    if (pix && modelConfigDef.aspectRatios.length && !modelConfigDef.aspectRatios.includes(aspectRatio.value as never)) {
        Dialog.tipError(`${modelConfigDef.label} 不支持比例 ${aspectRatio.value}`);
        return;
    }
    const body: Record<string, any> = pix
        ? {
              model: imageModel.value,
              prompt: prompt.value.trim(),
              mode: effectiveMode === "blend" ? "multi-reference" : effectiveMode === "edit" ? "image-edit" : "text-to-image",
              count: requestedCount,
              ...(modelConfigDef.sizes.length ? { size: size.value } : {}),
              ...(modelConfigDef.aspectRatios.length ? { aspect_ratio: aspectRatio.value } : {}),
              ...(imageModel.value === "gemini-3.1-flash-image" ? { thinking_level: thinkingLevel.value } : {}),
              ...(imageModel.value === "mj_imagine"
                  ? {
                        bot_type: botType.value,
                        chaos: Number(mjChaos.value),
                        quality: Number(quality.value),
                        version: mjVersion.value,
                    }
                  : modelConfigDef.qualities.length
                    ? { quality: quality.value }
                    : {}),
              ...(isEdit ? { images: validImages } : {}),
          }
        : {
              model: "gpt-image-2",
              prompt: prompt.value.trim(),
              size: size.value,
              quality: quality.value,
          };
    if (!pix && isEdit) {
        body[validImages.length > 1 ? "image[]" : "image"] = validImages;
        if (mask.value) {
            body.mask = mask.value;
        }
    } else if (!pix) {
        body.n = requestedCount;
    }
    const modelConfig: RunningHubModelConfigType = {
        capability: "image",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: pix ? modelConfigDef.label : "GPT Image 2",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        submitPath: pix ? "/v1/images/generations" : isEdit ? "/v1/images/edits" : "/v1/images/generations",
        queryPath: "",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: pix ? "json" : isEdit ? "form-data" : "json",
    };
    const record: TaskRecord = {
        biz: "DirectApiTask",
        title: title.value.trim() || buildGptImageTaskTitle(),
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { mode: effectiveMode, prompt: prompt.value, images: images.value, mask: mask.value } },
    };
    await TaskService.submit(record);
    Dialog.tipSuccess("任务已提交");
};
</script>

<template>
    <div class="relative h-full min-h-[720px] bg-[#f7f8fa] flex flex-col">
        <div class="flex-shrink-0 px-8 py-5 border-b border-white/80 bg-white/85">
            <div class="flex items-center gap-4">
                <div class="flex-grow">
                    <div class="text-[28px] font-semibold text-gray-900 leading-tight">AI 图片模型</div>
                    <div class="text-sm text-gray-500 mt-1">PIX 可自由选择 GPT Image、Gemini Image 和 Midjourney。</div>
                </div>
                <a-select v-model="platformId" class="!w-56" placeholder="选择平台">
                    <a-option v-for="item in platforms" :key="item.id" :value="item.id || 0">
                        {{ item.title }}
                    </a-option>
                </a-select>
                <a-button @click="router.push('/server')">平台设置</a-button>
            </div>
        </div>

        <div class="flex-grow overflow-y-auto px-8 py-6 pb-44">
            <div v-if="!platforms.length" class="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
                <div class="text-lg font-semibold text-gray-900">还没有可用平台</div>
                <div class="text-sm text-gray-500 mt-1">先到平台接入里配置 PIX 或其他图片平台。</div>
                <a-button class="mt-4" type="primary" @click="router.push('/server')">去配置</a-button>
            </div>

            <div v-else class="min-w-0 rounded-2xl bg-white p-5 shadow-sm">
                    <div class="flex flex-wrap items-center gap-2 mb-4">
                        <a-tag color="arcoblue">{{ imageModel }}</a-tag>
                        <a-tag color="green">自动模式：{{ automaticModeLabel }}</a-tag>
                        <a-tag v-if="sizeOptions.length">{{ size }}</a-tag>
                        <a-tag v-if="qualityOptions.length">{{ quality }}</a-tag>
                    </div>

                    <div class="mb-3 flex items-center gap-3">
                        <a-button @click="pickImages">上传参考图</a-button>
                        <a-button v-if="mode === 'edit' && !isPixPlatform(currentPlatform)" @click="pickMask">选择 mask</a-button>
                        <span class="text-xs text-blue-600">{{ imageMaterialHint }}</span>
                    </div>

                    <div v-if="mode === 'generation'" class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
                        不上传参考图时，直接根据提示词生成图片；上传图片后系统会自动切换模式。
                    </div>

                    <div v-else class="space-y-3">
                        <div v-if="mask" class="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            Mask：{{ shortName(mask) }}
                            <a-link class="ml-2" @click="mask = ''">移除</a-link>
                        </div>
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div
                                v-for="item in images"
                                :key="item.id"
                                class="rounded-xl border border-gray-100 bg-gray-50 p-3"
                            >
                                <div class="flex items-center justify-between mb-2">
                                    <a-tag>image</a-tag>
                                    <a-button size="mini" status="danger" @click="removeImage(item.id)">删除</a-button>
                                </div>
                                <div class="truncate rounded-lg bg-white px-2 py-1 text-xs text-gray-500">
                                    {{ shortName(item.url) }}
                                </div>
                                <div class="mt-2 aspect-square rounded-lg bg-white flex items-center justify-center overflow-hidden text-xs text-gray-400">
                                    <img v-if="item.url && canPreview(item.url)" :src="displayUrl(item.url)" class="h-full w-full object-contain" />
                                    <span v-else>{{ shortName(item.url) || "图片素材" }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
            </div>
        </div>

        <div class="absolute bottom-5 left-1/2 z-10 w-[min(1040px,calc(100%-80px))] -translate-x-1/2 rounded-[22px] border border-gray-100 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
            <div class="flex flex-wrap gap-2 mb-3" v-if="mode !== 'generation' && (images.some(item => item.url) || mask)">
                <a-tag v-for="item in images.filter(item => item.url)" :key="item.id" closable @close="removeImage(item.id)">
                    {{ shortName(item.url) }}
                </a-tag>
                <a-tag v-if="mask" closable @close="mask = ''">mask {{ shortName(mask) }}</a-tag>
            </div>
            <a-textarea
                v-model="prompt"
                :auto-size="{ minRows: 2, maxRows: 5 }"
                :placeholder="mode === 'generation' ? '描述你想生成的画面。当前模式不提交参考图。' : `描述你想生成或编辑的画面。${imageMaterialHint}`"
            />
            <div class="flex flex-wrap items-end gap-3 mt-3">
                <div class="w-52">
                    <div class="mb-1 text-xs font-medium text-gray-500">图片模型</div>
                    <a-select v-model="imageModel" class="!w-full">
                        <a-option v-for="item in imageModelOptions" :key="item.id" :value="item.id">{{ item.label }}</a-option>
                    </a-select>
                </div>
                <div class="w-32">
                    <div class="mb-1 text-xs font-medium text-gray-500">生成方式（自动）</div>
                    <div class="h-8 rounded border border-gray-200 bg-gray-50 px-3 text-sm leading-8 text-gray-700">{{ automaticModeLabel }}</div>
                </div>
                <div v-if="sizeOptions.length" class="w-36">
                    <div class="mb-1 text-xs font-medium text-gray-500">输出尺寸</div>
                    <a-select v-model="size" class="!w-full" :allow-create="!isPixPlatform(currentPlatform)" allow-search>
                        <a-option v-for="item in sizeOptions" :key="item" :value="item">{{ item }}</a-option>
                    </a-select>
                </div>
                <div v-if="qualityOptions.length" class="w-28">
                    <div class="mb-1 text-xs font-medium text-gray-500">生成质量</div>
                    <a-select v-model="quality" class="!w-full">
                        <a-option v-for="item in qualityOptions" :key="item" :value="item">{{ item }}</a-option>
                    </a-select>
                </div>
                <div v-if="aspectRatioOptions.length" class="w-24">
                    <div class="mb-1 text-xs font-medium text-gray-500">画面比例</div>
                    <a-select v-model="aspectRatio" class="!w-full">
                        <a-option v-for="item in aspectRatioOptions" :key="item" :value="item">{{ item }}</a-option>
                    </a-select>
                </div>
                <div class="w-28">
                    <div class="mb-1 text-xs font-medium text-gray-500">生成张数（1-10）</div>
                    <a-input-number v-model="count" class="!w-full" :min="1" :max="10" mode="button" />
                </div>
                <a-popover trigger="click" position="top">
                    <a-button>更多参数</a-button>
                    <template #content>
                        <div class="w-52 space-y-3">
                            <div v-if="imageModel === 'gemini-3.1-flash-image'">
                                <div class="mb-1 text-xs text-gray-500">思考强度：影响复杂指令理解</div>
                                <a-select v-model="thinkingLevel"><a-option value="minimal">minimal 较快</a-option><a-option value="high">high 更充分</a-option></a-select>
                            </div>
                            <template v-if="imageModel === 'mj_imagine'">
                                <div><div class="mb-1 text-xs text-gray-500">绘图类型</div><a-select v-model="botType"><a-option value="MID_JOURNEY">Midjourney 通用</a-option><a-option value="NIJI_JOURNEY">Niji 动漫</a-option></a-select></div>
                                <div><div class="mb-1 text-xs text-gray-500">变化程度：越高越随机</div><a-select v-model="mjChaos"><a-option v-for="item in ['0', '25', '50', '75', '100']" :key="item" :value="item">Chaos {{ item }}</a-option></a-select></div>
                                <div><div class="mb-1 text-xs text-gray-500">模型版本</div><a-select v-model="mjVersion"><a-option v-for="item in ['8.2', '8.1', '7', '6.1', '6', '5.2', '5.1']" :key="item" :value="item">v{{ item }}</a-option></a-select></div>
                            </template>
                            <div><div class="mb-1 text-xs text-gray-500">任务名称（可选）</div><a-input v-model="title" allow-clear placeholder="用于任务列表识别" /></div>
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
</template>
