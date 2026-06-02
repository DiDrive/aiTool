import { StorageRecord, StorageService } from "./StorageService";
import { TaskRecord } from "./TaskService";

export type DigitalHumanClipType =
    | "idle"
    | "welcome"
    | "talk"
    | "product"
    | "holding"
    | "transition";

export type DigitalHumanDisplayMode =
    | "normal"
    | "overlay"
    | "table"
    | "hold-left"
    | "hold-right"
    | "hold-both"
    | "product-clip";

export type DigitalHumanClipContent = {
    identityId?: number;
    identityTitle?: string;
    templateId?: number;
    templateTitle?: string;
    taskId?: number;
    capability?: string;
    clipType: DigitalHumanClipType;
    displayMode: DigitalHumanDisplayMode;
    coverImage?: string;
    videoUrl?: string;
    audioUrl?: string;
    text?: string;
    productId?: string;
    productTitle?: string;
    tags?: string[];
    durationSeconds?: number;
    sourceType?: "task" | "manual" | "import";
    status?: "draft" | "ready" | "archived";
    meta?: Record<string, any>;
};

export type DigitalHumanClipRecord = {
    id?: number;
    title: string;
    content: DigitalHumanClipContent;
};

export const createDigitalHumanClipRecordFromTask = (input: {
    task: TaskRecord;
    title: string;
    clipType: DigitalHumanClipType;
    displayMode: DigitalHumanDisplayMode;
    outputUrl: string;
    outputType: "image" | "video" | "audio" | "file";
    identityId?: number;
    identityTitle?: string;
    productTitle?: string;
    productId?: string;
    durationSeconds?: number;
    tags?: string[];
}): DigitalHumanClipRecord => {
    const task = input.task;
    const modelConfig = (task as any)?.modelConfig || {};
    const content: DigitalHumanClipContent = {
        identityId: input.identityId || undefined,
        identityTitle: input.identityTitle || "",
        templateId: Number(modelConfig?.templateId || 0) || undefined,
        templateTitle: String(modelConfig?.templateTitle || ""),
        taskId: Number(task?.id || 0) || undefined,
        capability: String(modelConfig?.capability || ""),
        clipType: input.clipType,
        displayMode: input.displayMode,
        coverImage: input.outputType === "image" ? input.outputUrl : "",
        videoUrl: input.outputType === "video" ? input.outputUrl : "",
        audioUrl: input.outputType === "audio" ? input.outputUrl : "",
        text: String((task as any)?.param?.input?.text || (task as any)?.param?.input?.prompt || ""),
        productId: input.productId || "",
        productTitle: input.productTitle || "",
        tags: Array.isArray(input.tags) ? input.tags : [],
        durationSeconds: Number(input.durationSeconds || 0),
        sourceType: "task",
        status: "ready",
        meta: {
            outputType: input.outputType,
            outputUrl: input.outputUrl,
            taskTitle: task?.title || "",
            providerType: modelConfig?.providerType || "",
            providerProfileTitle: modelConfig?.providerProfileTitle || "",
        },
    };
    return {
        title: input.title,
        content,
    };
};

export const createEmptyDigitalHumanClipRecord = (): DigitalHumanClipRecord => ({
    title: "",
    content: {
        clipType: "talk",
        displayMode: "normal",
        coverImage: "",
        videoUrl: "",
        audioUrl: "",
        text: "",
        productId: "",
        productTitle: "",
        tags: [],
        durationSeconds: 0,
        sourceType: "manual",
        status: "draft",
        meta: {},
    },
});

const decode = (record: StorageRecord | null): DigitalHumanClipRecord | null => {
    if (!record) {
        return null;
    }
    const next = createEmptyDigitalHumanClipRecord();
    return {
        id: record.id,
        title: record.title || "",
        content: {
            ...next.content,
            identityId: Number(record.content?.identityId || 0) || undefined,
            identityTitle: record.content?.identityTitle || "",
            templateId: Number(record.content?.templateId || 0) || undefined,
            templateTitle: record.content?.templateTitle || "",
            taskId: Number(record.content?.taskId || 0) || undefined,
            capability: record.content?.capability || "",
            clipType: record.content?.clipType || "talk",
            displayMode: record.content?.displayMode || "normal",
            coverImage: record.content?.coverImage || "",
            videoUrl: record.content?.videoUrl || "",
            audioUrl: record.content?.audioUrl || "",
            text: record.content?.text || "",
            productId: record.content?.productId || "",
            productTitle: record.content?.productTitle || "",
            tags: Array.isArray(record.content?.tags) ? record.content.tags : [],
            durationSeconds: Number(record.content?.durationSeconds || 0),
            sourceType: record.content?.sourceType || "manual",
            status: record.content?.status || "draft",
            meta: record.content?.meta || {},
        },
    };
};

export const DigitalHumanClipService = {
    async get(id: number) {
        return decode(await StorageService.get(id));
    },
    async getByTitle(title: string) {
        return decode(await StorageService.getByTitle("DigitalHumanClip", title));
    },
    async list(): Promise<DigitalHumanClipRecord[]> {
        const records = await StorageService.list("DigitalHumanClip");
        return records.map(record => decode(record)!).filter(Boolean);
    },
    async listByIdentity(identityId: number): Promise<DigitalHumanClipRecord[]> {
        const records = await this.list();
        return records.filter(record => Number(record.content.identityId || 0) === Number(identityId || 0));
    },
    async save(record: DigitalHumanClipRecord) {
        if (!record.id) {
            await StorageService.add("DigitalHumanClip", {
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
    async delete(record: DigitalHumanClipRecord) {
        if (!record.id) {
            return;
        }
        await StorageService.delete({
            id: record.id,
            biz: "DigitalHumanClip",
            title: record.title,
            content: record.content,
        });
    },
};
