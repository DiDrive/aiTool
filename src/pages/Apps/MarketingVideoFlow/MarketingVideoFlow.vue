<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
type NarrationMode = "voiceover" | "character";
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
    imagePrompt: string;
    videoPrompt: string;
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
    duration: 12,
    narrationMode: "voiceover" as NarrationMode,
    videoModel: "seedance-2.0-fast",
    visualStyle: "真实感短视频，干净都市夜景，人物自然自信，商业广告质感，竖屏构图",
});
const drafts = ref<MarketingDraft[]>([]);
const pageDraft = usePageDraft("MarketingVideoFlow", {
    form,
    drafts,
    selectedDraftId,
    referenceVideo,
    referenceImages,
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
const durationOptions = [8, 10, 12, 15];
const videoModelOptions = ["seedance-2.0-fast", "seedance-2.0"];
const narrationModeOptions: Array<{ label: string; value: NarrationMode }> = [
    { label: "画外音", value: "voiceover" },
    { label: "角色说", value: "character" },
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
    return `已采集 ${hotTrendCandidates.value.length} 条，模型筛选 ${hotTrendCards.value.length} 条，当前选中 ${selectedHotTrendCards.value.length} 条会进入脚本`;
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
    return `参考视频已按时长均匀抽取 ${referenceVideo.value.frameDataUrls.length} 帧，取样点避开片头片尾，用于判断主题、节奏、构图和情绪变化；不要把这些帧当作连续动作或完整剧情。`;
});

const referenceSummary = computed(() => {
    if (referenceVideo.value) {
        if (referenceVideoMode.value === "frames") {
            return `已上传参考视频：${referenceVideo.value.name}，已按“${frameDensityOptions.find(item => item.value === referenceFrameDensity.value)?.label}”密度抽取 ${referenceVideo.value.frameDataUrls.length} 帧给视觉模型分析。`;
        }
        return `已上传参考视频：${referenceVideo.value.name}。会以原视频形式交给支持视频输入的大模型分析。`;
    }
    if (!form.value.referenceUrl.trim()) {
        return "未使用参考链接，将完全根据品牌信息和台词生成原创方案。";
    }
    return "参考链接只用于提取主题、标签、节奏和营销角度，不复刻原视频人物、画面或音乐。";
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
        if (overwrite || !scene.voiceoverLine) {
            scene.voiceoverLine = buildSceneVoiceoverLine(draft, index);
        }
        if (!scene.narrationMode) {
            scene.narrationMode = form.value.narrationMode;
        }
        scene.subtitle = effectiveSceneCaption(scene);
    });
};

const applyNarrationModeToDraft = (draft: MarketingDraft, mode: NarrationMode) => {
    draft.scenes.forEach(scene => {
        scene.narrationMode = mode;
    });
};

const refreshDraftVoiceoverLines = (draft: MarketingDraft) => {
    ensureDraftVoiceoverLines(draft, true);
};

const narrationModeLabel = (mode?: NarrationMode) => {
    return narrationModeOptions.find(item => item.value === mode)?.label || "画外音";
};

const effectiveSceneCaption = (scene: SceneDraft) => {
    return cleanSentence(scene.captionOverride || scene.voiceoverLine || scene.subtitle || "");
};

