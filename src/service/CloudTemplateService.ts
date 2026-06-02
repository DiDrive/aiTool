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
    capabilities?: CloudTemplateCapability[];
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
    requestFormat?: "json" | "form-data";
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
        | "images"
        | "audio"
        | "audios"
        | "video"
        | "videos"
        | "files"
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

export const normalizeCloudTemplateCapabilities = (
    capability?: CloudTemplateCapability | CloudTemplateCapability[] | string,
    capabilities?: CloudTemplateCapability[] | string[]
) => {
    const values = [
        ...(Array.isArray(capabilities) ? capabilities : []),
        ...(Array.isArray(capability) ? capability : capability ? [capability] : []),
    ]
        .map(item => String(item || "").trim())
        .filter(Boolean) as CloudTemplateCapability[];
    return Array.from(new Set(values));
};

export const getTemplateCapabilities = (record?: CloudTemplateRecord | null) => {
    const values = normalizeCloudTemplateCapabilities(record?.content?.capability, record?.content?.capabilities);
    return values.length > 0 ? values : (["video"] as CloudTemplateCapability[]);
};

export const getTemplatePrimaryCapability = (record?: CloudTemplateRecord | null): CloudTemplateCapability => {
    return getTemplateCapabilities(record)[0] ?? "video";
};

export const templateSupportsCapability = (
    record: CloudTemplateRecord | null | undefined,
    capability: CloudTemplateCapability
) => {
    return getTemplateCapabilities(record).includes(capability);
};

const decode = (record: StorageRecord | null): CloudTemplateRecord | null => {
    if (!record) {
        return null;
    }
    const capabilities = normalizeCloudTemplateCapabilities(
        record.content?.capability,
        record.content?.capabilities
    );
    const primaryCapability = capabilities[0] || "video";
    return {
        id: record.id,
        title: record.title || "",
        content: {
            capability: primaryCapability,
            capabilities,
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
            requestFormat: record.content?.requestFormat || "json",
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
        return records.filter(record => templateSupportsCapability(record, capability));
    },
    async save(record: CloudTemplateRecord) {
        const capabilities = getTemplateCapabilities(record);
        const content = {
            ...record.content,
            capability: capabilities[0] || "video",
            capabilities,
        };
        if (!record.id) {
            await StorageService.add("CloudTemplate", {
                title: record.title,
                content,
            });
            return;
        }
        await StorageService.update(record.id, {
            title: record.title,
            content,
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
