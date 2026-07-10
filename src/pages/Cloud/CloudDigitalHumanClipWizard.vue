<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Dialog } from "../../lib/dialog";
import { usePageDraft } from "../../hooks/pageDraft";
import { useModelStore } from "../../module/Model/store/model";
import { CloudTemplateRecord } from "../../service/CloudTemplateService";
import { CloudTemplateTaskService } from "../../service/CloudTemplateTaskService";
import { DirectApiPlatformRecord, DirectApiPlatformService } from "../../service/DirectApiPlatformService";
import {
    DigitalHumanClipRecord,
    DigitalHumanClipService,
    DigitalHumanClipType,
    DigitalHumanDisplayMode,
} from "../../service/DigitalHumanClipService";
import { DigitalHumanIdentityRecord, DigitalHumanIdentityService } from "../../service/DigitalHumanIdentityService";
import { createEmptyDigitalHumanScenePackRecord, DigitalHumanScenePackService } from "../../service/DigitalHumanScenePackService";
import { StorageService } from "../../service/StorageService";
import { TaskService } from "../../service/TaskService";

type ScriptMode = "manual" | "ai" | "polish";
type GenerationChannel = "cloud-template" | "seedance";

type WizardClipDraft = {
    id: string;
    enabled: boolean;
    title: string;
    clipType: DigitalHumanClipType;
    displayMode: DigitalHumanDisplayMode;
    keywords: string;
    scriptMode: ScriptMode;
    script: string;
    durationSeconds: number;
    cta: boolean;
    savedClipId?: number;
    taskId?: number;
};

const modelStore = useModelStore();
const route = useRoute();
const identities = ref<DigitalHumanIdentityRecord[]>([]);
const digitalHumanTemplates = ref<CloudTemplateRecord[]>([]);
const audioTemplates = ref<CloudTemplateRecord[]>([]);
const seedancePlatforms = ref<DirectApiPlatformRecord[]>([]);
const loading = ref(false);
const generating = ref(false);
const saving = ref(false);
const submitting = ref(false);
const lastMessage = ref("");

const createDefaultForm = () => ({
    productTitle: "",
    productId: "",
    productSellingPoints: "",
    priceAndOffer: "",
    faqText: "",
    forbiddenWords: "最便宜, 全网最低, 治疗, 保证有效, 永久",
    persona: "热情、口语化、像直播间带货主播，称呼观众为宝宝，句子短一点。",
    tone: "热情促单",
    durationSeconds: 12,
    identityId: 0,
    generationChannel: "cloud-template" as GenerationChannel,
    templateId: 0,
    audioTemplateId: 0,
    seedancePlatformId: 0,
    seedanceModel: "seedance-2.0-fast",
    seedanceRatio: "9:16",
    seedanceResolution: "720p",
    generateAudio: true,
    referenceImage: "",
    referenceVideo: "",
    referenceAudio: "",
    audioPrompt: "",
    visualPrompt: "固定直播间机位，数字人主播正面半身出镜，口型自然，动作克制，适合带货直播切片。",
    createScenePack: true,
    saveTriggerRules: true,
});

const form = ref(createDefaultForm());
const drafts = ref<WizardClipDraft[]>([]);
const pageDraft = usePageDraft("DigitalHumanClipWizard", {
    form,
    drafts,
    lastMessage,
});

const identityTitle = computed(() => {
    return identities.value.find(item => Number(item.id || 0) === Number(form.value.identityId || 0))?.title || "";
});

const selectedTemplate = computed(() => {
    return digitalHumanTemplates.value.find(item => Number(item.id || 0) === Number(form.value.templateId || 0)) || null;
});

const selectedAudioTemplate = computed(() => {
    return audioTemplates.value.find(item => Number(item.id || 0) === Number(form.value.audioTemplateId || 0)) || null;
});

const selectedSeedancePlatform = computed(() => {
    return seedancePlatforms.value.find(item => Number(item.id || 0) === Number(form.value.seedancePlatformId || 0)) || null;
});

const enabledDrafts = computed(() => drafts.value.filter(item => item.enabled));

const clipTypeLabel = (value: DigitalHumanClipType) => {
    const map: Record<string, string> = {
        idle: "待机片",
        welcome: "欢迎片",
        talk: "问答/讲解片",
        product: "商品片",
        holding: "手持片",
        transition: "过渡片",
    };
    return map[value] || value;
};

const scriptModeLabel = (value: ScriptMode) => {
    if (value === "manual") return "手写";
    if (value === "polish") return "AI润色";
    return "AI生成";
};

const newDraft = (input: Partial<WizardClipDraft>): WizardClipDraft => ({
    id: Date.now() + "-" + Math.random().toString(16).slice(2),
    enabled: true,
    title: "",
    clipType: "talk",
    displayMode: "normal",
    keywords: "",
    scriptMode: "ai",
    script: "",
    durationSeconds: Number(form.value.durationSeconds || 12),
    cta: true,
    ...input,
});

const splitFaqLines = () => {
    return form.value.faqText
        .split(/\n+/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 12);
};

