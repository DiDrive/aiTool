import { nanoid } from "nanoid";

import type { CanvasCharacterProfile, CanvasNodeMetadata, CanvasSceneProfile, CanvasScriptScene, CanvasStoryboardExtraAsset, CanvasStoryboardShot, CanvasVisualBible, CanvasWorkflowNodeKind } from "../types";

export function workflowTextResultPatch(kind: CanvasWorkflowNodeKind | undefined, rawText: string): Partial<CanvasNodeMetadata> {
    if (kind === "script") {
        const root = parseJsonObject(rawText);
        const strictScenes = tryParseScriptScenes(rawText);
        const scriptScenes = strictScenes || parseScriptScenes(rawText);
        const inferred = inferConsistencyFromScenes(scriptScenes);
        const characterProfiles = Array.isArray(root?.characters) ? root.characters.map(normalizeCharacterProfile).filter((item): item is CanvasCharacterProfile => Boolean(item)) : inferred.characterProfiles;
        const sceneProfiles = Array.isArray(root?.locations) ? root.locations.map(normalizeSceneProfile).filter((item): item is CanvasSceneProfile => Boolean(item)) : inferred.sceneProfiles;
        const visualBible = root?.visualBible ? normalizeVisualBible(root.visualBible) : inferred.visualBible;
        return { content: formatScriptScenes(scriptScenes), scriptScenes, characterProfiles, sceneProfiles, visualBible, workflowRawText: rawText, workflowStructureValid: Boolean(strictScenes) };
    }
    if (kind === "storyboard_script") {
        const root = parseJsonObject(rawText);
        const strictShots = tryParseStoryboardShots(rawText);
        const storyboardShots = strictShots || parseStoryboardShots(rawText);
        const inferred = inferConsistencyFromShots(storyboardShots);
        const characterProfiles = Array.isArray(root?.characters) ? root.characters.map(normalizeCharacterProfile).filter((item): item is CanvasCharacterProfile => Boolean(item)) : inferred.characterProfiles;
        const sceneProfiles = Array.isArray(root?.locations) ? root.locations.map(normalizeSceneProfile).filter((item): item is CanvasSceneProfile => Boolean(item)) : inferred.sceneProfiles;
        const visualBible = root?.visualBible ? normalizeVisualBible(root.visualBible) : inferred.visualBible;
        return { content: formatStoryboardShots(storyboardShots), storyboardShots, characterProfiles, sceneProfiles, visualBible, workflowRawText: rawText, workflowStructureValid: Boolean(strictShots) };
    }
    return { content: rawText };
}

export function consistencyResultPatch(rawText: string): Pick<CanvasNodeMetadata, "characterProfiles" | "sceneProfiles" | "visualBible"> | null {
    const root = parseJsonObject(rawText);
    if (!root) return null;
    const characterProfiles = Array.isArray(root.characters) ? root.characters.map(normalizeCharacterProfile).filter((item): item is CanvasCharacterProfile => Boolean(item)) : [];
    const sceneProfiles = Array.isArray(root.locations) ? root.locations.map(normalizeSceneProfile).filter((item): item is CanvasSceneProfile => Boolean(item)) : [];
    const visualBible = root.visualBible ? normalizeVisualBible(root.visualBible) : undefined;
    return characterProfiles.length || sceneProfiles.length || visualBible ? { characterProfiles, sceneProfiles, visualBible } : null;
}

export function isConcreteVisualBible(value?: CanvasVisualBible) {
    if (!value) return false;
    const vague = /依据|保持|沿用|原视频|未指定|待分析|还原|一致$/;
    return [value.medium, value.visualStyle, value.colorPalette, value.lightingStyle, value.cameraLanguage, value.aspectRatio]
        .filter((item) => item.trim() && !vague.test(item.trim())).length >= 5;
}

export function tryParseScriptScenes(rawText: string): CanvasScriptScene[] | null {
    const parsed = parseJsonObject(rawText);
    const rows = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    if (!rows.length) return null;
    const normalized = rows.map((row, index) => normalizeScriptScene(row, index));
    return isValidScriptScenes(normalized) ? normalized : null;
}

