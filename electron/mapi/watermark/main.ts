import {ipcMain, nativeImage} from "electron";
import {spawn} from "child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Files} from "../file/main";
import {extraResolveBin} from "../../lib/env";

type WatermarkBox = {
    name: string;
    confidence: number;
    source: "local" | "vision";
    x: number;
    y: number;
    width: number;
    height: number;
    feather?: number;
    padding?: number;
};

type VideoRepairPayload = {
    input: string;
    masks: WatermarkBox[];
    outputName?: string;
    keepAudio?: boolean;
};

type RepairServiceStatus = {
    running: boolean;
    url: string;
    message?: string;
    data?: any;
};

type VisionDetectConfig = {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    path?: string;
    prompt?: string;
};

type ImageBitmapData = {
    buffer: Buffer;
    width: number;
    height: number;
};

type ComponentBox = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    area: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampPercent = (value: number) => Math.round(clamp(value, 0, 100) * 10) / 10;
let repairServiceProcess: ReturnType<typeof spawn> | null = null;
const defaultVisionPrompt = [
    "你是一个图片/视频画面水印检测器，只检测可见水印、平台标识、版权字样、半透明 logo、角标文字。",
    "不要检测普通画面物体、云朵、装饰、人物、背景纹理。",
    "请返回严格 JSON，不要 markdown，不要解释。格式：",
    "{\"watermarks\":[{\"name\":\"右下角平台文字水印\",\"text\":\"豆包AI生成\",\"x\":86.5,\"y\":91.8,\"width\":12.2,\"height\":5.1,\"confidence\":0.96}]}",
    "坐标必须是百分比，x/y 是左上角，width/height 是宽高。没有水印返回 {\"watermarks\":[]}。",
].join("\n");

const defaultRepairServiceUrl = "http://127.0.0.1:7860";
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const normalizeServiceUrl = (url?: string) => String(url || defaultRepairServiceUrl).replace(/\/+$/, "");
const isLocalServiceUrl = (url?: string) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(normalizeServiceUrl(url));

const repairServerScriptCandidates = () => {
    const roots = [
        process.cwd(),
        path.resolve(currentDir, "../../../"),
        path.resolve(process.resourcesPath || "", "app"),
        path.resolve(process.resourcesPath || ""),
    ];
    return roots
        .filter(Boolean)
        .flatMap(root => [
            path.resolve(root, "AI_Live_Server", "watermark_repair_server.py"),
            path.resolve(root, "resources", "AI_Live_Server", "watermark_repair_server.py"),
        ]);
};

const findRepairServerScript = () => {
    const script = repairServerScriptCandidates().find(item => fs.existsSync(item));
    if (!script) {
        throw new Error("找不到 AI_Live_Server/watermark_repair_server.py，请确认 ProPainter 修复服务文件已随应用放置");
    }
    return script;
};

const probeRepairService = async (url?: string): Promise<RepairServiceStatus> => {
    const baseUrl = normalizeServiceUrl(url);
    try {
        const response = await fetch(`${baseUrl}/api/watermark/status`, {method: "GET"});
        if (!response.ok) {
            return {running: false, url: baseUrl, message: `HTTP ${response.status}`};
        }
        const data = await response.json().catch(() => ({}));
        return {running: true, url: baseUrl, data};
    } catch (e) {
        return {running: false, url: baseUrl, message: (e as Error).message || String(e)};
    }
};

const waitRepairService = async (url?: string, timeoutMs = 90000) => {
    const startedAt = Date.now();
    let lastStatus = await probeRepairService(url);
    while (!lastStatus.running && Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        lastStatus = await probeRepairService(url);
    }
    return lastStatus;
};