const buildRuleDrafts = () => {
    const product = form.value.productTitle.trim();
    if (!product) {
        Dialog.tipError("请先填写商品名称");
        return;
    }
    const point = form.value.productSellingPoints.trim() || "核心卖点清晰、适合直播间快速介绍";
    const offer = form.value.priceAndOffer.trim();
    const faqLines = splitFaqLines();
    const next: WizardClipDraft[] = [
        newDraft({
            title: product + "｜待机暖场",
            clipType: "idle",
            keywords: "",
            scriptMode: "ai",
            script: "宝宝们可以看一下今天这款" + product + "，" + point + "。有问题直接打在公屏，我看到就给大家讲。",
            durationSeconds: 15,
            cta: false,
        }),
        newDraft({
            title: product + "｜商品总介绍",
            clipType: "product",
            keywords: "介绍," + product + ",什么产品,有什么用",
            scriptMode: "ai",
            script: "今天主推的是" + product + "，" + point + (offer ? "，" + offer : "") + "。想了解细节的宝宝可以直接问我。",
            durationSeconds: 18,
            cta: true,
        }),
        newDraft({
            title: product + "｜价格优惠",
            clipType: "talk",
            keywords: "多少钱,价格,优惠,怎么卖,到手价",
            scriptMode: "ai",
            script: offer
                ? "宝宝这款今天直播间是" + offer + "，需要的话可以直接点小黄车看详情。"
                : "宝宝价格和优惠以小黄车页面为准，今天直播间会尽量给大家争取更划算的福利。",
            durationSeconds: 10,
            cta: true,
        }),
        newDraft({
            title: product + "｜下单引导",
            clipType: "transition",
            keywords: "怎么买,怎么拍,链接,小黄车,下单",
            scriptMode: "ai",
            script: "想拍的宝宝点小黄车就可以看到" + product + "，规格和优惠都在里面，下单前有问题也可以继续问我。",
            durationSeconds: 10,
            cta: true,
        }),
    ];
    faqLines.forEach((line, index) => {
        const pair = line.includes("：") ? line.split(/：(.+)/) : line.includes(":") ? line.split(/:(.+)/) : [line, ""];
        const q = pair[0] || line;
        const a = pair[1] || "";
        next.push(
            newDraft({
                title: (product + "｜问答" + (index + 1) + "：" + q).slice(0, 48),
                clipType: "talk",
                keywords: q
                    .replace(/[？?。！!]/g, "")
                    .split(/[、,，\s]+/)
                    .filter(Boolean)
                    .slice(0, 5)
                    .join(","),
                scriptMode: a ? "polish" : "ai",
                script: a ? "宝宝，关于" + q + "，" + a : "宝宝，关于" + q + "，这点我给大家简单讲一下。" + point,
                durationSeconds: Number(form.value.durationSeconds || 12),
                cta: true,
            })
        );
    });
    drafts.value = next;
    lastMessage.value = "已生成 " + next.length + " 条片段草稿，可继续手动修改或 AI 润色。";
};

const extractJsonArray = (raw: string) => {
    const text = String(raw || "").trim();
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.clips) ? parsed.clips : [];
    } catch (e) {
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) return [];
        try {
            return JSON.parse(match[0]);
        } catch (err) {
            return [];
        }
    }
};

const buildAiPrompt = () => {
    return [
        "请为数字人直播生成一组可预生成的视频片段话术，必须输出 JSON 数组，不要输出解释。",
        "商品名称：" + form.value.productTitle,
        "商品ID：" + (form.value.productId || "未填写"),
        "核心卖点：" + (form.value.productSellingPoints || "未填写"),
        "价格/优惠：" + (form.value.priceAndOffer || "未填写"),
        "常见问题：" + (form.value.faqText || "未填写"),
        "主播人设/语气：" + form.value.persona,
        "整体风格：" + form.value.tone,
        "每条目标时长：" + form.value.durationSeconds + " 秒",
        "禁用词/风险表达：" + (form.value.forbiddenWords || "无"),
        "要求：",
        "1. 输出 6-12 条，覆盖 idle、product、talk、transition，必要时 welcome。",
        "2. 每条 script 口语化、适合数字人口播，不能有动作描写、表情符号、括号舞台提示。",
        "3. 价格、功效、承诺不能乱编；没有提供的信息要说“以页面为准”。",
        "4. keywords 用中文逗号分隔，idle 可为空。",
        "5. cta 表示是否带下单引导。",
        "JSON 字段：",
        '[{"title":"片段标题","clipType":"idle|welcome|talk|product|transition","displayMode":"normal|overlay|table|product-clip","keywords":"多少钱,价格","script":"最终要说的话","durationSeconds":12,"cta":true}]',
    ].join("\n");
};

const generateWithAi = async () => {
    if (!form.value.productTitle.trim()) {
        Dialog.tipError("请先填写商品名称");
        return;
    }
    const enabledModels = await modelStore.enabledModels();
    if (!enabledModels.length) {
        buildRuleDrafts();
        Dialog.tipError("未启用大模型，已使用规则生成兜底草稿");
        return;
    }
    try {
        generating.value = true;
        const model = enabledModels[0];
        const ret = await modelStore.chat(
            model.providerId,
            model.modelId,
            buildAiPrompt(),
            {
                systemPrompt: "你是资深直播带货编导，擅长把商品资料拆成数字人直播可预生成片段。只输出合法 JSON。",
            },
            { loading: false }
        );
        if (ret.code) {
            Dialog.tipError(ret.msg || "AI 生成失败，已尝试规则兜底");
            buildRuleDrafts();
            return;
        }
        const content = ret.data?.content || ret.data?.text || "";
        const list = extractJsonArray(content);
        if (!list.length) {
            Dialog.tipError("AI 返回格式无法解析，已使用规则生成兜底草稿");
            buildRuleDrafts();
            return;
        }
        drafts.value = list.map((item: any) =>
            newDraft({
                title: String(item.title || "直播片段").slice(0, 64),
                clipType: (["idle", "welcome", "talk", "product", "transition"].includes(item.clipType) ? item.clipType : "talk") as DigitalHumanClipType,
                displayMode: (item.displayMode || "normal") as DigitalHumanDisplayMode,
                keywords: String(item.keywords || ""),
                scriptMode: "ai",
                script: String(item.script || item.text || ""),
                durationSeconds: Number(item.durationSeconds || form.value.durationSeconds || 12),
                cta: item.cta !== false,
            })
        );
        lastMessage.value = "AI 已生成 " + drafts.value.length + " 条片段草稿。";
    } finally {
        generating.value = false;
    }
};

