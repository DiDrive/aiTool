<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AudioPlayer from "../common/AudioPlayer.vue";
import ImagePreviewBox from "../common/ImagePreviewBox.vue";
import VideoPlayer from "../common/VideoPlayer.vue";
import { Dialog } from "../../lib/dialog";
import { FileUtil } from "../../lib/file";
import { TimeUtil } from "../../lib/util";
import {
    createDigitalHumanClipRecordFromTask,
    DigitalHumanClipService,
    DigitalHumanClipType,
    DigitalHumanDisplayMode,
} from "../../service/DigitalHumanClipService";
import { DigitalHumanIdentityRecord, DigitalHumanIdentityService } from "../../service/DigitalHumanIdentityService";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { doSaveFile } from "../common/util";

type DisplayStatus = "queue" | "running" | "success" | "fail";

const props = defineProps<{
    record: TaskRecord;
    displayStatus: DisplayStatus;
    nowMs?: number;
}>();

const emit = defineEmits<{
    (event: "edit-task", record: TaskRecord): void;
    (event: "regenerate-task", record: TaskRecord): void;
    (event: "delete-task", record: TaskRecord): void;
}>();

type OutputItem = {
    key: string;
    name: string;
    url: string;
    isLocal: boolean;
    type: "image" | "video" | "audio" | "file";
};

const downloadingKey = ref("");
const activePreviewKey = ref("");
const clipVisible = ref(false);
const savingClip = ref(false);
const identityRecords = ref<DigitalHumanIdentityRecord[]>([]);
const clipForm = ref({
    title: "",
    clipType: "talk" as DigitalHumanClipType,
    displayMode: "normal" as DigitalHumanDisplayMode,
    identityId: 0,
    productTitle: "",
    productId: "",
    tagsText: "",
});
const clipTypeOptions: Array<{ label: string; value: DigitalHumanClipType }> = [
    { label: "待机片", value: "idle" },
    { label: "欢迎片", value: "welcome" },
    { label: "讲解片", value: "talk" },
    { label: "商品片", value: "product" },
    { label: "手持片", value: "holding" },
    { label: "过渡片", value: "transition" },
];
const displayModeOptions: Array<{ label: string; value: DigitalHumanDisplayMode }> = [
    { label: "普通口播", value: "normal" },
    { label: "商品叠层", value: "overlay" },
    { label: "桌面展示", value: "table" },
    { label: "左手持", value: "hold-left" },
    { label: "右手持", value: "hold-right" },
    { label: "双手持", value: "hold-both" },
    { label: "专属商品片", value: "product-clip" },
];

const getOutputExt = (url: string) => {
    try {
        return FileUtil.getExt(new URL(url).pathname);
    } catch (e) {
        return FileUtil.getExt(url);
    }
};

const getOutputType = (url: string, hint?: string) => {
    const hintText = String(hint || "").toLowerCase();
    if (/(image|图片|图像|gif|png|jpe?g|webp)/i.test(hintText)) {
        return "image";
    }
    if (/(video|视频|mp4|mov|avi|mkv|webm)/i.test(hintText)) {
        return "video";
    }
    if (/(audio|音频|mp3|wav|m4a|flac)/i.test(hintText)) {
        return "audio";
    }
    if (/^data:image\//i.test(url)) {
        return "image";
    }
    if (/^data:video\//i.test(url)) {
        return "video";
    }
    if (/^data:audio\//i.test(url)) {
        return "audio";
    }
    const ext = getOutputExt(url);
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        return "image";
    }
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
        return "video";
    }
    if (["mp3", "wav", "m4a", "flac"].includes(ext)) {
        return "audio";
    }
    return "file";
};

const extractUrlName = (url: string) => {
    try {
        return window.$mapi.file.pathToName(new URL(url).pathname, true, 48);
    } catch (e) {
        return window.$mapi.file.pathToName(url, true, 48);
    }
};

const remoteOutputUrl = (item: any) => {
    return String(item?.url || item?.fileUrl || item?.file_url || item?.image_url || item?.imageUrl || item?.video_url || item?.videoUrl || "").trim();
};

const remoteOutputHint = (item: any) => {
    return [
        item?.source,
        item?.originalZipUrl,
        item?.outputType,
        item?.type,
        item?.mimeType,
        item?.contentType,
        item?.fileName,
        item?.filename,
        item?.name,
        item?.url,
        item?.fileUrl,
    ].map(value => String(value || "")).filter(Boolean).join(" ");
};

