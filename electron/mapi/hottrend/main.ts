import { ipcMain } from "electron";

type HotTrendSource = "baidu" | "weibo" | "bilibili" | "douyin" | "meme";

type HotTrendCollectOptions = {
    keyword?: string;
    sources?: HotTrendSource[];
    limit?: number;
    mode?: "meme" | "topic";
};

type HotTrendItem = {
    id: string;
    source: HotTrendSource;
    title: string;
    url?: string;
    summary?: string;
    heat?: string;
    rank?: number;
    raw?: any;
};

const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 6500;

const cleanText = (value: any) =>
    String(value || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();

const makeId = (source: string, title: string, rank?: number) => {
    const seed = `${source}:${rank || 0}:${title}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return `${source}-${hash.toString(16)}`;
};

const fetchText = async (url: string, headers: Record<string, string> = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "User-Agent": CHROME_UA,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                ...headers,
            },
        });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return text;
    } catch (e: any) {
        if (e?.name === "AbortError") {
            throw new Error("请求超时");
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
};

const fetchJson = async (url: string, headers: Record<string, string> = {}) => {
    const text = await fetchText(url, {
        Accept: "application/json, text/plain, */*",
        ...headers,
    });
    return JSON.parse(text);
};

const uniqueItems = (items: HotTrendItem[]) => {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = cleanText(item.title).toLowerCase();
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const uniqueTitles = (titles: string[]) => {
    const seen = new Set<string>();
    return titles
        .map(title => cleanText(title))
        .filter(title => {
            const key = title.toLowerCase();
            if (!key || seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
};

const jsonStringValues = (html: string, keys: string[]) => {
    const values: string[] = [];
    for (const key of keys) {
        const reg = new RegExp(`"${key}"\\s*:\\s*"([^"]{2,120})"`, "g");
        let match: RegExpExecArray | null;
        while ((match = reg.exec(html))) {
            values.push(cleanText(match[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))));
        }
    }
    return values;
};

const collectBaidu = async (limit: number): Promise<HotTrendItem[]> => {
    try {
        const json = await fetchJson("https://top.baidu.com/api/board?platform=wise&tab=realtime", {
            Referer: "https://top.baidu.com/board?tab=realtime",
        });
        const list = Array.isArray(json?.data?.cards?.[0]?.content)
            ? json.data.cards[0].content
            : Array.isArray(json?.data?.list)
              ? json.data.list
              : [];
        const items = list.slice(0, limit).map((item: any, index: number) => {
            const title = cleanText(item?.word || item?.query || item?.title);
            return {
                id: makeId("baidu", title, index + 1),
                source: "baidu" as HotTrendSource,
                title,
                url: item?.url || item?.appUrl || "https://top.baidu.com/board?tab=realtime",
                summary: cleanText(item?.desc || item?.hotTag),
                heat: cleanText(item?.hotScore || item?.hotChange || item?.index),
                rank: Number(item?.rank || index + 1),
            };
        });
        const normalized = uniqueItems(items).slice(0, limit);
        if (normalized.length) {
            return normalized;
        }
    } catch (e) {
        // Fall back to HTML parsing below.
    }
    const html = await fetchText("https://top.baidu.com/board?tab=realtime");
    const titles = [
        ...jsonStringValues(html, ["word", "query", "title"]),
        ...Array.from(html.matchAll(/class="[^"]*c-single-text-ellipsis[^"]*"[^>]*>([\s\S]*?)<\/div>/g)).map(match =>
            cleanText(match[1])
        ),
    ];
    return uniqueTitles(titles)
        .slice(0, limit)
        .map((title, index) => ({
            id: makeId("baidu", title, index + 1),
            source: "baidu",
            title,
            url: "https://top.baidu.com/board?tab=realtime",
            rank: index + 1,
        }));
};

