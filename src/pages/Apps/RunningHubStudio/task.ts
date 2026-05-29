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
    if (connectorType === "model-api" && !String(modelConfig.submitPath || "").trim()) {
        throw new Error("标准模型 API 模式需要填写提交路径");
    }
    const uploaded = await maybeUploadNodeAssets(
        apiBaseUrl,
        modelConfig.apiKey,
        connectorType,
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

const extractRemoteResultUrls = (remoteResults: any[]) => {
    return (Array.isArray(remoteResults) ? remoteResults : [])
        .map(item => String(item?.url || item?.fileUrl || "").trim())
        .filter(Boolean);
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
                const res: any = await callRunningHubHandle("runninghub:runTask", {
                    apiBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || DEFAULT_BASE_URL),
                    apiKey: modelConfig.apiKey,
                    connectorType: modelConfig.connectorType,
                    submitPath: modelConfig.submitPath,
                    webappId: modelConfig.webappId,
                    workflowId: modelConfig.workflowId,
                    nodeInfoList: jobResult.Submit.submittedNodeInfoList || [],
                    requestBody: jobResult.Submit.submittedBody || {},
                    webhookUrl: modelConfig.webhookUrl,
                    instanceType: modelConfig.instanceType,
                    accessPassword: modelConfig.accessPassword,
                    addMetadata: modelConfig.addMetadata,
                    retainSeconds: modelConfig.retainSeconds,
                    usePersonalQueue: modelConfig.usePersonalQueue,
                    workflow: modelConfig.workflowJson,
                });
                if (res?.code) {
                    throw new Error(res?.msg || "RunningHub 任务提交失败");
                }
                const taskId = String(res?.data?.taskId || res?.taskId || "");
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
        });
        if (res?.code && !res?.data?.status) {
            jobResult.Query.status = "fail";
            jobResult.Query.error = String(res?.msg || "RunningHub 状态查询失败");
            await TaskService.update(bizId, { jobResult });
            throw new Error(res?.msg || "RunningHub 状态查询失败");
        }
        const status = String(res?.data?.status || "").toUpperCase();
        jobResult.Query.status = "running";
        jobResult.Query.taskStatus = status;
        jobResult.Query.results = Array.isArray(res?.data?.results) ? res.data.results : [];
        jobResult.Query.usage = res?.data?.usage || {};
        jobResult.Query.promptTips = res?.data?.promptTips || "";
        await TaskService.update(bizId, { jobResult });
        if (status === "SUCCESS") {
            const localFiles: string[] = [];
            const downloadErrors: string[] = [];
            for (const item of jobResult.Query.results || []) {
                const fileUrl = String(item?.url || item?.fileUrl || "").trim();
                if (!fileUrl) {
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
            const msg = String(res?.data?.errorMessage || res?.msg || `RunningHub 任务失败: ${status}`);
            jobResult.Query.status = "fail";
            jobResult.Query.error = msg;
            await TaskService.update(bizId, { jobResult });
            throw new Error(msg);
        }
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
        });
    },
};
