import { ipcMain, net, session } from "electron";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "https://www.runninghub.cn";
const DEFAULT_DIRECT_API_TIMEOUT_MS = 300000;
const PAN123_BASE_URL = "https://open-api.123pan.com";
const PAN123_URL_AUTH_TTL_SECONDS = 7 * 24 * 60 * 60;
let currentProxyRules = "";
const pan123TokenCache = new Map<string, { token: string; expiredAt: number }>();
const exchangeTokenAssetGroupCache = new Map<string, string>();
const kwjmAssetGroupCache = new Map<string, string>();

type DirectFileRelayOptions = {
    provider?: "123pan" | "modeltop-assets" | "kwjm-assets";
    enabled?: boolean;
    clientID?: string;
    clientSecret?: string;
    parentFileID?: number | string;
    urlAuthKey?: string;
    assetMode?: boolean;
    kwjmAssetReturnUrl?: boolean;
};

const normalizeApiBaseUrl = (url?: string) => {
    return String(url || DEFAULT_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
};

const normalizeApiKey = (value?: string) => {
    let key = String(value || "")
        .trim()
        .replace(/\uFEFF/g, "")
        .replace(/：/g, ":");
    key = key.replace(/^Authorization\s*:\s*/i, "").trim();
    key = key.replace(/^Bearer\s+/i, "").trim();
    key = key.replace(/^Bearer\s*:\s*/i, "").trim();
    if (/[^\x20-\x7E]/.test(key)) {
        throw new Error("API Key 包含中文、全角符号或不可见字符，请只填写纯 Key，不要粘贴“Authorization：Bearer ...”。");
    }
    return key;
};

const buildAuthHeader = (apiKey?: string) => {
    const key = normalizeApiKey(apiKey);
    return key ? { Authorization: `Bearer ${key}` } : {};
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

const normalizeProxyRules = (proxyUrl?: string) => {
    const value = String(proxyUrl || "").trim();
    if (!value) {
        return "";
    }
    if (/^(direct|system)$/i.test(value)) {
        return value.toLowerCase();
    }
    if (/^[a-z][a-z0-9+.-]*=/i.test(value) || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        return value;
    }
    return `http://${value}`;
};

const applyProxyRules = async (proxyUrl?: string) => {
    const proxyRules = normalizeProxyRules(proxyUrl);
    if (proxyRules === currentProxyRules) {
        return;
    }
    currentProxyRules = proxyRules;
    if (proxyRules === "direct") {
        await session.defaultSession.setProxy({ mode: "direct" });
    } else if (proxyRules === "system") {
        await session.defaultSession.setProxy({ mode: "system" });
    } else {
        await session.defaultSession.setProxy(proxyRules ? { proxyRules } : {});
    }
    await session.defaultSession.closeAllConnections();
};

const responseMessageOf = (json: any, fallback: string) => {
    return String(
        json?.error?.message ||
            json?.errorMessage ||
            json?.FailReason ||
            json?.failReason ||
            json?.Reason ||
            json?.reason ||
            json?.StatusMessage ||
            json?.statusMessage ||
            json?.Message ||
            json?.msg ||
            json?.message ||
            fallback ||
            ""
    );
};

const safeJsonSnippet = (value: any, maxLength = 1200) => {
    try {
        const text = JSON.stringify(value);
        return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    } catch (e) {
        return String(value || "");
    }
};

const exchangeTokenModerationHint = (value: any) => {
    const error = value?.Error || value?.error || {};
    const code = String(error?.Code || error?.code || "").trim();
    const message = String(error?.Message || error?.message || "").trim();
    if (/InputImageSensitiveContentDetected\.PolicyViolation/i.test(code)) {
        return [
            "资产审核提示：参考图可能涉及版权限制，ExchangeToken 资产库拒绝入库。",
            "请换用自有版权/已授权/原创生成的参考图，或去掉截图里的影视、动漫、品牌 Logo、平台水印、明星/名人等高风险元素后重试。",
        ].join("\n");
    }
    if (/SensitiveContent|PolicyViolation/i.test(code)) {
        return `资产审核提示：素材触发平台内容审核。${message || code}`;
    }
    return "";
};

const assetModerationHint = (value: any) => {
    const error = value?.Error || value?.error || {};
    const code = String(error?.Code || error?.code || "").trim();
    const message = String(error?.Message || error?.message || "").trim();
    if (/InputImageSensitiveContentDetected/i.test(code) && /real person/i.test(message)) {
        return [
            "资产审核提示：参考图可能包含真人，平台要求先完成素材入库后再用于视频生成。",
            "如果入库仍失败，请确认图片来源、授权和平台真人/肖像使用规则。",
        ].join("\n");
    }
    if (/SensitiveContent|PolicyViolation/i.test(code)) {
        return `资产审核提示：素材触发平台内容审核。${message || code}`;
    }
    return "";
};

const attachDiagnostics = (json: any, diagnostics: Record<string, any>) => {
    const result = json && typeof json === "object" ? json : {};
    result._diagnostics = {
        ...(result._diagnostics || {}),
        ...diagnostics,
    };
    return result;
};

const errorDetailOf = (e: any) => {
    const parts = [
        e?.stack || e?.message || e,
        e?.cause?.stack || e?.cause?.message || e?.cause,
        e?.cause?.code ? `cause.code=${e.cause.code}` : "",
        e?.cause?.errno ? `cause.errno=${e.cause.errno}` : "",
        e?.cause?.syscall ? `cause.syscall=${e.cause.syscall}` : "",
        e?.cause?.hostname ? `cause.hostname=${e.cause.hostname}` : "",
    ]
        .map(item => String(item || "").trim())
        .filter(Boolean);
    return Array.from(new Set(parts)).join("\n");
};

const normalizeNetworkError = (e: any, requestUrl?: string) => {
    const detail = errorDetailOf(e);
    if (/ERR_CERT_AUTHORITY_INVALID|CERT_AUTHORITY_INVALID/i.test(detail)) {
        const host = (() => {
            try {
                return requestUrl ? new URL(requestUrl).host : "";
            } catch (err) {
                return "";
            }
        })();
        return new Error(
            [
                `HTTPS 证书不受信任${host ? `：${host}` : ""}`,
                "请检查平台 Base URL 是否填写正确；如果正在使用代理/抓包工具，请确认代理根证书已安装到系统信任区，或把代理地址改为 direct/system 后重试。",
                detail,
            ].filter(Boolean).join("\n")
        );
    }
    return e;
};

const appFetch = async (url: string, init: RequestInit) => {
    try {
        if (typeof (net as any)?.fetch === "function") {
            return await (net as any).fetch(url, init);
        }
        return await fetch(url, init);
    } catch (e) {
        throw normalizeNetworkError(e, url);
    }
};

const parseJsonBody = async (res: Response) => {
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
};

const assertOkJson = (json: any, fallback: string) => {
    if (json?.code || json?.error || json?.errorMessage) {
        throw new Error(responseMessageOf(json, fallback));
    }
    return json;
};

const describeHttpSource = (sourceUrl: string) => {
    try {
        const url = new URL(sourceUrl);
        return `${url.protocol}//${url.hostname}${url.pathname}`;
    } catch (e) {
        return sourceUrl;
    }
};

const verifyPublicSourceUrl = async (sourceUrl: string, proxyUrl?: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
        await applyProxyRules(proxyUrl);
        const res = await appFetch(sourceUrl, {
            method: "GET",
            headers: {
                "Accept": "*/*",
                "User-Agent": "Mozilla/5.0 AIGCPanel-Electron",
                "Range": "bytes=0-1023",
            },
            signal: controller.signal,
        });
        if (!res.ok && res.status !== 206) {
            throw new Error(`HTTP ${res.status}`);
        }
    } catch (e: any) {
        throw new Error(`123 云盘直链自检失败，素材源可能无法被外部服务访问：${describeHttpSource(sourceUrl)}\n${e?.message || e}`);
    } finally {
        clearTimeout(timeout);
    }
};

const isSoftPublicSourceCheckError = (e: any) => {
    return /aborted|timeout|timed out|ERR_TIMED_OUT|ERR_CONNECTION|fetch failed|socket hang up|ECONNRESET/i.test(String(e?.message || e || ""));
};

const postJsonRaw = async (
    requestUrl: string,
    body: Record<string, any>,
    headers: Record<string, string> = {},
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS,
    proxyUrl?: string
) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await applyProxyRules(proxyUrl);
        const res = await appFetch(requestUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "AIGCPanel-Electron",
                ...headers,
            },
            body: JSON.stringify(body || {}),
            signal: controller.signal,
        });
        const json = await parseJsonBody(res);
        if (typeof json.code === "undefined") {
            json.code = res.ok ? 0 : res.status;
        }
        if (typeof json.msg === "undefined") {
            json.msg = responseMessageOf(json, res.ok ? "" : `HTTP ${res.status}`);
        }
        return json;
    } finally {
        clearTimeout(timeout);
    }
};

