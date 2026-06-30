import { TimeUtil } from "../lib/util";
import {
    CloudProviderProfileRecord,
    CloudProviderProfileService,
} from "./CloudProviderProfileService";
import {
    CloudTemplateInputSchemaField,
    CloudTemplateCapability,
    CloudTemplateRecord,
    CloudTemplateService,
    getTemplatePrimaryCapability,
} from "./CloudTemplateService";
import { TaskRecord } from "./TaskService";
import { RunningHubModelConfigType } from "../pages/Apps/RunningHubStudio/type";

export type CloudTemplateInput = Record<string, any>;

const fieldText = (field: Partial<CloudTemplateInputSchemaField>) => {
    return [field?.name, field?.label, field?.placeholder, field?.help]
        .map(item => String(item || "").toLowerCase())
        .join(" ");
};

const fieldLooksLikeCount = (field: Partial<CloudTemplateInputSchemaField>) => {
    return /图片数量|图像数量|生成数量|数量|张数|个数|count|number|num\b/.test(fieldText(field));
};

const fieldLooksLikeMultiFile = (field: Partial<CloudTemplateInputSchemaField>) => {
    return /多图|多张|多文件|批量|数组|\[\]|images|imageurls|referenceimages|files/.test(fieldText(field));
};

const normalizeSchemaField = (field: CloudTemplateInputSchemaField): CloudTemplateInputSchemaField => {
    if (fieldLooksLikeCount(field)) {
        return {
            ...field,
            type: "number",
            defaultValue:
                typeof field.defaultValue === "undefined" || field.defaultValue === null || field.defaultValue === ""
                    ? 1
                    : field.defaultValue,
        };
    }
    if (field.type === "image" && fieldLooksLikeMultiFile(field)) {
        return { ...field, type: "images" };
    }
    if (field.type === "file" && fieldLooksLikeMultiFile(field)) {
        return { ...field, type: "files" };
    }
    return field;
};

const escapeForJsonString = (value: any) => {
    return JSON.stringify(String(value ?? "")).slice(1, -1);
};

const escapeRegExp = (value: string) => {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const replacePlaceholders = (content: string, variables: Record<string, any>) => {
    let result = String(content || "");
    for (const [key, value] of Object.entries(variables)) {
        if (value && typeof value === "object") {
            result = result.replace(
                new RegExp(`"\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}"`, "g"),
                JSON.stringify(value)
            );
        }
        const safe = escapeForJsonString(value);
        result = result.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, "g"), safe);
    }
    return result;
};

const ensureProviderProfile = async (template: CloudTemplateRecord) => {
    if (!template.content.providerProfileId) {
        throw new Error("模板未绑定供应商配置");
    }
    const providerProfile = await CloudProviderProfileService.get(template.content.providerProfileId);
    if (!providerProfile) {
        throw new Error("供应商配置不存在，请重新选择");
    }
    return providerProfile;
};

export const parseTemplateInputSchema = (raw: string): CloudTemplateInputSchemaField[] => {
    const text = String(raw || "").trim();
    if (!text) {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter(item => item && item.name && item.label && item.type)
            .map(item => normalizeSchemaField(item));
    } catch (e) {
        return [];
    }
};

const appendFlatVariables = (target: Record<string, any>, prefix: string, value: any) => {
    if (value === null || typeof value === "undefined") {
        target[prefix] = "";
        return;
    }
    if (Array.isArray(value)) {
        target[prefix] = value;
        value.forEach((item, index) => {
            appendFlatVariables(target, `${prefix}.${index}`, item);
        });
        return;
    }
    if (typeof value === "object") {
        target[prefix] = value;
        for (const [key, child] of Object.entries(value)) {
            appendFlatVariables(target, `${prefix}.${key}`, child);
        }
        return;
    }
    target[prefix] = String(value);
};

