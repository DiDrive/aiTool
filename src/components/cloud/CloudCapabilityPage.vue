<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import CloudTemplateSelector from "../common/CloudTemplateSelector.vue";
import { Dialog } from "../../lib/dialog";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { CloudTemplateTaskService } from "../../service/CloudTemplateTaskService";
import {
    CloudTemplateCapability,
    CloudTemplateInputSchemaField,
    CloudTemplateRecord,
} from "../../service/CloudTemplateService";

const props = withDefaults(
    defineProps<{
        capability: CloudTemplateCapability;
        title: string;
        description: string;
    }>(),
    {}
);

const router = useRouter();
const templateSelector = ref<InstanceType<typeof CloudTemplateSelector> | null>(null);

const formData = ref({
    templateId: 0,
    title: "",
});
const selectedTemplate = ref<CloudTemplateRecord | null>(null);
const schemaFields = ref<CloudTemplateInputSchemaField[]>([]);
const inputValues = ref<Record<string, any>>({});
const submitState = ref<"idle" | "building" | "submitting" | "submitted" | "error">("idle");
const submitMessage = ref("");
const latestTask = ref<TaskRecord | null>(null);
let latestTaskTimer: any = null;

const hasTemplates = computed(() => {
    return formData.value.templateId > 0;
});

const normalizeFieldDefaultValue = (field: CloudTemplateInputSchemaField) => {
    const value = field.defaultValue;
    if (typeof value === "undefined" || value === null || value === "") {
        if (field.type === "select" && field.options && field.options.length > 0) {
            return field.options[0].value;
        }
        if (field.type === "switch") {
            return false;
        }
        return "";
    }
    if (field.type === "number") {
        const num = Number(value);
        return Number.isFinite(num) ? num : "";
    }
    if (field.type === "switch") {
        return value === true || String(value) === "true";
    }
    return value;
};

const buildInitialInputValues = (fields: CloudTemplateInputSchemaField[]) => {
    const nextValues: Record<string, any> = {};
    for (const field of fields) {
        nextValues[field.name] = normalizeFieldDefaultValue(field);
    }
    return nextValues;
};

const loadLatestTask = async (taskId: number | string) => {
    const task = await TaskService.get(taskId);
    latestTask.value = task;
    return task;
};

const stopLatestTaskPolling = () => {
    if (latestTaskTimer) {
        clearInterval(latestTaskTimer);
        latestTaskTimer = null;
    }
};

const startLatestTaskPolling = (taskId: number | string) => {
    stopLatestTaskPolling();
    latestTaskTimer = setInterval(async () => {
        const task = await loadLatestTask(taskId);
        if (!task || task.status === "success" || task.status === "fail") {
            stopLatestTaskPolling();
        }
    }, 2000);
};

onBeforeUnmount(() => {
    stopLatestTaskPolling();
});

const onTemplateChange = (record: CloudTemplateRecord | null) => {
    selectedTemplate.value = record;
    schemaFields.value = CloudTemplateTaskService.parseInputSchema(record?.content.inputSchemaJson || "[]");
    inputValues.value = buildInitialInputValues(schemaFields.value);
};

const pickFile = async (field: CloudTemplateInputSchemaField) => {
    const filterMap = {
        image: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
        audio: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "flac"] }],
        video: [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv", "webm"] }],
        file: [],
    };
    const path = await window.$mapi.file.openFile({
        filters: filterMap[field.type] || [],
    });
    if (!path || Array.isArray(path)) {
        return;
    }
    inputValues.value[field.name] = path;
};

const clearFile = (field: CloudTemplateInputSchemaField) => {
    inputValues.value[field.name] = "";
};

const fileName = (value: string) => {
    return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
};

const doSubmit = async () => {
    if (!formData.value.templateId) {
        Dialog.tipError("请先选择模板");
        return;
    }
    for (const field of schemaFields.value) {
        if (!field.required) {
            continue;
        }
        const value = inputValues.value[field.name];
        if (value === null || typeof value === "undefined" || value === "") {
            Dialog.tipError(`请填写：${field.label}`);
            return;
        }
    }
    try {
        submitState.value = "building";
        submitMessage.value = "正在构建任务参数...";
        const record = await CloudTemplateTaskService.buildTaskRecord(formData.value.templateId, {
            ...inputValues.value,
            title: formData.value.title,
        });
        submitState.value = "submitting";
        submitMessage.value = "正在写入本地任务队列...";
        const taskId = await TaskService.submit(record);
        await loadLatestTask(taskId);
        startLatestTaskPolling(taskId);
        submitState.value = "submitted";
        submitMessage.value = "任务已进入本地队列";
        Dialog.tipSuccess("任务已提交");
        formData.value.title = "";
        inputValues.value = buildInitialInputValues(schemaFields.value);
    } catch (e: any) {
        submitState.value = "error";
        submitMessage.value = e?.message || String(e || "任务提交失败");
        Dialog.tipError(e?.message || String(e || "任务提交失败"));
    }
};
</script>

