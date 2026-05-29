<script setup lang="ts">
import { computed } from "vue";
import TaskDeleteAction from "../../../../components/Server/TaskDeleteAction.vue";
import TaskDownloadAction from "../../../../components/Server/TaskDownloadAction.vue";
import TaskDuration from "../../../../components/Server/TaskDuration.vue";
import TaskTitleField from "../../../../components/Server/TaskTitleField.vue";
import AudioPlayer from "../../../../components/common/AudioPlayer.vue";
import ImagePreviewBox from "../../../../components/common/ImagePreviewBox.vue";
import TaskBizStatus from "../../../../components/common/TaskBizStatus.vue";
import VideoPlayer from "../../../../components/common/VideoPlayer.vue";
import { Dialog } from "../../../../lib/dialog";
import { FileUtil } from "../../../../lib/file";
import { ffmpegVideoNormal } from "../../../../lib/ffmpeg";
import { ffprobeVideoInfo } from "../../../../lib/ffprobe";
import { TaskRecord } from "../../../../service/TaskService";
import { VideoTemplateService } from "../../../../service/VideoTemplateService";
import { RunningHubJobResultType, RunningHubModelConfigType } from "../type";

const props = defineProps<{
    record: TaskRecord<RunningHubModelConfigType, RunningHubJobResultType>;
    onRefresh: () => void;
}>();

const primaryFile = computed(() => {
    return String(props.record?.result?.url || "");
});

const primaryExt = computed(() => {
    return FileUtil.getExt(primaryFile.value || "");
});

const isImage = computed(() => {
    return ["png", "jpg", "jpeg", "webp", "gif"].includes(primaryExt.value);
});

const isAudio = computed(() => {
    return ["mp3", "wav", "m4a", "flac"].includes(primaryExt.value);
});

const isVideo = computed(() => {
    return ["mp4", "mov", "avi", "mkv", "webm"].includes(primaryExt.value);
});

const capabilityText = computed(() => {
    const mapping: Record<string, string> = {
        image: "生图",
        video: "生视频",
        lipsync: "对口型",
        audio: "生音频",
        "voice-clone": "克隆音色",
        "digital-human": "普通数字人",
    };
    return mapping[props.record.modelConfig?.capability || ""] || "RunningHub";
});

const connectorText = computed(() => {
    const mapping: Record<string, string> = {
        "ai-app": "AI 应用",
        workflow: "ComfyUI 工作流",
        "model-api": "标准模型 API",
    };
    return mapping[props.record.modelConfig?.connectorType || ""] || "";
});

const providerText = computed(() => {
    return String(
        props.record.modelConfig?.providerProfileTitle ||
            props.record.modelConfig?.providerType ||
            ""
    ).trim();
});

const templateText = computed(() => {
    return String(props.record.modelConfig?.templateTitle || "").trim();
});

const stepText = computed(() => {
    const mapping: Record<string, string> = {
        Prepare: "准备参数",
        UploadAssets: "上传素材",
        Submit: "提交任务",
        Query: "轮询结果",
        End: "收尾完成",
    };
    return mapping[String(props.record.jobResult?.step || "")] || "-";
});

const stepStatusList = computed(() => {
    const jobResult = props.record.jobResult;
    return [
        { label: "准备参数", status: jobResult?.Prepare?.status, error: jobResult?.Prepare?.error },
        { label: "上传素材", status: jobResult?.UploadAssets?.status, error: jobResult?.UploadAssets?.error },
        { label: "提交任务", status: jobResult?.Submit?.status, error: jobResult?.Submit?.error },
        { label: "轮询结果", status: jobResult?.Query?.status, error: jobResult?.Query?.error },
        { label: "收尾完成", status: jobResult?.End?.status, error: jobResult?.End?.error },
    ].filter(item => !!item.status);
});

const doSaveAsTemplate = async () => {
    if (!primaryFile.value || !isVideo.value) {
        return;
    }
    try {
        Dialog.loadingOn("正在写入数字人模板");
        const normalPath = await ffmpegVideoNormal(primaryFile.value, {
            durationMax: 120,
        });
        const videoInfo = await ffprobeVideoInfo(normalPath);
        const savedPath = await window.$mapi.file.hubSave(normalPath);
        let templateName = String(props.record.title || "RunningHub数字人").trim() || "RunningHub数字人";
        const exists = await VideoTemplateService.getByName(templateName);
        if (exists) {
            templateName = `${templateName}-${props.record.id}`;
        }
        await VideoTemplateService.insert({
            name: templateName,
            video: savedPath,
            info: videoInfo,
        });
        Dialog.tipSuccess("已写入数字人模板");
    } catch (e: any) {
        Dialog.tipError(e?.message || String(e || "写入数字人模板失败"));
    } finally {
        Dialog.loadingOff();
    }
};
</script>

