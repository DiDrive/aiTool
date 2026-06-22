<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Dialog } from "../../lib/dialog";
import {
    CloudProviderProfileRecord,
    CloudProviderProfileService,
    CloudProviderType,
} from "../../service/CloudProviderProfileService";
import {
    CloudTemplateCapability,
    CloudTemplateInputSchemaField,
    CloudTemplateRecord,
    CloudTemplateService,
    CloudTemplateType,
    getTemplateCapabilities,
} from "../../service/CloudTemplateService";
import { ConfigTransferService } from "../../service/ConfigTransferService";

const providerTypeOptions: { value: CloudProviderType; label: string }[] = [
    { value: "runninghub", label: "RunningHub" },
    { value: "heygem", label: "Heygem" },
    { value: "selfhost", label: "Selfhost" },
    { value: "custom", label: "自定义 API" },
    { value: "other", label: "其他平台" },
];

const capabilityOptions: { value: CloudTemplateCapability; label: string }[] = [
    { value: "image", label: "生图" },
    { value: "video", label: "生视频" },
    { value: "lipsync", label: "对口型" },
    { value: "audio", label: "生音频" },
    { value: "voice-clone", label: "克隆音色" },
    { value: "digital-human", label: "普通数字人" },
];

const templateTypeOptions: { value: CloudTemplateType; label: string }[] = [
    { value: "workflow", label: "工作流 JSON" },
    { value: "ai-app", label: "AI App API" },
    { value: "model-api", label: "标准模型 API" },
    { value: "custom-api", label: "自定义 API" },
];

const providerProfiles = ref<CloudProviderProfileRecord[]>([]);
const templates = ref<CloudTemplateRecord[]>([]);
const aiAppExampleText = ref("");

const providerVisible = ref(false);
const templateVisible = ref(false);

const providerForm = ref<CloudProviderProfileRecord>({
    title: "",
    content: {
        providerType: "runninghub",
        baseUrl: "https://www.runninghub.cn",
        apiKey: "",
        submitPath: "",
        queryPath: "",
        cancelPath: "",
        extra: {},
    },
});

const templateForm = ref<CloudTemplateRecord>({
    title: "",
    content: {
        capability: "video",
        capabilities: ["video"],
        templateType: "workflow",
        providerType: "runninghub",
        providerProfileId: 0,
        providerProfileTitle: "",
        description: "",
        workflowFileName: "",
        workflowJson: "",
        webappId: "",
        workflowId: "",
        submitPath: "",
        queryPath: "openapi/v2/query",
        cancelPath: "",
        webhookUrl: "",
        instanceType: "",
        accessPassword: "",
        addMetadata: true,
        retainSeconds: null,
        usePersonalQueue: false,
        nodeInfoTemplateJson: "[]",
        requestBodyTemplateJson: "{}",
        inputSchemaJson: "[]",
        fieldMappingJson: "{}",
    },
});

const providerTypeLabel = (value?: string) => {
    return providerTypeOptions.find(item => item.value === value)?.label || value || "-";
};

const capabilityLabel = (value?: string) => {
    return capabilityOptions.find(item => item.value === value)?.label || value || "-";
};

const capabilityLabels = (record: CloudTemplateRecord) => {
    return getTemplateCapabilities(record).map(item => capabilityLabel(item));
};

const templateTypeLabel = (value?: string) => {
    return templateTypeOptions.find(item => item.value === value)?.label || value || "-";
};

const providerProfileOptions = computed(() => {
    return providerProfiles.value.map(item => ({
        label: `${item.title} · ${providerTypeLabel(item.content.providerType)}`,
        value: item.id || 0,
    }));
});

const refresh = async () => {
    providerProfiles.value = await CloudProviderProfileService.list();
    templates.value = await CloudTemplateService.list();
};

onMounted(async () => {
    await refresh();
});

const configPackageFilename = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `aigcpanel-config-${date}.json`;
};

const exportConfigPackage = async () => {
    const filePath = await window.$mapi.file.openSave({
        defaultPath: configPackageFilename(),
        filters: [{ name: "AIGCPanel Config", extensions: ["json"] }],
    });
    if (!filePath) {
        return;
    }
    try {
        const data = await ConfigTransferService.exportToFile(filePath);
        const directCount = data.data.directApiPlatforms?.length || 0;
        const relayCount = data.data.fileRelayConfig ? 1 : 0;
        const providerCount = data.data.cloudProviderProfiles?.length || 0;
        const templateCount = data.data.cloudTemplates?.length || 0;
        Dialog.tipSuccess(`配置已导出：直连平台 ${directCount} 个，全局中转 ${relayCount} 个，云端供应商 ${providerCount} 个，模板 ${templateCount} 个`);
    } catch (e: any) {
        Dialog.alertError(e?.message || "导出配置失败", "导出配置");
    }
};

