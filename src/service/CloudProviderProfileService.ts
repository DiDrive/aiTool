import { StorageRecord, StorageService } from "./StorageService";

export type CloudProviderType = "runninghub" | "heygem" | "selfhost" | "custom" | "other";

export type CloudProviderProfileConfig = {
    providerType: CloudProviderType;
    baseUrl: string;
    apiKey: string;
    submitPath?: string;
    queryPath?: string;
    cancelPath?: string;
    extra?: Record<string, any>;
};

export type CloudProviderProfileRecord = {
    id?: number;
    title: string;
    content: CloudProviderProfileConfig;
};

const decode = (record: StorageRecord | null): CloudProviderProfileRecord | null => {
    if (!record) {
        return null;
    }
    return {
        id: record.id,
        title: record.title || "",
        content: {
            providerType: record.content?.providerType || "runninghub",
            baseUrl: record.content?.baseUrl || "",
            apiKey: record.content?.apiKey || "",
            submitPath: record.content?.submitPath || "",
            queryPath: record.content?.queryPath || "",
            cancelPath: record.content?.cancelPath || "",
            extra: record.content?.extra || {},
        },
    };
};

export const CloudProviderProfileService = {
    async get(id: number) {
        return decode(await StorageService.get(id));
    },
    async getByTitle(title: string) {
        return decode(await StorageService.getByTitle("CloudProviderProfile", title));
    },
    async list(): Promise<CloudProviderProfileRecord[]> {
        const records = await StorageService.list("CloudProviderProfile");
        return records.map(record => decode(record)!).filter(Boolean);
    },
    async save(record: CloudProviderProfileRecord) {
        if (!record.id) {
            await StorageService.add("CloudProviderProfile", {
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
    async delete(record: CloudProviderProfileRecord) {
        if (!record.id) {
            return;
        }
        await StorageService.delete({
            id: record.id,
            biz: "CloudProviderProfile",
            title: record.title,
            content: record.content,
        });
    },
};
