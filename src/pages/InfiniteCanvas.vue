<script setup lang="ts">
import {Message} from "@arco-design/web-vue";
import {ref} from "vue";
import {DirectApiPlatformService, type DirectApiPlatformRecord} from "../service/DirectApiPlatformService";
import {useModelStore} from "../module/Model/store/model";

const opening = ref(false);
const modelStore = useModelStore();

const IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5"];
const VIDEO_MODELS = ["seedance-2.0", "seedance-2.0-fast"];

const protocolFor = (record: DirectApiPlatformRecord) => `workbench-${record.content.platformType}`;

const modelsFor = (record: DirectApiPlatformRecord) => {
    return [
        ...(record.content.capabilities.includes("gpt-image-2") ? IMAGE_MODELS : []),
        ...(record.content.capabilities.includes("seedance") ? VIDEO_MODELS : []),
    ];
};

const textApiBaseUrl = (value: string) => {
    return String(value || "")
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/chat\/completions$/i, "");
};

const workbenchTextChannels = async () => {
    if (!modelStore.providers.length) {
        await modelStore.init();
    }
    return modelStore.providers.flatMap(provider => {
        if (!provider.data.enabled) return [];
        const models = provider.data.models.filter(model => model.enabled && model.types.includes("text")).map(model => model.id);
        const baseUrl = textApiBaseUrl(provider.data.apiHost || provider.apiUrl);
        const apiKey = String(provider.data.apiKey || "").trim();
        if (!models.length || !baseUrl || !apiKey) return [];
        return [{
            id: `workbench-text-${provider.id}`,
            name: `${provider.title || provider.id}（文本）`,
            baseUrl,
            apiKey,
            models,
            protocol: "",
        }];
    });
};

const workbenchModelConfig = async () => {
    const [imageDraft, videoDraft, textChannels] = await Promise.all([
        window.$mapi.storage.get("pageDraft", "ToolGptImage2", null),
        window.$mapi.storage.get("pageDraft", "ToolSeedance", null),
        workbenchTextChannels(),
    ]);
    const records = (await DirectApiPlatformService.list())
        .filter(record => record.content.baseUrl && record.content.apiKey)
        .sort((a, b) => Number(b.content.isDefault) - Number(a.content.isDefault));
    const mediaChannels = records.map((record, index) => ({
        id: `workbench-${record.id || index}`,
        name: record.title || "工作台直连 API",
        baseUrl: record.content.baseUrl,
        apiKey: record.content.apiKey,
        models: modelsFor(record),
        protocol: protocolFor(record),
    }));
    const channels = [...textChannels, ...mediaChannels];
    const models = Array.from(new Set(channels.flatMap(channel => channel.models)));
    const textModel = textChannels.flatMap(channel => channel.models)[0] || "";
    const imageModel = models.find(model => IMAGE_MODELS.includes(model)) || "";
    const videoModel = models.find(model => VIDEO_MODELS.includes(model)) || "";
    const firstChannelId = channels[0]?.id || "";
    const firstMediaChannelId = mediaChannels[0]?.id || "";
    const preferredImageChannelId = imageDraft?.platformId ? `workbench-${imageDraft.platformId}` : "";
    const preferredVideoChannelId = videoDraft?.platformId ? `workbench-${videoDraft.platformId}` : "";
    const imageChannelId = mediaChannels.find(channel => channel.id === preferredImageChannelId && channel.models.some(model => IMAGE_MODELS.includes(model)))?.id
        || mediaChannels.find(channel => channel.models.some(model => IMAGE_MODELS.includes(model)))?.id
        || firstMediaChannelId;
    const videoChannelId = mediaChannels.find(channel => channel.id === preferredVideoChannelId && channel.models.some(model => VIDEO_MODELS.includes(model)))?.id
        || mediaChannels.find(channel => channel.models.some(model => VIDEO_MODELS.includes(model)))?.id
        || firstMediaChannelId;
    const textChannelId = textChannels[0]?.id || "";
    return {
        channelMode: "local",
        localChannels: channels,
        models,
        imageModels: models.filter(model => IMAGE_MODELS.includes(model)),
        videoModels: models.filter(model => VIDEO_MODELS.includes(model)),
        textModels: textChannels.flatMap(channel => channel.models),
        model: textModel || imageModel || videoModel,
        imageModel,
        videoModel,
        textModel,
        baseUrl: channels[0]?.baseUrl || "",
        apiKey: channels[0]?.apiKey || "",
        activeChannelId: firstChannelId,
        imageChannelId,
        videoChannelId,
        textChannelId,
    };
};

const openCanvas = async () => {
    if (opening.value) return;
    opening.value = true;
    try {
        const modelConfig = await workbenchModelConfig();
        if (!modelConfig.textModel) {
            Message.warning("未检测到已启用的文本模型；可使用画布，但剧本与分镜 Agent 需要先在工作台“模型”中启用文本模型");
        }
        await window.$mapi.infiniteCanvas.configure({mode: "bundled"});
        await window.$mapi.infiniteCanvas.open({modelConfig});
    } catch (error) {
        Message.error((error as Error)?.message || String(error));
    } finally {
        opening.value = false;
    }
};
</script>

<template>
    <div class="flex h-full items-center justify-center bg-gray-50">
        <a-button type="primary" size="large" :loading="opening" @click="openCanvas">
            <template #icon><icon-apps /></template>
            打开画布
        </a-button>
    </div>
</template>
