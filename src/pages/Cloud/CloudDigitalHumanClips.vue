<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AudioPlayer from "../../components/common/AudioPlayer.vue";
import ImagePreviewBox from "../../components/common/ImagePreviewBox.vue";
import VideoPlayer from "../../components/common/VideoPlayer.vue";
import { Dialog } from "../../lib/dialog";
import { TimeUtil } from "../../lib/util";
import {
    DigitalHumanClipRecord,
    DigitalHumanClipService,
    DigitalHumanClipType,
    DigitalHumanDisplayMode,
} from "../../service/DigitalHumanClipService";
import { DigitalHumanIdentityRecord, DigitalHumanIdentityService } from "../../service/DigitalHumanIdentityService";

const loading = ref(false);
const records = ref<DigitalHumanClipRecord[]>([]);
const identityRecords = ref<DigitalHumanIdentityRecord[]>([]);
const clipTypeFilter = ref("all");
const identityFilter = ref(0);
const selectedClipId = ref(0);
const settingsVisible = ref(false);
const savingSettings = ref(false);
const clipForm = ref<{
    title: string;
    clipType: DigitalHumanClipType;
    displayMode: DigitalHumanDisplayMode;
    identityId: number;
    productTitle: string;
    productId: string;
    tagsText: string;
    status: "draft" | "ready" | "archived";
}>({
    title: "",
    clipType: "talk",
    displayMode: "normal",
    identityId: 0,
    productTitle: "",
    productId: "",
    tagsText: "",
    status: "ready",
});

const clipTypeLabelMap: Record<string, string> = {
    idle: "待机片",
    welcome: "欢迎片",
    talk: "讲解片",
    product: "商品片",
    holding: "手持片",
    transition: "过渡片",
};

const displayModeLabelMap: Record<string, string> = {
    normal: "普通口播",
    overlay: "商品叠层",
    table: "桌面展示",
    "hold-left": "左手持",
    "hold-right": "右手持",
    "hold-both": "双手持",
    "product-clip": "专属商品片",
};

const clipTypeOptions = [
    { label: "全部", value: "all" },
    { label: "待机片", value: "idle" },
    { label: "欢迎片", value: "welcome" },
    { label: "讲解片", value: "talk" },
    { label: "商品片", value: "product" },
    { label: "手持片", value: "holding" },
    { label: "过渡片", value: "transition" },
];

const displayModeOptions = [
    { label: "普通口播", value: "normal" },
    { label: "商品叠层", value: "overlay" },
    { label: "桌面展示", value: "table" },
    { label: "左手持", value: "hold-left" },
    { label: "右手持", value: "hold-right" },
    { label: "双手持", value: "hold-both" },
    { label: "专属商品片", value: "product-clip" },
];

const clipStatusOptions = [
    { label: "可直接编排", value: "ready" },
    { label: "草稿", value: "draft" },
    { label: "归档", value: "archived" },
];

const identityOptions = computed(() => {
    return [
        { label: "全部身份", value: 0 },
        ...identityRecords.value.map(item => ({
            label: item.title,
            value: Number(item.id || 0),
        })),
    ];
});

const filteredRecords = computed(() => {
    return records.value.filter(record => {
        if (clipTypeFilter.value !== "all" && record.content.clipType !== clipTypeFilter.value) {
            return false;
        }
        if (Number(identityFilter.value || 0) > 0 && Number(record.content.identityId || 0) !== Number(identityFilter.value || 0)) {
            return false;
        }
        return true;
    });
});

const selectedRecord = computed(() => {
    return (
        filteredRecords.value.find(item => Number(item.id || 0) === Number(selectedClipId.value || 0)) ||
        filteredRecords.value[0] ||
        null
    );
});

const fillClipForm = (record: DigitalHumanClipRecord | null) => {
    if (!record) {
        return;
    }
    clipForm.value = {
        title: record.title || "",
        clipType: record.content.clipType || "talk",
        displayMode: record.content.displayMode || "normal",
        identityId: Number(record.content.identityId || 0),
        productTitle: record.content.productTitle || "",
        productId: record.content.productId || "",
        tagsText: Array.isArray(record.content.tags) ? record.content.tags.join(", ") : "",
        status: record.content.status || "ready",
    };
};

const stats = computed(() => {
    return {
        total: records.value.length,
        ready: records.value.filter(item => item.content.status === "ready").length,
        talk: records.value.filter(item => item.content.clipType === "talk").length,
        holding: records.value.filter(item => item.content.clipType === "holding").length,
    };
});

