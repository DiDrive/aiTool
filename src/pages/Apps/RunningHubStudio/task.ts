import { FileUtil } from "../../../lib/file";
import { ffmpegVideoNormal } from "../../../lib/ffmpeg";
import { ffprobeVideoInfo } from "../../../lib/ffprobe";
import { TaskRecord, TaskService, TaskType } from "../../../service/TaskService";
import { VideoTemplateService } from "../../../service/VideoTemplateService";
import { TaskBiz } from "../../../store/modules/task";
import {
    RunningHubConnectorType,
    RunningHubJobResultType,
    RunningHubModelConfigType,
} from "./type";

const DEFAULT_BASE_URL = "https://www.runninghub.cn";

const callRunningHubHandle = async (handle: string, payload: any = {}) => {
    const appAny = (window as any)?.$mapi?.app as any;
    if (appAny?.callHandleFromMainOrRender) {
        return await appAny.callHandleFromMainOrRender(handle, payload);
    }
    if (window.ipcRenderer) {
        return await window.ipcRenderer.invoke(handle, payload);
    }
    return await window.$mapi.event.callPage("main", handle, payload);
};

const normalizeBaseUrl = (baseUrl?: string) => {
    const trimmed = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
    if (!trimmed) {
        return DEFAULT_BASE_URL;
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return `https://${trimmed}`;
};

const parseJsonObject = (value: string, label: string) => {
    const raw = String(value || "").trim();
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error(`${label} 必须是 JSON 对象`);
        }
        return parsed;
    } catch (e: any) {
        throw new Error(e?.message || `${label} JSON 解析失败`);
    }
};

const parseJsonArray = (value: string, label: string) => {
    const raw = String(value || "").trim();
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error(`${label} 必须是 JSON 数组`);
        }
        return parsed;
    } catch (e: any) {
        throw new Error(e?.message || `${label} JSON 解析失败`);
    }
};

const isLocalFilePath = (value: string) => {
    const raw = String(value || "").trim();
    return /^file:\/\//i.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw);
};

const toLocalFilePath = (value: string) => {
    const raw = String(value || "").trim();
    if (/^file:\/\//i.test(raw)) {
        return raw.replace(/^file:\/\//i, "");
    }
    return raw;
};

const maybeUploadNodeAssets = async (
    apiBaseUrl: string,
    apiKey: string,
    connectorType: RunningHubConnectorType,
    proxyUrl: string,
    nodeInfoList: Array<Record<string, any>>
) => {
    if (connectorType === "model-api") {
        return {
            nodeInfoList,
            uploadRecords: [] as Array<{ source: string; target: string }>,
        };
    }
    const uploadRecords: Array<{ source: string; target: string }> = [];
    const nextNodeInfoList: Array<Record<string, any>> = [];
    for (const item of nodeInfoList) {
        const current = { ...item };
        const fieldValue = String(current.fieldValue || "").trim();
        if (fieldValue && isLocalFilePath(fieldValue)) {
            const filePath = toLocalFilePath(fieldValue);
            const exists = await window.$mapi.file.exists(filePath, {
                isDataPath: false,
            });
            if (!exists) {
                throw new Error(`本地素材不存在：${filePath}`);
            }
            const uploadRes: any = await callRunningHubHandle("runninghub:uploadFile", {
                apiBaseUrl,
                apiKey,
                filePath,
                fileType: "input",
                proxyUrl,
            });
            if (uploadRes?.code) {
                throw new Error(uploadRes?.msg || `素材上传失败：${filePath}`);
            }
            const target = String(uploadRes?.data?.fileName || "");
            if (!target) {
                throw new Error(`素材上传成功但未返回 fileName：${filePath}`);
            }
            current.fieldValue = target;
            uploadRecords.push({
                source: filePath,
                target,
            });
        }
        nextNodeInfoList.push(current);
    }
    return {
        nodeInfoList: nextNodeInfoList,
        uploadRecords,
    };
};

const createPreparedPayload = async (modelConfig: RunningHubModelConfigType) => {
    const connectorType = modelConfig.connectorType;
    const apiBaseUrl = normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL);
    if (!String(modelConfig.apiKey || "").trim()) {
        throw new Error("请输入 RunningHub API Key");
    }
    const nodeInfoList = parseJsonArray(modelConfig.nodeInfoListJson || "[]", "nodeInfoList");
    const requestBody = parseJsonObject(modelConfig.requestBodyJson || "{}", "请求体");
    if (connectorType === "ai-app" && !String(modelConfig.webappId || "").trim() && !String(modelConfig.submitPath || "").trim()) {
        throw new Error("AI 应用模式需要填写 WebApp ID 或提交路径");
    }
    if (connectorType === "workflow" && !String(modelConfig.workflowId || "").trim() && !String(modelConfig.workflowJson || "").trim()) {
        throw new Error("工作流模式需要填写 Workflow ID 或 Workflow JSON");
    }
    if ((connectorType === "model-api" || connectorType === "custom-api") && !String(modelConfig.submitPath || "").trim()) {
        throw new Error("标准模型 API 模式需要填写提交路径");
    }
    const uploaded = await maybeUploadNodeAssets(
        apiBaseUrl,
        modelConfig.apiKey,
        connectorType,
        modelConfig.proxyUrl || "",
        nodeInfoList
    );
    return {
        apiBaseUrl,
        requestBody,
        connectorType,
        nodeInfoList: uploaded.nodeInfoList,
        uploadRecords: uploaded.uploadRecords,
    };
};

