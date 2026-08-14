export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Panorama = "panorama",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Director = "director",
    Group = "group",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasWorkflowNodeKind = "idea" | "script" | "storyboard_script" | "character" | "scene" | "prop" | "storyboard" | "video";

export type CanvasScriptScene = {
    id: string;
    sceneNumber: string;
    location: string;
    timeOfDay: string;
    characters: string[];
    action: string;
    dialogue: string;
    durationSeconds: number;
    startMs?: number;
    endMs?: number;
    sceneId?: string;
    characterIds?: string[];
};

export type CanvasVideoRange = {
    startMs: number;
    endMs: number;
};

export type CanvasVideoAnalysisMode = "fast" | "standard" | "detailed";

export type CanvasCharacterProfile = {
    id: string;
    name: string;
    appearance: string;
    wardrobe: string;
    voice: string;
    firstSeenMs?: number;
};

export type CanvasSceneProfile = {
    id: string;
    name: string;
    environment: string;
    layout: string;
    lighting: string;
    firstSeenMs?: number;
};

export type CanvasVisualBible = {
    medium: string;
    visualStyle: string;
    colorPalette: string;
    lightingStyle: string;
    cameraLanguage: string;
    editingRhythm: string;
    aspectRatio: string;
};

export type CanvasStoryboardAssetNodeIds = {
    characters?: Record<string, string>;
    scene?: string;
    props?: Record<string, string>;
    storyboard?: string;
    video?: string;
};

export type CanvasStoryboardExtraAsset = {
    id: string;
    kind: "character" | "scene" | "prop" | "reference";
    name: string;
    nodeId?: string;
};

export type CanvasStoryboardShot = {
    id: string;
    shotNumber: string;
    durationSeconds: number;
    shotSize: string;
    scene: string;
    characters: string[];
    props: string[];
    visual: string;
    action: string;
    camera: string;
    lighting: string;
    dialogue: string;
    sound: string;
    continuity: string;
    startMs?: number;
    endMs?: number;
    sceneId?: string;
    characterIds?: string[];
    evidenceTimestampsMs?: number[];
    confidence?: number;
    assetNodeIds?: CanvasStoryboardAssetNodeIds;
    extraAssets?: CanvasStoryboardExtraAsset[];
};

export type CameraControlOptions = {
    enabled: boolean;
    camera: string;
    lens: string;
    focalLength: number;
    aperture: number;
};

export type CanvasNodeMetadata = {
    workflowKind?: CanvasWorkflowNodeKind;
    scriptScenes?: CanvasScriptScene[];
    storyboardShots?: CanvasStoryboardShot[];
    workflowSourceNodeId?: string;
    workflowAdaptationSourceNodeId?: string;
    workflowAdaptationRequirement?: string;
    workflowShotId?: string;
    workflowAssetKind?: "character" | "scene" | "prop" | "storyboard" | "video";
    workflowAssetName?: string;
    workflowRawText?: string;
    workflowStructureValid?: boolean;
    sourceVideoNodeId?: string;
    videoTrim?: CanvasVideoRange;
    videoAnalysisRange?: CanvasVideoRange;
    videoAnalysisMode?: CanvasVideoAnalysisMode;
    characterProfiles?: CanvasCharacterProfile[];
    sceneProfiles?: CanvasSceneProfile[];
    visualBible?: CanvasVisualBible;
    adaptationBrief?: string;
    adaptationMode?: "structure" | "rhythm" | "story";
    content?: string;
    groupId?: string;
    composerContent?: string;
    prompt?: string;
    excludeUpstreamText?: boolean;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    channelId?: string;
    size?: string;
    quality?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    mode?: string;
    negativePrompt?: string;
    generateAudio?: string;
    characterOrientation?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    startedAt?: number;
    progress?: number;
    imageTaskId?: string;
    imageTaskResultId?: string;
    audioTaskId?: string;
    audioTaskResultId?: string;
    videoTaskId?: string;
    videoTaskVideoId?: string;
    firstFrameNodeId?: string;
    lastFrameNodeId?: string;
    multiShot?: string;
    shotType?: string;
    klingImageNodeIds?: string[];
    klingMultiPrompt?: { textNodeId?: string; duration?: string }[];
    klingElementList?: { name?: string; description?: string; nodeIds?: string[] }[];
    cameraControl?: CameraControlOptions;
    panoramaSourcePrompt?: string;
    panoramaFinalPrompt?: string;
    panoramaProjection?: "equirectangular";
    directorProject?: unknown;
};

export type CanvasDirectorPanorama = {
    edgeId: string;
    sourceNodeId: string;
    imageUrl: string;
    fileName: string;
    projectionMode: "equirectangular" | "backdrop";
};

export type CanvasDirectorCapture = {
    dataUrl: string;
    fileName: string;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    url?: string;
    storageKey?: string;
    mimeType?: string;
    text?: string;
};

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string; assetId?: string; source?: "asset" | "library" }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string; assetId?: string; width?: number; height?: number; bytes?: number; mimeType?: string; source?: "asset" | "library" }
    | { kind: "video"; url: string; title: string; storageKey?: string; assetId?: string; width?: number; height?: number; bytes?: number; mimeType?: string; source?: "asset" | "library" }
    | { kind: "audio"; url: string; title: string; storageKey?: string; assetId?: string; bytes?: number; mimeType?: string; durationMs?: number; source?: "asset" | "library" };

export type PendingAgentAsset = {
    nodeId: string;
    payload: InsertAssetPayload;
    reference: CanvasAssistantReference;
};

export type CanvasPendingAgentRequest = {
    prompt: string;
    assets: PendingAgentAsset[];
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
    source?: "asset" | "library";
};

export type CanvasAgentPhase =
    | "intake"
    | "concept"
    | "script"
    | "breakdown"
    | "references"
    | "storyboard"
    | "video"
    | "audio"
    | "review"
    | "complete";

export type CanvasAgentConfig = {
    imageQuality: string;
    imageSize: string;
    videoQuality: string;
    videoSize: string;
};

export type CanvasAgentState = {
    phase: CanvasAgentPhase;
    brief?: string;
    targetDurationSeconds?: number;
    approvedPlan?: string;
    approvedNodeIds: string[];
    referenceNodeIds: string[];
    pendingTaskIds: string[];
    completedTaskIds: string[];
};

export type CanvasAgentContent =
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
    >;

export type CanvasAgentToolCall = {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
};

export type CanvasAgentProtocolMessage =
    | { role: "user" | "system"; content: CanvasAgentContent }
    | { role: "assistant"; content?: string; toolCalls?: CanvasAgentToolCall[] }
    | { role: "tool"; content: string; toolCallId: string; name: string };

export type CanvasAssistantMessageStatus = "thinking" | "running" | "waiting" | "success" | "error";

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    status?: CanvasAssistantMessageStatus;
    activity?: string;
    references?: CanvasAssistantReference[];
    images?: CanvasAssistantImage[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    agentState: CanvasAgentState;
    protocolMessages: CanvasAgentProtocolMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
        type: "node";
        x: number;
        y: number;
        nodeId: string;
    }
    | {
        type: "connection";
        x: number;
        y: number;
        connectionId: string;
    };