const startRepairService = async (url?: string): Promise<RepairServiceStatus> => {
    const baseUrl = normalizeServiceUrl(url);
    const current = await probeRepairService(baseUrl);
    if (current.running) {
        return current;
    }
    if (!isLocalServiceUrl(baseUrl)) {
        return current;
    }
    const script = findRepairServerScript();
    const serverDir = path.dirname(script);
    const propainterRoot = path.resolve(serverDir, "third_party", "ProPainter");
    const propainterPython = path.resolve(propainterRoot, ".venv", "Scripts", "python.exe");
    const pythonPath = fs.existsSync(propainterPython) ? propainterPython : "python";
    const port = new URL(baseUrl).port || "7860";
    const logDir = path.resolve(process.env.TEMP || serverDir, "aigcpanel-watermark-logs");
    fs.mkdirSync(logDir, {recursive: true});
    const serviceLog = path.resolve(logDir, "repair-service-process.log");
    const logFd = fs.openSync(serviceLog, "a");
    const commandTemplate = [
        `"${pythonPath}"`,
        `"${path.resolve(propainterRoot, "inference_propainter.py")}"`,
        "-i",
        "\"{input}\"",
        "-m",
        "\"{mask}\"",
        "-o",
        "\"{output_dir}\"",
        "--fp16",
        "--resize_ratio",
        "0.5",
        "--subvideo_length",
        "40",
        "--neighbor_length",
        "5",
        "--ref_stride",
        "20",
    ].join(" ");
    repairServiceProcess = spawn(pythonPath, [script], {
        cwd: serverDir,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
        env: {
            ...process.env,
            WATERMARK_REPAIR_PORT: port,
            WATERMARK_LOG_DIR: logDir,
            PROPAINTER_ROOT: propainterRoot,
            PROPAINTER_PYTHON: pythonPath,
            PROPAINTER_COMMAND: commandTemplate,
            NO_PROXY: "*",
            no_proxy: "*",
        },
    });
    repairServiceProcess.unref();
    return await waitRepairService(baseUrl);
};

const loadBitmap = (input: string): ImageBitmapData => {
    if (!input || !fs.existsSync(input)) {
        throw new Error(`图片不存在: ${input}`);
    }
    const image = nativeImage.createFromPath(input);
    if (image.isEmpty()) {
        throw new Error("图片读取失败或格式不支持");
    }
    const size = image.getSize();
    return {
        buffer: image.toBitmap(),
        width: size.width,
        height: size.height,
    };
};

const pixelOffset = (width: number, x: number, y: number) => (y * width + x) * 4;

const isLightStroke = (buffer: Buffer, width: number, x: number, y: number) => {
    const i = pixelOffset(width, x, y);
    const c1 = buffer[i];
    const c2 = buffer[i + 1];
    const c3 = buffer[i + 2];
    const max = Math.max(c1, c2, c3);
    const min = Math.min(c1, c2, c3);
    const saturation = max === 0 ? 0 : (max - min) / max;
    return max > 178 && saturation < 0.34;
};

const buildRegionComponents = (
    bitmap: ImageBitmapData,
    region: {name: string; x: number; y: number; width: number; height: number}
) => {
    const sx = Math.round((region.x / 100) * bitmap.width);
    const sy = Math.round((region.y / 100) * bitmap.height);
    const sw = Math.max(8, Math.min(bitmap.width - sx, Math.round((region.width / 100) * bitmap.width)));
    const sh = Math.max(8, Math.min(bitmap.height - sy, Math.round((region.height / 100) * bitmap.height)));
    const binary = new Uint8Array(sw * sh);
    const visited = new Uint8Array(sw * sh);

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            if (isLightStroke(bitmap.buffer, bitmap.width, sx + x, sy + y)) {
                binary[y * sw + x] = 1;
            }
        }
    }

    const components: ComponentBox[] = [];
    const stack: number[] = [];
    for (let start = 0; start < binary.length; start++) {
        if (!binary[start] || visited[start]) {
            continue;
        }
        visited[start] = 1;
        stack.push(start);
        let minX = sw;
        let minY = sh;
        let maxX = 0;
        let maxY = 0;
        let area = 0;
        while (stack.length) {
            const current = stack.pop() as number;
            const x = current % sw;
            const y = Math.floor(current / sw);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            area++;
            for (const next of [current - 1, current + 1, current - sw, current + sw]) {
                if (next < 0 || next >= binary.length || visited[next] || !binary[next]) {
                    continue;
                }
                const nx = next % sw;
                const ny = Math.floor(next / sw);
                if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
                    continue;
                }
                visited[next] = 1;
                stack.push(next);
            }
        }

        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const fill = area / Math.max(1, cw * ch);
        const isTextLike =
            area >= 3 &&
            area <= Math.max(220, sw * sh * 0.018) &&
            cw >= 2 &&
            ch >= 3 &&
            cw <= sw * 0.36 &&
            ch <= sh * 0.5 &&
            fill <= 0.82;
        if (isTextLike) {
            components.push({minX, minY, maxX, maxY, area});
        }
    }
    return {sx, sy, sw, sh, components};
};