const errorMessageOf = (e: any, fallback: string) => {
    return String(e?.message || e || fallback).trim() || fallback;
};

const isTransientQueryFailure = (res: any) => {
    const status = Number(res?._diagnostics?.httpStatus || res?.code || 0);
    return status === -1 || status === 408 || status === 425 || status === 429 || status >= 500;
};

const queryRetryDelayMs = (res: any) => {
    const retryAfter = String(res?._diagnostics?.retryAfter || "").trim();
    if (/^\d+(?:\.\d+)?$/.test(retryAfter)) {
        return Math.max(1000, Math.min(5 * 60 * 1000, Math.ceil(Number(retryAfter) * 1000)));
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
        return Math.max(1000, Math.min(5 * 60 * 1000, retryAt - Date.now()));
    }
    const status = Number(res?._diagnostics?.httpStatus || res?.code || 0);
    return status === 429 ? 10000 : 5000;
};

const safeJsonPreview = (value: any, maxLength = 1200) => {
    try {
        const text = JSON.stringify(value, (key, child) => {
            if (key === "apiKey") {
                return child ? "***" : "";
            }
            if (typeof child === "string" && child.length > 160) {
                return `${child.slice(0, 120)}...(length=${child.length})`;
            }
            return child;
        });
        return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    } catch (e) {
        return String(value || "");
    }
};

const responseMessageOf = (res: any, fallback: string) => {
    const message = String(
        res?.error?.message ||
            res?.errorMessage ||
            res?.msg ||
            res?.message ||
            fallback
    );
    const code = String(res?.code ?? res?.status ?? res?.error?.code ?? "").toUpperCase();
    const upper = message.toUpperCase();
    if (code === "401" || code === "403" || code.includes("AUTH") || upper.includes("UNAUTHORIZED") || upper.includes("TOKEN")) {
        return "云端鉴权失败或素材直链无法访问，请检查模型栏的平台接入 API Key、123 云盘直链域名/URL 鉴权配置，或重新导入管理员配置";
    }
    return message;
};

const parseNodeInfoMismatch = (res: any) => {
    const text = [
        res?.errorMessage,
        res?.msg,
        res?.message,
        res?.failedReason?.errorMessage,
    ].map(item => String(item || "")).join("\n");
    const match = /NODE_INFO_MISMATCH\(nodeId=([^,\s)]+),\s*fieldName=([^,\s)]+),\s*reason=([^)]+)\)/i.exec(text);
    if (!match) {
        return null;
    }
    return {
        nodeId: String(match[1] || "").trim(),
        fieldName: String(match[2] || "").trim(),
        reason: String(match[3] || "").trim(),
    };
};

const removeMismatchedNodeInfo = (nodeInfoList: Array<Record<string, any>>, mismatch: ReturnType<typeof parseNodeInfoMismatch>) => {
    if (!mismatch?.nodeId) {
        return nodeInfoList;
    }
    return nodeInfoList.filter(item => {
        const sameNode = String(item?.nodeId || "").trim() === mismatch.nodeId;
        const sameField = !mismatch.fieldName || String(item?.fieldName || "").trim() === mismatch.fieldName;
        return !(sameNode && sameField);
    });
};

const extractRemoteResultUrls = (remoteResults: any[]) => {
    return (Array.isArray(remoteResults) ? remoteResults : [])
        .map(item => String(item?.url || item?.fileUrl || "").trim())
        .filter(Boolean);
};

const remoteResultUrl = (item: any) => {
    return String(item?.url || item?.fileUrl || item?.file_url || item?.image_url || item?.imageUrl || item?.video_url || item?.videoUrl || "").trim();
};

