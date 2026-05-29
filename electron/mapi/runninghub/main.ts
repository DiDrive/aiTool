import { ipcMain } from "electron";
import path from "node:path";
import { readFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "https://www.runninghub.cn";

const normalizeApiBaseUrl = (url?: string) => {
    return String(url || DEFAULT_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
};

const normalizeApiPath = (apiPath?: string, fallbackPath = "") => {
    const value = String(apiPath || "").trim();
    if (!value) {
        return fallbackPath.replace(/^\/+/, "");
    }
    return value.replace(/^\/+/, "");
};

const normalizeStatus = (status: any) => {
    return String(status || "").trim().toUpperCase();
};

const requestJson = async (
    apiBaseUrl: string,
    apiPath: string,
    body: Record<string, any>,
    apiKey?: string,
    timeoutMs = 30000
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl}/${apiPath.replace(/^\/+/, "")}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify(body || {}),
            signal: controller.signal,
        });
        const text = await res.text();
        let json: any = {};
        try {
            json = text ? JSON.parse(text) : {};
        } catch (e) {
            json = {
                code: res.ok ? 0 : res.status,
                msg: text || `HTTP ${res.status}`,
                data: {},
            };
        }
        if (typeof json !== "object" || !json) {
            json = {};
        }
        if (typeof json.code === "undefined" && typeof json.status === "undefined") {
            json.code = res.ok ? 0 : res.status;
        }
        if (typeof json.msg === "undefined" && typeof json.errorMessage === "undefined") {
            json.msg = res.ok ? "" : `HTTP ${res.status}`;
        }
        return json;
    } finally {
        clearTimeout(timeout);
    }
};

