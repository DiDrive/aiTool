<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useTaskChangeRefresh } from "../../hooks/task";
import { Dialog } from "../../lib/dialog";
import { TaskRecord, TaskService } from "../../service/TaskService";
import CloudTaskSidebarItem from "./CloudTaskSidebarItem.vue";

type CapabilityFilter = "all" | "image" | "video" | "lipsync" | "audio" | "voice-clone" | "digital-human";
type DisplayStatus = "queue" | "running" | "success" | "fail";
type StatusFilter = "all" | DisplayStatus;

const collapsed = ref(false);
const capabilityFilter = ref<CapabilityFilter>("all");
const statusFilter = ref<StatusFilter>("all");
const records = ref<TaskRecord[]>([]);
const sidebarWidth = ref(400);
const isResizing = ref(false);
const nowMs = ref(Date.now());
const router = useRouter();
let resizeStartX = 0;
let resizeStartWidth = 400;
let clockTimer = 0;

const SIDEBAR_MIN_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_DEFAULT_WIDTH = 400;

const capabilityTabs = [
    { label: "全部", value: "all" },
    { label: "生图", value: "image" },
    { label: "视频", value: "video" },
    { label: "口型", value: "lipsync" },
    { label: "音频", value: "audio" },
    { label: "音色", value: "voice-clone" },
    { label: "数字人", value: "digital-human" },
];

const statusTabs = [
    { label: "全部", value: "all" },
    { label: "排队", value: "queue" },
    { label: "运行中", value: "running" },
    { label: "成功", value: "success" },
    { label: "失败", value: "fail" },
];

const resolveDisplayStatus = (record: TaskRecord): DisplayStatus => {
    const localStatus = String(record?.status || "").toLowerCase();
    const remoteStatus = String((record as any)?.jobResult?.Query?.taskStatus || "").toUpperCase();
    if (remoteStatus === "SUCCESS") {
        return "success";
    }
    if (remoteStatus === "FAILED" || remoteStatus === "CANCELLED" || remoteStatus === "STOPPED") {
        return "fail";
    }
    if (localStatus === "running" || localStatus === "querying" || (record as any)?.jobResult?.Query?.status === "running") {
        return "running";
    }
    if (localStatus === "success") {
        return "success";
    }
    if (localStatus === "fail") {
        return "fail";
    }
    return "queue";
};

const refresh = async () => {
    const [runningHubRecords, directApiRecords, marketingChainRecords, marketingFinalizeRecords] = await Promise.all([
        TaskService.list("RunningHubTask"),
        TaskService.list("DirectApiTask"),
        TaskService.list("MarketingVideoChainTask"),
        TaskService.list("MarketingVideoFinalizeTask"),
    ]);
    records.value = [...runningHubRecords, ...directApiRecords, ...marketingChainRecords, ...marketingFinalizeRecords].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
};

const directApiEditTarget = (record: TaskRecord) => {
    const title = String((record as any)?.modelConfig?.templateTitle || "").toLowerCase();
    const body = String((record as any)?.modelConfig?.requestBodyJson || "").toLowerCase();
    if (title.includes("seedance") || body.includes("seedance-2.0") || body.includes("kw-video-v2")) {
        return { path: "/video", tab: "ToolSeedance" };
    }
    if (title.includes("gpt image 2") || body.includes("gpt-image-2")) {
        return { path: "/image", tab: "ToolGptImage2" };
    }
    return null;
};

const cloudTemplateEditTarget = (record: TaskRecord) => {
    if (record.biz !== "RunningHubTask" || !(record as any)?.modelConfig?.templateId) {
        return null;
    }
    const capability = String((record as any)?.modelConfig?.capability || "");
    const mapping: Record<string, { path: string; tab: string }> = {
        image: { path: "/image", tab: "CloudImage" },
        video: { path: "/video", tab: "CloudVideo" },
        audio: { path: "/sound", tab: "CloudAudio" },
        "voice-clone": { path: "/sound", tab: "CloudVoiceClone" },
        lipsync: { path: "/live", tab: "CloudLipSync" },
        "digital-human": { path: "/live", tab: "CloudDigitalHuman" },
    };
    return mapping[capability] || null;
};