const inferRemoteResultExt = (item: any) => {
    const url = remoteResultUrl(item);
    let urlPath = url;
    try {
        urlPath = new URL(url).pathname;
    } catch (e) {
        urlPath = url.split(/[?#]/)[0] || url;
    }
    const fromUrl = FileUtil.getExt(urlPath).replace(/[^a-z0-9]/gi, "");
    if (fromUrl) {
        return fromUrl;
    }
    const hint = [
        item?.outputType,
        item?.type,
        item?.mimeType,
        item?.contentType,
        item?.fileName,
        item?.filename,
        item?.name,
    ].map(value => String(value || "").toLowerCase()).join(" ");
    if (/(webp)/i.test(hint)) return "webp";
    if (/(gif)/i.test(hint)) return "gif";
    if (/(jpe?g)/i.test(hint)) return "jpg";
    if (/(image|图片|图像|png)/i.test(hint)) return "png";
    if (/(webm)/i.test(hint)) return "webm";
    if (/(mov)/i.test(hint)) return "mov";
    if (/(video|视频|mp4)/i.test(hint)) return "mp4";
    if (/(wav)/i.test(hint)) return "wav";
    if (/(audio|音频|mp3)/i.test(hint)) return "mp3";
    if (/(zip)/i.test(hint)) return "zip";
    return "";
};

const bytesFromBufferLike = (value: any) => {
    if (!value) {
        return new Uint8Array();
    }
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (Array.isArray(value)) {
        return new Uint8Array(value);
    }
    if (value?.buffer instanceof ArrayBuffer) {
        return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength || value.buffer.byteLength);
    }
    return new Uint8Array();
};

const isZipFile = async (file: string) => {
    try {
        const bytes = bytesFromBufferLike(await window.$mapi.file.readBuffer(file));
        return bytes[0] === 0x50 && bytes[1] === 0x4b;
    } catch (e) {
        return false;
    }
};

const isImageFilePath = (value: string) => {
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(String(value || ""));
};

const extractImageFromZipFile = async (zipFile: string, source = "runninghub-zip-output") => {
    const dest = await window.$mapi.file.tempDir(source);
    await window.$mapi.misc.unzip(zipFile, dest);
    const files = await window.$mapi.file.listAll(dest);
    const imageFile = files
        .filter(item => !item.isDirectory && isImageFilePath(String(item.path || item.name || "")))
        .sort((a, b) => {
            const aName = String(a.path || a.name || "");
            const bName = String(b.path || b.name || "");
            const score = (name: string) => {
                if (/(^|\/)(result|output|outputs|save|generated|image|000|001)/i.test(name)) return 0;
                if (/(^|\/)(input|source|upload|reference|mask|thumb|preview|cover)/i.test(name)) return 2;
                return 1;
            };
            return score(aName) - score(bName) || Number(b.size || 0) - Number(a.size || 0) || aName.localeCompare(bName);
        })[0];
    if (!imageFile) {
        return "";
    }
    return `${dest}/${String(imageFile.path || imageFile.name || "").replace(/^\/+/, "")}`;
};

const materializeRemoteResultFile = async (item: any) => {
    const fileUrl = remoteResultUrl(item);
    if (!fileUrl) {
        return null;
    }
    const ext = inferRemoteResultExt(item);
    const downloadPath = ext ? await window.$mapi.file.temp(ext, "download") : null;
    const downloaded = await window.$mapi.file.download(fileUrl, downloadPath);
    const extractedImage = await isZipFile(downloaded) ? await extractImageFromZipFile(downloaded) : "";
    const localFile = extractedImage || downloaded;
    const saved = await window.$mapi.file.hubSave(localFile);
    return {
        localFile: saved,
        result: {
            ...item,
            fileUrl: saved,
            url: saved,
            localFile: saved,
            outputType: extractedImage ? "image" : item?.outputType,
            source: extractedImage ? "zip-extracted-image" : item?.source,
            originalZipUrl: extractedImage ? fileUrl : item?.originalZipUrl,
        },
    };
};

const imageExtFromBase64 = (value: string) => {
    const mime = String(value || "").match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1]?.toLowerCase() || "";
    if (mime.includes("jpeg") || mime.includes("jpg")) {
        return "jpg";
    }
    if (mime.includes("webp")) {
        return "webp";
    }
    if (mime.includes("gif")) {
        return "gif";
    }
    return "png";
};