<template>
    <div class="px-6 py-5 max-w-[1120px]">
        <div class="mb-5 flex items-center">
            <div class="flex-grow">
                <div class="text-[30px] font-semibold tracking-tight text-gray-900">{{ title }}</div>
                <div class="text-sm text-gray-500 mt-1">{{ description }}</div>
            </div>
        </div>

        <div class="rounded-[24px] border border-white/70 bg-white/85 shadow-sm px-6 py-5">
                <div class="rounded-2xl bg-[#f6f8fc] px-4 py-3 mb-5">
                    <div class="font-semibold text-gray-900">模板驱动提交</div>
                    <div class="text-sm text-gray-500 mt-1">
                        供应商配置统一在设置里维护，这里只负责选择模板和填写这次任务的输入。
                    </div>
                </div>

                <a-form :model="formData" layout="vertical">
                    <a-form-item label="模板" required>
                        <CloudTemplateSelector
                            ref="templateSelector"
                            v-model="formData.templateId"
                            :capability="capability"
                            placeholder="请选择已配置的模板"
                            @change="onTemplateChange"
                        />
                        <div class="mt-2 text-xs text-gray-500">
                            如果这里没有模板，先去
                            <a-link @click="router.push('/setting')">设置 -> 云端能力</a-link>
                            新增供应商配置和模板
                        </div>
                    </a-form-item>

                    <a-form-item label="任务标题">
                        <a-input
                            v-model="formData.title"
                            placeholder="可选，不填则自动使用模板名和时间"
                        />
                    </a-form-item>

                    <div v-if="selectedTemplate && schemaFields.length === 0" class="mb-4 text-sm text-gray-500">
                        当前模板还没有配置输入字段 schema，先去设置里把它和 `nodeInfoList` / 请求体占位符对应起来。
                    </div>

                    <div v-for="field in schemaFields" :key="field.name" class="mb-5">
                        <div class="font-semibold text-gray-900 mb-2">
                            {{ field.label }}
                            <span v-if="field.required" class="text-red-500">*</span>
                        </div>
                        <div v-if="field.type === 'input'" class="max-w-2xl">
                            <a-input
                                v-model="inputValues[field.name]"
                                :placeholder="field.placeholder || ''"
                                allow-clear
                            />
                        </div>
                        <div v-else-if="field.type === 'textarea'" class="max-w-3xl">
                            <a-textarea
                                v-model="inputValues[field.name]"
                                :placeholder="field.placeholder || ''"
                                :auto-size="{ minRows: 3, maxRows: 8 }"
                            />
                        </div>
                        <div v-else-if="field.type === 'number'" class="max-w-sm">
                            <a-input-number
                                v-model="inputValues[field.name]"
                                :placeholder="field.placeholder || ''"
                                mode="button"
                            />
                        </div>
                        <div v-else-if="field.type === 'switch'" class="max-w-xs">
                            <a-switch v-model="inputValues[field.name]" />
                        </div>
                        <div v-else-if="field.type === 'select'" class="max-w-lg">
                            <a-select
                                v-model="inputValues[field.name]"
                                :placeholder="field.placeholder || ''"
                                allow-create
                                allow-search
                            >
                                <a-option
                                    v-for="option in field.options || []"
                                    :key="String(option.value)"
                                    :value="option.value"
                                >
                                    {{ option.label }}
                                </a-option>
                            </a-select>
                        </div>
                        <div
                            v-else-if="['image', 'audio', 'video', 'file'].includes(field.type)"
                            class="flex items-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3"
                        >
                            <a-button @click="pickFile(field)">
                                选择{{ field.type === "image" ? "图片" : field.type === "audio" ? "音频" : field.type === "video" ? "视频" : "文件" }}
                            </a-button>
                            <a-button
                                v-if="inputValues[field.name]"
                                status="danger"
                                @click="clearFile(field)"
                            >
                                清空
                            </a-button>
                            <div class="text-gray-500 text-sm" v-if="inputValues[field.name]">
                                {{ fileName(inputValues[field.name]) }}
                            </div>
                        </div>
                    </div>
                </a-form>

                <div class="flex gap-2 pt-2">
                    <a-button type="primary" size="large" :disabled="!hasTemplates" @click="doSubmit">开始生成</a-button>
                    <a-button size="large" @click="templateSelector?.refresh()">刷新模板</a-button>
                </div>

                <div v-if="submitState !== 'idle'" class="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm">
                    <div class="font-semibold text-gray-900 mb-1">提交状态</div>
                    <div v-if="submitState === 'building'" class="text-gray-600">{{ submitMessage }}</div>
                    <div v-else-if="submitState === 'submitting'" class="text-gray-600">{{ submitMessage }}</div>
                    <div v-else-if="submitState === 'submitted'" class="text-green-600">{{ submitMessage }}</div>
                    <div v-else-if="submitState === 'error'" class="text-red-600">{{ submitMessage }}</div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                        <div v-if="latestTask?.id" class="rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-600">
                            本地任务 ID：{{ latestTask.id }}
                        </div>
                        <div v-if="latestTask?.status" class="rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-600">
                            本地状态：{{ latestTask.status }}
                        </div>
                        <div v-if="latestTask?.jobResult?.Submit?.taskId" class="rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-600">
                            RH Task ID：{{ latestTask.jobResult.Submit.taskId }}
                        </div>
                        <div v-if="latestTask?.jobResult?.Query?.taskStatus" class="rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-600">
                            RH 状态：{{ latestTask.jobResult.Query.taskStatus }}
                        </div>
                    </div>
                    <div class="mt-3 text-xs text-gray-500">
                        全部任务、运行过程和结果请查看右侧任务结果栏。
                    </div>
                </div>
        </div>
    </div>
</template>