const buildVideoPromptWithSpeech = (scene: SceneDraft) => {
    const line = cleanSentence(scene.voiceoverLine || "");
    const caption = effectiveSceneCaption(scene);
    const speechInstruction = line
        ? scene.narrationMode === "character"
            ? `音频/台词要求：让画面中的主要角色自然开口说出这句中文台词：“${line}”。需要口型、情绪和语速匹配台词，不要省略，不要改写，不要只显示字幕。`
            : `音频/台词要求：使用自然普通话画外音完整朗读这句台词：“${line}”。画面角色可以不张口，但必须有清晰旁白，不要省略，不要改写，不要只显示字幕。`
        : "音频/台词要求：如无明确台词，可使用轻微环境声，不要生成无关对白。";
    return [
        scene.videoPrompt,
        "",
        speechInstruction,
        `字幕要求：画面字幕必须与本镜台词一致；当前字幕：${caption || line || "无"}`,
    ].join("\n");
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
    const title = String(raw.title || "").trim();
    if (!title) {
        return null;
    }
    const risk = raw.risk === "high" || raw.risk === "medium" ? raw.risk : "low";
    const fitScore = Math.max(0, Math.min(100, Number(raw.fitScore || raw.score || 0)));
    return {
        id: String(raw.id || makeHotTrendCardId(title, index)),
        source: String(raw.source || ""),
        title,
        summary: String(raw.summary || ""),
        category: String(raw.category || "热点话题"),
        heat: String(raw.heat || ""),
        fitScore,
        risk,
        usableAngle: String(raw.usableAngle || ""),
        integration: String(raw.integration || ""),
        forcedAngle: String(raw.forcedAngle || raw.hardSellAngle || ""),
        hookExample: String(raw.hookExample || raw.openingExample || ""),
        playIdea: String(raw.playIdea || raw.idea || ""),
        avoid: String(raw.avoid || ""),
        selected: Boolean(raw.selected ?? (risk !== "high" && fitScore >= 70)),
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
    const usedTitles = new Set(cards.map(card => `${card.source}:${card.title}`.toLowerCase()));
    for (const candidate of candidates) {
        const key = `${candidate.source}:${candidate.title}`.toLowerCase();
        if (byId.has(candidate.id) || usedTitles.has(key)) {
            continue;
        }
        const card = candidateToBackupHotTrendCard(candidate, byId.size);
        byId.set(card.id, card);
        usedTitles.add(key);
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
请根据品牌信息，筛选最近热梗/热点是否适合融入营销短视频脚本。
${modeRule}

品牌/产品/账号：${safeJsonString(form.value.brandName)}
品牌说明：${safeJsonString(form.value.brandBrief)}
目标人群：${safeJsonString(form.value.targetAudience)}
核心卖点：${safeJsonString(form.value.productSellingPoints)}
大致思路：${safeJsonString(form.value.idea)}
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
      "usableAngle": "为什么适合/不适合这个品牌",
      "integration": "自然融合玩法：怎么把这个梗改成品牌脚本里的表达",
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
6. 非常火但不一定贴合品牌的热梗也要返回一部分，作为备选灵感，fitScore 可以较低，selected=false，但必须给“硬蹭脑洞”。
7. 实在不相干、没有可迁移句式、不能形成短视频玩法的内容不要返回。
8. selected 只给低风险且 fitScore >= 70 的热点；中等风险或明显硬蹭的内容 selected=false，让用户自己选。
9. 每条的 hookExample、playIdea、forcedAngle 必须针对该热点标题单独写，禁止使用同一句模板套所有候选。
`.trim();
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
    if (ret.code) {
        throw new Error(ret.msg || "热点分析失败");
    }
    const trends = Array.isArray(ret.data?.json?.trends) ? ret.data.json.trends : [];
    const cards = trends
        .map((item: any, index: number) => normalizeHotTrendCard(item, index))
        .filter(Boolean) as HotTrendCard[];
    if (!cards.length) {
        throw new Error("模型没有返回可用热点建议");
    }
    hotTrendCards.value = mergeAnalyzedHotTrendCards(cards, items);
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
};

const collectHotTrends = async () => {
    if (!modelGenerator.value) {
        Dialog.tipError("请先选择脚本大模型，用于判断热点是否匹配");
        return;
    }
    if (!form.value.brandName.trim() && !form.value.idea.trim()) {
        Dialog.tipError("请先填写品牌或大致思路，才能判断热点是否适配");
        return;
    }
    try {
        collectingHotTrends.value = true;
        hotTrendLoadingText.value = "正在采集热梗...";
        hotTrendErrors.value = [];
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
            await withTimeout(analyzeHotTrends(hotTrendCandidates.value.slice(0, 15)), 30000, "AI 精修超时，已先展示原始候选");
            hotTrendCards.value = hotTrendCards.value.slice(0, 15);
            Dialog.tipSuccess("热梗已采集并完成 AI 精修");
        } catch (e: any) {
            hotTrendCards.value = fallbackCards;
            Dialog.tipError(e?.message || "AI 精修失败，已先展示原始候选");
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
        medium: "中融合：可把热点作为开头钩子或场景背景，但品牌价值仍是主线。",
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
        "热点使用规则：自然借势，不硬蹭；不要复刻原梗原句；不要提及平台热榜来源；不要使用高风险社会事件；如果热点与产品价值冲突，以品牌价值为准。",
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
            `台词/字幕：${effectiveSceneCaption(scene)}`,
            `说话方式：${narrationModeLabel(scene.narrationMode)}`,
            `参考图：${scene.referenceImageName || scene.referenceImageUrl || "-"}`,
            "",
            "图片提示词：",
            scene.imagePrompt,
            "",
            "视频提示词：",
            buildVideoPromptWithSpeech(scene),
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
        `台词/字幕：${effectiveSceneCaption(scene)}`,
        `说话方式：${narrationModeLabel(scene.narrationMode)}`,
        `参考图：${scene.referenceImageName || scene.referenceImageUrl || "-"}`,
        "",
        "图片提示词：",
        scene.imagePrompt,
        "",
        "视频提示词：",
        buildVideoPromptWithSpeech(scene),
        "",
    ];
    DownloadUtil.downloadFile(lines.join("\n"), `${draft.title || "marketing"}_镜头${index + 1}_prompts.md`);
};

const isDataOrRemoteUrl = (value: string) => {
    return /^(data:|https?:\/\/)/i.test(value);
};

const resolveDirectApiImageUrl = async (value: string) => {
    if (!value || isDataOrRemoteUrl(value)) {
        return value;
    }
    return await pathToDataUrl(value);
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
        if (!form.value.idea.trim()) {
            form.value.idea = [result.title, result.desc].filter(Boolean).join("\n");
        }
        if (!form.value.brandBrief.trim() && result.author) {
            form.value.brandBrief = `参考账号：${result.author}`;
        }
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
        "你是资深短视频营销策划和AI视频导演。",
        "你必须输出严格 JSON，不要输出 Markdown、解释、注释或代码块。",
        "任务是为品牌生成原创营销短视频脚本，不复刻参考视频中的人物、画面、音乐、动作或台词。",
        "每条视频必须适合竖屏短视频，前2秒有钩子，语言口语化，避免夸大承诺、低俗擦边和侵犯第三方权益。",
        "所有图片提示词和视频提示词必须能直接用于AI生图/生视频。",
        "同一条视频内必须保持主角、服装基调、品牌视觉风格、色彩、光影和镜头语言一致；如果多个分镜属于同一地点，还必须保持场景空间、道具、背景元素和光线方向一致。",
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
请根据以下输入，生成 ${form.value.count} 条品牌营销短视频方案。

品牌/产品/账号：${safeJsonString(form.value.brandName)}
品牌说明：${safeJsonString(form.value.brandBrief)}
目标人群：${safeJsonString(form.value.targetAudience)}
核心卖点：${safeJsonString(form.value.productSellingPoints)}
大致思路：${safeJsonString(form.value.idea)}
优先开头台词：${safeJsonString(form.value.baseLine)}
参考链接：${safeJsonString(form.value.referenceUrl)}
参考视频：${referenceVideo.value ? safeJsonString(referenceVideo.value.name) : "未上传"}
参考视频抽帧说明：${referenceFrameRule.value || "未提供参考帧"}
参考图片：${referenceImages.value.length ? `已上传 ${referenceImages.value.length} 张` : "未上传"}
${douyinInfo}
参考链接使用规则：只参考主题、情绪、节奏和标签方向，不复刻人物、画面、音乐、动作或原台词。
${buildHotTrendPromptSection()}
画面风格：${safeJsonString(form.value.visualStyle)}
画幅：${form.value.ratio}
单条总时长：${form.value.duration} 秒
每条分镜数：${form.value.sceneCount}

营销角度必须按顺序使用：
${angleGuide}

请只输出如下 JSON：
{
  "drafts": [
    {
      "angle": "pain|desire|contrast|scene|conversion",
      "title": "短标题",
      "hook": "前2秒钩子，18字以内，口语化",
      "voiceover": "完整口播文案，适合${form.value.duration}秒，不要包含CTA",
      "cta": "行动引导，简短自然",
      "scenes": [
        {
          "title": "镜头名称",
          "duration": 4,
          "subtitle": "兼容字段，必须与 voiceoverLine 完全一致",
          "voiceoverLine": "本分镜实际要说出来的中文台词，也会作为画面字幕；第一镜必须包含开头钩子，最后一镜必须包含行动引导",
          "narrationMode": "voiceover|character",
          "imagePrompt": "中文生图提示词，包含主体、统一主角设定、场景连续性、环境、构图、光线、品牌氛围、竖屏安全区；必须原创",
          "videoPrompt": "中文生视频提示词，包含镜头运动、人物动作、场景连续性、情绪、节奏；字幕必须跟随 voiceoverLine，不复刻参考视频"
        }
      ]
    }
  ]
}

硬性要求：
1. drafts 数量必须等于 ${form.value.count}。
2. 每个 draft 必须有 ${form.value.sceneCount} 个 scenes。
3. scene.duration 总和尽量接近 ${form.value.duration} 秒。
4. 不要使用“保证、最好、第一、治愈、百分百”等绝对化或夸大表述。
5. 不要出现第三方真实 UI、真实人物姓名、原视频人物外貌复刻。
6. 每条视频的所有 imagePrompt 必须复用同一个主角设定和视觉风格；同一场景的分镜必须明确写出一致的场景空间、道具、光线方向和色调；不同场景也必须保持统一品牌质感。
7. hook、voiceover、cta 不是备注，必须被分配到 scenes[].voiceoverLine 中：第一镜说 hook，中间镜说口播主体，最后一镜说 cta；scenes[].subtitle 必须与 voiceoverLine 完全一致。
8. scenes[].narrationMode 默认使用 ${form.value.narrationMode}，除非该镜头明显更适合角色开口或画外音。
9. 如果提供了已选热点灵感，必须把它转化为自然的短视频切入角度，优先融入 hook、场景冲突或口播语气；不要把热点当作孤立标签堆在文案里。
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
    const draft: MarketingDraft = {
        id: `${angle}-${Date.now()}-${index}`,
        angle,
        title: String(raw.title || `${form.value.brandName}_${angleLabel(angle)}_营销短视频`),
        hook: String(raw.hook || ""),
        voiceover: String(raw.voiceover || ""),
        cta: String(raw.cta || ""),
        scenes: scenes.map((scene: any, sceneIndex: number) => ({
            id: `${angle}-${index}-${sceneIndex}`,
            title: String(scene?.title || `镜头 ${sceneIndex + 1}`),
            duration: Math.max(1, Math.min(15, Number(scene?.duration || Math.round(form.value.duration / 3)))),
            subtitle: String(scene?.subtitle || ""),
            captionOverride: String(scene?.captionOverride || ""),
            voiceoverLine: String(scene?.voiceoverLine || ""),
            narrationMode: scene?.narrationMode === "character" ? "character" : "voiceover",
            imagePrompt: String(scene?.imagePrompt || ""),
            videoPrompt: String(scene?.videoPrompt || ""),
            referenceImageUrl: String(scene?.referenceImageUrl || ""),
        })),
    };
    ensureDraftVoiceoverLines(draft);
    return draft;
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
    selectedDraftId.value = normalized[0]?.id || "";
};

const buildHook = (angle: AngleType) => {
    const brand = textOr(form.value.brandName, "你的品牌");
    const audience = textOr(form.value.targetAudience, "目标用户");
    const point = textOr(form.value.productSellingPoints, "更轻松地完成关键行动");
    const seedLine = form.value.baseLine.trim();
    const hookMap: Record<AngleType, string> = {
        pain: `${audience}最怕的不是没机会，而是状态一直掉线。`,
        desire: `状态好的人，连开口都更有吸引力。`,
        contrast: `同样是一天，有人越过越累，有人越聊越有状态。`,
        scene: `下班后的十分钟，可能就是你重新找回状态的开始。`,
        conversion: `想把状态拉回来，先从一个简单动作开始。`,
    };
    return cleanSentence(seedLine || `${hookMap[angle]} ${brand}帮你${point}。`);
};

const buildVoiceover = (angle: AngleType) => {
    const brand = textOr(form.value.brandName, "这个工具");
    const brief = textOr(form.value.brandBrief, "围绕用户真实需求，提供更轻松的体验");
    const point = textOr(form.value.productSellingPoints, "找到节奏、打开话题、提升行动效率");
    const idea = textOr(form.value.idea, "用短平快的方式展示产品价值");
    const map: Record<AngleType, string> = {
        pain: `很多时候不是你不会表达，而是没有进入状态。${brand}把复杂的社交压力拆轻，让你从一个自然的话题开始。${point}，把主动权慢慢拿回来。`,
        desire: `真正好的状态，是不需要用力证明自己。${brand}${brief}，帮你把每一次打开、每一次交流，都变成更轻松的开始。${point}。`,
        contrast: `以前总觉得改变状态很难，现在只需要先迈出一步。${brand}让你用更自然的方式进入节奏，从犹豫到开口，从等待到行动。${idea}。`,
        scene: `忙了一天也别急着把自己关掉。打开${brand}，从一个轻松场景进入，找回一点聊天欲、一点好奇心，也找回更好的自己。`,
        conversion: `${brand}适合想提升状态、打开社交节奏的人。现在就从一个简单动作开始，看看今天会不会多一个新的可能。${point}。`,
    };
    return cleanSentence(map[angle]);
};

const buildCta = (angle: AngleType) => {
    const brand = textOr(form.value.brandName, "它");
    if (angle === "conversion") {
        return `现在体验${brand}，从今天开始把状态拉回来。`;
    }
    return `想要更好的状态，就从${brand}开始。`;
};

const sceneTemplates: Record<AngleType, Array<{ title: string; subtitle: string; visual: string }>> = {
    pain: [
        { title: "钩子", subtitle: "状态掉线，比没机会更可惜", visual: "都市男性独自走在夜晚街头，手机屏幕微光，表情疲惫但克制" },
        { title: "转折", subtitle: "先让自己轻松开口", visual: "人物坐在干净咖啡店，看着手机露出放松笑容，氛围自然" },
        { title: "品牌露出", subtitle: "把主动权慢慢拿回来", visual: "手机界面以抽象光效展示社交互动，不出现真实平台 UI" },
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
        { title: "卖点", subtitle: "轻松打开社交节奏", visual: "手机产品氛围镜头，抽象卡片动效，不使用真实品牌 UI" },
        { title: "转化", subtitle: "现在就开始体验", visual: "品牌名文字留白区，人物自信离开镜头，竖屏广告结尾" },
    ],
};

const buildScene = (angle: AngleType, index: number, draftIndex: number): SceneDraft => {
    const templates = sceneTemplates[angle];
    const template = templates[index % templates.length];
    const brand = textOr(form.value.brandName, "品牌");
    const style = textOr(form.value.visualStyle, "真实感短视频，竖屏构图");
    const sceneCount = Number(form.value.sceneCount || 3);
    const duration = Math.max(1, Math.round(form.value.duration / sceneCount));
    const imagePrompt = [
        style,
        template.visual,
        `品牌主题：${brand}`,
        `目标人群：${textOr(form.value.targetAudience, "目标用户")}`,
        "同一条视频保持同一位主角、相近服装基调、统一色彩和光影风格；如果与前后分镜同场景，保持空间布局、背景元素、道具和光线方向一致",
        "原创广告画面，不复刻任何参考视频，不出现真实第三方平台界面，画面干净，字幕安全区充足",
    ].join("，");
    const videoPrompt = [
        `${style}，${template.visual}`,
        `镜头节奏适合 ${form.value.duration} 秒竖屏营销短视频第 ${index + 1} 段`,
        "延续同一条视频的主角、场景关系、色调、光影和品牌质感",
        "轻微运镜，自然表情，商业广告质感，不使用参考视频人物或动作",
        "画面字幕跟随本镜台词",
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
        referenceImageUrl: "",
    };
};

const generateRuleDrafts = () => {
    if (!form.value.brandName.trim()) {
        Dialog.tipError("请先输入品牌/产品/账号名称");
        return;
    }
    const selectedAngles = angles.slice(0, Number(form.value.count || 3));
    drafts.value = selectedAngles.map((item, draftIndex) => ({
        id: `${item.value}-${Date.now()}-${draftIndex}`,
        angle: item.value,
        title: `${form.value.brandName.trim()}_${item.label}_营销短视频`,
        hook: buildHook(item.value),
        voiceover: buildVoiceover(item.value),
        cta: buildCta(item.value),
        scenes: Array.from({ length: Number(form.value.sceneCount || 3) }, (_, sceneIndex) =>
            buildScene(item.value, sceneIndex, draftIndex)
        ),
    }));
    drafts.value.forEach(draft => ensureDraftVoiceoverLines(draft));
    selectedDraftId.value = drafts.value[0]?.id || "";
};

const generateDrafts = async () => {
    if (!form.value.brandName.trim()) {
        Dialog.tipError("请先输入品牌/产品/账号名称");
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
    const body = {
        model: "gpt-image-2",
        prompt: scene.imagePrompt,
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
        templateTitle: "营销短视频分镜图",
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
        title: `${draft.title}_${scene.title}_分镜图`,
        serverName: "",
        serverTitle: "",
        serverVersion: "",
        modelConfig,
        param: { input: { source: "MarketingVideoFlow", draft, scene, prompt: scene.imagePrompt } },
    };
    return await TaskService.submit(record);
};

const submitCloudImageTask = async (draft: MarketingDraft, scene: SceneDraft) => {
    const template = currentImageTemplate.value;
    if (!template?.id) {
        throw new Error("请先选择云端生图模板");
    }
    const record = await CloudTemplateTaskService.buildTaskRecord(template.id, {
        title: `${draft.title}_${scene.title}_分镜图`,
        prompt: scene.imagePrompt,
        text: scene.imagePrompt,
        selectedCapability: "image",
        draft,
        scene,
    });
    return await TaskService.submit(record);
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
    const referenceImageUrl = await resolveDirectApiImageUrl(scene.referenceImageUrl || "");
    const videoPrompt = buildVideoPromptWithSpeech(scene);
    const body: Record<string, any> = {
        model: form.value.videoModel,
        content: [
            { type: "text", text: videoPrompt },
            ...(referenceImageUrl
                ? [
                      {
                          type: "image_url",
                          image_url: { url: referenceImageUrl },
                          role: "reference_image",
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
        templateTitle: "营销短视频片段",
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
    const videoPrompt = buildVideoPromptWithSpeech(scene);
    const record = await CloudTemplateTaskService.buildTaskRecord(template.id, {
        title: `${draft.title}_${scene.title}_视频`,
        prompt: videoPrompt,
        text: videoPrompt,
        image: scene.referenceImageUrl || "",
        imageUrl: scene.referenceImageUrl || "",
        selectedCapability: "video",
        draft,
        scene,
    });
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
        Dialog.tipError("请先生成营销脚本");
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
                    <div class="text-[22px] font-semibold text-gray-900 leading-tight">营销短视频批量生成</div>
                    <div class="text-sm text-gray-500 mt-1">品牌信息生成脚本，脚本可编辑，再提交图片/视频任务。</div>
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
                                <div class="text-base font-semibold text-gray-900">品牌与创意输入</div>
                                <div class="text-xs text-gray-500 mt-1">这些字段会发送给你选择的大模型，生成后仍可逐条改写。</div>
                            </div>
                            <a-tag color="arcoblue">大模型结构化生成</a-tag>
                        </div>
                        <a-form layout="vertical">
                            <div class="grid grid-cols-1 gap-x-4 xl:grid-cols-2">
                                <a-form-item label="品牌/产品/账号">
                                    <a-input v-model="form.brandName" placeholder="例如：他趣 / XX 健身房 / 情感教练 IP" />
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
                                        会尝试解析公开视频并下载到本地缓存，再复用下方参考视频抽帧；失败时可填写 Cookie、接第三方解析 API，或直接上传本地视频。
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
                                        <div class="min-w-[180px] flex-1 truncate text-sm text-gray-600">
                                            {{ referenceVideo?.name || "可选，上传后自动抽帧给视觉模型分析" }}
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
                                        均匀取样，不连续截取；默认标准 10 帧适合大多数视觉模型，模型不支持多图时可切到少量或原视频输入。
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
                                <a-form-item label="品牌说明">
                                    <a-textarea v-model="form.brandBrief" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="面向谁，解决什么问题，整体调性是什么" />
                                </a-form-item>
                                <a-form-item label="核心卖点">
                                    <a-textarea v-model="form.productSellingPoints" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="例如：轻松聊天、认识新朋友、提升社交状态" />
                                </a-form-item>
                            </div>
                            <div class="grid grid-cols-2 gap-x-4">
                                <a-form-item label="目标人群">
                                    <a-textarea v-model="form.targetAudience" :auto-size="{ minRows: 3, maxRows: 5 }" />
                                </a-form-item>
                                <a-form-item label="大致思路/已有台词">
                                    <a-textarea v-model="form.idea" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="你想表达的方向、情绪、场景或产品利益点" />
                                </a-form-item>
                            </div>
                            <a-form-item label="优先使用的开头台词">
                                <a-input v-model="form.baseLine" placeholder="可选，填写后会优先作为开头钩子" />
                            </a-form-item>
                            <a-form-item label="画面风格">
                                <a-textarea v-model="form.visualStyle" :auto-size="{ minRows: 2, maxRows: 4 }" />
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
                            <div>
                                <div class="text-xs font-semibold text-gray-500 mb-2">单条时长</div>
                                <a-select v-model="form.duration" class="w-full">
                                    <a-option v-for="item in durationOptions" :key="item" :value="item">{{ item }}s</a-option>
                                </a-select>
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
                    <div class="text-sm text-gray-500 mt-1">填写品牌信息后点击“生成脚本”，这里会出现可编辑的营销方案。</div>
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
                                <div class="text-xs text-gray-500 mt-2">{{ angleLabel(selectedDraft.angle) }} · {{ form.ratio }} · 约 {{ form.duration }} 秒 · 所有字段可编辑</div>
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
                        <div class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                            <span class="text-xs font-medium text-gray-500">台词方式</span>
                            <a-select v-model="form.narrationMode" class="!w-32">
                                <a-option v-for="item in narrationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                            </a-select>
                            <a-button size="mini" @click="applyNarrationModeToDraft(selectedDraft, form.narrationMode)">应用到全部分镜</a-button>
                            <a-button size="mini" @click="refreshDraftVoiceoverLines(selectedDraft)">按钩子/口播/行动引导重分配台词</a-button>
                            <span class="text-xs text-gray-500">提交视频时会把这些台词写入视频提示词，要求{{ narrationModeLabel(form.narrationMode) }}说出来。</span>
                        </div>

                        <div class="mt-5">
                            <div class="flex items-center justify-between gap-3 mb-3">
                                <div class="text-base font-semibold text-gray-900">分镜编辑</div>
                                <div class="text-xs text-gray-500">提交任务时会使用你当前修改后的台词和提示词，字幕默认跟随台词。</div>
                            </div>
                            <div class="space-y-3">
                                <div v-for="(scene, index) in selectedDraft.scenes" :key="scene.id" class="rounded-xl border border-gray-100 p-4">
                                    <div class="flex flex-wrap items-center gap-3 mb-3">
                                        <a-tag color="arcoblue">镜头 {{ index + 1 }}</a-tag>
                                        <a-input v-model="scene.title" class="max-w-[180px]" />
                                        <a-input-number v-model="scene.duration" class="!w-24" :min="1" :max="15" />
                                        <div class="text-xs text-gray-500">秒</div>
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
                                    <div class="grid grid-cols-1 gap-3 xl:grid-cols-[190px_minmax(0,1fr)]">
                                        <a-form-item label="说话方式">
                                            <a-select v-model="scene.narrationMode" class="!w-32">
                                                <a-option v-for="item in narrationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                                            </a-select>
                                        </a-form-item>
                                        <a-form-item label="本镜台词/字幕">
                                            <a-textarea v-model="scene.voiceoverLine" :auto-size="{ minRows: 2, maxRows: 4 }" />
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