const base64ToBytes = (value: string) => {
    const raw = String(value || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").trim();
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const saveBase64ImageResult = async (value: string, index: number) => {
    const ext = imageExtFromBase64(value);
    const file = await window.$mapi.file.hubFile(ext, {
        returnFullPath: true,
        saveGroup: "image",
        savePathParam: {
            source: "gpt-image-2",
            index,
        },
    });
    await window.$mapi.file.writeBuffer(file, base64ToBytes(value));
    return file;
};

const materializeDirectApiResults = async (results: any[]) => {
    const localFiles: string[] = [];
    const normalizedResults: any[] = [];
    for (const [index, item] of (Array.isArray(results) ? results : []).entries()) {
        const base64Text = String(item?.text || item?.b64_json || item?.base64 || item?.image_base64 || "").trim();
        if (base64Text && String(item?.outputType || "").includes("base64")) {
            const localFile = await saveBase64ImageResult(base64Text, index);
            localFiles.push(localFile);
            normalizedResults.push({
                fileUrl: localFile,
                outputType: "image",
                localFile,
                source: "base64",
                detail: `base64 image saved locally, length=${base64Text.length}`,
            });
            continue;
        }
        normalizedResults.push(item);
    }
    return {
        results: normalizedResults,
        localFiles,
    };
};

const normalizeDirectApiResults = (res: any) => {
    const candidates = [
        res?.data,
        res?.data?.data,
        res?.result?.data,
        res?.data?.result?.data,
        res?.output,
        res?.outputs,
        res?.result?.output,
    ];
    for (const candidate of candidates) {
        const dataList = Array.isArray(candidate) ? candidate : [];
        const imageResults = dataList
            .map((item: any) => {
                const url = String(item?.url || item?.fileUrl || item?.image_url || item?.imageUrl || "").trim();
                const videoUrl = String(item?.video_url || item?.videoUrl || "").trim();
                const audioUrl = String(item?.audio_url || item?.audioUrl || "").trim();
                const b64 = String(item?.b64_json || item?.base64 || item?.image_base64 || "").trim();
                const type = String(item?.type || item?.outputType || item?.fileType || "").toLowerCase();
                if (videoUrl || (url && type.includes("video"))) {
                    const fileUrl = videoUrl || url;
                    return { url: fileUrl, fileUrl, outputType: "video" };
                }
                if (audioUrl || (url && type.includes("audio"))) {
                    const fileUrl = audioUrl || url;
                    return { url: fileUrl, fileUrl, outputType: "audio" };
                }
                if (url) {
                    const outputType = type.includes("image") ? "image" : "file";
                    return { url, fileUrl: url, outputType };
                }
                if (b64) {
                    return { text: b64, outputType: "image_base64", fileUrl: "" };
                }
                return null;
            })
            .filter(Boolean);
        if (imageResults.length > 0) {
            return imageResults;
        }
    }
    const content = res?.content || res?.data?.content || res?.result?.content || {};
    const results = [
        content?.video_url ? { url: content.video_url, fileUrl: content.video_url, outputType: "video" } : null,
        content?.image_url ? { url: content.image_url, fileUrl: content.image_url, outputType: "image" } : null,
        content?.audio_url ? { url: content.audio_url, fileUrl: content.audio_url, outputType: "audio" } : null,
    ].filter(Boolean);
    return results;
};

const pickDeepValue = (value: any, paths: string[]) => {
    for (const pathValue of paths) {
        const found = pathValue.split(".").reduce((current, key) => current?.[key], value);
        if (typeof found !== "undefined" && found !== null && String(found).trim()) {
            return found;
        }
    }
    return "";
};

const pickRecursiveTaskId = (value: any, depth = 0): string => {
    if (!value || depth > 5) {
        return "";
    }
    if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        return /^[A-Za-z0-9_-]{6,}$/.test(text) ? text : "";
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = pickRecursiveTaskId(item, depth + 1);
            if (found) {
                return found;
            }
        }
        return "";
    }
    if (typeof value !== "object") {
        return "";
    }
    const taskKeyPattern = /^(task[\s_-]*id|taskid|task[\s_-]*no|taskno|job[\s_-]*id|jobid|run[\s_-]*id|runid|request[\s_-]*id|requestid)$/i;
    for (const [key, child] of Object.entries(value)) {
        if (taskKeyPattern.test(key)) {
            const text = String(child || "").trim();
            if (text) {
                return text;
            }
        }
    }
    for (const key of ["data", "result", "task", "job", "run", "payload"]) {
        const found = pickRecursiveTaskId((value as any)[key], depth + 1);
        if (found) {
            return found;
        }
    }
    return "";
};

const extractDirectApiTaskId = (res: any) => {
    return String(
        pickDeepValue(res, [
            "data.taskId",
            "data.taskID",
            "data.task_id",
            "data.taskNo",
            "data.task_no",
            "data.jobId",
            "data.job_id",
            "data.runId",
            "data.run_id",
            "data.requestId",
            "data.request_id",
            "data.id",
            "data.task.id",
            "data.task.taskId",
            "data.task.taskID",
            "data.task.task_id",
            "data.task.taskNo",
            "data.task.task_no",
            "data.record.taskId",
            "data.record.task_id",
            "data.result.taskId",
            "data.result.task_id",
            "result.taskId",
            "result.task_id",
            "result.id",
            "taskId",
            "taskID",
            "task_id",
            "taskNo",
            "task_no",
            "jobId",
            "job_id",
            "runId",
            "run_id",
            "requestId",
            "request_id",
            "id",
        ]) ||
            pickRecursiveTaskId(res?.data) ||
            pickRecursiveTaskId(res?.result) ||
            pickRecursiveTaskId(res) ||
            ""
    );
};