const componentWidth = (item: ComponentBox) => item.maxX - item.minX + 1;
const componentHeight = (item: ComponentBox) => item.maxY - item.minY + 1;
const componentCenterX = (item: ComponentBox) => (item.minX + item.maxX) / 2;
const componentCenterY = (item: ComponentBox) => (item.minY + item.maxY) / 2;

const componentToBox = (
    bitmap: ImageBitmapData,
    region: {name: string; x: number; y: number; width: number; height: number},
    source: {sx: number; sy: number; sw: number; sh: number; components: ComponentBox[]}
): WatermarkBox | null => {
    const textLike = source.components.filter(item => {
        const w = componentWidth(item);
        const h = componentHeight(item);
        const fill = item.area / Math.max(1, w * h);
        return (
            item.area >= 3 &&
            item.area <= Math.max(180, source.sw * source.sh * 0.008) &&
            w >= 2 &&
            h >= 3 &&
            w <= source.sw * 0.22 &&
            h <= source.sh * 0.36 &&
            fill <= 0.78
        );
    });
    if (textLike.length < 2) {
        return null;
    }

    const rowTolerance = Math.max(6, Math.round(source.sh * 0.08));
    const lineCandidates: ComponentBox[][] = [];
    const sortedByY = [...textLike].sort((a, b) => componentCenterY(a) - componentCenterY(b));
    for (const item of sortedByY) {
        const target = lineCandidates.find(line => {
            const avgY = line.reduce((sum, comp) => sum + componentCenterY(comp), 0) / line.length;
            return Math.abs(componentCenterY(item) - avgY) <= rowTolerance;
        });
        if (target) {
            target.push(item);
        } else {
            lineCandidates.push([item]);
        }
    }

    const clusters: ComponentBox[][] = [];
    lineCandidates.forEach(line => {
        const sorted = [...line].sort((a, b) => a.minX - b.minX);
        let current: ComponentBox[] = [];
        sorted.forEach(item => {
            if (!current.length) {
                current.push(item);
                return;
            }
            const prev = current[current.length - 1];
            const avgHeight = current.reduce((sum, comp) => sum + componentHeight(comp), 0) / current.length;
            const gap = item.minX - prev.maxX;
            if (gap <= Math.max(18, avgHeight * 2.8)) {
                current.push(item);
            } else {
                if (current.length >= 2) {
                    clusters.push(current);
                }
                current = [item];
            }
        });
        if (current.length >= 2) {
            clusters.push(current);
        }
    });

    const scored = clusters
        .map(cluster => {
            const minX = Math.min(...cluster.map(item => item.minX));
            const minY = Math.min(...cluster.map(item => item.minY));
            const maxX = Math.max(...cluster.map(item => item.maxX));
            const maxY = Math.max(...cluster.map(item => item.maxY));
            const w = maxX - minX + 1;
            const h = maxY - minY + 1;
            const area = cluster.reduce((sum, item) => sum + item.area, 0);
            const density = area / Math.max(1, w * h);
            const aspect = w / Math.max(1, h);
            const rightAligned = region.x > 50 ? maxX > source.sw * 0.62 : true;
            const leftAligned = region.x === 0 ? minX < source.sw * 0.38 : true;
            const lowerAligned = region.y > 60 ? maxY > source.sh * 0.35 : true;
            const notHuge = w <= source.sw * 0.58 && h <= source.sh * 0.34;
            const shapeOk = w >= 18 && h >= 7 && aspect >= 1.5 && aspect <= 16 && density >= 0.012 && density <= 0.62;
            const alignOk = rightAligned && leftAligned && lowerAligned;
            const score = (shapeOk ? 0.45 : 0) +
                (alignOk ? 0.25 : 0) +
                Math.min(0.18, cluster.length / 38) +
                Math.min(0.12, density * 2);
            return {
                cluster,
                minX,
                minY,
                maxX,
                maxY,
                w,
                h,
                density,
                score: notHuge && shapeOk && alignOk ? score : 0,
            };
        })
        .filter(item => item.score >= 0.62)
        .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best) {
        return null;
    }

    const padX = Math.max(8, Math.round(best.w * 0.2));
    const padY = Math.max(5, Math.round(best.h * 0.45));
    const x1 = clamp(source.sx + best.minX - padX, 0, bitmap.width - 1);
    const y1 = clamp(source.sy + best.minY - padY, 0, bitmap.height - 1);
    const x2 = clamp(source.sx + best.maxX + padX, 0, bitmap.width - 1);
    const y2 = clamp(source.sy + best.maxY + padY, 0, bitmap.height - 1);

    return {
        name: region.name,
        confidence: Math.min(0.98, best.score),
        source: "local",
        x: clampPercent((x1 / bitmap.width) * 100),
        y: clampPercent((y1 / bitmap.height) * 100),
        width: clampPercent(((x2 - x1 + 1) / bitmap.width) * 100),
        height: clampPercent(((y2 - y1 + 1) / bitmap.height) * 100),
    };
};

