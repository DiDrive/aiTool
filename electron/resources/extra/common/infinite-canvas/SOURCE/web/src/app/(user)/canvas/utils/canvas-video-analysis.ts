import { resolveMediaUrl } from "@/services/file-storage";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/media";

export type CanvasVideoAnalysisResult = {
    frames: ReferenceImage[];
    timeline: string[];
    evidenceFrameCount: number;
    rangeStartMs: number;
    rangeEndMs: number;
};

type CapturedFrame = { time: number; dataUrl: string };
type SceneChangeCandidate = { timeMs: number; score: number };

const FRAMES_PER_SHEET = 9;
const MAX_CONTACT_SHEETS = 20;

export async function extractCanvasVideoAnalysisFrames(videos: ReferenceVideo[]): Promise<CanvasVideoAnalysisResult> {
    if (!videos.length) return { frames: [], timeline: [], evidenceFrameCount: 0, rangeStartMs: 0, rangeEndMs: 0 };
    const sheets: ReferenceImage[] = [];
    const timeline: string[] = [];
    let evidenceFrameCount = 0;
    let rangeStartMs = Number.POSITIVE_INFINITY;
    let rangeEndMs = 0;

    for (let videoIndex = 0; videoIndex < videos.length && sheets.length < MAX_CONTACT_SHEETS; videoIndex += 1) {
        const result = await extractSingleVideoEvidence(videos[videoIndex], videoIndex, MAX_CONTACT_SHEETS - sheets.length);
        sheets.push(...result.frames);
        timeline.push(...result.timeline);
        evidenceFrameCount += result.evidenceFrameCount;
        rangeStartMs = Math.min(rangeStartMs, result.rangeStartMs);
        rangeEndMs = Math.max(rangeEndMs, result.rangeEndMs);
    }
    return { frames: sheets, timeline, evidenceFrameCount, rangeStartMs: Number.isFinite(rangeStartMs) ? rangeStartMs : 0, rangeEndMs };
}

async function extractSingleVideoEvidence(reference: ReferenceVideo, videoIndex: number, sheetLimit: number): Promise<CanvasVideoAnalysisResult> {
    const sourceUrl = await resolveMediaUrl(reference.storageKey, reference.url || "");
    if (!sourceUrl) throw new Error(`视频“${reference.name}”缺少可读取的本地内容，请重新上传后再倒推剧本`);

    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = sourceUrl;

    try {
        await waitForVideoReady(video, "loadedmetadata");
        const durationMs = Math.round((Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Math.max(1, Number(reference.durationMs || 0) / 1000)) * 1000);
        const rangeStartMs = clamp(reference.analysisStartMs ?? reference.trimStartMs ?? 0, 0, Math.max(0, durationMs - 1));
        const rangeEndMs = clamp(reference.analysisEndMs ?? reference.trimEndMs ?? durationMs, rangeStartMs + 1, durationMs);
        const intervalMs = 500;
        const maximumEvidence = Math.max(FRAMES_PER_SHEET, sheetLimit * FRAMES_PER_SHEET);
        const sceneChanges = await detectSceneChanges(video, rangeStartMs, rangeEndMs, 250);
        const times = buildEvidenceTimes(rangeStartMs, rangeEndMs, intervalMs, maximumEvidence, sceneChanges);
        const captured = await captureFrames(video, reference, times);
        const sheets = await buildContactSheets(reference, videoIndex, captured, sheetLimit);
        return {
            frames: sheets,
            timeline: sheets.map((_, index) => sheetLabel(videoIndex, captured.slice(index * FRAMES_PER_SHEET, (index + 1) * FRAMES_PER_SHEET), index)),
            evidenceFrameCount: Math.min(captured.length, sheets.length * FRAMES_PER_SHEET),
            rangeStartMs,
            rangeEndMs,
        };
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error || "未知错误");
        throw new Error(`无法解析视频“${reference.name}”的关键帧：${detail}`);
    } finally {
        video.removeAttribute("src");
        video.load();
    }
}

function buildEvidenceTimes(startMs: number, endMs: number, intervalMs: number, maximum: number, sceneChanges: SceneChangeCandidate[]) {
    const raw: number[] = [startMs];
    for (let time = startMs + intervalMs; time < endMs - 1; time += intervalMs) raw.push(time);
    raw.push(Math.max(startMs, endMs - 1));
    const changesByImportance = sceneChanges.slice().sort((a, b) => b.score - a.score);
    const selected = new Set<number>([startMs, Math.max(startMs, endMs - 1)]);
    for (const candidate of changesByImportance) {
        if (selected.size >= Math.max(2, Math.floor(maximum * 0.55))) break;
        if ([...selected].every((time) => Math.abs(time - candidate.timeMs) >= 250)) selected.add(candidate.timeMs);
    }
    for (const time of raw) {
        if (selected.size >= maximum) break;
        selected.add(time);
    }
    if (selected.size < maximum && raw.length > maximum) {
        for (let index = 0; index < maximum && selected.size < maximum; index += 1) selected.add(startMs + Math.round((endMs - startMs - 1) * (index / Math.max(1, maximum - 1))));
    }
    return uniqueTimes([...selected]).slice(0, maximum).sort((a, b) => a - b);
}

