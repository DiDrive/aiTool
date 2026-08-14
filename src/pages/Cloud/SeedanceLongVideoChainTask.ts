import { ffmpegConcatVideos, ffmpegExtractLastFrame } from "../../lib/ffmpeg";
import { RunningHubModelConfigType } from "../Apps/RunningHubStudio/type";
import { TaskRecord, TaskService } from "../../service/TaskService";
import { TaskBiz } from "../../store/modules/task";

export type SeedanceLongVideoChainTaskParam = {
    title: string;
    totalDuration: number;
    segmentPrompts: string[];
    baseContent: any[];
    finalOnlyAssetUrls?: string[];
    modelConfig: RunningHubModelConfigType;
    generateAudio: boolean;
    ratio: string;
    resolution: string;
    watermark: boolean;
};

type SegmentState = {
    index: number;
    duration: number;
    prompt: string;
    taskId?: number;
    video?: string;
    localVideo?: string;
    tailFrame?: string;
    status: "queue" | "running" | "success";
};

type ChainResult = {
    currentIndex: number;
    segments: SegmentState[];
    output?: string;
};

const isVideo = (value: string) => /\.(mp4|mov|webm|mkv|avi)(\?|#|$)/i.test(value);
const candidates = (task: TaskRecord | null) => [
    ...(Array.isArray(task?.result?.localFiles) ? task!.result.localFiles : []),
    task?.result?.video,
    task?.result?.url,
    ...(Array.isArray(task?.result?.urls) ? task!.result.urls : []),
    ...(Array.isArray(task?.result?.remoteUrls) ? task!.result.remoteUrls : []),
].map(item => String(item || "").trim()).filter(Boolean);

const outputVideo = (task: TaskRecord | null) => {
    const values = candidates(task);
    return values.find(isVideo) || values[0] || "";
};

const localVideo = async (value: string) => {
    if (!value) throw new Error("分段任务完成，但没有找到视频结果");
    if (await window.$mapi.file.isHubFile(value)) return await window.$mapi.file.hubFullPath(value);
    if (/^[a-zA-Z]:[\\/]|^\\\\/.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return await window.$mapi.file.download(value);
    return value;
};

const splitDurations = (total: number) => {
    const values: number[] = [];
    let remaining = Math.max(4, Math.round(total));
    while (remaining > 15) {
        values.push(15);
        remaining -= 15;
    }
    if (remaining > 0) values.push(remaining);
    if (values.length > 1 && values[values.length - 1] < 4) {
        values[values.length - 2] -= 4 - values[values.length - 1];
        values[values.length - 1] = 4;
    }
    return values;
};

const initialResult = (param: SeedanceLongVideoChainTaskParam): ChainResult => {
    const durations = splitDurations(param.totalDuration);
    return {
        currentIndex: 0,
        segments: durations.map((duration, index) => ({
            index,
            duration,
            prompt: param.segmentPrompts[index] || param.segmentPrompts[0] || "",
            status: "queue",
        })),
    };
};

const segmentRecord = (param: SeedanceLongVideoChainTaskParam, state: SegmentState, previous?: SegmentState): TaskRecord => {
    const body = JSON.parse(String(param.modelConfig.requestBodyJson || "{}"));
    const isLast = state.index === splitDurations(param.totalDuration).length - 1;
    const base = Array.isArray(param.baseContent) ? param.baseContent : [];
    const finalOnly = new Set(param.finalOnlyAssetUrls || []);
    const continuity = previous
        ? "承接上一段尾帧的动作、人物、服装、车辆、光线与场景，镜头运动连续，不要重新开场或跳变。"
        : "";
    const baseText = String(base.find(item => item?.type === "text")?.text || "");
    const marker = "画面/动作要求：";
    const markerIndex = baseText.indexOf(marker);
    const masterBinding = markerIndex >= 0 ? baseText.slice(0, markerIndex + marker.length) : "";
    const segmentPrompt = [masterBinding, state.prompt, continuity].filter(Boolean).join("\n");
    if (param.modelConfig.providerType === "pix") {
        const media = base
            .filter(item => item?.type !== "text")
            .map(item => ({
                type: String(item?.type || "").replace(/_url$/, ""),
                role: String(item?.role || ""),
                url: String(item?.image_url?.url || item?.video_url?.url || item?.audio_url?.url || "").trim(),
            }))
            .filter(item => item.url);
        const referenceImages = media
            .filter(item => item.type === "image" && item.role !== "first_frame" && item.role !== "last_frame" && (isLast || !finalOnly.has(item.url)))
            .map(item => item.url);
        const firstFrame = media.find(item => item.role === "first_frame")?.url || "";
        const lastFrame = media.find(item => item.role === "last_frame")?.url || "";
        const images = previous?.tailFrame
            ? [previous.tailFrame, ...(isLast && lastFrame ? [lastFrame] : []), ...referenceImages]
            : [firstFrame, ...(isLast && lastFrame ? [lastFrame] : []), ...referenceImages].filter(Boolean);
        body.prompt = segmentPrompt;
        body.mode = previous?.tailFrame
            ? isLast && lastFrame ? "first-last" : "first-frame"
            : body.mode;
        body.images = images;
        if (!images.length) delete body.images;
        body.duration = state.duration;
        body.aspect_ratio = param.ratio;
        body.resolution = param.resolution;
    } else {
        const content = base.filter(item => {
            if (isLast) return true;
            if (item?.role === "last_frame") return false;
            const url = String(item?.image_url?.url || "");
            return !finalOnly.has(url);
        }).map(item => ({ ...item }));
        const textIndex = content.findIndex(item => item?.type === "text");
        if (textIndex >= 0) {
            const originalText = String(content[textIndex]?.text || "");
            const markerIndex = originalText.indexOf(marker);
            const binding = markerIndex >= 0 ? originalText.slice(0, markerIndex + marker.length) : "";
            content[textIndex] = {
                ...content[textIndex],
                text: [binding, state.prompt, continuity].filter(Boolean).join("\n"),
            };
        }
        else content.unshift({ type: "text", text: [state.prompt, continuity].filter(Boolean).join("\n") });
        if (previous?.tailFrame) content.splice(1, 0, { type: "image_url", image_url: { url: previous.tailFrame }, role: "first_frame" });
        body.content = content;
        body.duration = state.duration;
        body.generate_audio = param.generateAudio;
        body.ratio = param.ratio;
        body.resolution = param.resolution;
        body.watermark = param.watermark;
    }
    return {
        biz: "DirectApiTask",
        title: `片段_${param.title}_${String(state.index + 1).padStart(2, "0")}`,
        serverName: "", serverTitle: "", serverVersion: "",
        modelConfig: { ...param.modelConfig, requestBodyJson: JSON.stringify(body, null, 2) },
        param: { input: { source: "SeedanceLongVideoSegment", chainTitle: param.title, segmentIndex: state.index + 1 } },
    } as TaskRecord;
};

const update = async (id: string, jobResult: ChainResult, message: string) => {
    await TaskService.update(id, { status: "running", statusMsg: message, jobResult });
};

const advance = async (id: string, supplied?: SeedanceLongVideoChainTaskParam) => {
    const record = await TaskService.get(id);
    if (!record) throw new Error("连续生成任务不存在");
    const param = (record.param || supplied) as SeedanceLongVideoChainTaskParam;
    const jobResult = (record.jobResult && Object.keys(record.jobResult).length ? record.jobResult : initialResult(param)) as ChainResult;
    const state = jobResult.segments[jobResult.currentIndex];
    if (state) {
        const previous = jobResult.segments[state.index - 1];
        if (!state.taskId) {
            state.taskId = Number(await TaskService.submit(segmentRecord(param, state, previous)));
            state.status = "running";
            await update(id, jobResult, `正在生成第 ${state.index + 1}/${jobResult.segments.length} 段`);
            return "running";
        }
        const child = await TaskService.get(state.taskId);
        if (child?.status === "fail") throw new Error(child.statusMsg || `第 ${state.index + 1} 段生成失败`);
        if (child?.status !== "success") return "running";
        state.video = outputVideo(child);
        state.localVideo = await localVideo(state.video);
        state.status = "success";
        if (state.index < jobResult.segments.length - 1) {
            const extractedTailFrame = await ffmpegExtractLastFrame(state.localVideo);
            // 临时目录会被应用周期性清理；续接任务可能稍后才发送，所以保存到素材库的持久目录。
            const savedTailFrame = await window.$mapi.file.hubSave(extractedTailFrame);
            state.tailFrame = await window.$mapi.file.hubFullPath(savedTailFrame);
            if (!(await window.$mapi.file.exists(state.tailFrame))) {
                throw new Error(`连续生成尾帧保存失败：${state.tailFrame}`);
            }
        }
        jobResult.currentIndex += 1;
        await update(id, jobResult, `第 ${state.index + 1} 段完成，准备续接下一段`);
        return "running";
    }
    const output = await ffmpegConcatVideos(jobResult.segments.map(item => item.localVideo!).filter(Boolean));
    jobResult.output = await window.$mapi.file.hubSave(output);
    await TaskService.update(id, { jobResult, statusMsg: "连续视频已拼接完成" });
    return "success";
};

export const SeedanceLongVideoChainTask: TaskBiz = {
    runFunc: async (id, param) => (await advance(id, param)) === "success" ? "success" : "querying",
    queryFunc: async (id, param) => (await advance(id, param)) === "success" ? "success" : "running",
    successFunc: async id => {
        const record = await TaskService.get(id);
        await TaskService.update(id, { status: "success", endTime: Date.now(), result: { url: record?.jobResult?.output, localFiles: record?.jobResult?.output ? [record.jobResult.output] : [] } });
    },
    failFunc: async (id, msg) => { await TaskService.update(id, { status: "fail", statusMsg: msg, endTime: Date.now() }); },
};