const detectImage = (input: string): WatermarkBox[] => {
    const bitmap = loadBitmap(input);
    const regions = [
        {name: "左上角浅色文字水印", x: 0, y: 0, width: 34, height: 24},
        {name: "右上角浅色文字水印", x: 66, y: 0, width: 34, height: 24},
        {name: "左下角浅色文字水印", x: 0, y: 72, width: 42, height: 28},
        {name: "右下角浅色文字水印", x: 58, y: 72, width: 42, height: 28},
        {name: "底部浅色文字水印", x: 18, y: 76, width: 64, height: 24},
    ];

    const boxes = regions
        .map(region => {
            const source = buildRegionComponents(bitmap, region);
            return componentToBox(bitmap, region, source);
        })
        .filter(Boolean) as WatermarkBox[];

    return mergeBoxes(boxes);
};

const mimeFromPath = (input: string) => {
    const ext = path.extname(input || "").replace(".", "").toLowerCase();
    if (ext === "jpg" || ext === "jpeg") {
        return "image/jpeg";
    }
    if (ext === "webp") {
        return "image/webp";
    }
    return "image/png";
};

const imageDataUrlFromInput = (input: string) => {
    if (!input || !fs.existsSync(input)) {
        throw new Error(`图片不存在: ${input}`);
    }
    const buffer = fs.readFileSync(input);
    return `data:${mimeFromPath(input)};base64,${buffer.toString("base64")}`;
};

const normalizeVisionEndpoint = (baseUrl: string, apiPath: string = "/chat/completions") => {
    const base = String(baseUrl || "").trim().replace(/\/+$/, "");
    const route = String(apiPath || "/chat/completions").trim();
    if (!base) {
        throw new Error("请先填写 AI 视觉模型 API 地址");
    }
    if (/\/chat\/completions$/i.test(base)) {
        return base;
    }
    return `${base}${route.startsWith("/") ? route : `/${route}`}`;
};

const extractJsonText = (value: any): string => {
    if (!value) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        return value
            .map(item => {
                if (typeof item === "string") {
                    return item;
                }
                return item?.text || item?.content || "";
            })
            .join("\n");
    }
    return value?.text || value?.content || "";
};

const parseVisionJson = (response: any) => {
    const content =
        response?.choices?.[0]?.message?.content ??
        response?.choices?.[0]?.text ??
        response?.data ??
        response;
    if (typeof content === "object" && !Array.isArray(content)) {
        return content;
    }
    let text = extractJsonText(content).trim();
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const jsonStarts = ["{", "["]
        .map(char => text.indexOf(char))
        .filter(index => index >= 0);
    const start = jsonStarts.length ? Math.min(...jsonStarts) : -1;
    if (start > 0) {
        text = text.slice(start);
    }
    if (start < 0) {
        throw new Error("AI视觉模型未返回可解析 JSON");
    }
    return JSON.parse(text);
};

