<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Dialog } from "../../../lib/dialog";
import {
    DirectApiPlatformRecord,
    DirectApiPlatformService,
} from "../../../service/DirectApiPlatformService";
import { CloudTemplateTaskService } from "../../../service/CloudTemplateTaskService";
import { CloudTemplateRecord } from "../../../service/CloudTemplateService";
import { TaskRecord, TaskService } from "../../../service/TaskService";
import { RunningHubModelConfigType } from "../RunningHubStudio/type";
import ModelGenerator from "../../../module/Model/ModelGenerator.vue";
import { FileUtil } from "../../../lib/file";
import { DownloadUtil } from "../../../lib/util";
import { usePageDraft } from "../../../hooks/pageDraft";

type AngleType = "pain" | "desire" | "contrast" | "scene" | "conversion";
type GenerationChannel = "direct" | "cloud";
type FrameDensity = "light" | "standard" | "detailed";
type NarrationMode = "none" | "voiceover" | "character";
type SubtitleMode = "none" | "caption";
type HotTrendRisk = "low" | "medium" | "high";
type HotTrendFuseMode = "light" | "medium" | "strong";
type HotTrendMode = "meme" | "topic";

type ReferenceVideo = {
    path: string;
    name: string;
    dataUrl: string;
    frameDataUrls: string[];
};

type ReferenceImage = {
    path: string;
    name: string;
    dataUrl: string;
};

type MarketingAssetType = "character" | "scene" | "prop";
type MarketingAssetStatus = "ready" | "suggested" | "generating";

type MarketingAsset = {
    id: string;
    type: MarketingAssetType;
    name: string;
    url: string;
    dataUrl?: string;
    prompt?: string;
    note?: string;
    status: MarketingAssetStatus;
    imageTaskId?: number;
};

type DouyinImportResult = {
    sourceUrl: string;
    resolvedUrl: string;
    awemeId?: string;
    title?: string;
    desc?: string;
    author?: string;
    coverUrl?: string;
    videoUrl?: string;
    localVideoPath?: string;
    imageUrls?: string[];
    adapter?: "dy-downloader" | "custom-api" | "builtin";
};

type HotTrendCandidate = {
    id: string;
    source: string;
    title: string;
    url?: string;
    summary?: string;
    heat?: string;
    rank?: number;
    raw?: any;
};

type HotTrendCard = {
    id: string;
    source: string;
    title: string;
    summary: string;
    category: string;
    heat: string;
    fitScore: number;
    risk: HotTrendRisk;
    usableAngle: string;
    integration: string;
    forcedAngle?: string;
    hookExample?: string;
    playIdea?: string;
    avoid: string;
    selected: boolean;
    analyzed?: boolean;
};

type SceneDraft = {
    id: string;
    title: string;
    duration: number;
    subtitle: string;
    captionOverride?: string;
    voiceoverLine?: string;
    narrationMode?: NarrationMode;
    subtitleMode?: SubtitleMode;
    imagePrompt: string;
    videoPrompt: string;
    assetIds?: string[];
    referenceImageUrl?: string;
    referenceImageName?: string;
    imageTaskId?: number;
    videoTaskId?: number;
};

type MarketingDraft = {
    id: string;
    angle: AngleType;
    title: string;
    hook: string;
    voiceover: string;
    cta: string;
    referenceAnalysis?: {
        plot?: string;
        structure?: string;
        shotLanguage?: string;
        visualStyle?: string;
        rhythm?: string;
        characterAction?: string;
        captionAudio?: string;
        reusableRules?: string;
    };
    suggestedAssets?: Array<{
        type: MarketingAssetType;
        name: string;
        prompt: string;
        note?: string;
    }>;
    scenes: SceneDraft[];
};

const router = useRouter();
const imagePlatforms = ref<DirectApiPlatformRecord[]>([]);
const videoPlatforms = ref<DirectApiPlatformRecord[]>([]);
const imageTemplates = ref<CloudTemplateRecord[]>([]);
const videoTemplates = ref<CloudTemplateRecord[]>([]);
const imagePlatformId = ref(0);
const videoPlatformId = ref(0);
const imageTemplateId = ref(0);
const videoTemplateId = ref(0);
const imageChannel = ref<GenerationChannel>("direct");
const videoChannel = ref<GenerationChannel>("direct");
const submitting = ref(false);
const generatingScripts = ref(false);
const selectedDraftId = ref("");
const modelGenerator = ref<InstanceType<typeof ModelGenerator> | null>(null);
const referenceVideo = ref<ReferenceVideo | null>(null);
const referenceImages = ref<ReferenceImage[]>([]);
const marketingAssets = ref<MarketingAsset[]>([]);
const assetUploadType = ref<MarketingAssetType>("character");
const assetUploadName = ref("");
const referenceVideoMode = ref<"frames" | "video">("frames");
const referenceFrameDensity = ref<FrameDensity>("standard");
const extractingFrames = ref(false);
const importingDouyin = ref(false);
const douyinUrl = ref("");
const douyinCookie = ref("");
const douyinCustomApiUrl = ref("");
const douyinImportResult = ref<DouyinImportResult | null>(null);
const collectingHotTrends = ref(false);
const hotTrendLoadingText = ref("");
const hotTrendKeyword = ref("");
const hotTrendMode = ref<HotTrendMode>("meme");
const hotTrendSources = ref<string[]>(["meme", "douyin", "baidu", "weibo", "bilibili"]);
const hotTrendFuseMode = ref<HotTrendFuseMode>("light");
const hotTrendCandidates = ref<HotTrendCandidate[]>([]);
const hotTrendCards = ref<HotTrendCard[]>([]);
const hotTrendErrors = ref<Array<{ source: string; message: string }>>([]);
const hotTrendSourceCounts = ref<Record<string, number>>({});
const hotTrendAnalysisError = ref("");
const DEFAULT_VISUAL_STYLE = "";
const LEGACY_DEFAULT_VISUAL_STYLE = "真实感短视频，干净都市夜景，人物自然自信，商业广告质感，竖屏构图";
const form = ref({
    brandName: "",
    brandBrief: "",
    targetAudience: "25-35 岁男性，关注状态提升、社交表达和个人吸引力",
    productSellingPoints: "",
    idea: "",
    referenceUrl: "",
    baseLine: "",
    count: 3,
    sceneCount: 3,
    ratio: "9:16",
    narrationMode: "voiceover" as NarrationMode,
    subtitleMode: "caption" as SubtitleMode,
    videoModel: "seedance-2.0-fast",
    visualStyle: DEFAULT_VISUAL_STYLE,
});
const drafts = ref<MarketingDraft[]>([]);
const pageDraft = usePageDraft("MarketingVideoFlow", {
    form,
    drafts,
    selectedDraftId,
    referenceVideo,
    referenceImages,
    marketingAssets,
    assetUploadType,
    assetUploadName,
    referenceVideoMode,
    referenceFrameDensity,
    douyinUrl,
    douyinCookie,
    douyinCustomApiUrl,
    douyinImportResult,
    hotTrendKeyword,
    hotTrendMode,
    hotTrendSources,
    hotTrendFuseMode,
    hotTrendCandidates,
    hotTrendCards,
    hotTrendErrors,
    hotTrendSourceCounts,
    hotTrendAnalysisError,
    hotTrendLoadingText,
    imagePlatformId,
    videoPlatformId,
    imageTemplateId,
    videoTemplateId,
    imageChannel,
    videoChannel,
});

const angles: Array<{ value: AngleType; label: string; desc: string }> = [
    { value: "pain", label: "痛点型", desc: "先点出现状，再给出轻量解决方案" },
    { value: "desire", label: "欲望型", desc: "强调状态、吸引力和行动后的变化" },
    { value: "contrast", label: "反差型", desc: "用前后反差制造停留和记忆点" },
    { value: "scene", label: "场景型", desc: "代入具体生活/社交场景" },
    { value: "conversion", label: "转化型", desc: "更直接地引导点击、下载或咨询" },
];
const countOptions = [1, 2, 3, 4, 5];
const sceneCountOptions = [1, 2, 3, 4, 5, 6];
const durationOptions = Array.from({ length: 12 }, (_, index) => index + 4);
const DEFAULT_SCENE_DURATION = 8;
const videoModelOptions = ["seedance-2.0-fast", "seedance-2.0"];
const narrationModeOptions: Array<{ label: string; value: NarrationMode }> = [
    { label: "无台词", value: "none" },
    { label: "画外音", value: "voiceover" },
    { label: "角色说", value: "character" },
];
const subtitleModeOptions: Array<{ label: string; value: SubtitleMode }> = [
    { label: "不显示字幕", value: "none" },
    { label: "显示字幕", value: "caption" },
];
const marketingAssetTypeOptions: Array<{ label: string; value: MarketingAssetType }> = [
    { label: "人物资产", value: "character" },
    { label: "场景资产", value: "scene" },
    { label: "道具资产", value: "prop" },
];
const hotTrendSourceOptions = [
    { label: "全网梗", value: "meme" },
    { label: "抖音", value: "douyin" },
    { label: "百度", value: "baidu" },
    { label: "微博", value: "weibo" },
    { label: "B站", value: "bilibili" },
];
const hotTrendModeOptions: Array<{ label: string; value: HotTrendMode }> = [
    { label: "热梗优先", value: "meme" },
    { label: "热点优先", value: "topic" },
];
const hotTrendFuseModeOptions: Array<{ label: string; value: HotTrendFuseMode }> = [
    { label: "轻融合", value: "light" },
    { label: "中融合", value: "medium" },
    { label: "强融合", value: "strong" },
];
const frameDensityOptions: Array<{ label: string; value: FrameDensity; count: number; desc: string }> = [
    { label: "少量", value: "light", count: 5, desc: "快速参考整体风格" },
    { label: "标准", value: "standard", count: 10, desc: "覆盖主要节奏变化" },
    { label: "详细", value: "detailed", count: 16, desc: "更适合复杂长视频" },
];
const channelOptions: Array<{ label: string; value: GenerationChannel }> = [
    { label: "Direct API", value: "direct" },
    { label: "云端模板", value: "cloud" },
];

const currentImagePlatform = computed(() => {
    return imagePlatforms.value.find(item => item.id === imagePlatformId.value) || null;
});

const currentVideoPlatform = computed(() => {
    return videoPlatforms.value.find(item => item.id === videoPlatformId.value) || null;
});

const currentImageTemplate = computed(() => {
    return imageTemplates.value.find(item => item.id === imageTemplateId.value) || null;
});

const currentVideoTemplate = computed(() => {
    return videoTemplates.value.find(item => item.id === videoTemplateId.value) || null;
});

const selectedDraft = computed(() => {
    return drafts.value.find(item => item.id === selectedDraftId.value) || drafts.value[0] || null;
});

const hasReferenceInput = computed(() => {
    return Boolean(referenceVideo.value) || Boolean(form.value.referenceUrl.trim()) || Boolean(douyinImportResult.value);
});

const selectedHotTrendCards = computed(() => {
    return hotTrendCards.value.filter(item => item.selected && item.risk !== "high").slice(0, 10);
});

const visibleHotTrendCards = computed(() => {
    return hotTrendCards.value.slice(0, 15);
});

const hotTrendStatusText = computed(() => {
    if (!hotTrendCandidates.value.length && !hotTrendCards.value.length) {
        return "";
    }
    const analyzedCount = hotTrendCards.value.filter(item => item.analyzed).length;
    const pendingCount = hotTrendCards.value.length - analyzedCount;
    return `已采集 ${hotTrendCandidates.value.length} 条，AI 精修 ${analyzedCount} 条，待精修 ${pendingCount} 条，当前选中 ${selectedHotTrendCards.value.length} 条会进入脚本`;
});

const hotTrendSourceCountTags = computed(() => {
    return hotTrendSourceOptions.map(item => ({
        ...item,
        count: Number(hotTrendSourceCounts.value?.[item.value] || 0),
    }));
});

const referenceFrameCount = computed(() => {
    return frameDensityOptions.find(item => item.value === referenceFrameDensity.value)?.count || 10;
});

const referenceFrameRule = computed(() => {
    if (!referenceVideo.value || referenceVideoMode.value !== "frames") {
        return "";
    }
    return `参考视频已按时长均匀抽取 ${referenceVideo.value.frameDataUrls.length} 帧，取样点避开片头片尾。请结合这些参考帧拆解剧情走向、分镜结构、镜头景别、主体动作、构图、色彩、光影、字幕/台词呈现和节奏变化；抽帧不是连续视频，不能编造看不见的细节。`;
});

const referenceSummary = computed(() => {
    if (referenceVideo.value) {
        if (referenceVideoMode.value === "frames") {
            return `已上传参考视频：${referenceVideo.value.name}，已按“${frameDensityOptions.find(item => item.value === referenceFrameDensity.value)?.label}”密度抽取 ${referenceVideo.value.frameDataUrls.length} 帧给视觉模型分析。`;
        }
        return `已上传参考视频：${referenceVideo.value.name}。会以原视频形式交给支持视频输入的大模型分析。`;
    }
    if (!form.value.referenceUrl.trim()) {
        return "未使用参考链接，将根据视频主题、生成要求和台词生成原创方案。";
    }
    return "参考链接用于提取主题、剧情结构、节奏、镜头语言和表达方式；不照搬原视频人物、画面、音乐或台词。";
});

const readyMarketingAssets = computed(() => {
    return marketingAssets.value.filter(item => item.status === "ready" && (item.url || item.dataUrl));
});

const assetSelectOptions = computed(() => {
    return readyMarketingAssets.value.map(item => ({
        label: `${marketingAssetTypeLabel(item.type)} · ${item.name}`,
        value: item.id,
    }));
});

const loadPlatforms = async () => {
    imagePlatforms.value = await DirectApiPlatformService.listByCapability("gpt-image-2");
    videoPlatforms.value = await DirectApiPlatformService.listByCapability("seedance");
    imageTemplates.value = await CloudTemplateTaskService.listTemplates("image");
    videoTemplates.value = await CloudTemplateTaskService.listTemplates("video");
    const defaultImage = await DirectApiPlatformService.getDefault("gpt-image-2");
    const defaultVideo = await DirectApiPlatformService.getDefault("seedance");
    imagePlatformId.value = imagePlatforms.value.some(item => item.id === imagePlatformId.value)
        ? imagePlatformId.value
        : defaultImage?.id || imagePlatforms.value[0]?.id || 0;
    videoPlatformId.value = videoPlatforms.value.some(item => item.id === videoPlatformId.value)
        ? videoPlatformId.value
        : defaultVideo?.id || videoPlatforms.value[0]?.id || 0;
    imageTemplateId.value = imageTemplates.value.some(item => item.id === imageTemplateId.value)
        ? imageTemplateId.value
        : imageTemplates.value[0]?.id || 0;
    videoTemplateId.value = videoTemplates.value.some(item => item.id === videoTemplateId.value)
        ? videoTemplateId.value
        : videoTemplates.value[0]?.id || 0;
};

onMounted(async () => {
    await pageDraft.restore();
    await loadPlatforms();
});

const textOr = (value: string, fallback: string) => {
    return value.trim() || fallback;
};

const angleLabel = (angle: AngleType) => {
    return angles.find(item => item.value === angle)?.label || angle;
};

const cleanSentence = (value: string) => {
    return value.replace(/\s+/g, " ").trim();
};

const splitVoiceoverText = (value: string) => {
    return String(value || "")
        .split(/(?<=[。！？!?；;])|[\r\n]+/)
        .map(item => cleanSentence(item))
        .filter(Boolean);
};

const buildSceneVoiceoverLine = (draft: MarketingDraft, sceneIndex: number) => {
    const scenes = draft.scenes || [];
    const bodyParts = splitVoiceoverText(draft.voiceover);
    const chunkSize = Math.max(1, Math.ceil(bodyParts.length / Math.max(1, scenes.length)));
    const body = bodyParts.slice(sceneIndex * chunkSize, (sceneIndex + 1) * chunkSize).join(" ");
    return cleanSentence(
        [
            sceneIndex === 0 ? draft.hook : "",
            body,
            sceneIndex === scenes.length - 1 ? draft.cta : "",
        ]
            .filter(Boolean)
            .join(" ")
    );
};

const ensureDraftVoiceoverLines = (draft: MarketingDraft, overwrite = false) => {
    draft.scenes.forEach((scene, index) => {
        if (!scene.narrationMode) {
            scene.narrationMode = form.value.narrationMode;
        }
        if (!scene.subtitleMode) {
            scene.subtitleMode = form.value.subtitleMode;
        }
        if (scene.narrationMode === "none") {
            if (overwrite) {
                scene.voiceoverLine = "";
            }
        } else if (overwrite || !scene.voiceoverLine) {
            scene.voiceoverLine = buildSceneVoiceoverLine(draft, index);
        }
        scene.subtitle = effectiveSceneCaption(scene);
    });
};

const applyNarrationModeToDraft = (draft: MarketingDraft, mode: NarrationMode) => {
    draft.scenes.forEach(scene => {
        scene.narrationMode = mode;
        if (mode === "none") {
            scene.voiceoverLine = "";
        }
        scene.subtitle = effectiveSceneCaption(scene);
    });
};

const applySubtitleModeToDraft = (draft: MarketingDraft, mode: SubtitleMode) => {
    draft.scenes.forEach(scene => {
        scene.subtitleMode = mode;
        scene.subtitle = effectiveSceneCaption(scene);
    });
};

const refreshDraftVoiceoverLines = (draft: MarketingDraft) => {
    ensureDraftVoiceoverLines(draft, true);
};

const narrationModeLabel = (mode?: NarrationMode) => {
    return narrationModeOptions.find(item => item.value === mode)?.label || "无台词";
};

