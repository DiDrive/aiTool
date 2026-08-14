import {app, BrowserWindow, ipcMain, shell} from "electron";
import {spawn, type ChildProcess} from "node:child_process";
import {randomBytes} from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import http, {type Server as HttpServer} from "node:http";
import {AppConfig} from "../../../src/config";
import {extraResolve, extraResolveBin} from "../../lib/env";
import {AppEnv, AppRuntime} from "../env";
import {Log} from "../log";
import {ConfigMain} from "../config/main";

type InfiniteCanvasMode = "external" | "bundled";

type InfiniteCanvasConfig = {
    mode: InfiniteCanvasMode;
    externalUrl: string;
};

type SidecarManifest = {
    version?: string;
    apiExecutable?: string;
    webEntry?: string;
    healthPath?: string;
    loopbackOnly?: boolean;
};

type InfiniteCanvasStatus = {
    mode: InfiniteCanvasMode;
    configuredUrl: string;
    url: string;
    running: boolean;
    installed: boolean;
    starting: boolean;
    bundleRoot: string;
    message?: string;
    version?: string;
    credentials?: {
        username: string;
        password: string;
    };
};

type RuntimeSecrets = {
    jwtSecret: string;
    adminUsername: string;
    adminPassword: string;
    workbenchUsername: string;
    workbenchPassword: string;
};

type InfiniteCanvasOpenOptions = {
    modelConfig?: Record<string, unknown>;
};

type InfiniteCanvasSession = {
    token: string;
    user: Record<string, unknown>;
};

const CONFIG_KEY = "infiniteCanvas";
const DEFAULT_EXTERNAL_URL = "";
const WINDOW_NAME = "infiniteCanvas";
const LOCAL_HOST = "127.0.0.1";
const DEFAULT_HEALTH_PATH = "/api/health";

let apiProcess: ChildProcess | null = null;
let webProcess: ChildProcess | null = null;
let runtimeUrl = "";
let startingPromise: Promise<InfiniteCanvasStatus> | null = null;
let lastRuntimeSecrets: RuntimeSecrets | null = null;
let shuttingDown = false;
let quitCleanupComplete = false;
let clipBridge: HttpServer | null = null;
let clipBridgeUrl = "";
let clipBridgeToken = "";

const defaultConfig = (): InfiniteCanvasConfig => ({
    mode: "bundled",
    externalUrl: DEFAULT_EXTERNAL_URL,
});

const normalizeBaseUrl = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error("画布地址必须是有效的 http:// 或 https:// URL");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("画布地址只支持 http:// 或 https://");
    }
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
};

const getConfig = async (): Promise<InfiniteCanvasConfig> => {
    const saved = (await ConfigMain.get(CONFIG_KEY, defaultConfig())) || {};
    return {
        mode: saved.mode === "external" ? "external" : "bundled",
        externalUrl: saved.externalUrl ? normalizeBaseUrl(saved.externalUrl) : "",
    };
};

const setConfig = async (patch: Partial<InfiniteCanvasConfig>) => {
    const current = await getConfig();
    const next: InfiniteCanvasConfig = {
        mode: patch.mode === "external" ? "external" : patch.mode === "bundled" ? "bundled" : current.mode,
        externalUrl:
            patch.externalUrl === undefined ? current.externalUrl : normalizeBaseUrl(patch.externalUrl),
    };
    await ConfigMain.set(CONFIG_KEY, next);
    return next;
};

const bundleRoot = () => {
    const override = String(process.env.AIGCPANEL_INFINITE_CANVAS_ROOT || "").trim();
    return override ? path.resolve(override) : extraResolve(path.join("common", "infinite-canvas"));
};

const manifestPath = () => path.join(bundleRoot(), "sidecar.json");

const readManifest = (): SidecarManifest | null => {
    try {
        // Windows PowerShell 5 writes UTF-8 with a BOM by default. Accept it so
        // hand-authored and older generated manifests remain readable.
        const content = fs.readFileSync(manifestPath(), "utf8").replace(/^\uFEFF/, "");
        return JSON.parse(content);
    } catch {
        return null;
    }
};

const resolveInsideBundle = (relativePath: string) => {
    const root = path.resolve(bundleRoot());
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("sidecar.json 包含越界路径");
    }
    return target;
};

