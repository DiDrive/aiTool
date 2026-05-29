<script setup lang="ts">
import { computed, ref } from "vue";
import { dataAutoSaveDraft } from "../../../../components/common/util";
import { Dialog } from "../../../../lib/dialog";
import { TaskRecord, TaskService } from "../../../../service/TaskService";
import {
    RunningHubCapability,
    RunningHubConnectorType,
    RunningHubModelConfigType,
} from "../type";

const emit = defineEmits<{
    submitted: [];
}>();

const capabilityOptions: Array<{ value: RunningHubCapability; title: string; description: string }> = [
    { value: "image", title: "生图", description: "适合接 RunningHub 的 AI App 或 ComfyUI 文生图/图生图工作流" },
    { value: "video", title: "生视频", description: "默认给出标准模型文生视频接口，也可切到 AI App/工作流" },
    { value: "lipsync", title: "对口型", description: "默认给出可灵对口型视频接口，提交后按 taskId 轮询" },
    { value: "audio", title: "生音频", description: "默认给出 MiniMax TTS 接口，也支持切换其它模型路径" },
    { value: "voice-clone", title: "克隆音色", description: "默认给出 MiniMax voice clone 接口，样本音频建议使用公网 URL" },
    { value: "digital-human", title: "普通数字人", description: "推荐用 AI App/工作流预生成视频，成功后可直接存成直播数字人模板" },
];

const connectorOptions: Array<{ value: RunningHubConnectorType; title: string }> = [
    { value: "ai-app", title: "AI 应用" },
    { value: "workflow", title: "ComfyUI 工作流" },
    { value: "model-api", title: "标准模型 API" },
];

const formData = ref<RunningHubModelConfigType>({
    capability: "image",
    connectorType: "ai-app",
    baseUrl: "https://www.runninghub.cn",
    apiKey: "",
    submitPath: "",
    queryPath: "openapi/v2/query",
    cancelPath: "",
    webappId: "",
    workflowId: "",
    nodeInfoListJson: "[]",
    requestBodyJson: "{}",
    webhookUrl: "",
    instanceType: "",
    accessPassword: "",
    addMetadata: true,
    retainSeconds: null,
    usePersonalQueue: false,
    workflowJson: "",
    saveAsVideoTemplate: false,
});

const { clearDraft } = dataAutoSaveDraft("RunningHubStudioCreate.formData", formData.value);

const selectedCapability = computed(() => {
    return capabilityOptions.find(item => item.value === formData.value.capability);
});

