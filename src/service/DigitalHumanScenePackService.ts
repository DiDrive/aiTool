import { StorageRecord, StorageService } from "./StorageService";
import { DigitalHumanDisplayMode } from "./DigitalHumanClipService";

export type DigitalHumanScenePackContent = {
    identityId?: number;
    identityTitle?: string;
    executionConfigId?: number;
    executionConfigTitle?: string;
    idleClipId?: number;
    welcomeClipIds?: number[];
    talkClipIds?: number[];
    productClipIds?: number[];
    transitionClipIds?: number[];
    defaultDisplayMode?: DigitalHumanDisplayMode;
    autoReturnToIdle?: boolean;
    idlePaddingMs?: number;
    talkPaddingMs?: number;
    productInsertMode?: "auto" | "manual" | "disabled";
    overlayPosition?: "left" | "right" | "bottom" | "full";
    tags?: string[];
    status?: "draft" | "ready";
    notes?: string;
};

export type DigitalHumanScenePackRecord = {
    id?: number;
    title: string;
    content: DigitalHumanScenePackContent;
};

export const createEmptyDigitalHumanScenePackRecord = (): DigitalHumanScenePackRecord => ({
    title: "",
    content: {
        identityId: 0,
        identityTitle: "",
        executionConfigId: 0,
        executionConfigTitle: "",
        idleClipId: 0,
        welcomeClipIds: [],
        talkClipIds: [],
        productClipIds: [],
        transitionClipIds: [],
        defaultDisplayMode: "normal",
        autoReturnToIdle: true,
        idlePaddingMs: 800,
        talkPaddingMs: 400,
        productInsertMode: "auto",
        overlayPosition: "right",
        tags: [],
        status: "draft",
        notes: "",
    },
});

const decode = (record: StorageRecord | null): DigitalHumanScenePackRecord | null => {
    if (!record) {
        return null;
    }
    const next = createEmptyDigitalHumanScenePackRecord();
    return {
        id: record.id,
        title: record.title || "",
        content: {
            ...next.content,
            identityId: Number(record.content?.identityId || 0),
            identityTitle: record.content?.identityTitle || "",
            executionConfigId: Number(record.content?.executionConfigId || 0),
            executionConfigTitle: record.content?.executionConfigTitle || "",
            idleClipId: Number(record.content?.idleClipId || 0),
            welcomeClipIds: Array.isArray(record.content?.welcomeClipIds) ? record.content.welcomeClipIds : [],
            talkClipIds: Array.isArray(record.content?.talkClipIds) ? record.content.talkClipIds : [],
            productClipIds: Array.isArray(record.content?.productClipIds) ? record.content.productClipIds : [],
            transitionClipIds: Array.isArray(record.content?.transitionClipIds)
                ? record.content.transitionClipIds
                : [],
            defaultDisplayMode: record.content?.defaultDisplayMode || "normal",
            autoReturnToIdle:
                typeof record.content?.autoReturnToIdle === "boolean"
                    ? record.content.autoReturnToIdle
                    : true,
            idlePaddingMs: Number(record.content?.idlePaddingMs || 800),
            talkPaddingMs: Number(record.content?.talkPaddingMs || 400),
            productInsertMode: record.content?.productInsertMode || "auto",
            overlayPosition: record.content?.overlayPosition || "right",
            tags: Array.isArray(record.content?.tags) ? record.content.tags : [],
            status: record.content?.status || "draft",
            notes: record.content?.notes || "",
        },
    };
};

export const DigitalHumanScenePackService = {
    async get(id: number) {
        return decode(await StorageService.get(id));
    },
    async getByTitle(title: string) {
        return decode(await StorageService.getByTitle("DigitalHumanScenePack", title));
    },
    async list(): Promise<DigitalHumanScenePackRecord[]> {
        const records = await StorageService.list("DigitalHumanScenePack");
        return records.map(record => decode(record)!).filter(Boolean);
    },
    async listByIdentity(identityId: number): Promise<DigitalHumanScenePackRecord[]> {
        const records = await this.list();
        return records.filter(record => Number(record.content.identityId || 0) === Number(identityId || 0));
    },
    async save(record: DigitalHumanScenePackRecord) {
        if (!record.id) {
            await StorageService.add("DigitalHumanScenePack", {
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
    async delete(record: DigitalHumanScenePackRecord) {
        if (!record.id) {
            return;
        }
        await StorageService.delete({
            id: record.id,
            biz: "DigitalHumanScenePack",
            title: record.title,
            content: record.content,
        });
    },
};