const isBundleInstalled = (manifest = readManifest()) => {
    if (!manifest?.apiExecutable || !manifest?.webEntry || manifest.loopbackOnly !== true) return false;
    try {
        return fs.existsSync(resolveInsideBundle(manifest.apiExecutable)) && fs.existsSync(resolveInsideBundle(manifest.webEntry));
    } catch {
        return false;
    }
};

const healthUrl = (baseUrl: string, healthPath = DEFAULT_HEALTH_PATH) => {
    const parsed = new URL(baseUrl);
    parsed.pathname = healthPath.startsWith("/") ? healthPath : `/${healthPath}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
};

const probe = async (baseUrl: string, healthPath = DEFAULT_HEALTH_PATH, timeoutMs = 3500) => {
    if (!baseUrl) return {running: false, message: "尚未配置画布地址"};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(healthUrl(baseUrl, healthPath), {
            method: "GET",
            signal: controller.signal,
            redirect: "error",
        });
        if (!response.ok) return {running: false, message: `健康检查返回 HTTP ${response.status}`};
        return {running: true};
    } catch (error) {
        const message = (error as Error)?.name === "AbortError" ? "健康检查超时" : (error as Error)?.message || String(error);
        return {running: false, message};
    } finally {
        clearTimeout(timer);
    }
};

const availablePort = (start: number): Promise<number> =>
    new Promise((resolve, reject) => {
        const tryPort = (port: number) => {
            if (port >= 65535) return reject(new Error("没有可用端口"));
            const server = net.createServer();
            server.unref();
            server.once("error", () => tryPort(port + 1));
            server.listen(port, LOCAL_HOST, () => {
                server.close(() => resolve(port));
            });
        };
        tryPort(start);
    });

const runtimeRoot = () => path.join(AppEnv.dataRoot, "infinite-canvas");
const runtimeSecretsFile = () => path.join(runtimeRoot(), "runtime.json");

const loadRuntimeSecrets = (): RuntimeSecrets => {
    fs.mkdirSync(runtimeRoot(), {recursive: true});
    try {
        const parsed = JSON.parse(fs.readFileSync(runtimeSecretsFile(), "utf8"));
        if (parsed.jwtSecret && parsed.adminUsername && parsed.adminPassword) {
            const secrets: RuntimeSecrets = {
                ...parsed,
                workbenchUsername: parsed.workbenchUsername || "workbench",
                workbenchPassword: parsed.workbenchPassword || randomBytes(18).toString("base64url"),
            };
            if (!parsed.workbenchUsername || !parsed.workbenchPassword) {
                fs.writeFileSync(runtimeSecretsFile(), JSON.stringify(secrets, null, 2), {encoding: "utf8", mode: 0o600});
            }
            return secrets;
        }
    } catch {}
    const secrets: RuntimeSecrets = {
        jwtSecret: randomBytes(32).toString("base64url"),
        adminUsername: "admin",
        adminPassword: randomBytes(18).toString("base64url"),
        workbenchUsername: "workbench",
        workbenchPassword: randomBytes(18).toString("base64url"),
    };
    fs.writeFileSync(runtimeSecretsFile(), JSON.stringify(secrets, null, 2), {encoding: "utf8", mode: 0o600});
    return secrets;
};

const openLogFile = (name: string) => {
    const logDir = path.join(runtimeRoot(), "logs");
    fs.mkdirSync(logDir, {recursive: true});
    return fs.openSync(path.join(logDir, `${name}.log`), "a");
};

const spawnOwned = (command: string, args: string[], options: {cwd: string; env: NodeJS.ProcessEnv; logName: string}) => {
    const logFd = openLogFile(options.logName);
    const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        shell: false,
        stdio: ["ignore", logFd, logFd],
    });
    child.once("error", error => Log.error(`InfiniteCanvas.${options.logName}.error`, error));
    child.once("exit", (code, signal) => {
        Log.info(`InfiniteCanvas.${options.logName}.exit`, {code, signal});
        fs.close(logFd, () => {});
    });
    return child;
};

const stopChild = async (child: ChildProcess | null) => {
    if (!child?.pid || child.exitCode !== null) return;
    await new Promise<void>(resolve => {
        let finished = false;
        const done = () => {
            if (finished) return;
            finished = true;
            resolve();
        };
        child.once("exit", done);
        if (process.platform === "win32") {
            const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
                windowsHide: true,
                stdio: "ignore",
                shell: false,
            });
            killer.once("exit", done);
            killer.once("error", done);
        } else {
            child.kill("SIGTERM");
        }
        setTimeout(done, 5000);
    });
};

async function stop() {
    const api = apiProcess;
    const web = webProcess;
    apiProcess = null;
    webProcess = null;
    runtimeUrl = "";
    const bridge = clipBridge;
    clipBridge = null;
    clipBridgeUrl = "";
    clipBridgeToken = "";
    if (bridge) await new Promise<void>(resolve => bridge.close(() => resolve()));
    await Promise.all([stopChild(web), stopChild(api)]);
    return await status();
}

const runFfmpeg = (args: string[]) => new Promise<void>((resolve, reject) => {
    const child = spawn(extraResolveBin("ffmpeg"), args, {windowsHide: true, shell: false, stdio: ["ignore", "ignore", "pipe"]});
    let stderr = "";
    child.stderr?.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(stderr || `FFmpeg exited with ${code}`)));
});

const ensureClipBridge = async () => {
    if (clipBridge && clipBridgeUrl && clipBridgeToken) return {url: clipBridgeUrl, token: clipBridgeToken};
    clipBridgeToken = randomBytes(32).toString("base64url");
    clipBridge = http.createServer((request, response) => {
        const origin = String(request.headers.origin || "");
        const allowedOrigin = runtimeUrl && isAllowedWindowUrl(origin, runtimeUrl);
        response.setHeader("Access-Control-Allow-Origin", allowedOrigin ? origin : "null");
        response.setHeader("Vary", "Origin");
        if (request.method === "OPTIONS") {
            response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Clip-Start-Ms, X-Clip-End-Ms");
            response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
            response.writeHead(204).end();
            return;
        }
        if (!allowedOrigin || request.method !== "POST" || request.url !== "/clip" || request.headers.authorization !== `Bearer ${clipBridgeToken}`) {
            response.writeHead(403, {"Content-Type": "application/json"}).end(JSON.stringify({message: "拒绝访问裁剪服务"}));
            return;
        }
        const startMs = Number(request.headers["x-clip-start-ms"]);
        const endMs = Number(request.headers["x-clip-end-ms"]);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || endMs - startMs > 6 * 60 * 60 * 1000) {
            response.writeHead(400, {"Content-Type": "application/json"}).end(JSON.stringify({message: "裁剪时间范围无效"}));
            return;
        }
        const maxBytes = 2 * 1024 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let size = 0;
        request.on("data", chunk => {
            size += chunk.length;
            if (size > maxBytes) request.destroy(new Error("视频文件过大"));
            else chunks.push(Buffer.from(chunk));
        });
        request.on("end", () => void (async () => {
            const jobDir = path.join(runtimeRoot(), "clips", randomBytes(10).toString("hex"));
            fs.mkdirSync(jobDir, {recursive: true});
            const input = path.join(jobDir, "input.mp4");
            const output = path.join(jobDir, "output.mp4");
            try {
                fs.writeFileSync(input, Buffer.concat(chunks));
                await runFfmpeg(["-i", input, "-ss", String(startMs / 1000), "-t", String((endMs - startMs) / 1000), "-c:v", "libx264", "-profile:v", "main", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-avoid_negative_ts", "make_zero", "-y", output]);
                const result = fs.readFileSync(output);
                response.writeHead(200, {"Content-Type": "video/mp4", "Content-Length": result.length}).end(result);
            } catch (error) {
                response.writeHead(500, {"Content-Type": "application/json"}).end(JSON.stringify({message: (error as Error)?.message || "裁剪失败"}));
            } finally {
                fs.rmSync(jobDir, {recursive: true, force: true});
            }
        })());
    });
    const port = await availablePort(31980);
    await new Promise<void>((resolve, reject) => clipBridge!.listen(port, LOCAL_HOST, resolve).once("error", reject));
    clipBridgeUrl = `http://${LOCAL_HOST}:${port}`;
    return {url: clipBridgeUrl, token: clipBridgeToken};
};