const effectiveSceneCaption = (scene: SceneDraft) => {
    if (scene.subtitleMode === "none") {
        return "";
    }
    return cleanSentence(scene.captionOverride || scene.voiceoverLine || scene.subtitle || "");
};

const buildReferenceAnalysisInstruction = (analysis?: MarketingDraft["referenceAnalysis"]) => {
    if (!analysis) {
        return "";
    }
    const compact = (value?: string, max = 90) => {
        const text = cleanSentence(value || "");
        return text.length > max ? `${text.slice(0, max)}...` : text;
    };
    const rows = [
        compact(analysis.visualStyle, 120),
        compact(analysis.shotLanguage, 100),
        compact(analysis.rhythm, 80),
    ].filter(Boolean);
    if (!rows.length) {
        return "";
    }
    return `参考视频风格：${rows.join("；")}。只借鉴风格、构图、光线和节奏，不复刻原人物、原场景、原台词或原音乐。`;
};

const appendReferenceAnalysisToPrompt = (prompt: string, analysis?: MarketingDraft["referenceAnalysis"]) => {
    const instruction = buildReferenceAnalysisInstruction(analysis);
    return [prompt, instruction].filter(item => String(item || "").trim()).join("\n\n");
};

const buildImagePromptWithReferenceAnalysis = (draft: MarketingDraft, scene: SceneDraft) => {
    return [
        appendReferenceAnalysisToPrompt(scene.imagePrompt, draft.referenceAnalysis),
        buildAssetReferenceInstruction(scene),
    ].filter(Boolean).join("\n\n");
};

const extractProtectedTerms = (values: string[]) => {
    const terms = new Set<string>();
    const source = values.filter(Boolean).join("\n");
    const quotePattern = /[「『“"‘《]([^」』”"’》]{2,12})[」』”"’》]/g;
    let match: RegExpExecArray | null;
    while ((match = quotePattern.exec(source))) {
        const value = String(match[1] || "").trim();
        if (/^[\u4e00-\u9fa5A-Za-z0-9._-]{2,12}$/.test(value)) {
            terms.add(value);
        }
    }
    const topic = form.value.brandName.trim();
    if (topic && /^[\u4e00-\u9fa5A-Za-z0-9._-]{2,12}$/.test(topic)) {
        terms.add(topic);
    }
    if (source.includes("他趣")) {
        terms.add("他趣");
    }
    return Array.from(terms).slice(0, 8);
};

const buildProtectedTermInstruction = (terms: string[]) => {
    if (!terms.length) {
        return "";
    }
    const extra = terms.includes("他趣") ? "；其中“他趣”必须读作“他-趣 / tā qù”，不要改成“其他 / qí tā”" : "";
    return `专有名词保护：以下词必须逐字保留并按原字发音，不要同音替换、不要改写成近义词：${terms.join("、")}${extra}。`;
};

const buildScenePositionInstruction = (scene: SceneDraft, sceneIndex?: number, totalScenes?: number) => {
    if (sceneIndex === undefined || totalScenes === undefined) {
        return "";
    }
    return `只生成第 ${sceneIndex + 1}/${totalScenes} 镜「${scene.title}」，不要混入其它分镜内容。`;
};

const buildVideoPromptWithSpeech = (
    scene: SceneDraft,
    analysis?: MarketingDraft["referenceAnalysis"],
    sceneIndex?: number,
    totalScenes?: number
) => {
    const line = cleanSentence(scene.voiceoverLine || "");
    const caption = effectiveSceneCaption(scene);
    const protectedTermInstruction = buildProtectedTermInstruction(
        extractProtectedTerms([form.value.brandName, form.value.productSellingPoints, form.value.idea, line, caption])
    );
    const speechInstruction =
        scene.narrationMode === "none"
            ? "音频/台词要求：不要生成对白、旁白或人物开口；只保留自然环境声或轻微氛围音。"
            : line
              ? scene.narrationMode === "character"
                  ? `音频/台词要求：让画面中的主要角色自然开口说出这句中文台词：“${line}”。需要口型、情绪和语速匹配台词，不要省略，不要改写。`
                  : `音频/台词要求：使用自然普通话画外音完整朗读这句台词：“${line}”。画面角色可以不张口，但必须有清晰旁白，不要省略，不要改写。`
              : "音频/台词要求：如无明确台词，可使用轻微环境声，不要生成无关对白。";
    const subtitleInstruction =
        scene.subtitleMode === "none"
            ? "字幕要求：不要生成画面字幕、口播字幕、标题条或贴纸文字。"
            : `字幕要求：画面字幕应与本镜台词一致；当前字幕：${caption || line || "无"}`;
    return [
        buildScenePositionInstruction(scene, sceneIndex, totalScenes),
        appendReferenceAnalysisToPrompt(scene.videoPrompt, analysis),
        "",
        speechInstruction,
        protectedTermInstruction,
        subtitleInstruction,
    ].filter(Boolean).join("\n");
};

const safeJsonString = (value: unknown) => {
    return JSON.stringify(String(value ?? ""));
};

const sourceLabel = (source: string) => {
    return hotTrendSourceOptions.find(item => item.value === source)?.label || source;
};

const riskLabel = (risk: HotTrendRisk) => {
    const map: Record<HotTrendRisk, string> = {
        low: "低风险",
        medium: "谨慎使用",
        high: "不建议",
    };
    return map[risk] || "待判断";
};

const riskColor = (risk: HotTrendRisk) => {
    const map: Record<HotTrendRisk, string> = {
        low: "green",
        medium: "orange",
        high: "red",
    };
    return map[risk] || "gray";
};

const normalizeHotTrendCard = (raw: any, index: number): HotTrendCard | null => {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const title = String(raw.title || raw.hotTitle || raw.name || raw.topic || "").trim();
    if (!title) {
        return null;
    }
    const rawRisk = String(raw.risk || raw.riskLevel || raw.risk_level || "").toLowerCase();
    const risk: HotTrendRisk =
        rawRisk === "high" || rawRisk.includes("高") || rawRisk.includes("不建议")
            ? "high"
            : rawRisk === "medium" || rawRisk.includes("中") || rawRisk.includes("谨慎")
              ? "medium"
              : "low";
    const rawScore = raw.fitScore ?? raw.fit_score ?? raw.score ?? raw.fit ?? raw.matchScore ?? raw.match_score ?? 50;
    const fitScore = Math.max(0, Math.min(100, Number(rawScore) || 50));
    const rawSelected = raw.selected ?? raw.use ?? raw.usable ?? raw.recommended;
    return {
        id: String(raw.id || makeHotTrendCardId(title, index)),
        source: String(raw.source || raw.platform || ""),
        title,
        summary: String(raw.summary || raw.reason || raw.description || raw.desc || ""),
        category: String(raw.category || "热点话题"),
        heat: String(raw.heat || ""),
        fitScore,
        risk,
        usableAngle: String(raw.usableAngle || raw.usable_angle || raw.angle || ""),
        integration: String(raw.integration || raw.integrationIdea || raw.integration_idea || raw.combineWay || raw.combine_way || ""),
        forcedAngle: String(raw.forcedAngle || raw.forced_angle || raw.hardSellAngle || raw.hard_sell_angle || ""),
        hookExample: String(raw.hookExample || raw.hook_example || raw.openingExample || raw.opening_example || ""),
        playIdea: String(raw.playIdea || raw.play_idea || raw.idea || ""),
        avoid: String(raw.avoid || ""),
        selected:
            typeof rawSelected === "boolean"
                ? rawSelected
                : typeof rawSelected === "string"
                  ? /true|yes|1|推荐|可用|使用/i.test(rawSelected)
                  : risk !== "high" && fitScore >= 70,
        analyzed: true,
    };
};

const makeHotTrendCardId = (title: string, index: number) => {
    return `${Date.now()}-${index}-${title.slice(0, 12)}`;
};

const candidateToBackupHotTrendCard = (item: HotTrendCandidate, index: number): HotTrendCard => ({
    id: item.id || makeHotTrendCardId(item.title, index),
    source: item.source,
    title: item.title,
    summary: item.summary || "原始热榜候选，模型未判定为优先推荐，可手动勾选作为借势灵感。",
    category: "热门备选",
    heat: item.heat || "",
    fitScore: 50,
    risk: "medium",
    usableAngle: "",
    integration: "",
    forcedAngle: "",
    hookExample: "",
    playIdea: "",
    avoid: "",
    selected: false,
    analyzed: false,
});

const mergeAnalyzedHotTrendCards = (cards: HotTrendCard[], candidates: HotTrendCandidate[]) => {
    const byId = new Map(cards.map(card => [card.id, card]));
    const usedKeys = new Set(cards.flatMap(card => [`${card.source}:${card.title}`.toLowerCase(), card.title.toLowerCase()]));
    for (const candidate of candidates) {
        const key = `${candidate.source}:${candidate.title}`.toLowerCase();
        const titleKey = candidate.title.toLowerCase();
        const existing = Array.from(byId.values()).find(card => card.title.toLowerCase() === titleKey);
        if (existing) {
            existing.id = existing.id || candidate.id;
            existing.source = existing.source || candidate.source;
            existing.heat = existing.heat || candidate.heat || "";
            continue;
        }
        if (byId.has(candidate.id) || usedKeys.has(key) || usedKeys.has(titleKey)) {
            continue;
        }
        const card = candidateToBackupHotTrendCard(candidate, byId.size);
        byId.set(card.id, card);
        usedKeys.add(key);
        usedKeys.add(titleKey);
    }
    const sourceOrder = new Map(hotTrendSourceOptions.map((item, index) => [item.value, index]));
    return Array.from(byId.values())
        .filter(card => {
            if (card.risk === "high") {
                return false;
            }
            const text = [card.title, card.summary, card.category, card.integration, card.forcedAngle, card.hookExample].join(" ");
            const memeLike = /梗|挑战|口头禅|名场面|流行语|评论区|模板|反转|沉浸式|显眼包|电子榨菜|谁懂|不是.*而是|发疯|抽象|整活/.test(text);
            return card.fitScore >= 35 || memeLike;
        })
        .sort((a, b) => {
        if (a.selected !== b.selected) {
            return a.selected ? -1 : 1;
        }
        const riskWeight: Record<HotTrendRisk, number> = { low: 0, medium: 1, high: 2 };
        if (riskWeight[a.risk] !== riskWeight[b.risk]) {
            return riskWeight[a.risk] - riskWeight[b.risk];
        }
        if (b.fitScore !== a.fitScore) {
            return b.fitScore - a.fitScore;
        }
            return (sourceOrder.get(a.source) ?? 99) - (sourceOrder.get(b.source) ?? 99);
        });
};

const buildHotTrendAnalysisPrompt = (items: HotTrendCandidate[]) => {
    const compactItems = items.slice(0, 12).map(item => ({
        id: item.id,
        source: item.source,
        title: item.title,
        summary: item.summary || "",
        heat: item.heat || "",
        rank: item.rank || "",
    }));
    const modeRule =
        hotTrendMode.value === "meme"
            ? "本次优先寻找“梗”：包括短视频流行表达、口头禅、评论区话术、挑战模板、反转句式、名场面结构、情绪梗。新闻事件/热搜热点只能作为备选，不要把普通新闻当成梗。"
            : "本次优先寻找热点话题：可以包含热搜事件、热门内容和公共讨论，但仍需筛掉高风险内容。";
    return `
请根据视频主题和生成要求，筛选最近热梗/热点是否适合融入短视频脚本。
${modeRule}

视频主题 / 对象 / IP：${safeJsonString(form.value.brandName)}
主题补充（可选）：${safeJsonString(form.value.brandBrief)}
目标人群：${safeJsonString(form.value.targetAudience)}
必须保留的信息（可选）：${safeJsonString(form.value.productSellingPoints)}
生成要求 / 台词约束（可选）：${safeJsonString(form.value.idea)}
希望关注的热点关键词：${safeJsonString(hotTrendKeyword.value)}
采集模式：${hotTrendMode.value === "meme" ? "热梗优先" : "热点优先"}

候选热点：
${JSON.stringify(compactItems, null, 2)}

请只输出如下 JSON：
{
  "trends": [
    {
      "id": "候选热点 id",
      "source": "来源",
      "title": "热点标题",
      "summary": "用一句话解释这个梗/话题的情绪或传播点",
      "category": "热梗|社会热点|生活方式|娱乐内容|知识技巧|其他",
      "heat": "热度信息，可为空",
      "fitScore": 0,
      "risk": "low|medium|high",
      "usableAngle": "为什么适合/不适合这个视频主题",
      "integration": "自然融合玩法：怎么把这个梗改成当前主题脚本里的表达",
      "forcedAngle": "硬蹭脑洞：如果强行结合，可以怎么蹭，允许脑洞但要说清楚风险",
      "hookExample": "可以直接启发脚本的开头示例，20字以内，口语化",
      "playIdea": "一个具体短视频玩法，比如评论区梗、反转开场、挑战模板、类比桥段",
      "avoid": "需要避开的表达、争议、侵权或事实风险",
      "selected": true
    }
  ]
}

判断规则：
1. fitScore 代表“可玩性+可结合度”，不是只看主题匹配；有传播感、能改写成短视频开头的梗，即使主题不相关也可以给 50-70 分。
2. 涉及政治、灾害伤亡、刑事案件、真实个人隐私、未成年人争议、仇恨歧视、造谣或强争议社会事件，risk 必须为 high，selected 必须为 false。
3. 不要写成风控报告。每条都要给一个可执行的玩法，尤其是 forcedAngle、hookExample、playIdea。
4. 如果是热梗优先，优先返回可迁移的表达结构，例如“不是X而是Y”“谁懂啊”“沉浸式”“显眼包”“电子榨菜”这类可改写模板；普通新闻热搜只能作为备选。
5. 如果候选热点不少于 10 条，至少返回 10 条，最多返回 12 条；不要只返回最适合的两三条。
6. 非常火但不一定贴合主题的热梗也要返回一部分，作为备选灵感，fitScore 可以较低，selected=false，但必须给“硬蹭脑洞”。
7. 实在不相干、没有可迁移句式、不能形成短视频玩法的内容不要返回。
8. selected 只给低风险且 fitScore >= 70 的热点；中等风险或明显硬蹭的内容 selected=false，让用户自己选。
9. 每条的 hookExample、playIdea、forcedAngle 必须针对该热点标题单独写，禁止使用同一句模板套所有候选。
`.trim();
};

const sanitizeHotTrendJsonText = (content: string) => {
    let inString = false;
    let escaped = false;
    let result = "";
    for (const ch of String(content || "").replace(/^\uFEFF/, "")) {
        if (inString) {
            if (escaped) {
                result += ch;
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                result += ch;
                escaped = true;
                continue;
            }
            if (ch === "\"") {
                result += ch;
                inString = false;
                continue;
            }
            if (ch === "\n") {
                result += "\\n";
                continue;
            }
            if (ch === "\r") {
                result += "\\r";
                continue;
            }
            if (ch === "\t") {
                result += "\\t";
                continue;
            }
            result += ch;
            continue;
        }
        if (ch === "\"") {
            inString = true;
        }
        if (ch >= " " || ch === "\n" || ch === "\r" || ch === "\t") {
            result += ch;
        }
    }
    return result.replace(/,\s*([}\]])/g, "$1").trim();
};

const extractHotTrendJsonText = (content: string) => {
    const raw = String(content || "").trim();
    const objectStart = raw.indexOf("{");
    const objectEnd = raw.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
        return raw.slice(objectStart, objectEnd + 1);
    }
    return raw;
};

const parseHotTrendAnalysisJson = (value: any) => {
    if (value && typeof value === "object") {
        return value;
    }
    const raw = String(value || "").trim();
    if (!raw) {
        return null;
    }
    const candidates = Array.from(
        new Set([
            raw,
            extractHotTrendJsonText(raw),
            sanitizeHotTrendJsonText(raw),
            sanitizeHotTrendJsonText(extractHotTrendJsonText(raw)),
        ].filter(Boolean))
    );
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (e) {
        }
    }
    return null;
};

const extractHotTrendAnalysisPayload = (ret: any) => {
    const msg = String(ret?.msg || "");
    const parseFailedPayload = msg.includes("解析返回数据失败:")
        ? msg.slice(msg.indexOf("解析返回数据失败:") + "解析返回数据失败:".length)
        : "";
    const candidates = [
        ret?.data?.json,
        ret?.data?.json?.trends ? ret.data.json : null,
        ret?.data,
        ret?.data?.content,
        parseFailedPayload,
    ];
    for (const candidate of candidates) {
        const parsed = parseHotTrendAnalysisJson(candidate);
        if (Array.isArray(parsed?.trends)) {
            return parsed;
        }
        if (Array.isArray(parsed)) {
            return { trends: parsed };
        }
    }
    return null;
};

const analyzeHotTrends = async (items: HotTrendCandidate[]) => {
    if (!modelGenerator.value) {
        throw new Error("请先选择脚本大模型，再分析热点匹配度");
    }
    const ret = await modelGenerator.value.chat(
        buildHotTrendAnalysisPrompt(items),
        {
            systemPrompt: [
                "你是短视频爆款梗策划，不是风控审核员。",
                "你必须输出严格 JSON，不要输出 Markdown、解释、注释或代码块。",
                "你的目标是筛掉完全不能用的垃圾项，并给出可执行的自然融合、硬蹭脑洞、开头示例和短视频玩法。",
                "允许脑洞和轻微硬蹭，但要标记风险，不要编造事实或照搬原梗。",
            ].join("\n"),
        },
        {},
        {
            format: "json",
        }
    );
    const payload = extractHotTrendAnalysisPayload(ret);
    if (ret.code && !payload) {
        throw new Error(ret.msg || "热点分析失败");
    }
    const trends = Array.isArray(payload?.trends) ? payload.trends : [];
    const cards = trends
        .map((item: any, index: number) => normalizeHotTrendCard(item, index))
        .filter(Boolean) as HotTrendCard[];
    if (!cards.length) {
        throw new Error("模型没有返回可用热点建议");
    }
    hotTrendCards.value = mergeAnalyzedHotTrendCards(cards, items);
};