const ensureFileExt = (name: string, ext: string) => {
    const cleanExt = ext.replace(/^\./, "");
    const base = String(name || "output").trim() || "output";
    const suffix = "." + cleanExt;
    if (base.toLowerCase().endsWith(suffix.toLowerCase())) {
        return base;
    }
    return base.replace(/\.[^.]*$/, "") + suffix;
};

const defaultOutputName = (item: OutputItem) => {
    const input = (props.record as any)?.param?.input || {};
    if (input?.source === "ToolSeedanceBatch") {
        const base = String(input.batchSegmentTitle || props.record.title || "").trim();
        const ext = item.type === "video" ? "mp4" : getOutputExt(item.url) || getOutputExt(item.name) || "bin";
        return ensureFileExt(window.$mapi.file.textToName(base || "片段_未命名_01", "", 80), ext);
    }
    return item.type === "video" ? ensureFileExt(item.name || "video", "mp4") : item.name;
};

const outputItems = computed<OutputItem[]>(() => {
    const localFiles = Array.isArray((props.record as any)?.jobResult?.End?.localFiles)
        ? (props.record as any).jobResult.End.localFiles
        : Array.isArray((props.record as any)?.result?.localFiles)
          ? (props.record as any).result.localFiles
          : (props.record as any)?.result?.url
            ? [(props.record as any).result.url]
            : [];
    const remoteResults = Array.isArray((props.record as any)?.jobResult?.Query?.results)
        ? (props.record as any).jobResult.Query.results
        : [];
    const items: OutputItem[] = [];

    localFiles.forEach((file: string, index: number) => {
        if (!file) {
            return;
        }
        const remote = remoteResults[index] || {};
        const remoteUrl = remoteOutputUrl(remote);
        const outputHint = [file, remoteOutputHint(remote), remoteUrl].filter(Boolean).join(" ");
        items.push({
            key: "local-" + index,
            name: remoteUrl ? extractUrlName(remoteUrl) : window.$mapi.file.pathToName(file, true, 48),
            url: file,
            isLocal: true,
            type: getOutputType(file, outputHint),
        });
    });

    if (localFiles.length < remoteResults.length) {
        remoteResults.slice(localFiles.length).forEach((item: any, index: number) => {
            const url = remoteOutputUrl(item);
            const b64 = String(item?.text || "").trim();
            const outputType = String(item?.outputType || "").trim();
            const dataUrl = !url && b64 && outputType === "image_base64" ? `data:image/png;base64,${b64}` : "";
            if (!url && !dataUrl) {
                return;
            }
            items.push({
                key: `remote-${index}`,
                name: url ? extractUrlName(url) : `base64-image-${index + 1}.png`,
                url: url || dataUrl,
                isLocal: false,
                type: getOutputType(url || dataUrl, remoteOutputHint(item)),
            });
        });
    }

    return items;
});

const selectedIdentity = computed(() => {
    return identityRecords.value.find(item => Number(item.id || 0) === Number(clipForm.value.identityId || 0)) || null;
});

watch(
    outputItems,
    items => {
        if (items.length === 0) {
            activePreviewKey.value = "";
            return;
        }
        if (!items.some(item => item.key === activePreviewKey.value)) {
            activePreviewKey.value = items[0].key;
        }
    },
    {
        immediate: true,
    }
);

const activePreviewItem = computed(() => {
    return outputItems.value.find(item => item.key === activePreviewKey.value) || outputItems.value[0] || null;
});

const durationText = computed(() => {
    const start = Number(props.record?.startTime || 0);
    if (!start) {
        return "-";
    }
    const end = Number(props.record?.endTime || props.nowMs || Date.now());
    const seconds = Math.max(1, Math.round((end - start) / 1000));
    return TimeUtil.secondsToTime(seconds);
});

const durationSeconds = computed(() => {
    const start = Number(props.record?.startTime || 0);
    if (!start) {
        return 0;
    }
    const end = Number(props.record?.endTime || props.nowMs || Date.now());
    return Math.max(1, Math.round((end - start) / 1000));
});

const capability = computed(() => {
    if (props.record.biz === "MarketingVideoChainTask") {
        return "video";
    }
    return String((props.record as any)?.modelConfig?.capability || "");
});

