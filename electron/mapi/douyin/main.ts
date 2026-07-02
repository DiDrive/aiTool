import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { DouyinHandler } from "dy-downloader";
import Apps from "../app";
import FileIndex from "../file";

type DouyinImportOptions = {
    url: string;
    cookie?: string;
    customApiUrl?: string;
    download?: boolean;
};

type DouyinImportResult = {
    sourceUrl: string;
    resolvedUrl: string;
    awemeId?: string;
    title?: string;
    desc?: string;
    author?: string;
    coverUrl?: string;
    videoUrl?: string;
    localVideoPath?: string;
    imageUrls?: string[];
    adapter?: "dy-downloader" | "custom-api" | "builtin";
    raw?: any;
};

const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const cleanText = (value: any) => String(value || "").replace(/\s+/g, " ").trim();

const normalizeCookie = (value: any) => {
    let text = String(value || "").trim();
    if (!text) {
        return "";
    }
    text = text.replace(/\r/g, "\n");
    const cookieLine = text
        .split("\n")
        .map(line => line.trim())
        .find(line => /^cookie\s*:/i.test(line));
    if (cookieLine) {
        text = cookieLine.replace(/^cookie\s*:/i, "").trim();
    }
    return text
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && !/^[\w-]+\s*:/i.test(line))
        .join("; ")
        .replace(/^cookie\s*:/i, "")
        .replace(/\s*;\s*/g, "; ")
        .trim();
};

const compactBodyPreview = (value: string, maxLength = 180) => {
    return cleanText(
        value
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
    ).slice(0, maxLength);
};

class NonJsonResponseError extends Error {
    status: number;
    responseUrl: string;
    contentType: string;
    bodyText: string;
    preview: string;

    constructor(status: number, responseUrl: string, contentType: string, bodyText: string) {
        const preview = compactBodyPreview(bodyText);
        super(`抖音接口返回非 JSON：HTTP ${status}${preview ? `，返回内容：${preview}` : ""}`);
        this.name = "NonJsonResponseError";
        this.status = status;
        this.responseUrl = responseUrl;
        this.contentType = contentType;
        this.bodyText = bodyText;
        this.preview = preview;
    }
}

const compactHeaders = (headers: Record<string, string | undefined>) => {
    return Object.fromEntries(Object.entries(headers).filter(([, value]) => cleanText(value)));
};

const fetchText = async (url: string, cookie?: string) => {
    const res = await fetch(url, {
        redirect: "follow",
        headers: compactHeaders({
            "User-Agent": CHROME_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cookie": cookie,
        }),
    });
    const text = await res.text();
    return { url: res.url || url, status: res.status, text };
};

const fetchJson = async (url: string, referer: string, cookie?: string) => {
    const res = await fetch(url, {
        redirect: "follow",
        headers: compactHeaders({
            "User-Agent": CHROME_UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": referer,
            "Cookie": cookie,
        }),
    });
    const text = await res.text();
    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new NonJsonResponseError(res.status, res.url || url, res.headers.get("content-type") || "", text);
    }
    if (!res.ok) {
        throw new Error(json?.message || json?.status_msg || `抖音接口请求失败：HTTP ${res.status}`);
    }
    return json;
};

const resolveDouyinUrl = async (url: string, cookie?: string) => {
    const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: compactHeaders({
            "User-Agent": CHROME_UA,
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cookie": cookie,
        }),
    });
    return res.url || url;
};

const extractAwemeId = (url: string, html = "") => {
    const candidates = [url, html];
    for (const source of candidates) {
        const patterns = [
            /\/video\/(\d{8,})/i,
            /[?&](?:modal_id|aweme_id|item_id|video_id)=(\d{8,})/i,
            /"aweme_id"\s*:\s*"(\d{8,})"/i,
            /"item_id"\s*:\s*"(\d{8,})"/i,
        ];
        for (const pattern of patterns) {
            const match = source.match(pattern);
            if (match?.[1]) {
                return match[1];
            }
        }
    }
    return "";
};

const firstUrl = (...values: any[]) => {
    for (const value of values) {
        if (!value) {
            continue;
        }
        if (typeof value === "string" && /^https?:\/\//i.test(value)) {
            return value;
        }
        if (Array.isArray(value)) {
            const found = firstUrl(...value);
            if (found) {
                return found;
            }
        }
        if (typeof value === "object") {
            const found = firstUrl(value.url_list, value.uri, value.url);
            if (found) {
                return found;
            }
        }
    }
    return "";
};

