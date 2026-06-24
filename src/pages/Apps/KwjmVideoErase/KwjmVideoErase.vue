<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Dialog } from "../../../lib/dialog";
import {
    DirectApiPlatformRecord,
    DirectApiPlatformService,
} from "../../../service/DirectApiPlatformService";
import { FileRelayConfigService } from "../../../service/FileRelayConfigService";
import { TaskRecord, TaskService } from "../../../service/TaskService";
import { RunningHubModelConfigType } from "../RunningHubStudio/type";
import { usePageDraft } from "../../../hooks/pageDraft";

const platforms = ref<DirectApiPlatformRecord[]>([]);
const platformId = ref(0);
const model = ref("seedance-2.0-fast");
const videoPath = ref("");
const submitting = ref(false);

const pageDraft = usePageDraft("KwjmVideoErase", {
    platformId,
    model,
    videoPath,
});

const modelOptions = ["seedance-2.0-fast", "seedance-2.0"];

const currentPlatform = computed(() => {
    return platforms.value.find(item => item.id === platformId.value) || null;
});

const videoFileName = computed(() => {
    return videoPath.value.replace(/\\/g, "/").split("/").pop() || "";
});

const videoPreviewUrl = computed(() => {
    const value = videoPath.value.trim();
    if (/^[a-zA-Z]:[\\/]/.test(value)) {
        return "file:///" + value.replace(/\\/g, "/");
    }
    return value;
});

const platformModel = () => {
    return model.value.includes("fast") ? "kw-video-v2-fast" : "kw-video-v2";
};

const loadPlatforms = async () => {
    platforms.value = (await DirectApiPlatformService.listByCapability("seedance"))
        .filter(item => item.content.platformType === "kwjm");
    const defaultPlatform = await DirectApiPlatformService.getDefault("seedance");
    const defaultKwjm = defaultPlatform?.content.platformType === "kwjm" ? defaultPlatform : platforms.value[0] || null;
    platformId.value = platforms.value.some(item => item.id === platformId.value)
        ? platformId.value
        : defaultKwjm?.id || 0;
};

const shortTaskText = (value: string, fallback = "字幕擦除") => {
    const text = String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .trim();
    return (text || fallback).slice(0, 28);
};

const pickVideo = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v", "mkv"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return;
    }
    videoPath.value = filePath;
};

const clearVideo = () => {
    videoPath.value = "";
};

const isLocalVideoPath = (value: string) => {
    const text = value.trim();
    return /^[a-zA-Z]:[\\/]/.test(text) || /^file:\/\//i.test(text);
};

const getEraseFileRelay = async (platform: DirectApiPlatformRecord) => {
    const platformRelay = platform.content.directFileRelay;
    if (
        platformRelay?.enabled &&
        platformRelay.provider === "123pan" &&
        String(platformRelay.clientID || "").trim() &&
        String(platformRelay.clientSecret || "").trim() &&
        String(platformRelay.parentFileID || "").trim()
    ) {
        return platformRelay;
    }
    return await FileRelayConfigService.getPan123Relay();
};

