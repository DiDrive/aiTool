<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AudioPlayer from "../common/AudioPlayer.vue";
import ImagePreviewBox from "../common/ImagePreviewBox.vue";
import VideoPlayer from "../common/VideoPlayer.vue";
import { Dialog } from "../../lib/dialog";
import { FileUtil } from "../../lib/file";
import { TimeUtil } from "../../lib/util";
import { TaskRecord } from "../../service/TaskService";
import { doSaveFile } from "../common/util";

type DisplayStatus = "queue" | "running" | "success" | "fail";

const props = defineProps<{
    record: TaskRecord;
    displayStatus: DisplayStatus;
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

const getOutputExt = (url: string) => {
    try {
        return FileUtil.getExt(new URL(url).pathname);
    } catch (e) {
        return FileUtil.getExt(url);
    }
};

const getOutputType = (url: string) => {
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

const outputItems = computed<OutputItem[]>(() => {
    const localFiles = Array.isArray((props.record as any)?.jobResult?.End?.localFiles)
        ? (props.record as any).jobResult.End.localFiles
        : [];
    const remoteResults = Array.isArray((props.record as any)?.jobResult?.Query?.results)
        ? (props.record as any).jobResult.Query.results
        : [];
    const items: OutputItem[] = [];

    localFiles.forEach((file: string, index: number) => {
        if (!file) {
            return;
        }
        items.push({
            key: `local-${index}`,
            name: window.$mapi.file.pathToName(file, true, 48),
            url: file,
            isLocal: true,
            type: getOutputType(file),
        });
    });

    if (localFiles.length < remoteResults.length) {
        remoteResults.slice(localFiles.length).forEach((item: any, index: number) => {
            const url = String(item?.url || item?.fileUrl || "").trim();
            if (!url) {
                return;
            }
            items.push({
                key: `remote-${index}`,
                name: extractUrlName(url),
                url,
                isLocal: false,
                type: getOutputType(url),
            });
        });
    }

    return items;
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
    const end = Number(props.record?.endTime || Date.now());
    const seconds = Math.max(1, Math.round((end - start) / 1000));
    return TimeUtil.secondsToTime(seconds);
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

const downloadOutput = async (item: OutputItem) => {
    if (!item?.url) {
        return;
    }
    try {
        downloadingKey.value = item.key;
        if (item.isLocal) {
            await doSaveFile(item.url);
            return;
        }
        Dialog.loadingOn("正在准备下载...");
        const downloaded = await window.$mapi.file.download(item.url);
        Dialog.loadingOff();
        await doSaveFile(downloaded);
    } catch (e: any) {
        Dialog.loadingOff();
        Dialog.tipError(String(e?.message || e || "下载失败"));
    } finally {
        downloadingKey.value = "";
    }
};
</script>

<template>
    <div class="rounded-[20px] border border-white/80 bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div class="grid grid-cols-[72px_1fr] gap-x-3 gap-y-3 text-sm">
            <div class="text-xs font-medium text-gray-400">任务名称</div>
            <div class="truncate font-medium text-gray-900">{{ record.title || "未命名任务" }}</div>

            <div class="text-xs font-medium text-gray-400">当前状态</div>
            <div>
                <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium" :class="statusMeta.className">
                    {{ statusMeta.label }}
                </span>
            </div>

            <div class="text-xs font-medium text-gray-400">结果产出物</div>
            <div class="space-y-2">
                <div
                    v-for="item in outputItems"
                    :key="item.key"
                    class="cursor-pointer rounded-xl px-3 py-2 text-xs transition-colors"
                    :class="
                        activePreviewKey === item.key
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                            : 'bg-slate-50 text-gray-600 hover:bg-slate-100'
                    "
                    @click="activePreviewKey = item.key"
                >
                    {{ item.name }}
                </div>
                <div
                    v-if="activePreviewItem"
                    class="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-2"
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
                        class="h-44 overflow-hidden rounded-xl bg-black"
                    >
                        <VideoPlayer :url="activePreviewItem.url" width="100%" height="100%" />
                    </div>
                    <div v-else-if="activePreviewItem.type === 'audio'" class="rounded-xl bg-white p-2">
                        <AudioPlayer :url="activePreviewItem.url" show-wave />
                    </div>
                    <div v-else class="rounded-xl bg-white px-3 py-4 text-xs text-gray-500">
                        当前文件类型暂不支持内嵌预览，请直接下载查看
                    </div>
                </div>
                <div v-if="outputItems.length === 0" class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-gray-400">
                    {{ displayStatus === "success" ? "已完成，暂未返回文件" : "等待产出中" }}
                </div>
            </div>

            <div class="text-xs font-medium text-gray-400">下载</div>
            <div class="flex flex-wrap gap-2">
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

            <div class="text-xs font-medium text-gray-400">用时</div>
            <div class="text-sm text-gray-600">{{ durationText }}</div>
        </div>
    </div>
</template>