const doRefresh = async () => {
    loading.value = true;
    try {
        const [clips, identities] = await Promise.all([
            DigitalHumanClipService.list(),
            DigitalHumanIdentityService.list(),
        ]);
        records.value = clips;
        identityRecords.value = identities;
        if (!records.value.some(item => Number(item.id || 0) === Number(selectedClipId.value || 0))) {
            selectedClipId.value = Number(clips[0]?.id || 0);
        }
        fillClipForm(selectedRecord.value);
    } finally {
        loading.value = false;
    }
};

const doDelete = async (record: DigitalHumanClipRecord) => {
    await Dialog.confirm("确认删除这个直播片段吗？");
    await DigitalHumanClipService.delete(record);
    if (Number(selectedClipId.value || 0) === Number(record.id || 0)) {
        selectedClipId.value = 0;
    }
    await doRefresh();
};

const selectRecord = (record: DigitalHumanClipRecord) => {
    selectedClipId.value = Number(record.id || 0);
    settingsVisible.value = false;
    fillClipForm(record);
};

const openSettings = (record: DigitalHumanClipRecord | null = selectedRecord.value) => {
    if (!record) {
        return;
    }
    selectRecord(record);
    settingsVisible.value = true;
};

const saveSettings = async () => {
    const record = selectedRecord.value;
    if (!record?.id) {
        return;
    }
    if (!clipForm.value.title.trim()) {
        Dialog.tipError("请输入片段名称");
        return;
    }
    const identity = identityRecords.value.find(item => Number(item.id || 0) === Number(clipForm.value.identityId || 0));
    try {
        savingSettings.value = true;
        await DigitalHumanClipService.save({
            ...record,
            title: clipForm.value.title.trim(),
            content: {
                ...record.content,
                clipType: clipForm.value.clipType,
                displayMode: clipForm.value.displayMode,
                identityId: Number(identity?.id || 0) || undefined,
                identityTitle: identity?.title || "",
                productTitle: clipForm.value.productTitle.trim(),
                productId: clipForm.value.productId.trim(),
                tags: clipForm.value.tagsText
                    .split(",")
                    .map(item => item.trim())
                    .filter(Boolean),
                status: clipForm.value.status,
            },
        });
        settingsVisible.value = false;
        Dialog.tipSuccess("直播片段设置已保存");
        await doRefresh();
    } finally {
        savingSettings.value = false;
    }
};

const previewTypeOf = (record: DigitalHumanClipRecord) => {
    if (record.content.videoUrl) {
        return "video";
    }
    if (record.content.audioUrl) {
        return "audio";
    }
    if (record.content.coverImage) {
        return "image";
    }
    return "none";
};

const durationText = (record: DigitalHumanClipRecord) => {
    const seconds = Number(record.content.durationSeconds || 0);
    return seconds > 0 ? TimeUtil.secondsToTime(seconds) : "-";
};

const assetText = (record: DigitalHumanClipRecord) => {
    if (record.content.videoUrl) return "视频";
    if (record.content.audioUrl) return "音频";
    if (record.content.coverImage) return "图片";
    return "无素材";
};

watch(selectedRecord, record => {
    fillClipForm(record);
});

onMounted(() => {
    doRefresh();
});
</script>