export function tryParseStoryboardShots(rawText: string): CanvasStoryboardShot[] | null {
    const parsed = parseJsonObject(rawText);
    const rows = Array.isArray(parsed?.shots) ? parsed.shots : [];
    if (!rows.length) return null;
    const normalized = rows.map((row, index) => normalizeStoryboardShot(row, index));
    return isValidStoryboardShots(normalized) ? normalized : null;
}

export function isValidScriptScenes(rows: CanvasScriptScene[]) {
    return rows.length > 0 && rows.every((row) => row.sceneNumber && row.location && row.durationSeconds > 0 && Boolean(row.action || row.dialogue) && allPopulatedFieldsContainChinese([row.location, row.timeOfDay, row.action, row.dialogue]));
}

export function isValidStoryboardShots(rows: CanvasStoryboardShot[]) {
    return rows.length > 0 && rows.every((row) => row.shotNumber && row.durationSeconds > 0 && row.shotSize && row.scene && row.visual && row.camera && allPopulatedFieldsContainChinese([row.shotSize, row.scene, row.visual, row.action, row.camera, row.lighting, row.dialogue, row.sound, row.continuity]));
}

export function hasValidWorkflowStructure(kind: CanvasWorkflowNodeKind | undefined, rawText: string) {
    if (kind === "script") return Boolean(tryParseScriptScenes(rawText));
    if (kind === "storyboard_script") return Boolean(tryParseStoryboardShots(rawText));
    return true;
}

export function ensureWorkflowGenerationContract(kind: CanvasWorkflowNodeKind | undefined, prompt: string) {
    if (kind !== "script" && kind !== "storyboard_script") return prompt;
    const key = kind === "script" ? '"scenes"' : '"shots"';
    if (prompt.includes(key) && prompt.includes("简体中文")) return prompt;
    const contract = kind === "script"
        ? '只输出合法 JSON，不要 Markdown、解释或代码围栏。所有字段值必须使用简体中文。根对象必须同时包含 scenes、characters、locations、visualBible，缺一不可。每个场次包含 sceneNumber、startMs、endMs、location、sceneId、timeOfDay、characters、characterIds、action、dialogue、durationSeconds。characters 每项包含 id、name、appearance、wardrobe、voice、firstSeenMs；locations 每项包含 id、name、environment、layout、lighting、firstSeenMs；visualBible 必须包含 medium、visualStyle、colorPalette、lightingStyle、cameraLanguage、editingRhythm、aspectRatio。视频倒推必须根据证据画面分析这些档案并使用原视频绝对时间，禁止留空或填写“未指定”。'
        : '只输出合法 JSON，不要 Markdown、解释或代码围栏。所有字段值必须使用简体中文。根对象必须同时包含 shots、characters、locations、visualBible，缺一不可。每个镜头包含 shotNumber、startMs、endMs、durationSeconds、shotSize、scene、sceneId、characters、characterIds、props、visual、action、camera、lighting、dialogue、sound、continuity、evidenceTimestampsMs、confidence。characters、locations、visualBible 沿用并细化上游一致性档案，禁止丢失或留空；镜头总时长必须等于上游剧本总时长。';
    return `${prompt}\n\n【强制输出契约】${contract}`;
}

export function workflowStructureRepairPrompt(kind: CanvasWorkflowNodeKind, rawText: string) {
    const contract = ensureWorkflowGenerationContract(kind, "把下面内容翻译成简体中文并转换成结构化制作数据，保持原剧情、人物、对白和顺序，不要新增解释。即使原文是英文，输出字段内容也必须是中文。");
    return `${contract}\n\n待转换内容：\n${rawText}`;
}

export function parseScriptScenes(rawText: string): CanvasScriptScene[] {
    const strict = tryParseScriptScenes(rawText);
    if (strict) return strict;
    const text = rawText.trim();
    return text ? [normalizeScriptScene({ sceneNumber: "1", action: text }, 0)] : [];
}

export function parseStoryboardShots(rawText: string): CanvasStoryboardShot[] {
    const strict = tryParseStoryboardShots(rawText);
    if (strict) return strict;
    const lines = rawText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return lines.map((visual, index) => normalizeStoryboardShot({ shotNumber: String(index + 1), visual }, index));
}