const uploadFile = async (
    apiBaseUrl: string,
    apiKey: string,
    filePath: string,
    fileType = "input"
) => {
    const buffer = await readFile(filePath);
    const form = new FormData();
    form.append("apiKey", apiKey || "");
    form.append("fileType", fileType || "input");
    form.append("file", new Blob([buffer]), path.basename(filePath));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        const res = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}/task/openapi/upload`, {
            method: "POST",
            headers: {
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: form,
            signal: controller.signal,
        });
        const text = await res.text();
        try {
            return text ? JSON.parse(text) : {};
        } catch (e) {
            return {
                code: res.ok ? 0 : res.status,
                msg: text || `HTTP ${res.status}`,
                data: {},
            };
        }
    } finally {
        clearTimeout(timeout);
    }
};

const normalizeResults = (value: any) => {
    if (Array.isArray(value)) {
        return value.filter(item => item && (item.url || item.fileUrl || item.text));
    }
    if (value && typeof value === "object") {
        if (value.fileUrl || value.url || value.text) {
            return [value];
        }
    }
    return [];
};

ipcMain.handle("runninghub:uploadFile", async (event, options: {
    apiBaseUrl?: string;
    apiKey: string;
    filePath: string;
    fileType?: string;
}) => {
    return await uploadFile(
        options.apiBaseUrl || DEFAULT_BASE_URL,
        options.apiKey || "",
        options.filePath,
        options.fileType || "input"
    );
});

ipcMain.handle("runninghub:runTask", async (event, options: {
    apiBaseUrl?: string;
    apiKey: string;
    connectorType: "ai-app" | "workflow" | "model-api";
    submitPath?: string;
    webappId?: string | number;
    workflowId?: string;
    nodeInfoList?: Array<Record<string, any>>;
    requestBody?: Record<string, any>;
    webhookUrl?: string;
    instanceType?: string;
    accessPassword?: string;
    addMetadata?: boolean;
    retainSeconds?: number | null;
    usePersonalQueue?: boolean;
    workflow?: string;
}) => {
    const connectorType = String(options.connectorType || "").trim();
    if (connectorType === "ai-app") {
        if (String(options.submitPath || "").trim()) {
            return await requestJson(
                options.apiBaseUrl || DEFAULT_BASE_URL,
                normalizeApiPath(options.submitPath, ""),
                {
                    nodeInfoList: Array.isArray(options.nodeInfoList) ? options.nodeInfoList : [],
                    webhookUrl: options.webhookUrl || undefined,
                    instanceType: options.instanceType || undefined,
                    accessPassword: options.accessPassword || undefined,
                    usePersonalQueue: typeof options.usePersonalQueue === "boolean" ? options.usePersonalQueue : undefined,
                },
                options.apiKey
            );
        }
        return await requestJson(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            "task/openapi/ai-app/run",
            {
                apiKey: options.apiKey || "",
                webappId: options.webappId || "",
                nodeInfoList: Array.isArray(options.nodeInfoList) ? options.nodeInfoList : [],
                webhookUrl: options.webhookUrl || undefined,
                instanceType: options.instanceType || undefined,
                accessPassword: options.accessPassword || undefined,
            },
            options.apiKey
        );
    }
    if (connectorType === "workflow") {
        return await requestJson(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            "task/openapi/create",
            {
                apiKey: options.apiKey || "",
                workflowId: options.workflowId || undefined,
                nodeInfoList: Array.isArray(options.nodeInfoList) && options.nodeInfoList.length ? options.nodeInfoList : undefined,
                addMetadata: typeof options.addMetadata === "boolean" ? options.addMetadata : undefined,
                webhookUrl: options.webhookUrl || undefined,
                workflow: options.workflow || undefined,
                instanceType: options.instanceType || undefined,
                usePersonalQueue: typeof options.usePersonalQueue === "boolean" ? options.usePersonalQueue : undefined,
                retainSeconds: typeof options.retainSeconds === "number" ? options.retainSeconds : undefined,
                accessPassword: options.accessPassword || undefined,
            },
            options.apiKey
        );
    }
    return await requestJson(
        options.apiBaseUrl || DEFAULT_BASE_URL,
        normalizeApiPath(options.submitPath, ""),
        options.requestBody || {},
        options.apiKey
    );
});

ipcMain.handle("runninghub:queryTask", async (event, options: {
    apiBaseUrl?: string;
    apiKey: string;
    connectorType: "ai-app" | "workflow" | "model-api";
    queryPath?: string;
    taskId: string;
}) => {
    const baseUrl = options.apiBaseUrl || DEFAULT_BASE_URL;
    const queryPath = normalizeApiPath(options.queryPath, "openapi/v2/query");
    const directResult = await requestJson(
        baseUrl,
        queryPath,
        {
            taskId: options.taskId,
        },
        options.apiKey
    );
    if (typeof directResult?.status !== "undefined" || Array.isArray(directResult?.results) || directResult?.taskId) {
        return {
            code: directResult?.status === "FAILED" ? 500 : 0,
            msg: directResult?.errorMessage || directResult?.msg || "",
            data: {
                taskId: directResult?.taskId || options.taskId,
                status: normalizeStatus(directResult?.status),
                rawStatus: directResult?.status || "",
                results: normalizeResults(directResult?.results),
                clientId: directResult?.clientId || "",
                promptTips: directResult?.promptTips || "",
                usage: directResult?.usage || {},
                errorCode: directResult?.errorCode || "",
                errorMessage: directResult?.errorMessage || directResult?.msg || "",
                failedReason: directResult?.failedReason || {},
            },
        };
    }
    const statusResult = await requestJson(
        baseUrl,
        "task/openapi/status",
        {
            apiKey: options.apiKey || "",
            taskId: options.taskId,
        },
        options.apiKey
    );
    const outputsResult = await requestJson(
        baseUrl,
        "task/openapi/outputs",
        {
            apiKey: options.apiKey || "",
            taskId: options.taskId,
        },
        options.apiKey
    );
    return {
        code: statusResult?.code === 0 || statusResult?.code === 804 ? 0 : (statusResult?.code || outputsResult?.code || 500),
        msg: statusResult?.msg || outputsResult?.msg || "",
        data: {
            taskId: options.taskId,
            status: normalizeStatus(statusResult?.data || ""),
            rawStatus: statusResult?.data || "",
            results: normalizeResults(outputsResult?.data).map((item: any) => ({
                url: item?.fileUrl || item?.url || "",
                outputType: item?.fileType || item?.outputType || "",
                text: item?.text || null,
                fileUrl: item?.fileUrl || "",
            })),
            clientId: "",
            promptTips: "",
            usage: {},
            errorCode: "",
            errorMessage: statusResult?.msg || outputsResult?.msg || "",
            failedReason: {},
        },
    };
});

ipcMain.handle("runninghub:cancelTask", async (event, options: {
    apiBaseUrl?: string;
    apiKey: string;
    connectorType: "ai-app" | "workflow" | "model-api";
    cancelPath?: string;
    taskId: string;
}) => {
    if (options.connectorType === "workflow") {
        return await requestJson(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            "task/openapi/cancel",
            {
                apiKey: options.apiKey || "",
                taskId: options.taskId,
            },
            options.apiKey
        );
    }
    if (options.cancelPath) {
        return await requestJson(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            options.cancelPath,
            {
                taskId: options.taskId,
            },
            options.apiKey
        );
    }
    return {
        code: 415,
        msg: "RUNNINGHUB_CANCEL_UNSUPPORTED",
        data: {},
    };
});

export default {
};