const collectHotTrends = async () => {
    if (!modelGenerator.value) {
        Dialog.tipError("请先选择脚本大模型，用于判断热点是否匹配");
        return;
    }
    if (!form.value.brandName.trim() && !form.value.idea.trim()) {
        Dialog.tipError("请先填写视频主题或生成要求，才能判断热点是否适配");
        return;
    }
    try {
        collectingHotTrends.value = true;
        hotTrendLoadingText.value = "正在采集热梗...";
        hotTrendErrors.value = [];
        hotTrendAnalysisError.value = "";
        hotTrendSourceCounts.value = {};
        hotTrendCards.value = [];
        const ret = await window.$mapi.hottrend.collect({
            keyword: String(hotTrendKeyword.value || ""),
            sources: [...hotTrendSources.value],
            limit: 15,
            mode: hotTrendMode.value,
        });
        hotTrendCandidates.value = JSON.parse(JSON.stringify(ret.items || []));
        hotTrendErrors.value = JSON.parse(JSON.stringify(ret.errors || []));
        hotTrendSourceCounts.value = JSON.parse(JSON.stringify(ret.sourceCounts || {}));
        if (!hotTrendCandidates.value.length) {
            throw new Error("没有采集到热点内容");
        }
        const fallbackCards = mergeAnalyzedHotTrendCards([], hotTrendCandidates.value).slice(0, 15);
        hotTrendLoadingText.value = "正在让 AI 生成玩法...";
        try {
            await analyzeHotTrends(hotTrendCandidates.value.slice(0, 15));
            hotTrendCards.value = hotTrendCards.value.slice(0, 15);
            hotTrendAnalysisError.value = "";
            Dialog.tipSuccess("热梗已采集并完成 AI 精修");
        } catch (e: any) {
            hotTrendCards.value = fallbackCards;
            hotTrendAnalysisError.value = e?.message || "AI 精修失败，已先展示原始候选";
            Dialog.tipError(hotTrendAnalysisError.value);
        }
    } catch (e: any) {
        Dialog.tipError(e?.message || "热点采集失败");
    } finally {
        collectingHotTrends.value = false;
        hotTrendLoadingText.value = "";
    }
};

const buildHotTrendPromptSection = () => {
    const selected = selectedHotTrendCards.value;
    if (!selected.length) {
        return "热点融合：未选择热点。";
    }
    const modeText: Record<HotTrendFuseMode, string> = {
        light: "轻融合：只借用情绪、表达方式或开头语感，不直接写热点名称。",
        medium: "中融合：可把热点作为开头钩子或场景背景，但视频主题仍是主线。",
        strong: "强融合：可围绕安全热点设计剧情，但不得编造事实、消费争议或照搬原梗。",
    };
    return [
        `热点融合模式：${modeText[hotTrendFuseMode.value]}`,
        "已选热点灵感：",
        JSON.stringify(
            selected.map(item => ({
                title: item.title,
                source: sourceLabel(item.source),
                summary: item.summary,
                fitScore: item.fitScore,
                usableAngle: item.usableAngle,
                integration: item.integration,
                forcedAngle: item.forcedAngle,
                hookExample: item.hookExample,
                playIdea: item.playIdea,
                avoid: item.avoid,
            })),
            null,
            2
        ),
        "热点使用规则：自然借势，不硬蹭；不要复刻原梗原句；不要提及平台热榜来源；不要使用高风险社会事件；如果热点与视频主题冲突，以主题表达为准。",
    ].join("\n");
};

const pathToFileUrl = (path: string) => {
    if (/^file:\/\//i.test(path)) {
        return path;
    }
    if (/^\\\\/.test(path)) {
        return `file:${path.replace(/\\/g, "/")}`;
    }
    return `file:///${path.replace(/\\/g, "/")}`;
};

const pathToDataUrl = async (path: string) => {
    const buffer = await window.$mapi.file.readBuffer(path);
    if (!buffer) {
        throw new Error("参考视频读取失败");
    }
    const ext = FileUtil.getExt(path);
    const mime = FileUtil.extensionToType(ext) || "video/mp4";
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${mime};base64,${window.btoa(binary)}`;
};

const pickImageFiles = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return "";
    }
    return filePath;
};

const pickReferenceImage = async () => {
    const filePath = await pickImageFiles();
    if (!filePath) {
        return;
    }
    try {
        referenceImages.value.push({
            path: filePath,
            name: FileUtil.getBaseName(filePath, true),
            dataUrl: await pathToDataUrl(filePath),
        });
    } catch (e: any) {
        Dialog.tipError(e?.message || "参考图片读取失败");
    }
};

const removeReferenceImage = (index: number) => {
    referenceImages.value.splice(index, 1);
};

const marketingAssetTypeLabel = (type: MarketingAssetType) => {
    return marketingAssetTypeOptions.find(item => item.value === type)?.label || "参考资产";
};

const assetDisplayUrl = (asset: MarketingAsset) => {
    return asset.dataUrl || asset.url || "";
};

const normalizeMarketingAssetType = (value: any): MarketingAssetType => {
    const raw = String(value || "").toLowerCase();
    if (raw.includes("scene") || raw.includes("场景") || raw.includes("环境")) {
        return "scene";
    }
    if (raw.includes("prop") || raw.includes("item") || raw.includes("道具") || raw.includes("产品") || raw.includes("物件")) {
        return "prop";
    }
    return "character";
};

const pickMarketingAsset = async () => {
    const filePath = await pickImageFiles();
    if (!filePath) {
        return;
    }
    try {
        const name = assetUploadName.value.trim() || FileUtil.getBaseName(filePath, true);
        marketingAssets.value.push({
            id: `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type: assetUploadType.value,
            name,
            url: filePath,
            dataUrl: await pathToDataUrl(filePath),
            status: "ready",
            note: "手动上传",
        });
        assetUploadName.value = "";
    } catch (e: any) {
        Dialog.tipError(e?.message || "资产图片读取失败");
    }
};

const removeMarketingAsset = (index: number) => {
    const asset = marketingAssets.value[index];
    marketingAssets.value.splice(index, 1);
    if (!asset?.id) {
        return;
    }
    drafts.value.forEach(draft => {
        draft.scenes.forEach(scene => {
            scene.assetIds = (scene.assetIds || []).filter(id => id !== asset.id);
        });
    });
};

const addSuggestedMarketingAsset = (asset: Partial<MarketingAsset>) => {
    const name = String(asset.name || "").trim();
    const prompt = String(asset.prompt || "").trim();
    if (!name && !prompt) {
        return;
    }
    const type = normalizeMarketingAssetType(asset.type);
    const exists = marketingAssets.value.some(item => item.type === type && item.name === (name || marketingAssetTypeLabel(type)));
    if (exists) {
        return;
    }
    marketingAssets.value.push({
        id: `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        name: name || marketingAssetTypeLabel(type),
        url: "",
        prompt,
        note: String(asset.note || "AI 根据脚本建议生成"),
        status: "suggested",
    });
};

const ensureSuggestedAssetsFromDrafts = (items: MarketingDraft[], json?: any) => {
    if (readyMarketingAssets.value.length) {
        return;
    }
    const rawAssets = [
        ...(Array.isArray(json?.assets) ? json.assets : []),
        ...(Array.isArray(json?.referenceAssets) ? json.referenceAssets : []),
        ...items.flatMap(item => (Array.isArray(item.suggestedAssets) ? item.suggestedAssets : [])),
    ];
    rawAssets.forEach(item => addSuggestedMarketingAsset(item));
};

const pickSceneReferenceImage = async (scene: SceneDraft) => {
    const filePath = await pickImageFiles();
    if (!filePath) {
        return;
    }
    scene.referenceImageUrl = filePath;
    scene.referenceImageName = FileUtil.getBaseName(filePath, true);
};

const clearSceneReferenceImage = (scene: SceneDraft) => {
    scene.referenceImageUrl = "";
    scene.referenceImageName = "";
};

const uniqueNonEmptyStrings = (values: string[]) => {
    return Array.from(new Set(values.map(item => String(item || "").trim()).filter(Boolean)));
};

const assetUrlValue = (asset: MarketingAsset) => {
    return asset.url || asset.dataUrl || "";
};

const sceneReadyAssets = (scene?: SceneDraft) => {
    const selectedIds = Array.isArray(scene?.assetIds) ? scene?.assetIds || [] : [];
    const source = selectedIds.length
        ? readyMarketingAssets.value.filter(item => selectedIds.includes(item.id))
        : readyMarketingAssets.value;
    return source.filter(item => assetUrlValue(item));
};

const buildImageAssetUrls = (scene: SceneDraft, extraUrls: string[] = []) => {
    return uniqueNonEmptyStrings([
        ...sceneReadyAssets(scene).map(assetUrlValue),
        ...extraUrls,
    ]);
};

const buildAssetReferenceInstruction = (scene?: SceneDraft) => {
    const assets = sceneReadyAssets(scene);
    if (!assets.length) {
        return "";
    }
    const types = Array.from(new Set(assets.map(asset => marketingAssetTypeLabel(asset.type)))).join("、");
    return `参考输入图：已提供${types || "一致性资产"}，生成时保持对应人物、场景或道具的核心外观一致；允许改变姿态、表情、机位和动作。不要把参考图文件名、说明文字或水印画进画面。`;
};

const assetsByTypeUrls = (assets: MarketingAsset[], type: MarketingAssetType) => {
    return assets.filter(item => item.type === type).map(assetUrlValue).filter(Boolean);
};

const fieldText = (field: any) => {
    return [field?.name, field?.label, field?.placeholder]
        .map(item => String(item || "").toLowerCase())
        .join(" ");
};

const fieldLooksLike = (field: any, patterns: Array<string | RegExp>) => {
    const text = fieldText(field);
    return patterns.some(pattern => typeof pattern === "string" ? text.includes(pattern.toLowerCase()) : pattern.test(text));
};

const defaultCloudFieldValue = (field: any, fallback: any = "") => {
    return typeof field?.defaultValue !== "undefined" && field.defaultValue !== null && String(field.defaultValue).trim() !== ""
        ? field.defaultValue
        : fallback;
};

const ratioValueForCloudField = (field: any, ratio: string) => {
    const normalizedRatio = String(ratio || "9:16").trim();
    const options = Array.isArray(field?.options) ? field.options : [];
    const matchedOption = options.find((item: any) => {
        const text = `${item?.label || ""} ${item?.value || ""}`.toLowerCase();
        return text.includes(normalizedRatio.toLowerCase());
    });
    if (matchedOption) {
        return matchedOption.value;
    }
    if (/9\s*:\s*16/.test(normalizedRatio) && String(field?.name || "").includes("image_3")) {
        return "9:16 portrait 768x1344";
    }
    return defaultCloudFieldValue(field, normalizedRatio);
};

const nodeKeyFromField = (field: any) => {
    const help = String(field?.help || "");
    const nodeId = help.match(/nodeId=([^,\s]+)/i)?.[1] || "";
    const fieldName = help.match(/fieldName=([^,\s]+)/i)?.[1] || "";
    return `${nodeId}:${fieldName}`;
};

const parseCloudFieldOptionsFromNodeInfo = (fieldData: any) => {
    if (Array.isArray(fieldData)) {
        return fieldData;
    }
    const text = String(fieldData || "").trim();
    if (!text) {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            return [];
        }
        if (Array.isArray(parsed[0])) {
            return parsed[0].map((item: any) => ({
                name: String(item || ""),
                index: String(item || ""),
                description: String(item || ""),
            }));
        }
        return parsed;
    } catch (e) {
        return [];
    }
};

const enrichCloudSchemaFields = (template: CloudTemplateRecord, fields: any[]) => {
    let nodeInfoList: any[] = [];
    try {
        const parsed = JSON.parse(template.content.nodeInfoTemplateJson || "[]");
        nodeInfoList = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        nodeInfoList = [];
    }
    const nodeMap = new Map(
        nodeInfoList.map(item => [`${item?.nodeId || ""}:${item?.fieldName || ""}`, item])
    );
    return fields.map(field => {
        const node = nodeMap.get(nodeKeyFromField(field));
        const fieldDataOptions = parseCloudFieldOptionsFromNodeInfo(node?.fieldData);
        if (!fieldDataOptions.length) {
            return field;
        }
        return {
            ...field,
            options: fieldDataOptions.map((item: any) => ({
                label: String(item?.description || item?.name || item?.index || ""),
                value: String(item?.index ?? item?.name ?? item?.description ?? ""),
            })),
        };
    });
};

const valueForCloudField = (
    field: any,
    capability: "image" | "video",
    base: Record<string, any>,
    assets: MarketingAsset[]
) => {
    const characterAssets = assetsByTypeUrls(assets, "character");
    const sceneAssets = assetsByTypeUrls(assets, "scene");
    const propAssets = assetsByTypeUrls(assets, "prop");
    const allAssets = assets.map(assetUrlValue).filter(Boolean);
    const wantsArray = ["images", "audios", "videos", "files"].includes(String(field?.type || ""));
    const chooseFileValue = (items: string[]) => wantsArray ? items : items[0] || "";

    if (fieldLooksLike(field, ["negative", "反向", "负面"])) {
        return base.negativePrompt || field.defaultValue || "";
    }
    if (fieldLooksLike(field, ["文生/图生", "文生图生", "打开是文生"])) {
        return defaultCloudFieldValue(field, "false");
    }
    if (fieldLooksLike(field, ["count", "number", "数量", "张数", "个数"])) {
        return defaultCloudFieldValue(field, 1);
    }
    if (fieldLooksLike(field, ["duration", "time", "seconds", "时长", "秒"])) {
        return base.duration;
    }
    if (fieldLooksLike(field, ["ratio", "aspect", "size", "画幅", "比例", "尺寸"])) {
        return ratioValueForCloudField(field, base.ratio);
    }
    if (String(field?.type || "") === "select") {
        return defaultCloudFieldValue(field, "");
    }
    if (String(field?.type || "") === "number") {
        return defaultCloudFieldValue(field, 0);
    }
    if (["image", "images", "file", "files"].includes(String(field?.type || ""))) {
        const imageValues = capability === "video"
            ? [base.firstFrame, ...allAssets].filter(Boolean)
            : allAssets;
        return chooseFileValue(imageValues);
    }
    if (fieldLooksLike(field, ["character", "person", "role", "avatar", "人物", "角色", "主角"])) {
        return chooseFileValue(characterAssets.length ? characterAssets : allAssets);
    }
    if (fieldLooksLike(field, ["scene", "background", "environment", "space", "场景", "背景", "环境", "空间"])) {
        return chooseFileValue(sceneAssets.length ? sceneAssets : allAssets);
    }
    if (fieldLooksLike(field, ["prop", "product", "item", "object", "道具", "产品", "物件", "商品"])) {
        return chooseFileValue(propAssets.length ? propAssets : allAssets);
    }
    if (fieldLooksLike(field, ["reference", "asset", "素材", "参考", "一致性"])) {
        return chooseFileValue(allAssets);
    }
    if (fieldLooksLike(field, ["image_prompt", "imageprompt", "图片提示", "生图提示"])) {
        return base.imagePrompt || base.prompt;
    }
    if (fieldLooksLike(field, ["video_prompt", "videoprompt", "视频提示", "生视频提示"])) {
        return base.videoPrompt || base.prompt;
    }
    if (fieldLooksLike(field, ["prompt", "text", "desc", "description", "提示词", "描述", "文案"])) {
        return base.prompt;
    }
    if (fieldLooksLike(field, ["title", "标题", "名称"])) {
        return base.title;
    }
    if (fieldLooksLike(field, ["subtitle", "caption", "字幕"])) {
        return base.subtitle || "";
    }
    if (fieldLooksLike(field, ["voiceover", "line", "台词", "口播", "旁白"])) {
        return base.voiceoverLine || "";
    }
    if (fieldLooksLike(field, ["first", "start", "首帧", "起始帧", "开始帧"])) {
        return chooseFileValue([base.firstFrame].filter(Boolean));
    }
    if (fieldLooksLike(field, ["last", "end", "tail", "尾帧", "结束帧"])) {
        return chooseFileValue([base.lastFrame].filter(Boolean));
    }
    return defaultCloudFieldValue(field, "");
};

const buildCloudMarketingInput = (
    template: CloudTemplateRecord,
    capability: "image" | "video",
    base: Record<string, any>,
    scene?: SceneDraft
) => {
    const assets = sceneReadyAssets(scene);
    const characterAssets = assetsByTypeUrls(assets, "character");
    const sceneAssets = assetsByTypeUrls(assets, "scene");
    const propAssets = assetsByTypeUrls(assets, "prop");
    const allAssetUrls = assets.map(assetUrlValue).filter(Boolean);
    const input: Record<string, any> = {
        ...base,
        image: base.firstFrame || allAssetUrls[0] || "",
        imageUrl: base.firstFrame || allAssetUrls[0] || "",
        images: capability === "video" ? [base.firstFrame, ...allAssetUrls].filter(Boolean) : allAssetUrls,
        imageUrls: capability === "video" ? [base.firstFrame, ...allAssetUrls].filter(Boolean) : allAssetUrls,
        referenceImageUrl: allAssetUrls[0] || "",
        referenceImages: allAssetUrls,
        assetImages: allAssetUrls,
        assetImageUrls: allAssetUrls,
        characterAsset: characterAssets[0] || "",
        characterAssets,
        sceneAsset: sceneAssets[0] || "",
        sceneAssets,
        propAsset: propAssets[0] || "",
        propAssets,
        marketingAssets: assets.map(item => ({
            type: item.type,
            name: item.name,
            url: assetUrlValue(item),
            prompt: item.prompt || "",
            note: item.note || "",
        })),
        selectedCapability: capability,
    };
    const schemaFields = enrichCloudSchemaFields(
        template,
        CloudTemplateTaskService.parseInputSchema(template.content.inputSchemaJson || "[]")
    );
    schemaFields.forEach(field => {
        const key = String(field.name || "").trim();
        if (!key) {
            return;
        }
        input[key] = valueForCloudField(field, capability, base, assets);
    });
    const missingRequiredFiles = schemaFields.filter(field => {
        const key = String(field.name || "").trim();
        if (!field.required || !key || !["image", "images", "file", "files", "video", "audio"].includes(String(field.type || ""))) {
            return false;
        }
        const value = input[key];
        return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    });
    if (missingRequiredFiles.length) {
        throw new Error(
            `云端模板「${template.title}」需要输入素材：${missingRequiredFiles.map(item => item.label || item.name).join("、")}。请先上传/生成参考资产，或换成支持文生图的云端生图模板。`
        );
    }
    return input;
};

const exportDraftPrompts = (draft: MarketingDraft) => {
    const lines = [
        `# ${draft.title}`,
        "",
        `开头钩子：${draft.hook}`,
        `口播文案：${draft.voiceover}`,
        `行动引导：${draft.cta}`,
        "",
        ...draft.scenes.flatMap((scene, index) => [
            `## 镜头 ${index + 1}：${scene.title}`,
            `时长：${scene.duration}s`,
            `台词：${cleanSentence(scene.voiceoverLine || "") || "-"}`,
            `说话方式：${narrationModeLabel(scene.narrationMode)}`,
            `字幕：${scene.subtitleMode === "none" ? "不显示" : effectiveSceneCaption(scene) || "-"}`,
            `参考图：${scene.referenceImageName || scene.referenceImageUrl || "-"}`,
            `关联资产：${sceneReadyAssets(scene).map(item => `${marketingAssetTypeLabel(item.type)}:${item.name}`).join("、") || "-"}`,
            "",
            "图片提示词：",
            buildImagePromptWithReferenceAnalysis(draft, scene),
            "",
            "视频提示词：",
            buildVideoPromptWithSpeech(scene, draft.referenceAnalysis, index, draft.scenes.length),
            "",
        ]),
    ];
    DownloadUtil.downloadFile(lines.join("\n"), `${draft.title || "marketing-video-prompts"}.md`);
};

const exportScenePrompts = (draft: MarketingDraft, scene: SceneDraft, index: number) => {
    const lines = [
        `# ${draft.title} - 镜头 ${index + 1} ${scene.title}`,
        "",
        `时长：${scene.duration}s`,
        `台词：${cleanSentence(scene.voiceoverLine || "") || "-"}`,
        `说话方式：${narrationModeLabel(scene.narrationMode)}`,
        `字幕：${scene.subtitleMode === "none" ? "不显示" : effectiveSceneCaption(scene) || "-"}`,
        `参考图：${scene.referenceImageName || scene.referenceImageUrl || "-"}`,
        `关联资产：${sceneReadyAssets(scene).map(item => `${marketingAssetTypeLabel(item.type)}:${item.name}`).join("、") || "-"}`,
        "",
        "图片提示词：",
        buildImagePromptWithReferenceAnalysis(draft, scene),
        "",
        "视频提示词：",
        buildVideoPromptWithSpeech(scene, draft.referenceAnalysis, index, draft.scenes.length),
        "",
    ];
    DownloadUtil.downloadFile(lines.join("\n"), `${draft.title || "marketing"}_镜头${index + 1}_prompts.md`);
};

const isDataOrRemoteUrl = (value: string) => {
    return /^(data:|https?:\/\/)/i.test(value);
};

const SEEDANCE_MIN_IMAGE_PIXELS = 409600;
const SEEDANCE_MAX_IMAGE_PIXELS = 2086876;

const dataUrlToBytes = (value: string) => {
    const raw = String(value || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
    const binary = window.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const loadImageElement = async (url: string) => {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("参考图读取失败"));
        img.src = url;
    });
    return img;
};

