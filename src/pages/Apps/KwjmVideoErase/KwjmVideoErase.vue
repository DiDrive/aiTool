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
const videoUrl = ref("");
const submitting = ref(false);

const pageDraft = usePageDraft("KwjmVideoErase", {
    platformId,
    model,
    videoUrl,
});

const modelOptions = ["seedance-2.0-fast", "seedance-2.0"];

const currentPlatform = computed(() => {
    return platforms.value.find(item => item.id === platformId.value) || null;
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
        filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return;
    }
    videoUrl.value = filePath;
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
    if (!videoUrl.value.trim()) {
        Dialog.tipError("请上传本地视频或填写视频 URL");
        return;
    }
    const relay = await FileRelayConfigService.getPan123Relay();
    const isLocalVideo = /^[a-zA-Z]:[\\/]/.test(videoUrl.value.trim()) || /^file:\/\//i.test(videoUrl.value.trim());
    if (isLocalVideo && !relay) {
        Dialog.tipError("本地视频需要先配置全局 123 云盘中转，字幕擦除接口只接受公网原始视频 URL");
        return;
    }
    try {
        submitting.value = true;
        const body = {
            model: platformModel(),
            video_url: videoUrl.value.trim(),
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
            directFileRelay: relay ? { ...relay, assetMode: false } : undefined,
            submitPath: "/v3/tools/erase-video-subtitle",
            queryPath: "/v3/tools/tasks/{id}",
            requestBodyJson: JSON.stringify(body, null, 2),
            requestFormat: "json",
        };
        const record: TaskRecord = {
            biz: "DirectApiTask",
            title: `${shortTaskText(videoUrl.value)}_字幕擦除_${new Date().toLocaleString()}`,
            serverName: "",
            serverTitle: "",
            serverVersion: "",
            modelConfig,
            param: {
                input: {
                    source: "KwjmVideoErase",
                    videoUrl: videoUrl.value,
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
                <a-form-item label="视频 URL / 本地视频">
                    <div class="flex gap-2">
                        <a-input v-model="videoUrl" allow-clear placeholder="粘贴视频 URL 或上传本地视频" />
                        <a-button @click="pickVideo">上传视频</a-button>
                    </div>
                </a-form-item>
            </div>
        </div>
    </div>
</template>