const importConfigPackage = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "AIGCPanel Config", extensions: ["json"] }],
    });
    if (!filePath) {
        return;
    }
    await Dialog.confirm(
        "配置包可能包含 API Key、123 云盘 Client Secret、URL 鉴权密钥等敏感信息。导入会按名称合并：同名配置更新，不同名配置新增。确认导入？",
        "导入配置"
    );
    try {
        const summary = await ConfigTransferService.importFromFile(String(filePath));
        await refresh();
        Dialog.tipSuccess(
            `配置已导入：直连平台 ${summary.directApiPlatforms} 个，全局中转 ${summary.fileRelayConfig} 个，云端供应商 ${summary.cloudProviderProfiles} 个，模板 ${summary.cloudTemplates} 个`
        );
    } catch (e: any) {
        Dialog.alertError(e?.message || "导入配置失败", "导入配置");
    }
};

const resetProviderForm = () => {
    providerForm.value = {
        title: "",
        content: {
            providerType: "runninghub",
            baseUrl: "https://www.runninghub.cn",
            apiKey: "",
            submitPath: "",
            queryPath: "",
            cancelPath: "",
            extra: {},
        },
    };
};

const resetTemplateForm = () => {
    templateForm.value = {
        title: "",
        content: {
            capability: "video",
            capabilities: ["video"],
            templateType: "workflow",
            providerType: "runninghub",
            providerProfileId: 0,
            providerProfileTitle: "",
            description: "",
            workflowFileName: "",
            workflowJson: "",
            webappId: "",
            workflowId: "",
            submitPath: "",
            queryPath: "openapi/v2/query",
            cancelPath: "",
            webhookUrl: "",
            instanceType: "",
            accessPassword: "",
            addMetadata: true,
            retainSeconds: null,
            usePersonalQueue: false,
            nodeInfoTemplateJson: "[]",
            requestBodyTemplateJson: "{}",
            inputSchemaJson: "[]",
            fieldMappingJson: "{}",
        },
    };
};

const normalizeTemplateVariableName = (value: string) => {
    return String(value || "")
        .replace(/[【】\[\]()（）]/g, " ")
        .replace(/[^\w\u4e00-\u9fa5]+/g, " ")
        .trim()
        .toLowerCase();
};

const ensureUniqueFieldNames = <T extends { name: string }>(fields: T[]) => {
    const used = new Map<string, number>();
    return fields.map(field => {
        const base = String(field.name || "field").trim() || "field";
        const count = used.get(base) || 0;
        used.set(base, count + 1);
        if (count === 0) {
            return {
                ...field,
                name: base,
            };
        }
        return {
            ...field,
            name: `${base}_${count + 1}`,
        };
    });
};