const normalizeSeedanceLocalImage = async (value: string) => {
    if (!value || isDataOrRemoteUrl(value)) {
        return value;
    }
    const dataUrl = await pathToDataUrl(value);
    if (!/^data:image\//i.test(dataUrl)) {
        return value;
    }
    const img = await loadImageElement(dataUrl);
    const pixels = img.naturalWidth * img.naturalHeight;
    if (pixels >= SEEDANCE_MIN_IMAGE_PIXELS && pixels <= SEEDANCE_MAX_IMAGE_PIXELS) {
        return value;
    }
    const targetPixels =
        pixels > SEEDANCE_MAX_IMAGE_PIXELS
            ? Math.floor(SEEDANCE_MAX_IMAGE_PIXELS * 0.98)
            : Math.ceil(SEEDANCE_MIN_IMAGE_PIXELS * 1.02);
    const scale = Math.sqrt(targetPixels / pixels);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return value;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const normalizedDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const file = await window.$mapi.file.hubFile("jpg", {
        returnFullPath: true,
        saveGroup: "image",
        savePathParam: {
            source: "seedance-reference",
            width: canvas.width,
            height: canvas.height,
        },
    });
    await window.$mapi.file.writeBuffer(file, dataUrlToBytes(normalizedDataUrl));
    return file;
};

const directFileRelayEnabled = (platform: DirectApiPlatformRecord | null) => {
    const relay = platform?.content.directFileRelay;
    return Boolean(
        relay?.enabled &&
            relay?.provider === "123pan" &&
            String(relay.clientID || "").trim() &&
            String(relay.clientSecret || "").trim() &&
            String(relay.parentFileID || "").trim()
    );
};

const resolveDirectApiImageUrl = async (value: string) => {
    if (!value || isDataOrRemoteUrl(value)) {
        return value;
    }
    return await pathToDataUrl(value);
};

const resolveDirectVideoReferenceImageUrl = async (platform: DirectApiPlatformRecord | null, value: string) => {
    if (!value || isDataOrRemoteUrl(value)) {
        return value;
    }
    const normalizedValue = await normalizeSeedanceLocalImage(value);
    if (directFileRelayEnabled(platform)) {
        return normalizedValue;
    }
    throw new Error("123 云盘资产入库失败：当前视频参考图是本地文件，但 Seedance 平台未配置可用的 123 云盘中转。请在平台设置中填写 Client ID、Client Secret、Folder ID 并开启资产模式。");
};

const collectStringValues = (value: any, result: string[] = []) => {
    if (!value) {
        return result;
    }
    if (typeof value === "string") {
        if (value.trim()) {
            result.push(value.trim());
        }
        return result;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectStringValues(item, result));
        return result;
    }
    if (typeof value === "object") {
        Object.values(value).forEach(item => collectStringValues(item, result));
    }
    return result;
};

const isImageOutput = (value: string) => {
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value) || /^data:image\//i.test(value);
};

const extractTaskOutputImage = (task: TaskRecord | null) => {
    if (!task) {
        return "";
    }
    const preferred = [
        task.result?.image,
        task.result?.url,
        ...(Array.isArray(task.result?.urls) ? task.result.urls : []),
        ...(Array.isArray(task.result?.localFiles) ? task.result.localFiles : []),
        ...(Array.isArray(task.result?.remoteUrls) ? task.result.remoteUrls : []),
    ]
        .map(item => String(item || "").trim())
        .filter(Boolean);
    const fromPreferred = preferred.find(isImageOutput) || preferred[0] || "";
    if (fromPreferred) {
        return fromPreferred;
    }
    return collectStringValues(task.result?.remoteResults || task.jobResult?.Query?.results || []).find(isImageOutput) || "";
};

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const waitForTaskImage = async (taskId: number | string, timeoutMs = 12 * 60 * 1000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const task = await TaskService.get(taskId);
        if (task?.status === "success") {
            const imageUrl = extractTaskOutputImage(task);
            if (!imageUrl) {
                throw new Error(`图片任务 #${taskId} 已完成，但没有识别到图片产物`);
            }
            return imageUrl;
        }
        if (task?.status === "fail") {
            throw new Error(task.statusMsg || `图片任务 #${taskId} 失败`);
        }
        await sleep(5000);
    }
    throw new Error(`图片任务 #${taskId} 等待超时`);
};

const waitForVideoEvent = (video: HTMLVideoElement, eventName: string) => {
    return new Promise<void>((resolve, reject) => {
        const onDone = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("参考视频加载失败"));
        };
        const cleanup = () => {
            video.removeEventListener(eventName, onDone);
            video.removeEventListener("error", onError);
        };
        video.addEventListener(eventName, onDone, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
};

const seekVideo = async (video: HTMLVideoElement, time: number) => {
    const pending = waitForVideoEvent(video, "seeked");
    video.currentTime = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
    await pending;
};

const extractVideoFrames = async (path: string, count = referenceFrameCount.value) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.src = pathToFileUrl(path);
    await waitForVideoEvent(video, "loadedmetadata");
    const canvas = document.createElement("canvas");
    const maxSide = 640;
    const sourceWidth = video.videoWidth || 720;
    const sourceHeight = video.videoHeight || 1280;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("无法创建视频帧画布");
    }
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : count;
    const times = Array.from({ length: count }, (_, index) => {
        return duration * ((index + 1) / (count + 1));
    });
    const frames: string[] = [];
    for (const time of times) {
        await seekVideo(video, time);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.78));
    }
    video.removeAttribute("src");
    video.load();
    return frames;
};

const pickReferenceVideo = async () => {
    const filePath = await window.$mapi.file.openFile({
        filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }],
    });
    if (!filePath || Array.isArray(filePath)) {
        return;
    }
    try {
        extractingFrames.value = true;
        const frameDataUrls = await extractVideoFrames(filePath);
        referenceVideo.value = {
            path: filePath,
            name: FileUtil.getBaseName(filePath, true),
            dataUrl: "",
            frameDataUrls,
        };
    } catch (e: any) {
        Dialog.tipError(e?.message || "参考视频抽帧失败");
    } finally {
        extractingFrames.value = false;
    }
};

const setReferenceVideoFromPath = async (filePath: string, displayName?: string) => {
    extractingFrames.value = true;
    const frameDataUrls = await extractVideoFrames(filePath);
    referenceVideo.value = {
        path: filePath,
        name: displayName || FileUtil.getBaseName(filePath, true),
        dataUrl: "",
        frameDataUrls,
    };
};

const importDouyinVideo = async () => {
    const url = douyinUrl.value.trim() || form.value.referenceUrl.trim();
    if (!url) {
        Dialog.tipError("请先填写抖音视频链接");
        return;
    }
    try {
        importingDouyin.value = true;
        const result = await window.$mapi.douyin.importVideo({
            url,
            cookie: douyinCookie.value.trim(),
            customApiUrl: douyinCustomApiUrl.value.trim(),
            download: true,
        });
        douyinImportResult.value = result;
        douyinUrl.value = result.resolvedUrl || url;
        form.value.referenceUrl = result.resolvedUrl || url;
        if (result.localVideoPath) {
            await setReferenceVideoFromPath(result.localVideoPath, `${result.title || result.awemeId || "douyin-video"}.mp4`);
            referenceVideoMode.value = "frames";
        }
        Dialog.tipSuccess(result.localVideoPath ? "抖音视频已导入并完成抽帧" : "抖音内容已导入");
    } catch (e: any) {
        Dialog.tipError(e?.message || "抖音链接导入失败，请尝试填写 Cookie 或上传本地视频");
    } finally {
        importingDouyin.value = false;
        extractingFrames.value = false;
    }
};

const clearReferenceVideo = () => {
    referenceVideo.value = null;
    clearReferenceArtifacts();
};

const clearReferenceArtifacts = () => {
    drafts.value.forEach(draft => {
        draft.referenceAnalysis = undefined;
    });
};

const clearAllReferenceInputs = () => {
    referenceVideo.value = null;
    referenceImages.value = [];
    form.value.referenceUrl = "";
    douyinUrl.value = "";
    douyinImportResult.value = null;
    clearReferenceArtifacts();
};

const buildReferenceContentParts = async () => {
    const imageParts = referenceImages.value
        .filter(item => String(item.dataUrl || "").trim())
        .map(item => ({
            type: "image_url" as const,
            image_url: {
                url: item.dataUrl,
            },
        }));
    if (!referenceVideo.value) {
        return imageParts;
    }
    if (referenceVideoMode.value === "frames") {
        const frameParts = referenceVideo.value.frameDataUrls
            .filter(url => String(url || "").trim())
            .map(url => ({
                type: "image_url" as const,
                image_url: { url },
            }));
        return [...imageParts, ...frameParts];
    }
    if (!referenceVideo.value.dataUrl) {
        referenceVideo.value.dataUrl = await pathToDataUrl(referenceVideo.value.path);
    }
    const videoUrl = String(referenceVideo.value.dataUrl || "").trim();
    if (!videoUrl) {
        return imageParts;
    }
    return [
        ...imageParts,
        {
            type: "video_url" as const,
            video_url: { url: videoUrl },
        },
    ];
};

const refreshReferenceFrames = async () => {
    if (!referenceVideo.value) {
        return;
    }
    try {
        extractingFrames.value = true;
        referenceVideo.value.frameDataUrls = await extractVideoFrames(referenceVideo.value.path);
        Dialog.tipSuccess("参考视频已重新抽帧");
    } catch (e: any) {
        Dialog.tipError(e?.message || "重新抽帧失败");
    } finally {
        extractingFrames.value = false;
    }
};

const buildScriptSystemPrompt = () => {
    return [
        "你是资深短视频导演、分镜策划和AI视频提示词工程师。",
        "你必须输出严格 JSON，不要输出 Markdown、解释、注释或代码块。",
        "任务是基于视频主题、生成要求和参考视频/参考图，生成可编辑的原创短视频方案；可以模仿参考视频的结构、节奏、镜头语言、风格和表达方法，但不能照搬人物身份、原画面、音乐、动作细节或原台词。",
        "如果提供参考视频或抽帧，必须先拆解它的剧情、分镜、景别、镜头运动、主体动作、画面风格、节奏、字幕/台词规律，并把可迁移要点写入 JSON 的 referenceAnalysis。",
        "每条视频必须适合竖屏短视频，前2秒有钩子，语言口语化，避免夸大承诺、低俗擦边和侵犯第三方权益。",
        "所有图片提示词和视频提示词必须能直接用于AI生图/生视频，并明确继承 referenceAnalysis 中可迁移的构图、节奏、转场和风格规则。",
        "同一条视频内必须保持主角、服装基调、视觉风格、色彩、光影和镜头语言一致；如果多个分镜属于同一地点，还必须保持场景空间、道具、背景元素和光线方向一致。",
    ].join("\n");
};

