import { StorageRecord, StorageService } from "./StorageService";

export type DirectApiPlatformType = "exchangetoken" | "custom";
export type DirectApiCapability = "seedance" | "gpt-image-2";

export type DirectApiPlatformContent = {
    platformType: DirectApiPlatformType;
    baseUrl: string;
    apiKey: string;
    capabilities: DirectApiCapability[];
    isDefault?: boolean;
};

export type DirectApiPlatformRecord = {
    id?: number;
    title: string;
    content: DirectApiPlatformContent;
};

const DEFAULT_CAPABILITIES: DirectApiCapability[] = ["seedance", "gpt-image-2"];

const decode = (record: StorageRecord | null): DirectApiPlatformRecord | null => {
    if (!record) {
        return null;
    }
    return {
        id: record.id,
        title: record.title || "",
        content: {
            platformType: record.content?.platformType || "exchangetoken",
            baseUrl: record.content?.baseUrl || "https://api.exchangetoken.ai",
            apiKey: record.content?.apiKey || "",
            capabilities: Array.isArray(record.content?.capabilities)
                ? record.content.capabilities
                : DEFAULT_CAPABILITIES,
            isDefault: !!record.content?.isDefault,
        },
    };
};

export const DirectApiPlatformService = {
    async get(id: number) {
        return decode(await StorageService.get(id));
    },
    async getByTitle(title: string) {
        return decode(await StorageService.getByTitle("DirectApiPlatform", title));
    },
    async list(): Promise<DirectApiPlatformRecord[]> {
        const records = await StorageService.list("DirectApiPlatform");
        return records.map(record => decode(record)!).filter(Boolean);
    },
    async listByCapability(capability: DirectApiCapability): Promise<DirectApiPlatformRecord[]> {
        const records = await this.list();
        return records.filter(record => record.content.capabilities.includes(capability));
    },
    async save(record: DirectApiPlatformRecord) {
        const content = {
            ...record.content,
            capabilities: Array.from(new Set(record.content.capabilities || [])),
        };
        if (content.isDefault) {
            const records = await this.list();
            for (const item of records) {
                if (item.id && item.id !== record.id && item.content.isDefault) {
                    await StorageService.update(item.id, {
                        content: {
                            ...item.content,
                            isDefault: false,
                        },
                    });
                }
            }
        }
        if (!record.id) {
            await StorageService.add("DirectApiPlatform", {
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
    async delete(record: DirectApiPlatformRecord) {
        if (!record.id) {
            return;
        }
        await StorageService.delete({
            id: record.id,
            biz: "DirectApiPlatform",
            title: record.title,
            content: record.content,
        });
    },
    async getDefault(capability: DirectApiCapability) {
        const records = await this.listByCapability(capability);
        return records.find(record => record.content.isDefault) || records[0] || null;
    },
};