export function normalizeScriptScene(row: unknown, index: number): CanvasScriptScene {
    const value = record(row);
    return {
        id: stringValue(value.id) || nanoid(),
        sceneNumber: stringValue(value.sceneNumber) || String(index + 1),
        location: stringValue(value.location),
        timeOfDay: stringValue(value.timeOfDay),
        characters: normalizeAssetNames(value.characters),
        action: stringValue(value.action),
        dialogue: stringValue(value.dialogue),
        durationSeconds: positiveNumber(value.durationSeconds, 5),
        startMs: optionalNonNegativeNumber(value.startMs),
        endMs: optionalNonNegativeNumber(value.endMs),
        sceneId: stringValue(value.sceneId) || undefined,
        characterIds: stringArray(value.characterIds),
    };
}

export function normalizeStoryboardShot(row: unknown, index: number): CanvasStoryboardShot {
    const value = record(row);
    return {
        id: stringValue(value.id) || nanoid(),
        shotNumber: stringValue(value.shotNumber) || String(index + 1),
        durationSeconds: positiveNumber(value.durationSeconds, 4),
        shotSize: stringValue(value.shotSize),
        scene: stringValue(value.scene),
        characters: normalizeAssetNames(value.characters),
        props: normalizeAssetNames(value.props),
        visual: stringValue(value.visual),
        action: stringValue(value.action),
        camera: stringValue(value.camera),
        lighting: stringValue(value.lighting),
        dialogue: stringValue(value.dialogue),
        sound: stringValue(value.sound),
        continuity: stringValue(value.continuity),
        startMs: optionalNonNegativeNumber(value.startMs),
        endMs: optionalNonNegativeNumber(value.endMs),
        sceneId: stringValue(value.sceneId) || undefined,
        characterIds: stringArray(value.characterIds),
        evidenceTimestampsMs: numberArray(value.evidenceTimestampsMs),
        confidence: optionalUnitNumber(value.confidence),
        assetNodeIds: record(value.assetNodeIds),
        extraAssets: Array.isArray(value.extraAssets) ? value.extraAssets.map(normalizeExtraAsset).filter((asset): asset is CanvasStoryboardExtraAsset => Boolean(asset)) : [],
    };
}

function normalizeExtraAsset(value: unknown): CanvasStoryboardExtraAsset | null {
    const item = record(value);
    const kind = stringValue(item.kind);
    const name = stringValue(item.name);
    if (!name || isEmptyAssetName(name) || !["character", "scene", "prop", "reference"].includes(kind)) return null;
    return { id: stringValue(item.id) || nanoid(), kind: kind as CanvasStoryboardExtraAsset["kind"], name, nodeId: stringValue(item.nodeId) || undefined };
}

export function formatScriptScenes(rows: CanvasScriptScene[]) {
    return rows.map((row) => `场次 ${row.sceneNumber}｜${formatAbsoluteRange(row.startMs, row.endMs)}｜${row.location || "未定场景"}｜${row.timeOfDay || "时间未定"}${row.sceneId ? `｜场景ID：${row.sceneId}` : ""}\n人物：${row.characters.join("、") || "未定"}${row.characterIds?.length ? `（角色ID：${row.characterIds.join("、")}）` : ""}\n${row.action}${row.dialogue ? `\n对白/旁白：${row.dialogue}` : ""}`).join("\n\n");
}

export function formatStoryboardShots(rows: CanvasStoryboardShot[]) {
    return rows.map((row) => `镜头 ${row.shotNumber}｜${formatAbsoluteRange(row.startMs, row.endMs)}｜${row.durationSeconds}s｜${row.shotSize || "景别未定"}${row.sceneId ? `｜场景ID：${row.sceneId}` : ""}\n场景：${row.scene || "未定"}｜人物：${row.characters.join("、") || "未定"}\n${row.visual}${row.action ? `；${row.action}` : ""}\n运镜/光线：${[row.camera, row.lighting].filter(Boolean).join("；") || "未定"}${row.dialogue ? `\n对白/旁白：${row.dialogue}` : ""}${row.sound ? `\n声音：${row.sound}` : ""}${row.evidenceTimestampsMs?.length ? `\n证据时间点：${row.evidenceTimestampsMs.map(formatAbsoluteMs).join("、")}` : ""}${typeof row.confidence === "number" ? `｜置信度：${Math.round(row.confidence * 100)}%` : ""}`).join("\n\n");
}

