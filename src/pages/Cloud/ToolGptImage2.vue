<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Dialog } from "../../lib/dialog";
import {
    DirectApiPlatformRecord,
    DirectApiPlatformService,
} from "../../service/DirectApiPlatformService";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { RunningHubModelConfigType } from "../Apps/RunningHubStudio/type";

type ImageMode = "generation" | "edit" | "blend";

type ImageAsset = {
    id: string;
    url: string;
};

const route = useRoute();
const router = useRouter();
const platforms = ref<DirectApiPlatformRecord[]>([]);
const platformId = ref(0);
const mode = ref<ImageMode>("generation");
const prompt = ref("");
const title = ref("");
const size = ref("1024x1024");
const quality = ref("high");
const count = ref(1);
const images = ref<ImageAsset[]>([]);
const mask = ref("");

const modeOptions: Array<{ label: string; value: ImageMode; desc: string }> = [
    { label: "文生图", value: "generation", desc: "只用提示词生成图片" },
    { label: "图片编辑", value: "edit", desc: "对单图或多图做局部/整体编辑" },
    { label: "多图融合", value: "blend", desc: "把多个素材组合成新画面" },
];

const sizeOptions = ["1024x1024", "1024x1536", "1536x1024", "auto"];
const qualityOptions = ["low", "medium", "high", "auto"];

const currentPlatform = computed(() => {
    return platforms.value.find(item => item.id === platformId.value) || null;
});

const loadPlatforms = async () => {
    platforms.value = await DirectApiPlatformService.listByCapability("gpt-image-2");
    const defaultPlatform = await DirectApiPlatformService.getDefault("gpt-image-2");
    platformId.value = defaultPlatform?.id || platforms.value[0]?.id || 0;
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
    title.value = String(record.title || "");
    const restoredMode = ["generation", "edit", "blend"].includes(input.mode)
        ? input.mode
        : body.image || body["image[]"]
          ? "edit"
          : "generation";
    mode.value = restoredMode as ImageMode;
    prompt.value = String(input.prompt || body.prompt || "");
    size.value = String(body.size || size.value);
    quality.value = String(body.quality || quality.value);
    count.value = Number(body.n || count.value || 1);
    images.value = Array.isArray(input.images) ? input.images : [];
    if (!images.value.length) {
        const bodyImages = Array.isArray(body["image[]"]) ? body["image[]"] : body.image ? [body.image] : [];
        images.value = bodyImages.map((url: string) => ({
            id: `${Date.now()}-${Math.random()}`,
            url,
        }));
    }
    mask.value = String(input.mask || body.mask || "");
};

onMounted(async () => {
    await loadPlatforms();
    await hydrateFromTask();
});

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
    const list = Array.isArray(filePath) ? filePath : [filePath];
    images.value.push(
        ...list.map(url => ({
            id: `${Date.now()}-${Math.random()}`,
            url,
        }))
    );
};

