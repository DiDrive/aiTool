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
    return String(
        res?.error?.message ||
            res?.errorMessage ||
            res?.msg ||
            res?.message ||
            fallback
    );
};

const extractRemoteResultUrls = (remoteResults: any[]) => {
    return (Array.isArray(remoteResults) ? remoteResults : [])
        .map(item => String(item?.url || item?.fileUrl || "").trim())
        .filter(Boolean);
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

const extractDirectApiTaskId = (res: any) => {
    return String(
        pickDeepValue(res, [
            "data.taskId",
            "data.task_id",
            "data.id",
            "data.task.id",
            "data.task.taskId",
            "data.task.task_id",
            "taskId",
            "task_id",
            "id",
        ]) || ""
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
        const requestUrl = String(submitRes?._diagnostics?.requestUrl || "").trim();
        throw new Error([responseMessageOf(submitRes, "任务提交失败"), requestUrl ? `Request URL: ${requestUrl}` : ""].filter(Boolean).join("\n"));
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
        throw new Error("RunningHub 未返回 taskId");
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
            throw new Error(queryRes?.msg || "RunningHub 状态查询失败");
        }
        const status = String(queryRes?.data?.status || "").toUpperCase();
        if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") {
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
                jobResult.Submit.requestUrl = String(res?._diagnostics?.requestUrl || "");
                jobResult.Submit.responseDiagnostics = res?._diagnostics || {};
                jobResult.Submit.responsePreview = safeJsonPreview(res);
                if (res?.code) {
                    const requestUrl = String(res?._diagnostics?.requestUrl || "").trim();
                    throw new Error([responseMessageOf(res, "任务提交失败"), requestUrl ? `Request URL: ${requestUrl}` : ""].filter(Boolean).join("\n"));
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
                        `Direct API 已返回，但没有可识别的产出结果。URL: ${jobResult.Submit.requestUrl || "-"}`
                    );
                    throw new Error(msg);
                }
                if (!taskId) {
                    throw new Error("RunningHub 未返回 taskId");
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
        const res: any = await callRunningHubHandle("runninghub:queryTask", {
            apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
            apiKey: modelConfig.apiKey,
            connectorType: modelConfig.connectorType,
            queryPath: modelConfig.queryPath,
            taskId,
            proxyUrl: modelConfig.proxyUrl || "",
        });
        if (res?.code && !res?.data?.status) {
            const requestUrl = String(res?._diagnostics?.requestUrl || "").trim();
            jobResult.Query.status = "fail";
            jobResult.Query.error = [res?.msg || "RunningHub 状态查询失败", requestUrl ? `Request URL: ${requestUrl}` : ""].filter(Boolean).join("\n");
            await TaskService.update(bizId, { jobResult });
            throw new Error(jobResult.Query.error);
        }
        const status = String(res?.data?.status || "").toUpperCase();
        jobResult.Query.status = "running";
        jobResult.Query.taskStatus = status;
        jobResult.Query.results = Array.isArray(res?.data?.results) ? res.data.results : [];
        jobResult.Query.usage = res?.data?.usage || {};
        jobResult.Query.promptTips = res?.data?.promptTips || "";
        if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") {
            const localFiles: string[] = [];
            const downloadErrors: string[] = [];
            const materialized = await materializeDirectApiResults(jobResult.Query.results || []);
            jobResult.Query.results = materialized.results;
            localFiles.push(...materialized.localFiles);
            for (const item of jobResult.Query.results || []) {
                const fileUrl = String(item?.url || item?.fileUrl || "").trim();
                if (!fileUrl) {
                    continue;
                }
                if (String(item?.localFile || "").trim() && fileUrl === item.localFile) {
                    continue;
                }
                try {
                    const downloaded = await window.$mapi.file.download(fileUrl);
                    localFiles.push(await window.$mapi.file.hubSave(downloaded));
                } catch (e: any) {
                    downloadErrors.push(errorMessageOf(e, `结果下载失败: ${fileUrl}`));
                }
            }
            jobResult.Query.status = "success";
            jobResult.End.status = "success";
            jobResult.End.error = downloadErrors.join("\n");
            jobResult.End.localFiles = localFiles;
            jobResult.step = "End";
            await TaskService.update(bizId, {
                status: "success",
                statusMsg: downloadErrors.length > 0 ? "任务已成功，部分产出物下载失败，可先使用远端结果" : "",
                jobResult,
            });
            return "success";
        }
        if (status === "FAILED" || status === "CANCELLED" || status === "STOPPED") {
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
        await TaskService.update(bizId, { jobResult });
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