const taskEditTarget = (record: TaskRecord) => {
    return directApiEditTarget(record) || cloudTemplateEditTarget(record);
};

const editTask = async (record: TaskRecord) => {
    const target = taskEditTarget(record);
    if (!target || !record.id) {
        Dialog.tipError("当前任务暂不支持重新编辑");
        return;
    }
    await router.push({
        path: target.path,
        query: {
            tab: target.tab,
            editTaskId: String(record.id),
            _t: String(Date.now()),
        },
    });
};

const canRegenerateTask = (record: TaskRecord) => {
    return !!taskEditTarget(record);
};

const shortPathName = (value: string) => {
    return String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .pop() || "素材";
};

const mentionTokenOfPath = (value: string) => {
    return "@" + shortPathName(value).replace(/\s+/g, "_");
};

const urlKeyOfSeedanceAsset = (type: string) => {
    return type === "image" ? "image_url" : type === "video" ? "video_url" : "audio_url";
};

const buildSeedanceContentItem = (type: string, url: string, role: string) => {
    const key = urlKeyOfSeedanceAsset(type);
    return {
        type: key,
        [key]: { url },
        role,
    };
};

const seedanceReferenceUrlOf = (item: any) => {
    if (!item || !["reference_image", "reference_video", "reference_audio"].includes(String(item.role || ""))) {
        return "";
    }
    return String(item?.[item.type]?.url || "").trim();
};

const seedanceMentionLabelOf = (type: string, index: number) => {
    if (type === "image") {
        return `参考图${index + 1}`;
    }
    if (type === "video") {
        return `参考视频${index + 1}`;
    }
    return `参考音频${index + 1}`;
};

const splitSeedanceSpeechFromVisualText = (value: string) => {
    const speeches: string[] = [];
    const visualText = value.replace(/(说|说道|喊|念|口播|对白|台词)[：:]\s*([^。！？；;\n]+[。！？]?)/g, (_match, verb, line) => {
        const index = speeches.length + 1;
        speeches.push(String(line || "").trim());
        return `${verb}台词${index}`;
    });
    return { visualText, speeches };
};

const buildSeedancePromptText = (prompt: string, selectedAssets: any[]) => {
    let text = String(prompt || "").trim();
    if (!selectedAssets.length) {
        return text.replace(/@\S+/g, "").trim();
    }
    const legend = selectedAssets.map((asset, index) => {
        const url = String(asset?.url || "");
        const type = String(asset?.type || "");
        const label = seedanceMentionLabelOf(type, index);
        text = text.split(mentionTokenOfPath(url)).join(`「${label}」`);
        return `${label} = ${type === "video" ? "视频" : type === "audio" ? "音频" : "图片"}「${shortPathName(url)}」`;
    });
    text = text.replace(/@\S+/g, "").replace(/\s{2,}/g, " ").trim();
    const speechSplit = splitSeedanceSpeechFromVisualText(text);
    const speechLines = speechSplit.speeches.map((line, index) => `台词${index + 1}：「${line}」`);
    return [
        "参考素材绑定（必须严格遵守，不要互换、融合或串用）：",
        ...legend,
        "生成时凡是提到某个参考素材编号，只能使用该编号对应素材的身份、外观、服装、车辆、场景或动作信息；多个角色同时出现时，必须分别保持各自参考图的人物身份，不要把一个角色的脸、身体或服装套到另一个角色身上。",
        "台词、字幕或对白中的姓名、自称、品牌名只作为口播文本，不得据此改变参考素材绑定的人物身份或长相；如果台词姓名与参考素材外观冲突，必须以参考素材外观为准。",
        "画面身份优先级最高：视觉外观只来自参考素材编号和画面动作描述；禁止因为台词里出现名人姓名而生成该名人的脸。",
        "",
        "画面/动作要求（只决定画面，不把台词里的姓名当作人物身份）：",
        speechSplit.visualText,
        ...(speechLines.length ? ["", "口播/字幕要求（只决定嘴型、字幕和声音，不参与人物外观身份）：", ...speechLines] : []),
    ].filter(Boolean).join("\n");
};