const applyPreset = (capability: RunningHubCapability) => {
    formData.value.capability = capability;
    if (capability === "image") {
        formData.value.connectorType = "ai-app";
        formData.value.submitPath = "";
        formData.value.queryPath = "openapi/v2/query";
        formData.value.requestBodyJson = "{}";
        formData.value.nodeInfoListJson = JSON.stringify([
            { nodeId: "122", fieldName: "prompt", fieldValue: "一个在教室里的金发女孩，电影感，高清细节" },
        ], null, 2);
    } else if (capability === "video") {
        formData.value.connectorType = "model-api";
        formData.value.submitPath = "openapi/v2/rhart-video-v3.1-pro-official/text-to-video";
        formData.value.queryPath = "openapi/v2/query";
        formData.value.requestBodyJson = JSON.stringify({
            prompt: "一个年轻女生在直播间自然微笑并做简短自我介绍，镜头稳定，真实感，竖屏",
            aspectRatio: "9:16",
            duration: "8",
            resolution: "720p",
            generateAudio: false,
        }, null, 2);
        formData.value.nodeInfoListJson = "[]";
    } else if (capability === "lipsync") {
        formData.value.connectorType = "model-api";
        formData.value.submitPath = "openapi/v2/kling-lip-sync/lip-sync-video";
        formData.value.queryPath = "openapi/v2/query";
        formData.value.requestBodyJson = JSON.stringify({
            sessionId: "",
            faceId: "0",
            audioId: "",
            soundStartTime: 0,
            soundEndTime: 5000,
            soundInsertTime: 0,
            soundVolume: 1,
            originalAudioVolume: 1,
        }, null, 2);
        formData.value.nodeInfoListJson = "[]";
    } else if (capability === "audio") {
        formData.value.connectorType = "model-api";
        formData.value.submitPath = "openapi/v2/rhart-audio/text-to-audio/speech-2.8-turbo";
        formData.value.queryPath = "openapi/v2/query";
        formData.value.requestBodyJson = JSON.stringify({
            text: "欢迎来到直播间，我先给大家简单介绍一下今天的产品。",
            voice_id: "Elegant_Man",
            speed: 1,
            volume: 1,
            pitch: 0,
            emotion: "happy",
            enable_base64_output: false,
            english_normalization: false,
        }, null, 2);
        formData.value.nodeInfoListJson = "[]";
    } else if (capability === "voice-clone") {
        formData.value.connectorType = "model-api";
        formData.value.submitPath = "openapi/v2/rhart-audio/text-to-audio/voice-clone";
        formData.value.queryPath = "openapi/v2/query";
        formData.value.requestBodyJson = JSON.stringify({
            audio: "https://example.com/voice-sample.wav",
            custom_voice_id: `RH${Date.now()}`,
            text: "你好，这是一段音色克隆后的试听文案。",
            accuracy: 0.7,
            need_noise_reduction: false,
            need_volume_normalization: false,
            model: "speech-02-hd",
            language_boost: "Chinese",
        }, null, 2);
        formData.value.nodeInfoListJson = "[]";
    } else if (capability === "digital-human") {
        formData.value.connectorType = "ai-app";
        formData.value.submitPath = "";
        formData.value.queryPath = "openapi/v2/query";
        formData.value.nodeInfoListJson = JSON.stringify([
            { nodeId: "1", fieldName: "prompt", fieldValue: "生成一个面向镜头讲话的普通数字人短视频，表情自然，适合直播间循环播放" },
            { nodeId: "2", fieldName: "audio", fieldValue: "D:\\素材\\voice.wav" },
            { nodeId: "3", fieldName: "image", fieldValue: "D:\\素材\\avatar.png" },
        ], null, 2);
        formData.value.requestBodyJson = "{}";
        formData.value.saveAsVideoTemplate = true;
    }
};

const doSubmit = async () => {
    if (!String(formData.value.apiKey || "").trim()) {
        Dialog.tipError("请输入 RunningHub API Key");
        return;
    }
    if (formData.value.connectorType === "ai-app" && !String(formData.value.webappId || "").trim()) {
        Dialog.tipError("AI 应用模式需要填写 WebApp ID");
        return;
    }
    if (
        formData.value.connectorType === "workflow" &&
        !String(formData.value.workflowId || "").trim() &&
        !String(formData.value.workflowJson || "").trim()
    ) {
        Dialog.tipError("工作流模式需要填写 Workflow ID 或 Workflow JSON");
        return;
    }
    if (formData.value.connectorType === "model-api" && !String(formData.value.submitPath || "").trim()) {
        Dialog.tipError("标准模型 API 模式需要填写提交路径");
        return;
    }
    const title = `${selectedCapability.value?.title || "RunningHub"} ${new Date().toLocaleString()}`;
    const record: TaskRecord = {
        biz: "RunningHubTask",
        title,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig: {
            ...formData.value,
        },
        param: {},
    };
    await TaskService.submit(record);
    Dialog.tipSuccess("RunningHub 任务已提交");
    emit("submitted");
};
</script>