const isMarketingChainTask = computed(() => props.record.biz === "MarketingVideoChainTask");

const marketingChainProgress = computed(() => {
    const scenes = Array.isArray((props.record as any)?.jobResult?.scenes)
        ? (props.record as any).jobResult.scenes
        : [];
    const currentIndex = Number((props.record as any)?.jobResult?.currentIndex || 0);
    const total = scenes.length || Number((props.record as any)?.param?.draft?.scenes?.length || 0);
    return {
        current: Math.min(currentIndex, total),
        total,
        scenes,
    };
});

const supportedToolTask = computed(() => {
    const title = String((props.record as any)?.modelConfig?.templateTitle || "").toLowerCase();
    const body = String((props.record as any)?.modelConfig?.requestBodyJson || "").toLowerCase();
    const isCloudTemplateTask = props.record.biz === "RunningHubTask" && !!(props.record as any)?.modelConfig?.templateId;
    return (
        isCloudTemplateTask ||
        props.record.biz === "DirectApiTask" &&
        (title.includes("seedance") || title.includes("gpt image 2") || body.includes("seedance-2.0") || body.includes("kw-video-v2") || body.includes("gpt-image-2"))
    );
});

const isKwjmTask = computed(() => {
    const config = (props.record as any)?.modelConfig || {};
    const body = String(config?.requestBodyJson || "").toLowerCase();
    return config?.providerType === "kwjm" || body.includes("kw-video-v2");
});

const remoteVideoUrl = computed(() => {
    const remoteResults = Array.isArray((props.record as any)?.jobResult?.Query?.results)
        ? (props.record as any).jobResult.Query.results
        : [];
    for (const item of remoteResults) {
        const url = String(item?.url || item?.fileUrl || item?.video_url || item?.videoUrl || "").trim();
        if (!/^https?:\/\//i.test(url)) {
            continue;
        }
        const outputType = String(item?.outputType || item?.type || "").toLowerCase();
        if (outputType.includes("video") || getOutputType(url) === "video") {
            return url;
        }
    }
    return "";
});

const canEraseSubtitle = computed(() => {
    return Boolean(
        props.displayStatus === "success" &&
            isKwjmTask.value &&
            remoteVideoUrl.value
    );
});

const showTaskActions = computed(() => supportedToolTask.value || canEraseSubtitle.value);

const canDeleteTask = computed(() => {
    return props.displayStatus === "success" || props.displayStatus === "fail";
});

const canSaveAsClip = computed(() => {
    return (
        props.displayStatus === "success" &&
        outputItems.value.length > 0 &&
        ["digital-human", "lipsync", "video", "audio"].includes(capability.value)
    );
});

const defaultClipType = computed<DigitalHumanClipType>(() => {
    if (capability.value === "digital-human" || capability.value === "lipsync" || capability.value === "audio") {
        return "talk";
    }
    return "product";
});

const defaultDisplayMode = computed<DigitalHumanDisplayMode>(() => {
    if (capability.value === "digital-human" || capability.value === "lipsync") {
        return "normal";
    }
    return "product-clip";
});

const statusMeta = computed(() => {
    const mapping: Record<DisplayStatus, { label: string; className: string }> = {
        queue: {
            label: "排队中",
            className: "bg-slate-100 text-slate-600",
        },
        running: {
            label: "运行中",
            className: "bg-blue-50 text-blue-600",
        },
        success: {
            label: "已成功",
            className: "bg-emerald-50 text-emerald-600",
        },
        fail: {
            label: "已失败",
            className: "bg-rose-50 text-rose-600",
        },
    };
    return mapping[props.displayStatus] || mapping.queue;
});

const failDetail = computed(() => {
    const parts = [
        String(props.record.statusMsg || "").trim(),
        String((props.record as any)?.jobResult?.Submit?.error || "").trim(),
        String((props.record as any)?.jobResult?.Prepare?.error || "").trim(),
        String((props.record as any)?.jobResult?.Query?.error || "").trim(),
        String((props.record as any)?.jobResult?.End?.error || "").trim(),
    ].filter(Boolean);
    return Array.from(new Set(parts)).join("\n");
});