const getJsonRaw = async (
    requestUrl: string,
    headers: Record<string, string> = {},
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS,
    proxyUrl?: string
) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await applyProxyRules(proxyUrl);
        const res = await appFetch(requestUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "User-Agent": "AIGCPanel-Electron",
                ...headers,
            },
            signal: controller.signal,
        });
        const json = await parseJsonBody(res);
        if (typeof json.code === "undefined") {
            json.code = res.ok ? 0 : res.status;
        }
        if (typeof json.msg === "undefined") {
            json.msg = responseMessageOf(json, res.ok ? "" : `HTTP ${res.status}`);
        }
        return json;
    } finally {
        clearTimeout(timeout);
    }
};

const pan123Headers = (token?: string) => ({
    "Platform": "open_platform",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const pickPan123Suid = (url: URL) => {
    const firstPath = url.pathname.split("/").filter(Boolean)[0] || "";
    if (/^\d+$/.test(firstPath)) {
        return firstPath;
    }
    const hostPrefix = url.hostname.split(".")[0] || "";
    if (/^\d+$/.test(hostPrefix)) {
        return hostPrefix;
    }
    return "";
};

const pan123SafeUploadName = (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase() || ".bin";
    const base = path
        .basename(filePath, path.extname(filePath))
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    const suffix = crypto.randomBytes(3).toString("hex");
    return `${Date.now()}_${base || "asset"}_${suffix}${ext}`;
};

const signPan123DirectUrlByPath = (directUrl: string, authKey: string, signPath: string) => {
    const url = new URL(directUrl);
    const suid = pickPan123Suid(url);
    if (!suid) {
        throw new Error("123 云盘直链 URL 无法识别 suid，不能生成 URL 鉴权签名");
    }
    const timestamp = (Math.floor(Date.now() / 1000) + PAN123_URL_AUTH_TTL_SECONDS).toString();
    const rand = crypto.randomBytes(4).toString("hex");
    const md5hash = crypto
        .createHash("md5")
        .update(`${signPath}-${timestamp}-${rand}-${suid}-${authKey}`)
        .digest("hex");
    url.searchParams.set("auth_key", `${timestamp}-${rand}-${suid}-${md5hash}`);
    return url.toString();
};

const signPan123DirectUrlCandidates = (directUrl: string, authKey?: string) => {
    const privateKey = String(authKey || "").trim();
    if (!privateKey) {
        return [directUrl];
    }
    const url = new URL(directUrl);
    const encodedPath = url.pathname;
    let decodedPath = encodedPath;
    try {
        decodedPath = decodeURIComponent(encodedPath);
    } catch (e) {
        decodedPath = encodedPath;
    }
    const signPaths = Array.from(new Set([
        decodedPath,
        encodedPath,
        decodedPath.replace(/^\/+/, ""),
        encodedPath.replace(/^\/+/, ""),
    ].filter(Boolean)));
    return signPaths.map(signPath => signPan123DirectUrlByPath(directUrl, privateKey, signPath));
};

const pickVerifiedPan123DirectUrl = async (directUrl: string, authKey?: string, proxyUrl?: string, allowSoftFail = false) => {
    const candidates = signPan123DirectUrlCandidates(directUrl, authKey);
    const errors: string[] = [];
    let softFailCandidate = "";
    for (const candidate of candidates) {
        try {
            await verifyPublicSourceUrl(candidate, proxyUrl);
            return candidate;
        } catch (e: any) {
            if (allowSoftFail && !softFailCandidate && isSoftPublicSourceCheckError(e)) {
                softFailCandidate = candidate;
            }
            errors.push(e?.message || String(e));
        }
    }
    if (softFailCandidate) {
        return softFailCandidate;
    }
    throw new Error(errors[0] || "123 云盘直链自检失败");
};

const getPan123AccessToken = async (relay: DirectFileRelayOptions, proxyUrl?: string) => {
    const clientID = String(relay.clientID || "").trim();
    const clientSecret = String(relay.clientSecret || "").trim();
    if (!clientID || !clientSecret) {
        throw new Error("123 云盘中转未配置 Client ID / Client Secret");
    }
    const cacheKey = `${clientID}:${clientSecret}`;
    const cached = pan123TokenCache.get(cacheKey);
    if (cached && cached.expiredAt > Date.now() + 120000) {
        return cached.token;
    }
    const json = assertOkJson(
        await postJsonRaw(
            `${PAN123_BASE_URL}/api/v1/access_token`,
            { clientID, clientSecret },
            pan123Headers(),
            30000,
            proxyUrl
        ),
        "123 云盘 access_token 获取失败"
    );
    const token = String(json?.data?.accessToken || "").trim();
    const expiredAt = Date.parse(String(json?.data?.expiredAt || ""));
    if (!token) {
        throw new Error("123 云盘 access_token 返回为空");
    }
    pan123TokenCache.set(cacheKey, {
        token,
        expiredAt: Number.isFinite(expiredAt) ? expiredAt : Date.now() + 3600000,
    });
    return token;
};

const uploadFileToPan123 = async (filePath: string, relay: DirectFileRelayOptions, proxyUrl?: string) => {
    const token = await getPan123AccessToken(relay, proxyUrl);
    const buffer = await readFile(filePath);
    const etag = crypto.createHash("md5").update(buffer).digest("hex");
    const parentFileID = Number(relay.parentFileID || 0);
    if (!Number.isFinite(parentFileID)) {
        throw new Error("123 云盘 Folder ID 必须是数字");
    }
    const createJson = assertOkJson(
        await postJsonRaw(
            `${PAN123_BASE_URL}/upload/v1/file/create`,
            {
                parentFileID,
                filename: pan123SafeUploadName(filePath),
                etag,
                size: buffer.length,
                duplicate: 1,
            },
            pan123Headers(token),
            60000,
            proxyUrl
        ),
        "123 云盘创建文件失败"
    );
    let fileID = Number(createJson?.data?.fileID || 0);
    const reuse = createJson?.data?.reuse === true;
    const preuploadID = String(createJson?.data?.preuploadID || "").trim();
    const sliceSize = Number(createJson?.data?.sliceSize || buffer.length || 1);
    if (!reuse) {
        if (!preuploadID || !sliceSize) {
            throw new Error("123 云盘创建文件未返回 preuploadID/sliceSize");
        }
        let sliceNo = 1;
        for (let offset = 0; offset < buffer.length; offset += sliceSize) {
            const urlJson = assertOkJson(
                await postJsonRaw(
                    `${PAN123_BASE_URL}/upload/v1/file/get_upload_url`,
                    { preuploadID, sliceNo },
                    pan123Headers(token),
                    60000,
                    proxyUrl
                ),
                "123 云盘获取上传地址失败"
            );
            const presignedURL = String(urlJson?.data?.presignedURL || "").trim();
            if (!presignedURL) {
                throw new Error("123 云盘未返回分片上传地址");
            }
            await applyProxyRules(proxyUrl);
            const putRes = await appFetch(presignedURL, {
                method: "PUT",
                body: buffer.subarray(offset, Math.min(offset + sliceSize, buffer.length)),
            });
            if (!putRes.ok) {
                throw new Error(`123 云盘分片上传失败：HTTP ${putRes.status}`);
            }
            sliceNo += 1;
        }
        const completeJson = assertOkJson(
            await postJsonRaw(
                `${PAN123_BASE_URL}/upload/v1/file/upload_complete`,
                { preuploadID },
                pan123Headers(token),
                60000,
                proxyUrl
            ),
            "123 云盘上传完毕失败"
        );
        fileID = Number(completeJson?.data?.fileID || fileID || 0);
        if (completeJson?.data?.async) {
            for (let i = 0; i < 60; i += 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const asyncJson = assertOkJson(
                    await postJsonRaw(
                        `${PAN123_BASE_URL}/upload/v1/file/upload_async_result`,
                        { preuploadID },
                        pan123Headers(token),
                        30000,
                        proxyUrl
                    ),
                    "123 云盘异步上传结果查询失败"
                );
                if (asyncJson?.data?.completed) {
                    fileID = Number(asyncJson?.data?.fileID || fileID || 0);
                    break;
                }
            }
        }
    }
    if (!fileID) {
        throw new Error("123 云盘上传完成但未返回 fileID");
    }
    const directJson = assertOkJson(
        await getJsonRaw(
            `${PAN123_BASE_URL}/api/v1/direct-link/url?fileID=${encodeURIComponent(String(fileID))}`,
            pan123Headers(token),
            30000,
            proxyUrl
        ),
        "123 云盘获取直链失败"
    );
    const rawDirectUrl = String(directJson?.data?.url || "").trim();
    if (!/^https?:\/\//i.test(rawDirectUrl)) {
        throw new Error("123 云盘返回的直链不是有效 HTTP URL");
    }
    const directUrl = await pickVerifiedPan123DirectUrl(rawDirectUrl, relay.urlAuthKey, proxyUrl, true);
    return { fileID, directUrl };
};

const createExchangeTokenAsset = async (
    apiBaseUrl: string,
    apiKey: string,
    filePath: string,
    publicUrl: string,
    assetType: "Image" | "Video",
    proxyUrl?: string
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const cacheKey = `${baseUrl}:${apiKey.slice(0, 8)}`;
    let groupId = exchangeTokenAssetGroupCache.get(cacheKey) || "";
    if (!groupId) {
        const groupJson = assertOkJson(
            await postJsonRaw(
                `${baseUrl}/open/CreateAssetGroup`,
                { Name: "AIGCPanel Seedance" },
                buildAuthHeader(apiKey),
                30000,
                proxyUrl
            ),
            "ExchangeToken 创建资产组失败"
        );
        groupId = String(
            groupJson?.data?.GroupId ||
                groupJson?.Result?.GroupId ||
                groupJson?.Result?.Id ||
                groupJson?.GroupId ||
                groupJson?.Id ||
                ""
        ).trim();
        if (!groupId) {
            throw new Error("ExchangeToken 创建资产组未返回 GroupId");
        }
        exchangeTokenAssetGroupCache.set(cacheKey, groupId);
    }
    const assetJson = assertOkJson(
        await postJsonRaw(
            `${baseUrl}/open/CreateAsset`,
            {
                GroupId: groupId,
                URL: publicUrl,
                Name: path.basename(filePath),
                AssetType: assetType,
            },
            buildAuthHeader(apiKey),
            30000,
            proxyUrl
        ),
        "ExchangeToken 创建资产失败"
    );
    const createAssetMessage = responseMessageOf(assetJson, "");
    const assetId = String(
        assetJson?.data?.AssetId ||
            assetJson?.Result?.AssetId ||
            assetJson?.Result?.Id ||
            assetJson?.AssetId ||
            assetJson?.Id ||
            ""
    ).trim();
    if (!assetId) {
        throw new Error("ExchangeToken 创建资产未返回 AssetId");
    }
    for (let i = 0; i < 60; i += 1) {
        const statusJson = assertOkJson(
            await postJsonRaw(
                `${baseUrl}/open/GetAsset`,
                { Id: assetId, AssetId: assetId },
                buildAuthHeader(apiKey),
                30000,
                proxyUrl
            ),
            "ExchangeToken 查询资产失败"
        );
        const status = String(
            statusJson?.data?.Status ||
                statusJson?.Result?.Status ||
                statusJson?.Status ||
                ""
        ).trim();
        if (/^Active$/i.test(status)) {
            return `asset://${assetId}`;
        }
        if (/failed|error|reject/i.test(status)) {
            const diagnosticJson = statusJson?.data || statusJson?.Result || statusJson;
            const moderationHint = exchangeTokenModerationHint(diagnosticJson);
            const reason = moderationHint || responseMessageOf(diagnosticJson, createAssetMessage || "failed");
            throw new Error(
                [
                    `ExchangeToken 资产入库失败：${status}`,
                    reason,
                    `AssetId: ${assetId}`,
                    `AssetType: ${assetType}`,
                    `File: ${path.basename(filePath)}`,
                    `Source: ${describeHttpSource(publicUrl)}`,
                    `Detail: ${safeJsonSnippet(diagnosticJson)}`,
                ]
                    .filter(Boolean)
                    .join("\n")
            );
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("ExchangeToken 资产入库超时");
};

const createKwjmAsset = async (
    apiBaseUrl: string,
    apiKey: string,
    filePath: string,
    publicUrl: string,
    assetType: "Image" | "Video",
    model = "kw-video-v2",
    proxyUrl?: string,
    returnAssetUrl = false
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const normalizedModel = /kw-video-v2-fast/i.test(model) ? "kw-video-v2-fast" : "kw-video-v2";
    const cacheKey = `${baseUrl}:${apiKey.slice(0, 8)}:${normalizedModel}`;
    let groupId = kwjmAssetGroupCache.get(cacheKey) || "";
    if (!groupId) {
        const groupJson = assertOkJson(
            await postJsonRaw(
                `${baseUrl}/v3/open/CreateAssetGroup`,
                {
                    model: normalizedModel,
                    Name: "AIGCPanel Seedance".slice(0, 32),
                    GroupType: "AIGC",
                    Description: "AIGCPanel reusable media assets",
                },
                buildAuthHeader(apiKey),
                30000,
                proxyUrl
            ),
            "KWJM 创建资产组失败"
        );
        groupId = String(
            groupJson?.data?.GroupId ||
                groupJson?.data?.group_id ||
                groupJson?.data?.id ||
                groupJson?.Result?.GroupId ||
                groupJson?.Result?.Id ||
                groupJson?.GroupId ||
                groupJson?.Id ||
                groupJson?.id ||
                ""
        ).trim();
        if (!groupId) {
            throw new Error(`KWJM 创建资产组未返回 GroupId\nDetail: ${safeJsonSnippet(groupJson)}`);
        }
        kwjmAssetGroupCache.set(cacheKey, groupId);
    }
    const assetJson = assertOkJson(
        await postJsonRaw(
            `${baseUrl}/v3/open/CreateAsset`,
            {
                model: normalizedModel,
                GroupId: groupId,
                URL: publicUrl,
                Name: path.basename(filePath).slice(0, 32),
                AssetType: assetType,
            },
            buildAuthHeader(apiKey),
            30000,
            proxyUrl
        ),
        "KWJM 创建资产失败"
    );
    const createAssetMessage = responseMessageOf(assetJson, "");
    const assetId = String(
        assetJson?.data?.AssetId ||
            assetJson?.data?.asset_id ||
            assetJson?.data?.Id ||
            assetJson?.data?.id ||
            assetJson?.Result?.AssetId ||
            assetJson?.Result?.Id ||
            assetJson?.AssetId ||
            assetJson?.Id ||
            assetJson?.id ||
            ""
    ).trim();
    if (!assetId) {
        throw new Error(`KWJM 创建资产未返回 AssetId\nDetail: ${safeJsonSnippet(assetJson)}`);
    }
    for (let i = 0; i < 60; i += 1) {
        const statusJson = assertOkJson(
            await postJsonRaw(
                `${baseUrl}/v3/open/GetAsset`,
                {
                    model: normalizedModel,
                    Id: assetId,
                },
                buildAuthHeader(apiKey),
                30000,
                proxyUrl
            ),
            "KWJM 查询资产失败"
        );
        const diagnosticJson = statusJson?.data || statusJson?.Result || statusJson;
        const status = String(
            statusJson?.data?.Status ||
                statusJson?.data?.status ||
                statusJson?.Result?.Status ||
                statusJson?.Result?.status ||
                statusJson?.Status ||
                statusJson?.status ||
                ""
        ).trim();
        if (/^(Active|Success|Succeeded|Completed|Ready)$/i.test(status)) {
            if (returnAssetUrl) {
                const assetUrl = String(
                    statusJson?.data?.URL ||
                        statusJson?.data?.Url ||
                        statusJson?.data?.url ||
                        statusJson?.Result?.URL ||
                        statusJson?.Result?.Url ||
                        statusJson?.Result?.url ||
                        statusJson?.URL ||
                        statusJson?.Url ||
                        statusJson?.url ||
                        ""
                ).trim();
                if (!assetUrl) {
                    throw new Error("KWJM 资产入库成功但未返回素材 URL\nAssetId: " + assetId + "\nDetail: " + safeJsonSnippet(diagnosticJson));
                }
                return assetUrl;
            }
            return "asset://" + assetId;
        }
        if (/failed|error|reject/i.test(status)) {
            const moderationHint = assetModerationHint(diagnosticJson);
            const reason = moderationHint || responseMessageOf(diagnosticJson, createAssetMessage || "failed");
            throw new Error(
                [
                    `KWJM 资产入库失败：${status}`,
                    reason,
                    `AssetId: ${assetId}`,
                    `AssetType: ${assetType}`,
                    `File: ${path.basename(filePath)}`,
                    `Source: ${describeHttpSource(publicUrl)}`,
                    `Detail: ${safeJsonSnippet(diagnosticJson)}`,
                ]
                    .filter(Boolean)
                    .join("\n")
            );
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("KWJM 资产入库超时");
};

const uploadFileToModelTopAssets = async (
    apiBaseUrl: string,
    apiKey: string,
    filePath: string,
    assetType: "image" | "video" | "audio" | "file" = "file",
    proxyUrl?: string
) => {
    if (!apiBaseUrl || !apiKey) {
        throw new Error("ModelTop Assets 需要 Base URL 和 API Key");
    }
    const body: Record<string, any> = {
        file: filePath,
        type: assetType,
        asset_type: assetType,
    };
    const tryPaths = [
        "/v1/assets",
        "/v1/files",
        "/api/v1/assets",
    ];
    let lastError = "";
    for (const apiPath of tryPaths) {
        const res = await requestFormData(apiBaseUrl, apiPath, body, apiKey, DEFAULT_DIRECT_API_TIMEOUT_MS, proxyUrl);
        if (!res?.code) {
            const assetId = String(
                pickDeepValue(res, [
                    "data.id",
                    "data.asset_id",
                    "data.assetId",
                    "data.file_id",
                    "data.fileId",
                    "id",
                    "asset_id",
                    "assetId",
                    "file_id",
                    "fileId",
                ]) || ""
            );
            const url = String(
                pickDeepValue(res, [
                    "data.url",
                    "data.fileUrl",
                    "data.file_url",
                    "data.download_url",
                    "data.uri",
                    "url",
                    "fileUrl",
                    "file_url",
                    "download_url",
                    "uri",
                ]) || ""
            );
            if (assetId) {
                return `asset://${assetId}`;
            }
            if (url) {
                return url;
            }
            lastError = "ModelTop Assets 上传成功但未返回 asset id 或 url";
            continue;
        }
        lastError = responseMessageOf(res, `ModelTop Assets 上传失败：${apiPath}`);
    }
    throw new Error(lastError || "ModelTop Assets 上传失败");
};

const shouldRetryByNetRequest = (e: any) => {
    return /ERR_CONNECTION_CLOSED|fetch failed|other side closed|socket hang up|ECONNRESET|connReset/i.test(errorDetailOf(e));
};

const parseTextResponse = (text: string, statusCode: number) => {
    try {
        return text ? JSON.parse(text) : {};
    } catch (e) {
        return {
            code: statusCode >= 200 && statusCode < 300 ? 0 : statusCode,
            msg: text || `HTTP ${statusCode}`,
            data: {},
        };
    }
};

const requestTextByNetRequest = async (
    requestUrl: string,
    method: string,
    headers: Record<string, string>,
    bodyText: string,
    timeoutMs: number
) => {
    return await new Promise<{ statusCode: number; text: string }>((resolve, reject) => {
        const req = net.request({
            method,
            url: requestUrl,
        });
        let finished = false;
        const timer = setTimeout(() => {
            if (finished) {
                return;
            }
            finished = true;
            req.abort();
            reject(new Error(`请求超时：${timeoutMs}ms`));
        }, timeoutMs);
        for (const [key, value] of Object.entries(headers)) {
            if (value) {
                req.setHeader(key, value);
            }
        }
        req.on("response", response => {
            const chunks: Buffer[] = [];
            response.on("data", chunk => chunks.push(Buffer.from(chunk)));
            response.on("end", () => {
                if (finished) {
                    return;
                }
                finished = true;
                clearTimeout(timer);
                resolve({
                    statusCode: response.statusCode || 0,
                    text: Buffer.concat(chunks).toString("utf8"),
                });
            });
            response.on("error", error => {
                if (finished) {
                    return;
                }
                finished = true;
                clearTimeout(timer);
                reject(error);
            });
        });
        req.on("error", error => {
            if (finished) {
                return;
            }
            finished = true;
            clearTimeout(timer);
            reject(error);
        });
        if (bodyText) {
            req.write(bodyText);
        }
        req.end();
    });
};

const requestTextByNodeHttps = async (
    requestUrl: string,
    method: string,
    headers: Record<string, string>,
    bodyText: string,
    timeoutMs: number
) => {
    return await new Promise<{ statusCode: number; text: string }>((resolve, reject) => {
        const url = new URL(requestUrl);
        const req = https.request(
            {
                method,
                hostname: url.hostname,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                headers: {
                    ...headers,
                    "Content-Length": Buffer.byteLength(bodyText).toString(),
                },
                timeout: timeoutMs,
            },
            response => {
                const chunks: Buffer[] = [];
                response.on("data", chunk => chunks.push(Buffer.from(chunk)));
                response.on("end", () => {
                    resolve({
                        statusCode: response.statusCode || 0,
                        text: Buffer.concat(chunks).toString("utf8"),
                    });
                });
                response.on("error", reject);
            }
        );
        req.on("timeout", () => {
            req.destroy(new Error(`请求超时：${timeoutMs}ms`));
        });
        req.on("error", reject);
        if (bodyText) {
            req.write(bodyText);
        }
        req.end();
    });
};

const normalizeStatus = (status: any) => {
    return String(status || "").trim().toUpperCase();
};

const requestJson = async (
    apiBaseUrl: string,
    apiPath: string,
    body: Record<string, any>,
    apiKey?: string,
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS,
    proxyUrl?: string,
    directFileRelay?: DirectFileRelayOptions
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const requestUrl = buildApiUrl(baseUrl, apiPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await applyProxyRules(proxyUrl);
        const requestBody = await normalizeJsonBodyLocalFiles(body || {}, baseUrl, apiKey, directFileRelay, proxyUrl, String(body?.model || ""));
        const bodyText = JSON.stringify(requestBody);
        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "AIGCPanel-Electron",
            ...buildAuthHeader(apiKey),
        };
        const res = await appFetch(requestUrl, {
            method: "POST",
            headers,
            body: bodyText,
            signal: controller.signal,
        });
        const text = await res.text();
        let json: any = parseTextResponse(text, res.status);
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
            requestBody,
            httpStatus: res.status,
            ok: res.ok,
        });
    } catch (e: any) {
        if (shouldRetryByNetRequest(e)) {
            try {
                const requestBody = await normalizeJsonBodyLocalFiles(body || {}, baseUrl, apiKey, directFileRelay, proxyUrl, String(body?.model || ""));
                const bodyText = JSON.stringify(requestBody);
                const headers = {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "AIGCPanel-Electron",
                    ...buildAuthHeader(apiKey),
                };
                const raw = await requestTextByNetRequest(requestUrl, "POST", headers, bodyText, timeoutMs);
                let json: any = parseTextResponse(raw.text, raw.statusCode);
                if (typeof json !== "object" || !json) {
                    json = {};
                }
                if (typeof json.code === "undefined" && typeof json.status === "undefined") {
                    json.code = raw.statusCode >= 200 && raw.statusCode < 300 ? 0 : raw.statusCode;
                }
                if (typeof json.msg === "undefined" && typeof json.errorMessage === "undefined") {
                    json.msg = responseMessageOf(json, raw.statusCode >= 200 && raw.statusCode < 300 ? "" : `HTTP ${raw.statusCode}`);
                }
                return attachDiagnostics(json, {
                    requestUrl,
                    method: "POST",
                    requestFormat: "json",
                    requestBody,
                    httpStatus: raw.statusCode,
                    ok: raw.statusCode >= 200 && raw.statusCode < 300,
                    transport: "electron-net-request",
                    retriedAfter: errorDetailOf(e),
                });
            } catch (fallbackError: any) {
                try {
                    const requestBody = await normalizeJsonBodyLocalFiles(body || {}, baseUrl, apiKey, directFileRelay, proxyUrl, String(body?.model || ""));
                    const bodyText = JSON.stringify(requestBody);
                    const headers = {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "User-Agent": "AIGCPanel-Electron",
                        ...buildAuthHeader(apiKey),
                    };
                    const raw = await requestTextByNodeHttps(requestUrl, "POST", headers, bodyText, timeoutMs);
                    let json: any = parseTextResponse(raw.text, raw.statusCode);
                    if (typeof json !== "object" || !json) {
                        json = {};
                    }
                    if (typeof json.code === "undefined" && typeof json.status === "undefined") {
                        json.code = raw.statusCode >= 200 && raw.statusCode < 300 ? 0 : raw.statusCode;
                    }
                    if (typeof json.msg === "undefined" && typeof json.errorMessage === "undefined") {
                        json.msg = responseMessageOf(json, raw.statusCode >= 200 && raw.statusCode < 300 ? "" : `HTTP ${raw.statusCode}`);
                    }
                    return attachDiagnostics(json, {
                        requestUrl,
                        method: "POST",
                        requestFormat: "json",
                        requestBody,
                        httpStatus: raw.statusCode,
                        ok: raw.statusCode >= 200 && raw.statusCode < 300,
                        transport: "node-https",
                        retriedAfter: [
                            errorDetailOf(e),
                            errorDetailOf(fallbackError),
                        ].filter(Boolean).join("\n--- fallback ---\n"),
                    });
                } catch (nodeHttpsError: any) {
                    return attachDiagnostics(
                        {
                            code: -1,
                            msg: String(nodeHttpsError?.message || nodeHttpsError || "请求发送失败"),
                            data: {},
                        },
                        {
                            requestUrl,
                            method: "POST",
                            requestFormat: "json",
                            transport: "node-https",
                            error: errorDetailOf(nodeHttpsError),
                            retriedAfter: [
                                errorDetailOf(e),
                                errorDetailOf(fallbackError),
                            ].filter(Boolean).join("\n--- fallback ---\n"),
                        }
                    );
                }
            }
        }
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
                error: errorDetailOf(e),
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

const normalizeJsonBodyLocalFiles = async (
    value: any,
    apiBaseUrl?: string,
    apiKey?: string,
    relay?: DirectFileRelayOptions,
    proxyUrl?: string,
    assetModel?: string
): Promise<any> => {
    if (Array.isArray(value)) {
        return await Promise.all(value.map(item => normalizeJsonBodyLocalFiles(item, apiBaseUrl, apiKey, relay, proxyUrl, assetModel)));
    }
    if (value && typeof value === "object") {
        const result: Record<string, any> = {};
        for (const [key, child] of Object.entries(value)) {
            result[key] = await normalizeJsonBodyLocalFiles(child, apiBaseUrl, apiKey, relay, proxyUrl, assetModel);
        }
        return result;
    }
    if (typeof value === "string" && isLocalFilePath(value)) {
        const filePath = toLocalFilePath(value);
        const usePan123Relay = Boolean(relay?.enabled && relay?.provider === "123pan");
        const useModelTopAssetsRelay = Boolean(relay?.enabled && relay?.provider === "modeltop-assets");
        const ext = path.extname(filePath).toLowerCase();
        const isImage = /(\.png|\.jpe?g|\.webp|\.gif|\.bmp|\.tiff?)$/i.test(ext);
        const isVideo = /(\.mp4|\.mov)$/i.test(ext);
        const isAudio = /(\.wav|\.mp3)$/i.test(ext);
        if (useModelTopAssetsRelay) {
            if (!apiBaseUrl || !apiKey) {
                throw new Error("ModelTop Assets 中转需要 Base URL 和 API Key");
            }
            const assetType = isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "file";
            return await uploadFileToModelTopAssets(apiBaseUrl, apiKey, filePath, assetType, proxyUrl);
        }
        if (usePan123Relay) {
            const uploaded = await uploadFileToPan123(filePath, relay!, proxyUrl);
            if (/kwjm\.com/i.test(normalizeApiBaseUrl(apiBaseUrl || ""))) {
                if ((isImage || isVideo) && relay?.assetMode !== false) {
                    if (!apiBaseUrl || !apiKey) {
                        throw new Error("KWJM 资产入库需要 Base URL 和 API Key");
                    }
                    return await createKwjmAsset(
                        apiBaseUrl,
                        apiKey,
                        filePath,
                        uploaded.directUrl,
                        isImage ? "Image" : "Video",
                        assetModel || "kw-video-v2",
                        proxyUrl,
                        Boolean(relay?.kwjmAssetReturnUrl)
                    );
                }
                return uploaded.directUrl;
            }
            if ((isImage || isVideo) && relay?.assetMode !== false) {
                if (!apiBaseUrl || !apiKey) {
                    throw new Error("资产入库需要 ExchangeToken Base URL 和 API Key");
                }
                return await createExchangeTokenAsset(
                    apiBaseUrl,
                    apiKey,
                    filePath,
                    uploaded.directUrl,
                    isImage ? "Image" : "Video",
                    proxyUrl
                );
            }
            return uploaded.directUrl;
        }
        if (/kwjm\.com/i.test(normalizeApiBaseUrl(apiBaseUrl || "")) && (isImage || isVideo)) {
            throw new Error("KWJM 本地图片/视频需要先配置全局 123 云盘中转，并开启平台素材入库后再提交 Seedance");
        }
        if (isImageOrAudioFile(value)) {
            return await localFileToDataUrl(value);
        }
        if (isVideo) {
            throw new Error("本地视频需要先配置 123 云盘或 ModelTop Assets 中转后才能提交 Seedance");
        }
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

const dataUrlToFile = (value: string) => {
    const match = value.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) {
        return null;
    }
    const mime = match[1] || "application/octet-stream";
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "bin";
    return {
        buffer: Buffer.from(match[2], "base64"),
        mime,
        filename: `upload.${ext}`,
    };
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
            const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
            form.append(key, new Blob([new Uint8Array(ab)], { type: mimeFromFile(filePath) }), path.basename(filePath));
            continue;
        }
        if (typeof item === "string" && /^data:image\//i.test(item)) {
            const file = dataUrlToFile(item);
            if (file) {
                const fab = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer;
                form.append(key, new Blob([new Uint8Array(fab)], { type: file.mime }), file.filename);
                continue;
            }
        }
        if (typeof item === "object") {
            form.append(key, JSON.stringify(item));
            continue;
        }
        form.append(key, String(item));
    }
};

const appendMultipartPart = (
    chunks: Buffer[],
    boundary: string,
    key: string,
    value: Buffer | string,
    options: { filename?: string; contentType?: string } = {}
) => {
    const disposition = [`form-data; name="${key}"`];
    if (options.filename) {
        disposition.push(`filename="${options.filename}"`);
    }
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: ${disposition.join("; ")}\r\n`));
    if (options.contentType) {
        chunks.push(Buffer.from(`Content-Type: ${options.contentType}\r\n`));
    }
    chunks.push(Buffer.from("\r\n"));
    chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
    chunks.push(Buffer.from("\r\n"));
};

const appendMultipartValue = async (chunks: Buffer[], boundary: string, key: string, value: any) => {
    if (value === null || typeof value === "undefined" || value === "") {
        return;
    }
    for (const item of maybeJsonArray(value)) {
        if (item === null || typeof item === "undefined" || item === "") {
            continue;
        }
        if (typeof item === "string" && isLocalFilePath(item)) {
            const filePath = toLocalFilePath(item);
            appendMultipartPart(chunks, boundary, key, await readFile(filePath), {
                filename: path.basename(filePath),
                contentType: mimeFromFile(filePath),
            });
            continue;
        }
        if (typeof item === "string" && /^data:image\//i.test(item)) {
            const file = dataUrlToFile(item);
            if (file) {
                appendMultipartPart(chunks, boundary, key, file.buffer, {
                    filename: file.filename,
                    contentType: file.mime,
                });
                continue;
            }
        }
        appendMultipartPart(
            chunks,
            boundary,
            key,
            typeof item === "object" ? JSON.stringify(item) : String(item)
        );
    }
};

const buildMultipartBody = async (body: Record<string, any>) => {
    const boundary = `----AigcPanelBoundary${crypto.randomBytes(12).toString("hex")}`;
    const chunks: Buffer[] = [];
    for (const [key, value] of Object.entries(body || {})) {
        await appendMultipartValue(chunks, boundary, key, value);
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return {
        boundary,
        buffer: Buffer.concat(chunks),
    };
};

const requestMultipartByNodeHttps = async (
    requestUrl: string,
    body: Record<string, any>,
    headers: Record<string, string>,
    timeoutMs: number
) => {
    const multipart = await buildMultipartBody(body);
    return await new Promise<{ statusCode: number; text: string }>((resolve, reject) => {
        const url = new URL(requestUrl);
        const req = https.request(
            {
                method: "POST",
                hostname: url.hostname,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                headers: {
                    ...headers,
                    "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
                    "Content-Length": multipart.buffer.length.toString(),
                },
                timeout: timeoutMs,
            },
            response => {
                const chunks: Buffer[] = [];
                response.on("data", chunk => chunks.push(Buffer.from(chunk)));
                response.on("end", () => {
                    resolve({
                        statusCode: response.statusCode || 0,
                        text: Buffer.concat(chunks).toString("utf8"),
                    });
                });
                response.on("error", reject);
            }
        );
        req.on("timeout", () => {
            req.destroy(new Error(`请求超时：${timeoutMs}ms`));
        });
        req.on("error", reject);
        req.write(multipart.buffer);
        req.end();
    });
};

const directApiJsonFromText = (text: string, statusCode: number) => {
    try {
        const json = text ? JSON.parse(text) : {};
        if (typeof json.code === "undefined" && typeof json.status === "undefined") {
            json.code = statusCode >= 200 && statusCode < 300 ? 0 : statusCode;
        }
        if (typeof json.msg === "undefined" && typeof json.errorMessage === "undefined") {
            json.msg = responseMessageOf(json, statusCode >= 200 && statusCode < 300 ? "" : `HTTP ${statusCode}`);
        }
        return json;
    } catch (e) {
        return {
            code: statusCode >= 200 && statusCode < 300 ? 0 : statusCode,
            msg: text || `HTTP ${statusCode}`,
            data: {},
        };
    }
};

const requestFormData = async (
    apiBaseUrl: string,
    apiPath: string,
    body: Record<string, any>,
    apiKey?: string,
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS,
    proxyUrl?: string
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const requestUrl = buildApiUrl(baseUrl, apiPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const diagnostics = {
        requestUrl,
        method: "POST",
        requestFormat: "form-data",
    };
    try {
        await applyProxyRules(proxyUrl);
        const form = new FormData();
        for (const [key, value] of Object.entries(body || {})) {
            await appendFormValue(form, key, value);
        }
        const res = await appFetch(requestUrl, {
            method: "POST",
            headers: {
                ...buildAuthHeader(apiKey),
            },
            body: form,
            signal: controller.signal,
        });
        const text = await res.text();
        return attachDiagnostics(directApiJsonFromText(text, res.status), {
            ...diagnostics,
            httpStatus: res.status,
            ok: res.ok,
        });
    } catch (e: any) {
        if (shouldRetryByNetRequest(e)) {
            try {
                const retry = await requestMultipartByNodeHttps(
                    requestUrl,
                    body || {},
                    buildAuthHeader(apiKey),
                    timeoutMs
                );
                return attachDiagnostics(directApiJsonFromText(retry.text, retry.statusCode), {
                    ...diagnostics,
                    httpStatus: retry.statusCode,
                    ok: retry.statusCode >= 200 && retry.statusCode < 300,
                    fallback: "node-https-multipart",
                    firstError: errorDetailOf(e),
                });
            } catch (retryError: any) {
                return attachDiagnostics(
                    {
                        code: -1,
                        msg: String(retryError?.message || retryError || e?.message || e || "请求发送失败"),
                        data: {},
                    },
                    {
                        ...diagnostics,
                        error: errorDetailOf(retryError),
                        firstError: errorDetailOf(e),
                        fallback: "node-https-multipart",
                    }
                );
            }
        }
        return attachDiagnostics(
            {
                code: -1,
                msg: String(e?.message || e || "请求发送失败"),
                data: {},
            },
            {
                ...diagnostics,
                error: errorDetailOf(e),
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
    timeoutMs = DEFAULT_DIRECT_API_TIMEOUT_MS,
    proxyUrl?: string
) => {
    const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
    const requestUrl = buildApiUrl(baseUrl, apiPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await applyProxyRules(proxyUrl);
        const res = await appFetch(requestUrl, {
            method: "GET",
            headers: {
                ...buildAuthHeader(apiKey),
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
                error: errorDetailOf(e),
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
    fileType = "input",
    proxyUrl?: string
) => {
    const buffer = await readFile(filePath);
    const form = new FormData();
    form.append("apiKey", apiKey || "");
    form.append("fileType", fileType || "input");
    const abUpload = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    form.append("file", new Blob([new Uint8Array(abUpload)]), path.basename(filePath));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
        await applyProxyRules(proxyUrl);
        const res = await appFetch(`${normalizeApiBaseUrl(apiBaseUrl)}/task/openapi/upload`, {
            method: "POST",
            headers: {
                ...buildAuthHeader(apiKey),
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
    const content = value?.content || value?.data?.content || value?.result?.content || {};
    const contentVideoUrl = String(content?.video_url || "").trim();
    const contentImageUrl = String(content?.image_url || "").trim();
    const outputText = String(content?.text || "").trim();
    const directVideoUrl = String(
        pickDeepValue(value, [
            "video.url",
            "video_url",
            "output.video_url",
            "output.url",
            "data.video.url",
            "data.video_url",
            "data.output.video_url",
            "data.output.url",
            "result.video.url",
            "result.video_url",
            "result.output.video_url",
            "result.output.url",
        ])
    ).trim();
    const imageDataResults = [
        value?.data,
        value?.data?.data,
        value?.result?.data,
        value?.data?.result?.data,
        value?.output,
        value?.outputs,
        value?.result?.output,
        value?.result?.outputs,
    ].flatMap((candidate: any) => {
        if (!Array.isArray(candidate)) {
            return [];
        }
        return candidate
            .map((item: any) => {
                const url = String(item?.url || item?.fileUrl || item?.image_url || item?.imageUrl || "").trim();
                const videoUrl = String(item?.video_url || item?.videoUrl || "").trim();
                const b64 = String(item?.b64_json || item?.base64 || item?.image_base64 || "").trim();
                const type = String(item?.type || item?.outputType || "").toLowerCase();
                if (videoUrl || (url && type.includes("video"))) {
                    const fileUrl = videoUrl || url;
                    return { url: fileUrl, outputType: "video", fileUrl };
                }
                if (url) {
                    const outputType = type.includes("image") || b64 ? "image" : "file";
                    return { url, outputType, fileUrl: url };
                }
                if (b64) {
                    return { text: b64, outputType: "image_base64", fileUrl: "" };
                }
                return null;
            })
            .filter(Boolean);
    });
    const fromContent = [
        ...(contentVideoUrl ? [{ url: contentVideoUrl, outputType: "video", fileUrl: contentVideoUrl }] : []),
        ...(directVideoUrl ? [{ url: directVideoUrl, outputType: "video", fileUrl: directVideoUrl }] : []),
        ...(contentImageUrl ? [{ url: contentImageUrl, outputType: "image", fileUrl: contentImageUrl }] : []),
        ...(outputText ? [{ text: outputText, outputType: "text", fileUrl: "" }] : []),
        ...imageDataResults,
    ];
    return fromContent.length > 0 ? fromContent : normalizeResults(value?.results);
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

const extractDirectTaskId = (value: any, fallback = "") => {
    return String(
        pickDeepValue(value, [
            "data.taskId",
            "data.task_id",
            "data.id",
            "data.task.id",
            "data.task.taskId",
            "data.task.task_id",
            "taskId",
            "task_id",
            "id",
        ]) || fallback
    );
};

const extractDirectStatus = (value: any) => {
    return String(
        pickDeepValue(value, [
            "data.status",
            "data.taskStatus",
            "data.task.status",
            "data.task_status",
            "status",
            "taskStatus",
            "task_status",
            "state",
        ]) || ""
    );
};

ipcMain.handle("runninghub:uploadFile", async (event, options: {
    apiBaseUrl?: string;
    apiKey: string;
    filePath: string;
    fileType?: string;
    proxyUrl?: string;
}) => {
    return await uploadFile(
        options.apiBaseUrl || DEFAULT_BASE_URL,
        options.apiKey || "",
        options.filePath,
        options.fileType || "input",
        options.proxyUrl
    );
});

ipcMain.handle("runninghub:testDirectApi", async (event, options: {
    apiBaseUrl?: string;
    apiKey?: string;
    proxyUrl?: string;
}) => {
    const baseUrl = normalizeApiBaseUrl(options.apiBaseUrl || DEFAULT_BASE_URL);
    return await requestGetJson(
        baseUrl,
        "v1/models",
        options.apiKey || "",
        15000,
        options.proxyUrl
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
    proxyUrl?: string;
    directFileRelay?: DirectFileRelayOptions;
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
                options.apiKey,
                DEFAULT_DIRECT_API_TIMEOUT_MS,
                options.proxyUrl
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
            options.apiKey,
            DEFAULT_DIRECT_API_TIMEOUT_MS,
            options.proxyUrl
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
            options.apiKey,
            DEFAULT_DIRECT_API_TIMEOUT_MS,
            options.proxyUrl
        );
    }
    if (options.requestFormat === "form-data") {
        return await requestFormData(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            normalizeApiPath(options.submitPath, ""),
            options.requestBody || {},
            options.apiKey,
            DEFAULT_DIRECT_API_TIMEOUT_MS,
            options.proxyUrl
        );
    }
    return await requestJson(
        options.apiBaseUrl || DEFAULT_BASE_URL,
        normalizeApiPath(options.submitPath, ""),
        options.requestBody || {},
        options.apiKey,
        DEFAULT_DIRECT_API_TIMEOUT_MS,
        options.proxyUrl,
        options.directFileRelay
    );
});

ipcMain.handle("runninghub:queryTask", async (event, options: {
    apiBaseUrl?: string;
    apiKey: string;
    connectorType: "ai-app" | "workflow" | "model-api" | "custom-api";
    queryPath?: string;
    taskId: string;
    proxyUrl?: string;
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
        ? await requestGetJson(baseUrl, resolvedQueryPath, options.apiKey, DEFAULT_DIRECT_API_TIMEOUT_MS, options.proxyUrl)
        : await requestJson(
              baseUrl,
              resolvedQueryPath,
              {
                  taskId: options.taskId,
              },
              options.apiKey,
              DEFAULT_DIRECT_API_TIMEOUT_MS,
              options.proxyUrl
          );
    const directTaskId = extractDirectTaskId(directResult, options.taskId);
    const directStatus = extractDirectStatus(directResult);
    if (directStatus || Array.isArray(directResult?.results) || Array.isArray(directResult?.data) || directTaskId) {
        const normalizedDirectStatus = normalizeStatus(directStatus || (Array.isArray(directResult?.data) ? "succeeded" : ""));
        const failedDirectStatus = /FAILED|FAIL|ERROR|CANCEL|REJECT/.test(normalizedDirectStatus);
        return {
            code: failedDirectStatus ? 500 : 0,
            msg: directResult?.errorMessage || directResult?.msg || "",
            data: {
                taskId: directTaskId,
                status: normalizedDirectStatus,
                rawStatus: directStatus,
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
        options.apiKey,
        DEFAULT_DIRECT_API_TIMEOUT_MS,
        options.proxyUrl
    );
    const outputsResult = await requestJson(
        baseUrl,
        "task/openapi/outputs",
        {
            apiKey: options.apiKey || "",
            taskId: options.taskId,
        },
        options.apiKey,
        DEFAULT_DIRECT_API_TIMEOUT_MS,
        options.proxyUrl
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
    proxyUrl?: string;
}) => {
    if (options.connectorType === "workflow") {
        return await requestJson(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            "task/openapi/cancel",
            {
                apiKey: options.apiKey || "",
                taskId: options.taskId,
            },
            options.apiKey,
            DEFAULT_DIRECT_API_TIMEOUT_MS,
            options.proxyUrl
        );
    }
    if (options.cancelPath) {
        return await requestJson(
            options.apiBaseUrl || DEFAULT_BASE_URL,
            options.cancelPath,
            {
                taskId: options.taskId,
            },
            options.apiKey,
            DEFAULT_DIRECT_API_TIMEOUT_MS,
            options.proxyUrl
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
