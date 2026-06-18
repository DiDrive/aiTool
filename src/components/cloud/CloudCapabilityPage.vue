<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import CloudTemplateSelector from "../common/CloudTemplateSelector.vue";
import { Dialog } from "../../lib/dialog";
import { TaskService } from "../../service/TaskService";
import { CloudTemplateTaskService } from "../../service/CloudTemplateTaskService";
import {
    DigitalHumanIdentityRecord,
    DigitalHumanIdentityService,
} from "../../service/DigitalHumanIdentityService";
import {
    CloudTemplateCapability,
    CloudTemplateInputSchemaField,
    CloudTemplateRecord,
    CloudTemplateService,
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
const route = useRoute();
const templateSelector = ref<InstanceType<typeof CloudTemplateSelector> | null>(null);

const formData = ref({
    templateId: 0,
    title: "",
    identityId: 0,
});
const selectedTemplate = ref<CloudTemplateRecord | null>(null);
const schemaFields = ref<CloudTemplateInputSchemaField[]>([]);
const inputValues = ref<Record<string, any>>({});
const identityRecords = ref<DigitalHumanIdentityRecord[]>([]);
const selectedIdentity = ref<DigitalHumanIdentityRecord | null>(null);

const hasTemplates = computed(() => {
    return formData.value.templateId > 0;
});

const identityEnabled = computed(() => {
    return props.capability === "digital-human";
});

const refreshIdentityRecords = async () => {
    if (!identityEnabled.value) {
        return;
    }
    identityRecords.value = await DigitalHumanIdentityService.list();
    selectedIdentity.value = identityRecords.value.find(item => item.id === formData.value.identityId) || null;
};

onMounted(async () => {
    await refreshIdentityRecords();
    await hydrateFromTask();
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

const onTemplateChange = (record: CloudTemplateRecord | null) => {
    selectedTemplate.value = record;
    schemaFields.value = CloudTemplateTaskService.parseInputSchema(record?.content.inputSchemaJson || "[]");
    inputValues.value = buildInitialInputValues(schemaFields.value);
};

const hydrateFromTask = async () => {
    const editTaskId = Number(route.query.editTaskId || 0);
    if (!editTaskId) {
        return;
    }
    const record = await TaskService.get(editTaskId);
    if (!record || record.biz !== "RunningHubTask") {
        return;
    }
    const templateId = Number((record as any)?.modelConfig?.templateId || 0);
    if (!templateId) {
        return;
    }
    const template = await CloudTemplateService.get(templateId);
    if (!template) {
        Dialog.tipError("原任务绑定的云端模板已不存在");
        return;
    }
    const input = { ...((record as any)?.param?.input || {}) };
    const taskCapability = String((record as any)?.modelConfig?.capability || input.selectedCapability || "");
    if (taskCapability && taskCapability !== props.capability) {
        return;
    }
    formData.value.templateId = templateId;
    formData.value.title = String(input.title || record.title || "");
    formData.value.identityId = Number(input.identityId || 0);
    selectedTemplate.value = template;
    schemaFields.value = CloudTemplateTaskService.parseInputSchema(template.content.inputSchemaJson || "[]");
    inputValues.value = {
        ...buildInitialInputValues(schemaFields.value),
        ...input,
    };
    if (identityEnabled.value) {
        selectedIdentity.value = identityRecords.value.find(item => item.id === formData.value.identityId) || null;
    }
};

const onIdentityChange = (value: number | string | boolean) => {
    const id = Number(value || 0);
    formData.value.identityId = id;
    selectedIdentity.value = identityRecords.value.find(item => item.id === id) || null;
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
        const record = await CloudTemplateTaskService.buildTaskRecord(formData.value.templateId, {
            ...inputValues.value,
            title: formData.value.title,
            selectedCapability: props.capability,
            identityId: formData.value.identityId || 0,
            identity: selectedIdentity.value
                ? {
                      id: selectedIdentity.value.id || 0,
                      title: selectedIdentity.value.title,
                      ...selectedIdentity.value.content,
                  }
                : undefined,
        });
        await TaskService.submit(record);
        Dialog.tipSuccess("任务已提交");
        formData.value.title = "";
        inputValues.value = buildInitialInputValues(schemaFields.value);
    } catch (e: any) {
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

                    <a-form-item v-if="identityEnabled" label="数字人身份">
                        <a-select
                            :model-value="formData.identityId"
                            placeholder="可选，选择后可在模板里使用 identity.xxx 变量"
                            allow-clear
                            @change="onIdentityChange"
                        >
                            <a-option
                                v-for="identity in identityRecords"
                                :key="identity.id"
                                :value="identity.id || 0"
                            >
                                {{ identity.title }}
                            </a-option>
                        </a-select>
                        <div class="mt-2 text-xs text-gray-500">
                            身份资产在
                            <a-link @click="router.push('/setting')">设置 -> 云端能力 -> 数字人身份</a-link>
                            里维护，可统一保存主播参考视频、待机片、参考音频和平台侧 avatarId。
                        </div>
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
        </div>
    </div>
</template>
