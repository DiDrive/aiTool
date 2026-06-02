import { ipcMain } from "electron";
import path from "node:path";
import { readFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "https://www.runninghub.cn";
const DEFAULT_DIRECT_API_TIMEOUT_MS = 300000;

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

const buildApiUrl = (apiBaseUrl: string, apiPath: string) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    let pathValue = apiPath.replace(/^\/+/, "");
    if (/\/v1$/i.test(baseUrl) && /^v1\//i.test(pathValue)) {
        pathValue = pathValue.replace(/^v1\//i, "");
    }
    return `${baseUrl}/${pathValue}`;
};

const responseMessageOf = (json: any, fallback: string) => {
    return String(
        json?.error?.message ||
            json?.errorMessage ||
            json?.msg ||
            json?.message ||
            fallback ||
            ""
    );
};

const attachDiagnostics = (json: any, diagnostics: Record<string, any>) => {
    const result = json && typeof json === "object" ? json : {};
    result._diagnostics = {
        ...(result._diagnostics || {}),
        ...diagnostics,
    };
    return result;
};

const normalizeStatus = (status: any) => {
    return String(status || "").trim().toUpperCase();
};

const requestJson = async (
    apiBaseUrl: string,
    apiPath: string,
    body: Record<string, any>,
    apiKey?: string,
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const requestUrl = buildApiUrl(baseUrl, apiPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const requestBody = await normalizeJsonBodyLocalFiles(body || {});
        const res = await fetch(requestUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify(requestBody),
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
            json.msg = responseMessageOf(json, res.ok ? "" : `HTTP ${res.status}`);
        }
        return attachDiagnostics(json, {
            requestUrl,
            method: "POST",
            requestFormat: "json",
            httpStatus: res.status,
            ok: res.ok,
        });
    } catch (e: any) {
        return attachDiagnostics(
            {
                code: -1,
                msg: String(e?.message || e || "请求发送失败"),
                data: {},
            },
            {
                requestUrl,
                method: "POST",
                requestFormat: "json",
                error: String(e?.stack || e?.message || e || ""),
            }
        );
    } finally {
        clearTimeout(timeout);
    }
};

const isLocalFilePath = (value: string) => {
    const raw = String(value || "").trim();
    return /^file:\/\//i.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw);
};

const isImageOrAudioFile = (filePath: string) => {
    return /(\.png|\.jpe?g|\.webp|\.gif|\.bmp|\.tiff?|\.wav|\.mp3)$/i.test(filePath);
};

const toLocalFilePath = (value: string) => {
    return String(value || "").trim().replace(/^file:\/\//i, "");
};

const mimeFromFile = (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
    const map: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        bmp: "image/bmp",
        tiff: "image/tiff",
        tif: "image/tiff",
        mp4: "video/mp4",
        mov: "video/quicktime",
        wav: "audio/wav",
        mp3: "audio/mpeg",
    };
    return map[ext] || "application/octet-stream";
};

const localFileToDataUrl = async (value: string) => {
    const filePath = toLocalFilePath(value);
    const buffer = await readFile(filePath);
    return `data:${mimeFromFile(filePath)};base64,${buffer.toString("base64")}`;
};

const normalizeJsonBodyLocalFiles = async (value: any): Promise<any> => {
    if (Array.isArray(value)) {
        return await Promise.all(value.map(item => normalizeJsonBodyLocalFiles(item)));
    }
    if (value && typeof value === "object") {
        const result: Record<string, any> = {};
        for (const [key, child] of Object.entries(value)) {
            result[key] = await normalizeJsonBodyLocalFiles(child);
        }
        return result;
    }
    if (typeof value === "string" && isLocalFilePath(value) && isImageOrAudioFile(value)) {
        return await localFileToDataUrl(value);
    }
    return value;
};

const maybeJsonArray = (value: any) => {
    if (!Array.isArray(value) && typeof value === "string" && /^\s*\[/.test(value)) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
        } catch (e) {
            return [value];
        }
    }
    return Array.isArray(value) ? value : [value];
};

const appendFormValue = async (form: FormData, key: string, value: any) => {
    if (value === null || typeof value === "undefined" || value === "") {
        return;
    }
    for (const item of maybeJsonArray(value)) {
        if (item === null || typeof item === "undefined" || item === "") {
            continue;
        }
        if (typeof item === "string" && isLocalFilePath(item)) {
            const filePath = toLocalFilePath(item);
            const buffer = await readFile(filePath);
            form.append(key, new Blob([buffer], { type: mimeFromFile(filePath) }), path.basename(filePath));
            continue;
        }
        if (typeof item === "object") {
            form.append(key, JSON.stringify(item));
            continue;
        }
        form.append(key, String(item));
    }
};