const parseTemplateSchemaText = (raw: string): CloudTemplateInputSchemaField[] => {
    try {
        const parsed = JSON.parse(String(raw || "[]"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

const duplicateSchemaFieldNames = (fields: CloudTemplateInputSchemaField[]) => {
    const countMap = new Map<string, number>();
    for (const field of fields) {
        const name = String(field?.name || "").trim();
        if (!name) {
            continue;
        }
        countMap.set(name, (countMap.get(name) || 0) + 1);
    }
    return Array.from(countMap.entries())
        .filter(([, count]) => count > 1)
        .map(([name]) => name);
};

const schemaPlaceholderExample = "{{字段名}}";
const identityAvatarPlaceholderExample = "{{identity.bindings.runninghub.avatarId}}";
const identityReferenceVideoPlaceholderExample = "{{identity.referenceVideo}}";

const inferFieldName = (item: any, index: number) => {
    const desc = normalizeTemplateVariableName(item?.description || "");
    const fieldName = String(item?.fieldName || "").trim().toLowerCase();
    if (/图片数量|图像数量|生成数量|数量|张数|count|number/.test(desc)) return `count_${item?.nodeId || index}`;
    if (/aspect[_-]?ratio/.test(fieldName)) return `ratio_${item?.nodeId || index}`;
    if (/图像比例|图片比例|画面比例|设置比例|宽:高|aspect|ratio/.test(desc)) return `ratio_${item?.nodeId || index}`;
    if (fieldName === "image" || /图像|图片|照片|image/.test(desc)) return "image";
    if (fieldName === "audio" || /音频|声音|audio/.test(desc)) return "audio";
    if (fieldName === "video" || /视频|video/.test(desc)) return "video";
    if (/提示词agent|agent/.test(desc)) return "promptAgent";
    if (/提示词模式|模式切换|mode/.test(desc)) return "promptMode";
    if (/提示词|文案|text|prompt/.test(desc) || fieldName === "text") return "prompt";
    if (/镜头运动|运镜|camera/.test(desc)) return "cameraMotion";
    if (/时长|duration/.test(desc)) return "duration";
    if (/长边尺寸|尺寸|分辨率|resolution|size/.test(desc)) return "longEdgeSize";
    if (/sigma|sigama/.test(desc)) return "sigmaMode";
    if (/开关|switch|是否/.test(desc)) return `switch_${item?.nodeId || index}`;
    return `${fieldName || "field"}_${item?.nodeId || index}`;
};

const inferFieldType = (item: any) => {
    const fieldName = String(item?.fieldName || "").trim().toLowerCase();
    const desc = String(item?.description || "").trim().toLowerCase();
    const value = item?.fieldValue;
    if (/图片数量|图像数量|生成数量|数量|张数|count|number/.test(desc)) return "number";
    if (/aspect[_-]?ratio/.test(fieldName)) return "select";
    if (/图像比例|图片比例|画面比例|设置比例|宽:高|aspect|ratio/.test(desc)) return "select";
    if (fieldName === "image" || /image|图像|图片/.test(desc)) return "image";
    if (fieldName === "audio" || /audio|音频|声音/.test(desc)) return "audio";
    if (fieldName === "video" || /video|视频/.test(desc)) return "video";
    if (fieldName === "select" || /选择|模式|切换|agent/.test(desc)) return "select";
    if (typeof value === "boolean" || /switch|开关|是否/.test(desc)) return "switch";
    if (/^-?\d+(\.\d+)?$/.test(String(value ?? "").trim())) return "number";
    if (fieldName === "text" || /提示词|prompt|文案|text/.test(desc)) return "textarea";
    return "input";
};

const normalizeDefaultValueByType = (fieldType: string, value: any) => {
    if (fieldType === "image" || fieldType === "audio" || fieldType === "video" || fieldType === "file") {
        return "";
    }
    if (fieldType === "switch") {
        return value === true || String(value) === "true";
    }
    if (fieldType === "number") {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }
    if (typeof value === "undefined" || value === null) {
        return "";
    }
    return value;
};

const extractRequestJsonText = (raw: string) => {
    const text = String(raw || "").replace(/`/g, "").trim();
    const dataRawMatch = text.match(/--data(?:-raw)?\s+(['"])([\s\S]*?)\1/);
    if (dataRawMatch?.[2]) {
        return dataRawMatch[2].trim();
    }
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
        return text.slice(jsonStart, jsonEnd + 1);
    }
    return "";
};

const extractAiAppRunUrl = (raw: string) => {
    const text = String(raw || "").replace(/`/g, "");
    const match = text.match(/https?:\/\/[^\s'"]*\/openapi\/v2\/run\/ai-app\/(\d+)/i);
    if (!match) {
        return null;
    }
    return {
        url: match[0],
        appId: match[1],
    };
};

const autoGenerateFromAiAppExample = () => {
    const raw = String(aiAppExampleText.value || "").trim();
    if (!raw) {
        Dialog.tipError("请先粘贴 AI App 的 cURL 或请求 JSON");
        return;
    }
    const runUrl = extractAiAppRunUrl(raw);
    const requestJsonText = extractRequestJsonText(raw);
    if (!requestJsonText) {
        Dialog.tipError("没有识别到请求 JSON");
        return;
    }
    let payload: any = null;
    try {
        payload = JSON.parse(requestJsonText);
    } catch (e) {
        Dialog.tipError("请求 JSON 解析失败");
        return;
    }
    const nodeInfoList = Array.isArray(payload?.nodeInfoList) ? payload.nodeInfoList : [];
    if (!nodeInfoList.length) {
        Dialog.tipError("没有识别到 nodeInfoList");
        return;
    }
    const inputSchema = ensureUniqueFieldNames(nodeInfoList.map((item: any, index: number) => {
        const name = inferFieldName(item, index);
        const fieldType = inferFieldType(item);
        const defaultValue = normalizeDefaultValueByType(fieldType, item?.fieldValue);
        const schemaItem: any = {
            name,
            label: item?.description || item?.fieldName || `字段${index + 1}`,
            type: fieldType,
            required: fieldType === "image" || fieldType === "audio" || fieldType === "video",
            defaultValue,
            help: `nodeId=${item?.nodeId || ""}, fieldName=${item?.fieldName || ""}`,
        };
        if (fieldType === "select") {
            schemaItem.options = [
                {
                    label: String(item?.fieldValue ?? ""),
                    value: String(item?.fieldValue ?? ""),
                },
            ];
            schemaItem.placeholder = "当前只从 cURL 识别到默认值，后续可补完整选项";
        }
        if (fieldType === "number") {
            schemaItem.placeholder = "请输入数值";
        }
        if (fieldType === "textarea") {
            schemaItem.placeholder = String(item?.description || "");
        }
        return schemaItem;
    }));
    const nodeTemplate = nodeInfoList.map((item: any, index: number) => {
        const name = inputSchema[index].name;
        return {
            ...item,
            fieldValue: `{{${name}}}`,
        };
    });
    templateForm.value.content.templateType = "ai-app";
    templateForm.value.content.webappId = runUrl?.appId || templateForm.value.content.webappId || "";
    templateForm.value.content.submitPath = runUrl
        ? runUrl.url.replace(/^https?:\/\/[^/]+\/+/i, "")
        : templateForm.value.content.submitPath || "";
    templateForm.value.content.instanceType = String(payload?.instanceType || templateForm.value.content.instanceType || "");
    if (typeof payload?.usePersonalQueue !== "undefined") {
        templateForm.value.content.usePersonalQueue =
            payload.usePersonalQueue === true || String(payload.usePersonalQueue) === "true";
    }
    templateForm.value.content.nodeInfoTemplateJson = JSON.stringify(nodeTemplate, null, 2);
    templateForm.value.content.inputSchemaJson = JSON.stringify(inputSchema, null, 2);
    if (!templateForm.value.title && runUrl?.appId) {
        templateForm.value.title = `AIApp_${runUrl.appId}`;
    }
    if (!templateForm.value.content.description) {
        templateForm.value.content.description = "从 AI App cURL 请求示例自动生成";
    }
    Dialog.tipSuccess("已根据 AI App 请求示例自动生成模板字段");
};

const openProviderAdd = () => {
    resetProviderForm();
    providerVisible.value = true;
};

const openProviderEdit = (record: CloudProviderProfileRecord) => {
    providerForm.value = JSON.parse(JSON.stringify(record));
    providerVisible.value = true;
};

const openTemplateAdd = () => {
    resetTemplateForm();
    templateVisible.value = true;
};

const openTemplateEdit = (record: CloudTemplateRecord) => {
    templateForm.value = {
        ...JSON.parse(JSON.stringify(record)),
        content: {
            ...JSON.parse(JSON.stringify(record.content || {})),
            capability: getTemplateCapabilities(record)[0] || "video",
            capabilities: getTemplateCapabilities(record),
        },
    };
    templateVisible.value = true;
};

const onProviderProfileChange = (value: number) => {
    const record = providerProfiles.value.find(item => item.id === value);
    templateForm.value.content.providerProfileId = value;
    templateForm.value.content.providerProfileTitle = record?.title || "";
    templateForm.value.content.providerType = (record?.content.providerType || "runninghub") as CloudProviderType;
};

const importWorkflowJson = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return;
    }
    const fileApi = window.$mapi.file as any;
    const text = await fileApi.read(filePath, { encoding: "utf8" });
    if (!text) {
        Dialog.tipError("读取工作流 JSON 失败");
        return;
    }
    let parsed: any = null;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        Dialog.tipError("工作流 JSON 格式不正确");
        return;
    }
    templateForm.value.content.workflowJson = JSON.stringify(parsed, null, 2);
    templateForm.value.content.workflowFileName = String(filePath).replace(/\\/g, "/").split("/").pop() || "";
    if (!templateForm.value.title) {
        templateForm.value.title = templateForm.value.content.workflowFileName.replace(/\.json$/i, "");
    }
    if (!templateForm.value.content.description) {
        templateForm.value.content.description = "从本地 workflow JSON 导入";
    }
};

const saveProvider = async () => {
    if (!providerForm.value.title) {
        Dialog.tipError("请输入供应商配置名称");
        return;
    }
    if (!providerForm.value.content.baseUrl) {
        Dialog.tipError("请输入 Base URL");
        return;
    }
    const exists = await CloudProviderProfileService.getByTitle(providerForm.value.title);
    if (exists && exists.id !== providerForm.value.id) {
        Dialog.tipError("供应商配置名称重复");
        return;
    }
    await CloudProviderProfileService.save(providerForm.value);
    providerVisible.value = false;
    await refresh();
};

const saveTemplate = async () => {
    if (!templateForm.value.title) {
        Dialog.tipError("请输入模板名称");
        return;
    }
    const content = templateForm.value.content;
    if (!content.providerProfileId) {
        Dialog.tipError("请选择供应商配置");
        return;
    }
    const selectedCapabilities = Array.isArray(content.capabilities)
        ? content.capabilities.filter(Boolean)
        : [];
    if (selectedCapabilities.length === 0) {
        Dialog.tipError("请至少选择一个能力类型");
        return;
    }
    content.capability = selectedCapabilities[0];
    content.capabilities = Array.from(new Set(selectedCapabilities));
    if (content.templateType === "workflow" && !content.workflowJson) {
        Dialog.tipError("请先导入 workflow JSON");
        return;
    }
    if (content.templateType === "ai-app" && !content.webappId && !content.submitPath) {
        Dialog.tipError("请输入 AI App ID 或提交路径");
        return;
    }
    if ((content.templateType === "model-api" || content.templateType === "custom-api") && !content.submitPath) {
        Dialog.tipError("请输入提交接口路径");
        return;
    }
    const exists = await CloudTemplateService.getByTitle(templateForm.value.title);
    if (exists && exists.id !== templateForm.value.id) {
        Dialog.tipError("模板名称重复");
        return;
    }
    const schemaFields = parseTemplateSchemaText(content.inputSchemaJson || "[]");
    const duplicateNames = duplicateSchemaFieldNames(schemaFields);
    if (duplicateNames.length > 0) {
        Dialog.tipError(`输入字段存在重复 name：${duplicateNames.join("、")}，请修改后再保存`);
        return;
    }
    await CloudTemplateService.save(templateForm.value);
    templateVisible.value = false;
    await refresh();
};

const deleteProvider = async (record: CloudProviderProfileRecord) => {
    const used = templates.value.some(item => item.content.providerProfileId === record.id);
    if (used) {
        Dialog.tipError("该供应商配置已被模板引用，请先调整模板");
        return;
    }
    await CloudProviderProfileService.delete(record);
    await refresh();
};

const deleteTemplate = async (record: CloudTemplateRecord) => {
    await CloudTemplateService.delete(record);
    await refresh();
};
</script>

<template>
    <div class="space-y-6">
        <div class="rounded-xl border border-solid border-gray-200 p-4">
            <div class="flex items-center mb-3">
                <div class="flex-grow">
                    <div class="text-base font-bold">统一供应商配置</div>
                    <div class="text-gray-400 text-sm">
                        Base URL、API Key、默认查询路径统一放这里，业务页只选模板
                    </div>
                </div>
                <div class="mr-2 flex gap-2">
                    <a-button @click="importConfigPackage">导入配置</a-button>
                    <a-button @click="exportConfigPackage">导出配置</a-button>
                </div>
                <a-button type="primary" @click="openProviderAdd">
                    新增供应商配置
                </a-button>
            </div>
            <div v-if="providerProfiles.length" class="space-y-3">
                <div
                    v-for="record in providerProfiles"
                    :key="record.id"
                    class="rounded-lg border border-solid border-gray-200 p-3"
                >
                    <div class="flex items-center gap-2 mb-2">
                        <div class="font-bold">{{ record.title }}</div>
                        <a-tag>{{ providerTypeLabel(record.content.providerType) }}</a-tag>
                        <div class="text-gray-400 text-xs truncate">{{ record.content.baseUrl }}</div>
                    </div>
                    <div class="text-xs text-gray-500 mb-3">
                        默认提交：{{ record.content.submitPath || "-" }}，默认查询：{{ record.content.queryPath || "-" }}
                    </div>
                    <div class="flex gap-2">
                        <a-button size="small" @click="openProviderEdit(record)">编辑</a-button>
                        <a-popconfirm content="确认删除这个供应商配置？" @ok="deleteProvider(record)">
                            <a-button size="small" status="danger">删除</a-button>
                        </a-popconfirm>
                    </div>
                </div>
            </div>
            <a-empty v-else description="还没有供应商配置" />
        </div>

        <div class="rounded-xl border border-solid border-gray-200 p-4">
            <div class="flex items-center mb-3">
                <div class="flex-grow">
                    <div class="text-base font-bold">模板中心</div>
                    <div class="text-gray-400 text-sm">
                        支持工作流 JSON、AI App API、标准模型 API、自定义 API，后续在生图/视频/声音页里下拉选择
                    </div>
                    <div class="text-xs text-gray-400">
                        数字人模板还可以直接引用 `identity.xxx`，例如
                        <code>{{ identityAvatarPlaceholderExample }}</code>
                        、
                        <code>{{ identityReferenceVideoPlaceholderExample }}</code>
                    </div>
                </div>
                <a-button type="primary" @click="openTemplateAdd">
                    新增模板
                </a-button>
            </div>
            <div v-if="templates.length" class="space-y-3">
                <div
                    v-for="record in templates"
                    :key="record.id"
                    class="rounded-lg border border-solid border-gray-200 p-3"
                >
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        <div class="font-bold">{{ record.title }}</div>
                        <a-tag
                            v-for="capability in capabilityLabels(record)"
                            :key="`${record.id}-${capability}`"
                            color="arcoblue"
                        >
                            {{ capability }}
                        </a-tag>
                        <a-tag>{{ templateTypeLabel(record.content.templateType) }}</a-tag>
                        <a-tag>{{ providerTypeLabel(record.content.providerType) }}</a-tag>
                        <div class="text-gray-400 text-xs">
                            {{ record.content.providerProfileTitle || "未绑定供应商配置" }}
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 leading-6">
                        <div v-if="record.content.description">{{ record.content.description }}</div>
                        <div v-if="record.content.workflowFileName">工作流文件：{{ record.content.workflowFileName }}</div>
                        <div v-if="record.content.webappId">AI App ID：{{ record.content.webappId }}</div>
                        <div v-if="record.content.submitPath">提交路径：{{ record.content.submitPath }}</div>
                    </div>
                    <div class="flex gap-2 mt-3">
                        <a-button size="small" @click="openTemplateEdit(record)">编辑</a-button>
                        <a-popconfirm content="确认删除这个模板？" @ok="deleteTemplate(record)">
                            <a-button size="small" status="danger">删除</a-button>
                        </a-popconfirm>
                    </div>
                </div>
            </div>
            <a-empty v-else description="还没有模板，先上传 workflow JSON 或录入 API 模板" />
        </div>
    </div>

    <a-modal v-model:visible="providerVisible" width="720px" title="供应商配置">
        <template #footer>
            <a-button @click="providerVisible = false">取消</a-button>
            <a-button type="primary" @click="saveProvider">保存</a-button>
        </template>
        <a-form :model="providerForm" layout="vertical">
            <a-form-item label="配置名称" required>
                <a-input v-model="providerForm.title" placeholder="例如：RunningHub 主账号" />
            </a-form-item>
            <a-form-item label="平台类型" required>
                <a-select v-model="providerForm.content.providerType">
                    <a-option v-for="item in providerTypeOptions" :key="item.value" :value="item.value">
                        {{ item.label }}
                    </a-option>
                </a-select>
            </a-form-item>
            <a-form-item label="Base URL" required>
                <a-input v-model="providerForm.content.baseUrl" />
            </a-form-item>
            <a-form-item label="API Key">
                <a-input-password v-model="providerForm.content.apiKey" placeholder="统一存在这里，不在业务页反复配置" />
            </a-form-item>
            <a-row :gutter="12">
                <a-col :span="8">
                    <a-form-item label="默认提交路径">
                        <a-input v-model="providerForm.content.submitPath" placeholder="可选" />
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="默认查询路径">
                        <a-input v-model="providerForm.content.queryPath" placeholder="例如 openapi/v2/query" />
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="默认取消路径">
                        <a-input v-model="providerForm.content.cancelPath" placeholder="可选" />
                    </a-form-item>
                </a-col>
            </a-row>
        </a-form>
    </a-modal>

    <a-modal v-model:visible="templateVisible" width="960px" title="模板配置">
        <template #footer>
            <a-button @click="templateVisible = false">取消</a-button>
            <a-button type="primary" @click="saveTemplate">保存</a-button>
        </template>
        <a-form :model="templateForm" layout="vertical">
            <a-row :gutter="12">
                <a-col :span="12">
                    <a-form-item label="模板名称" required>
                        <a-input v-model="templateForm.title" placeholder="例如：video_wan2.2 - RunningHub" />
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="供应商配置" required>
                        <a-select
                            :model-value="templateForm.content.providerProfileId"
                            placeholder="选择统一供应商配置"
                            @change="onProviderProfileChange as any"
                        >
                            <a-option v-for="item in providerProfileOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-row :gutter="12">
                <a-col :span="12">
                    <a-form-item label="能力类型" required>
                        <a-select
                            v-model="templateForm.content.capabilities"
                            multiple
                            allow-search
                            placeholder="可多选，一个模板可同时出现在多个能力页"
                        >
                            <a-option v-for="item in capabilityOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                        <div class="mt-1 text-xs text-gray-500">
                            例如同一个模板既能算 `普通数字人`，也能在 `对口型` 或 `生视频` 里显示。
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="模板来源" required>
                        <a-select v-model="templateForm.content.templateType">
                            <a-option v-for="item in templateTypeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-form-item label="说明">
                <a-input v-model="templateForm.content.description" placeholder="例如：RunningHub 页面导出的工作流，适用于图生视频" />
            </a-form-item>

            <div
                v-if="templateForm.content.templateType === 'workflow'"
                class="rounded-lg bg-gray-50 p-3 mb-4"
            >
                <div class="flex items-center mb-2">
                    <div class="flex-grow font-bold">工作流 JSON</div>
                    <a-button size="small" @click="importWorkflowJson">导入本地 workflow JSON</a-button>
                </div>
                <div class="text-xs text-gray-500 mb-2">
                    上传后会作为模板保存，后面业务页直接下拉选择，不再每次手填 nodeInfoList
                </div>
                <a-form-item label="Workflow ID">
                    <a-input v-model="templateForm.content.workflowId" placeholder="可选，有些接口支持 workflowId + workflowJson 混用" />
                </a-form-item>
                <a-form-item label="工作流 JSON">
                    <a-textarea
                        v-model="templateForm.content.workflowJson"
                        :auto-size="{ minRows: 8, maxRows: 16 }"
                        placeholder="可导入本地 JSON，也可手动粘贴"
                    />
                </a-form-item>
            </div>

            <div
                v-if="templateForm.content.templateType === 'ai-app'"
                class="rounded-lg bg-gray-50 p-3 mb-4"
            >
                <div class="flex items-center mb-2">
                    <div class="font-bold flex-grow">AI App API</div>
                    <a-button size="small" type="primary" @click="autoGenerateFromAiAppExample">
                        从 cURL 自动生成
                    </a-button>
                </div>
                <a-form-item label="AI App cURL / 请求 JSON 示例">
                    <a-textarea
                        v-model="aiAppExampleText"
                        :auto-size="{ minRows: 8, maxRows: 16 }"
                        placeholder="粘贴 RunningHub AI App 的 cURL 示例或完整请求 JSON，我会自动识别 appId、nodeInfoList 和可编辑字段"
                    />
                    <div class="text-xs text-gray-500 mt-1">
                        优先支持类似 `POST /openapi/v2/run/ai-app/xxxx` 的示例，会自动生成输入字段 schema 和 nodeInfoList 模板
                    </div>
                </a-form-item>
                <a-form-item label="AI App ID" required>
                    <a-input v-model="templateForm.content.webappId" placeholder="例如页面链接里的 appId / 接口尾部 ID" />
                </a-form-item>
                <a-form-item label="提交路径">
                    <a-input
                        v-model="templateForm.content.submitPath"
                        placeholder="可选，例如 openapi/v2/run/ai-app/2008966334171844609"
                    />
                </a-form-item>
                <a-row :gutter="12">
                    <a-col :span="8">
                        <a-form-item label="实例类型">
                            <a-input v-model="templateForm.content.instanceType" placeholder="default / plus" />
                        </a-form-item>
                    </a-col>
                    <a-col :span="8">
                        <a-form-item label="Webhook URL">
                            <a-input v-model="templateForm.content.webhookUrl" placeholder="可选" />
                        </a-form-item>
                    </a-col>
                    <a-col :span="8">
                        <a-form-item label="访问密码">
                            <a-input v-model="templateForm.content.accessPassword" placeholder="可选" />
                        </a-form-item>
                    </a-col>
                </a-row>
                <a-form-item label="个人排队">
                    <a-switch v-model="templateForm.content.usePersonalQueue" />
                </a-form-item>
                <a-form-item label="nodeInfoList 模板 JSON">
                    <a-textarea
                        v-model="templateForm.content.nodeInfoTemplateJson"
                        :auto-size="{ minRows: 6, maxRows: 14 }"
                        placeholder='例如 [{"nodeId":"12","fieldName":"image","fieldValue":"{{image}}"}]'
                    />
                </a-form-item>
            </div>

            <div
                v-if="templateForm.content.templateType === 'model-api' || templateForm.content.templateType === 'custom-api'"
                class="rounded-lg bg-gray-50 p-3 mb-4"
            >
                <div class="font-bold mb-2">直连 API 模板</div>
                <a-row :gutter="12">
                    <a-col :span="8">
                        <a-form-item label="提交路径" required>
                            <a-input v-model="templateForm.content.submitPath" placeholder="例如 /api/v3/contents/generations/tasks 或 /v1/images/generations" />
                        </a-form-item>
                    </a-col>
                    <a-col :span="8">
                        <a-form-item label="查询路径">
                            <a-input v-model="templateForm.content.queryPath" placeholder="例如 openapi/v2/query 或 /api/v3/contents/generations/tasks/{id}" />
                        </a-form-item>
                    </a-col>
                    <a-col :span="8">
                        <a-form-item label="取消路径">
                            <a-input v-model="templateForm.content.cancelPath" placeholder="可选" />
                        </a-form-item>
                    </a-col>
                </a-row>
                <a-row :gutter="12">
                    <a-col :span="8">
                        <a-form-item label="实例类型">
                            <a-input v-model="templateForm.content.instanceType" placeholder="可选" />
                        </a-form-item>
                    </a-col>
                    <a-col :span="8">
                        <a-form-item label="Webhook URL">
                            <a-input v-model="templateForm.content.webhookUrl" placeholder="可选" />
                        </a-form-item>
                    </a-col>
                    <a-col :span="8">
                        <a-form-item label="访问密码">
                            <a-input v-model="templateForm.content.accessPassword" placeholder="可选" />
                        </a-form-item>
                    </a-col>
                </a-row>
                <a-form-item label="请求体模板 JSON">
                    <a-textarea
                        v-model="templateForm.content.requestBodyTemplateJson"
                        :auto-size="{ minRows: 6, maxRows: 14 }"
                        placeholder='例如 {"prompt":"{{prompt}}","image":"{{imageUrl}}"}'
                    />
                    <div class="text-xs text-gray-500 mt-1">
                        ExchangeToken 示例：
                        Seedance 可填 `{"model":"seedance-2.0","content":[{"type":"text","text":"&#123;&#123;prompt&#125;&#125;"}],"duration":5,"resolution":"720p"}`
                        ，GPT Image 2 可填 `{"model":"gpt-image-2","prompt":"&#123;&#123;prompt&#125;&#125;","size":"1024x1024","quality":"high","n":1}`。
                    </div>
                </a-form-item>
            </div>

            <a-form-item label="输入字段 Schema JSON">
                <a-textarea
                    v-model="templateForm.content.inputSchemaJson"
                    :auto-size="{ minRows: 8, maxRows: 16 }"
                    placeholder='例如 [{"name":"prompt","label":"提示词","type":"textarea","required":true},{"name":"sourceImage","label":"源图片","type":"image","required":true}]'
                />
                <div class="text-xs text-gray-500 mt-1">
                    业务页会按这里的字段动态渲染输入表单，`nodeInfoList`、`workflow JSON`、`请求体模板` 里再用
                    <code>{{ schemaPlaceholderExample }}</code>
                    对应替换。
                </div>
            </a-form-item>

            <a-form-item label="预留字段映射 JSON">
                <a-textarea
                    v-model="templateForm.content.fieldMappingJson"
                    :auto-size="{ minRows: 3, maxRows: 8 }"
                    placeholder='可选，后续给复杂平台做额外映射，例如 {"face_id":"faceId"}'
                />
            </a-form-item>
        </a-form>
    </a-modal>
</template>
