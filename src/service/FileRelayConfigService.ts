import { DirectApiPlatformContent, DirectApiPlatformService, isUsablePan123Relay } from "./DirectApiPlatformService";
import { StorageRecord, StorageService } from "./StorageService";

export type Pan123RelayConfig = NonNullable<DirectApiPlatformContent["directFileRelay"]> & {
    provider: "123pan";
};

export type FileRelayConfigContent = {
    pan123: Pan123RelayConfig;
};

export type FileRelayConfigRecord = {
    id?: number;
    title: string;
    content: FileRelayConfigContent;
};

const CONFIG_TITLE = "default";

const defaultPan123Relay = (): Pan123RelayConfig => ({
    provider: "123pan",
    enabled: false,
    clientID: "",
    clientSecret: "",
    parentFileID: "",
    urlAuthKey: "",
    assetMode: true,
});

const normalizePan123Relay = (value?: Partial<Pan123RelayConfig>): Pan123RelayConfig => ({
    ...defaultPan123Relay(),
    ...(value || {}),
    provider: "123pan",
    enabled: !!value?.enabled,
    clientID: String(value?.clientID || ""),
    clientSecret: String(value?.clientSecret || ""),
    parentFileID: value?.parentFileID || "",
    urlAuthKey: String(value?.urlAuthKey || ""),
    assetMode: value?.assetMode !== false,
});

const asPan123Relay = (value?: DirectApiPlatformContent["directFileRelay"] | null): Partial<Pan123RelayConfig> | undefined => {
    if (!value || value.provider !== "123pan") {
        return undefined;
    }
    return {
        ...value,
        provider: "123pan",
    };
};

const decode = (record: StorageRecord | null): FileRelayConfigRecord | null => {
    if (!record) {
        return null;
    }
    return {
        id: record.id,
        title: record.title || CONFIG_TITLE,
        content: {
            pan123: normalizePan123Relay(record.content?.pan123),
        },
    };
};

export const FileRelayConfigService = {
    async get(): Promise<FileRelayConfigRecord> {
        const record = decode(await StorageService.getByTitle("FileRelayConfig", CONFIG_TITLE));
        if (record) {
            return record;
        }
        const legacy = await DirectApiPlatformService.getReusablePan123Relay();
        return {
            title: CONFIG_TITLE,
            content: {
                pan123: normalizePan123Relay(asPan123Relay(legacy)),
            },
        };
    },
    async getPan123Relay(): Promise<Pan123RelayConfig | null> {
        const record = await this.get();
        if (isUsablePan123Relay(record.content.pan123)) {
            return record.content.pan123;
        }
        const legacy = await DirectApiPlatformService.getReusablePan123Relay();
        return legacy && isUsablePan123Relay(legacy) ? normalizePan123Relay(asPan123Relay(legacy)) : null;
    },
    async save(record: FileRelayConfigRecord) {
        const exists = await StorageService.getByTitle("FileRelayConfig", CONFIG_TITLE);
        const content: FileRelayConfigContent = {
            pan123: normalizePan123Relay(record.content?.pan123),
        };
        if (exists?.id) {
            await StorageService.update(exists.id, {
                title: CONFIG_TITLE,
                content,
            });
            return;
        }
        await StorageService.add("FileRelayConfig", {
            title: CONFIG_TITLE,
            content,
        });
    },
};
