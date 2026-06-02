<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Dialog } from "../../lib/dialog";
import { DigitalHumanClipRecord, DigitalHumanClipService, DigitalHumanDisplayMode } from "../../service/DigitalHumanClipService";
import { DigitalHumanIdentityRecord, DigitalHumanIdentityService } from "../../service/DigitalHumanIdentityService";
import {
    DigitalHumanLiveExecutionConfigRecord,
    DigitalHumanLiveExecutionConfigService,
} from "../../service/DigitalHumanLiveExecutionConfigService";
import {
    createEmptyDigitalHumanScenePackRecord,
    DigitalHumanScenePackRecord,
    DigitalHumanScenePackService,
} from "../../service/DigitalHumanScenePackService";

const loading = ref(false);
const saveLoading = ref(false);
const records = ref<DigitalHumanScenePackRecord[]>([]);
const identities = ref<DigitalHumanIdentityRecord[]>([]);
const clips = ref<DigitalHumanClipRecord[]>([]);
const executionConfigs = ref<DigitalHumanLiveExecutionConfigRecord[]>([]);
const visible = ref(false);
const formData = ref<DigitalHumanScenePackRecord>(createEmptyDigitalHumanScenePackRecord());

const displayModeOptions: Array<{ label: string; value: DigitalHumanDisplayMode }> = [
    { label: "普通口播", value: "normal" },
    { label: "商品叠层", value: "overlay" },
    { label: "桌面展示", value: "table" },
    { label: "左手持", value: "hold-left" },
    { label: "右手持", value: "hold-right" },
    { label: "双手持", value: "hold-both" },
    { label: "专属商品片", value: "product-clip" },
];

const productInsertModeOptions = [
    { label: "自动插播", value: "auto" },
    { label: "手动控制", value: "manual" },
    { label: "不插播", value: "disabled" },
];

const overlayPositionOptions = [
    { label: "右侧", value: "right" },
    { label: "左侧", value: "left" },
    { label: "底部", value: "bottom" },
    { label: "全屏", value: "full" },
];

const stats = computed(() => {
    return {
        total: records.value.length,
        ready: records.value.filter(item => item.content.status === "ready").length,
        identityCount: identities.value.length,
        clipCount: clips.value.length,
    };
});

const currentIdentity = computed(() => {
    return identities.value.find(item => Number(item.id || 0) === Number(formData.value.content.identityId || 0)) || null;
});

const executionConfigOptions = computed(() => {
    return executionConfigs.value.map(item => ({
        label: item.title,
        value: Number(item.id || 0),
    }));
});

const executionConfigTitleMap = computed(() => {
    return new Map(executionConfigs.value.map(item => [Number(item.id || 0), item.title]));
});

const clipOptionsByType = (clipType: string) => {
    return clips.value
        .filter(item => {
            if (item.content.clipType !== clipType) {
                return false;
            }
            const currentIdentityId = Number(formData.value.content.identityId || 0);
            if (currentIdentityId > 0 && Number(item.content.identityId || 0) !== currentIdentityId) {
                return false;
            }
            return true;
        })
        .map(item => ({
            label: item.title,
            value: Number(item.id || 0),
        }));
};

const idleClipOptions = computed(() => clipOptionsByType("idle"));
const welcomeClipOptions = computed(() => clipOptionsByType("welcome"));
const talkClipOptions = computed(() => clipOptionsByType("talk"));
const productClipOptions = computed(() => clipOptionsByType("product"));
const transitionClipOptions = computed(() => clipOptionsByType("transition"));

const clipTitleMap = computed(() => {
    return new Map(clips.value.map(item => [Number(item.id || 0), item.title]));
});

const clipNames = (ids?: number[]) => {
    return (Array.isArray(ids) ? ids : [])
        .map(id => clipTitleMap.value.get(Number(id || 0)) || "")
        .filter(Boolean)
        .join(" / ");
};

const doRefresh = async () => {
    loading.value = true;
    try {
        const [scenePacks, identityList, clipList, executionConfigList] = await Promise.all([
            DigitalHumanScenePackService.list(),
            DigitalHumanIdentityService.list(),
            DigitalHumanClipService.list(),
            DigitalHumanLiveExecutionConfigService.list(),
        ]);
        records.value = scenePacks;
        identities.value = identityList;
        clips.value = clipList;
        executionConfigs.value = executionConfigList;
    } finally {
        loading.value = false;
    }
};

