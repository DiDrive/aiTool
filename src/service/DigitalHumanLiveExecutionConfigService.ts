import { StorageRecord, StorageService } from "./StorageService";

export type DigitalHumanLiveExecutionTemplateSlot =
    | "default"
    | "idle"
    | "welcome"
    | "talk"
    | "product"
    | "transition";

export type DigitalHumanLiveExecutionConfigContent = {
    defaultTemplateId?: number;
    defaultTemplateTitle?: string;
    idleTemplateId?: number;
    idleTemplateTitle?: string;
    welcomeTemplateId?: number;
    welcomeTemplateTitle?: string;
    talkTemplateId?: number;
    talkTemplateTitle?: string;
    productTemplateId?: number;
    productTemplateTitle?: string;
    transitionTemplateId?: number;
    transitionTemplateTitle?: string;
    status?: "draft" | "ready";
    notes?: string;
};

export type DigitalHumanLiveExecutionConfigRecord = {
    id?: number;
    title: string;
    content: DigitalHumanLiveExecutionConfigContent;
};

export const createEmptyDigitalHumanLiveExecutionConfigRecord = (): DigitalHumanLiveExecutionConfigRecord => ({
    title: "",
    content: {
        defaultTemplateId: 0,
        defaultTemplateTitle: "",
        idleTemplateId: 0,
        idleTemplateTitle: "",
        welcomeTemplateId: 0,
        welcomeTemplateTitle: "",
        talkTemplateId: 0,
        talkTemplateTitle: "",
        productTemplateId: 0,
        productTemplateTitle: "",
        transitionTemplateId: 0,
        transitionTemplateTitle: "",
        status: "draft",
        notes: "",
    },
});

const decode = (record: StorageRecord | null): DigitalHumanLiveExecutionConfigRecord | null => {
    if (!record) {
        return null;
    }
    const next = createEmptyDigitalHumanLiveExecutionConfigRecord();
    return {
        id: record.id,
        title: record.title || "",
        content: {
            ...next.content,
            defaultTemplateId: Number(record.content?.defaultTemplateId || 0),
            defaultTemplateTitle: record.content?.defaultTemplateTitle || "",
            idleTemplateId: Number(record.content?.idleTemplateId || 0),
            idleTemplateTitle: record.content?.idleTemplateTitle || "",
            welcomeTemplateId: Number(record.content?.welcomeTemplateId || 0),
            welcomeTemplateTitle: record.content?.welcomeTemplateTitle || "",
            talkTemplateId: Number(record.content?.talkTemplateId || 0),
            talkTemplateTitle: record.content?.talkTemplateTitle || "",
            productTemplateId: Number(record.content?.productTemplateId || 0),
            productTemplateTitle: record.content?.productTemplateTitle || "",
            transitionTemplateId: Number(record.content?.transitionTemplateId || 0),
            transitionTemplateTitle: record.content?.transitionTemplateTitle || "",
            status: record.content?.status || "draft",
            notes: record.content?.notes || "",
        },
    };
};

export const executionTemplateSlotLabel = (slot: DigitalHumanLiveExecutionTemplateSlot) => {
    switch (slot) {
        case "default":
            return "默认模板";
        case "idle":
            return "待机模板";
        case "welcome":
            return "欢迎模板";
        case "talk":
            return "讲解模板";
        case "product":
            return "商品模板";
        case "transition":
            return "过渡模板";
        default:
            return slot;
    }
};

export const DigitalHumanLiveExecutionConfigService = {
    async get(id: number) {
        return decode(await StorageService.get(id));
    },
    async getByTitle(title: string) {
        return decode(await StorageService.getByTitle("DigitalHumanLiveExecutionConfig", title));
    },
    async list(): Promise<DigitalHumanLiveExecutionConfigRecord[]> {
        const records = await StorageService.list("DigitalHumanLiveExecutionConfig");
        return records.map(record => decode(record)!).filter(Boolean);
    },
    async save(record: DigitalHumanLiveExecutionConfigRecord) {
        if (!record.id) {
            await StorageService.add("DigitalHumanLiveExecutionConfig", {
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
    async delete(record: DigitalHumanLiveExecutionConfigRecord) {
        if (!record.id) {
            return;
        }
        await StorageService.delete({
            id: record.id,
            biz: "DigitalHumanLiveExecutionConfig",
            title: record.title,
            content: record.content,
        });
    },
    pickTemplateId(
        record: DigitalHumanLiveExecutionConfigRecord | null | undefined,
        slot: DigitalHumanLiveExecutionTemplateSlot
    ) {
        if (!record) {
            return 0;
        }
        const content = record.content || {};
        const fallback = Number(content.defaultTemplateId || 0);
        if (slot === "default") {
            return fallback;
        }
        return Number((content as any)[`${slot}TemplateId`] || fallback || 0);
    },
};