const requestFormData = async (
    apiBaseUrl: string,
    apiPath: string,
    body: Record<string, any>,
    apiKey?: string,
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const requestUrl = buildApiUrl(baseUrl, apiPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const form = new FormData();
        for (const [key, value] of Object.entries(body || {})) {
            await appendFormValue(form, key, value);
        }
        const res = await fetch(requestUrl, {
            method: "POST",
            headers: {
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: form,
            signal: controller.signal,
        });
        const text = await res.text();
        try {
            const json = text ? JSON.parse(text) : {};
            if (typeof json.code === "undefined" && typeof json.status === "undefined") {
                json.code = res.ok ? 0 : res.status;
            }
            if (typeof json.msg === "undefined" && typeof json.errorMessage === "undefined") {
                json.msg = responseMessageOf(json, res.ok ? "" : `HTTP ${res.status}`);
            }
            return attachDiagnostics(json, {
                requestUrl,
                method: "POST",
                requestFormat: "form-data",
                httpStatus: res.status,
                ok: res.ok,
            });
        } catch (e) {
            return attachDiagnostics(
                {
                    code: res.ok ? 0 : res.status,
                    msg: text || `HTTP ${res.status}`,
                    data: {},
                },
                {
                    requestUrl,
                    method: "POST",
                    requestFormat: "form-data",
                    httpStatus: res.status,
                    ok: res.ok,
                }
            );
        }
    } catch (e: any) {
        return attachDiagnostics(
            {
                code: -1,
                msg: String(e?.message || e || "请求发送失败"),
                data: {},
            },
            {
                requestUrl,
                method: "POST",
                requestFormat: "form-data",
                error: String(e?.stack || e?.message || e || ""),
            }
        );
    } finally {
        clearTimeout(timeout);
    }
};

const requestGetJson = async (
    apiBaseUrl: string,
    apiPath: string,
    apiKey?: string,
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const requestUrl = buildApiUrl(baseUrl, apiPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(requestUrl, {
            method: "GET",
            headers: {
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
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
            json.msg = responseMessageOf(json, res.ok ? "" : `HTTP ${res.status}`);
        }
        return attachDiagnostics(json, {
            requestUrl,
            method: "GET",
            requestFormat: "json",
            httpStatus: res.status,
            ok: res.ok,
        });
    } catch (e: any) {
        return attachDiagnostics(
            {
                code: -1,
                msg: String(e?.message || e || "请求发送失败"),
                data: {},
            },
            {
                requestUrl,
                method: "GET",
                requestFormat: "json",
                error: String(e?.stack || e?.message || e || ""),
            }
        );
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

const normalizeDirectTaskResults = (value: any) => {
    const content = value?.content || {};
    const contentVideoUrl = String(content?.video_url || "").trim();
    const contentImageUrl = String(content?.image_url || "").trim();
    const outputText = String(content?.text || "").trim();
    const imageDataResults = Array.isArray(value?.data)
        ? value.data
              .map((item: any) => {
                  const url = String(item?.url || "").trim();
                  const b64 = String(item?.b64_json || "").trim();
                  if (url) {
                      return { url, outputType: "image", fileUrl: url };
                  }
                  if (b64) {
                      return { text: b64, outputType: "image_base64", fileUrl: "" };
                  }
                  return null;
              })
              .filter(Boolean)
        : [];
    const fromContent = [
        ...(contentVideoUrl ? [{ url: contentVideoUrl, outputType: "video", fileUrl: contentVideoUrl }] : []),
        ...(contentImageUrl ? [{ url: contentImageUrl, outputType: "image", fileUrl: contentImageUrl }] : []),
        ...(outputText ? [{ text: outputText, outputType: "text", fileUrl: "" }] : []),
        ...imageDataResults,
    ];
    return fromContent.length > 0 ? fromContent : normalizeResults(value?.results);
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
    connectorType: "ai-app" | "workflow" | "model-api" | "custom-api";
    submitPath?: string;
    webappId?: string | number;
    workflowId?: string;
    nodeInfoList?: Array<Record<string, any>>;
    requestBody?: Record<string, any>;
    requestFormat?: "json" | "form-data";
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
    if (options.requestFormat === "form-data") {
        return await requestFormData(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            normalizeApiPath(options.submitPath, ""),
            options.requestBody || {},
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
    connectorType: "ai-app" | "workflow" | "model-api" | "custom-api";
    queryPath?: string;
    taskId: string;
}) => {
    const baseUrl = options.apiBaseUrl || DEFAULT_BASE_URL;
    const queryPath = normalizeApiPath(options.queryPath, "openapi/v2/query");
    const hasTaskPathPlaceholder = /\{id\}|\{taskId\}|:id|:taskId/i.test(queryPath);
    const resolvedQueryPath = hasTaskPathPlaceholder
        ? queryPath
              .replace(/\{id\}|\{taskId\}/gi, encodeURIComponent(options.taskId))
              .replace(/:id|:taskId/gi, encodeURIComponent(options.taskId))
        : queryPath;
    const directResult = hasTaskPathPlaceholder
        ? await requestGetJson(baseUrl, resolvedQueryPath, options.apiKey)
        : await requestJson(
              baseUrl,
              resolvedQueryPath,
              {
                  taskId: options.taskId,
              },
              options.apiKey
          );
    if (typeof directResult?.status !== "undefined" || Array.isArray(directResult?.results) || Array.isArray(directResult?.data) || directResult?.taskId || directResult?.id) {
        return {
            code: normalizeStatus(directResult?.status) === "FAILED" ? 500 : 0,
            msg: directResult?.errorMessage || directResult?.msg || "",
            data: {
                taskId: directResult?.taskId || directResult?.id || options.taskId,
                status: normalizeStatus(directResult?.status || (Array.isArray(directResult?.data) ? "succeeded" : "")),
                rawStatus: directResult?.status || "",
                results: normalizeDirectTaskResults(directResult),
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
    connectorType: "ai-app" | "workflow" | "model-api" | "custom-api";
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
