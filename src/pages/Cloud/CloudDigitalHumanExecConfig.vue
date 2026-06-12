<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Dialog } from "../../lib/dialog";
import {
    CloudTemplateRecord,
    CloudTemplateService,
    getTemplateCapabilities,
} from "../../service/CloudTemplateService";
import {
    createEmptyDigitalHumanLiveExecutionConfigRecord,
    DigitalHumanLiveExecutionConfigRecord,
    DigitalHumanLiveExecutionConfigService,
} from "../../service/DigitalHumanLiveExecutionConfigService";

const loading = ref(false);
const saveLoading = ref(false);
const visible = ref(false);
const records = ref<DigitalHumanLiveExecutionConfigRecord[]>([]);
const templateRecords = ref<CloudTemplateRecord[]>([]);
const formData = ref<DigitalHumanLiveExecutionConfigRecord>(createEmptyDigitalHumanLiveExecutionConfigRecord());

const allowedCapabilities = ["digital-human", "video", "lipsync", "audio"];

const templateOptions = computed(() => {
    return templateRecords.value.map(item => ({
        label: `${item.title} · ${item.content.providerProfileTitle || item.content.providerType} · ${getTemplateCapabilities(item).join("/")}`,
        value: Number(item.id || 0),
    }));
});

const audioTemplateOptions = computed(() => {
    return templateRecords.value
        .filter(item => getTemplateCapabilities(item).some(capability => capability === "audio" || capability === "voice-clone"))
        .map(item => ({
            label: `${item.title} · ${item.content.providerProfileTitle || item.content.providerType} · ${getTemplateCapabilities(item).join("/")}`,
            value: Number(item.id || 0),
        }));
});

const templateTitleMap = computed(() => {
    return new Map(templateRecords.value.map(item => [Number(item.id || 0), item.title]));
});

const stats = computed(() => {
    return {
        total: records.value.length,
        ready: records.value.filter(item => item.content.status === "ready").length,
        templateCount: templateRecords.value.length,
    };
});

const doRefresh = async () => {
    loading.value = true;
    try {
        const [execConfigs, templates] = await Promise.all([
            DigitalHumanLiveExecutionConfigService.list(),
            CloudTemplateService.list(),
        ]);
        records.value = execConfigs;
        templateRecords.value = templates.filter(item => {
            const capabilities = getTemplateCapabilities(item);
            return capabilities.some(capability => allowedCapabilities.includes(capability));
        });
    } finally {
        loading.value = false;
    }
};

const normalizeTemplateId = (value: number | string | undefined) => Number(value || 0);

const syncTemplateTitles = () => {
    const content = formData.value.content;
    content.defaultTemplateTitle = templateTitleMap.value.get(normalizeTemplateId(content.defaultTemplateId)) || "";
    content.idleTemplateTitle = templateTitleMap.value.get(normalizeTemplateId(content.idleTemplateId)) || "";
    content.welcomeTemplateTitle = templateTitleMap.value.get(normalizeTemplateId(content.welcomeTemplateId)) || "";
    content.talkTemplateTitle = templateTitleMap.value.get(normalizeTemplateId(content.talkTemplateId)) || "";
    content.productTemplateTitle = templateTitleMap.value.get(normalizeTemplateId(content.productTemplateId)) || "";
    content.transitionTemplateTitle = templateTitleMap.value.get(normalizeTemplateId(content.transitionTemplateId)) || "";
    content.audioTemplateTitle = templateTitleMap.value.get(normalizeTemplateId(content.audioTemplateId)) || "";
};

const openAdd = () => {
    formData.value = createEmptyDigitalHumanLiveExecutionConfigRecord();
    visible.value = true;
};

const openEdit = (record: DigitalHumanLiveExecutionConfigRecord) => {
    formData.value = createEmptyDigitalHumanLiveExecutionConfigRecord();
    formData.value = {
        id: record.id,
        title: record.title,
        content: {
            ...formData.value.content,
            ...record.content,
        },
    };
    visible.value = true;
};

const doDelete = async (record: DigitalHumanLiveExecutionConfigRecord) => {
    await Dialog.confirm("确认删除这个直播执行配置吗？");
    await DigitalHumanLiveExecutionConfigService.delete(record);
    await doRefresh();
};