const polishDraft = async (draft: WizardClipDraft) => {
    if (!draft.script.trim()) {
        Dialog.tipError("请先填写要润色的话术");
        return;
    }
    const enabledModels = await modelStore.enabledModels();
    if (!enabledModels.length) {
        Dialog.tipError("未启用大模型，无法 AI 润色");
        return;
    }
    const model = enabledModels[0];
    const ret = await modelStore.chat(
        model.providerId,
        model.modelId,
        "请润色下面这条数字人直播口播话术。保留价格、优惠、商品事实和核心意思；不要添加未给出的承诺；不要动作描写；控制在 " +
            (draft.durationSeconds || form.value.durationSeconds) +
            " 秒左右。\n\n商品：" +
            form.value.productTitle +
            "\n禁用词：" +
            form.value.forbiddenWords +
            "\n原话术：" +
            draft.script,
        {
            systemPrompt: "你是直播带货话术润色助手，只输出润色后的最终话术。",
        },
        { loading: true }
    );
    if (ret.code) {
        Dialog.tipError(ret.msg || "润色失败");
        return;
    }
    draft.script = String(ret.data?.content || "").trim() || draft.script;
    draft.scriptMode = "polish";
};

const addManualDraft = () => {
    drafts.value.unshift(
        newDraft({
            title: (form.value.productTitle || "商品") + "｜自定义片段",
            clipType: "talk",
            scriptMode: "manual",
            keywords: "",
            script: "",
        })
    );
};

const removeDraft = (draft: WizardClipDraft) => {
    drafts.value = drafts.value.filter(item => item.id !== draft.id);
};

const resetWizard = async () => {
    if (!window.confirm("确认清空当前商品资料和片段草稿吗？")) {
        return;
    }
    form.value = createDefaultForm();
    drafts.value = [];
    lastMessage.value = "";
    await pageDraft.clear();
    await refresh();
};

const hydrateFromClip = async (clipId: number) => {
    if (!clipId) {
        return;
    }
    const clip = await DigitalHumanClipService.get(clipId);
    if (!clip?.id) {
        return;
    }
    form.value.productTitle = clip.content.productTitle || form.value.productTitle;
    form.value.productId = clip.content.productId || form.value.productId;
    form.value.identityId = Number(clip.content.identityId || form.value.identityId || 0);
    form.value.durationSeconds = Number(clip.content.durationSeconds || form.value.durationSeconds || 12);
    const exists = drafts.value.some(item => Number(item.savedClipId || 0) === Number(clip.id));
    if (!exists) {
        drafts.value.unshift(
            newDraft({
                title: clip.title || "待生成片段",
                clipType: clip.content.clipType || "talk",
                displayMode: clip.content.displayMode || "normal",
                keywords: String(clip.content.meta?.keywords || ""),
                scriptMode: "manual",
                script: clip.content.text || "",
                durationSeconds: Number(clip.content.durationSeconds || form.value.durationSeconds || 12),
                savedClipId: Number(clip.id),
            })
        );
    }
    lastMessage.value = "已从直播片段 #" + clip.id + " 带入待生成话术，请补充参考图/音频后提交生成。";
};

const hydrateFromClips = async (clipIds: number[]) => {
    const ids = Array.from(new Set(clipIds.map(id => Number(id || 0)).filter(id => id > 0)));
    if (!ids.length) {
        return;
    }
    let count = 0;
    for (const id of ids) {
        const before = drafts.value.length;
        await hydrateFromClip(id);
        if (drafts.value.length > before) {
            count++;
        }
    }
    if (count > 0) {
        lastMessage.value = "已从直播片段页批量带入 " + count + " 条待生成片段，请补充参考素材后提交自动生成链路。";
    }
};

const saveTriggerRule = async (draft: WizardClipDraft, clipId: number) => {
    if (!form.value.saveTriggerRules || !draft.keywords.trim() || draft.clipType === "idle") {
        return;
    }
    await StorageService.add("LiveKnowledge", {
        title: draft.title,
        content: {
            enable: true,
            type: "user",
            systemType: "Follow",
            tags: ["digital-human-clip", form.value.productTitle].filter(Boolean),
            keywords: draft.keywords,
            reply: draft.script,
            replies: [],
            url: "",
            clipId,
            productId: form.value.productId,
            productTitle: form.value.productTitle,
        },
    });
};

const saveDraftsAsClips = async () => {
    if (!enabledDrafts.value.length) {
        Dialog.tipError("请先生成或添加片段");
        return [] as DigitalHumanClipRecord[];
    }
    if (!form.value.productTitle.trim()) {
        Dialog.tipError("请先填写商品名称");
        return [] as DigitalHumanClipRecord[];
    }
    saving.value = true;
    const saved: DigitalHumanClipRecord[] = [];
    try {
        for (const draft of enabledDrafts.value) {
            if (!draft.title.trim() || !draft.script.trim()) {
                continue;
            }
            const record: DigitalHumanClipRecord = {
                title: draft.title.trim(),
                content: {
                    identityId: Number(form.value.identityId || 0) || undefined,
                    identityTitle: identityTitle.value,
                    clipType: draft.clipType,
                    displayMode: draft.displayMode,
                    coverImage: "",
                    videoUrl: "",
                    audioUrl: "",
                    text: draft.script.trim(),
                    productId: form.value.productId.trim(),
                    productTitle: form.value.productTitle.trim(),
                    tags: ["一键生成", draft.scriptMode, form.value.productTitle].filter(Boolean),
                    durationSeconds: Number(draft.durationSeconds || 0),
                    sourceType: "manual",
                    status: "draft",
                    meta: {
                        source: "DigitalHumanClipWizard",
                        keywords: draft.keywords,
                        scriptMode: draft.scriptMode,
                        cta: draft.cta,
                    },
                },
            };
            await DigitalHumanClipService.save(record);
            const savedRecord = (await DigitalHumanClipService.list()).find(item => item.title === record.title);
            if (savedRecord?.id) {
                draft.savedClipId = Number(savedRecord.id);
                saved.push(savedRecord);
                await saveTriggerRule(draft, Number(savedRecord.id));
            }
        }
        if (form.value.createScenePack && saved.length) {
            await createScenePack(saved);
        }
        lastMessage.value = "已保存 " + saved.length + " 条直播片段" + (form.value.saveTriggerRules ? "，并写入关键词触发规则" : "") + "。";
        Dialog.tipSuccess(lastMessage.value);
        return saved;
    } finally {
        saving.value = false;
    }
};