const submit = async () => {
    const platform = currentPlatform.value;
    if (!platform) {
        Dialog.tipError("请先在模型平台里配置 KWJM");
        return;
    }
    if (!platform.content.apiKey.trim()) {
        Dialog.tipError("当前 KWJM 平台未配置 API Key");
        return;
    }
    if (!videoPath.value.trim()) {
        Dialog.tipError("请先上传本地视频");
        return;
    }
    if (!isLocalVideoPath(videoPath.value)) {
        Dialog.tipError("字幕擦除只支持上传本地视频，请重新选择本地文件");
        return;
    }
    const relay = await getEraseFileRelay(platform);
    if (!relay) {
        Dialog.tipError("本地视频需要先配置 123 云盘中转，并开启平台素材入库");
        return;
    }
    try {
        submitting.value = true;
        const body = {
            model: platformModel(),
            video_url: videoPath.value.trim(),
        };
        const modelConfig: RunningHubModelConfigType = {
            capability: "video",
            connectorType: "custom-api",
            providerType: platform.content.platformType,
            providerProfileId: platform.id,
            providerProfileTitle: platform.title,
            templateTitle: "KWJM 字幕擦除",
            templateType: "custom-api",
            baseUrl: platform.content.baseUrl,
            apiKey: platform.content.apiKey,
            proxyUrl: platform.content.proxyUrl || "",
            directFileRelay: { ...relay, assetMode: true },
            submitPath: "/v3/tools/erase-video-subtitle",
            queryPath: "/v3/tools/tasks/{id}",
            requestBodyJson: JSON.stringify(body, null, 2),
            requestFormat: "json",
        };
        const record: TaskRecord = {
            biz: "DirectApiTask",
            title: `${shortTaskText(videoPath.value)}_字幕擦除_${new Date().toLocaleString()}`,
            serverName: "",
            serverTitle: "",
            serverVersion: "",
            modelConfig,
            param: {
                input: {
                    source: "KwjmVideoErase",
                    videoPath: videoPath.value,
                    model: model.value,
                },
            },
        };
        await TaskService.submit(record);
        Dialog.tipSuccess("字幕擦除任务已提交");
    } catch (e: any) {
        Dialog.tipError(String(e?.message || e || "提交失败"));
    } finally {
        submitting.value = false;
    }
};

onMounted(async () => {
    await pageDraft.restore();
    if (videoPath.value.trim() && !isLocalVideoPath(videoPath.value)) {
        videoPath.value = "";
    }
    await loadPlatforms();
});
</script>

<template>
    <div class="h-full overflow-y-auto bg-[#f6f7f9] px-8 py-8">
        <div class="mx-auto max-w-4xl">
            <div class="mb-6 flex items-center justify-between">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900">字幕擦除</h1>
                    <div class="mt-2 text-sm text-gray-500">使用 KWJM kw-video-erase 去除视频字幕，适合先清理参考素材再二次生成。</div>
                </div>
                <a-button type="primary" :loading="submitting" @click="submit">提交擦除</a-button>
            </div>

            <div class="rounded-2xl bg-white p-5 shadow-sm">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <a-form-item label="KWJM 平台">
                        <a-select v-model="platformId" placeholder="请选择 KWJM 平台">
                            <a-option v-for="item in platforms" :key="item.id" :value="item.id || 0">
                                {{ item.title }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                    <a-form-item label="模型">
                        <a-select v-model="model">
                            <a-option v-for="item in modelOptions" :key="item" :value="item">{{ item }}</a-option>
                        </a-select>
                    </a-form-item>
                </div>
                <a-form-item label="本地视频">
                    <div class="flex flex-wrap items-center gap-3">
                        <a-popover v-if="videoPath" trigger="hover" position="right">
                            <div class="flex max-w-[360px] cursor-default items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                                <video :src="videoPreviewUrl" class="h-14 w-24 rounded bg-black object-cover" muted />
                                <div class="min-w-0">
                                    <div class="truncate text-sm font-medium text-gray-800">{{ videoFileName }}</div>
                                    <div class="mt-1 text-xs text-gray-400">悬浮预览</div>
                                </div>
                            </div>
                            <template #content>
                                <div class="w-80">
                                    <video :src="videoPreviewUrl" class="max-h-56 w-full rounded bg-black" controls />
                                    <div class="mt-2 truncate text-xs text-gray-500">{{ videoFileName }}</div>
                                </div>
                            </template>
                        </a-popover>
                        <div v-else class="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-400">
                            未选择视频
                        </div>
                        <a-button @click="pickVideo">{{ videoPath ? "替换视频" : "上传视频" }}</a-button>
                        <a-button v-if="videoPath" @click="clearVideo">清空</a-button>
                    </div>
                </a-form-item>
            </div>
        </div>
    </div>
</template>
