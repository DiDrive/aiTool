import { StorageRecord, StorageService } from "./StorageService";
import { CloudProviderType } from "./CloudProviderProfileService";

export type CloudTemplateCapability =
    | "image"
    | "video"
    | "lipsync"
    | "audio"
    | "voice-clone"
    | "digital-human";

export type CloudTemplateType = "workflow" | "ai-app" | "model-api" | "custom-api";

export type CloudTemplateContent = {
    capability: CloudTemplateCapability;
    templateType: CloudTemplateType;
    providerType: CloudProviderType;
    providerProfileId?: number;
    providerProfileTitle?: string;
    description?: string;
    workflowFileName?: string;
    workflowJson?: string;
    webappId?: string;
    workflowId?: string;
    submitPath?: string;
    queryPath?: string;
    cancelPath?: string;
    webhookUrl?: string;
    instanceType?: string;
    accessPassword?: string;
    addMetadata?: boolean;
    retainSeconds?: number | null;
    usePersonalQueue?: boolean;
    nodeInfoTemplateJson?: string;
    requestBodyTemplateJson?: string;
    inputSchemaJson?: string;
    fieldMappingJson?: string;
};

export type CloudTemplateInputSchemaField = {
    name: string;
    label: string;
    type:
        | "input"
        | "textarea"
        | "number"
        | "switch"
        | "select"
        | "image"
        | "audio"
        | "video"
        | "file";
    required?: boolean;
    placeholder?: string;
    defaultValue?: any;
    options?: Array<{
        label: string;
        value: string | number | boolean;
    }>;
    help?: string;
};

export type CloudTemplateRecord = {
    id?: number;
    title: string;
    content: CloudTemplateContent;
};

const decode = (record: StorageRecord | null): CloudTemplateRecord | null => {
    if (!record) {
        return null;
    }
    return {
        id: record.id,
        title: record.title || "",
        content: {
            capability: record.content?.capability || "video",
            templateType: record.content?.templateType || "workflow",
            providerType: record.content?.providerType || "runninghub",
            providerProfileId: record.content?.providerProfileId || 0,
            providerProfileTitle: record.content?.providerProfileTitle || "",
            description: record.content?.description || "",
            workflowFileName: record.content?.workflowFileName || "",
            workflowJson: record.content?.workflowJson || "",
            webappId: record.content?.webappId || "",
            workflowId: record.content?.workflowId || "",
            submitPath: record.content?.submitPath || "",
            queryPath: record.content?.queryPath || "",
            cancelPath: record.content?.cancelPath || "",
            webhookUrl: record.content?.webhookUrl || "",
            instanceType: record.content?.instanceType || "",
            accessPassword: record.content?.accessPassword || "",
            addMetadata: typeof record.content?.addMetadata === "boolean" ? record.content.addMetadata : true,
            retainSeconds:
                typeof record.content?.retainSeconds === "number" ? record.content.retainSeconds : null,
            usePersonalQueue:
                typeof record.content?.usePersonalQueue === "boolean" ? record.content.usePersonalQueue : false,
            nodeInfoTemplateJson: record.content?.nodeInfoTemplateJson || "",
            requestBodyTemplateJson: record.content?.requestBodyTemplateJson || "",
            inputSchemaJson: record.content?.inputSchemaJson || "[]",
            fieldMappingJson: record.content?.fieldMappingJson || "",
        },
    };
};

export const CloudTemplateService = {
    async get(id: number) {
        return decode(await StorageService.get(id));
    },
    async getByTitle(title: string) {
        return decode(await StorageService.getByTitle("CloudTemplate", title));
    },
    async list(): Promise<CloudTemplateRecord[]> {
        const records = await StorageService.list("CloudTemplate");
        return records.map(record => decode(record)!).filter(Boolean);
    },
    async listByCapability(capability: CloudTemplateCapability): Promise<CloudTemplateRecord[]> {
        const records = await this.list();
        return records.filter(record => record.content.capability === capability);
    },
    async save(record: CloudTemplateRecord) {
        if (!record.id) {
            await StorageService.add("CloudTemplate", {
                title: record.title,
                content: record.content,
            });
            return;
        }
        await StorageService.update(record.id, {
            title: record.title,
            content: record.content,
        });
    },
    async delete(record: CloudTemplateRecord) {
        if (!record.id) {
            return;
        }
        await StorageService.delete({
            id: record.id,
            biz: "CloudTemplate",
            title: record.title,
            content: record.content,
        });
    },
};
