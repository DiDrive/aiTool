<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Dialog } from "../../lib/dialog";
import {
    DirectApiPlatformRecord,
    DirectApiPlatformService,
} from "../../service/DirectApiPlatformService";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { RunningHubModelConfigType } from "../Apps/RunningHubStudio/type";

type CreationMode = "frames" | "reference";
type SeedanceAssetType = "image" | "video" | "audio";

type SeedanceAsset = {
    id: string;
    type: SeedanceAssetType;
    role: "reference_image" | "reference_video" | "reference_audio";
    url: string;
};

type MentionAsset = {
    id: string;
    label: string;
    type: SeedanceAssetType | "frame";
    url: string;
    source: "first_frame" | "last_frame" | "asset";
};

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
const mentionAssetIds = ref<string[]>([]);
const assetPickerVisible = ref(false);
const assetPickerKeyword = ref("");
const promptTextareaRef = ref<any>(null);
const mentionRange = ref<{ start: number; end: number } | null>(null);

const modeOptions: Array<{ label: string; value: CreationMode; desc: string }> = [
    { label: "首尾帧", value: "frames", desc: "控制开始和结束画面" },
    { label: "全能参考", value: "reference", desc: "图片、视频、音频混合参考" },
];

const modelOptions = ["seedance-2.0", "seedance-2.0-fast"];
const ratioOptions = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"];
const resolutionOptions = ["480p", "720p"];

const currentPlatform = computed(() => {
    return platforms.value.find(item => item.id === platformId.value) || null;
});

const loadPlatforms = async () => {
    platforms.value = await DirectApiPlatformService.listByCapability("seedance");
    const defaultPlatform = await DirectApiPlatformService.getDefault("seedance");
    platformId.value = defaultPlatform?.id || platforms.value[0]?.id || 0;
};

onMounted(loadPlatforms);

const isPreviewableImage = (value: string) => {
    return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || /^[a-zA-Z]:[\\/]/.test(value);
};

const isPreviewableVideo = (value: string) => {
    return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || /^[a-zA-Z]:[\\/]/.test(value);
};

const isPlayableAudio = (value: string) => {
    return /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || /^[a-zA-Z]:[\\/]/.test(value);
};

const displayUrl = (value: string) => {
    if (/^[a-zA-Z]:[\\/]/.test(value)) {
        return `file:///${value.replace(/\\/g, "/")}`;
    }
    return value;
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

const pickFrame = async (target: "first" | "last") => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return;
    }
    if (target === "first") {
        firstFrame.value = filePath;
    } else {
        lastFrame.value = filePath;
    }
};

const pickReference = async (type: SeedanceAssetType) => {
    const filters = {
        image: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"] }],
        video: [{ name: "Video", extensions: ["mp4", "mov"] }],
        audio: [{ name: "Audio", extensions: ["wav", "mp3"] }],
    };
    const filePath = await window.$mapi.file.openFile({
        filters: filters[type],
        properties: ["multiSelections"],
    });
    if (!filePath) {
        return;
    }
    const list = Array.isArray(filePath) ? filePath : [filePath];
    const roleMap = {
        image: "reference_image",
        video: "reference_video",
        audio: "reference_audio",
    } as const;
    assets.value.push(
        ...list.map(url => ({
            id: `${Date.now()}-${Math.random()}`,
            type,
            role: roleMap[type],
            url,
        }))
    );
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
    if (firstFrame.value) {
        list.push({
            id: "first-frame",
            label: `首帧 ${shortName(firstFrame.value)}`,
            type: "frame",
            url: firstFrame.value,
            source: "first_frame",
        });
    }
    if (lastFrame.value) {
        list.push({
            id: "last-frame",
            label: `尾帧 ${shortName(lastFrame.value)}`,
            type: "frame",
            url: lastFrame.value,
            source: "last_frame",
        });
    }
    for (const item of assets.value.filter(item => item.url)) {
        list.push({
            id: item.id,
            label: shortName(item.url),
            type: item.type,
            url: item.url,
            source: "asset",
        });
    }
    return list;
});

const selectedMentionAssets = computed(() => {
    return mentionAssetIds.value
        .map(id => mentionAssets.value.find(item => item.id === id))
        .filter(Boolean) as MentionAsset[];
});

