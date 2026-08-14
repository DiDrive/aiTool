import { nanoid } from "nanoid";

import type { CanvasNodeMetadata, CanvasScriptScene, CanvasStoryboardExtraAsset, CanvasStoryboardShot, CanvasWorkflowNodeKind } from "../types";

export function workflowTextResultPatch(kind: CanvasWorkflowNodeKind | undefined, rawText: string): Partial<CanvasNodeMetadata> {
    if (kind === "script") {
        const strictScenes = tryParseScriptScenes(rawText);
        const scriptScenes = strictScenes || parseScriptScenes(rawText);
        return { content: formatScriptScenes(scriptScenes), scriptScenes, workflowRawText: rawText, workflowStructureValid: Boolean(strictScenes) };
    }
    if (kind === "storyboard_script") {
        const strictShots = tryParseStoryboardShots(rawText);
        const storyboardShots = strictShots || parseStoryboardShots(rawText);
        return { content: formatStoryboardShots(storyboardShots), storyboardShots, workflowRawText: rawText, workflowStructureValid: Boolean(strictShots) };
    }
    return { content: rawText };
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
        ? '只输出合法 JSON，不要 Markdown、解释或代码围栏。所有字段值必须使用简体中文，英文原文必须翻译成中文，仅必要专有名词可以在中文后括号保留英文。根对象必须是 {"scenes":[...]}，每个场次包含 sceneNumber、startMs、endMs、location、sceneId、timeOfDay、characters、characterIds、action、dialogue、durationSeconds；视频倒推必须使用原视频绝对时间。字段内容必须互相对应，所有场次时长之和必须等于需求目标时长。'
        : '只输出合法 JSON，不要 Markdown、解释或代码围栏。所有字段值必须使用简体中文，英文原文必须翻译成中文，仅必要专有名词可以在中文后括号保留英文。根对象必须是 {"shots":[...]}，每个镜头包含 shotNumber、startMs、endMs、durationSeconds、shotSize、scene、sceneId、characters、characterIds、props、visual、action、camera、lighting、dialogue、sound、continuity、evidenceTimestampsMs、confidence；字段内容必须互相对应，镜头总时长必须等于上游剧本总时长。';
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
        characters: stringArray(value.characters),
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
        characters: stringArray(value.characters),
        props: stringArray(value.props),
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
    if (!name || !["character", "scene", "prop", "reference"].includes(kind)) return null;
    return { id: stringValue(item.id) || nanoid(), kind: kind as CanvasStoryboardExtraAsset["kind"], name, nodeId: stringValue(item.nodeId) || undefined };
}

export function formatScriptScenes(rows: CanvasScriptScene[]) {
    return rows.map((row) => `场次 ${row.sceneNumber}｜${row.location || "未定场景"}｜${row.timeOfDay || "时间未定"}\n人物：${row.characters.join("、") || "未定"}\n${row.action}${row.dialogue ? `\n对白/旁白：${row.dialogue}` : ""}`).join("\n\n");
}

export function formatStoryboardShots(rows: CanvasStoryboardShot[]) {
    return rows.map((row) => `镜头 ${row.shotNumber}｜${row.durationSeconds}s｜${row.shotSize || "景别未定"}\n${row.visual}${row.action ? `；${row.action}` : ""}${row.dialogue ? `\n对白/旁白：${row.dialogue}` : ""}`).join("\n\n");
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