const addUrlImage = () => {
    images.value.push({
        id: `${Date.now()}-${Math.random()}`,
        url: "",
    });
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

const insertAssetMention = () => {
    if (!images.value.length) {
        Dialog.tipError("请先上传或添加图片素材");
        return;
    }
    const text = images.value
        .filter(item => item.url)
        .map(item => `@${shortName(item.url)}`)
        .join(" ");
    prompt.value = `${prompt.value}${prompt.value ? " " : ""}${text}`.trim();
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
    const isEdit = mode.value !== "generation";
    if (isEdit && validImages.length === 0) {
        Dialog.tipError("当前模式需要至少一张图片素材");
        return;
    }
    const body: Record<string, any> = {
        model: "gpt-image-2",
        prompt: prompt.value.replace(/@\S+/g, "").trim(),
        size: size.value,
        quality: quality.value,
    };
    if (isEdit) {
        body[validImages.length > 1 ? "image[]" : "image"] = validImages;
        if (mask.value) {
            body.mask = mask.value;
        }
    } else {
        body.n = Number(count.value || 1);
    }
    const modelConfig: RunningHubModelConfigType = {
        capability: "image",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: "GPT Image 2",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        submitPath: isEdit ? "/v1/images/edits" : "/v1/images/generations",
        queryPath: "",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: isEdit ? "form-data" : "json",
    };
    const record: TaskRecord = {
        biz: "DirectApiTask",
        title: title.value.trim() || `GPT Image 2_${new Date().toLocaleString()}`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { mode: mode.value, prompt: prompt.value, images: images.value, mask: mask.value } },
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
                    <div class="text-[28px] font-semibold text-gray-900 leading-tight">GPT Image 2</div>
                    <div class="text-sm text-gray-500 mt-1">用提示词、参考图和 mask 做图片生成与编辑。</div>
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
                <div class="text-sm text-gray-500 mt-1">先到平台接入里配置 ExchangeToken 或其他支持 GPT Image 2 的平台。</div>
                <a-button class="mt-4" type="primary" @click="router.push('/server')">去配置</a-button>
            </div>

            <div v-else class="grid grid-cols-[220px_minmax(0,1fr)] gap-5">
                <div class="space-y-3">
                    <button
                        v-for="item in modeOptions"
                        :key="item.value"
                        type="button"
                        class="w-full rounded-xl border px-4 py-3 text-left transition-colors"
                        :class="mode === item.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-white bg-white text-gray-700 hover:bg-gray-50'"
                        @click="mode = item.value"
                    >
                        <div class="text-sm font-semibold">{{ item.label }}</div>
                        <div class="text-xs opacity-70 mt-1">{{ item.desc }}</div>
                    </button>
                </div>

                <div class="min-w-0 rounded-2xl bg-white p-5 shadow-sm">
                    <div class="flex flex-wrap items-center gap-2 mb-4">
                        <a-tag color="arcoblue">gpt-image-2</a-tag>
                        <a-tag>{{ modeOptions.find(item => item.value === mode)?.label }}</a-tag>
                        <a-tag>{{ size }}</a-tag>
                        <a-tag>{{ quality }}</a-tag>
                    </div>

                    <div v-if="mode === 'generation'" class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
                        文生图模式只需要在底部输入提示词。
                    </div>

                    <div v-else class="space-y-3">
                        <div class="flex gap-2">
                            <a-button @click="pickImages">上传图片</a-button>
                            <a-button @click="addUrlImage">添加 URL / 路径</a-button>
                            <a-button v-if="mode === 'edit'" @click="pickMask">选择 mask</a-button>
                        </div>
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
                                <a-input v-model="item.url" allow-clear placeholder="本地路径 / URL" />
                                <div class="mt-2 aspect-square rounded-lg bg-white flex items-center justify-center overflow-hidden text-xs text-gray-400">
                                    <img v-if="item.url && canPreview(item.url)" :src="displayUrl(item.url)" class="h-full w-full object-contain" />
                                    <span v-else>{{ shortName(item.url) || "图片素材" }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="absolute bottom-5 left-1/2 z-10 w-[min(820px,calc(100%-80px))] -translate-x-1/2 rounded-[22px] border border-gray-100 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
            <div class="flex flex-wrap gap-2 mb-3" v-if="images.some(item => item.url) || mask">
                <a-tag v-for="item in images.filter(item => item.url)" :key="item.id" closable @close="removeImage(item.id)">
                    @{{ shortName(item.url) }}
                </a-tag>
                <a-tag v-if="mask" closable @close="mask = ''">mask @{{ shortName(mask) }}</a-tag>
            </div>
            <a-textarea
                v-model="prompt"
                :auto-size="{ minRows: 2, maxRows: 5 }"
                placeholder="描述你想生成或编辑的画面。可以点 @ 引用已上传图片。"
            />
            <div class="flex flex-wrap items-center gap-2 mt-3">
                <a-select v-model="mode" class="!w-32">
                    <a-option v-for="item in modeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                </a-select>
                <a-select v-model="size" class="!w-36" allow-create allow-search>
                    <a-option v-for="item in sizeOptions" :key="item" :value="item">{{ item }}</a-option>
                </a-select>
                <a-select v-model="quality" class="!w-28">
                    <a-option v-for="item in qualityOptions" :key="item" :value="item">{{ item }}</a-option>
                </a-select>
                <a-input-number v-if="mode === 'generation'" v-model="count" class="!w-28" :min="1" :max="10" mode="button" />
                <a-button @click="insertAssetMention">@素材</a-button>
                <a-popover trigger="click" position="top">
                    <a-button>更多</a-button>
                    <template #content>
                        <div class="w-52 space-y-3">
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
</template>