const doSave = async () => {
    if (!formData.value.title.trim()) {
        Dialog.tipError("请输入执行配置名称");
        return;
    }
    syncTemplateTitles();
    try {
        saveLoading.value = true;
        const next: DigitalHumanLiveExecutionConfigRecord = {
            id: formData.value.id,
            title: formData.value.title.trim(),
            content: {
                ...formData.value.content,
                defaultTemplateId: normalizeTemplateId(formData.value.content.defaultTemplateId),
                idleTemplateId: normalizeTemplateId(formData.value.content.idleTemplateId),
                welcomeTemplateId: normalizeTemplateId(formData.value.content.welcomeTemplateId),
                talkTemplateId: normalizeTemplateId(formData.value.content.talkTemplateId),
                productTemplateId: normalizeTemplateId(formData.value.content.productTemplateId),
                transitionTemplateId: normalizeTemplateId(formData.value.content.transitionTemplateId),
                audioTemplateId: normalizeTemplateId(formData.value.content.audioTemplateId),
                autoGenerateAudio: formData.value.content.autoGenerateAudio !== false,
                audioPrompt2: formData.value.content.audioPrompt2 || "",
                status: formData.value.content.status || "draft",
            },
        };
        await DigitalHumanLiveExecutionConfigService.save(next);
        visible.value = false;
        Dialog.tipSuccess("直播执行配置已保存");
        await doRefresh();
    } finally {
        saveLoading.value = false;
    }
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
                        <div class="text-[32px] font-semibold leading-none text-slate-900">直播执行配置</div>
                        <div class="mt-3 text-sm text-slate-500">
                            把云端模板按直播里的“待机 / 讲解 / 商品 / 欢迎 / 过渡”执行位绑定起来，编排方案只引用这套配置。
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a-button type="primary" @click="openAdd">新建执行配置</a-button>
                        <a-button @click="doRefresh">
                            <template #icon>
                                <icon-refresh />
                            </template>
                            刷新
                        </a-button>
                    </div>
                </div>

                <div class="mt-5 grid grid-cols-3 gap-3">
                    <div class="rounded-2xl bg-slate-50 px-4 py-4">
                        <div class="text-xs text-slate-400">执行配置</div>
                        <div class="mt-2 text-2xl font-semibold text-slate-900">{{ stats.total }}</div>
                    </div>
                    <div class="rounded-2xl bg-emerald-50 px-4 py-4">
                        <div class="text-xs text-emerald-500">已就绪</div>
                        <div class="mt-2 text-2xl font-semibold text-emerald-600">{{ stats.ready }}</div>
                    </div>
                    <div class="rounded-2xl bg-blue-50 px-4 py-4">
                        <div class="text-xs text-blue-500">可选模板</div>
                        <div class="mt-2 text-2xl font-semibold text-blue-600">{{ stats.templateCount }}</div>
                    </div>
                </div>
            </div>

            <div class="mt-6 rounded-[24px] bg-white px-6 py-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div v-if="loading" class="py-16">
                    <m-loading />
                </div>
                <div v-else-if="records.length === 0" class="py-16">
                    <m-empty />
                </div>
                <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div v-for="record in records" :key="record.id" class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="truncate text-lg font-semibold text-slate-900">{{ record.title }}</div>
                                <div class="mt-2 text-xs text-slate-500">默认：{{ record.content.defaultTemplateTitle || "-" }}</div>
                                <div class="mt-1 text-xs text-slate-500">待机：{{ record.content.idleTemplateTitle || record.content.defaultTemplateTitle || "-" }}</div>
                                <div class="mt-1 text-xs text-slate-500">讲解：{{ record.content.talkTemplateTitle || record.content.defaultTemplateTitle || "-" }}</div>
                                <div class="mt-1 text-xs text-slate-500">商品：{{ record.content.productTemplateTitle || record.content.defaultTemplateTitle || "-" }}</div>
                                <div class="mt-1 text-xs text-slate-500">音频：{{ record.content.audioTemplateTitle || "未绑定" }}</div>
                                <div class="mt-1 text-xs text-slate-500">状态：{{ record.content.status === "ready" ? "已就绪" : "草稿" }}</div>
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

    <a-modal v-model:visible="visible" width="860px" :mask-closable="false" :title="formData.id ? '编辑直播执行配置' : '新建直播执行配置'">
        <template #footer>
            <a-button @click="visible = false">取消</a-button>
            <a-button type="primary" :loading="saveLoading" @click="doSave">保存配置</a-button>
        </template>
        <a-form :model="formData" layout="vertical">
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="配置名称" required>
                        <a-input v-model="formData.title" placeholder="例如：RunningHub_主播小美_直播执行" />
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="方案状态">
                        <a-select v-model="formData.content.status">
                            <a-option value="draft">草稿</a-option>
                            <a-option value="ready">已就绪</a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="默认执行模板">
                        <a-select v-model="formData.content.defaultTemplateId" placeholder="未单独指定时统一走这里">
                            <a-option v-for="item in templateOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="待机模板">
                        <a-select v-model="formData.content.idleTemplateId" allow-clear placeholder="不填则回退默认模板">
                            <a-option v-for="item in templateOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="欢迎模板">
                        <a-select v-model="formData.content.welcomeTemplateId" allow-clear placeholder="欢迎片执行模板">
                            <a-option v-for="item in templateOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="讲解模板">
                        <a-select v-model="formData.content.talkTemplateId" allow-clear placeholder="讲解片执行模板">
                            <a-option v-for="item in templateOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="商品模板">
                        <a-select v-model="formData.content.productTemplateId" allow-clear placeholder="商品片执行模板">
                            <a-option v-for="item in templateOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="过渡模板">
                        <a-select v-model="formData.content.transitionTemplateId" allow-clear placeholder="过渡片执行模板">
                            <a-option v-for="item in templateOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>

            <div class="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                <div class="mb-3 text-sm font-semibold text-slate-900">音频生成</div>
                <a-row :gutter="16">
                    <a-col :span="12">
                        <a-form-item label="音频生成模板">
                            <a-select v-model="formData.content.audioTemplateId" allow-clear placeholder="例如：IndexTTS2">
                                <a-option v-for="item in audioTemplateOptions" :key="item.value" :value="item.value">
                                    {{ item.label }}
                                </a-option>
                            </a-select>
                        </a-form-item>
                    </a-col>
                    <a-col :span="12">
                        <a-form-item label="情感描述">
                            <a-input v-model="formData.content.audioPrompt2" placeholder="留空使用模板默认值，例如：害羞的" allow-clear />
                        </a-form-item>
                    </a-col>
                </a-row>
                <a-checkbox v-model="formData.content.autoGenerateAudio">
                    片段没有音频时，自动用身份参考音频和片段文本生成音频
                </a-checkbox>
            </div>

            <a-form-item label="备注">
                <a-textarea v-model="formData.content.notes" :auto-size="{ minRows: 3, maxRows: 5 }" placeholder="记录这套执行配置适用于哪些供应商、主播或直播间" />
            </a-form-item>
        </a-form>
    </a-modal>
</template>
