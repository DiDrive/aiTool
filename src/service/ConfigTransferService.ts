import { AppConfig } from "../config";
import { CloudProviderProfileService } from "./CloudProviderProfileService";
import { CloudTemplateRecord, CloudTemplateService } from "./CloudTemplateService";
import { DirectApiPlatformRecord, DirectApiPlatformService, isUsablePan123Relay } from "./DirectApiPlatformService";
import { FileRelayConfigRecord, FileRelayConfigService } from "./FileRelayConfigService";

type ConfigPackage = {
    schema: "aigcpanel.config-package";
    version: 1;
    appVersion?: string;
    exportedAt: string;
    data: {
        directApiPlatforms?: DirectApiPlatformRecord[];
        fileRelayConfig?: FileRelayConfigRecord;
        cloudProviderProfiles?: Awaited<ReturnType<typeof CloudProviderProfileService.list>>;
        cloudTemplates?: CloudTemplateRecord[];
    };
};

type ImportSummary = {
    directApiPlatforms: number;
    fileRelayConfig: number;
    cloudProviderProfiles: number;
    cloudTemplates: number;
};

const stripId = <T extends { id?: number }>(record: T): T => {
    const copy = JSON.parse(JSON.stringify(record || {}));
    delete copy.id;
    return copy;
};

const normalizePlatformBaseUrl = (platformType: string, baseUrl?: string) => {
    const value = String(baseUrl || "").trim();
    if (platformType === "kwjm") {
        if (!value || /^https:\/\/kwjm\.com\/?$/i.test(value)) {
            return "https://www.kwjm.com";
        }
        return value.replace(/\/docs\/?$/i, "");
    }
    return value || "https://api.exchangetoken.ai";
};

const legacyRelayConfigFromPlatforms = (records?: DirectApiPlatformRecord[]): FileRelayConfigRecord | null => {
    const relay = (records || [])
        .map(record => record.content?.directFileRelay)
        .find(item => isUsablePan123Relay(item));
    if (!relay) {
        return null;
    }
    return {
        title: "default",
        content: {
            pan123: {
                provider: "123pan",
                enabled: true,
                clientID: relay.clientID || "",
                clientSecret: relay.clientSecret || "",
                parentFileID: relay.parentFileID || "",
                urlAuthKey: relay.urlAuthKey || "",
                assetMode: relay.assetMode !== false,
            },
        },
    };
};

const normalizePackage = (raw: any): ConfigPackage => {
    if (!raw || typeof raw !== "object" || raw.schema !== "aigcpanel.config-package") {
        throw new Error("不是有效的唯变AI工作台配置包");
    }
    return {
        schema: "aigcpanel.config-package",
        version: Number(raw.version || 1) as 1,
        appVersion: String(raw.appVersion || ""),
        exportedAt: String(raw.exportedAt || ""),
        data: {
            directApiPlatforms: Array.isArray(raw.data?.directApiPlatforms) ? raw.data.directApiPlatforms : [],
            fileRelayConfig: raw.data?.fileRelayConfig || undefined,
            cloudProviderProfiles: Array.isArray(raw.data?.cloudProviderProfiles) ? raw.data.cloudProviderProfiles : [],
            cloudTemplates: Array.isArray(raw.data?.cloudTemplates) ? raw.data.cloudTemplates : [],
        },
    };
};

const saveDirectApiPlatformByTitle = async (record: DirectApiPlatformRecord) => {
    const title = String(record.title || "").trim();
    if (!title) {
        return false;
    }
    const exists = await DirectApiPlatformService.getByTitle(title);
    await DirectApiPlatformService.save({
        ...stripId(record),
        id: exists?.id,
        title,
        content: {
            ...(record.content || {}),
            platformType: record.content?.platformType || "exchangetoken",
            baseUrl: normalizePlatformBaseUrl(record.content?.platformType || "exchangetoken", record.content?.baseUrl),
            apiKey: record.content?.apiKey || "",
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
            capabilities: Array.isArray(record.content?.capabilities) ? record.content.capabilities : [],
        },
    });
    return true;
};

const saveCloudProviderByTitle = async (record: Awaited<ReturnType<typeof CloudProviderProfileService.list>>[number]) => {
    const title = String(record.title || "").trim();
    if (!title) {
        return false;
    }
    const exists = await CloudProviderProfileService.getByTitle(title);
    await CloudProviderProfileService.save({
        ...stripId(record),
        id: exists?.id,
        title,
        content: {
            ...record.content,
            extra: record.content?.extra || {},
        },
    });
    return true;
};

const saveCloudTemplateByTitle = async (record: CloudTemplateRecord) => {
    const title = String(record.title || "").trim();
    if (!title) {
        return false;
    }
    const providerTitle = String(record.content?.providerProfileTitle || "").trim();
    const provider = providerTitle ? await CloudProviderProfileService.getByTitle(providerTitle) : null;
    const exists = await CloudTemplateService.getByTitle(title);
    await CloudTemplateService.save({
        ...stripId(record),
        id: exists?.id,
        title,
        content: {
            ...record.content,
            providerProfileId: provider?.id || record.content?.providerProfileId || 0,
            providerProfileTitle: provider?.title || providerTitle,
        },
    });
    return true;
};

export const ConfigTransferService = {
    async buildPackage(): Promise<ConfigPackage> {
        return {
            schema: "aigcpanel.config-package",
            version: 1,
            appVersion: AppConfig.version,
            exportedAt: new Date().toISOString(),
            data: {
                directApiPlatforms: (await DirectApiPlatformService.list()).map(stripId),
                fileRelayConfig: stripId(await FileRelayConfigService.get()),
                cloudProviderProfiles: (await CloudProviderProfileService.list()).map(stripId),
                cloudTemplates: (await CloudTemplateService.list()).map(stripId),
            },
        };
    },
    async exportToFile(filePath: string) {
        const data = await this.buildPackage();
        await window.$mapi.file.write(filePath, JSON.stringify(data, null, 2), { isDataPath: false });
        return data;
    },
    async importFromFile(filePath: string): Promise<ImportSummary> {
        const content = await window.$mapi.file.read(filePath, { isDataPath: false });
        const data = normalizePackage(JSON.parse(String(content || "{}")));
        const summary: ImportSummary = {
            directApiPlatforms: 0,
            fileRelayConfig: 0,
            cloudProviderProfiles: 0,
            cloudTemplates: 0,
        };
        const fileRelayConfig = data.data.fileRelayConfig || legacyRelayConfigFromPlatforms(data.data.directApiPlatforms);
        if (fileRelayConfig) {
            await FileRelayConfigService.save(fileRelayConfig);
            summary.fileRelayConfig = 1;
        }
        for (const record of data.data.directApiPlatforms || []) {
            if (await saveDirectApiPlatformByTitle(record)) {
                summary.directApiPlatforms += 1;
            }
        }
        for (const record of data.data.cloudProviderProfiles || []) {
            if (await saveCloudProviderByTitle(record)) {
                summary.cloudProviderProfiles += 1;
            }
        }
        for (const record of data.data.cloudTemplates || []) {
            if (await saveCloudTemplateByTitle(record)) {
                summary.cloudTemplates += 1;
            }
        }
        return summary;
    },
};