const createScenePack = async (clips: DigitalHumanClipRecord[]) => {
    const pack = createEmptyDigitalHumanScenePackRecord();
    const product = form.value.productTitle.trim();
    pack.title = product + "｜自动直播编排";
    pack.content.identityId = Number(form.value.identityId || 0) || 0;
    pack.content.identityTitle = identityTitle.value;
    pack.content.idleClipId = Number(clips.find(item => item.content.clipType === "idle")?.id || 0);
    pack.content.welcomeClipIds = clips.filter(item => item.content.clipType === "welcome").map(item => Number(item.id));
    pack.content.talkClipIds = clips.filter(item => item.content.clipType === "talk").map(item => Number(item.id));
    pack.content.productClipIds = clips.filter(item => item.content.clipType === "product").map(item => Number(item.id));
    pack.content.transitionClipIds = clips.filter(item => item.content.clipType === "transition").map(item => Number(item.id));
    pack.content.defaultDisplayMode = "normal";
    pack.content.autoReturnToIdle = true;
    pack.content.productInsertMode = "auto";
    pack.content.tags = [product, "一键生成"].filter(Boolean);
    pack.content.status = pack.content.idleClipId ? "ready" : "draft";
    pack.content.notes = "由直播片段生成向导自动创建，可在数字人直播编排页继续调整。";
    await DigitalHumanScenePackService.save(pack);
};

const pickReferenceFile = async (field: "referenceImage" | "referenceVideo" | "referenceAudio") => {
    const filters =
        field === "referenceImage"
            ? [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }]
            : field === "referenceAudio"
              ? [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "flac"] }]
              : [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv", "webm"] }];
    const selected = await window.$mapi.file.openFile({ filters });
    if (!selected || Array.isArray(selected)) {
        return;
    }
    form.value[field] = selected;
};

const clearReferenceFile = (field: "referenceImage" | "referenceVideo" | "referenceAudio") => {
    form.value[field] = "";
};

const fileName = (value?: string) => {
    return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
};

const fieldLooksLike = (field: any, words: string[]) => {
    const text = [field?.name, field?.label, field?.title, field?.description]
        .map(item => String(item || "").toLowerCase())
        .join(" ");
    return words.some(word => text.includes(String(word).toLowerCase()));
};

const cloudFieldValue = (field: any, draft: WizardClipDraft) => {
    const type = String(field?.type || "").toLowerCase();
    const product = form.value.productTitle.trim();
    const fullPrompt = [
        form.value.visualPrompt,
        "商品：" + product,
        "片段类型：" + clipTypeLabel(draft.clipType),
        "口播文案：" + draft.script,
        form.value.audioPrompt ? "音频/情绪提示：" + form.value.audioPrompt : "",
    ].filter(Boolean).join("\n");
    if (fieldLooksLike(field, ["audio", "voice", "音频", "声音", "音色"])) {
        return form.value.referenceAudio || "";
    }
    if (fieldLooksLike(field, ["image", "avatar", "photo", "picture", "参考图", "图片", "形象"])) {
        return form.value.referenceImage || "";
    }
    if (fieldLooksLike(field, ["video", "template", "reference_video", "参考视频", "视频"])) {
        return form.value.referenceVideo || "";
    }
    if (fieldLooksLike(field, ["prompt2", "audio_prompt", "voice_prompt", "情绪", "音频提示"])) {
        return form.value.audioPrompt || "";
    }
    if (fieldLooksLike(field, ["duration", "时长", "seconds"])) {
        return Number(draft.durationSeconds || form.value.durationSeconds || 12);
    }
    if (fieldLooksLike(field, ["ratio", "aspect", "比例"])) {
        return form.value.seedanceRatio;
    }
    if (fieldLooksLike(field, ["text", "script", "voiceover", "口播", "台词", "文案"])) {
        return draft.script;
    }
    if (fieldLooksLike(field, ["title", "name", "标题", "名称"])) {
        return draft.title;
    }
    if (fieldLooksLike(field, ["prompt", "提示词", "描述"])) {
        return fullPrompt;
    }
    if (type === "number") {
        return Number(field.defaultValue || 0);
    }
    if (type === "boolean" || type === "switch") {
        return typeof field.defaultValue === "boolean" ? field.defaultValue : false;
    }
    return field?.defaultValue ?? "";
};

const buildCloudTemplateInput = (template: CloudTemplateRecord, draft: WizardClipDraft) => {
    const prompt = [
        form.value.visualPrompt,
        "商品：" + form.value.productTitle,
        "片段标题：" + draft.title,
        "口播文案：" + draft.script,
        form.value.priceAndOffer ? "价格优惠：" + form.value.priceAndOffer : "",
        form.value.audioPrompt ? "音频/情绪提示：" + form.value.audioPrompt : "",
    ].filter(Boolean).join("\n");
    const input: Record<string, any> = {
        title: draft.title,
        text: draft.script,
        prompt,
        videoPrompt: prompt,
        imagePrompt: prompt,
        audioPrompt: form.value.audioPrompt,
        prompt2: form.value.audioPrompt,
        selectedCapability: "digital-human",
        image: form.value.referenceImage,
        imageUrl: form.value.referenceImage,
        referenceImageUrl: form.value.referenceImage,
        referenceImages: [form.value.referenceImage].filter(Boolean),
        video: form.value.referenceVideo,
        videoUrl: form.value.referenceVideo,
        referenceVideoUrl: form.value.referenceVideo,
        audio: form.value.referenceAudio,
        audioUrl: form.value.referenceAudio,
        referenceAudioUrl: form.value.referenceAudio,
        voiceoverLine: draft.script,
        duration: Number(draft.durationSeconds || form.value.durationSeconds || 12),
        ratio: form.value.seedanceRatio,
        productTitle: form.value.productTitle,
        productId: form.value.productId,
        clipType: draft.clipType,
        displayMode: draft.displayMode,
        identityId: form.value.identityId,
        identityTitle: identityTitle.value,
    };
    const schemaFields = CloudTemplateTaskService.parseInputSchema(template.content.inputSchemaJson || "[]");
    schemaFields.forEach(field => {
        const key = String(field.name || "").trim();
        if (!key) {
            return;
        }
        input[key] = cloudFieldValue(field, draft);
    });
    return input;
};