const openAdd = () => {
    formData.value = createEmptyDigitalHumanScenePackRecord();
    visible.value = true;
};

const openEdit = (record: DigitalHumanScenePackRecord) => {
    formData.value = createEmptyDigitalHumanScenePackRecord();
    formData.value = {
        id: record.id,
        title: record.title,
        content: {
            ...formData.value.content,
            ...record.content,
            welcomeClipIds: [...(record.content.welcomeClipIds || [])],
            talkClipIds: [...(record.content.talkClipIds || [])],
            productClipIds: [...(record.content.productClipIds || [])],
            transitionClipIds: [...(record.content.transitionClipIds || [])],
            tags: [...(record.content.tags || [])],
        },
    };
    visible.value = true;
};

const doDelete = async (record: DigitalHumanScenePackRecord) => {
    await Dialog.confirm("确认删除这个直播编排方案吗？");
    await DigitalHumanScenePackService.delete(record);
    await doRefresh();
};

const normalizeIds = (list?: number[]) => {
    return Array.from(new Set((Array.isArray(list) ? list : []).map(item => Number(item || 0)).filter(item => item > 0)));
};

const doSave = async () => {
    if (!formData.value.title.trim()) {
        Dialog.tipError("请输入方案名称");
        return;
    }
    if (!Number(formData.value.content.identityId || 0)) {
        Dialog.tipError("请选择数字人身份");
        return;
    }
    if (!Number(formData.value.content.idleClipId || 0)) {
        Dialog.tipError("请选择默认待机片");
        return;
    }
    try {
        saveLoading.value = true;
        const next: DigitalHumanScenePackRecord = {
            id: formData.value.id,
            title: formData.value.title.trim(),
            content: {
                ...formData.value.content,
                identityId: Number(formData.value.content.identityId || 0),
                identityTitle: currentIdentity.value?.title || "",
                executionConfigId: Number(formData.value.content.executionConfigId || 0),
                executionConfigTitle:
                    executionConfigTitleMap.value.get(Number(formData.value.content.executionConfigId || 0)) || "",
                idleClipId: Number(formData.value.content.idleClipId || 0),
                welcomeClipIds: normalizeIds(formData.value.content.welcomeClipIds),
                talkClipIds: normalizeIds(formData.value.content.talkClipIds),
                productClipIds: normalizeIds(formData.value.content.productClipIds),
                transitionClipIds: normalizeIds(formData.value.content.transitionClipIds),
                idlePaddingMs: Number(formData.value.content.idlePaddingMs || 0),
                talkPaddingMs: Number(formData.value.content.talkPaddingMs || 0),
                status: formData.value.content.status || "draft",
            },
        };
        await DigitalHumanScenePackService.save(next);
        visible.value = false;
        Dialog.tipSuccess("编排方案已保存");
        await doRefresh();
    } finally {
        saveLoading.value = false;
    }
};

