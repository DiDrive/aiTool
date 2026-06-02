<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AudioPlayer from "../../components/common/AudioPlayer.vue";
import ImagePreviewBox from "../../components/common/ImagePreviewBox.vue";
import VideoPlayer from "../../components/common/VideoPlayer.vue";
import { Dialog } from "../../lib/dialog";
import { TimeUtil } from "../../lib/util";
import { DigitalHumanClipRecord, DigitalHumanClipService } from "../../service/DigitalHumanClipService";
import { DigitalHumanIdentityRecord, DigitalHumanIdentityService } from "../../service/DigitalHumanIdentityService";

const loading = ref(false);
const records = ref<DigitalHumanClipRecord[]>([]);
const identityRecords = ref<DigitalHumanIdentityRecord[]>([]);
const clipTypeFilter = ref("all");
const identityFilter = ref(0);

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
    } finally {
        loading.value = false;
    }
};

const doDelete = async (record: DigitalHumanClipRecord) => {
    await Dialog.confirm("确认删除这个直播片段吗？");
    await DigitalHumanClipService.delete(record);
    await doRefresh();
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
                        class="overflow-hidden rounded-[24px] border border-white/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
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
                            <a-button size="mini" type="text" status="danger" @click="doDelete(record)">
                                删除
                            </a-button>
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