<template>
    <div class="rounded-xl shadow border p-4">
        <div class="flex items-center gap-2 mb-4">
            <a-button
                v-for="item in capabilityOptions"
                :key="item.value"
                size="small"
                :type="formData.capability === item.value ? 'primary' : 'outline'"
                @click="applyPreset(item.value)"
            >
                {{ item.title }}
            </a-button>
        </div>

        <a-alert class="mb-4">
            <div class="font-bold">{{ selectedCapability?.title }}</div>
            <div>{{ selectedCapability?.description }}</div>
            <div class="mt-1 text-gray-500">
                `AI 应用/工作流` 模式下，`nodeInfoList.fieldValue` 填本地绝对路径会自动上传并替换；`标准模型 API` 模式建议填写可公网访问的素材 URL 或模型返回的 `audioId`。
            </div>
        </a-alert>

        <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
                <div class="font-bold mb-2">Base URL</div>
                <a-input v-model="formData.baseUrl" />
            </div>
            <div>
                <div class="font-bold mb-2">API Key</div>
                <a-input-password v-model="formData.apiKey" />
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
                <div class="font-bold mb-2">接入方式</div>
                <a-select v-model="formData.connectorType">
                    <a-option v-for="item in connectorOptions" :key="item.value" :value="item.value">
                        {{ item.title }}
                    </a-option>
                </a-select>
            </div>
            <div>
                <div class="font-bold mb-2">实例类型</div>
                <a-input v-model="formData.instanceType" placeholder="default / plus" />
            </div>
        </div>

        <div v-if="formData.connectorType === 'ai-app'" class="grid grid-cols-2 gap-4 mb-4">
            <div>
                <div class="font-bold mb-2">WebApp ID</div>
                <a-input v-model="formData.webappId" />
            </div>
            <div>
                <div class="font-bold mb-2">访问密码</div>
                <a-input v-model="formData.accessPassword" placeholder="可选" />
            </div>
        </div>

        <div v-if="formData.connectorType === 'workflow'" class="grid grid-cols-2 gap-4 mb-4">
            <div>
                <div class="font-bold mb-2">Workflow ID</div>
                <a-input v-model="formData.workflowId" />
            </div>
            <div>
                <div class="font-bold mb-2">访问密码</div>
                <a-input v-model="formData.accessPassword" placeholder="可选" />
            </div>
            <div>
                <div class="font-bold mb-2">保留实例秒数</div>
                <a-input-number v-model="formData.retainSeconds" :min="10" :max="180" />
            </div>
            <div class="flex items-end gap-4">
                <a-checkbox v-model="formData.addMetadata">写入元数据</a-checkbox>
                <a-checkbox v-model="formData.usePersonalQueue">个人排队</a-checkbox>
            </div>
        </div>

        <div v-if="formData.connectorType === 'model-api'" class="grid grid-cols-2 gap-4 mb-4">
            <div>
                <div class="font-bold mb-2">提交路径</div>
                <a-input v-model="formData.submitPath" />
            </div>
            <div>
                <div class="font-bold mb-2">查询路径</div>
                <a-input v-model="formData.queryPath" />
            </div>
            <div>
                <div class="font-bold mb-2">取消路径</div>
                <a-input v-model="formData.cancelPath" placeholder="可选" />
            </div>
        </div>

        <div class="mb-4">
            <div class="font-bold mb-2">Webhook URL</div>
            <a-input v-model="formData.webhookUrl" placeholder="可选" />
        </div>

        <div v-if="formData.connectorType !== 'model-api'" class="mb-4">
            <div class="font-bold mb-2">nodeInfoList JSON</div>
            <a-textarea v-model="formData.nodeInfoListJson" :auto-size="{ minRows: 8, maxRows: 18 }" />
        </div>

        <div v-if="formData.connectorType === 'workflow'" class="mb-4">
            <div class="font-bold mb-2">自定义 Workflow JSON</div>
            <a-textarea v-model="formData.workflowJson" placeholder="可选，填写后会覆盖 workflowId" :auto-size="{ minRows: 4, maxRows: 12 }" />
        </div>

        <div v-if="formData.connectorType === 'model-api'" class="mb-4">
            <div class="font-bold mb-2">请求体 JSON</div>
            <a-textarea v-model="formData.requestBodyJson" :auto-size="{ minRows: 8, maxRows: 18 }" />
        </div>

        <div class="mb-4" v-if="['video', 'lipsync', 'digital-human'].includes(formData.capability)">
            <a-checkbox v-model="formData.saveAsVideoTemplate">
                任务成功后自动写入数字人模板，方便直播页直接复用
            </a-checkbox>
        </div>

        <div class="flex gap-2">
            <a-button type="primary" @click="doSubmit">提交 RunningHub 任务</a-button>
            <a-button @click="clearDraft()">清空草稿</a-button>
        </div>
    </div>
</template>
