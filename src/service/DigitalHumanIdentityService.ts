import { StorageRecord, StorageService } from "./StorageService";

export type DigitalHumanIdentityBinding = {
    avatarId?: string;
    voiceId?: string;
    faceId?: string;
    speakerId?: string;
    extra?: Record<string, any>;
};

export type DigitalHumanIdentityContent = {
    coverImage?: string;
    referenceVideo?: string;
    idleVideo?: string;
    talkVideo?: string;
    holdLeftVideo?: string;
    holdRightVideo?: string;
    holdBothVideo?: string;
    tableDisplayVideo?: string;
    voiceRefAudio?: string;
    voiceRefText?: string;
    backgroundPrompt?: string;
    outfitPrompt?: string;
    cameraPrompt?: string;
    holdingPrompt?: string;
    productOverlayImage?: string;
    overlaySafeArea?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    supportedDisplayModes?: Array<
        "normal"
        | "overlay"
        | "table"
        | "hold-left"
        | "hold-right"
        | "hold-both"
        | "product-clip"
    >;
    bindings?: {
        runninghub?: DigitalHumanIdentityBinding;
        heygem?: DigitalHumanIdentityBinding;
        custom?: DigitalHumanIdentityBinding;
    };
    tags?: string[];
    status?: "draft" | "ready";
};

export type DigitalHumanIdentityRecord = {
    id?: number;
    title: string;
    content: DigitalHumanIdentityContent;
};

export const createEmptyDigitalHumanIdentityRecord = (): DigitalHumanIdentityRecord => ({
    title: "",
    content: {
        coverImage: "",
        referenceVideo: "",
        idleVideo: "",
        talkVideo: "",
        holdLeftVideo: "",
        holdRightVideo: "",
        holdBothVideo: "",
        tableDisplayVideo: "",
        voiceRefAudio: "",
        voiceRefText: "",
        backgroundPrompt: "",
        outfitPrompt: "",
        cameraPrompt: "",
        holdingPrompt: "",
        productOverlayImage: "",
        overlaySafeArea: {
            x: 0.62,
            y: 0.26,
            width: 0.24,
            height: 0.42,
        },
        supportedDisplayModes: ["normal", "overlay"],
        bindings: {
            runninghub: {},
            heygem: {},
            custom: {},
        },
        tags: [],
        status: "draft",
    },
});

const decode = (record: StorageRecord | null): DigitalHumanIdentityRecord | null => {
    if (!record) {
        return null;
    }
    const next = createEmptyDigitalHumanIdentityRecord();
    return {
        id: record.id,
        title: record.title || "",
        content: {
            ...next.content,
            coverImage: record.content?.coverImage || "",
            referenceVideo: record.content?.referenceVideo || "",
            idleVideo: record.content?.idleVideo || "",
            talkVideo: record.content?.talkVideo || "",
            holdLeftVideo: record.content?.holdLeftVideo || "",
            holdRightVideo: record.content?.holdRightVideo || "",
            holdBothVideo: record.content?.holdBothVideo || "",
            tableDisplayVideo: record.content?.tableDisplayVideo || "",
            voiceRefAudio: record.content?.voiceRefAudio || "",
            voiceRefText: record.content?.voiceRefText || "",
            backgroundPrompt: record.content?.backgroundPrompt || "",
            outfitPrompt: record.content?.outfitPrompt || "",
            cameraPrompt: record.content?.cameraPrompt || "",
            holdingPrompt: record.content?.holdingPrompt || "",
            productOverlayImage: record.content?.productOverlayImage || "",
            overlaySafeArea: {
                x: Number(record.content?.overlaySafeArea?.x ?? next.content.overlaySafeArea?.x ?? 0),
                y: Number(record.content?.overlaySafeArea?.y ?? next.content.overlaySafeArea?.y ?? 0),
                width: Number(record.content?.overlaySafeArea?.width ?? next.content.overlaySafeArea?.width ?? 0),
                height: Number(record.content?.overlaySafeArea?.height ?? next.content.overlaySafeArea?.height ?? 0),
            },
            supportedDisplayModes: Array.isArray(record.content?.supportedDisplayModes)
                ? record.content.supportedDisplayModes
                : next.content.supportedDisplayModes,
            bindings: record.content?.bindings || {
                runninghub: {},
                heygem: {},
                custom: {},
            },
            tags: Array.isArray(record.content?.tags) ? record.content.tags : [],
            status: record.content?.status || "draft",
        },
    };
};

export const DigitalHumanIdentityService = {
    async get(id: number) {
        return decode(await StorageService.get(id));
    },
    async getByTitle(title: string) {
        return decode(await StorageService.getByTitle("DigitalHumanIdentity", title));
    },
    async list(): Promise<DigitalHumanIdentityRecord[]> {
        const records = await StorageService.list("DigitalHumanIdentity");
        return records.map(record => decode(record)!).filter(Boolean);
    },
    async save(record: DigitalHumanIdentityRecord) {
        if (!record.id) {
            await StorageService.add("DigitalHumanIdentity", {
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
    async delete(record: DigitalHumanIdentityRecord) {
        if (!record.id) {
            return;
        }
        await StorageService.delete({
            id: record.id,
            biz: "DigitalHumanIdentity",
            title: record.title,
            content: record.content,
        });
    },
};
