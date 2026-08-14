import { CanvasNodeType, type CanvasNodeMetadata, type CanvasWorkflowNodeKind } from "../types";

export type CanvasWorkflowNodePreset = {
    kind: CanvasWorkflowNodeKind;
    type: CanvasNodeType.Text | CanvasNodeType.Image | CanvasNodeType.Video;
    title: string;
    description: string;
    metadata: CanvasNodeMetadata;
};

export const CANVAS_WORKFLOW_NODE_PRESETS: Record<CanvasWorkflowNodeKind, CanvasWorkflowNodePreset> = {
    idea: {
        kind: "idea",
        type: CanvasNodeType.Text,
        title: "创意主题",
        description: "输入题材、时长、风格和核心要求",
        metadata: { workflowKind: "idea", generationMode: "text", content: "", prompt: "请使用简体中文把上游内容整理为清晰的创作 Brief，包括题材、目标时长、人物、冲突、风格、画幅和声音要求。除必要的专有名词外，不要输出英文。", status: "idle" },
    },
    script: {
        kind: "script",
        type: CanvasNodeType.Text,
        title: "剧本",
        description: "根据创意生成完整剧本或制作稿",
        metadata: { workflowKind: "script", generationMode: "text", prompt: "根据上游创意或 Brief 生成可直接制作的结构化剧本。所有字段内容必须使用简体中文，除必要的专有名词外禁止使用英文。严格遵守题材、目标时长、画幅、风格、人物和声音参数；如果上游是视频分析，startMs/endMs 必须使用原视频绝对时间且连续覆盖分析范围。所有场次 durationSeconds 总和必须等于目标时长。同步提取 characters、locations、visualBible 一致性档案。只输出 JSON，不要 Markdown。格式：{\"scenes\":[{\"sceneNumber\":\"1\",\"startMs\":0,\"endMs\":8000,\"location\":\"场景\",\"sceneId\":\"scene_1\",\"timeOfDay\":\"日/夜\",\"characters\":[\"人物\"],\"characterIds\":[\"character_1\"],\"action\":\"动作与剧情\",\"dialogue\":\"对白或旁白\",\"durationSeconds\":8}],\"characters\":[{\"id\":\"character_1\",\"name\":\"人物\",\"appearance\":\"稳定外貌\",\"wardrobe\":\"服装\",\"voice\":\"声音特征\",\"firstSeenMs\":0}],\"locations\":[{\"id\":\"scene_1\",\"name\":\"场景\",\"environment\":\"环境\",\"layout\":\"空间结构\",\"lighting\":\"光线\",\"firstSeenMs\":0}],\"visualBible\":{\"medium\":\"媒介\",\"visualStyle\":\"视觉风格\",\"colorPalette\":\"色彩\",\"lightingStyle\":\"光线风格\",\"cameraLanguage\":\"镜头语言\",\"editingRhythm\":\"剪辑节奏\",\"aspectRatio\":\"画幅\"}}。", status: "idle" },
    },
    storyboard_script: {
        kind: "storyboard_script",
        type: CanvasNodeType.Text,
        title: "分镜脚本",
        description: "把剧本拆成可生成的镜头列表",
        metadata: { workflowKind: "storyboard_script", generationMode: "text", prompt: "把上游结构化剧本拆成可制作的分镜脚本。所有字段内容必须使用简体中文。镜头总时长必须等于剧本总时长；保持原始时间、剧情顺序、人物、场景、道具和台词。根对象必须同时返回 shots、characters、locations、visualBible；一致性档案必须沿用并细化上游内容，禁止丢失、留空或填写未指定。只输出 JSON，不要 Markdown。格式：{\"shots\":[{\"shotNumber\":\"1\",\"startMs\":0,\"endMs\":4000,\"durationSeconds\":4,\"shotSize\":\"中景\",\"scene\":\"场景\",\"sceneId\":\"scene_1\",\"characters\":[\"人物\"],\"characterIds\":[\"character_1\"],\"props\":[\"道具\"],\"visual\":\"画面描述\",\"action\":\"动作\",\"camera\":\"运镜\",\"lighting\":\"光线\",\"dialogue\":\"对白\",\"sound\":\"声音\",\"continuity\":\"连续性\",\"evidenceTimestampsMs\":[0,2000,3999],\"confidence\":0.9}],\"characters\":[{\"id\":\"character_1\",\"name\":\"人物\",\"appearance\":\"外貌\",\"wardrobe\":\"服装\",\"voice\":\"声音\",\"firstSeenMs\":0}],\"locations\":[{\"id\":\"scene_1\",\"name\":\"场景\",\"environment\":\"环境\",\"layout\":\"空间\",\"lighting\":\"光线\",\"firstSeenMs\":0}],\"visualBible\":{\"medium\":\"媒介\",\"visualStyle\":\"画风\",\"colorPalette\":\"色彩\",\"lightingStyle\":\"光线\",\"cameraLanguage\":\"镜头语言\",\"editingRhythm\":\"节奏\",\"aspectRatio\":\"画幅\"}}。", status: "idle" },
    },
    character: {
        kind: "character",
        type: CanvasNodeType.Image,
        title: "人物素材",
        description: "根据剧本生成人物设定参考",
        metadata: { workflowKind: "character", generationMode: "image", prompt: "根据上游剧本和人物描述生成生产级人物设定图。保持同一身份、脸型、体型、年龄、发型和服装；横向四栏依次为正面全身、侧面全身、背面全身、头肩近景；纯视觉、无文字、无水印。", status: "idle" },
    },
    scene: {
        kind: "scene",
        type: CanvasNodeType.Image,
        title: "场景素材",
        description: "根据分镜生成无人物场景参考",
        metadata: { workflowKind: "scene", generationMode: "image", prompt: "根据上游分镜描述生成生产级场景设定图。保持空间结构、时代、天气、光线和美术风格一致；画面中不要出现人物、文字或水印。", status: "idle" },
    },
    prop: {
        kind: "prop",
        type: CanvasNodeType.Image,
        title: "道具素材",
        description: "根据分镜生成关键道具参考",
        metadata: { workflowKind: "prop", generationMode: "image", prompt: "根据上游分镜描述生成生产级关键道具设定图。主体完整清晰，多角度展示，背景简洁；不要出现人物、文字或水印。", status: "idle" },
    },
    storyboard: {
        kind: "storyboard",
        type: CanvasNodeType.Image,
        title: "分镜图",
        description: "根据分镜脚本和人物参考生成画面",
        metadata: { workflowKind: "storyboard", generationMode: "image", prompt: "根据上游分镜脚本、人物与场景参考生成电影分镜图。严格遵循镜头构图、动作、景别、光线和连续性；人物身份与服装保持一致；只呈现画面，不添加解释文字或水印。", status: "idle" },
    },
    video: {
        kind: "video",
        type: CanvasNodeType.Video,
        title: "视频片段",
        description: "根据分镜图与脚本生成视频",
        metadata: { workflowKind: "video", generationMode: "video", prompt: "根据上游分镜图、人物参考和分镜脚本生成视频。保持人物身份、场景、服装、光线和动作连续，严格执行镜头运动与节奏，不显示分镜边框、编号或说明文字。", status: "idle" },
    },
};