const downloadOutput = async (item: OutputItem) => {
    if (!item?.url) {
        return;
    }
    try {
        downloadingKey.value = item.key;
        const defaultName = defaultOutputName(item);
        if (/^data:/i.test(item.url)) {
            const link = document.createElement("a");
            link.href = item.url;
            link.download = defaultName || item.name || "output";
            link.click();
            return;
        }
        if (item.isLocal) {
            await doSaveFile(item.url, defaultName);
            return;
        }
        Dialog.loadingOn("正在准备下载...");
        const downloadPath = item.type === "video" ? await window.$mapi.file.temp("mp4", "download") : null;
        const downloaded = await window.$mapi.file.download(item.url, downloadPath);
        Dialog.loadingOff();
        await doSaveFile(downloaded, defaultName);
    } catch (e: any) {
        Dialog.loadingOff();
        Dialog.tipError(String(e?.message || e || "下载失败"));
    } finally {
        downloadingKey.value = "";
    }
};

const buildDefaultClipTitle = () => {
    const base = String(props.record.title || "数字人片段").trim() || "数字人片段";
    const typeLabel = clipTypeOptions.find(item => item.value === clipForm.value.clipType)?.label || "片段";
    return `${base}_${typeLabel}`;
};

const openSaveClip = async () => {
    identityRecords.value = await DigitalHumanIdentityService.list();
    const inputIdentityId = Number((props.record as any)?.param?.input?.identityId || 0);
    const inputIdentityTitle = String((props.record as any)?.param?.input?.identity?.title || "").trim();
    const matchedIdentity =
        identityRecords.value.find(item => Number(item.id || 0) === inputIdentityId) ||
        identityRecords.value.find(item => item.title === inputIdentityTitle) ||
        null;
    clipForm.value = {
        title: "",
        clipType: defaultClipType.value,
        displayMode: defaultDisplayMode.value,
        identityId: Number(matchedIdentity?.id || inputIdentityId || 0),
        productTitle: "",
        productId: "",
        tagsText: "",
    };
    clipForm.value.title = buildDefaultClipTitle();
    clipVisible.value = true;
};

const saveAsClip = async () => {
    if (!activePreviewItem.value?.url) {
        Dialog.tipError("当前没有可保存的结果文件");
        return;
    }
    if (!clipForm.value.title.trim()) {
        Dialog.tipError("请输入片段名称");
        return;
    }
    try {
        savingClip.value = true;
        let title = clipForm.value.title.trim();
        const exists = await DigitalHumanClipService.getByTitle(title);
        if (exists) {
            title = `${title}_${Date.now()}`;
        }
        const clipRecord = createDigitalHumanClipRecordFromTask({
            task: props.record,
            title,
            clipType: clipForm.value.clipType,
            displayMode: clipForm.value.displayMode,
            outputUrl: activePreviewItem.value.url,
            outputType: activePreviewItem.value.type,
            identityId: selectedIdentity.value?.id,
            identityTitle: selectedIdentity.value?.title,
            productId: clipForm.value.productId.trim(),
            productTitle: clipForm.value.productTitle.trim(),
            durationSeconds: durationSeconds.value,
            tags: String(clipForm.value.tagsText || "")
                .split(",")
                .map(item => item.trim())
                .filter(Boolean),
        });
        await DigitalHumanClipService.save(clipRecord);
        clipVisible.value = false;
        Dialog.tipSuccess("已保存为直播片段");
    } catch (e: any) {
        Dialog.tipError(String(e?.message || e || "保存直播片段失败"));
    } finally {
        savingClip.value = false;
    }
};

const kwjmEraseModel = () => {
    const requestBodyJson = String((props.record as any)?.modelConfig?.requestBodyJson || "{}");
    try {
        const body = JSON.parse(requestBodyJson);
        return String(body?.model || "").includes("fast") ? "kw-video-v2-fast" : "kw-video-v2";
    } catch (e) {
        return requestBodyJson.includes("fast") ? "kw-video-v2-fast" : "kw-video-v2";
    }
};