const normalizeVisionBoxes = (raw: any): WatermarkBox[] => {
    const items = Array.isArray(raw)
        ? raw
        : raw?.watermarks || raw?.masks || raw?.boxes || raw?.data?.watermarks || [];
    if (!Array.isArray(items)) {
        return [];
    }
    return items
        .map((item: any, index: number) => {
            const box = item?.boxPercent || item?.box || item?.bbox || item?.rect || item;
            const x = Number(box?.x ?? box?.left ?? (Array.isArray(box) ? box[0] : 0));
            const y = Number(box?.y ?? box?.top ?? (Array.isArray(box) ? box[1] : 0));
            const width = Number(box?.width ?? box?.w ?? (Array.isArray(box) ? box[2] : 0));
            const height = Number(box?.height ?? box?.h ?? (Array.isArray(box) ? box[3] : 0));
            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
                return null;
            }
            return {
                name: item?.name || item?.label || item?.text || `AI识别水印 ${index + 1}`,
                confidence: clamp(Number(item?.confidence ?? item?.score ?? 0.85), 0, 1),
                source: "vision" as const,
                x: clampPercent(x),
                y: clampPercent(y),
                width: clampPercent(width),
                height: clampPercent(height),
            };
        })
        .filter(Boolean) as WatermarkBox[];
};