const buildScriptPrompt = () => {
    const selectedAngles = angles.slice(0, Number(form.value.count || 3));
    const angleGuide = selectedAngles
        .map(item => `${item.value}: ${item.label}，${item.desc}`)
        .join("\n");
    const douyinInfo = douyinImportResult.value
        ? [
              `抖音导入标题：${safeJsonString(douyinImportResult.value.title || "")}`,
              `抖音导入作者：${safeJsonString(douyinImportResult.value.author || "")}`,
              `抖音导入文案：${safeJsonString(douyinImportResult.value.desc || "")}`,
              `抖音解析来源：${safeJsonString(douyinImportResult.value.adapter || "")}`,
          ].join("\n")
        : "抖音导入：未导入";
    return `
请根据以下输入，生成 ${form.value.count} 条原创短视频 / AI 视频方案。

视频主题 / 对象 / IP：${safeJsonString(form.value.brandName)}
主题补充（可选）：${safeJsonString(form.value.brandBrief)}
目标人群：${safeJsonString(form.value.targetAudience)}
必须保留的信息（可选）：${safeJsonString(form.value.productSellingPoints)}
生成要求 / 台词约束（可选）：${safeJsonString(form.value.idea)}
优先开头台词：${safeJsonString(form.value.baseLine)}
参考链接：${safeJsonString(form.value.referenceUrl)}
参考视频：${referenceVideo.value ? safeJsonString(referenceVideo.value.name) : "未上传"}
参考视频抽帧说明：${referenceFrameRule.value || "未提供参考帧"}
参考图片：${referenceImages.value.length ? `已上传 ${referenceImages.value.length} 张` : "未上传"}
${douyinInfo}
参考视频使用规则：必须分析参考视频的剧情走向、分镜结构、镜头景别、镜头运动、主体动作、构图、色彩、光影、字幕/台词呈现和节奏；生成方案要模仿这些“方法”，但换成新主题/新人设/新画面，不复刻原视频人物、画面、音乐、动作细节或原台词。
${buildHotTrendPromptSection()}
画面风格：${safeJsonString(form.value.visualStyle)}。如果为空且提供了参考视频/抽帧，请从参考视频中归纳一段可直接回填到“画面风格”的短视觉摘要，并写入 draft.visualStyle 和 referenceAnalysis.visualStyle。
说话方式：${form.value.narrationMode === "none" ? "无台词/无旁白" : narrationModeLabel(form.value.narrationMode)}
字幕显示：${form.value.subtitleMode === "none" ? "不显示字幕" : "显示字幕"}
画幅：${form.value.ratio}
每条分镜数：${form.value.sceneCount}

创作角度必须按顺序使用：
${angleGuide}

请只输出如下 JSON：
{
  "drafts": [
    {
      "angle": "pain|desire|contrast|scene|conversion",
      "title": "短标题",
      "hook": "前2秒钩子，18字以内，口语化",
      "voiceover": "完整口播文案，不要包含CTA；如果说话方式为 none 可写空字符串或只写画面表达思路",
      "cta": "行动引导，简短自然",
      "visualStyle": "可直接回填到画面风格输入框的短视觉摘要，40-80字，只写画幅、色彩、光线、质感、场景氛围、构图规律",
      "referenceAnalysis": {
        "plot": "参考视频剧情/事件推进：按起承转合概括。如果没有参考视频则写空字符串",
        "structure": "参考视频分镜结构：例如开场钩子-冲突-展示-反转-收束",
        "shotLanguage": "镜头语言：景别、机位、运镜、转场、画面组织方式",
        "visualStyle": "视觉风格短摘要：40-80字，只写画幅、色彩、光线、质感、场景氛围、构图规律",
        "rhythm": "节奏：剪辑速度、镜头时长变化、信息密度、情绪起伏",
        "characterAction": "人物/主体动作和表演规律：只描述可迁移方法，不复刻具体人物",
        "captionAudio": "字幕、台词、旁白、音效/音乐的使用规律",
        "reusableRules": "后续生图/生视频必须复用的可迁移规则，写成具体执行要点"
      },
      "suggestedAssets": [
        {
          "type": "character|scene|prop",
          "name": "资产名称，例如：年轻女主角 / 明亮卧室 / 手机道具",
          "prompt": "生成这个资产参考图的提示词，要求主体清晰，可复用于多个分镜保持一致性",
          "note": "这个资产会用于哪些分镜或保持什么一致性"
        }
      ],
      "scenes": [
        {
          "title": "镜头名称",
          "duration": 4,
          "subtitle": "字幕文本；如果字幕模式为 none 则写空字符串",
          "voiceoverLine": "本分镜实际要说出来的中文台词；如果说话方式为 none 则写空字符串",
          "narrationMode": "none|voiceover|character",
          "subtitleMode": "none|caption",
          "imagePrompt": "中文生图提示词，包含主体、统一主角设定、场景连续性、环境、构图、光线、参考视频风格迁移点、竖屏安全区；必须原创",
          "videoPrompt": "中文生视频提示词，必须写清本镜独有的叙事职责、场景、动作、镜头运动和节奏；字幕必须跟随 voiceoverLine，不复刻参考视频"
        }
      ]
    }
  ]
}

硬性要求：
1. drafts 数量必须等于 ${form.value.count}。
2. 每个 draft 必须有 ${form.value.sceneCount} 个 scenes。
3. 每个 scene.duration 是一个独立 Seedance 视频任务时长，必须在 4-15 秒之间；请根据分镜内容分别设置，不要所有分镜机械相同。没有特殊节奏要求时可用 ${DEFAULT_SCENE_DURATION} 秒。
4. 不要使用“保证、最好、第一、治愈、百分百”等绝对化或夸大表述。
5. 不要出现第三方真实 UI、真实人物姓名、原视频人物外貌复刻。
6. 如果提供参考视频/抽帧，每个 draft.referenceAnalysis 必须具体，不允许写“无法判断”“仅供参考”这类空话；看不出的细节可以写“未从参考帧确认”，但必须分析可见的构图、主体、景别、色彩和节奏线索。
7. 每条视频的所有 imagePrompt 必须复用同一个主角设定和视觉风格；同一场景的分镜必须明确写出一致的场景空间、道具、光线方向和色调；不同场景也必须保持统一质感。
8. 如果当前说话方式不是 none，hook、voiceover、cta 不是备注，必须被分配到 scenes[].voiceoverLine 中：第一镜说 hook，中间镜说口播主体，最后一镜说 cta；如果说话方式为 none，scenes[].voiceoverLine 必须为空。
9. scenes[].narrationMode 默认使用 ${form.value.narrationMode}，scenes[].subtitleMode 默认使用 ${form.value.subtitleMode}；字幕模式为 none 时 scenes[].subtitle 必须为空。
10. 如果提供了已选热点灵感，必须把它转化为自然的短视频切入角度，优先融入 hook、场景冲突或口播语气；不要把热点当作孤立标签堆在文案里。
11. draft.visualStyle 和 referenceAnalysis.visualStyle 必须简短，40-80字，只描述视觉风格：画幅、色彩、光线、构图、镜头质感和场景氛围；不要写剧情、节奏、转场、人物动作、台词或可复用规则。
12. scenes 必须按参考视频结构拆成不同叙事步骤，例如“街访开场/痛点反应/解决方案讲解/收束行动”；每个 scene.videoPrompt 必须明显不同，不能两个分镜都写成同一场景、同一动作或同一讲解镜头。
13. 专有名词、产品名、账号名必须逐字保留，不要同音替换或改写；如果出现“他趣”，必须保持“他趣”两个字，不能写成或读成“其他”。
14. 每个 draft.suggestedAssets 必须列出保持分镜一致性需要的核心资产：至少包含 1 个人物资产；如果有固定场景或关键道具，也必须分别列为 scene/prop。不要把参考视频/参考图原人物当作资产，只能生成当前主题的新资产。
`.trim();
};

const isVisionInputUnsupportedError = (msg?: string) => {
    const value = String(msg || "").toLowerCase();
    return (
        value.includes("not a vlm") ||
        value.includes("vision language model") ||
        value.includes("text-only prompts") ||
        (value.includes("image") && value.includes("not support"))
    );
};

const showVisionModelRequiredDialog = async () => {
    const info = modelGenerator.value?.getSelectedModelInfo?.();
    const selected = info?.modelName || info?.modelId || "当前模型";
    await Dialog.alertError(
        [
            `当前选择的脚本大模型「${selected}」不支持或未标记支持图片/视频输入，无法分析抖音视频抽帧或参考图片。`,
            "",
            "请在“脚本大模型”里切换为支持视觉输入的模型，例如名称中带 Vision、VL、VLM、GPT-4o、Gemini、Qwen-VL、InternVL、GLM-4.5V 等能力的模型，然后重新点击“AI 生成脚本”。",
        ].join("\n"),
        "请切换视觉模型"
    );
};

const selectedScriptModelSupportsVision = () => {
    const info = modelGenerator.value?.getSelectedModelInfo?.();
    const model = info?.model as any;
    if (Array.isArray(model?.types) && model.types.includes("vision")) {
        return true;
    }
    const text = [info?.providerId, info?.providerTitle, info?.modelId, info?.modelName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    if (!text.trim()) {
        return false;
    }
    const visionPatterns = [
        "vision",
        "vlm",
        "qwen-vl",
        "qwen2-vl",
        "qwen2.5-vl",
        "internvl",
        "llava",
        "yi-vision",
        "grok-vision",
        "hunyuan-vision",
        "gemini",
        "gpt-4o",
        "gpt-4.1",
        "o4-mini",
        "omni",
    ];
    const visionRegexPatterns = [
        /\bglm[-\s]*4(?:\.\d+)?v\b/i,
        /\bglm[-\s]*4v\b/i,
        /\bglm[-\s]*\d+(?:\.\d+)?[-\s]*vision\b/i,
    ];
    return visionPatterns.some(pattern => text.includes(pattern)) || visionRegexPatterns.some(pattern => pattern.test(text));
};

const normalizeAiDraft = (raw: any, index: number): MarketingDraft | null => {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const fallbackAngle = angles[index % angles.length].value;
    const angle = angles.some(item => item.value === raw.angle) ? raw.angle : fallbackAngle;
    const scenes = Array.isArray(raw.scenes) ? raw.scenes.slice(0, Number(form.value.sceneCount || 3)) : [];
    if (!scenes.length) {
        return null;
    }
    const titleSeed = form.value.brandName.trim() || referenceVideo.value?.name || douyinImportResult.value?.title || "参考视频";
    const rawReferenceAnalysis = raw.referenceAnalysis && typeof raw.referenceAnalysis === "object" ? raw.referenceAnalysis : {};
    const rawVisualStyle =
        rawReferenceAnalysis.visualStyle ||
        raw.visualStyle ||
        raw.style ||
        raw.pictureStyle ||
        raw.imageStyle ||
        raw.videoStyle ||
        "";
    const rawAssets = Array.isArray(raw.suggestedAssets)
        ? raw.suggestedAssets
        : Array.isArray(raw.assets)
          ? raw.assets
          : Array.isArray(raw.referenceAssets)
            ? raw.referenceAssets
            : [];
    const draft: MarketingDraft = {
        id: `${angle}-${Date.now()}-${index}`,
        angle,
        title: String(raw.title || `${titleSeed}_${angleLabel(angle)}_短视频`),
        hook: String(raw.hook || ""),
        voiceover: String(raw.voiceover || ""),
        cta: String(raw.cta || ""),
        referenceAnalysis: raw.referenceAnalysis && typeof raw.referenceAnalysis === "object"
            ? {
                  plot: String(rawReferenceAnalysis.plot || ""),
                  structure: String(rawReferenceAnalysis.structure || ""),
                  shotLanguage: String(rawReferenceAnalysis.shotLanguage || ""),
                  visualStyle: String(rawVisualStyle || ""),
                  rhythm: String(rawReferenceAnalysis.rhythm || ""),
                  characterAction: String(rawReferenceAnalysis.characterAction || ""),
                  captionAudio: String(rawReferenceAnalysis.captionAudio || ""),
                  reusableRules: String(rawReferenceAnalysis.reusableRules || ""),
              }
            : rawVisualStyle
              ? { visualStyle: String(rawVisualStyle) }
            : undefined,
        suggestedAssets: rawAssets
            .map((item: any) => ({
                type: normalizeMarketingAssetType(item?.type || item?.assetType || item?.category),
                name: String(item?.name || item?.title || ""),
                prompt: String(item?.prompt || item?.description || item?.visualPrompt || ""),
                note: String(item?.note || item?.usage || item?.role || ""),
            }))
            .filter((item: any) => item.name || item.prompt),
        scenes: scenes.map((scene: any, sceneIndex: number) => ({
            id: `${angle}-${index}-${sceneIndex}`,
            title: String(scene?.title || `镜头 ${sceneIndex + 1}`),
            duration: Math.max(4, Math.min(15, Number(scene?.duration || DEFAULT_SCENE_DURATION))),
            subtitle: String(scene?.subtitle || ""),
            captionOverride: String(scene?.captionOverride || ""),
            voiceoverLine: String(scene?.voiceoverLine || ""),
            narrationMode: scene?.narrationMode === "none" ? "none" : scene?.narrationMode === "character" ? "character" : "voiceover",
            subtitleMode: scene?.subtitleMode === "none" ? "none" : "caption",
            imagePrompt: String(scene?.imagePrompt || ""),
            videoPrompt: String(scene?.videoPrompt || ""),
            assetIds: Array.isArray(scene?.assetIds) ? scene.assetIds.map((item: any) => String(item || "")).filter(Boolean) : [],
            referenceImageUrl: String(scene?.referenceImageUrl || ""),
        })),
    };
    ensureDraftVoiceoverLines(draft);
    return draft;
};

const buildVisualStyleFromReferenceAnalysis = (items: MarketingDraft[]) => {
    const analysis = items.find(item => item.referenceAnalysis?.visualStyle)?.referenceAnalysis;
    if (!analysis) {
        return "";
    }
    return summarizeVisualStyleText(analysis.visualStyle || "");
};

const summarizeVisualStyleText = (value: string) => {
    const raw = cleanSentence(value)
        .replace(/^(画面风格|视觉风格|整体风格|风格|视觉风格短摘要)[：:：\s]*/i, "")
        .replace(/(?:镜头语言|节奏|可复用规则|剧情推进|分镜结构|主体动作|字幕\/声音)[：:][^；。]*[；。]?/g, "");
    if (!raw) {
        return "";
    }
    const pieces = raw
        .split(/[；。]/)
        .map(item => item.trim())
        .filter(Boolean)
        .filter(item => !/(剧情|节奏|转场|台词|字幕|动作|人物动作|可复用|镜头语言|分镜结构)/.test(item));
    const compact = (pieces.length ? pieces : [raw]).join("；");
    return compact.length > 96 ? `${compact.slice(0, 96)}...` : compact;
};

const pickVisualStyleTextFromPrompt = (prompt: string) => {
    const text = cleanSentence(prompt);
    if (!text) {
        return "";
    }
    const patterns = [
        /(?:画面风格|视觉风格|整体风格|风格|质感|色彩|光线|构图|镜头质感)[：:，, ]([^。；;\n]{8,120})/,
        /([^。；;\n]{0,60}(?:竖屏|真实感|电影感|纪录片|写实|卡通|3d|二次元|明亮|暗调|高饱和|低饱和|柔光|硬光|手持|固定机位|推拉|摇移|近景|中景|远景)[^。；;\n]{0,80})/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
            return summarizeVisualStyleText(match[1]);
        }
    }
    return summarizeVisualStyleText(text);
};

const buildVisualStyleFromScenePrompts = (items: MarketingDraft[]) => {
    const scene = items.flatMap(item => item.scenes).find(item => item.imagePrompt || item.videoPrompt);
    if (!scene) {
        return "";
    }
    const imageStyle = pickVisualStyleTextFromPrompt(scene.imagePrompt);
    const videoStyle = pickVisualStyleTextFromPrompt(scene.videoPrompt);
    return summarizeVisualStyleText(imageStyle || videoStyle);
};

const shouldAutoFillVisualStyle = () => {
    const current = form.value.visualStyle.trim();
    return !current || current === DEFAULT_VISUAL_STYLE || current === LEGACY_DEFAULT_VISUAL_STYLE;
};

const syncVisualStyleFromDrafts = () => {
    if (!shouldAutoFillVisualStyle()) {
        return;
    }
    const inferredVisualStyle = buildVisualStyleFromReferenceAnalysis(drafts.value) || buildVisualStyleFromScenePrompts(drafts.value);
    if (inferredVisualStyle) {
        form.value.visualStyle = inferredVisualStyle;
    }
};

const applyAiDrafts = (json: any) => {
    const list = Array.isArray(json?.drafts) ? json.drafts : [];
    const normalized = list
        .map((item: any, index: number) => normalizeAiDraft(item, index))
        .filter(Boolean) as MarketingDraft[];
    if (!normalized.length) {
        throw new Error("模型返回 JSON 中没有可用脚本");
    }
    drafts.value = normalized;
    const inferredVisualStyle =
        buildVisualStyleFromReferenceAnalysis(normalized) ||
        summarizeVisualStyleText(json?.visualStyle || json?.style || json?.imageStyle || json?.videoStyle || "") ||
        buildVisualStyleFromScenePrompts(normalized);
    if (inferredVisualStyle && shouldAutoFillVisualStyle()) {
        form.value.visualStyle = inferredVisualStyle;
    }
    ensureSuggestedAssetsFromDrafts(normalized, json);
    selectedDraftId.value = normalized[0]?.id || "";
};

watch(
    drafts,
    () => {
        syncVisualStyleFromDrafts();
    },
    { deep: true, flush: "post" }
);

watch(
    hasReferenceInput,
    value => {
        if (!value) {
            clearReferenceArtifacts();
        }
    },
    { immediate: true, flush: "post" }
);

const buildHook = (angle: AngleType) => {
    const theme = textOr(form.value.brandName, "这个主题");
    const audience = textOr(form.value.targetAudience, "目标用户");
    const point = textOr(form.value.productSellingPoints, "更清晰地表达核心信息");
    const seedLine = form.value.baseLine.trim();
    const hookMap: Record<AngleType, string> = {
        pain: `${audience}最怕的不是没机会，而是状态一直掉线。`,
        desire: `状态好的人，连开口都更有吸引力。`,
        contrast: `同样是一天，有人越过越累，有人越聊越有状态。`,
        scene: `下班后的十分钟，可能就是你重新找回状态的开始。`,
        conversion: `想把状态拉回来，先从一个简单动作开始。`,
    };
    return cleanSentence(seedLine || `${hookMap[angle]} ${theme}要表达的是：${point}。`);
};

const buildVoiceover = (angle: AngleType) => {
    const theme = textOr(form.value.brandName, "这个主题");
    const brief = textOr(form.value.brandBrief, "围绕一个清晰的人设和情绪推进");
    const point = textOr(form.value.productSellingPoints, "把核心信息讲清楚");
    const idea = textOr(form.value.idea, "用短平快的方式完成起承转合");
    const map: Record<AngleType, string> = {
        pain: `${theme}先抛出一个观众熟悉的困境，再用一个小反转把情绪拉回来。${point}，让信息自然落到角色行动里。`,
        desire: `${theme}${brief}，让观众先被画面和情绪吸引，再跟着角色进入一个更想看的状态。${point}。`,
        contrast: `先让观众看到前后反差，再把转折放进一个具体场景。${idea}，让变化看起来更有记忆点。`,
        scene: `${theme}不需要一上来解释太多，先进入一个有代入感的场景，再通过动作、台词和节奏把重点带出来。`,
        conversion: `${theme}最后要给观众一个明确的情绪收束或行动方向。${point}，让结尾有完成感。`,
    };
    return cleanSentence(map[angle]);
};

const buildCta = (angle: AngleType) => {
    const theme = textOr(form.value.brandName, "这个故事");
    if (angle === "conversion") {
        return `如果你也有类似感受，就从这一刻开始改变。`;
    }
    return `看到最后，你会明白${theme}想说什么。`;
};