const missingCloudTemplateInputs = (template: CloudTemplateRecord, draft: WizardClipDraft) => {
    const input = buildCloudTemplateInput(template, draft);
    const schemaFields = CloudTemplateTaskService.parseInputSchema(template.content.inputSchemaJson || "[]");
    return schemaFields
        .filter(field => {
            const key = String(field.name || "").trim();
            if (!field.required || !key) {
                return false;
            }
            const value = input[key];
            return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
        })
        .map(field => field.label || field.name);
};

const seedancePlatformModel = (platform: DirectApiPlatformRecord, value: string) => {
    if (platform.content.platformType !== "kwjm") {
        return value;
    }
    return value.includes("fast") ? "kw-video-v2-fast" : "kw-video-v2";
};

const seedanceSubmitPath = (platform: DirectApiPlatformRecord) => {
    return platform.content.platformType === "kwjm" ? "/v3/contents/generations/tasks" : "/api/v3/contents/generations/tasks";
};

const seedanceQueryPath = (platform: DirectApiPlatformRecord) => {
    return platform.content.platformType === "kwjm" ? "/v3/contents/generations/tasks/{id}" : "/api/v3/contents/generations/tasks/{id}";
};

const buildSeedanceContent = (draft: WizardClipDraft) => {
    const prompt = [
        form.value.visualPrompt,
        "商品：" + form.value.productTitle,
        "片段标题：" + draft.title,
        "口播文案：" + draft.script,
        form.value.audioPrompt ? "音频/情绪提示：" + form.value.audioPrompt : "",
    ].filter(Boolean).join("\n");
    const content: any[] = [{ type: "text", text: prompt }];
    if (form.value.referenceImage) {
        content.push({ type: "image_url", image_url: { url: form.value.referenceImage }, role: "reference_image" });
    }
    if (form.value.referenceVideo) {
        content.push({ type: "video_url", video_url: { url: form.value.referenceVideo }, role: "reference_video" });
    }
    if (form.value.referenceAudio) {
        content.push({ type: "audio_url", audio_url: { url: form.value.referenceAudio }, role: "reference_audio" });
    }
    return content;
};

const submitCloudTemplateDraft = async (draft: WizardClipDraft) => {
    const template = selectedTemplate.value;
    if (!template?.id) {
        throw new Error("请先选择数字人生成模板");
    }
    const missing = missingCloudTemplateInputs(template, draft);
    if (missing.length) {
        throw new Error("模板「" + template.title + "」缺少必填输入：" + missing.join("、") + "。请先补充参考图/参考视频/参考音频/提示词，或换一个模板。");
    }
    const input = buildCloudTemplateInput(template, draft);
    const record = await CloudTemplateTaskService.buildTaskRecord(Number(template.id), input);
    record.title = draft.title + "_数字人生成";
    return await TaskService.submit(record);
};

const submitSeedanceDraft = async (draft: WizardClipDraft) => {
    const platform = selectedSeedancePlatform.value;
    if (!platform?.id) {
        throw new Error("请先选择 Seedance 平台");
    }
    if (!String(platform.content.apiKey || "").trim()) {
        throw new Error("当前 Seedance 平台未配置 API Key");
    }
    if (form.value.seedanceModel === "seedance-2.0-fast" && form.value.seedanceResolution === "1080p") {
        throw new Error("1080p 仅 seedance-2.0 支持，fast 模型请使用 480p 或 720p");
    }
    const body = {
        model: seedancePlatformModel(platform, form.value.seedanceModel),
        content: buildSeedanceContent(draft),
        generate_audio: form.value.generateAudio,
        resolution: form.value.seedanceResolution,
        ratio: form.value.seedanceRatio,
        duration: Number(draft.durationSeconds || form.value.durationSeconds || 12),
        watermark: false,
    };
    const modelConfig: any = {
        capability: "video",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: "Seedance 2.0",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        directFileRelay: platform.content.directFileRelay || undefined,
        submitPath: seedanceSubmitPath(platform),
        queryPath: seedanceQueryPath(platform),
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: "json",
    };
    return await TaskService.submit({
        biz: "DirectApiTask",
        title: draft.title + "_Seedance生成",
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: {
            input: {
                source: "DigitalHumanClipWizard",
                mode: "reference",
                prompt: body.content[0]?.text || "",
                assets: [
                    form.value.referenceImage ? { type: "image", url: form.value.referenceImage } : null,
                    form.value.referenceVideo ? { type: "video", url: form.value.referenceVideo } : null,
                    form.value.referenceAudio ? { type: "audio", url: form.value.referenceAudio } : null,
                ].filter(Boolean),
                draft,
            },
        },
    } as any);
};