watch(
    () => formData.value.content.identityId,
    identityId => {
        const current = Number(identityId || 0);
        const validSingle = (value?: number, options?: Array<{ label: string; value: number }>) => {
            return !!options?.some(item => Number(item.value) === Number(value || 0));
        };
        if (current <= 0) {
            return;
        }
        if (!validSingle(formData.value.content.idleClipId, idleClipOptions.value)) {
            formData.value.content.idleClipId = 0;
        }
        formData.value.content.welcomeClipIds = normalizeIds(formData.value.content.welcomeClipIds).filter(id =>
            welcomeClipOptions.value.some(item => item.value === id)
        );
        formData.value.content.talkClipIds = normalizeIds(formData.value.content.talkClipIds).filter(id =>
            talkClipOptions.value.some(item => item.value === id)
        );
        formData.value.content.productClipIds = normalizeIds(formData.value.content.productClipIds).filter(id =>
            productClipOptions.value.some(item => item.value === id)
        );
        formData.value.content.transitionClipIds = normalizeIds(formData.value.content.transitionClipIds).filter(id =>
            transitionClipOptions.value.some(item => item.value === id)
        );
    }
);

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
                        <div class="text-[32px] font-semibold leading-none text-slate-900">数字人直播编排</div>
                        <div class="mt-3 text-sm text-slate-500">
                            先按“身份 + 待机片 + 讲解片 + 商品片 + 基础切换规则”完成第一版编排，后续再叠加更细的时间线和自动排队能力。
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a-button type="primary" @click="openAdd">新建方案</a-button>
                        <a-button @click="doRefresh">
                            <template #icon>
                                <icon-refresh />
                            </template>
                            刷新
                        </a-button>
                    </div>
                </div>

                <div class="mt-5 grid grid-cols-4 gap-3">
                    <div class="rounded-2xl bg-slate-50 px-4 py-4">
                        <div class="text-xs text-slate-400">编排方案</div>
                        <div class="mt-2 text-2xl font-semibold text-slate-900">{{ stats.total }}</div>
                    </div>
                    <div class="rounded-2xl bg-emerald-50 px-4 py-4">
                        <div class="text-xs text-emerald-500">已就绪方案</div>
                        <div class="mt-2 text-2xl font-semibold text-emerald-600">{{ stats.ready }}</div>
                    </div>
                    <div class="rounded-2xl bg-blue-50 px-4 py-4">
                        <div class="text-xs text-blue-500">数字人身份</div>
                        <div class="mt-2 text-2xl font-semibold text-blue-600">{{ stats.identityCount }}</div>
                    </div>
                    <div class="rounded-2xl bg-violet-50 px-4 py-4">
                        <div class="text-xs text-violet-500">可编排片段</div>
                        <div class="mt-2 text-2xl font-semibold text-violet-600">{{ stats.clipCount }}</div>
                    </div>
                </div>
            </div>

            <div class="mt-6 grid grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-6">
                <div class="rounded-[24px] bg-white px-6 py-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <div class="text-lg font-semibold text-slate-900">第一版编排能力</div>
                    <div class="mt-4 space-y-3 text-sm text-slate-600">
                        <div class="rounded-2xl bg-slate-50 px-4 py-4">1. 绑定一个数字人身份和默认待机片</div>
                        <div class="rounded-2xl bg-slate-50 px-4 py-4">2. 选择欢迎片、讲解片、商品片、过渡片素材池</div>
                        <div class="rounded-2xl bg-slate-50 px-4 py-4">3. 配置 `自动回待机 / 前后缓冲时间 / 商品插播方式`</div>
                        <div class="rounded-2xl bg-slate-50 px-4 py-4">4. 预留商品叠层位置和默认展示模式</div>
                    </div>
                </div>

                <div class="rounded-[24px] bg-white px-6 py-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <div class="text-lg font-semibold text-slate-900">现有编排方案</div>
                    <div v-if="loading" class="py-16">
                        <m-loading />
                    </div>
                    <div v-else-if="records.length === 0" class="py-16">
                        <m-empty />
                    </div>
                    <div v-else class="mt-4 space-y-3">
                        <div
                            v-for="record in records"
                            :key="record.id"
                            class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="truncate text-sm font-semibold text-slate-900">{{ record.title }}</div>
                                    <div class="mt-2 text-xs text-slate-500">身份：{{ record.content.identityTitle || "-" }}</div>
                                    <div class="mt-1 text-xs text-slate-500">
                                        待机片：{{ clipTitleMap.get(Number(record.content.idleClipId || 0)) || "-" }}
                                    </div>
                                    <div class="mt-1 text-xs text-slate-500">
                                        执行配置：{{ record.content.executionConfigTitle || "-" }}
                                    </div>
                                    <div class="mt-1 text-xs text-slate-500">
                                        讲解片：{{ (record.content.talkClipIds || []).length }} 个
                                    </div>
                                    <div class="mt-1 text-xs text-slate-500">
                                        商品片：{{ (record.content.productClipIds || []).length }} 个
                                    </div>
                                    <div class="mt-1 text-xs text-slate-500">
                                        状态：{{ record.content.status === "ready" ? "已就绪" : "草稿" }}
                                    </div>
                                </div>
                                <div class="flex items-center gap-1">
                                    <a-button size="mini" type="text" @click="openEdit(record)">编辑</a-button>
                                    <a-button size="mini" type="text" status="danger" @click="doDelete(record)">删除</a-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <a-modal v-model:visible="visible" width="860px" :mask-closable="false" :title="formData.id ? '编辑编排方案' : '新建编排方案'">
        <template #footer>
            <a-button @click="visible = false">取消</a-button>
            <a-button type="primary" :loading="saveLoading" @click="doSave">保存方案</a-button>
        </template>
        <a-form :model="formData" layout="vertical">
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="方案名称" required>
                        <a-input v-model="formData.title" placeholder="例如：主播小美_日常带货编排" />
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="数字人身份" required>
                        <a-select v-model="formData.content.identityId" placeholder="请选择数字人身份">
                            <a-option v-for="item in identities" :key="item.id" :value="item.id || 0">
                                {{ item.title }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="24">
                    <a-form-item label="直播执行配置">
                        <a-select v-model="formData.content.executionConfigId" allow-clear placeholder="选择当前编排在直播时使用哪套模板绑定关系">
                            <a-option v-for="item in executionConfigOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                        <template #extra>
                            <div class="text-xs text-slate-400 mt-1">
                                执行配置负责绑定“待机 / 讲解 / 商品 / 欢迎 / 过渡”分别走哪一个云端模板，不再在直播页重复手填 RunningHub 参数。
                            </div>
                        </template>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="默认待机片" required>
                        <a-select v-model="formData.content.idleClipId" placeholder="进入直播后的默认片段">
                            <a-option v-for="item in idleClipOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="默认展示模式">
                        <a-select v-model="formData.content.defaultDisplayMode">
                            <a-option v-for="item in displayModeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="欢迎片">
                        <a-select v-model="formData.content.welcomeClipIds" multiple placeholder="可多选开场欢迎片">
                            <a-option v-for="item in welcomeClipOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="讲解片">
                        <a-select v-model="formData.content.talkClipIds" multiple placeholder="选择常用讲解片">
                            <a-option v-for="item in talkClipOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="商品片">
                        <a-select v-model="formData.content.productClipIds" multiple placeholder="选择商品展示片">
                            <a-option v-for="item in productClipOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="过渡片">
                        <a-select v-model="formData.content.transitionClipIds" multiple placeholder="可选，用于段落衔接">
                            <a-option v-for="item in transitionClipOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="8">
                    <a-form-item label="回待机缓冲(ms)">
                        <a-input-number v-model="formData.content.idlePaddingMs" :min="0" :step="100" style="width: 100%" />
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="讲解切换缓冲(ms)">
                        <a-input-number v-model="formData.content.talkPaddingMs" :min="0" :step="100" style="width: 100%" />
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="商品插播方式">
                        <a-select v-model="formData.content.productInsertMode">
                            <a-option v-for="item in productInsertModeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="8">
                    <a-form-item label="叠层位置">
                        <a-select v-model="formData.content.overlayPosition">
                            <a-option v-for="item in overlayPositionOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="方案状态">
                        <a-select v-model="formData.content.status">
                            <a-option value="draft">草稿</a-option>
                            <a-option value="ready">已就绪</a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="自动回待机">
                        <a-switch v-model="formData.content.autoReturnToIdle" />
                    </a-form-item>
                </a-col>
            </a-row>

            <a-form-item label="备注">
                <a-textarea
                    v-model="formData.content.notes"
                    :auto-size="{ minRows: 3, maxRows: 5 }"
                    placeholder="记录这套编排适用于哪些商品、场景或主播话术"
                />
            </a-form-item>

            <div class="rounded-2xl bg-slate-50 px-4 py-4 text-xs text-slate-500">
                <div>当前身份：{{ currentIdentity?.title || "-" }}</div>
                <div class="mt-1">执行配置：{{ executionConfigTitleMap.get(Number(formData.content.executionConfigId || 0)) || "-" }}</div>
                <div class="mt-1">欢迎片：{{ clipNames(formData.content.welcomeClipIds) || "-" }}</div>
                <div class="mt-1">讲解片：{{ clipNames(formData.content.talkClipIds) || "-" }}</div>
                <div class="mt-1">商品片：{{ clipNames(formData.content.productClipIds) || "-" }}</div>
            </div>
        </a-form>
    </a-modal>
</template>