<template>
    <div class="rounded-[22px] border border-white/80 bg-white p-4 shadow-sm">
        <div class="flex items-start gap-2">
            <div class="inline-flex items-start bg-blue-50 rounded-full px-3 leading-8 h-8 mr-1 text-blue-700">
                <TaskTitleField :record="record" @update="v => (record.title = v)" />
            </div>
            <div class="flex flex-wrap gap-2 pt-1">
                <div class="text-[11px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{{ capabilityText }}</div>
                <div class="text-[11px] rounded-full bg-gray-50 px-2 py-0.5 text-gray-500">{{ connectorText }}</div>
            </div>
            <div class="flex-grow"></div>
            <TaskDuration :start="record.startTime" :end="record.endTime" />
            <TaskBizStatus :status="record.status" :status-msg="record.statusMsg" />
        </div>

        <div class="mt-3 rounded-2xl bg-[#f8f9fc] px-3 py-3 text-sm text-gray-600">
            <div v-if="templateText" class="font-medium text-gray-800">模板：{{ templateText }}</div>
            <div v-if="providerText" class="mt-1">供应商配置：{{ providerText }}</div>
            <div class="text-xs text-gray-400 mt-2">Base URL: {{ record.modelConfig?.baseUrl }}</div>
            <div v-if="record.modelConfig?.connectorType === 'ai-app'" class="text-xs text-gray-500 mt-1">WebApp ID: {{ record.modelConfig?.webappId || "-" }}</div>
            <div v-if="record.modelConfig?.connectorType === 'workflow'" class="text-xs text-gray-500 mt-1">Workflow ID: {{ record.modelConfig?.workflowId || "-" }}</div>
            <div v-if="record.modelConfig?.connectorType === 'model-api'" class="text-xs text-gray-500 mt-1">Path: {{ record.modelConfig?.submitPath || "-" }}</div>
            <div class="text-xs text-gray-500 mt-2">当前步骤：{{ stepText }}</div>
            <div v-if="record.jobResult?.Submit?.taskId" class="text-xs text-gray-500 mt-1">
                RH Task ID: {{ record.jobResult.Submit.taskId }}
            </div>
        </div>

        <div v-if="stepStatusList.length" class="mt-3">
            <div class="font-medium mb-2 text-sm text-gray-800">运行过程</div>
            <div class="grid grid-cols-1 gap-2">
                <div
                    v-for="item in stepStatusList"
                    :key="item.label"
                    class="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs text-gray-600"
                >
                    <div class="flex items-center gap-2">
                        <div class="font-medium text-gray-700">{{ item.label }}</div>
                        <div class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px]">{{ item.status }}</div>
                    </div>
                    <div v-if="item.error" class="text-red-500 mt-1 leading-5">{{ item.error }}</div>
                </div>
            </div>
        </div>

        <div class="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3" v-if="record.jobResult?.UploadAssets?.records?.length">
            <div class="font-medium mb-2 text-sm text-gray-800">已上传素材</div>
            <div v-for="item in record.jobResult.UploadAssets.records" :key="`${item.source}-${item.target}`" class="text-xs text-gray-500 mb-1 break-all">
                {{ item.source }} -> {{ item.target }}
            </div>
        </div>

        <div class="mt-3" v-if="record.status === 'success' && primaryFile">
            <div v-if="isImage" class="w-64">
                <ImagePreviewBox :url="primaryFile" />
            </div>
            <div v-else-if="isAudio" class="w-full">
                <AudioPlayer show-wave :url="`file://${primaryFile}`" />
            </div>
            <div v-else-if="isVideo" class="w-64 h-64 bg-black rounded-lg overflow-hidden">
                <VideoPlayer :url="`file://${primaryFile}`" />
            </div>
            <div v-else class="text-sm text-gray-500">
                已生成 {{ record.result?.urls?.length || 1 }} 个结果文件
            </div>
        </div>

        <div class="mt-3 text-xs text-gray-500" v-if="record.jobResult?.Query?.taskStatus">
            任务状态：{{ record.jobResult.Query.taskStatus }}
        </div>

        <div class="pt-4 flex items-center">
            <div class="text-gray-400 text-xs mr-2">#{{ record.id }}</div>
            <div class="text-gray-400 flex-grow">
                <timeago :datetime="record['createdAt'] * 1000" />
            </div>
            <a-button v-if="isVideo && primaryFile" class="mr-2" @click="doSaveAsTemplate">
                存为数字人模板
            </a-button>
            <TaskDownloadAction :record="record" />
            <TaskDeleteAction :record="record" @update="onRefresh" />
        </div>
    </div>
</template>