const buildResultPayload = async (
    capability: string,
    files: string[],
    remoteResults: any[],
    saveAsVideoTemplate?: boolean,
    title?: string
) => {
    const remoteUrls = extractRemoteResultUrls(remoteResults);
    const firstLocalFile = files[0] || "";
    const result: any = {
        url: firstLocalFile || remoteUrls[0] || "",
        urls: files.length > 0 ? files : remoteUrls,
        localFiles: files,
        remoteUrls,
        remoteResults,
    };
    const ext = FileUtil.getExt(firstLocalFile);
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        result.image = firstLocalFile;
    }
    if (["mp3", "wav", "m4a", "flac"].includes(ext)) {
        result.audio = firstLocalFile;
    }
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
        result.video = firstLocalFile;
    }
    if (
        saveAsVideoTemplate &&
        firstLocalFile &&
        ["video", "lipsync", "digital-human"].includes(capability) &&
        ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)
    ) {
        const normalPath = await ffmpegVideoNormal(firstLocalFile, {
            durationMax: 120,
        });
        const videoInfo = await ffprobeVideoInfo(normalPath);
        const savedPath = await window.$mapi.file.hubSave(normalPath);
        let templateName = String(title || "RunningHub数字人").trim() || "RunningHub数字人";
        const exists = await VideoTemplateService.getByName(templateName);
        if (exists) {
            templateName = `${templateName}-${Date.now()}`;
        }
        await VideoTemplateService.insert({
            name: templateName,
            video: savedPath,
            info: videoInfo,
        });
        result.videoTemplate = savedPath;
        result.videoTemplateName = templateName;
    }
    return result;
};

export const RunningHubRunModelConfigUntilDone = async (
    modelConfig: RunningHubModelConfigType,
    option: {
        title?: string;
        timeoutMs?: number;
        queryIntervalMs?: number;
        onStatus?: (message: string) => void;
    } = {}
) => {
    const timeoutMs = option.timeoutMs || 10 * 60 * 1000;
    const queryIntervalMs = option.queryIntervalMs || 5000;
    const startedAt = Date.now();
    option.onStatus?.("准备 RunningHub 请求");
    const prepared = await createPreparedPayload(modelConfig);
    option.onStatus?.("提交 RunningHub 任务");
    const submitRes: any = await callRunningHubHandle("runninghub:runTask", {
        apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
        apiKey: modelConfig.apiKey,
        connectorType: modelConfig.connectorType,
        submitPath: modelConfig.submitPath,
        webappId: modelConfig.webappId,
        workflowId: modelConfig.workflowId,
        nodeInfoList: prepared.nodeInfoList || [],
        requestBody: prepared.requestBody || {},
        requestFormat: modelConfig.requestFormat || "json",
        directFileRelay: modelConfig.directFileRelay,
        webhookUrl: modelConfig.webhookUrl,
        instanceType: modelConfig.instanceType,
        accessPassword: modelConfig.accessPassword,
        addMetadata: modelConfig.addMetadata,
        retainSeconds: modelConfig.retainSeconds,
        usePersonalQueue: modelConfig.usePersonalQueue,
        workflow: modelConfig.workflowJson,
        proxyUrl: modelConfig.proxyUrl || "",
    });
    if (submitRes?.code) {
        throw new Error(responseMessageOf(submitRes, "任务提交失败"));
    }
    const syncResults = normalizeDirectApiResults(submitRes);
    if (syncResults.length > 0) {
        const materialized = await materializeDirectApiResults(syncResults);
        return await buildResultPayload(
            modelConfig.capability,
            materialized.localFiles,
            materialized.results,
            false,
            option.title
        );
    }
    const taskId = extractDirectApiTaskId(submitRes);
    if (!taskId) {
        throw new Error([
            responseMessageOf(submitRes, "RunningHub 未返回 taskId"),
            `返回摘要：${safeJsonPreview(submitRes, 600)}`,
        ].filter(Boolean).join("\n"));
    }
    while (Date.now() - startedAt < timeoutMs) {
        option.onStatus?.("等待 RunningHub 任务完成");
        await new Promise(resolve => setTimeout(resolve, queryIntervalMs));
        const queryRes: any = await callRunningHubHandle("runninghub:queryTask", {
            apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
            apiKey: modelConfig.apiKey,
            connectorType: modelConfig.connectorType,
            queryPath: modelConfig.queryPath,
            taskId,
            proxyUrl: modelConfig.proxyUrl || "",
        });
        if (queryRes?.code && !queryRes?.data?.status) {
            if (isTransientQueryFailure(queryRes)) {
                await new Promise(resolve => setTimeout(resolve, queryRetryDelayMs(queryRes)));
                continue;
            }
            throw new Error(queryRes?.msg || "RunningHub 状态查询失败");
        }
        const status = String(queryRes?.data?.status || "").toUpperCase();
        if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED" || status === "DONE" || status === "DELIVERED") {
            const materialized = await materializeDirectApiResults(queryRes?.data?.results || []);
            const localFiles: string[] = [...materialized.localFiles];
            for (const item of materialized.results || []) {
                const fileUrl = String(item?.url || item?.fileUrl || "").trim();
                if (!fileUrl || String(item?.localFile || "").trim()) {
                    continue;
                }
                try {
                    const downloaded = await window.$mapi.file.download(fileUrl);
                    localFiles.push(await window.$mapi.file.hubSave(downloaded));
                } catch (e) {
                }
            }
            return await buildResultPayload(
                modelConfig.capability,
                localFiles,
                materialized.results,
                false,
                option.title
            );
        }
        if (status === "FAILED" || status === "FAIL" || status === "ERROR" || status === "CANCELLED" || status === "CANCELED" || status === "STOPPED" || status === "REJECTED") {
            throw new Error(String(queryRes?.data?.errorMessage || queryRes?.msg || `RunningHub 任务失败: ${status}`));
        }
    }
    throw new Error("RunningHub 任务等待超时");
};