const waitUntilReady = async (url: string, healthPath: string, timeoutMs = 90000) => {
    const startedAt = Date.now();
    let result = await probe(url, healthPath);
    while (!result.running && Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = await probe(url, healthPath);
    }
    if (!result.running) throw new Error(result.message || "画布服务启动超时");
};

const startBundled = async (): Promise<InfiniteCanvasStatus> => {
    if (shuttingDown) throw new Error("应用正在退出，不能启动画布服务");
    const manifest = readManifest();
    if (!manifest || !isBundleInstalled(manifest)) {
        throw new Error(`未找到已声明仅监听回环地址的本地画布运行包，请放置到：${bundleRoot()}`);
    }
    if (apiProcess || webProcess) await stop();

    const apiPort = await availablePort(31880);
    const webPort = await availablePort(apiPort + 1);
    const apiExecutable = resolveInsideBundle(manifest.apiExecutable!);
    const webEntry = resolveInsideBundle(manifest.webEntry!);
    const dataDir = runtimeRoot();
    const healthPath = manifest.healthPath || DEFAULT_HEALTH_PATH;
    const apiUrl = `http://${LOCAL_HOST}:${apiPort}`;
    const webUrl = `http://${LOCAL_HOST}:${webPort}`;
    const secrets = loadRuntimeSecrets();
    lastRuntimeSecrets = secrets;
    fs.mkdirSync(path.join(dataDir, "logs", "ai-calls"), {recursive: true});

    const commonEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ADMIN_USERNAME: secrets.adminUsername,
        ADMIN_PASSWORD: secrets.adminPassword,
        JWT_SECRET: secrets.jwtSecret,
        STORAGE_DRIVER: "sqlite",
        DATABASE_DSN: path.join(dataDir, "infinite-canvas.db"),
        AI_LOG_DIR: path.join(dataDir, "logs", "ai-calls"),
        PUBLIC_BASE_URL: webUrl,
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
    };

    apiProcess = spawnOwned(apiExecutable, [], {
        cwd: dataDir,
        env: {...commonEnv, PORT: String(apiPort), BIND_ADDRESS: LOCAL_HOST},
        logName: "api",
    });
    await waitUntilReady(apiUrl, healthPath, 60000);
    if (shuttingDown) throw new Error("应用正在退出，已取消启动画布服务");

    webProcess = spawnOwned(process.execPath, [webEntry], {
        cwd: path.dirname(webEntry),
        env: {
            ...commonEnv,
            ELECTRON_RUN_AS_NODE: "1",
            NODE_ENV: "production",
            HOSTNAME: LOCAL_HOST,
            PORT: String(webPort),
            API_BASE_URL: apiUrl,
        },
        logName: "web",
    });
    runtimeUrl = webUrl;
    await waitUntilReady(webUrl, healthPath, 90000);
    return await status();
};