const submitSubtitleErase = async () => {
    const videoUrl = remoteVideoUrl.value;
    if (!videoUrl) {
        Dialog.tipError("当前任务没有可用于字幕擦除的远程视频 URL");
        return;
    }
    const sourceConfig = ((props.record as any)?.modelConfig || {}) as any;
    if (!sourceConfig?.baseUrl || !sourceConfig?.apiKey) {
        Dialog.tipError("原任务缺少 KWJM 平台配置，无法提交字幕擦除");
        return;
    }
    try {
        const body = {
            model: kwjmEraseModel(),
            video_url: videoUrl,
        };
        const record: TaskRecord = {
            biz: "DirectApiTask",
            title: String(props.record.title || "视频").slice(0, 28) + "_字幕擦除_" + new Date().toLocaleString(),
            serverName: "",
            serverTitle: "",
            serverVersion: "",
            modelConfig: {
                capability: "video",
                connectorType: "custom-api",
                providerType: sourceConfig.providerType || "kwjm",
                providerProfileId: sourceConfig.providerProfileId,
                providerProfileTitle: sourceConfig.providerProfileTitle || "KWJM",
                templateTitle: "KWJM 字幕擦除",
                templateType: "custom-api",
                baseUrl: sourceConfig.baseUrl,
                apiKey: sourceConfig.apiKey,
                proxyUrl: sourceConfig.proxyUrl || "",
                submitPath: "/v3/tools/erase-video-subtitle",
                queryPath: "/v3/tools/tasks/{id}",
                requestBodyJson: JSON.stringify(body, null, 2),
                requestFormat: "json",
            },
            param: {
                input: {
                    source: "CloudTaskSidebarItem",
                    sourceTaskId: props.record.id,
                    videoUrl,
                    model: body.model,
                },
            },
        };
        await TaskService.submit(record);
        Dialog.tipSuccess("已提交字幕擦除任务");
    } catch (e: any) {
        Dialog.tipError(String(e?.message || e || "提交字幕擦除失败"));
    }
};
</script>