const submitGenerationTasks = async () => {
    if (form.value.generationChannel === "cloud-template" && !Number(form.value.templateId || 0)) {
        Dialog.tipError("请先选择数字人生成模板；也可以先只保存草稿。");
        return;
    }
    if (form.value.generationChannel === "seedance" && !Number(form.value.seedancePlatformId || 0)) {
        Dialog.tipError("请先选择 Seedance 平台；也可以先只保存草稿。");
        return;
    }
    if (!enabledDrafts.value.length) {
        Dialog.tipError("请先生成或添加片段");
        return;
    }
    submitting.value = true;
    try {
        const chainDrafts = enabledDrafts.value
            .filter(draft => draft.script.trim())
            .map(draft => ({
                id: draft.id,
                title: draft.title,
                clipType: draft.clipType,
                displayMode: draft.displayMode,
                script: draft.script,
                durationSeconds: Number(draft.durationSeconds || form.value.durationSeconds || 12),
                savedClipId: Number(draft.savedClipId || 0) || undefined,
            }));
        if (!chainDrafts.length) {
            Dialog.tipError("没有可提交的有效话术片段");
            return;
        }
        const taskId = await TaskService.submit({
            biz: "DigitalHumanClipChainTask",
            title: form.value.productTitle + "_直播片段自动生成",
            serverName: "",
            serverTitle: "",
            serverVersion: "",
            param: {
                productTitle: form.value.productTitle,
                productId: form.value.productId,
                identityId: Number(form.value.identityId || 0),
                identityTitle: identityTitle.value,
                audioTemplateId: Number(form.value.audioTemplateId || 0) || undefined,
                audioPrompt: form.value.audioPrompt,
                visualPrompt: form.value.visualPrompt,
                referenceImage: form.value.referenceImage,
                referenceVideo: form.value.referenceVideo,
                referenceAudio: form.value.referenceAudio,
                generationChannel: form.value.generationChannel,
                videoTemplate: selectedTemplate.value,
                seedancePlatform: selectedSeedancePlatform.value,
                seedanceModel: form.value.seedanceModel,
                seedanceRatio: form.value.seedanceRatio,
                seedanceResolution: form.value.seedanceResolution,
                generateAudio: form.value.generateAudio,
                drafts: chainDrafts,
            },
        } as any);
        drafts.value.forEach(draft => {
            if (chainDrafts.some(item => item.id === draft.id)) {
                draft.taskId = Number(taskId || 0);
            }
        });
        lastMessage.value = "已提交直播片段自动生成链路任务 #" + taskId + "。系统会按“话术 → 音频 → 回填 audioUrl → 视频 → 回填 videoUrl”自动推进。";
        Dialog.tipSuccess(lastMessage.value);
    } catch (e: any) {
        Dialog.tipError(e?.message || "提交自动生成链路失败");
    } finally {
        submitting.value = false;
    }
};

const saveAndSubmit = async () => {
    await saveDraftsAsClips();
    if (
        (form.value.generationChannel === "cloud-template" && Number(form.value.templateId || 0)) ||
        (form.value.generationChannel === "seedance" && Number(form.value.seedancePlatformId || 0))
    ) {
        await submitGenerationTasks();
    }
};

const refresh = async () => {
    loading.value = true;
    try {
        const [identityRecords, templates, audioRecords, voiceCloneRecords, seedanceRecords] = await Promise.all([
            DigitalHumanIdentityService.list(),
            CloudTemplateTaskService.listTemplates("digital-human"),
            CloudTemplateTaskService.listTemplates("audio"),
            CloudTemplateTaskService.listTemplates("voice-clone"),
            DirectApiPlatformService.listByCapability("seedance"),
        ]);
        identities.value = identityRecords;
        digitalHumanTemplates.value = templates;
        audioTemplates.value = [...audioRecords, ...voiceCloneRecords].filter(
            (item, index, arr) => arr.findIndex(other => Number(other.id || 0) === Number(item.id || 0)) === index
        );
        seedancePlatforms.value = seedanceRecords;
        if (!form.value.identityId && identityRecords[0]?.id) {
            form.value.identityId = Number(identityRecords[0].id);
        }
        if (!form.value.templateId && templates[0]?.id) {
            form.value.templateId = Number(templates[0].id);
        }
        if (!form.value.audioTemplateId && audioTemplates.value[0]?.id) {
            form.value.audioTemplateId = Number(audioTemplates.value[0].id);
        }
        if (!form.value.seedancePlatformId && seedanceRecords[0]?.id) {
            form.value.seedancePlatformId = Number(seedanceRecords[0].id);
        }
    } finally {
        loading.value = false;
    }
};

onMounted(async () => {
    await pageDraft.restore();
    await refresh();
    const clipIds = String(route.query.clipIds || "")
        .split(",")
        .map(item => Number(item.trim()))
        .filter(Boolean);
    if (clipIds.length) {
        await hydrateFromClips(clipIds);
    } else {
        await hydrateFromClip(Number(route.query.clipId || 0));
    }
});
</script>