async function start() {
    if (shuttingDown) throw new Error("应用正在退出，不能启动画布服务");
    if (startingPromise) return await startingPromise;
    startingPromise = (async () => {
        const config = await getConfig();
        if (config.mode === "external") {
            const result = await probe(config.externalUrl);
            return await status(result);
        }
        try {
            return await startBundled();
        } catch (error) {
            await stop();
            throw error;
        }
    })();
    try {
        return await startingPromise;
    } finally {
        startingPromise = null;
    }
}

async function status(knownProbe?: {running: boolean; message?: string}): Promise<InfiniteCanvasStatus> {
    const config = await getConfig();
    const manifest = readManifest();
    const url = config.mode === "external" ? config.externalUrl : runtimeUrl;
    const result = knownProbe || (url ? await probe(url, manifest?.healthPath || DEFAULT_HEALTH_PATH) : {running: false});
    return {
        mode: config.mode,
        configuredUrl: config.externalUrl,
        url,
        running: result.running,
        installed: isBundleInstalled(manifest),
        starting: !!startingPromise,
        bundleRoot: bundleRoot(),
        message: result.message,
        version: manifest?.version,
        credentials:
            config.mode === "bundled" && lastRuntimeSecrets
                ? {username: lastRuntimeSecrets.adminUsername, password: lastRuntimeSecrets.adminPassword}
                : undefined,
    };
}

const isAllowedWindowUrl = (candidate: string, baseUrl: string) => {
    try {
        return new URL(candidate).origin === new URL(baseUrl).origin;
    } catch {
        return false;
    }
};

const postSidecar = async <T>(baseUrl: string, pathname: string, body: unknown, token?: string): Promise<T> => {
    const response = await fetch(new URL(pathname, `${baseUrl}/`), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify(body),
    });
    const payload = await response.json() as {code?: number; data?: T; msg?: string};
    if (!response.ok || payload.code !== 0 || payload.data === undefined) {
        throw new Error(payload.msg || `画布接口返回 HTTP ${response.status}`);
    }
    return payload.data;
};