export function inferConsistencyFromScenes(rows: CanvasScriptScene[]) {
    const characterNames = uniqueStrings(rows.flatMap((row) => row.characters));
    const locationNames = uniqueStrings(rows.map((row) => row.location).filter(Boolean));
    const characterProfiles: CanvasCharacterProfile[] = characterNames.map((name, index) => {
        const related = rows.filter((row) => row.characters.includes(name));
        return { id: related.flatMap((row) => row.characterIds || [])[index] || `character_${index + 1}`, name, appearance: evidenceSummary(related.map((row) => row.action), name), wardrobe: "依据原视频证据中的服装保持一致", voice: evidenceSummary(related.map((row) => row.dialogue), name), firstSeenMs: firstTime(related.map((row) => row.startMs)) };
    });
    const sceneProfiles: CanvasSceneProfile[] = locationNames.map((name, index) => {
        const related = rows.filter((row) => row.location === name);
        return { id: related.find((row) => row.sceneId)?.sceneId || `scene_${index + 1}`, name, environment: evidenceSummary(related.map((row) => row.action), name), layout: "依据原视频画面中的空间结构保持一致", lighting: uniqueStrings(related.map((row) => row.timeOfDay).filter(Boolean)).join("、") || "依据原视频光线保持一致", firstSeenMs: firstTime(related.map((row) => row.startMs)) };
    });
    const average = rows.length ? rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length : 0;
    return { characterProfiles, sceneProfiles, visualBible: defaultInferredBible(average) };
}

export function inferConsistencyFromShots(rows: CanvasStoryboardShot[]) {
    const characterNames = uniqueStrings(rows.flatMap((row) => row.characters));
    const sceneNames = uniqueStrings(rows.map((row) => row.scene).filter(Boolean));
    const characterProfiles: CanvasCharacterProfile[] = characterNames.map((name, index) => {
        const related = rows.filter((row) => row.characters.includes(name));
        return { id: related.flatMap((row) => row.characterIds || [])[index] || `character_${index + 1}`, name, appearance: evidenceSummary(related.flatMap((row) => [row.visual, row.action]), name), wardrobe: "依据分镜画面中的服装保持一致", voice: evidenceSummary(related.flatMap((row) => [row.dialogue, row.sound]), name), firstSeenMs: firstTime(related.map((row) => row.startMs)) };
    });
    const sceneProfiles: CanvasSceneProfile[] = sceneNames.map((name, index) => {
        const related = rows.filter((row) => row.scene === name);
        return { id: related.find((row) => row.sceneId)?.sceneId || `scene_${index + 1}`, name, environment: evidenceSummary(related.flatMap((row) => [row.visual, row.action]), name), layout: "依据分镜画面描述的空间关系保持一致", lighting: uniqueStrings(related.map((row) => row.lighting).filter(Boolean)).join("；") || "依据原视频光线保持一致", firstSeenMs: firstTime(related.map((row) => row.startMs)) };
    });
    const average = rows.length ? rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length : 0;
    const visualBible = defaultInferredBible(average);
    visualBible.lightingStyle = uniqueStrings(rows.map((row) => row.lighting).filter(Boolean)).slice(0, 4).join("；") || visualBible.lightingStyle;
    visualBible.cameraLanguage = uniqueStrings(rows.flatMap((row) => [row.shotSize, row.camera]).filter(Boolean)).slice(0, 6).join("；") || visualBible.cameraLanguage;
    return { characterProfiles, sceneProfiles, visualBible };
}

function defaultInferredBible(averageShotSeconds: number): CanvasVisualBible {
    return { medium: "依据原视频画面还原", visualStyle: "保持原视频整体视觉风格", colorPalette: "保持原视频主色调与色彩关系", lightingStyle: "保持原视频光线方向、强弱与色温", cameraLanguage: "保持原视频景别、构图与运镜习惯", editingRhythm: averageShotSeconds ? `平均镜头约 ${averageShotSeconds.toFixed(2)} 秒` : "保持原视频剪辑节奏", aspectRatio: "保持原视频画幅" };
}

