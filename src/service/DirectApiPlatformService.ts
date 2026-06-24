import { StorageRecord, StorageService } from "./StorageService";

export type DirectApiPlatformType = "exchangetoken" | "modeltop" | "kwjm" | "custom";
export type DirectApiCapability = "seedance" | "gpt-image-2";

export type DirectApiPlatformContent = {
    platformType: DirectApiPlatformType;
    baseUrl: string;
    apiKey: string;
    proxyUrl?: string;
    directFileRelay: {
        provider?: "123pan" | "modeltop-assets" | "kwjm-assets";
        enabled?: boolean;
        clientID?: string;
        clientSecret?: string;
        parentFileID?: number | string;
        urlAuthKey?: string;
        assetMode?: boolean;
        kwjmAssetReturnUrl?: boolean;
    };
    capabilities: DirectApiCapability[];
    isDefault?: boolean;
};

export type DirectApiPlatformRecord = {
    id?: number;
    title: string;
    content: DirectApiPlatformContent;
};

const DEFAULT_CAPABILITIES: DirectApiCapability[] = ["seedance", "gpt-image-2"];

export const isUsablePan123Relay = (relay?: DirectApiPlatformContent["directFileRelay"]) => {
    return Boolean(
        relay?.enabled &&
            relay.provider === "123pan" &&
            String(relay.clientID || "").trim() &&
            String(relay.clientSecret || "").trim() &&
            String(relay.parentFileID || "").trim()
    );
};

const normalizeApiKey = (value?: string) => {
    let key = String(value || "")
        .trim()
        .replace(/\uFEFF/g, "")
        .replace(/：/g, ":");
    key = key.replace(/^Authorization\s*:\s*/i, "").trim();
    key = key.replace(/^Bearer\s+/i, "").trim();
    key = key.replace(/^Bearer\s*:\s*/i, "").trim();
    return key;
};

const normalizeBaseUrl = (platformType: DirectApiPlatformType, value?: string) => {
    const baseUrl = String(value || "").trim();
    if (platformType === "kwjm" && /^https:\/\/kwjm\.com\/?$/i.test(baseUrl)) {
        return "https://www.kwjm.com";
    }
    return baseUrl || (platformType === "kwjm" ? "https://www.kwjm.com" : "https://api.exchangetoken.ai");
};

const decode = (record: StorageRecord | null): DirectApiPlatformRecord | null => {
    if (!record) {
        return null;
    }
    const platformType = record.content?.platformType || "exchangetoken";
    return {
        id: record.id,
        title: record.title || "",
        content: {
            platformType,
            baseUrl: normalizeBaseUrl(platformType, record.content?.baseUrl),
            apiKey: normalizeApiKey(record.content?.apiKey || ""),
            proxyUrl: record.content?.proxyUrl || "",
            directFileRelay: {
                provider: record.content?.directFileRelay?.provider || "123pan",
                enabled: !!record.content?.directFileRelay?.enabled,
                clientID: record.content?.directFileRelay?.clientID || "",
                clientSecret: record.content?.directFileRelay?.clientSecret || "",
                parentFileID: record.content?.directFileRelay?.parentFileID || "",
                urlAuthKey: record.content?.directFileRelay?.urlAuthKey || "",
                assetMode: record.content?.directFileRelay?.assetMode !== false,
            },
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
            apiKey: normalizeApiKey(record.content.apiKey),
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
    async getReusablePan123Relay() {
        const records = await this.list();
        return records.find(record => isUsablePan123Relay(record.content.directFileRelay))?.content.directFileRelay || null;
    },
};
