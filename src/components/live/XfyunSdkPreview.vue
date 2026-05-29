<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from "vue";

const props = defineProps<{
    active: boolean;
    scriptUrl: string;
    globalName: string;
    appId: string;
    apiKey: string;
    apiSecret: string;
    sceneId: string;
    useInlinePlayer: boolean;
    globalParams: string;
    muted: boolean;
    volume: number;
}>();

const hostRef = ref<HTMLElement | null>(null);
const statusText = ref("");
const errorText = ref("");
const needResume = ref(false);

let sdkInstance: any = null;
let bootSeq = 0;

const scriptCache = new Map<string, Promise<void>>();
const moduleCache = new Map<string, Promise<any>>();

const canBoot = computed(() => {
    return !!props.active && !!props.scriptUrl.trim() && !!props.appId.trim() && !!props.apiKey.trim() && !!props.apiSecret.trim() && !!props.sceneId.trim();
});

function parseGlobalParams() {
    const raw = String(props.globalParams || "").trim();
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e: any) {
        throw new Error("SDK 全局参数 JSON 格式不正确");
    }
}

function cleanupInstance() {
    needResume.value = false;
    statusText.value = "";
    const current = sdkInstance;
    sdkInstance = null;
    if (!current) {
        return;
    }
    try {
        if (typeof current.stop === "function") {
            current.stop();
        }
    } catch (e) {
    }
    try {
        if (typeof current.destroy === "function") {
            current.destroy();
        }
    } catch (e) {
    }
    if (hostRef.value) {
        hostRef.value.innerHTML = "";
    }
}

function applyPlayerState() {
    const player = sdkInstance?.player;
    if (!player) {
        return;
    }
    try {
        player.muted = props.muted;
    } catch (e) {
    }
    try {
        player.volume = Math.max(0, Math.min(1, props.volume / 100));
    } catch (e) {
    }
}

function bindSdkEvents(instance: any) {
    if (typeof instance?.on !== "function") {
        return;
    }
    const handlers: Array<[string, (...args: any[]) => void]> = [
        ["playNotAllowed", () => {
            needResume.value = true;
            statusText.value = "浏览器阻止了自动播放，点击画面继续预览";
        }],
        ["PlayerEvents.playNotAllowed", () => {
            needResume.value = true;
            statusText.value = "浏览器阻止了自动播放，点击画面继续预览";
        }],
        ["error", (err: any) => {
            errorText.value = err?.message || err?.msg || "SDK 预览启动失败";
        }],
        ["PlayerEvents.error", (err: any) => {
            errorText.value = err?.message || err?.msg || "SDK 播放器异常";
        }],
        ["connected", () => {
            statusText.value = "SDK 预览已连接";
        }],
    ];
    for (const [name, fn] of handlers) {
        try {
            instance.on(name, fn);
        } catch (e) {
        }
    }
}

async function loadScript(url: string) {
    const normalized = url.trim();
    if (!normalized) {
        throw new Error("请先配置 SDK 脚本地址");
    }
    if (!scriptCache.has(normalized)) {
        scriptCache.set(normalized, new Promise<void>((resolve, reject) => {
            const existed = Array.from(document.scripts).find(item => item.src === normalized);
            if (existed) {
                resolve();
                return;
            }
            const script = document.createElement("script");
            script.src = normalized;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("SDK 脚本加载失败"));
            document.head.appendChild(script);
        }));
    }
    return await scriptCache.get(normalized)!;
}

function normalizeScriptUrl(rawUrl: string) {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) return "";
    if (/^(https?:|file:|blob:|data:)/i.test(trimmed)) {
        return trimmed;
    }
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
        return "file:///" + trimmed.replace(/\\/g, "/");
    }
    return trimmed;
}

function pickCtorFromModule(mod: any) {
    if (!mod) return null;
    const candidates = [
        mod.default,
        mod.AvatarPlatform,
        mod.IAvatarPlatform,
    ];
    for (const item of candidates) {
        if (typeof item === "function") {
            return item;
        }
    }
    return null;
}

async function loadCtorFromModule(url: string) {
    const normalized = normalizeScriptUrl(url);
    if (!normalized) {
        return null;
    }
    if (!moduleCache.has(normalized)) {
        moduleCache.set(normalized, import(/* @vite-ignore */ normalized));
    }
    try {
        const mod = await moduleCache.get(normalized)!;
        return pickCtorFromModule(mod);
    } catch (e) {
        return null;
    }
}