function evidenceSummary(values: string[], name: string) {
    const text = uniqueStrings(values.map((value) => value.trim()).filter(Boolean)).join("；");
    return text ? text.slice(0, 240) : `依据原视频中${name}的可见特征保持一致`;
}

function firstTime(values: Array<number | undefined>) {
    const times = values.filter((value): value is number => typeof value === "number");
    return times.length ? Math.min(...times) : undefined;
}

function normalizeCharacterProfile(value: unknown): CanvasCharacterProfile | null {
    const item = record(value);
    const name = stringValue(item.name);
    if (!name) return null;
    return { id: stringValue(item.id) || nanoid(), name, appearance: stringValue(item.appearance), wardrobe: stringValue(item.wardrobe), voice: stringValue(item.voice), firstSeenMs: optionalNonNegativeNumber(item.firstSeenMs) };
}

function normalizeSceneProfile(value: unknown): CanvasSceneProfile | null {
    const item = record(value);
    const name = stringValue(item.name);
    if (!name) return null;
    return { id: stringValue(item.id) || nanoid(), name, environment: stringValue(item.environment), layout: stringValue(item.layout), lighting: stringValue(item.lighting), firstSeenMs: optionalNonNegativeNumber(item.firstSeenMs) };
}

function normalizeVisualBible(value: unknown): CanvasVisualBible {
    const item = record(value);
    return { medium: stringValue(item.medium), visualStyle: stringValue(item.visualStyle), colorPalette: stringValue(item.colorPalette), lightingStyle: stringValue(item.lightingStyle), cameraLanguage: stringValue(item.cameraLanguage), editingRhythm: stringValue(item.editingRhythm), aspectRatio: stringValue(item.aspectRatio) };
}

function formatAbsoluteRange(startMs?: number, endMs?: number) {
    return typeof startMs === "number" && typeof endMs === "number" ? `${formatAbsoluteMs(startMs)}-${formatAbsoluteMs(endMs)}` : "时间码未定";
}

function formatAbsoluteMs(ms: number) {
    return `${(Math.max(0, ms) / 1000).toFixed(3)}秒`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
    const candidates = [text.trim(), text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim(), text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)].filter(Boolean) as string[];
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
            // Continue to the fallback representation.
        }
    }
    return null;
}

function record(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function stringArray(value: unknown) {
    if (Array.isArray(value)) return uniqueStrings(value.map(stringValue).filter(Boolean));
    const text = stringValue(value);
    return text ? uniqueStrings(text.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean)) : [];
}

export function normalizeAssetNames(value: unknown): string[] {
    const values = Array.isArray(value)
        ? value.map(stringValue)
        : stringValue(value).split(/[、,，/]/).map((item) => item.trim());
    return uniqueStrings(values.filter((item) => item && !isEmptyAssetName(item)));
}

export function isEmptyAssetName(value: string): boolean {
    const normalized = value.trim().toLocaleLowerCase().replace(/[。.!！?？;；:：]+$/g, "").replace(/\s+/g, "");
    return /^(无|没有|暂无|不需要|无需|未出现|无相关|none|null|nil|n\/?a|notapplicable)(人物|角色|场景|道具|素材|物品|参考)?$/.test(normalized);
}

function numberArray(value: unknown) {
    return Array.isArray(value) ? value.map(Number).filter((item) => Number.isFinite(item) && item >= 0).map(Math.round) : [];
}

function optionalNonNegativeNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
}

function optionalUnitNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : undefined;
}

function uniqueStrings(values: string[]) {
    const seen = new Set<string>();
    return values.filter((value) => {
        const key = value.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function positiveNumber(value: unknown, fallback: number) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function containsChinese(value: string) {
    return /[\u3400-\u9fff]/.test(value);
}

function allPopulatedFieldsContainChinese(values: string[]) {
    return values.every((value) => !value.trim() || containsChinese(value));
}