const normalizeVideoUrl = (url: string) => {
    return cleanText(url).replace(/playwm/i, "play");
};

const mapAwemeDetail = (aweme: any, sourceUrl: string, resolvedUrl: string): DouyinImportResult => {
    const videoUrl = normalizeVideoUrl(
        firstUrl(
            aweme?.video?.play_addr?.url_list,
            aweme?.video?.bit_rate?.map((item: any) => item?.play_addr?.url_list),
            aweme?.video?.download_addr?.url_list,
        )
    );
    const imageUrls = [
        ...(aweme?.images || []).flatMap((image: any) => image?.url_list || []),
        ...(aweme?.image_infos || []).flatMap((image: any) => image?.label_large?.url_list || image?.url_list || []),
    ].filter((url: any) => typeof url === "string" && /^https?:\/\//i.test(url));
    const title = cleanText(aweme?.item_title || aweme?.preview_title || aweme?.desc);
    return {
        sourceUrl,
        resolvedUrl,
        awemeId: cleanText(aweme?.aweme_id),
        title,
        desc: cleanText(aweme?.desc || title),
        author: cleanText(aweme?.author?.nickname || aweme?.author_user_id),
        coverUrl: firstUrl(aweme?.video?.cover?.url_list, aweme?.video?.origin_cover?.url_list, aweme?.cover?.url_list),
        videoUrl,
        imageUrls,
        adapter: "builtin",
        raw: aweme,
    };
};

const mapDyDownloaderDetail = (detail: any, sourceUrl: string): DouyinImportResult => {
    const author = detail?.author || {};
    const videoPlayAddr = detail?.videoPlayAddr || detail?.video?.playAddr;
    const cover = detail?.cover || detail?.video?.cover;
    const images = detail?.images || detail?.imagesVideo || [];
    const title = cleanText(detail?.caption || detail?.desc);
    const imageUrls = Array.isArray(images)
        ? images.flatMap((item: any) => {
              if (typeof item === "string") {
                  return [item];
              }
              if (Array.isArray(item?.urlList)) {
                  return item.urlList;
              }
              if (Array.isArray(item?.url_list)) {
                  return item.url_list;
              }
              return [];
          })
        : [];
    return {
        sourceUrl,
        resolvedUrl: sourceUrl,
        awemeId: cleanText(detail?.awemeId || detail?.aweme_id),
        title,
        desc: cleanText(detail?.desc || title),
        author: cleanText(detail?.nickname || detail?.nicknameRaw || author?.nickname),
        coverUrl: firstUrl(cover),
        videoUrl: normalizeVideoUrl(firstUrl(videoPlayAddr)),
        imageUrls: imageUrls.filter((url: any) => typeof url === "string" && /^https?:\/\//i.test(url)),
        adapter: "dy-downloader",
        raw: detail?.toAwemeData ? detail.toAwemeData() : detail,
    };
};

const fetchByDyDownloader = async (options: DouyinImportOptions): Promise<DouyinImportResult | null> => {
    try {
        const handler = new DouyinHandler({
            cookie: cleanText(options.cookie),
            userAgent: CHROME_UA,
            timeout: 30000,
            retries: 2,
            encryption: "ab",
        } as any);
        const detail: any = await handler.fetchOneVideo(options.url);
        if (!detail) {
            return null;
        }
        const result = mapDyDownloaderDetail(detail, options.url);
        if (result.videoUrl || result.imageUrls?.length || result.desc) {
            return result;
        }
    } catch (e) {
        console.warn("dy-downloader import failed", e);
    }
    return null;
};

const tryParseRouterData = (html: string, sourceUrl: string, resolvedUrl: string): DouyinImportResult | null => {
    const scriptMatch =
        html.match(/<script[^>]+id=["']RENDER_DATA["'][^>]*>([\s\S]*?)<\/script>/i) ||
        html.match(/<script[^>]+id=["']ROUTER_DATA["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch?.[1]) {
        return null;
    }
    let json: any = null;
    try {
        json = JSON.parse(decodeURIComponent(scriptMatch[1]));
    } catch (e) {
        try {
            json = JSON.parse(scriptMatch[1]);
        } catch (ignore) {
            return null;
        }
    }
    const stack = [json];
    while (stack.length) {
        const item = stack.shift();
        if (!item || typeof item !== "object") {
            continue;
        }
        if (item.aweme_detail || item.awemeId || item.aweme_id || item.video) {
            const aweme = item.aweme_detail || item;
            const mapped = mapAwemeDetail(aweme, sourceUrl, resolvedUrl);
            if (mapped.videoUrl || mapped.imageUrls?.length || mapped.desc) {
                mapped.raw = json;
                return mapped;
            }
        }
        Object.values(item).forEach(value => {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        });
    }
    return null;
};

const fetchPageFallback = async (sourceUrl: string, resolvedUrl: string, cookie?: string) => {
    const page = await fetchText(resolvedUrl, cookie);
    return {
        html: page.text,
        parsed: tryParseRouterData(page.text, sourceUrl, page.url || resolvedUrl),
    };
};

const fetchLegacyAwemeDetail = async (awemeId: string, sourceUrl: string, resolvedUrl: string, cookie?: string) => {
    const urls = [
        `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${encodeURIComponent(awemeId)}`,
        `https://www.douyin.com/web/api/v2/aweme/iteminfo/?item_ids=${encodeURIComponent(awemeId)}`,
    ];
    for (const url of urls) {
        try {
            const json = await fetchJson(url, resolvedUrl, cookie);
            const aweme = json?.item_list?.[0] || json?.aweme_detail || json?.aweme || json?.data?.aweme_detail;
            if (!aweme) {
                continue;
            }
            const mapped = mapAwemeDetail(aweme, sourceUrl, resolvedUrl);
            if (mapped.videoUrl || mapped.imageUrls?.length || mapped.desc) {
                return mapped;
            }
        } catch (e) {
            console.warn("douyin legacy detail failed", e);
        }
    }
    return null;
};

const callCustomApi = async (options: DouyinImportOptions): Promise<DouyinImportResult | null> => {
    const customApiUrl = cleanText(options.customApiUrl);
    if (!customApiUrl) {
        return null;
    }
    const res = await fetch(customApiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": Apps.getUserAgent(),
        },
        body: JSON.stringify({
            url: options.url,
            cookie: options.cookie || "",
        }),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json) {
        throw new Error(json?.message || json?.msg || `自定义解析 API 请求失败：HTTP ${res.status}`);
    }
    const data = json.data || json.result || json;
    return {
        sourceUrl: options.url,
        resolvedUrl: data.resolvedUrl || data.url || options.url,
        awemeId: cleanText(data.awemeId || data.aweme_id || data.itemId || data.item_id),
        title: cleanText(data.title || data.desc),
        desc: cleanText(data.desc || data.description || data.title),
        author: cleanText(data.author || data.nickname),
        coverUrl: firstUrl(data.coverUrl, data.cover, data.cover_url),
        videoUrl: normalizeVideoUrl(firstUrl(data.videoUrl, data.video_url, data.url, data.playAddr, data.play_addr)),
        localVideoPath: cleanText(data.localVideoPath || data.local_video_path),
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : Array.isArray(data.images) ? data.images : [],
        adapter: "custom-api",
        raw: json,
    };
};

const fetchDouyinDetail = async (options: DouyinImportOptions): Promise<DouyinImportResult> => {
    const sourceUrl = cleanText(options.url);
    const resolvedUrl = await resolveDouyinUrl(sourceUrl, options.cookie);
    let awemeId = extractAwemeId(resolvedUrl);
    let html = "";
    if (!awemeId) {
        const page = await fetchText(resolvedUrl, options.cookie);
        html = page.text;
        awemeId = extractAwemeId(page.url, page.text);
        const fromPage = tryParseRouterData(page.text, sourceUrl, page.url);
        if (fromPage?.videoUrl || fromPage?.imageUrls?.length) {
            return fromPage;
        }
    }
    if (!awemeId) {
        throw new Error("没有从链接中识别到抖音视频 ID，请确认链接是公开视频链接");
    }
    const detailUrl = new URL("https://www.douyin.com/aweme/v1/web/aweme/detail/");
    detailUrl.searchParams.set("aweme_id", awemeId);
    detailUrl.searchParams.set("aid", "6383");
    detailUrl.searchParams.set("device_platform", "webapp");
    let json: any = null;
    try {
        json = await fetchJson(detailUrl.toString(), resolvedUrl, options.cookie);
    } catch (e: any) {
        if (e instanceof NonJsonResponseError) {
            const legacy = await fetchLegacyAwemeDetail(awemeId, sourceUrl, resolvedUrl, options.cookie);
            if (legacy) {
                return legacy;
            }
            try {
                const fallback = await fetchPageFallback(sourceUrl, resolvedUrl, options.cookie);
                html = fallback.html;
                if (fallback.parsed?.videoUrl || fallback.parsed?.imageUrls?.length) {
                    return fallback.parsed;
                }
            } catch (fallbackError) {
                console.warn("douyin page fallback failed", fallbackError);
            }
            throw new Error(
                [
                    "抖音详情接口返回了网页而不是 JSON，通常是 Cookie 失效、未登录、验证码/风控，或抖音接口策略变化。",
                    e.preview ? `返回片段：${e.preview}` : "",
                    "可以在高级设置里填写当前浏览器 Cookie 后重试，或改用自定义解析 API。",
                ]
                    .filter(Boolean)
                    .join("\n")
            );
        }
        throw e;
    }
    const aweme = json?.aweme_detail || json?.aweme || json?.data?.aweme_detail;
    if (!aweme) {
        const legacy = await fetchLegacyAwemeDetail(awemeId, sourceUrl, resolvedUrl, options.cookie);
        if (legacy) {
            return legacy;
        }
        if (!html) {
            html = (await fetchPageFallback(sourceUrl, resolvedUrl, options.cookie)).html;
        }
        const fromPage = tryParseRouterData(html, sourceUrl, resolvedUrl);
        if (fromPage) {
            return fromPage;
        }
        throw new Error(json?.status_msg || json?.message || "抖音详情接口没有返回视频详情，可能需要 Cookie 或已触发风控");
    }
    return mapAwemeDetail(aweme, sourceUrl, resolvedUrl);
};

const downloadVideo = async (result: DouyinImportResult, cookie?: string) => {
    if (!result.videoUrl) {
        return "";
    }
    const name = cleanText(result.title || result.awemeId || "douyin_video");
    const savePath = await FileIndex.hubFile("mp4", {
        saveGroup: "douyin",
        savePath: "douyin/{year}{month}{day}/{hour}{minute}_{second}_{name}",
        savePathParam: { name },
    });
    const res = await fetch(result.videoUrl, {
        redirect: "follow",
        headers: compactHeaders({
            "User-Agent": CHROME_UA,
            "Referer": result.resolvedUrl || result.sourceUrl,
            "Accept": "video/webm,video/mp4,video/*,*/*;q=0.8",
            "Cookie": cookie,
        }),
    });
    if (!res.ok || !res.body) {
        throw new Error(`视频下载失败：HTTP ${res.status}`);
    }
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const stream = fs.createWriteStream(savePath);
    await finished(Readable.fromWeb(res.body as any).pipe(stream));
    return savePath;
};

const importVideo = async (_: any, options: DouyinImportOptions): Promise<DouyinImportResult> => {
    const sourceUrl = cleanText(options?.url);
    if (!sourceUrl) {
        throw new Error("请先填写抖音视频链接");
    }
    const normalizedOptions = {
        ...options,
        url: sourceUrl,
        cookie: normalizeCookie(options?.cookie),
        customApiUrl: cleanText(options?.customApiUrl),
    };
    let result = await callCustomApi(normalizedOptions);
    if (!result) {
        result = await fetchByDyDownloader(normalizedOptions);
    }
    if (!result) {
        result = await fetchDouyinDetail(normalizedOptions);
    }
    if (normalizedOptions.download !== false && result.videoUrl && !result.localVideoPath) {
        result.localVideoPath = await downloadVideo(result, normalizedOptions.cookie);
    }
    if (!result.videoUrl && !result.localVideoPath && !result.imageUrls?.length) {
        throw new Error("已解析到视频信息，但没有拿到可用的视频或图集地址");
    }
    return result;
};

ipcMain.handle("douyin:importVideo", importVideo);

export default {
    importVideo: (options: DouyinImportOptions) => importVideo(null, options),
};