const sceneTemplates: Record<AngleType, Array<{ title: string; subtitle: string; visual: string }>> = {
    pain: [
        { title: "钩子", subtitle: "状态掉线，比没机会更可惜", visual: "都市男性独自走在夜晚街头，手机屏幕微光，表情疲惫但克制" },
        { title: "转折", subtitle: "先让自己轻松开口", visual: "人物坐在干净咖啡店，看着手机露出放松笑容，氛围自然" },
        { title: "主题呈现", subtitle: "把主动权慢慢拿回来", visual: "角色通过一个清晰动作完成情绪转折，画面留出字幕空间" },
    ],
    desire: [
        { title: "吸引", subtitle: "状态好，表达更有吸引力", visual: "自信男性整理外套走进城市夜景，霓虹但不杂乱" },
        { title: "价值", subtitle: "每次打开都是新的开始", visual: "明亮室内，人物自然聊天，镜头轻微推进，商业广告质感" },
        { title: "行动", subtitle: "从轻松聊天开始", visual: "手机和人物半身构图，画面干净，留出字幕安全区" },
    ],
    contrast: [
        { title: "前后对比", subtitle: "从犹豫到主动", visual: "画面左右分屏，一边疲惫低头，一边精神自信" },
        { title: "过程", subtitle: "一个动作改变节奏", visual: "人物坐在桌前打开手机，环境从冷色切到暖色" },
        { title: "结果", subtitle: "今天多一个可能", visual: "城市街角自然微笑，光线温暖，镜头有动感" },
    ],
    scene: [
        { title: "场景", subtitle: "下班后的十分钟", visual: "下班电梯或办公室门口，人物拿起手机，真实生活感" },
        { title: "代入", subtitle: "从一个轻松话题开始", visual: "沙发、夜灯、手机消息提示的抽象表达，温暖舒适" },
        { title: "收束", subtitle: "把好状态找回来", visual: "人物走出房间或阳台，城市灯光，姿态放松" },
    ],
    conversion: [
        { title: "直接问题", subtitle: "想把状态拉回来？", visual: "人物正对镜头，干净背景，短广告开场构图" },
        { title: "核心信息", subtitle: "轻松打开社交节奏", visual: "用道具、表情或场景变化呈现核心信息，不出现真实第三方 UI" },
        { title: "收束", subtitle: "现在就开始体验", visual: "角色完成动作或转身离开，竖屏短视频结尾，画面干净" },
    ],
};

const buildScene = (angle: AngleType, index: number, draftIndex: number): SceneDraft => {
    const templates = sceneTemplates[angle];
    const template = templates[index % templates.length];
    const theme = textOr(form.value.brandName, "视频主题");
    const style = textOr(form.value.visualStyle, "真实感短视频，竖屏构图");
    const duration = DEFAULT_SCENE_DURATION;
    const imagePrompt = [
        style,
        template.visual,
        `视频主题：${theme}`,
        `目标人群：${textOr(form.value.targetAudience, "目标用户")}`,
        "同一条视频保持同一位主角、相近服装基调、统一色彩和光影风格；如果与前后分镜同场景，保持空间布局、背景元素、道具和光线方向一致",
        form.value.subtitleMode === "none"
            ? "原创短视频画面，不复刻任何参考视频，不出现真实第三方平台界面，画面干净，不生成字幕贴纸"
            : "原创短视频画面，不复刻任何参考视频，不出现真实第三方平台界面，画面干净，字幕安全区充足",
    ].join("，");
    const videoPrompt = [
        `${style}，${template.visual}`,
        `镜头节奏适合 ${duration} 秒竖屏短视频第 ${index + 1} 段`,
        "延续同一条视频的主角、场景关系、色调、光影和整体质感",
        "轻微运镜，自然表情，短视频质感，不使用参考视频人物或动作",
        form.value.subtitleMode === "none" ? "不要生成画面字幕" : "画面字幕跟随本镜台词",
    ].join("，");
    return {
        id: `${angle}-${draftIndex}-${index}`,
        title: index < templates.length ? template.title : `${template.title}${index + 1}`,
        duration,
        subtitle: template.subtitle,
        voiceoverLine: "",
        narrationMode: form.value.narrationMode,
        imagePrompt,
        videoPrompt,
        assetIds: [],
        referenceImageUrl: "",
        subtitleMode: form.value.subtitleMode,
    };
};

const generateRuleDrafts = () => {
    if (!form.value.brandName.trim()) {
        Dialog.tipError("请先输入视频主题 / 对象 / IP");
        return;
    }
    const selectedAngles = angles.slice(0, Number(form.value.count || 3));
    drafts.value = selectedAngles.map((item, draftIndex) => ({
        id: `${item.value}-${Date.now()}-${draftIndex}`,
        angle: item.value,
        title: `${form.value.brandName.trim()}_${item.label}_短视频`,
        hook: buildHook(item.value),
        voiceover: buildVoiceover(item.value),
        cta: buildCta(item.value),
        suggestedAssets: [
            {
                type: "character",
                name: `${form.value.brandName.trim()}主角`,
                prompt: `${form.value.brandName.trim()}短视频统一主角，符合目标人群「${textOr(form.value.targetAudience, "目标用户")}」，形象清晰，可复用于多个分镜，${form.value.visualStyle || "竖屏短视频真实感风格"}`,
                note: "用于保持多个分镜的主角一致性",
            },
            {
                type: "scene",
                name: `${form.value.brandName.trim()}主场景`,
                prompt: `${form.value.brandName.trim()}短视频统一场景空间，能承载开场、展示和收束动作，光线、色彩和整体画面风格一致`,
                note: "用于保持同一视频的场景空间和光影一致性",
            },
        ],
        scenes: Array.from({ length: Number(form.value.sceneCount || 3) }, (_, sceneIndex) =>
            buildScene(item.value, sceneIndex, draftIndex)
        ),
    }));
    ensureSuggestedAssetsFromDrafts(drafts.value);
    drafts.value.forEach(draft => ensureDraftVoiceoverLines(draft));
    selectedDraftId.value = drafts.value[0]?.id || "";
};

const generateDrafts = async () => {
    const hasReferenceInput =
        Boolean(referenceVideo.value) ||
        Boolean(form.value.referenceUrl.trim()) ||
        Boolean(douyinImportResult.value);
    if (!form.value.brandName.trim() && !hasReferenceInput) {
        Dialog.tipError("请先输入视频主题 / 对象 / IP，或上传/导入参考视频");
        return;
    }
    if (!modelGenerator.value) {
        Dialog.tipError("请先选择大模型");
        return;
    }
    try {
        generatingScripts.value = true;
        const contentParts = await buildReferenceContentParts();
        if (contentParts.length && !selectedScriptModelSupportsVision()) {
            await showVisionModelRequiredDialog();
            return;
        }
        const ret = await modelGenerator.value.chat(
            buildScriptPrompt(),
            {
                systemPrompt: buildScriptSystemPrompt(),
                contentParts,
            },
            {},
            {
                format: "json",
            }
        );
        if (ret.code && contentParts.length && isVisionInputUnsupportedError(ret.msg)) {
            await showVisionModelRequiredDialog();
            return;
        }
        if (ret.code) {
            Dialog.tipError(ret.msg);
            return;
        }
        applyAiDrafts(ret.data?.json);
        Dialog.tipSuccess("脚本已生成，可继续手动修改");
    } catch (e: any) {
        Dialog.tipError(e?.message || "脚本生成失败");
    } finally {
        generatingScripts.value = false;
    }
};

const submitDirectImageTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    const platform = currentImagePlatform.value;
    if (!platform || !platform.content.apiKey.trim()) {
        throw new Error("请先配置可用的 GPT Image 2 平台");
    }
    const prompt = buildImagePromptWithReferenceAnalysis(draft, scene);
    const body = {
        model: "gpt-image-2",
        prompt,
        size: "1024x1536",
        quality: "high",
    } as Record<string, any>;
    const imageAssets = buildImageAssetUrls(scene);
    if (imageAssets.length) {
        body[imageAssets.length > 1 ? "image[]" : "image"] = imageAssets;
    } else {
        body.n = 1;
    }
    const modelConfig: RunningHubModelConfigType = {
        capability: "image",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: "短视频分镜图",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        submitPath: imageAssets.length ? "/v1/images/edits" : "/v1/images/generations",
        queryPath: "",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: imageAssets.length ? "form-data" : "json",
    };
    const record: TaskRecord = {
        biz: "DirectApiTask",
        title: `${draft.title}_${scene.title}_分镜图`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { source: "MarketingVideoFlow", draft, scene, prompt, imageAssets } },
    };
    return await TaskService.submit(record);
};

const submitCloudImageTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    const template = currentImageTemplate.value;
    if (!template?.id) {
        throw new Error("请先选择云端生图模板");
    }
    const prompt = buildImagePromptWithReferenceAnalysis(draft, scene);
    const imageAssets = buildImageAssetUrls(scene);
    const input = buildCloudMarketingInput(template, "image", {
        title: `${draft.title}_${scene.title}_分镜图`,
        prompt,
        text: prompt,
        imagePrompt: prompt,
        videoPrompt: buildVideoPromptWithSpeech(scene, draft.referenceAnalysis, draft.scenes.findIndex(item => item.id === scene.id), draft.scenes.length),
        firstFrame: scene.referenceImageUrl || "",
        firstFrameUrl: scene.referenceImageUrl || "",
        lastFrame: "",
        lastFrameUrl: "",
        duration: scene.duration,
        ratio: form.value.ratio,
        subtitle: effectiveSceneCaption(scene),
        voiceoverLine: scene.voiceoverLine || "",
        draft,
        scene,
    }, scene);
    const record = await CloudTemplateTaskService.buildTaskRecord(template.id, input);
    return await TaskService.submit(record);
};

const buildMarketingAssetPrompt = (asset: MarketingAsset) => {
    const typeText = marketingAssetTypeLabel(asset.type);
    return [
        `生成一张可复用于短视频多分镜的一致性${typeText}参考图。`,
        `资产名称：${asset.name}`,
        asset.prompt ? `资产要求：${asset.prompt}` : "",
        asset.note ? `补充说明：${asset.note}` : "",
        form.value.visualStyle ? `整体画面风格：${form.value.visualStyle}` : "",
        "要求：主体清晰，背景不过度复杂，适合后续作为 AI 生图参考资产；不要加入水印、UI、字幕、二维码或无关文字。",
    ].filter(Boolean).join("\n");
};

const submitAssetImageTask = async (asset: MarketingAsset) => {
    const prompt = buildMarketingAssetPrompt(asset);
    if (imageChannel.value === "cloud") {
        const template = currentImageTemplate.value;
        if (!template?.id) {
            throw new Error("请先选择云端生图模板");
        }
        const input = buildCloudMarketingInput(template, "image", {
            title: `${asset.name}_参考资产`,
            prompt,
            text: prompt,
            imagePrompt: prompt,
            videoPrompt: "",
            firstFrame: "",
            firstFrameUrl: "",
            lastFrame: "",
            lastFrameUrl: "",
            duration: DEFAULT_SCENE_DURATION,
            ratio: form.value.ratio,
            subtitle: "",
            voiceoverLine: "",
            assetDraft: asset,
        });
        const record = await CloudTemplateTaskService.buildTaskRecord(template.id, input);
        return await TaskService.submit(record);
    }

    const platform = currentImagePlatform.value;
    if (!platform || !platform.content.apiKey.trim()) {
        throw new Error("请先配置可用的 GPT Image 2 平台");
    }
    const body: Record<string, any> = {
        model: "gpt-image-2",
        prompt,
        size: "1024x1536",
        quality: "high",
        n: 1,
    };
    const modelConfig: RunningHubModelConfigType = {
        capability: "image",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: "短视频参考资产",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        submitPath: "/v1/images/generations",
        queryPath: "",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: "json",
    };
    const record: TaskRecord = {
        biz: "DirectApiTask",
        title: `${asset.name}_参考资产`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { source: "MarketingVideoFlow", prompt, asset } },
    };
    return await TaskService.submit(record);
};

const generateMarketingAsset = async (asset: MarketingAsset) => {
    try {
        submitting.value = true;
        asset.status = "generating";
        const taskId = await submitAssetImageTask(asset);
        asset.imageTaskId = Number(taskId || 0);
        const imageUrl = await waitForTaskImage(taskId);
        asset.url = imageUrl;
        asset.dataUrl = "";
        asset.status = "ready";
        Dialog.tipSuccess("参考资产已生成");
    } catch (e: any) {
        asset.status = "suggested";
        Dialog.tipError(e?.message || "参考资产生成失败");
    } finally {
        submitting.value = false;
    }
};

const submitImageTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    const id =
        imageChannel.value === "cloud"
            ? await submitCloudImageTask(draft, scene)
            : await submitDirectImageTask(draft, scene);
    scene.imageTaskId = Number(id || 0);
    return id;
};

const submitDirectVideoTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    const platform = currentVideoPlatform.value;
    if (!platform || !platform.content.apiKey.trim()) {
        throw new Error("请先配置可用的 Seedance 平台");
    }
    let referenceImageUrl = "";
    try {
        referenceImageUrl = await resolveDirectVideoReferenceImageUrl(platform, scene.referenceImageUrl || "");
    } catch (e: any) {
        throw new Error(e?.message || "123 云盘资产入库失败");
    }
    const sceneIndex = draft.scenes.findIndex(item => item.id === scene.id);
    const videoPrompt = buildVideoPromptWithSpeech(
        scene,
        draft.referenceAnalysis,
        sceneIndex >= 0 ? sceneIndex : undefined,
        draft.scenes.length
    );
    const body: Record<string, any> = {
        model: form.value.videoModel,
        content: [
            { type: "text", text: videoPrompt },
            ...(referenceImageUrl
                ? [
                      {
                          type: "image_url",
                          image_url: { url: referenceImageUrl },
                          role: "first_frame",
                      },
                  ]
                : []),
        ],
        ratio: form.value.ratio,
        duration: scene.duration,
        resolution: "720p",
        generate_audio: true,
        watermark: false,
    };
    const modelConfig: RunningHubModelConfigType = {
        capability: "video",
        connectorType: "custom-api",
        providerType: platform.content.platformType,
        providerProfileId: platform.id,
        providerProfileTitle: platform.title,
        templateTitle: "短视频片段",
        templateType: "custom-api",
        baseUrl: platform.content.baseUrl,
        apiKey: platform.content.apiKey,
        proxyUrl: platform.content.proxyUrl || "",
        directFileRelay: platform.content.directFileRelay,
        submitPath: "/api/v3/contents/generations/tasks",
        queryPath: "/api/v3/contents/generations/tasks/{id}",
        requestBodyJson: JSON.stringify(body, null, 2),
        requestFormat: "json",
    };
    const record: TaskRecord = {
        biz: "DirectApiTask",
        title: `${draft.title}_${scene.title}_视频`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { source: "MarketingVideoFlow", draft, scene, prompt: videoPrompt } },
    };
    return await TaskService.submit(record);
};

const submitSceneImageToVideoTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    const imageTaskId = await submitImageTask(draft, scene);
    const imageUrl = await waitForTaskImage(imageTaskId);
    scene.referenceImageUrl = imageUrl;
    const videoTaskId = await submitVideoTask(draft, scene);
    return { imageTaskId, imageUrl, videoTaskId };
};

const submitDraftChainTask = async (draft: MarketingDraft) => {
    ensureDraftVoiceoverLines(draft);
    const record: TaskRecord = {
        biz: "MarketingVideoChainTask",
        title: `${draft.title}_图生视频链路`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        param: {
            draft: JSON.parse(JSON.stringify(draft)),
            form: {
                ratio: form.value.ratio,
                videoModel: form.value.videoModel,
            },
            imageChannel: imageChannel.value,
            videoChannel: videoChannel.value,
            imagePlatformId: imagePlatformId.value,
            videoPlatformId: videoPlatformId.value,
            imageTemplateId: imageTemplateId.value,
            videoTemplateId: videoTemplateId.value,
            referenceImageUrls: readyMarketingAssets.value.map(assetUrlValue),
            marketingAssets: readyMarketingAssets.value.map(item => ({
                id: item.id,
                type: item.type,
                name: item.name,
                url: assetUrlValue(item),
                prompt: item.prompt || "",
                note: item.note || "",
            })),
        },
        modelConfig: {},
    };
    return await TaskService.submit(record);
};

const submitCloudVideoTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    const template = currentVideoTemplate.value;
    if (!template?.id) {
        throw new Error("请先选择云端生视频模板");
    }
    const sceneIndex = draft.scenes.findIndex(item => item.id === scene.id);
    const videoPrompt = buildVideoPromptWithSpeech(
        scene,
        draft.referenceAnalysis,
        sceneIndex >= 0 ? sceneIndex : undefined,
        draft.scenes.length
    );
    const input = buildCloudMarketingInput(template, "video", {
        title: `${draft.title}_${scene.title}_视频`,
        prompt: videoPrompt,
        text: videoPrompt,
        imagePrompt: buildImagePromptWithReferenceAnalysis(draft, scene),
        videoPrompt,
        firstFrame: scene.referenceImageUrl || "",
        firstFrameUrl: scene.referenceImageUrl || "",
        lastFrame: "",
        lastFrameUrl: "",
        duration: scene.duration,
        ratio: form.value.ratio,
        subtitle: effectiveSceneCaption(scene),
        voiceoverLine: scene.voiceoverLine || "",
        draft,
        scene,
    }, scene);
    const record = await CloudTemplateTaskService.buildTaskRecord(template.id, input);
    return await TaskService.submit(record);
};

const submitVideoTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    ensureDraftVoiceoverLines(draft);
    const id =
        videoChannel.value === "cloud"
            ? await submitCloudVideoTask(draft, scene)
            : await submitDirectVideoTask(draft, scene);
    scene.videoTaskId = Number(id || 0);
    return id;
};

const submitScene = async (draft: MarketingDraft, scene: SceneDraft, type: "image" | "video") => {
    try {
        submitting.value = true;
        ensureDraftVoiceoverLines(draft);
        if (type === "image") {
            await submitImageTask(draft, scene);
        } else {
            await submitVideoTask(draft, scene);
        }
        Dialog.tipSuccess("任务已提交");
    } catch (e: any) {
        Dialog.tipError(e?.message || "任务提交失败");
    } finally {
        submitting.value = false;
    }
};

const submitDraft = async (target: MarketingDraft, type: "image" | "video" | "both") => {
    try {
        submitting.value = true;
        ensureDraftVoiceoverLines(target);
        for (const scene of target.scenes) {
            if (type === "both") {
                await submitDraftChainTask(target);
                break;
            }
            if (type === "image") {
                await submitImageTask(target, scene);
            }
            if (type === "video") {
                await submitVideoTask(target, scene);
            }
        }
        Dialog.tipSuccess(type === "both" ? "图生视频链路已提交" : "任务已提交，可在右侧任务列表查看进度");
    } catch (e: any) {
        Dialog.tipError(e?.message || "任务提交失败");
    } finally {
        submitting.value = false;
    }
};

const submitAll = async (type: "image" | "video" | "both") => {
    if (!drafts.value.length) {
        Dialog.tipError("请先生成脚本");
        return;
    }
    try {
        submitting.value = true;
        for (const draft of drafts.value) {
            ensureDraftVoiceoverLines(draft);
            for (const scene of draft.scenes) {
                if (type === "both") {
                    await submitDraftChainTask(draft);
                    break;
                }
                if (type === "image") {
                    await submitImageTask(draft, scene);
                }
                if (type === "video") {
                    await submitVideoTask(draft, scene);
                }
            }
        }
        Dialog.tipSuccess(type === "both" ? "批量图生视频链路已提交" : "批量任务已提交");
    } catch (e: any) {
        Dialog.tipError(e?.message || "批量提交失败");
    } finally {
        submitting.value = false;
    }
};
</script>