const normalizeSeedanceClone = (cloned: TaskRecord) => {
    const config = (cloned as any)?.modelConfig;
    const bodyText = String(config?.requestBodyJson || "");
    const title = String(config?.templateTitle || "").toLowerCase();
    if (!title.includes("seedance") && !bodyText.toLowerCase().includes("seedance-2.0") && !bodyText.toLowerCase().includes("kw-video-v2")) {
        return;
    }
    try {
        const body = JSON.parse(bodyText || "{}");
        const input = (cloned as any)?.param?.input || {};
        const hasSeedanceInput =
            typeof input.prompt === "string" ||
            typeof input.mode === "string" ||
            typeof input.firstFrame === "string" ||
            typeof input.lastFrame === "string" ||
            Array.isArray(input.assets);
        if (!hasSeedanceInput) {
            return;
        }
        const prompt = String(input.prompt || "");
        const content: any[] = [];
        if (input.mode === "frames") {
            const cleanPrompt = prompt.replace(/@\S+/g, "").trim();
            if (cleanPrompt) {
                content.push({ type: "text", text: cleanPrompt });
            }
            if (input.firstFrame) {
                content.push(buildSeedanceContentItem("image", String(input.firstFrame), "first_frame"));
            }
            if (input.lastFrame) {
                content.push(buildSeedanceContentItem("image", String(input.lastFrame), "last_frame"));
            }
        } else {
            const assets = Array.isArray(input.assets) ? input.assets : [];
            const selectedIds = new Set(Array.isArray(input.mentionAssetIds) ? input.mentionAssetIds.map((item: any) => String(item)) : []);
            const referencedUrls = new Set((Array.isArray(body.content) ? body.content : []).map(seedanceReferenceUrlOf).filter(Boolean));
            const selectedAssets = assets.filter((asset: any) => {
                const url = String(asset?.url || "").trim();
                const id = String(asset?.id || "");
                return url && ((selectedIds.size > 0 && selectedIds.has(id)) || (selectedIds.size === 0 && referencedUrls.size > 0 && referencedUrls.has(url)));
            });
            const cleanPrompt = buildSeedancePromptText(prompt, selectedAssets);
            if (cleanPrompt) {
                content.push({ type: "text", text: cleanPrompt });
            }
            for (const asset of selectedAssets) {
                const url = String(asset?.url || "").trim();
                const type = String(asset?.type || "");
                if (url && type) {
                    content.push(buildSeedanceContentItem(type, url, type === "image" ? "reference_image" : type === "video" ? "reference_video" : "reference_audio"));
                }
            }
        }
        body.content = content;
        config.requestBodyJson = JSON.stringify(body, null, 2);
    } catch (e) {
        // 旧任务请求体异常时保留原样，避免再次生成入口直接失效。
    }
};

const cloneTaskRecord = (record: TaskRecord): TaskRecord => {
    const cloned = JSON.parse(JSON.stringify(record || {}));
    delete cloned.id;
    delete cloned.status;
    delete cloned.statusMsg;
    delete cloned.startTime;
    delete cloned.endTime;
    delete cloned.jobResult;
    delete cloned.result;
    delete cloned.runtime;
    cloned.title = `${String(record.title || "任务").replace(/_再次生成\d*$/, "")}_再次生成`;
    normalizeSeedanceClone(cloned);
    return cloned;
};

const regenerateTask = async (record: TaskRecord) => {
    if (!canRegenerateTask(record)) {
        Dialog.tipError("当前任务暂不支持再次生成");
        return;
    }
    await TaskService.submit(cloneTaskRecord(record));
    Dialog.tipSuccess("已按原配置再次提交");
    await refresh();
};