<template>
    <div class="h-full overflow-y-auto bg-[#f6f8fc]">
        <div class="mx-auto max-w-7xl px-6 py-6">
            <div class="rounded-[24px] bg-white px-6 py-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div class="text-[32px] font-semibold leading-none text-slate-900">直播片段生成向导</div>
                        <div class="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
                            根据商品资料、常见问题和主播人设，一键生成可编辑的话术片段；可保存为直播片段、写入关键词触发规则，也可批量提交数字人生成任务。
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a-button @click="buildRuleDrafts">规则生成兜底</a-button>
                        <a-button type="primary" :loading="generating" @click="generateWithAi">AI 生成话术</a-button>
                        <a-button status="danger" @click="resetWizard">清空</a-button>
                    </div>
                </div>
                <div v-if="lastMessage" class="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {{ lastMessage }}
                </div>
            </div>

            <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
                <div class="space-y-6">
                    <div class="rounded-[24px] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <div class="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <div class="text-lg font-semibold text-slate-900">素材准备</div>
                                <div class="mt-1 text-xs leading-5 text-slate-500">
                                    先确定数字人形象、母版视频和音色参考；后续每条口播音频应按话术生成，再进入视频生成。
                                </div>
                            </div>
                            <a-tag color="arcoblue">优先配置</a-tag>
                        </div>
                        <a-form :model="form" layout="vertical">
                            <a-form-item label="参考图 / 主播形象图">
                                <div class="flex items-center gap-2">
                                    <a-button @click="pickReferenceFile('referenceImage')">选择图片</a-button>
                                    <span class="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        {{ fileName(form.referenceImage) || "未选择，数字人形象、首帧或商品参考图" }}
                                    </span>
                                    <a-button v-if="form.referenceImage" @click="clearReferenceFile('referenceImage')">清空</a-button>
                                </div>
                            </a-form-item>
                            <a-form-item label="参考视频 / 数字人母版">
                                <div class="flex items-center gap-2">
                                    <a-button @click="pickReferenceFile('referenceVideo')">选择视频</a-button>
                                    <span class="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        {{ fileName(form.referenceVideo) || "可选，数字人模板视频或动作参考视频" }}
                                    </span>
                                    <a-button v-if="form.referenceVideo" @click="clearReferenceFile('referenceVideo')">清空</a-button>
                                </div>
                            </a-form-item>
                            <a-form-item label="参考音频 / 音色">
                                <div class="flex items-center gap-2">
                                    <a-button @click="pickReferenceFile('referenceAudio')">选择音频</a-button>
                                    <span class="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        {{ fileName(form.referenceAudio) || "可选，音色参考；每条口播音频后续应按话术生成" }}
                                    </span>
                                    <a-button v-if="form.referenceAudio" @click="clearReferenceFile('referenceAudio')">清空</a-button>
                                </div>
                            </a-form-item>
                            <a-form-item label="音频生成模板">
                                <a-select v-model="form.audioTemplateId" allow-clear placeholder="可选；选择后会先为每条话术生成口播音频">
                                    <a-option :value="0">不单独生成音频</a-option>
                                    <a-option v-for="item in audioTemplates" :key="item.id" :value="Number(item.id)">
                                        {{ item.title }}
                                    </a-option>
                                </a-select>
                                <template #extra>
                                    <span v-if="selectedAudioTemplate">链路会先调用「{{ selectedAudioTemplate.title }}」生成每条口播音频，再提交视频生成。</span>
                                    <span v-else>不选择时，视频任务将使用参考音频或模型自身生成音频能力。</span>
                                </template>
                            </a-form-item>
                            <a-form-item label="音频提示词 / 情绪">
                                <a-input v-model="form.audioPrompt" allow-clear placeholder="例如：热情、自然、像直播间主播，语速稍快" />
                            </a-form-item>
                            <a-form-item label="画面提示词">
                                <a-textarea v-model="form.visualPrompt" :auto-size="{ minRows: 3, maxRows: 6 }" />
                            </a-form-item>
                        </a-form>
                    </div>

                    <div class="rounded-[24px] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <div class="mb-4 text-lg font-semibold text-slate-900">商品与主播信息</div>
                        <a-form :model="form" layout="vertical">
                            <a-form-item label="商品名称" required>
                                <a-input v-model="form.productTitle" placeholder="例如：玻色因紧致精华" />
                            </a-form-item>
                            <a-form-item label="商品 ID / 货号">
                                <a-input v-model="form.productId" placeholder="可选，用于后续关联商品" />
                            </a-form-item>
                            <a-form-item label="核心卖点">
                                <a-textarea v-model="form.productSellingPoints" :auto-size="{ minRows: 4, maxRows: 7 }" placeholder="材质、功效、适用人群、差异点、规格等。AI 会优先保留这里的信息。" />
                            </a-form-item>
                            <a-form-item label="价格 / 优惠">
                                <a-textarea v-model="form.priceAndOffer" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="例如：直播间到手 99，拍一发二；不确定可留空。" />
                            </a-form-item>
                            <a-form-item label="常见问题">
                                <a-textarea v-model="form.faqText" :auto-size="{ minRows: 4, maxRows: 8 }" placeholder="每行一个问题或问答。例如：&#10;多少钱：直播间到手价以小黄车为准&#10;适合谁：适合经常熬夜、想要日常护理的宝宝" />
                            </a-form-item>
                            <a-form-item label="主播人设 / 语气">
                                <a-textarea v-model="form.persona" :auto-size="{ minRows: 2, maxRows: 4 }" />
                            </a-form-item>
                            <a-form-item label="禁用词 / 风险表达">
                                <a-textarea v-model="form.forbiddenWords" :auto-size="{ minRows: 2, maxRows: 4 }" />
                            </a-form-item>
                        </a-form>
                    </div>

                    <div class="rounded-[24px] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <div class="mb-4 text-lg font-semibold text-slate-900">生成与保存设置</div>
                        <a-form :model="form" layout="vertical">
                            <a-form-item label="数字人身份">
                                <a-select v-model="form.identityId" allow-clear placeholder="可选">
                                    <a-option v-for="item in identities" :key="item.id" :value="Number(item.id)">
                                        {{ item.title }}
                                    </a-option>
                                </a-select>
                            </a-form-item>
                            <a-form-item label="生成通道">
                                <a-radio-group v-model="form.generationChannel" type="button">
                                    <a-radio value="cloud-template">数字人模板</a-radio>
                                    <a-radio value="seedance">Seedance 2.0 / Fast</a-radio>
                                </a-radio-group>
                            </a-form-item>
                            <template v-if="form.generationChannel === 'cloud-template'">
                                <a-form-item label="数字人生成模板">
                                    <a-select v-model="form.templateId" allow-clear placeholder="可选；不选则只保存话术片段草稿">
                                        <a-option v-for="item in digitalHumanTemplates" :key="item.id" :value="Number(item.id)">
                                            {{ item.title }}
                                        </a-option>
                                    </a-select>
                                    <template #extra>
                                        <span v-if="selectedTemplate">将按模板字段自动填入参考图/音频/提示词：{{ selectedTemplate.title }}</span>
                                        <span v-else>可先不选模板，稍后手动生成特殊片段。</span>
                                    </template>
                                </a-form-item>
                            </template>
                            <template v-else>
                                <a-form-item label="Seedance 平台">
                                    <a-select v-model="form.seedancePlatformId" allow-clear placeholder="请选择已配置的 Seedance 平台">
                                        <a-option v-for="item in seedancePlatforms" :key="item.id" :value="Number(item.id)">
                                            {{ item.title }}
                                        </a-option>
                                    </a-select>
                                    <template #extra>
                                        <span v-if="selectedSeedancePlatform">将提交到：{{ selectedSeedancePlatform.title }}</span>
                                        <span v-else>请先在模型设置里配置支持 Seedance 的直连 API 平台。</span>
                                    </template>
                                </a-form-item>
                                <div class="grid grid-cols-2 gap-2">
                                    <a-form-item label="模型">
                                        <a-select v-model="form.seedanceModel">
                                            <a-option value="seedance-2.0-fast">seedance-2.0-fast</a-option>
                                            <a-option value="seedance-2.0">seedance-2.0</a-option>
                                        </a-select>
                                    </a-form-item>
                                    <a-form-item label="清晰度">
                                        <a-select v-model="form.seedanceResolution">
                                            <a-option value="480p">480p</a-option>
                                            <a-option value="720p">720p</a-option>
                                            <a-option value="1080p">1080p</a-option>
                                        </a-select>
                                    </a-form-item>
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <a-form-item label="画幅">
                                        <a-select v-model="form.seedanceRatio">
                                            <a-option value="9:16">9:16</a-option>
                                            <a-option value="16:9">16:9</a-option>
                                            <a-option value="1:1">1:1</a-option>
                                            <a-option value="3:4">3:4</a-option>
                                            <a-option value="4:3">4:3</a-option>
                                        </a-select>
                                    </a-form-item>
                                    <a-form-item label="生成音频">
                                        <a-switch v-model="form.generateAudio" />
                                    </a-form-item>
                                </div>
                            </template>
                            <div class="mt-2 rounded-2xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
                                后续流程：先保存话术片段和关键词规则；如果点击“保存并提交生成”，系统会把每条最终话术连同参考图/视频/音频/提示词提交到所选通道。云端模板会按 schema 自动匹配必填字段，Seedance 会构造 text + reference_image/audio/video 的 DirectApiTask。
                            </div>
                            <a-form-item label="默认目标时长">
                                <a-input-number v-model="form.durationSeconds" :min="5" :max="60" style="width: 100%" />
                            </a-form-item>
                            <div class="space-y-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm">
                                <label class="flex items-center justify-between gap-3">
                                    <span>保存关键词触发规则</span>
                                    <a-switch v-model="form.saveTriggerRules" />
                                </label>
                                <label class="flex items-center justify-between gap-3">
                                    <span>自动创建直播编排方案</span>
                                    <a-switch v-model="form.createScenePack" />
                                </label>
                            </div>
                        </a-form>
                    </div>
                </div>

                <div class="rounded-[24px] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div class="text-lg font-semibold text-slate-900">片段话术草稿</div>
                            <div class="mt-1 text-xs text-slate-500">
                                每条都可以手写、AI 生成或 AI 润色。最终生成数字人视频前请先审核价格、功效和合规表达。
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <a-button @click="addManualDraft">添加手写片段</a-button>
                            <a-button :loading="saving" @click="saveDraftsAsClips">保存片段/规则</a-button>
                            <a-button type="primary" :loading="submitting || saving" @click="saveAndSubmit">保存并提交生成</a-button>
                        </div>
                    </div>

                    <div v-if="loading" class="py-16">
                        <m-loading />
                    </div>
                    <div v-else-if="drafts.length === 0" class="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
                        <div class="text-lg font-semibold text-slate-900">还没有片段草稿</div>
                        <div class="mt-2 text-sm text-slate-500">填写左侧商品资料后，点击“AI 生成话术”或“规则生成兜底”。</div>
                    </div>
                    <div v-else class="space-y-4">
                        <div v-for="draft in drafts" :key="draft.id" class="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                            <div class="mb-3 flex flex-wrap items-center gap-2">
                                <a-switch v-model="draft.enabled" />
                                <a-tag color="arcoblue">{{ clipTypeLabel(draft.clipType) }}</a-tag>
                                <a-tag>{{ scriptModeLabel(draft.scriptMode) }}</a-tag>
                                <a-tag v-if="draft.savedClipId" color="green">已保存 #{{ draft.savedClipId }}</a-tag>
                                <a-tag v-if="draft.taskId" color="purple">任务 #{{ draft.taskId }}</a-tag>
                                <div class="flex-grow"></div>
                                <a-button size="mini" @click="polishDraft(draft)">AI 润色</a-button>
                                <a-button size="mini" status="danger" @click="removeDraft(draft)">删除</a-button>
                            </div>
                            <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                <a-form-item label="片段标题">
                                    <a-input v-model="draft.title" />
                                </a-form-item>
                                <a-form-item label="片段类型">
                                    <a-select v-model="draft.clipType">
                                        <a-option value="idle">待机片</a-option>
                                        <a-option value="welcome">欢迎片</a-option>
                                        <a-option value="product">商品片</a-option>
                                        <a-option value="talk">问答/讲解片</a-option>
                                        <a-option value="transition">过渡片</a-option>
                                    </a-select>
                                </a-form-item>
                            </div>
                            <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                <a-form-item label="触发关键词">
                                    <a-input v-model="draft.keywords" placeholder="多个词用逗号分隔；待机片可为空" />
                                </a-form-item>
                                <a-form-item label="时长 / 展示">
                                    <div class="grid grid-cols-2 gap-2">
                                        <a-input-number v-model="draft.durationSeconds" :min="5" :max="60" />
                                        <a-select v-model="draft.displayMode">
                                            <a-option value="normal">普通口播</a-option>
                                            <a-option value="overlay">商品叠层</a-option>
                                            <a-option value="table">桌面展示</a-option>
                                            <a-option value="product-clip">专属商品片</a-option>
                                        </a-select>
                                    </div>
                                </a-form-item>
                            </div>
                            <a-form-item label="最终话术">
                                <a-textarea v-model="draft.script" :auto-size="{ minRows: 4, maxRows: 10 }" />
                            </a-form-item>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