export const RunningHubTaskRun = async (data: {
    taskId?: string;
    title: string;
    modelConfig: RunningHubModelConfigType;
}) => {
    let taskId = data.taskId;
    if (!taskId) {
        const record: TaskRecord = {
            type: TaskType.System,
            biz: "RunningHubTask",
            title: data.title,
            serverName: "",
            serverTitle: "",
            serverVersion: "",
            modelConfig: data.modelConfig,
            param: {},
        };
        taskId = await TaskService.submit(record);
    }
    return taskId;
};

export const RunningHubTaskCleaner = async (task: TaskRecord) => {
    const files: string[] = [];
    const primaryUrl = String(task?.result?.url || "");
    const urls = Array.isArray(task?.result?.urls) ? task.result.urls : [];
    for (const item of urls) {
        if (!item || item === primaryUrl) {
            continue;
        }
        if (await window.$mapi.file.isHubFile(item)) {
            files.push(item);
        }
    }
    return { files };
};

export const RunningHubTask: TaskBiz = {
    runFunc: async (bizId) => {
        const record = await TaskService.get(bizId);
        if (!record) {
            throw new Error("任务不存在");
        }
        const modelConfig = record.modelConfig as RunningHubModelConfigType;
        const jobResult = (record.jobResult || {}) as RunningHubJobResultType;
        jobResult.step = jobResult.step || "Prepare";
        jobResult.Prepare = jobResult.Prepare || { status: "queue" };
        jobResult.UploadAssets = jobResult.UploadAssets || { status: "queue", records: [] };
        jobResult.Submit = jobResult.Submit || { status: "queue" };
        jobResult.Query = jobResult.Query || { status: "queue", results: [] };
        jobResult.End = jobResult.End || { status: "queue", localFiles: [] };

        if (jobResult.step === "Prepare") {
            try {
                jobResult.Prepare.status = "running";
                jobResult.Prepare.error = "";
                jobResult.UploadAssets.error = "";
                await TaskService.update(bizId, {
                    status: "running",
                    statusMsg: "",
                    jobResult,
                });
                const prepared = await createPreparedPayload(modelConfig);
                jobResult.Prepare.status = "success";
                jobResult.UploadAssets.records = prepared.uploadRecords;
                jobResult.UploadAssets.status = "success";
                jobResult.Submit.submittedBody = prepared.requestBody;
                jobResult.Submit.submittedNodeInfoList = prepared.nodeInfoList;
                jobResult.step = "Submit";
                await TaskService.update(bizId, { jobResult });
            } catch (e: any) {
                const msg = errorMessageOf(e, "任务预处理失败");
                jobResult.Prepare.status = "fail";
                jobResult.UploadAssets.status = "fail";
                jobResult.Prepare.error = msg;
                jobResult.UploadAssets.error = msg;
                await TaskService.update(bizId, {
                    status: "fail",
                    statusMsg: msg,
                    jobResult,
                });
                throw e;
            }
        }

        if (jobResult.step === "Submit") {
            try {
                jobResult.Submit.status = "running";
                jobResult.Submit.error = "";
                await TaskService.update(bizId, {
                    status: "running",
                    statusMsg: "",
                    jobResult,
                });
                let res: any = await callRunningHubHandle("runninghub:runTask", {
                    apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
                    apiKey: modelConfig.apiKey,
                    connectorType: modelConfig.connectorType,
                    submitPath: modelConfig.submitPath,
                    webappId: modelConfig.webappId,
                    workflowId: modelConfig.workflowId,
                    nodeInfoList: jobResult.Submit.submittedNodeInfoList || [],
                    requestBody: jobResult.Submit.submittedBody || {},
                    requestFormat: modelConfig.requestFormat || "json",
                    directFileRelay: modelConfig.directFileRelay,
                    webhookUrl: modelConfig.webhookUrl,
                    instanceType: modelConfig.instanceType,
                    accessPassword: modelConfig.accessPassword,
                    addMetadata: modelConfig.addMetadata,
                    retainSeconds: modelConfig.retainSeconds,
                    usePersonalQueue: modelConfig.usePersonalQueue,
                    workflow: modelConfig.workflowJson,
                    proxyUrl: modelConfig.proxyUrl || "",
                });
                const mismatch = parseNodeInfoMismatch(res);
                if (mismatch) {
                    const cleanedNodeInfoList = removeMismatchedNodeInfo(jobResult.Submit.submittedNodeInfoList || [], mismatch);
                    if (cleanedNodeInfoList.length < (jobResult.Submit.submittedNodeInfoList || []).length) {
                        jobResult.Submit.submittedNodeInfoList = cleanedNodeInfoList;
                        jobResult.Submit.error = `已跳过 RunningHub 已不存在的节点 nodeId=${mismatch.nodeId}, fieldName=${mismatch.fieldName} 并自动重试`;
                        await TaskService.update(bizId, { jobResult });
                        res = await callRunningHubHandle("runninghub:runTask", {
                            apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
                            apiKey: modelConfig.apiKey,
                            connectorType: modelConfig.connectorType,
                            submitPath: modelConfig.submitPath,
                            webappId: modelConfig.webappId,
                            workflowId: modelConfig.workflowId,
                            nodeInfoList: cleanedNodeInfoList,
                            requestBody: jobResult.Submit.submittedBody || {},
                            requestFormat: modelConfig.requestFormat || "json",
                            directFileRelay: modelConfig.directFileRelay,
                            webhookUrl: modelConfig.webhookUrl,
                            instanceType: modelConfig.instanceType,
                            accessPassword: modelConfig.accessPassword,
                            addMetadata: modelConfig.addMetadata,
                            retainSeconds: modelConfig.retainSeconds,
                            usePersonalQueue: modelConfig.usePersonalQueue,
                            workflow: modelConfig.workflowJson,
                            proxyUrl: modelConfig.proxyUrl || "",
                        });
                    }
                }
                jobResult.Submit.requestUrl = String(res?._diagnostics?.requestUrl || "");
                jobResult.Submit.responseDiagnostics = res?._diagnostics || {};
                jobResult.Submit.responsePreview = safeJsonPreview(res);
                if (res?.code) {
                    throw new Error(responseMessageOf(res, "任务提交失败"));
                }
                const taskId = extractDirectApiTaskId(res);
                const syncResults = normalizeDirectApiResults(res);
                if (!taskId && syncResults.length > 0) {
                    const materialized = await materializeDirectApiResults(syncResults);
                    jobResult.Submit.status = "success";
                    jobResult.Query.status = "success";
                    jobResult.Query.taskStatus = "SUCCESS";
                    jobResult.Query.results = materialized.results as any;
                    jobResult.Query.usage = res?.usage || res?.data?.usage || {};
                    jobResult.End.status = "success";
                    jobResult.End.localFiles = materialized.localFiles;
                    jobResult.step = "End";
                    await TaskService.update(bizId, {
                        status: "success",
                        statusMsg: "",
                        jobResult,
                    });
                    return "success";
                }
                if (modelConfig.connectorType === "custom-api" && !taskId) {
                    const msg = responseMessageOf(
                        res,
                        "Direct API 已返回，但没有可识别的产出结果"
                    );
                    throw new Error(msg);
                }
                if (!taskId) {
                    throw new Error([
                        responseMessageOf(res, "RunningHub 未返回 taskId"),
                        `返回摘要：${safeJsonPreview(res, 600)}`,
                    ].filter(Boolean).join("\n"));
                }
                jobResult.Submit.status = "success";
                jobResult.Submit.taskId = taskId;
                jobResult.Submit.clientId = String(res?.data?.clientId || res?.clientId || "");
                jobResult.Query.status = "running";
                jobResult.step = "Query";
                await TaskService.update(bizId, { jobResult });
                return "querying";
            } catch (e: any) {
                const msg = errorMessageOf(e, "任务提交失败");
                jobResult.Submit.status = "fail";
                jobResult.Submit.error = msg;
                await TaskService.update(bizId, {
                    status: "fail",
                    statusMsg: msg,
                    jobResult,
                });
                throw e;
            }
        }

        if (jobResult.step === "Query") {
            return "querying";
        }

        if (jobResult.step === "End") {
            return "success";
        }

        throw new Error(`未知任务步骤: ${jobResult.step}`);
    },
    queryFunc: async (bizId) => {
        const record = await TaskService.get(bizId);
        if (!record) {
            throw new Error("任务不存在");
        }
        const modelConfig = record.modelConfig as RunningHubModelConfigType;
        const jobResult = (record.jobResult || {}) as RunningHubJobResultType;
        const taskId = String(jobResult?.Submit?.taskId || "");
        if (!taskId) {
            throw new Error("缺少 RunningHub taskId");
        }
        const retryAfterAt = Number((jobResult.Query as any)?.retryAfterAt || 0);
        if (retryAfterAt > Date.now()) {
            return "running";
        }
        delete (jobResult.Query as any).retryAfterAt;
        const res: any = await callRunningHubHandle("runninghub:queryTask", {
            apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
            apiKey: modelConfig.apiKey,
            connectorType: modelConfig.connectorType,
            queryPath: modelConfig.queryPath,
            taskId,
            proxyUrl: modelConfig.proxyUrl || "",
        });
        if (res?.code && !res?.data?.status) {
            if (isTransientQueryFailure(res)) {
                jobResult.Query.status = "running";
                (jobResult.Query as any).retryAfterAt = Date.now() + queryRetryDelayMs(res);
                await TaskService.update(bizId, {
                    status: "running",
                    statusMsg: "平台暂时繁忙，正在自动重试",
                    jobResult,
                });
                return "running";
            }
            jobResult.Query.status = "fail";
            jobResult.Query.error = res?.msg || "任务状态查询失败";
            await TaskService.update(bizId, { jobResult });
            throw new Error(jobResult.Query.error);
        }
        const status = String(res?.data?.status || "").toUpperCase();
        jobResult.Query.status = "running";
        delete (jobResult.Query as any).retryAfterAt;
        jobResult.Query.taskStatus = status;
        jobResult.Query.results = Array.isArray(res?.data?.results) ? res.data.results : [];
        jobResult.Query.usage = res?.data?.usage || {};
        jobResult.Query.promptTips = res?.data?.promptTips || "";
        if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED" || status === "DONE" || status === "DELIVERED") {
            const localFiles: string[] = [];
            const downloadErrors: string[] = [];
            const materialized = await materializeDirectApiResults(jobResult.Query.results || []);
            jobResult.Query.results = materialized.results;
            localFiles.push(...materialized.localFiles);
            const normalizedRemoteResults: any[] = [];
            for (const item of jobResult.Query.results || []) {
                const fileUrl = remoteResultUrl(item);
                if (!fileUrl) {
                    normalizedRemoteResults.push(item);
                    continue;
                }
                if (String(item?.localFile || "").trim() && fileUrl === item.localFile) {
                    normalizedRemoteResults.push(item);
                    continue;
                }
                try {
                    const materializedFile = await materializeRemoteResultFile(item);
                    if (materializedFile?.localFile) {
                        localFiles.push(materializedFile.localFile);
                        normalizedRemoteResults.push(materializedFile.result);
                    } else {
                        normalizedRemoteResults.push(item);
                    }
                } catch (e: any) {
                    normalizedRemoteResults.push(item);
                    downloadErrors.push(errorMessageOf(e, `结果下载失败: ${fileUrl}`));
                }
            }
            jobResult.Query.results = normalizedRemoteResults;
            jobResult.Query.status = "success";
            jobResult.End.status = "success";
            jobResult.End.error = downloadErrors.join("\n");
            jobResult.End.localFiles = localFiles;
            jobResult.step = "End";
            await TaskService.update(bizId, {
                status: "success",
                statusMsg: downloadErrors.length > 0 ? "任务已成功，远端结果可用，但自动保存到本地失败；可先预览远端结果或点击下载重试" : "",
                jobResult,
            });
            return "success";
        }
        if (status === "FAILED" || status === "FAIL" || status === "ERROR" || status === "CANCELLED" || status === "CANCELED" || status === "STOPPED" || status === "REJECTED") {
            const detailParts = [
                res?.data?.errorMessage || res?.msg || `RunningHub 任务失败: ${status}`,
                res?.data?.failedReason && Object.keys(res.data.failedReason || {}).length
                    ? `failedReason: ${safeJsonPreview(res.data.failedReason, 800)}`
                    : "",
                res?.data?.promptTips ? `promptTips: ${res.data.promptTips}` : "",
                res?.data?.errorCode ? `errorCode: ${res.data.errorCode}` : "",
            ].filter(Boolean);
            const msg = detailParts.join("\n");
            jobResult.Query.status = "fail";
            jobResult.Query.error = msg;
            await TaskService.update(bizId, { jobResult });
            throw new Error(msg);
        }
        await TaskService.update(bizId, { statusMsg: "", jobResult });
        return "running";
    },
    successFunc: async (bizId) => {
        const record = await TaskService.get(bizId);
        if (!record) {
            return;
        }
        const modelConfig = record.modelConfig as RunningHubModelConfigType;
        const jobResult = (record.jobResult || {}) as RunningHubJobResultType;
        const localFiles = Array.isArray(jobResult?.End?.localFiles) ? jobResult.End.localFiles : [];
        const remoteResults = Array.isArray(jobResult?.Query?.results) ? jobResult.Query.results : [];
        const result = await buildResultPayload(
            modelConfig.capability,
            localFiles,
            remoteResults,
            !!modelConfig.saveAsVideoTemplate,
            record.title
        );
        await TaskService.update(bizId, {
            status: "success",
            endTime: Date.now(),
            result,
        });
    },
    failFunc: async (bizId, msg) => {
        await TaskService.update(bizId, {
            status: "fail",
            statusMsg: msg,
            endTime: Date.now(),
        });
    },
    requestCancelFunc: async (bizId) => {
        const record = await TaskService.get(bizId);
        if (!record) {
            return;
        }
        const modelConfig = record.modelConfig as RunningHubModelConfigType;
        const jobResult = (record.jobResult || {}) as RunningHubJobResultType;
        const taskId = String(jobResult?.Submit?.taskId || "");
        if (!taskId) {
            return;
        }
        await callRunningHubHandle("runninghub:cancelTask", {
            apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
            apiKey: modelConfig.apiKey,
            connectorType: modelConfig.connectorType,
            cancelPath: modelConfig.cancelPath,
            taskId,
            proxyUrl: modelConfig.proxyUrl || "",
        });
    },
};

export const DirectApiTask = RunningHubTask;
export const DirectApiTaskCleaner = RunningHubTaskCleaner;
