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
    { label: "图", value: "image" },
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
    const [runningHubRecords, directApiRecords] = await Promise.all([
        TaskService.list("RunningHubTask"),
        TaskService.list("DirectApiTask"),
    ]);
    records.value = [...runningHubRecords, ...directApiRecords].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
};

const directApiToolTab = (record: TaskRecord) => {
    const title = String((record as any)?.modelConfig?.templateTitle || "").toLowerCase();
    const body = String((record as any)?.modelConfig?.requestBodyJson || "").toLowerCase();
    if (title.includes("seedance") || body.includes("seedance-2.0")) {
        return "ToolSeedance";
    }
    if (title.includes("gpt image 2") || body.includes("gpt-image-2")) {
        return "ToolGptImage2";
    }
    return "";
};

const editTask = async (record: TaskRecord) => {
    const tab = directApiToolTab(record);
    if (!tab || !record.id) {
        Dialog.tipError("当前任务暂不支持重新编辑");
        return;
    }
    await router.push({
        path: "/tool",
        query: {
            tab,
            editTaskId: String(record.id),
            _t: String(Date.now()),
        },
    });
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
    return cloned;
};

const regenerateTask = async (record: TaskRecord) => {
    if (!directApiToolTab(record)) {
        Dialog.tipError("当前任务暂不支持再次生成");
        return;
    }
    await TaskService.submit(cloneTaskRecord(record));
    Dialog.tipSuccess("已按原配置再次提交");
    await refresh();
};

const filteredRecords = computed(() => {
    return records.value.filter(record => {
        if (capabilityFilter.value !== "all" && record.modelConfig?.capability !== capabilityFilter.value) {
            return false;
        }
        if (statusFilter.value !== "all" && resolveDisplayStatus(record) !== statusFilter.value) {
            return false;
        }
        return true;
    });
});

const displayedRecords = computed(() => filteredRecords.value.slice(0, 30));

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
                    />
                </div>
                <div
                    v-if="filteredRecords.length > displayedRecords.length"
                    class="mt-3 rounded-xl bg-white px-3 py-3 text-xs text-gray-400"
                >
                    当前仅显示前 {{ displayedRecords.length }} 条，切换筛选可缩小结果范围。
                </div>
                <m-empty v-if="filteredRecords.length === 0" class="mt-10" text="没有符合条件的任务" />
            </div>
        </div>
    </div>
</template>