function resolveCtorFromGlobal() {
    const names = Array.from(new Set([
        String(props.globalName || "").trim(),
        "AvatarPlatform",
        "avatarPlatform",
        "AvatarSDK",
        "AvatarSdk",
    ].filter(Boolean)));
    for (const name of names) {
        const target = (window as any)[name];
        if (target) {
            return target?.default || target;
        }
    }
    return null;
}

async function resolveCtor() {
    const globalCtor = resolveCtorFromGlobal();
    if (globalCtor) {
        return globalCtor;
    }
    const moduleCtor = await loadCtorFromModule(props.scriptUrl);
    if (moduleCtor) {
        return moduleCtor;
    }
    await loadScript(props.scriptUrl);
    const afterScriptCtor = resolveCtorFromGlobal();
    if (afterScriptCtor) {
        return afterScriptCtor;
    }
    throw new Error(`未找到 SDK 构造器，请检查脚本地址和全局对象名（当前: ${props.globalName || "AvatarPlatform"}）`);
}

function createSdkInstance(Ctor: any) {
    const host = hostRef.value;
    const variants = [
        {root: host, props: {useInlinePlayer: props.useInlinePlayer}},
        {el: host, props: {useInlinePlayer: props.useInlinePlayer}},
        {container: host, props: {useInlinePlayer: props.useInlinePlayer}},
        {props: {useInlinePlayer: props.useInlinePlayer}},
        undefined,
    ];
    let lastError: any = null;
    for (const options of variants) {
        try {
            return options === undefined ? new Ctor() : new Ctor(options);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("SDK 实例初始化失败");
}

async function bootSdkPreview() {
    const seq = ++bootSeq;
    cleanupInstance();
    errorText.value = "";
    needResume.value = false;
    if (!props.active) {
        return;
    }
    if (!canBoot.value) {
        statusText.value = "请先补齐 SDK 脚本、AppId、ApiKey、ApiSecret 和 SceneId";
        return;
    }
    statusText.value = "正在初始化 SDK 预览...";
    try {
        const Ctor = await resolveCtor();
        const instance = createSdkInstance(Ctor);
        if (typeof instance?.setApiInfo !== "function" || typeof instance?.setGlobalParams !== "function" || typeof instance?.start !== "function") {
            throw new Error("SDK 接口不匹配，缺少 setApiInfo / setGlobalParams / start");
        }
        sdkInstance = instance;
        bindSdkEvents(instance);
        instance.setApiInfo({
            appId: props.appId,
            apiKey: props.apiKey,
            apiSecret: props.apiSecret,
            sceneId: props.sceneId,
        });
        const globalParams = parseGlobalParams();
        instance.setGlobalParams(globalParams);
        applyPlayerState();
        await instance.start();
        if (seq !== bootSeq) {
            cleanupInstance();
            return;
        }
        applyPlayerState();
        statusText.value = "SDK 预览已启动";
    } catch (e: any) {
        errorText.value = e?.message || String(e || "SDK 预览启动失败");
        cleanupInstance();
    }
}

async function resumePlayer() {
    const player = sdkInstance?.player;
    if (!player || typeof player.resume !== "function") {
        return;
    }
    try {
        await player.resume();
        needResume.value = false;
        statusText.value = "SDK 预览已恢复";
    } catch (e: any) {
        errorText.value = e?.message || "恢复预览失败";
    }
}

watch(
    () => [
        props.active,
        props.scriptUrl,
        props.globalName,
        props.appId,
        props.apiKey,
        props.apiSecret,
        props.sceneId,
        props.useInlinePlayer,
        props.globalParams,
    ],
    async () => {
        await bootSdkPreview();
    },
    {immediate: true}
);

watch(
    () => [props.muted, props.volume],
    () => {
        applyPlayerState();
    }
);

onBeforeUnmount(() => {
    cleanupInstance();
});
</script>

<template>
    <div ref="hostRef" class="absolute inset-0 w-full h-full">
        <div v-if="statusText && !errorText" class="absolute left-4 top-4 z-20 rounded bg-black/50 px-3 py-1 text-xs text-white">
            {{ statusText }}
        </div>
        <div v-if="needResume" class="absolute inset-0 z-30 flex items-center justify-center bg-black/55">
            <button class="rounded bg-white px-4 py-2 text-sm font-medium text-gray-900" @click="resumePlayer">
                点击恢复声音和预览
            </button>
        </div>
        <div v-if="errorText" class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 px-6 text-center text-white">
            <div class="text-lg font-medium">SDK 预览启动失败</div>
            <div class="mt-2 text-sm opacity-90">{{ errorText }}</div>
        </div>
    </div>
</template>