const ensureWorkbenchSession = async (baseUrl: string) => {
    const secrets = lastRuntimeSecrets || loadRuntimeSecrets();
    const credentials = {username: secrets.workbenchUsername, password: secrets.workbenchPassword};
    try {
        return await postSidecar<InfiniteCanvasSession>(baseUrl, "/api/auth/login", credentials);
    } catch {
        return await postSidecar<InfiniteCanvasSession>(baseUrl, "/api/auth/register", credentials);
    }
};

const syncWorkbenchConfig = async (baseUrl: string, token: string, modelConfig?: Record<string, unknown>) => {
    if (!modelConfig) return;
    await postSidecar(baseUrl, "/api/v1/user-config/model", {config: modelConfig}, token);
};

const canvasPageUrl = (baseUrl: string) => new URL("/canvas", `${baseUrl}/`).toString();

const open = async (options: InfiniteCanvasOpenOptions = {}) => {
    let current = await status();
    if (!current.running) current = await start();
    if (!current.running || !current.url) throw new Error(current.message || "画布服务不可用");

    const session = current.mode === "bundled" ? await ensureWorkbenchSession(current.url) : null;
    if (session) await syncWorkbenchConfig(current.url, session.token, options.modelConfig);

    const existing = AppRuntime.windows[WINDOW_NAME];
    if (existing && !existing.isDestroyed()) {
        if (session && options.modelConfig) {
            await existing.loadURL(canvasPageUrl(current.url));
        }
        existing.show();
        existing.focus();
        return current;
    }

    const win = new BrowserWindow({
        title: `${AppConfig.title} - 无限画布`,
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: "#111827",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false,
        },
    });
    AppRuntime.windows[WINDOW_NAME] = win;
    const partition = win.webContents.session;
    partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win.webContents.setWindowOpenHandler(({url}) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return {action: "deny"};
    });
    win.webContents.on("will-navigate", (event, url) => {
        if (!isAllowedWindowUrl(url, current.url)) event.preventDefault();
    });
    win.once("closed", () => {
        if (AppRuntime.windows[WINDOW_NAME] === win) delete AppRuntime.windows[WINDOW_NAME];
    });
    if (session) {
        await win.loadURL(current.url);
        const persistedSession = JSON.stringify({state: {token: session.token}, version: 0});
        await win.webContents.executeJavaScript(
            `localStorage.setItem("infinite-canvas-auth-token-v1", ${JSON.stringify(persistedSession)})`
        );
        const bridge = await ensureClipBridge();
        await win.webContents.executeJavaScript(`sessionStorage.setItem("aigcpanel-clip-bridge", ${JSON.stringify(JSON.stringify(bridge))})`);
        await win.loadURL(canvasPageUrl(current.url));
    } else {
        await win.loadURL(current.url);
    }
    win.show();
    return current;
};

const configure = async (patch: Partial<InfiniteCanvasConfig>) => {
    const previous = await getConfig();
    const next = await setConfig(patch);
    if (previous.mode !== next.mode || previous.externalUrl !== next.externalUrl) {
        const win = AppRuntime.windows[WINDOW_NAME];
        if (win && !win.isDestroyed()) win.close();
        if (apiProcess || webProcess) await stop();
    }
    return await status();
};

ipcMain.handle("infiniteCanvas:status", () => status());
ipcMain.handle("infiniteCanvas:configure", (_event, patch: Partial<InfiniteCanvasConfig>) => configure(patch || {}));
ipcMain.handle("infiniteCanvas:start", () => start());
ipcMain.handle("infiniteCanvas:stop", () => stop());
ipcMain.handle("infiniteCanvas:open", (_event, options: InfiniteCanvasOpenOptions = {}) => open(options));

app.on("before-quit", event => {
    if (quitCleanupComplete || (!apiProcess && !webProcess && !startingPromise)) return;
    event.preventDefault();
    shuttingDown = true;
    void stop().finally(() => {
        quitCleanupComplete = true;
        app.quit();
    });
});

export const InfiniteCanvasMain = {
    status,
    configure,
    start,
    stop,
    open,
    destroy: stop,
};

export default InfiniteCanvasMain;