const collectWeibo = async (limit: number): Promise<HotTrendItem[]> => {
    try {
        const json = await fetchJson("https://weibo.com/ajax/side/hotSearch", {
            Referer: "https://weibo.com/",
        });
        const list = Array.isArray(json?.data?.realtime) ? json.data.realtime : [];
        const items = list.slice(0, limit).map((item: any, index: number) => {
            const title = cleanText(item?.word || item?.note);
            return {
                id: makeId("weibo", title, index + 1),
                source: "weibo" as HotTrendSource,
                title,
                url: title ? `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}&Refer=top` : "https://s.weibo.com/top/summary",
                summary: cleanText(item?.word_scheme || item?.label_name),
                heat: cleanText(item?.num || item?.raw_hot),
                rank: index + 1,
            };
        });
        const normalized = uniqueItems(items).slice(0, limit);
        if (normalized.length) {
            return normalized;
        }
    } catch (e) {
        // Fall back to HTML parsing below.
    }
    const html = await fetchText("https://s.weibo.com/top/summary", {
        Referer: "https://weibo.com/",
    });
    const anchors = Array.from(html.matchAll(/<td[^>]*class="td-02"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)).map(
        (match, index) => {
            const title = cleanText(match[2]);
            const url = match[1]?.startsWith("http") ? match[1] : `https://s.weibo.com${match[1] || ""}`;
            return {
                id: makeId("weibo", title, index + 1),
                source: "weibo" as HotTrendSource,
                title,
                url,
                rank: index + 1,
            };
        }
    );
    return uniqueItems(anchors).slice(0, limit);
};

const collectBilibili = async (limit: number): Promise<HotTrendItem[]> => {
    const text = await fetchText("https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1", {
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.bilibili.com/",
    });
    const json = JSON.parse(text);
    const list = Array.isArray(json?.data?.list) ? json.data.list : [];
    return list.slice(0, limit).map((item: any, index: number) => ({
        id: makeId("bilibili", item?.title, index + 1),
        source: "bilibili" as HotTrendSource,
        title: cleanText(item?.title),
        url: item?.short_link_v2 || item?.short_link || item?.bvid ? `https://www.bilibili.com/video/${item.bvid}` : undefined,
        summary: cleanText(item?.desc),
        heat: item?.stat?.view ? `${item.stat.view}播放` : undefined,
        rank: index + 1,
        raw: {
            tname: item?.tname,
            owner: item?.owner?.name,
        },
    }));
};

const parseSearchResultTitles = (html: string, source: HotTrendSource, limit: number) => {
    const titles = [
        ...Array.from(html.matchAll(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi)).map(
            match => ({ title: cleanText(match[2]), url: match[1] })
        ),
        ...Array.from(html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*(?:热梗|梗|爆梗|名场面|口头禅|挑战|流行语)[^<]*)<\/a>/gi)).map(
            match => ({ title: cleanText(match[2]), url: match[1] })
        ),
    ];
    return uniqueItems(
        titles
            .filter(item => /梗|名场面|口头禅|挑战|爆|热词|流行语/.test(item.title))
            .slice(0, limit)
            .map((item, index) => ({
                id: makeId(source, item.title, index + 1),
                source,
                title: item.title,
                url: item.url,
                summary: "搜索到的热梗线索，需要由大模型判断是否可用于脚本。",
                rank: index + 1,
            }))
    );
};