export function workflowNodePreset(kind: CanvasWorkflowNodeKind) {
    return CANVAS_WORKFLOW_NODE_PRESETS[kind];
}

export function workflowNodeLabel(kind?: CanvasWorkflowNodeKind) {
    return kind ? CANVAS_WORKFLOW_NODE_PRESETS[kind]?.title || "创作节点" : "";
}

export function inferWorkflowNodeKind(title: string, type: CanvasNodeType): CanvasWorkflowNodeKind | undefined {
    if (type === CanvasNodeType.Video) return "video";
    if (type === CanvasNodeType.Image || type === CanvasNodeType.Panorama) {
        if (/角色|人物|设定表|四视图/.test(title)) return "character";
        if (/场景|环境|地点/.test(title)) return "scene";
        if (/道具|物件/.test(title)) return "prop";
        if (/分镜|故事板|storyboard/i.test(title)) return "storyboard";
        return undefined;
    }
    if (type !== CanvasNodeType.Text) return undefined;
    if (/分镜脚本|镜头\s*\d+|镜头拆解/.test(title)) return "storyboard_script";
    if (/剧本|制作稿|脚本/.test(title)) return "script";
    if (/创意|主题|brief|梗概/i.test(title)) return "idea";
    if (/角色|人物/.test(title)) return "character";
    return undefined;
}