const deleteTask = async (record: TaskRecord) => {
    if (!record.id) {
        Dialog.tipError("任务记录不完整，无法删除");
        return;
    }
    const status = resolveDisplayStatus(record);
    if (status !== "success" && status !== "fail") {
        Dialog.tipError("只有已完成或已失败的任务可以删除");
        return;
    }
    try {
        await TaskService.delete(record);
        Dialog.tipSuccess("任务记录已删除");
        await refresh();
    } catch (e: any) {
        Dialog.tipError(String(e?.message || e || "删除任务失败"));
    }
};

const filteredRecords = computed(() => {
    return records.value.filter(record => {
        const capability = record.biz === "MarketingVideoChainTask" ? "video" : record.modelConfig?.capability;
        if (capabilityFilter.value !== "all" && capability !== capabilityFilter.value) {
            return false;
        }
        if (statusFilter.value !== "all" && resolveDisplayStatus(record) !== statusFilter.value) {
            return false;
        }
        return true;
    });
});

const displayedRecords = computed(() => filteredRecords.value);

const summary = computed(() => {
    const result = {
        running: 0,
        success: 0,
        fail: 0,
        queue: 0,
    };
    for (const record of records.value) {
        const status = resolveDisplayStatus(record);
        if (status === "running") {
            result.running += 1;
        } else if (status === "success") {
            result.success += 1;
        } else if (status === "fail") {
            result.fail += 1;
        } else {
            result.queue += 1;
        }
    }
    return result;
});

const savePrefs = async () => {
    await window.$mapi.storage.set("cloudTaskSidebar", "state", {
        collapsed: collapsed.value,
        capabilityFilter: capabilityFilter.value,
        statusFilter: statusFilter.value,
        sidebarWidth: sidebarWidth.value,
    });
};

const clampSidebarWidth = (width: number) => {
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
};

const stopResize = () => {
    if (!isResizing.value) {
        return;
    }
    isResizing.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    savePrefs();
};

const onResizeMove = (event: MouseEvent) => {
    if (!isResizing.value) {
        return;
    }
    const delta = resizeStartX - event.clientX;
    sidebarWidth.value = clampSidebarWidth(resizeStartWidth + delta);
};

const startResize = (event: MouseEvent) => {
    if (collapsed.value) {
        return;
    }
    isResizing.value = true;
    resizeStartX = event.clientX;
    resizeStartWidth = sidebarWidth.value;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
};

useTaskChangeRefresh("RunningHubTask", () => {
    refresh();
});

useTaskChangeRefresh("DirectApiTask", () => {
    refresh();
});

useTaskChangeRefresh("MarketingVideoChainTask", () => {
    refresh();
});

useTaskChangeRefresh("MarketingVideoFinalizeTask", () => {
    refresh();
});

watch([capabilityFilter, statusFilter], () => {
    savePrefs();
});

watch(collapsed, () => {
    savePrefs();
});

watch(sidebarWidth, value => {
    if (!collapsed.value) {
        sidebarWidth.value = clampSidebarWidth(value);
    }
});

onMounted(async () => {
    const saved = await window.$mapi.storage.get("cloudTaskSidebar", "state", {
        collapsed: false,
        capabilityFilter: "all",
        statusFilter: "all",
        sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    });
    collapsed.value = !!saved?.collapsed;
    capabilityFilter.value = saved?.capabilityFilter || "all";
    statusFilter.value = saved?.statusFilter || "all";
    sidebarWidth.value = clampSidebarWidth(Number(saved?.sidebarWidth || SIDEBAR_DEFAULT_WIDTH));
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", stopResize);
    clockTimer = window.setInterval(() => {
        nowMs.value = Date.now();
    }, 1000);
    await refresh();
});

onBeforeUnmount(() => {
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", stopResize);
    if (clockTimer) {
        window.clearInterval(clockTimer);
        clockTimer = 0;
    }
    stopResize();
});
</script>