async function detectSceneChanges(video: HTMLVideoElement, startMs: number, endMs: number, requestedStepMs: number): Promise<SceneChangeCandidate[]> {
    const maximumScans = 1200;
    const stepMs = Math.max(requestedStepMs, Math.ceil((endMs - startMs) / maximumScans));
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    let previous: Uint8Array | null = null;
    const candidates: SceneChangeCandidate[] = [];
    for (let timeMs = startMs; timeMs < endMs; timeMs += stepMs) {
        await seekVideo(video, timeMs / 1000);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const signature = new Uint8Array(canvas.width * canvas.height);
        for (let pixel = 0, index = 0; pixel < pixels.length; pixel += 4, index += 1) signature[index] = Math.round(pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114);
        if (previous) {
            let totalDifference = 0;
            for (let index = 0; index < signature.length; index += 1) totalDifference += Math.abs(signature[index] - previous[index]);
            candidates.push({ timeMs, score: totalDifference / signature.length });
        }
        previous = signature;
    }
    if (!candidates.length) return [];
    const scores = candidates.map((item) => item.score);
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    const deviation = Math.sqrt(scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length);
    const threshold = Math.max(11, mean + deviation * 0.65);
    return candidates.filter((item, index) => item.score >= threshold && item.score >= (candidates[index - 1]?.score ?? 0) && item.score >= (candidates[index + 1]?.score ?? 0));
}

async function captureFrames(video: HTMLVideoElement, reference: ReferenceVideo, timesMs: number[]): Promise<CapturedFrame[]> {
    const canvas = document.createElement("canvas");
    const sourceWidth = video.videoWidth || reference.width || 720;
    const sourceHeight = video.videoHeight || reference.height || 1280;
    const scale = Math.min(1, 420 / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建视频证据帧画布");
    const result: CapturedFrame[] = [];
    for (const timeMs of timesMs) {
        await seekVideo(video, timeMs / 1000);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        result.push({ time: timeMs / 1000, dataUrl: canvas.toDataURL("image/jpeg", 0.86) });
    }
    return result;
}

async function buildContactSheets(reference: ReferenceVideo, videoIndex: number, frames: CapturedFrame[], sheetLimit: number) {
    const sheets: ReferenceImage[] = [];
    for (let offset = 0; offset < frames.length && sheets.length < sheetLimit; offset += FRAMES_PER_SHEET) {
        const group = frames.slice(offset, offset + FRAMES_PER_SHEET);
        const canvas = document.createElement("canvas");
        canvas.width = 960;
        canvas.height = 780;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建视频时间片联系表");
        context.fillStyle = "#111";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#fff";
        context.font = "20px sans-serif";
        context.fillText(`视频 ${videoIndex + 1}｜${reference.name}｜时间片 ${sheets.length + 1}`, 18, 30);
        for (let index = 0; index < group.length; index += 1) {
            const frame = group[index];
            const image = await loadImage(frame.dataUrl);
            const column = index % 3;
            const row = Math.floor(index / 3);
            const x = 12 + column * 316;
            const y = 48 + row * 240;
            drawContain(context, image, x, y, 304, 202);
            context.fillStyle = "rgba(0,0,0,.72)";
            context.fillRect(x, y + 178, 304, 24);
            context.fillStyle = "#fff";
            context.font = "16px monospace";
            context.fillText(formatTimestamp(frame.time), x + 8, y + 196);
        }
        const label = sheetLabel(videoIndex, group, sheets.length);
        sheets.push({ id: `${reference.id}:analysis-sheet:${sheets.length}`, name: `${label}.jpg`, type: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.88) });
    }
    return sheets;
}

function sheetLabel(videoIndex: number, group: CapturedFrame[], sheetIndex: number) {
    const first = group[0]?.time || 0;
    const last = group[group.length - 1]?.time || first;
    return `视频${videoIndex + 1}时间片${sheetIndex + 1}（${formatTimestamp(first)}—${formatTimestamp(last)}，${group.length}帧）`;
}

function drawContain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("视频证据帧加载失败"));
        image.src = src;
    });
}

async function seekVideo(video: HTMLVideoElement, time: number) {
    const target = Math.min(Math.max(time, 0), Math.max(video.duration - 0.001, 0));
    if (Math.abs(video.currentTime - target) < 0.005 && video.readyState >= 2) return;
    const ready = waitForVideoReady(video, "seeked");
    video.currentTime = target;
    await ready;
}

function waitForVideoReady(video: HTMLVideoElement, eventName: "loadedmetadata" | "seeked") {
    if (eventName === "loadedmetadata" && video.readyState >= 1) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(() => reject(new Error("视频读取超时"))), 20_000);
        const onReady = () => finish(resolve);
        const onError = () => finish(() => reject(new Error("视频加载或解码失败")));
        const finish = (done: () => void) => {
            window.clearTimeout(timeout);
            video.removeEventListener(eventName, onReady);
            video.removeEventListener("error", onError);
            done();
        };
        video.addEventListener(eventName, onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
}

function formatTimestamp(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remain = seconds - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${remain.toFixed(3).padStart(6, "0")}`;
}

function uniqueTimes(values: number[]) {
    return [...new Set(values.map((value) => Math.round(value)))].sort((a, b) => a - b);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(Math.round(value), min), max);
}