const buildVariables = (input: CloudTemplateInput) => {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(input || {})) {
        if (value === null || typeof value === "undefined") {
            result[key] = "";
            continue;
        }
        if (typeof value === "object") {
            appendFlatVariables(result, key, value);
            continue;
        }
        result[key] = String(value);
    }
    const prompt = String(input.prompt || input.text || "").trim();
    const text = String(input.text || input.prompt || "").trim();
    const image = String(input.image || input.imageUrl || "").trim();
    const audio = String(input.audio || input.audioUrl || "").trim();
    const video = String(input.video || input.videoUrl || "").trim();
    const title = String(input.title || "").trim();
    return {
        ...result,
        prompt,
        text,
        image,
        imageUrl: image,
        audio,
        audioUrl: audio,
        video,
        videoUrl: video,
        title,
    };
};

const buildConnectorType = (template: CloudTemplateRecord) => {
    if (template.content.templateType === "workflow") {
        return "workflow";
    }
    if (template.content.templateType === "ai-app") {
        return "ai-app";
    }
    return "model-api";
};

const buildModelConfig = async (
    template: CloudTemplateRecord,
    providerProfile: CloudProviderProfileRecord,
    input: CloudTemplateInput
): Promise<RunningHubModelConfigType> => {
    const variables = buildVariables(input);
    const connectorType = buildConnectorType(template);
    const selectedCapability = (String(input.selectedCapability || "").trim() as CloudTemplateCapability) || "";
    const capability = selectedCapability || getTemplatePrimaryCapability(template);
    return {
        capability,
        connectorType,
        providerType: providerProfile.content.providerType,
        providerProfileId: providerProfile.id,
        providerProfileTitle: providerProfile.title,
        templateId: template.id,
        templateTitle: template.title,
        templateType: template.content.templateType,
        baseUrl: providerProfile.content.baseUrl,
        apiKey: providerProfile.content.apiKey,
        submitPath: template.content.submitPath || providerProfile.content.submitPath || "",
        queryPath: template.content.queryPath || providerProfile.content.queryPath || "openapi/v2/query",
        cancelPath: template.content.cancelPath || providerProfile.content.cancelPath || "",
        webhookUrl: template.content.webhookUrl || "",
        instanceType: template.content.instanceType || "",
        accessPassword: template.content.accessPassword || "",
        addMetadata: typeof template.content.addMetadata === "boolean" ? template.content.addMetadata : true,
        retainSeconds:
            typeof template.content.retainSeconds === "number" ? template.content.retainSeconds : null,
        usePersonalQueue:
            typeof template.content.usePersonalQueue === "boolean" ? template.content.usePersonalQueue : false,
        webappId: template.content.webappId || "",
        workflowId: template.content.workflowId || "",
        workflowJson: replacePlaceholders(template.content.workflowJson || "", variables),
        nodeInfoListJson: replacePlaceholders(template.content.nodeInfoTemplateJson || "[]", variables),
        requestBodyJson: replacePlaceholders(template.content.requestBodyTemplateJson || "{}", variables),
        saveAsVideoTemplate: capability === "digital-human",
    };
};

const buildTitle = (template: CloudTemplateRecord, input: CloudTemplateInput) => {
    const parts = [template.title, input.title || input.prompt || input.text || "", TimeUtil.datetimeString()]
        .map(item => String(item || "").trim())
        .filter(Boolean);
    return parts.join("_");
};

export const CloudTemplateTaskService = {
    parseInputSchema(raw: string) {
        return parseTemplateInputSchema(raw);
    },
    async listTemplates(capability: CloudTemplateCapability) {
        return await CloudTemplateService.listByCapability(capability);
    },
    async buildTaskRecord(templateId: number, input: CloudTemplateInput): Promise<TaskRecord> {
        const template = await CloudTemplateService.get(templateId);
        if (!template) {
            throw new Error("模板不存在");
        }
        const providerProfile = await ensureProviderProfile(template);
        const modelConfig = await buildModelConfig(template, providerProfile, input);
        return {
            biz: "RunningHubTask",
            title: buildTitle(template, input),
            serverName: "",
            serverTitle: "",
            serverVersion: "",
            modelConfig,
            param: {
                input,
            },
        };
    },
};