<template>
    <div
        class="relative h-full border-l border-white/70 bg-[#f6f8fc] transition-all duration-200"
        :style="{ width: collapsed ? '56px' : `${sidebarWidth}px` }"
    >
        <div
            v-if="!collapsed"
            class="absolute left-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize z-20 group"
            @mousedown="startResize"
        >
            <div
                class="mx-auto h-full w-[3px] rounded-full bg-transparent transition-colors"
                :class="isResizing ? 'bg-blue-300' : 'group-hover:bg-slate-200'"
            />
        </div>
        <div v-if="collapsed" class="h-full flex flex-col items-center py-3">
            <a-button type="text" class="!text-gray-500" @click="collapsed = false">
                <icon-left />
            </a-button>
            <div class="[writing-mode:vertical-rl] text-xs tracking-[0.2em] text-gray-400 mt-5">
                任务结果
            </div>
            <div class="mt-5 rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-600">
                {{ summary.running }}
            </div>
        </div>

        <div v-else class="h-full flex flex-col">
            <div class="px-4 pt-4 pb-4 border-b border-white/80 bg-white/85 backdrop-blur">
                <div class="flex items-start gap-2">
                    <div class="flex-grow">
                        <div class="text-[18px] font-semibold text-gray-900">任务结果</div>
                        <div class="text-xs text-gray-500 mt-1">
                            跨页面查看全部云端任务与产出结果
                        </div>
                    </div>
                    <a-button type="text" class="!text-gray-500" @click="collapsed = true">
                        <icon-right />
                    </a-button>
                </div>

                <div class="grid grid-cols-4 gap-2 mt-4 text-xs">
                    <div class="rounded-2xl bg-blue-50 px-3 py-2 text-blue-700">
                        <div class="text-[11px] text-blue-500">运行中</div>
                        <div class="text-base font-semibold leading-5 mt-1">{{ summary.running }}</div>
                    </div>
                    <div class="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
                        <div class="text-[11px] text-emerald-500">成功</div>
                        <div class="text-base font-semibold leading-5 mt-1">{{ summary.success }}</div>
                    </div>
                    <div class="rounded-2xl bg-rose-50 px-3 py-2 text-rose-700">
                        <div class="text-[11px] text-rose-500">失败</div>
                        <div class="text-base font-semibold leading-5 mt-1">{{ summary.fail }}</div>
                    </div>
                    <div class="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700">
                        <div class="text-[11px] text-slate-500">排队</div>
                        <div class="text-base font-semibold leading-5 mt-1">{{ summary.queue }}</div>
                    </div>
                </div>

                <div class="mt-4">
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="item in capabilityTabs"
                            :key="item.value"
                            type="button"
                            class="rounded-full px-3 py-1 text-xs transition-colors"
                            :class="
                                capabilityFilter === item.value
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            "
                            @click="capabilityFilter = item.value as CapabilityFilter"
                        >
                            {{ item.label }}
                        </button>
                    </div>
                </div>

                <div class="mt-3">
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="item in statusTabs"
                            :key="item.value"
                            type="button"
                            class="rounded-full px-3 py-1 text-xs transition-colors"
                            :class="
                                statusFilter === item.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            "
                            @click="statusFilter = item.value as StatusFilter"
                        >
                            {{ item.label }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="px-4 py-3 border-b border-white/80 bg-white/60 text-sm text-gray-500">
                共 {{ filteredRecords.length }} 条
            </div>

            <div class="flex-grow overflow-auto px-3 py-3">
                <div class="space-y-3">
                    <CloudTaskSidebarItem
                        v-for="record in displayedRecords"
                        :key="record.id"
                        :record="record"
                        :display-status="resolveDisplayStatus(record)"
                        :now-ms="nowMs"
                        @edit-task="editTask"
                        @regenerate-task="regenerateTask"
                        @delete-task="deleteTask"
                    />
                </div>
                <m-empty v-if="filteredRecords.length === 0" class="mt-10" text="没有符合条件的任务" />
            </div>
        </div>
    </div>
</template>