<template>
    <div class="relative h-full min-h-[720px] bg-[#f5f6f8] flex flex-col">
        <div class="flex-shrink-0 border-b border-gray-100 bg-white px-6 py-4">
            <div class="flex flex-wrap items-center gap-4">
                <div class="min-w-0 flex-1">
                    <div class="text-[22px] font-semibold text-gray-900 leading-tight">短视频批量生成</div>
                    <div class="text-sm text-gray-500 mt-1">参考视频拆解剧情、分镜和风格后生成脚本；脚本可编辑，再提交图片/视频任务。</div>
                </div>
                <a-button @click="router.push('/server')">平台设置</a-button>
                <a-button type="primary" size="large" :loading="generatingScripts" @click="generateDrafts">AI 生成脚本</a-button>
            </div>
        </div>

        <div class="flex-grow overflow-y-auto px-6 py-5 pb-24">
            <div class="mx-auto max-w-[1440px] space-y-5">
                <div class="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div class="rounded-xl bg-white p-5 shadow-sm">
                        <div class="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <div class="text-base font-semibold text-gray-900">主题与参考输入</div>
                                <div class="text-xs text-gray-500 mt-1">参考视频会用于拆解剧情、分镜、节奏、风格和可迁移拍法，生成后仍可逐条改写。</div>
                            </div>
                            <a-tag color="arcoblue">大模型结构化生成</a-tag>
                        </div>
                        <a-form layout="vertical">
                            <div class="grid grid-cols-1 gap-x-4 xl:grid-cols-2">
                                <a-form-item label="视频主题 / 对象 / IP">
                                    <a-input v-model="form.brandName" placeholder="例如：末日求生短剧 / 水獭矿工IP / 家居好物开箱" />
                                </a-form-item>
                            </div>
                            <a-form-item label="抖音链接导入">
                                <div class="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                                        <a-input
                                            v-model="douyinUrl"
                                            class="min-w-[260px] flex-1"
                                            placeholder="粘贴抖音视频链接或分享短链"
                                            allow-clear
                                        />
                                        <a-button type="primary" :loading="importingDouyin || extractingFrames" @click="importDouyinVideo">
                                            导入并抽帧
                                        </a-button>
                                    </div>
                                    <div class="mt-2 text-xs leading-5 text-gray-500">
                                        会尝试解析公开视频并下载到本地缓存，再复用下方参考视频抽帧；后续脚本会分析参考视频的剧情、分镜、节奏和风格。失败时可填写 Cookie、接第三方解析 API，或直接上传本地视频。
                                    </div>
                                    <a-collapse class="mt-2 !bg-transparent" :bordered="false">
                                        <a-collapse-item key="douyin-advanced" header="高级设置：Cookie / 自定义解析 API">
                                            <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                                <a-textarea
                                                    v-model="douyinCookie"
                                                    :auto-size="{ minRows: 2, maxRows: 4 }"
                                                    placeholder="可选：抖音网页登录后的 Cookie，用于增强公开视频解析成功率"
                                                />
                                                <a-input
                                                    v-model="douyinCustomApiUrl"
                                                    placeholder="可选：第三方解析 API，POST { url, cookie }"
                                                    allow-clear
                                                />
                                            </div>
                                        </a-collapse-item>
                                    </a-collapse>
                                    <div v-if="douyinImportResult" class="mt-3 rounded-md bg-white px-3 py-2 text-xs leading-5 text-gray-600">
                                        <div class="flex flex-wrap gap-x-4 gap-y-1">
                                            <span>标题：{{ douyinImportResult.title || "-" }}</span>
                                            <span>作者：{{ douyinImportResult.author || "-" }}</span>
                                            <span>ID：{{ douyinImportResult.awemeId || "-" }}</span>
                                            <span>解析：{{ douyinImportResult.adapter || "-" }}</span>
                                        </div>
                                        <div v-if="douyinImportResult.desc" class="mt-1 line-clamp-2 text-gray-500">
                                            原文案：{{ douyinImportResult.desc }}
                                        </div>
                                    </div>
                                </div>
                            </a-form-item>
                            <a-form-item label="参考视频">
                                <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                                        <a-button :loading="extractingFrames" @click="pickReferenceVideo">上传视频</a-button>
                                        <a-button v-if="referenceVideo" :loading="extractingFrames" @click="refreshReferenceFrames">重抽帧</a-button>
                                        <a-button v-if="referenceVideo" @click="clearReferenceVideo">移除</a-button>
                                        <a-button v-if="hasReferenceInput || referenceImages.length" status="danger" @click="clearAllReferenceInputs">清空参考</a-button>
                                        <div class="min-w-[180px] flex-1 truncate text-sm text-gray-600">
                                            {{ referenceVideo?.name || "可选，上传后自动抽帧，供视觉模型拆解剧情/分镜/风格" }}
                                        </div>
                                    </div>
                                    <div v-if="referenceVideo" class="mt-3 flex min-w-0 flex-wrap items-center gap-3">
                                        <a-radio-group v-model="referenceVideoMode" type="button" class="shrink-0">
                                            <a-radio value="frames">抽帧</a-radio>
                                            <a-radio value="video">原视频</a-radio>
                                        </a-radio-group>
                                        <div class="text-xs text-gray-500">
                                            {{ referenceVideoMode === "frames" ? `已准备 ${referenceVideo.frameDataUrls.length} 张参考帧` : "仅适合支持 video_url 的模型" }}
                                        </div>
                                    </div>
                                    <div v-if="referenceVideo && referenceVideoMode === 'frames'" class="mt-3 flex min-w-0 flex-wrap items-center gap-3">
                                        <span class="text-xs text-gray-500">抽帧密度</span>
                                        <a-radio-group v-model="referenceFrameDensity" type="button" class="shrink-0" @change="refreshReferenceFrames">
                                            <a-radio v-for="option in frameDensityOptions" :key="option.value" :value="option.value">
                                                {{ option.label }}{{ option.count }}
                                            </a-radio>
                                        </a-radio-group>
                                        <span class="text-xs text-gray-400">
                                            {{ frameDensityOptions.find(item => item.value === referenceFrameDensity)?.desc }}
                                        </span>
                                    </div>
                                    <div v-if="referenceVideo && referenceVideoMode === 'frames'" class="mt-3 rounded-md bg-white px-3 py-2 text-xs leading-5 text-gray-500">
                                        均匀取样，不连续截取；默认标准 10 帧适合大多数视觉模型，用于拆解主体、场景、构图、色彩、镜头节奏和字幕规律。
                                    </div>
                                    <div v-if="referenceVideo && referenceVideoMode === 'frames'" class="mt-3">
                                        <div class="mb-2 flex items-center justify-between">
                                            <span class="text-xs font-medium text-gray-600">参考帧预览</span>
                                            <span class="text-xs text-gray-400">{{ referenceVideo.frameDataUrls.length }} 张</span>
                                        </div>
                                        <div v-if="referenceVideo.frameDataUrls.length" class="grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-8">
                                            <div
                                                v-for="(frame, index) in referenceVideo.frameDataUrls"
                                                :key="index"
                                                class="relative aspect-[9/16] min-h-[96px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
                                            >
                                                <img :src="frame" class="h-full w-full object-cover" />
                                                <div class="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] leading-none text-white">
                                                    {{ index + 1 }}
                                                </div>
                                            </div>
                                        </div>
                                        <div v-else class="rounded-md border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-xs text-gray-400">
                                            暂未抽到参考帧，请重抽帧或换一个本地视频文件。
                                        </div>
                                    </div>
                                </div>
                            </a-form-item>
                            <a-form-item label="参考图片">
                                <div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                                        <a-button @click="pickReferenceImage">上传图片</a-button>
                                        <div class="text-sm text-gray-600">
                                            可选，上传后会和参考视频一起交给视觉模型分析。
                                        </div>
                                    </div>
                                    <div v-if="referenceImages.length" class="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6 xl:grid-cols-8">
                                        <div
                                            v-for="(image, index) in referenceImages"
                                            :key="`${image.path}-${index}`"
                                            class="group relative aspect-[9/16] overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
                                        >
                                            <img :src="image.dataUrl" class="h-full w-full object-cover" />
                                            <button
                                                type="button"
                                                class="absolute right-1 top-1 hidden rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white group-hover:block"
                                                @click="removeReferenceImage(index)"
                                            >
                                                移除
                                            </button>
                                            <div class="absolute bottom-0 left-0 right-0 truncate bg-black/45 px-1.5 py-1 text-[10px] text-white">
                                                {{ image.name }}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </a-form-item>
                            <a-form-item label="参考资产 / 资产关联">
                                <div class="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                                        <a-select v-model="assetUploadType" class="!w-32">
                                            <a-option v-for="item in marketingAssetTypeOptions" :key="item.value" :value="item.value">
                                                {{ item.label }}
                                            </a-option>
                                        </a-select>
                                        <a-input v-model="assetUploadName" class="min-w-[180px] flex-1" placeholder="资产名称，可不填" allow-clear />
                                        <a-button type="primary" @click="pickMarketingAsset">上传资产图片</a-button>
                                    </div>
                                    <div class="mt-2 text-xs leading-5 text-gray-500">
                                        这里的资产会作为生图参考输入，用于保持人物、场景、道具在多个分镜间一致；上面的参考视频/参考图片只用于脚本和画面拆解。
                                    </div>
                                    <div v-if="marketingAssets.length" class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                        <div
                                            v-for="(asset, index) in marketingAssets"
                                            :key="asset.id"
                                            class="rounded-lg border border-white bg-white p-2 shadow-sm"
                                        >
                                            <div class="flex gap-2">
                                                <div class="h-20 w-16 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                                                    <img v-if="assetDisplayUrl(asset)" :src="assetDisplayUrl(asset)" class="h-full w-full object-cover" />
                                                    <div v-else class="flex h-full w-full items-center justify-center px-1 text-center text-[11px] text-gray-400">
                                                        待生成
                                                    </div>
                                                </div>
                                                <div class="min-w-0 flex-1">
                                                    <div class="flex min-w-0 items-center gap-2">
                                                        <a-select v-model="asset.type" size="mini" class="!w-24">
                                                            <a-option v-for="item in marketingAssetTypeOptions" :key="item.value" :value="item.value">
                                                                {{ item.label }}
                                                            </a-option>
                                                        </a-select>
                                                        <a-tag v-if="asset.status === 'suggested'" size="small" color="orange">AI建议</a-tag>
                                                        <a-tag v-else-if="asset.status === 'generating'" size="small" color="green">生成中</a-tag>
                                                        <a-tag v-else size="small" color="green">可用</a-tag>
                                                    </div>
                                                    <a-input v-model="asset.name" size="mini" class="mt-1" placeholder="资产名称" />
                                                </div>
                                            </div>
                                            <a-textarea
                                                v-model="asset.prompt"
                                                class="mt-2"
                                                :auto-size="{ minRows: 2, maxRows: 4 }"
                                                placeholder="资产生成提示词；修改后可重新生成"
                                            />
                                            <div v-if="asset.note || asset.url" class="mt-1 line-clamp-1 text-xs leading-5 text-gray-400">
                                                {{ asset.note || asset.url }}
                                            </div>
                                            <div class="mt-2 flex flex-wrap justify-end gap-2">
                                                <a-button
                                                    size="mini"
                                                    type="primary"
                                                    :loading="asset.status === 'generating'"
                                                    @click="generateMarketingAsset(asset)"
                                                >
                                                    {{ asset.status === "ready" ? "重新生成" : "生成资产" }}
                                                </a-button>
                                                <a-button v-if="asset.imageTaskId" size="mini" disabled>图 #{{ asset.imageTaskId }}</a-button>
                                                <a-button size="mini" status="danger" @click="removeMarketingAsset(index)">移除</a-button>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-else class="mt-3 rounded-md border border-dashed border-blue-100 bg-white px-3 py-4 text-center text-xs text-gray-400">
                                        暂无资产。可以手动上传人物/场景/道具图；如果不上传，AI 生成脚本后会在这里补出建议资产。
                                    </div>
                                </div>
                            </a-form-item>
                            <a-form-item label="热点灵感">
                                <div class="relative rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                                    <div
                                        v-if="collectingHotTrends"
                                        class="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-amber-50/70"
                                    >
                                        <a-spin />
                                        <div class="mt-2 text-sm font-medium text-amber-700">{{ hotTrendLoadingText || "正在加载..." }}</div>
                                    </div>
                                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                                        <a-input
                                            v-model="hotTrendKeyword"
                                            class="min-w-[220px] flex-1"
                                            placeholder="可选：净水器/社交/职场/养生等关键词"
                                            allow-clear
                                        />
                                        <a-checkbox-group v-model="hotTrendSources" class="flex flex-wrap gap-2">
                                            <a-checkbox v-for="source in hotTrendSourceOptions" :key="source.value" :value="source.value">
                                                {{ source.label }}
                                            </a-checkbox>
                                        </a-checkbox-group>
                                        <a-radio-group v-model="hotTrendMode" type="button" class="shrink-0">
                                            <a-radio v-for="mode in hotTrendModeOptions" :key="mode.value" :value="mode.value">
                                                {{ mode.label }}
                                            </a-radio>
                                        </a-radio-group>
                                        <a-radio-group v-model="hotTrendFuseMode" type="button" class="shrink-0">
                                            <a-radio v-for="mode in hotTrendFuseModeOptions" :key="mode.value" :value="mode.value">
                                                {{ mode.label }}
                                            </a-radio>
                                        </a-radio-group>
                                        <a-button type="primary" :loading="collectingHotTrends" @click="collectHotTrends">
                                            自动搜集热梗
                                        </a-button>
                                    </div>
                                    <div class="mt-2 text-xs leading-5 text-gray-500">
                                        热梗优先会偏向口头禅、评论区话术、挑战模板和短视频表达结构；高风险内容不会自动进入脚本。
                                    </div>
                                    <div v-if="hotTrendStatusText" class="mt-2 rounded-md bg-white px-3 py-2 text-xs leading-5 text-gray-600">
                                        {{ hotTrendStatusText }}。勾选状态会自动影响下一次“AI 生成脚本”，无需再点其他应用按钮。
                                    </div>
                                    <div v-if="hotTrendCandidates.length || Object.keys(hotTrendSourceCounts).length" class="mt-2 flex flex-wrap gap-2">
                                        <a-tag v-for="source in hotTrendSourceCountTags" :key="source.value" :color="source.count ? 'arcoblue' : 'gray'">
                                            {{ source.label }} {{ source.count }} 条
                                        </a-tag>
                                    </div>
                                    <div v-if="hotTrendErrors.length" class="mt-2 flex flex-wrap gap-2">
                                        <a-tag v-for="error in hotTrendErrors" :key="`${error.source}-${error.message}`" color="orange">
                                            {{ sourceLabel(error.source) }}失败：{{ error.message }}
                                        </a-tag>
                                    </div>
                                    <div v-if="hotTrendAnalysisError" class="mt-2 rounded-md bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-700">
                                        AI 精修未完成：{{ hotTrendAnalysisError }}。当前展示的是原始热榜候选，可手动勾选，也可以换脚本大模型后重新搜集。
                                    </div>
                                    <div v-if="hotTrendCards.length" class="mt-3 grid max-h-[230px] grid-cols-1 gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
                                        <div
                                            v-for="card in visibleHotTrendCards"
                                            :key="card.id"
                                            class="rounded-lg border border-white bg-white p-2 shadow-sm"
                                        >
                                            <div class="flex items-start gap-2">
                                                <a-checkbox v-model="card.selected" :disabled="card.risk === 'high'" class="mt-0.5" />
                                                <div class="min-w-0 flex-1">
                                                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                                                        <div class="truncate text-sm font-medium text-gray-900">{{ card.title }}</div>
                                                        <a-tag size="small">{{ sourceLabel(card.source) }}</a-tag>
                                                        <a-tag size="small" :color="riskColor(card.risk)">{{ riskLabel(card.risk) }}</a-tag>
                                                        <a-tag size="small" color="arcoblue">{{ card.fitScore }}分</a-tag>
                                                        <a-tag v-if="!card.analyzed" size="small" color="gray">待精修</a-tag>
                                                    </div>
                                                    <div class="mt-1 line-clamp-1 text-xs leading-5 text-gray-600">
                                                        {{ card.summary || card.usableAngle || "原始候选，可手动勾选后交给脚本模型发挥。" }}
                                                    </div>
                                                    <div v-if="card.analyzed && card.hookExample" class="mt-1 line-clamp-1 text-xs leading-5 text-blue-600">
                                                        开头：{{ card.hookExample }}
                                                    </div>
                                                    <div v-if="card.analyzed && (card.playIdea || card.integration)" class="mt-1 line-clamp-1 text-xs leading-5 text-gray-500">
                                                        玩法：{{ card.playIdea || card.integration }}
                                                    </div>
                                                    <div v-if="card.analyzed && card.forcedAngle" class="mt-1 line-clamp-1 text-xs leading-5 text-orange-500">
                                                        硬蹭：{{ card.forcedAngle }}
                                                    </div>
                                                    <div v-if="card.analyzed && card.avoid" class="mt-1 line-clamp-1 text-[11px] leading-5 text-gray-400">
                                                        避免：{{ card.avoid }}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </a-form-item>
                            <div class="grid grid-cols-1 gap-x-4 xl:grid-cols-2">
                                <a-form-item label="主题补充（可选）">
                                    <a-textarea v-model="form.brandBrief" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="可不填；只在需要固定角色、人设、世界观、内容边界时填写" />
                                </a-form-item>
                                <a-form-item label="必须保留的信息（可选）">
                                    <a-textarea v-model="form.productSellingPoints" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="可不填；需要固定的信息、情绪、梗点、产品点或剧情目标写这里" />
                                </a-form-item>
                            </div>
                            <div class="grid grid-cols-2 gap-x-4">
                                <a-form-item label="目标人群">
                                    <a-textarea v-model="form.targetAudience" :auto-size="{ minRows: 3, maxRows: 5 }" />
                                </a-form-item>
                                <a-form-item label="生成要求 / 台词约束（可选）">
                                    <a-textarea v-model="form.idea" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="可不填；只写额外控制项，比如必须说哪句台词、结尾动作、禁用元素" />
                                </a-form-item>
                            </div>
                            <a-form-item label="优先使用的开头台词">
                                <a-input v-model="form.baseLine" placeholder="可选，填写后会优先作为开头钩子" />
                            </a-form-item>
                            <a-form-item label="画面风格">
                                <a-textarea v-model="form.visualStyle" :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="可不填；上传参考视频后会根据拆解出的色彩、光线、构图、镜头质感自动填写" />
                            </a-form-item>
                        </a-form>
                    </div>

                    <div class="rounded-xl bg-white p-5 shadow-sm">
                        <div class="text-base font-semibold text-gray-900">生成设置</div>
                        <div class="text-xs text-gray-500 mt-1 mb-4">{{ referenceSummary }}</div>
                        <div class="space-y-4">
                            <div>
                                <div class="text-xs font-semibold text-gray-500 mb-2">脚本大模型</div>
                                <ModelGenerator ref="modelGenerator" biz="MarketingVideoFlow" />
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-500 mb-2">图片通道</div>
                                <a-radio-group v-model="imageChannel" type="button" class="mb-2 w-full">
                                    <a-radio v-for="item in channelOptions" :key="item.value" :value="item.value">{{ item.label }}</a-radio>
                                </a-radio-group>
                                <a-select v-if="imageChannel === 'direct'" v-model="imagePlatformId" placeholder="选择 GPT Image 2 平台">
                                    <a-option v-for="item in imagePlatforms" :key="item.id" :value="item.id || 0">{{ item.title }}</a-option>
                                </a-select>
                                <a-select v-else v-model="imageTemplateId" placeholder="选择云端生图模板">
                                    <a-option v-for="item in imageTemplates" :key="item.id" :value="item.id || 0">{{ item.title }}</a-option>
                                </a-select>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-500 mb-2">视频通道</div>
                                <a-radio-group v-model="videoChannel" type="button" class="mb-2 w-full">
                                    <a-radio v-for="item in channelOptions" :key="item.value" :value="item.value">{{ item.label }}</a-radio>
                                </a-radio-group>
                                <a-select v-if="videoChannel === 'direct'" v-model="videoPlatformId" placeholder="选择 Seedance 平台">
                                    <a-option v-for="item in videoPlatforms" :key="item.id" :value="item.id || 0">{{ item.title }}</a-option>
                                </a-select>
                                <a-select v-else v-model="videoTemplateId" placeholder="选择云端生视频模板">
                                    <a-option v-for="item in videoTemplates" :key="item.id" :value="item.id || 0">{{ item.title }}</a-option>
                                </a-select>
                            </div>
                            <div v-if="videoChannel === 'direct'">
                                <div class="text-xs font-semibold text-gray-500 mb-2">视频模型</div>
                                <a-select v-model="form.videoModel" class="w-full">
                                    <a-option v-for="item in videoModelOptions" :key="item" :value="item">{{ item }}</a-option>
                                </a-select>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <div class="text-xs font-semibold text-gray-500 mb-2">说话方式</div>
                                    <a-select v-model="form.narrationMode" class="w-full">
                                        <a-option v-for="item in narrationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                                    </a-select>
                                </div>
                                <div>
                                    <div class="text-xs font-semibold text-gray-500 mb-2">字幕显示</div>
                                    <a-select v-model="form.subtitleMode" class="w-full">
                                        <a-option v-for="item in subtitleModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                                    </a-select>
                                </div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-500 mb-2">生成条数</div>
                                <a-radio-group v-model="form.count" type="button">
                                    <a-radio v-for="item in countOptions" :key="item" :value="item">{{ item }}</a-radio>
                                </a-radio-group>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-500 mb-2">分镜数量</div>
                                <a-radio-group v-model="form.sceneCount" type="button">
                                    <a-radio v-for="item in sceneCountOptions" :key="item" :value="item">{{ item }}</a-radio>
                                </a-radio-group>
                            </div>
                            <div class="rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                                脚本生成会要求大模型输出固定 JSON：标题、钩子、口播、CTA、指定数量分镜、图片提示词、视频提示词。若模型不可用，可先用规则生成兜底。
                            </div>
                            <a-button class="w-full" @click="generateRuleDrafts">规则生成兜底</a-button>
                        </div>
                    </div>
                </div>

                <div v-if="!drafts.length" class="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
                    <div class="text-lg font-semibold text-gray-900">还没有生成方案</div>
                    <div class="text-sm text-gray-500 mt-1">填写主题信息或上传参考视频后点击“生成脚本”，这里会出现可编辑的视频方案。</div>
                </div>

                <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                    <div class="space-y-3">
                        <div class="rounded-xl bg-white p-3 shadow-sm">
                            <div class="text-sm font-semibold text-gray-900 px-1 mb-2">方案列表</div>
                            <div class="space-y-2">
                                <button
                                    v-for="draft in drafts"
                                    :key="draft.id"
                                    type="button"
                                    class="w-full rounded-lg border px-3 py-3 text-left transition-colors"
                                    :class="selectedDraftId === draft.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-700 hover:bg-gray-50'"
                                    @click="selectedDraftId = draft.id"
                                >
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="text-sm font-semibold">{{ angleLabel(draft.angle) }}</div>
                                        <a-tag size="small">{{ draft.scenes.length }} 镜头</a-tag>
                                    </div>
                                    <div class="text-xs opacity-70 mt-1 line-clamp-2">{{ draft.title }}</div>
                                </button>
                            </div>
                        </div>
                        <div class="rounded-xl bg-white p-3 shadow-sm space-y-2">
                            <a-button class="w-full" :loading="submitting" @click="submitAll('image')">批量生图</a-button>
                            <a-button class="w-full" :loading="submitting" @click="submitAll('video')">批量生视频</a-button>
                            <a-button class="w-full" type="primary" :loading="submitting" @click="submitAll('both')">批量图生视频</a-button>
                            <div class="px-1 text-xs leading-5 text-gray-500">
                                图生视频会先生图，等待图片产出后再把图片作为参考提交视频任务。
                            </div>
                        </div>
                    </div>

                    <div v-if="selectedDraft" class="min-w-0 rounded-xl bg-white p-5 shadow-sm">
                        <div class="flex flex-wrap items-start gap-4 border-b border-gray-100 pb-4">
                            <div class="flex-grow min-w-0">
                                <a-input v-model="selectedDraft.title" class="!text-lg" />
                                <div class="text-xs text-gray-500 mt-2">{{ angleLabel(selectedDraft.angle) }} · {{ form.ratio }} · 约 {{ selectedDraft.scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0) }} 秒 · 所有字段可编辑</div>
                            </div>
                            <a-button :loading="submitting" @click="submitDraft(selectedDraft, 'image')">生图</a-button>
                            <a-button :loading="submitting" @click="submitDraft(selectedDraft, 'video')">生视频</a-button>
                            <a-button @click="exportDraftPrompts(selectedDraft)">导出提示词</a-button>
                            <a-button type="primary" :loading="submitting" @click="submitDraft(selectedDraft, 'both')">图生视频</a-button>
                        </div>

                        <div class="grid grid-cols-1 gap-4 mt-5 xl:grid-cols-2">
                            <a-form-item label="开头钩子">
                                <a-textarea v-model="selectedDraft.hook" :auto-size="{ minRows: 3, maxRows: 5 }" />
                            </a-form-item>
                            <a-form-item label="行动引导">
                                <a-textarea v-model="selectedDraft.cta" :auto-size="{ minRows: 3, maxRows: 5 }" />
                            </a-form-item>
                        </div>
                        <a-form-item label="口播文案">
                            <a-textarea v-model="selectedDraft.voiceover" :auto-size="{ minRows: 5, maxRows: 9 }" />
                        </a-form-item>
                        <div v-if="hasReferenceInput && selectedDraft.referenceAnalysis" class="mb-4 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
                            <div class="mb-2 text-sm font-semibold text-gray-900">参考视频拆解</div>
                            <div class="grid grid-cols-1 gap-2 text-xs leading-5 text-gray-600 xl:grid-cols-2">
                                <div v-if="selectedDraft.referenceAnalysis.plot">
                                    <span class="font-medium text-gray-800">剧情：</span>{{ selectedDraft.referenceAnalysis.plot }}
                                </div>
                                <div v-if="selectedDraft.referenceAnalysis.structure">
                                    <span class="font-medium text-gray-800">结构：</span>{{ selectedDraft.referenceAnalysis.structure }}
                                </div>
                                <div v-if="selectedDraft.referenceAnalysis.shotLanguage">
                                    <span class="font-medium text-gray-800">镜头：</span>{{ selectedDraft.referenceAnalysis.shotLanguage }}
                                </div>
                                <div v-if="selectedDraft.referenceAnalysis.visualStyle">
                                    <span class="font-medium text-gray-800">风格：</span>{{ selectedDraft.referenceAnalysis.visualStyle }}
                                </div>
                                <div v-if="selectedDraft.referenceAnalysis.rhythm">
                                    <span class="font-medium text-gray-800">节奏：</span>{{ selectedDraft.referenceAnalysis.rhythm }}
                                </div>
                                <div v-if="selectedDraft.referenceAnalysis.characterAction">
                                    <span class="font-medium text-gray-800">动作：</span>{{ selectedDraft.referenceAnalysis.characterAction }}
                                </div>
                                <div v-if="selectedDraft.referenceAnalysis.captionAudio">
                                    <span class="font-medium text-gray-800">字幕/声音：</span>{{ selectedDraft.referenceAnalysis.captionAudio }}
                                </div>
                                <div v-if="selectedDraft.referenceAnalysis.reusableRules" class="xl:col-span-2">
                                    <span class="font-medium text-gray-800">可复用规则：</span>{{ selectedDraft.referenceAnalysis.reusableRules }}
                                </div>
                            </div>
                        </div>
                        <div class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                            <span class="text-xs font-medium text-gray-500">台词方式</span>
                            <a-select v-model="form.narrationMode" class="!w-32">
                                <a-option v-for="item in narrationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                            </a-select>
                            <span class="text-xs font-medium text-gray-500">字幕</span>
                            <a-select v-model="form.subtitleMode" class="!w-32">
                                <a-option v-for="item in subtitleModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                            </a-select>
                            <a-button size="mini" @click="applyNarrationModeToDraft(selectedDraft, form.narrationMode)">应用到全部分镜</a-button>
                            <a-button size="mini" @click="applySubtitleModeToDraft(selectedDraft, form.subtitleMode)">应用字幕到全部</a-button>
                            <a-button size="mini" @click="refreshDraftVoiceoverLines(selectedDraft)">按钩子/口播/行动引导重分配台词</a-button>
                            <span class="text-xs text-gray-500">提交视频时会按当前分镜的说话方式和字幕设置生成。</span>
                        </div>

                        <div class="mt-5">
                            <div class="flex items-center justify-between gap-3 mb-3">
                                <div class="text-base font-semibold text-gray-900">分镜编辑</div>
                                <div class="text-xs text-gray-500">提交任务时会使用你当前修改后的提示词、台词方式和字幕设置。</div>
                            </div>
                            <div class="space-y-3">
                                <div v-for="(scene, index) in selectedDraft.scenes" :key="scene.id" class="rounded-xl border border-gray-100 p-4">
                                    <div class="flex flex-wrap items-center gap-3 mb-3">
                                        <a-tag color="arcoblue">镜头 {{ index + 1 }}</a-tag>
                                        <a-input v-model="scene.title" class="max-w-[180px]" />
                                        <a-select v-model="scene.duration" class="!w-24">
                                            <a-option v-for="item in durationOptions" :key="item" :value="item">{{ item }}s</a-option>
                                        </a-select>
                                        <a-tag v-if="scene.imageTaskId" color="green">图 #{{ scene.imageTaskId }}</a-tag>
                                        <a-tag v-if="scene.videoTaskId" color="purple">视频 #{{ scene.videoTaskId }}</a-tag>
                                        <div class="flex-grow"></div>
                                        <a-button size="small" :loading="submitting" @click="submitScene(selectedDraft, scene, 'image')">生图</a-button>
                                        <a-button size="small" type="primary" :loading="submitting" @click="submitScene(selectedDraft, scene, 'video')">生视频</a-button>
                                        <a-button size="small" @click="exportScenePrompts(selectedDraft, scene, index)">导出</a-button>
                                    </div>
                                    <div class="mb-3 flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                                        <span class="text-xs font-medium text-gray-500">分镜参考图</span>
                                        <a-button size="mini" @click="pickSceneReferenceImage(scene)">上传图片</a-button>
                                        <a-button v-if="scene.referenceImageUrl" size="mini" @click="clearSceneReferenceImage(scene)">移除</a-button>
                                        <span class="min-w-0 flex-1 truncate text-xs text-gray-500">
                                            {{ scene.referenceImageName || scene.referenceImageUrl || "可选；图生视频会优先使用这张图，不再先生图。" }}
                                        </span>
                                    </div>
                                    <div class="mb-3 flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
                                        <span class="text-xs font-medium text-gray-500">关联资产</span>
                                        <a-select
                                            v-model="scene.assetIds"
                                            class="min-w-[260px] flex-1"
                                            multiple
                                            allow-clear
                                            placeholder="默认使用全部可用资产；也可指定本镜只用哪些资产"
                                        >
                                            <a-option v-for="item in assetSelectOptions" :key="item.value" :value="item.value">
                                                {{ item.label }}
                                            </a-option>
                                        </a-select>
                                        <span class="text-xs text-gray-500">
                                            {{ readyMarketingAssets.length ? `可用资产 ${readyMarketingAssets.length} 个` : "暂无可用资产" }}
                                        </span>
                                    </div>
                                    <div class="grid grid-cols-1 gap-3 xl:grid-cols-[190px_190px_minmax(0,1fr)]">
                                        <a-form-item label="说话方式">
                                            <a-select v-model="scene.narrationMode" class="!w-32">
                                                <a-option v-for="item in narrationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                                            </a-select>
                                        </a-form-item>
                                        <a-form-item label="字幕显示">
                                            <a-select v-model="scene.subtitleMode" class="!w-32">
                                                <a-option v-for="item in subtitleModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                                            </a-select>
                                        </a-form-item>
                                        <a-form-item label="本镜台词/字幕">
                                            <a-textarea v-model="scene.voiceoverLine" :disabled="scene.narrationMode === 'none'" :auto-size="{ minRows: 2, maxRows: 4 }" />
                                        </a-form-item>
                                    </div>
                                    <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                        <a-form-item label="图片提示词">
                                            <a-textarea v-model="scene.imagePrompt" :auto-size="{ minRows: 5, maxRows: 10 }" />
                                        </a-form-item>
                                        <a-form-item label="视频提示词">
                                            <a-textarea v-model="scene.videoPrompt" :auto-size="{ minRows: 5, maxRows: 10 }" />
                                        </a-form-item>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