<template>
    <div class="h-full overflow-y-auto bg-[#f6f8fc]">
        <div class="mx-auto max-w-7xl px-6 py-6">
            <div class="rounded-[24px] bg-white px-6 py-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div class="text-[32px] font-semibold leading-none text-slate-900">数字人直播片段</div>
                        <div class="mt-3 text-sm text-slate-500">
                            管理从任务结果沉淀下来的待机片、讲解片、手持片和商品片，后续直播编排会直接复用这里的素材。
                        </div>
                    </div>
                    <a-button @click="doRefresh">
                        <template #icon>
                            <icon-refresh />
                        </template>
                        刷新
                    </a-button>
                </div>

                <div class="mt-5 grid grid-cols-4 gap-3">
                    <div class="rounded-2xl bg-slate-50 px-4 py-4">
                        <div class="text-xs text-slate-400">全部片段</div>
                        <div class="mt-2 text-2xl font-semibold text-slate-900">{{ stats.total }}</div>
                    </div>
                    <div class="rounded-2xl bg-emerald-50 px-4 py-4">
                        <div class="text-xs text-emerald-500">可直接编排</div>
                        <div class="mt-2 text-2xl font-semibold text-emerald-600">{{ stats.ready }}</div>
                    </div>
                    <div class="rounded-2xl bg-blue-50 px-4 py-4">
                        <div class="text-xs text-blue-500">讲解片</div>
                        <div class="mt-2 text-2xl font-semibold text-blue-600">{{ stats.talk }}</div>
                    </div>
                    <div class="rounded-2xl bg-violet-50 px-4 py-4">
                        <div class="text-xs text-violet-500">手持片</div>
                        <div class="mt-2 text-2xl font-semibold text-violet-600">{{ stats.holding }}</div>
                    </div>
                </div>

                <div class="mt-5 flex flex-wrap gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <a-select v-model="clipTypeFilter" :style="{ width: '180px' }" placeholder="片段类型">
                        <a-option v-for="item in clipTypeOptions" :key="item.value" :value="item.value">
                            {{ item.label }}
                        </a-option>
                    </a-select>
                    <a-select v-model="identityFilter" :style="{ width: '220px' }" placeholder="数字人身份">
                        <a-option v-for="item in identityOptions" :key="item.value" :value="item.value">
                            {{ item.label }}
                        </a-option>
                    </a-select>
                    <div class="flex items-center text-sm text-slate-400">当前 {{ filteredRecords.length }} 条</div>
                </div>

                <div
                    v-if="selectedRecord"
                    class="mt-5 grid gap-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]"
                >
                    <div class="min-w-0 overflow-hidden rounded-xl bg-white p-3">
                        <ImagePreviewBox
                            v-if="previewTypeOf(selectedRecord) === 'image'"
                            :url="selectedRecord.content.coverImage || ''"
                            width="100%"
                            height="18rem"
                            large-width="100%"
                            large-height="60vh"
                        />
                        <div
                            v-else-if="previewTypeOf(selectedRecord) === 'video'"
                            class="h-72 overflow-hidden rounded-lg bg-black"
                        >
                            <VideoPlayer :url="selectedRecord.content.videoUrl" width="100%" height="100%" />
                        </div>
                        <div
                            v-else-if="previewTypeOf(selectedRecord) === 'audio'"
                            class="rounded-lg bg-white p-3"
                        >
                            <AudioPlayer :url="selectedRecord.content.audioUrl" show-wave />
                        </div>
                        <div v-else class="rounded-lg bg-white px-4 py-20 text-center text-sm text-slate-400">
                            暂无可预览内容
                        </div>
                    </div>
                    <div class="min-w-0 rounded-xl bg-white p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="truncate text-xl font-semibold text-slate-900" :title="selectedRecord.title">
                                    {{ selectedRecord.title }}
                                </div>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                                        {{ clipTypeLabelMap[selectedRecord.content.clipType] || selectedRecord.content.clipType }}
                                    </span>
                                    <span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
                                        {{ displayModeLabelMap[selectedRecord.content.displayMode] || selectedRecord.content.displayMode }}
                                    </span>
                                    <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-600">
                                        {{ assetText(selectedRecord) }}
                                    </span>
                                    <span v-if="settingsVisible" class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-600">
                                        正在编辑
                                    </span>
                                </div>
                            </div>
                            <a-button type="primary" size="small" @click.stop="openSettings(selectedRecord)">
                                设置
                            </a-button>
                        </div>
                        <div class="mt-4 grid grid-cols-2 gap-3">
                            <a-input v-model="clipForm.title" placeholder="片段名称" />
                            <a-select v-model="clipForm.status">
                                <a-option v-for="item in clipStatusOptions" :key="item.value" :value="item.value">
                                    {{ item.label }}
                                </a-option>
                            </a-select>
                            <a-select v-model="clipForm.clipType">
                                <a-option
                                    v-for="item in clipTypeOptions.filter(option => option.value !== 'all')"
                                    :key="item.value"
                                    :value="item.value"
                                >
                                    {{ item.label }}
                                </a-option>
                            </a-select>
                            <a-select v-model="clipForm.displayMode">
                                <a-option v-for="item in displayModeOptions" :key="item.value" :value="item.value">
                                    {{ item.label }}
                                </a-option>
                            </a-select>
                            <a-select v-model="clipForm.identityId" allow-clear placeholder="不绑定身份">
                                <a-option
                                    v-for="item in identityOptions.filter(option => Number(option.value || 0) > 0)"
                                    :key="item.value"
                                    :value="item.value"
                                >
                                    {{ item.label }}
                                </a-option>
                            </a-select>
                            <a-input v-model="clipForm.productTitle" placeholder="商品名称，可选" />
                            <a-input v-model="clipForm.productId" placeholder="商品 ID，可选" />
                            <a-input v-model="clipForm.tagsText" placeholder="标签，英文逗号分隔" />
                        </div>
                        <div class="mt-4 flex items-center justify-between gap-3">
                            <div class="min-w-0 text-xs text-slate-400">
                                <span>模板：{{ selectedRecord.content.templateTitle || "-" }}</span>
                                <span class="mx-2">/</span>
                                <span>用时：{{ durationText(selectedRecord) }}</span>
                            </div>
                            <a-button type="primary" :loading="savingSettings" @click="saveSettings">
                                保存设置
                            </a-button>
                        </div>
                        <div v-if="selectedRecord.content.text" class="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">
                            {{ selectedRecord.content.text }}
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-6">
                <div v-if="loading" class="rounded-[24px] bg-white py-20">
                    <m-loading />
                </div>
                <div v-else-if="filteredRecords.length === 0" class="rounded-[24px] bg-white py-20">
                    <m-empty />
                </div>
                <div v-else class="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <div
                        v-for="record in filteredRecords"
                        :key="record.id"
                        class="cursor-pointer overflow-hidden rounded-[24px] border bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition-colors"
                        :class="Number(selectedRecord?.id || 0) === Number(record.id || 0) ? 'border-blue-200 ring-2 ring-blue-100' : 'border-white/80 hover:border-blue-100'"
                        @click="selectRecord(record)"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="truncate text-lg font-semibold text-slate-900" :title="record.title">
                                    {{ record.title }}
                                </div>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                                        {{ clipTypeLabelMap[record.content.clipType] || record.content.clipType }}
                                    </span>
                                    <span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
                                        {{ displayModeLabelMap[record.content.displayMode] || record.content.displayMode }}
                                    </span>
                                    <span
                                        class="rounded-full px-2.5 py-1 text-xs"
                                        :class="record.content.status === 'ready' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'"
                                    >
                                        {{ record.content.status === "ready" ? "已就绪" : "草稿" }}
                                    </span>
                                </div>
                            </div>
                            <div class="flex flex-shrink-0 gap-1" @click.stop>
                                <a-button size="mini" type="outline" @click="selectRecord(record)">
                                    预览
                                </a-button>
                                <a-button size="mini" type="outline" @click.stop="openSettings(record)">
                                    设置
                                </a-button>
                                <a-button size="mini" type="text" status="danger" @click="doDelete(record)">
                                    删除
                                </a-button>
                            </div>
                        </div>

                        <div class="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                            <div class="text-xs text-slate-400">身份</div>
                            <div class="min-w-0 truncate text-slate-700">
                                {{ record.content.identityTitle || "-" }}
                            </div>

                            <div class="text-xs text-slate-400">模板</div>
                            <div class="min-w-0 truncate text-slate-700">
                                {{ record.content.templateTitle || "-" }}
                            </div>

                            <div class="text-xs text-slate-400">商品</div>
                            <div class="min-w-0 truncate text-slate-700">
                                {{ record.content.productTitle || "-" }}
                            </div>

                            <div class="text-xs text-slate-400">用时</div>
                            <div class="min-w-0 text-slate-700">
                                {{ durationText(record) }}
                            </div>
                        </div>

                        <div class="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <ImagePreviewBox
                                v-if="previewTypeOf(record) === 'image'"
                                :url="record.content.coverImage || ''"
                                width="100%"
                                height="14rem"
                                large-width="100%"
                                large-height="60vh"
                            />
                            <div
                                v-else-if="previewTypeOf(record) === 'video'"
                                class="h-64 overflow-hidden rounded-xl bg-black"
                            >
                                <VideoPlayer :url="record.content.videoUrl" width="100%" height="100%" />
                            </div>
                            <div
                                v-else-if="previewTypeOf(record) === 'audio'"
                                class="rounded-xl bg-white p-2"
                            >
                                <AudioPlayer :url="record.content.audioUrl" show-wave compact />
                            </div>
                            <div v-else class="rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-400">
                                暂无可预览内容
                            </div>
                        </div>

                        <div class="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
                            <div class="min-w-0 truncate">
                                {{ record.content.text || "未记录文案内容" }}
                            </div>
                            <div class="flex-shrink-0">
                                <timeago :datetime="(record as any)['createdAt'] * 1000" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div>
</template>