const mentionTokenOf = (asset: MentionAsset) => {
    return `@${asset.label.replace(/\s+/g, "_")}`;
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
    mentionAssetIds.value = mentionAssetIds.value.filter(id => {
        const asset = mentionAssets.value.find(item => item.id === id);
        if (!asset) {
            return false;
        }
        return prompt.value.includes(mentionTokenOf(asset));
    });
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

const removeMentionToken = (asset: MentionAsset) => {
    const token = mentionTokenOf(asset).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    prompt.value = prompt.value
        .replace(new RegExp(`(^|\\s)${token}(?=\\s|$)`, "g"), "$1")
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
    const cleanPrompt = prompt.value.replace(/@\S+/g, "").trim();
    if (cleanPrompt) {
        content.push({ type: "text", text: cleanPrompt });
    }
    if (mode.value === "frames") {
        if (firstFrame.value) {
            content.push({ type: "image_url", image_url: { url: firstFrame.value }, role: "first_frame" });
        }
        if (lastFrame.value) {
            content.push({ type: "image_url", image_url: { url: lastFrame.value }, role: "last_frame" });
        }
    }
    if (mode.value === "reference") {
        for (const item of assets.value.filter(item => item.url.trim())) {
            const key = item.type === "image" ? "image_url" : item.type === "video" ? "video_url" : "audio_url";
            content.push({
                type: key,
                [key]: { url: item.url },
                role: item.role,
            });
        }
    }
    return content;
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
        Dialog.tipError("请输入提示词或添加参考素材");
        return;
    }
    const localVideoAsset = assets.value.find(item => {
        return item.type === "video" && item.url.trim() && !/^https?:\/\//i.test(item.url.trim()) && !/^asset:\/\//i.test(item.url.trim());
    });
    const relayEnabled = Boolean(
        platform.content.directFileRelay?.enabled &&
            String(platform.content.directFileRelay?.clientID || "").trim() &&
            String(platform.content.directFileRelay?.clientSecret || "").trim() &&
            String(platform.content.directFileRelay?.parentFileID || "").trim()
    );
    if (localVideoAsset && !relayEnabled) {
        Dialog.tipError("视频参考当前需要先上传到可访问的文件服务；图片和音频会自动转成 Base64 提交");
        return;
    }
    const body: any = {
        model: model.value,
        content,
        generate_audio: generateAudio.value,
        resolution: resolution.value,
        ratio: ratio.value,
        duration: Number(duration.value || 4),
        watermark: watermark.value,
    };
    if (webSearch.value) {
        body.tools = [{ type: "web_search" }];
    }
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
        directFileRelay: platform.content.directFileRelay,
        submitPath: "/api/v3/contents/generations/tasks",
        queryPath: "/api/v3/contents/generations/tasks/{id}",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: "json",
    };
    const record: TaskRecord = {
        biz: "DirectApiTask",
        title: title.value.trim() || `Seedance_${new Date().toLocaleString()}`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { mode: mode.value, prompt: prompt.value, assets: assets.value } },
    };
    await TaskService.submit(record);
    Dialog.tipSuccess("任务已提交");
};
</script>

<template>
    <div class="relative flex h-full min-h-[720px] flex-col bg-[#f6f7f9]">
        <div class="flex-shrink-0 border-b border-gray-100 bg-white px-8 py-5">
            <div class="flex items-center gap-3">
                <div class="min-w-0 flex-grow">
                    <div class="text-[28px] font-semibold leading-tight text-gray-900">Seedance 2.0</div>
                </div>
                <a-select v-model="platformId" class="!w-56" placeholder="选择平台">
                    <a-option v-for="item in platforms" :key="item.id" :value="item.id || 0">
                        {{ item.title }}
                    </a-option>
                </a-select>
                <a-button @click="router.push('/server')">平台设置</a-button>
            </div>
        </div>

        <div class="flex-grow overflow-y-auto px-4 py-6 pb-48 xl:px-8">
            <div v-if="!platforms.length" class="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center">
                <div class="text-lg font-semibold text-gray-900">还没有可用平台</div>
                <div class="mt-1 text-sm text-gray-500">先到模型栏配置 ExchangeToken 或其他支持 Seedance 的平台。</div>
                <a-button class="mt-4" type="primary" @click="router.push('/server')">去配置</a-button>
            </div>

            <div v-else class="grid grid-cols-[148px_minmax(0,1fr)] gap-4 xl:grid-cols-[184px_minmax(0,1fr)] xl:gap-5">
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

                <div class="min-w-0 rounded-lg bg-white p-5 shadow-sm">
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

        <div class="absolute bottom-5 left-4 right-4 z-10 mx-auto max-w-[840px] rounded-[22px] border border-gray-100 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)] xl:left-8 xl:right-8">
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
                <a-input-number v-model="duration" class="!w-28" :min="-1" :max="15" mode="button" />
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
</template>