<template>
    <div class="overflow-hidden rounded-[20px] border border-white/80 bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div class="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
            <div class="text-xs font-medium text-gray-400">任务名称</div>
            <div class="min-w-0 break-all text-[13px] font-medium leading-5 text-gray-900 line-clamp-2">
                {{ record.title || "未命名任务" }}
            </div>

            <div class="text-xs font-medium text-gray-400">当前状态</div>
            <div class="min-w-0">
                <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium" :class="statusMeta.className">
                    {{ statusMeta.label }}
                </span>
                <div v-if="failDetail" class="mt-2 whitespace-pre-wrap break-all rounded-lg bg-rose-50 px-2 py-1.5 text-xs leading-5 text-rose-600">
                    {{ failDetail }}
                </div>
            </div>

            <div class="text-xs font-medium text-gray-400">结果产出物</div>
            <div class="min-w-0 space-y-2">
                <div v-if="isMarketingChainTask" class="rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                    <div class="font-medium">
                        图生视频链路：{{ marketingChainProgress.current }}/{{ marketingChainProgress.total || "-" }} 个分镜已提交视频任务
                    </div>
                    <div v-for="(scene, index) in marketingChainProgress.scenes" :key="scene.sceneId || index" class="mt-1 text-blue-600/80">
                        镜头 {{ index + 1 }}：
                        {{ scene.status || "queue" }}
                        <span v-if="scene.imageTaskId"> · 图 #{{ scene.imageTaskId }}</span>
                        <span v-if="scene.videoTaskId"> · 视频 #{{ scene.videoTaskId }}</span>
                    </div>
                </div>
                <div
                    v-for="item in outputItems"
                    :key="item.key"
                    class="w-full cursor-pointer rounded-xl px-3 py-2 text-xs transition-colors"
                    :class="
                        activePreviewKey === item.key
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                            : 'bg-slate-50 text-gray-600 hover:bg-slate-100'
                    "
                    @click="activePreviewKey = item.key"
                >
                    <div class="truncate" :title="item.name">
                        {{ item.name }}
                    </div>
                </div>
                <div
                    v-if="activePreviewItem"
                    class="max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-2"
                >
                    <ImagePreviewBox
                        v-if="activePreviewItem.type === 'image'"
                        :url="activePreviewItem.url"
                        width="100%"
                        height="10rem"
                        large-width="100%"
                        large-height="60vh"
                    />
                    <div
                        v-else-if="activePreviewItem.type === 'video'"
                        class="h-44 max-w-full overflow-hidden rounded-xl bg-black"
                    >
                        <VideoPlayer :url="activePreviewItem.url" width="100%" height="100%" />
                    </div>
                    <div v-else-if="activePreviewItem.type === 'audio'" class="max-w-full min-w-0 overflow-hidden rounded-xl bg-white p-2">
                        <AudioPlayer :url="activePreviewItem.url" show-wave compact />
                    </div>
                    <div v-else class="rounded-xl bg-white px-3 py-4 text-xs text-gray-500">
                        当前文件类型暂不支持内嵌预览，请直接下载查看
                    </div>
                </div>
                <div v-if="outputItems.length === 0 && !isMarketingChainTask" class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-gray-400">
                    {{ displayStatus === "success" ? "已完成，暂未返回文件" : "等待产出中" }}
                </div>
            </div>

            <div class="text-xs font-medium text-gray-400">下载</div>
            <div class="min-w-0 flex flex-wrap gap-2">
                <a-button
                    v-if="canSaveAsClip"
                    size="mini"
                    type="outline"
                    @click="openSaveClip"
                >
                    保存为直播片段
                </a-button>
                <a-button
                    v-for="item in outputItems"
                    :key="`download-${item.key}`"
                    size="mini"
                    type="outline"
                    :loading="downloadingKey === item.key"
                    @click="downloadOutput(item)"
                >
                    下载
                </a-button>
                <span v-if="outputItems.length === 0" class="text-xs text-gray-300">-</span>
            </div>

            <div v-if="showTaskActions" class="text-xs font-medium text-gray-400">操作</div>
            <div v-if="showTaskActions" class="min-w-0 flex flex-wrap gap-2">
                <a-button v-if="canEraseSubtitle" size="mini" type="outline" @click="submitSubtitleErase">字幕擦除</a-button>
                <a-button v-if="supportedToolTask" size="mini" type="outline" @click="emit('edit-task', record)">重新编辑</a-button>
                <a-button v-if="supportedToolTask" size="mini" type="outline" @click="emit('regenerate-task', record)">再次生成</a-button>
            </div>

            <div v-if="canDeleteTask" class="text-xs font-medium text-gray-400">管理</div>
            <div v-if="canDeleteTask" class="min-w-0 flex flex-wrap gap-2">
                <a-popconfirm
                    content="确认删除这条任务记录？本地保存的产出文件也会一起清理。"
                    @ok="emit('delete-task', record)"
                >
                    <a-button size="mini" status="danger" type="outline">删除记录</a-button>
                </a-popconfirm>
            </div>

            <div class="text-xs font-medium text-gray-400">用时</div>
            <div class="min-w-0 text-sm text-gray-600">{{ durationText }}</div>
        </div>
    </div>

    <a-modal v-model:visible="clipVisible" width="640px" title="保存为直播片段" :mask-closable="false">
        <template #footer>
            <a-button @click="clipVisible = false">取消</a-button>
            <a-button type="primary" :loading="savingClip" @click="saveAsClip">保存</a-button>
        </template>
        <a-form :model="clipForm" layout="vertical">
            <a-form-item label="片段名称" required>
                <a-input v-model="clipForm.title" placeholder="例如：主播小美_商品讲解片" />
            </a-form-item>
            <a-row :gutter="12">
                <a-col :span="12">
                    <a-form-item label="片段类型" required>
                        <a-select v-model="clipForm.clipType">
                            <a-option v-for="item in clipTypeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="展示模式" required>
                        <a-select v-model="clipForm.displayMode">
                            <a-option v-for="item in displayModeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-form-item label="绑定数字人身份">
                <a-select v-model="clipForm.identityId" allow-clear placeholder="可选，推荐绑定一个身份方便后续直播编排">
                    <a-option v-for="item in identityRecords" :key="item.id" :value="item.id || 0">
                        {{ item.title }}
                    </a-option>
                </a-select>
            </a-form-item>
            <a-row :gutter="12">
                <a-col :span="12">
                    <a-form-item label="商品名称">
                        <a-input v-model="clipForm.productTitle" allow-clear placeholder="可选，例如：爆款洗发水" />
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="商品ID">
                        <a-input v-model="clipForm.productId" allow-clear placeholder="可选" />
                    </a-form-item>
                </a-col>
            </a-row>
            <a-form-item label="标签">
                <a-input v-model="clipForm.tagsText" allow-clear placeholder="多个标签用英文逗号分隔" />
            </a-form-item>
            <div class="rounded-xl bg-slate-50 px-3 py-3 text-xs text-gray-500">
                当前保存结果：{{ activePreviewItem?.name || "-" }}，来源任务：{{ record.title || "-" }}
            </div>
        </a-form>
    </a-modal>
</template>