const collectMemeSearch = async (limit: number, option: HotTrendCollectOptions = {}): Promise<HotTrendItem[]> => {
    const year = new Date().getFullYear();
    const keyword = cleanText(option.keyword);
    const queries = [`${keyword} 抖音 热梗 ${year}`.trim(), `短视频 热梗 流行语 ${year}`];
    const nested = await Promise.all(
        queries.map(async query => {
            try {
                const html = await fetchText(
                    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`,
                    { Referer: "https://www.bing.com/" },
                    4500
                );
                return parseSearchResultTitles(html, "meme", Math.ceil(limit / queries.length) + 2);
            } catch (e) {
                return [] as HotTrendItem[];
            }
        })
    );
    return uniqueItems(nested.flat()).slice(0, limit);
};

const collectDouyin = async (limit: number, option: HotTrendCollectOptions = {}): Promise<HotTrendItem[]> => {
    const jsonUrls = [
        "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/",
        "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web",
    ];
    for (const url of jsonUrls) {
        try {
            const json = await fetchJson(url, {
                Referer: "https://www.douyin.com/hot",
            });
            const list =
                (Array.isArray(json?.word_list) && json.word_list) ||
                (Array.isArray(json?.data?.word_list) && json.data.word_list) ||
                (Array.isArray(json?.data?.wordList) && json.data.wordList) ||
                (Array.isArray(json?.data?.list) && json.data.list) ||
                [];
            const items = list.slice(0, limit).map((item: any, index: number) => {
                const title = cleanText(item?.word || item?.sentence || item?.hot_value_desc || item?.title);
                return {
                    id: makeId("douyin", title, index + 1),
                    source: "douyin" as HotTrendSource,
                    title,
                    url: "https://www.douyin.com/hot",
                    summary: cleanText(item?.label || item?.word_sub_board || item?.desc),
                    heat: cleanText(item?.hot_value || item?.value || item?.view_count),
                    rank: index + 1,
                };
            });
            const normalized = uniqueItems(items).slice(0, limit);
            if (normalized.length) {
                const memeItems = await collectMemeSearch(Math.min(6, Math.max(3, Math.floor(limit / 3))), {
                    ...option,
                    keyword: `${option.keyword || ""} 抖音`,
                });
                return uniqueItems([...normalized, ...memeItems.map(item => ({ ...item, source: "douyin" as HotTrendSource }))]).slice(0, limit);
            }
        } catch (e) {
            // Try the next public endpoint, then fall back to page parsing.
        }
    }
    const html = await fetchText("https://www.douyin.com/hot");
    const titles = [
        ...jsonStringValues(html, ["sentence", "word", "title"]),
        ...Array.from(html.matchAll(/"hotspot_word"[^"]*"([^"]{2,80})"/g)).map(match => cleanText(match[1])),
    ];
    const hotItems = uniqueTitles(titles)
        .slice(0, limit)
        .map((title, index) => ({
            id: makeId("douyin", title, index + 1),
            source: "douyin",
            title,
            url: "https://www.douyin.com/hot",
            rank: index + 1,
        }));
    const memeItems = await collectMemeSearch(Math.min(6, Math.max(3, Math.floor(limit / 3))), {
        ...option,
        keyword: `${option.keyword || ""} 抖音`,
    });
    return uniqueItems([...hotItems, ...memeItems.map(item => ({ ...item, source: "douyin" as HotTrendSource }))]).slice(0, limit);
};

const collectors: Record<HotTrendSource, (limit: number, option?: HotTrendCollectOptions) => Promise<HotTrendItem[]>> = {
    baidu: collectBaidu,
    weibo: collectWeibo,
    bilibili: collectBilibili,
    douyin: collectDouyin,
    meme: collectMemeSearch,
};

const collect = async (_event: any, option: HotTrendCollectOptions = {}) => {
    const sources = (option.sources?.length ? option.sources : ["meme", "douyin", "baidu", "weibo", "bilibili"]) as HotTrendSource[];
    const totalLimit = Math.max(10, Math.min(15, Number(option.limit || 15)));
    const perSourceLimit = Math.max(3, Math.min(8, Math.ceil(totalLimit / Math.max(1, sources.length)) + 2));
    const errors: Array<{ source: string; message: string }> = [];
    const nested = await Promise.all(
        sources.map(async source => {
            try {
                const items = await collectors[source](perSourceLimit, option);
                return items.filter(item => item.title);
            } catch (e: any) {
                errors.push({ source, message: e?.message || "采集失败" });
                return [] as HotTrendItem[];
            }
        })
    );
    const sourceCounts = Object.fromEntries(sources.map((source, index) => [source, nested[index]?.length || 0]));
    const items = uniqueItems(nested.flat()).slice(0, totalLimit);
    if (!items.length && errors.length) {
        throw new Error(errors.map(item => `${item.source}: ${item.message}`).join("；"));
    }
    return {
        items,
        errors,
        sourceCounts,
        collectedAt: new Date().toISOString(),
        keyword: cleanText(option.keyword),
    };
};

ipcMain.handle("hottrend:collect", collect);

export default {};