const detectVision = async (payload: {input?: string; imageDataUrl?: string; config?: VisionDetectConfig}) => {
    const config = payload.config || {};
    const endpoint = normalizeVisionEndpoint(config.baseUrl || "", config.path || "/chat/completions");
    const model = String(config.model || "").trim();
    const apiKey = String(config.apiKey || "").trim();
    if (!model) {
        throw new Error("请先填写 AI 视觉模型名称");
    }
    const imageUrl = payload.imageDataUrl || imageDataUrlFromInput(payload.input || "");
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(apiKey ? {Authorization: `Bearer ${apiKey}`} : {}),
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
                {
                    role: "user",
                    content: [
                        {type: "text", text: config.prompt || defaultVisionPrompt},
                        {type: "image_url", image_url: {url: imageUrl}},
                    ],
                },
            ],
        }),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`AI视觉识别失败 HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
    }
    const json = await response.json();
    return normalizeVisionBoxes(parseVisionJson(json));
};

const mergeBoxes = (boxes: WatermarkBox[]) => {
    const result: WatermarkBox[] = [];
    boxes
        .sort((a, b) => b.confidence - a.confidence)
        .forEach(box => {
            const duplicate = result.some(existing => {
                const ax2 = box.x + box.width;
                const ay2 = box.y + box.height;
                const bx2 = existing.x + existing.width;
                const by2 = existing.y + existing.height;
                const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(box.x, existing.x));
                const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(box.y, existing.y));
                const overlap = overlapX * overlapY;
                const area = Math.min(box.width * box.height, existing.width * existing.height);
                return area > 0 && overlap / area > 0.35;
            });
            if (!duplicate) {
                result.push(box);
            }
        });
    return result.slice(0, 4);
};

const repairImage = async (input: string, masks: WatermarkBox[]) => {
    const bitmap = loadBitmap(input);
    const repaired = Buffer.from(bitmap.buffer);
    const maskPixels = new Uint8Array(bitmap.width * bitmap.height);

    masks.forEach(mask => {
        const boxPixelSize = Math.max(
            ((mask.width || 0) / 100) * bitmap.width,
            ((mask.height || 0) / 100) * bitmap.height
        );
        const basePadding = Number(mask.padding ?? mask.feather ?? 8);
        const padding = Math.max(12, basePadding * 2, Math.round(boxPixelSize * 0.16));
        const x1 = clamp(Math.floor((mask.x / 100) * bitmap.width - padding), 0, bitmap.width - 1);
        const y1 = clamp(Math.floor((mask.y / 100) * bitmap.height - padding), 0, bitmap.height - 1);
        const x2 = clamp(Math.ceil(((mask.x + mask.width) / 100) * bitmap.width + padding), 0, bitmap.width);
        const y2 = clamp(Math.ceil(((mask.y + mask.height) / 100) * bitmap.height + padding), 0, bitmap.height);
        for (let y = y1; y < y2; y++) {
            for (let x = x1; x < x2; x++) {
                maskPixels[y * bitmap.width + x] = 1;
            }
        }
    });

    const currentMask = new Uint8Array(maskPixels);
    const neighborOffsets = [
        {dx: -1, dy: -1, weight: 0.7},
        {dx: 0, dy: -1, weight: 1},
        {dx: 1, dy: -1, weight: 0.7},
        {dx: -1, dy: 0, weight: 1},
        {dx: 1, dy: 0, weight: 1},
        {dx: -1, dy: 1, weight: 0.7},
        {dx: 0, dy: 1, weight: 1},
        {dx: 1, dy: 1, weight: 0.7},
        {dx: -2, dy: 0, weight: 0.45},
        {dx: 2, dy: 0, weight: 0.45},
        {dx: 0, dy: -2, weight: 0.45},
        {dx: 0, dy: 2, weight: 0.45},
    ];
    const maxIterations = Math.min(160, Math.max(24, Math.ceil(Math.max(bitmap.width, bitmap.height) * 0.08)));
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        const updates: Array<{x: number; y: number; color: [number, number, number, number]}> = [];
        for (let y = 0; y < bitmap.height; y++) {
            for (let x = 0; x < bitmap.width; x++) {
                const index = y * bitmap.width + x;
                if (!currentMask[index]) {
                    continue;
                }
                let wSum = 0;
                let c0 = 0;
                let c1 = 0;
                let c2 = 0;
                let c3 = 0;
                for (const offset of neighborOffsets) {
                    const nx = x + offset.dx;
                    const ny = y + offset.dy;
                    if (nx < 0 || nx >= bitmap.width || ny < 0 || ny >= bitmap.height) {
                        continue;
                    }
                    if (currentMask[ny * bitmap.width + nx]) {
                        continue;
                    }
                    const from = pixelOffset(bitmap.width, nx, ny);
                    wSum += offset.weight;
                    c0 += repaired[from] * offset.weight;
                    c1 += repaired[from + 1] * offset.weight;
                    c2 += repaired[from + 2] * offset.weight;
                    c3 += repaired[from + 3] * offset.weight;
                }
                if (wSum > 0) {
                    updates.push({
                        x,
                        y,
                        color: [
                            Math.round(c0 / wSum),
                            Math.round(c1 / wSum),
                            Math.round(c2 / wSum),
                            Math.round(c3 / wSum),
                        ],
                    });
                }
            }
        }
        if (!updates.length) {
            break;
        }
        updates.forEach(update => {
            const to = pixelOffset(bitmap.width, update.x, update.y);
            repaired[to] = update.color[0];
            repaired[to + 1] = update.color[1];
            repaired[to + 2] = update.color[2];
            repaired[to + 3] = update.color[3];
            currentMask[update.y * bitmap.width + update.x] = 0;
        });
    }

    for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
            if (!currentMask[y * bitmap.width + x]) {
                continue;
            }
            const to = pixelOffset(bitmap.width, x, y);
            const fallbackY = clamp(y - 1, 0, bitmap.height - 1);
            const from = pixelOffset(bitmap.width, x, fallbackY);
            repaired[to] = repaired[from];
            repaired[to + 1] = repaired[from + 1];
            repaired[to + 2] = repaired[from + 2];
            repaired[to + 3] = repaired[from + 3];
        }
    }

    const output = await Files.temp("png", "watermark-repair");
    const image = nativeImage.createFromBitmap(repaired, {
        width: bitmap.width,
        height: bitmap.height,
        scaleFactor: 1,
    });
    fs.writeFileSync(output, image.toPNG());
    return output;
};

const ffprobeVideoSize = async (input: string): Promise<{width: number; height: number}> => {
    const ffprobePath = extraResolveBin("ffprobe");
    return new Promise((resolve, reject) => {
        const proc = spawn(ffprobePath, [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=s=x:p=0",
            input,
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", data => {
            stdout += data.toString();
        });
        proc.stderr.on("data", data => {
            stderr += data.toString();
        });
        proc.on("error", reject);
        proc.on("close", code => {
            if (code !== 0) {
                reject(new Error(stderr || `ffprobe exited with ${code}`));
                return;
            }
            const [width, height] = stdout.trim().split("x").map(value => parseInt(value, 10));
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                reject(new Error("无法读取视频尺寸"));
                return;
            }
            resolve({width, height});
        });
    });
};

const runFfmpeg = async (args: string[]) => {
    const ffmpegPath = extraResolveBin("ffmpeg");
    return new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegPath, args);
        let stderr = "";
        proc.stderr.on("data", data => {
            stderr += data.toString();
        });
        proc.on("error", reject);
        proc.on("close", code => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr.slice(-1200) || `ffmpeg exited with ${code}`));
        });
    });
};

const repairVideo = async (payload: VideoRepairPayload) => {
    if (!payload.input || !fs.existsSync(payload.input)) {
        throw new Error(`视频不存在: ${payload.input}`);
    }
    const masks = (payload.masks || []).filter(mask => mask.width > 0 && mask.height > 0);
    if (!masks.length) {
        throw new Error("缺少水印区域");
    }
    const {width, height} = await ffprobeVideoSize(payload.input);
    const filters = masks.map(mask => {
        if (mask.width >= 45 || mask.height >= 16 || mask.width * mask.height >= 420) {
            throw new Error("本地快速修复只适合小面积固定水印；当前水印框过大，请先缩小区域，或改用 ProPainter/ComfyUI 时序修复");
        }
        const boxPixelSize = Math.max((mask.width / 100) * width, (mask.height / 100) * height);
        const padding = Math.max(6, Number(mask.padding ?? mask.feather ?? 8), Math.round(boxPixelSize * 0.08));
        const x = Math.round(clamp(Math.floor((mask.x / 100) * width - padding), 1, width - 4));
        const y = Math.round(clamp(Math.floor((mask.y / 100) * height - padding), 1, height - 4));
        const w = Math.round(clamp(Math.ceil((mask.width / 100) * width + padding * 2), 2, width - x - 2));
        const h = Math.round(clamp(Math.ceil((mask.height / 100) * height + padding * 2), 2, height - y - 2));
        if (w < 2 || h < 2 || x < 0 || y < 0 || x + w >= width || y + h >= height) {
            return "";
        }
        return `delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0`;
    }).filter(Boolean);
    if (!filters.length) {
        throw new Error("水印区域过于贴边或尺寸异常，无法生成有效 delogo 区域，请手动把区域稍微向画面内移动一点");
    }
    const output = await Files.temp("mp4", "watermark-video-repair");
    const args = [
        "-y",
        "-i",
        payload.input,
        "-vf",
        filters.join(","),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        ...(payload.keepAudio === false ? ["-an"] : ["-c:a", "copy"]),
        "-movflags",
        "+faststart",
        output,
    ];
    await runFfmpeg(args);
    return output;
};

ipcMain.handle("watermark:detect", async (_event, payload: {input: string}) => {
    return {
        watermarks: detectImage(payload.input),
    };
});

ipcMain.handle("watermark:detectVision", async (_event, payload: {input?: string; imageDataUrl?: string; config?: VisionDetectConfig}) => {
    return {
        watermarks: await detectVision(payload),
    };
});

ipcMain.handle("watermark:repairImage", async (_event, payload: {input: string; masks: WatermarkBox[]}) => {
    return {
        output: await repairImage(payload.input, payload.masks || []),
    };
});

ipcMain.handle("watermark:repairVideo", async (_event, payload: VideoRepairPayload) => {
    return {
        output: await repairVideo(payload),
    };
});

ipcMain.handle("watermark:repairServiceStatus", async (_event, payload: {url?: string}) => {
    return await probeRepairService(payload?.url);
});

ipcMain.handle("watermark:startRepairService", async (_event, payload: {url?: string}) => {
    return await startRepairService(payload?.url);
});

export default {
    detectImage,
    detectVision,
    repairImage,
    repairVideo,
    probeRepairService,
    startRepairService,
};
