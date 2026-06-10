<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
const identities = ref<DigitalHumanIdentityRecord[]>([]);
const selectedId = ref(0);
const clipTypeFilter = ref("all");
const identityFilter = ref("0");
const saving = ref(false);
const saveMessage = ref("");
const actionMessage = ref("");

const form = ref({
    title: "",
    clipType: "talk" as DigitalHumanClipType,
    displayMode: "normal" as DigitalHumanDisplayMode,
    identityId: "0",
    productTitle: "",
    productId: "",
    tagsText: "",
    status: "ready" as "draft" | "ready" | "archived",
});

const clipTypeOptions: Array<{label: string; value: "all" | DigitalHumanClipType}> = [
    {label: "全部", value: "all"},
    {label: "待机片", value: "idle"},
    {label: "欢迎片", value: "welcome"},
    {label: "讲解片", value: "talk"},
    {label: "商品片", value: "product"},
    {label: "手持片", value: "holding"},
    {label: "过渡片", value: "transition"},
];

const displayModeOptions: Array<{label: string; value: DigitalHumanDisplayMode}> = [
    {label: "普通口播", value: "normal"},
    {label: "商品叠层", value: "overlay"},
    {label: "桌面展示", value: "table"},
    {label: "左手持", value: "hold-left"},
    {label: "右手持", value: "hold-right"},
    {label: "双手持", value: "hold-both"},
    {label: "专属商品片", value: "product-clip"},
];

const statusOptions = [
    {label: "可直接编排", value: "ready"},
    {label: "草稿", value: "draft"},
    {label: "归档", value: "archived"},
] as const;

const clipTypeLabel = (value?: string) => clipTypeOptions.find(item => item.value === value)?.label || value || "-";
const displayModeLabel = (value?: string) => displayModeOptions.find(item => item.value === value)?.label || value || "-";
const statusLabel = (value?: string) => statusOptions.find(item => item.value === value)?.label || value || "-";

const filteredRecords = computed(() => {
    return records.value.filter(record => {
        if (clipTypeFilter.value !== "all" && record.content.clipType !== clipTypeFilter.value) {
            return false;
        }
        const filterIdentityId = Number(identityFilter.value || 0);
        if (filterIdentityId > 0 && Number(record.content.identityId || 0) !== filterIdentityId) {
            return false;
        }
        return true;
    });
});

const displayedRecords = computed(() => filteredRecords.value.slice(0, 30));

const selectedRecord = computed(() => {
    return (
        filteredRecords.value.find(record => Number(record.id || 0) === Number(selectedId.value || 0)) ||
        filteredRecords.value[0] ||
        null
    );
});

const stats = computed(() => ({
    total: records.value.length,
    ready: records.value.filter(record => record.content.status === "ready").length,
    talk: records.value.filter(record => record.content.clipType === "talk").length,
    holding: records.value.filter(record => record.content.clipType === "holding").length,
}));

const identityTitle = (id?: number) => {
    const found = identities.value.find(item => Number(item.id || 0) === Number(id || 0));
    return found?.title || "";
};

const assetText = (record: DigitalHumanClipRecord | null) => {
    if (!record) return "无素材";
    if (record.content.videoUrl) return "视频";
    if (record.content.audioUrl) return "音频";
    if (record.content.coverImage) return "图片";
    return "无素材";
};

const assetType = (record: DigitalHumanClipRecord | null) => {
    if (!record) return "none";
    if (record.content.videoUrl) return "video";
    if (record.content.audioUrl) return "audio";
    if (record.content.coverImage) return "image";
    return "none";
};

const assetUrl = (record: DigitalHumanClipRecord | null) => {
    return record?.content.videoUrl || record?.content.audioUrl || record?.content.coverImage || "";
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const assetPathText = (record: DigitalHumanClipRecord | null) => {
    const value = record?.content.videoUrl || record?.content.audioUrl || record?.content.coverImage || "";
    if (!value) {
        return "暂无素材路径";
    }
    return value.split(/[\\/]/).pop() || value;
};

const durationText = (record: DigitalHumanClipRecord | null) => {
    const seconds = Number(record?.content.durationSeconds || 0);
    return seconds > 0 ? TimeUtil.secondsToTime(seconds) : "-";
};

const fillForm = (record: DigitalHumanClipRecord | null) => {
    if (!record) {
        form.value = {
            title: "",
            clipType: "talk",
            displayMode: "normal",
            identityId: "0",
            productTitle: "",
            productId: "",
            tagsText: "",
            status: "ready",
        };
        return;
    }
    form.value = {
        title: record.title || "",
        clipType: record.content.clipType || "talk",
        displayMode: record.content.displayMode || "normal",
        identityId: String(Number(record.content.identityId || 0)),
        productTitle: record.content.productTitle || "",
        productId: record.content.productId || "",
        tagsText: Array.isArray(record.content.tags) ? record.content.tags.join(", ") : "",
        status: record.content.status || "ready",
    };
};

const selectRecord = (record: DigitalHumanClipRecord) => {
    selectedId.value = Number(record.id || 0);
    saveMessage.value = "";
    actionMessage.value = "";
    fillForm(record);
};

const isSelected = (record: DigitalHumanClipRecord) => {
    return Number(record.id || 0) === Number(selectedRecord.value?.id || 0);
};

const copyAssetPath = async () => {
    const url = assetUrl(selectedRecord.value);
    if (!url) {
        actionMessage.value = "暂无素材路径";
        return;
    }
    await window.$mapi.app.setClipboardText(url);
    actionMessage.value = "素材路径已复制";
};

const openAsset = async () => {
    const url = assetUrl(selectedRecord.value);
    if (!url) {
        actionMessage.value = "暂无素材路径";
        return;
    }
    try {
        if (isHttpUrl(url)) {
            await window.$mapi.app.openExternal(url);
        } else {
            await window.$mapi.app.openPath(url);
        }
        actionMessage.value = "已尝试打开素材";
    } catch (e) {
        actionMessage.value = "无法直接打开，可复制路径后查看";
    }
};

const refresh = async () => {
    if (loading.value) {
        return;
    }
    loading.value = true;
    try {
        const [clipRecords, identityRecords] = await Promise.all([
            DigitalHumanClipService.list(),
            DigitalHumanIdentityService.list(),
        ]);
        records.value = clipRecords;
        identities.value = identityRecords;
        if (!records.value.some(record => Number(record.id || 0) === Number(selectedId.value || 0))) {
            selectedId.value = Number(records.value[0]?.id || 0);
        }
        fillForm(selectedRecord.value);
    } finally {
        loading.value = false;
    }
};

const save = async () => {
    const record = selectedRecord.value;
    if (!record?.id || saving.value) {
        return;
    }
    const title = form.value.title.trim();
    if (!title) {
        window.alert("请输入片段名称");
        return;
    }
    const identityId = Number(form.value.identityId || 0);
    saving.value = true;
    try {
        await DigitalHumanClipService.save({
            ...record,
            title,
            content: {
                ...record.content,
                clipType: form.value.clipType,
                displayMode: form.value.displayMode,
                identityId: identityId || undefined,
                identityTitle: identityTitle(identityId),
                productTitle: form.value.productTitle.trim(),
                productId: form.value.productId.trim(),
                tags: form.value.tagsText
                    .split(",")
                    .map(item => item.trim())
                    .filter(Boolean),
                status: form.value.status,
            },
        });
        await refresh();
        saveMessage.value = "设置已保存";
    } finally {
        saving.value = false;
    }
};

const remove = async (record: DigitalHumanClipRecord) => {
    if (!window.confirm("确认删除这个直播片段吗？")) {
        return;
    }
    await DigitalHumanClipService.delete(record);
    if (Number(selectedId.value || 0) === Number(record.id || 0)) {
        selectedId.value = 0;
    }
    await refresh();
};

watch(selectedRecord, record => {
    fillForm(record);
});

onMounted(() => {
    refresh();
});

onBeforeUnmount(() => {
    records.value = [];
    identities.value = [];
});
</script>

<template>
    <div class="clips-page">
        <section class="clips-header">
            <div>
                <h1>数字人直播片段</h1>
                <p>管理从任务结果沉淀下来的待机片、讲解片、手持片和商品片。</p>
            </div>
            <button class="plain-button" type="button" :disabled="loading" @click="refresh">
                {{ loading ? "刷新中" : "刷新" }}
            </button>
        </section>

        <section class="stats-grid">
            <div class="stat-card">
                <span>全部片段</span>
                <strong>{{ stats.total }}</strong>
            </div>
            <div class="stat-card green">
                <span>可直接编排</span>
                <strong>{{ stats.ready }}</strong>
            </div>
            <div class="stat-card blue">
                <span>讲解片</span>
                <strong>{{ stats.talk }}</strong>
            </div>
            <div class="stat-card violet">
                <span>手持片</span>
                <strong>{{ stats.holding }}</strong>
            </div>
        </section>

        <section class="filters">
            <select v-model="clipTypeFilter">
                <option v-for="item in clipTypeOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                </option>
            </select>
            <select v-model="identityFilter">
                <option value="0">全部身份</option>
                <option v-for="item in identities" :key="item.id" :value="String(item.id || 0)">
                    {{ item.title }}
                </option>
            </select>
            <span>当前 {{ filteredRecords.length }} 条，仅显示前 {{ displayedRecords.length }} 条</span>
        </section>

        <section v-if="selectedRecord" class="selected-panel">
            <div class="preview-panel">
                <div class="panel-title">
                    <div>
                        <h2>片段预览</h2>
                        <p>{{ assetText(selectedRecord) }} / {{ durationText(selectedRecord) }}</p>
                    </div>
                    <div class="asset-actions">
                        <button type="button" :disabled="!assetUrl(selectedRecord)" @click="copyAssetPath">
                            复制路径
                        </button>
                        <button type="button" :disabled="!assetUrl(selectedRecord)" @click="openAsset">
                            打开素材
                        </button>
                    </div>
                </div>

                <div class="preview-box">
                    <video
                        v-if="assetType(selectedRecord) === 'video'"
                        :key="'video-' + (assetUrl(selectedRecord) || 'empty')"
                        :src="assetUrl(selectedRecord)"
                        controls
                        preload="metadata"
                    ></video>
                    <audio
                        v-else-if="assetType(selectedRecord) === 'audio'"
                        :key="'audio-' + (assetUrl(selectedRecord) || 'empty')"
                        :src="assetUrl(selectedRecord)"
                        controls
                        preload="metadata"
                    ></audio>
                    <img
                        v-else-if="assetType(selectedRecord) === 'image'"
                        :key="'image-' + (assetUrl(selectedRecord) || 'empty')"
                        :src="assetUrl(selectedRecord)"
                        alt="片段预览"
                    />
                    <div v-else class="no-preview">暂无可预览素材</div>
                </div>

                <div class="asset-path" :title="assetPathText(selectedRecord)">
                    {{ assetPathText(selectedRecord) }}
                </div>
                <div v-if="actionMessage" class="action-message">{{ actionMessage }}</div>
            </div>

            <div class="edit-panel">
                <div class="edit-title">
                    <div>
                        <h2>修改设置</h2>
                        <p>
                            {{ selectedRecord.title }}
                        </p>
                    </div>
                    <div class="save-actions">
                        <span v-if="saveMessage">{{ saveMessage }}</span>
                        <button class="plain-button" type="button" @click="fillForm(selectedRecord)">
                            还原
                        </button>
                        <button class="primary-button" type="button" :disabled="saving" @click="save">
                            {{ saving ? "保存中" : "保存设置" }}
                        </button>
                    </div>
                </div>

                <div class="form-grid">
                    <label class="wide">
                        <span>片段名称</span>
                        <input v-model="form.title" />
                    </label>
                    <label>
                        <span>状态</span>
                        <select v-model="form.status">
                            <option v-for="item in statusOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </option>
                        </select>
                    </label>
                    <label>
                        <span>片段类型</span>
                        <select v-model="form.clipType">
                            <option v-for="item in clipTypeOptions.filter(option => option.value !== 'all')" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </option>
                        </select>
                    </label>
                    <label>
                        <span>展示模式</span>
                        <select v-model="form.displayMode">
                            <option v-for="item in displayModeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </option>
                        </select>
                    </label>
                    <label>
                        <span>数字人身份</span>
                        <select v-model="form.identityId">
                            <option value="0">不绑定身份</option>
                            <option v-for="item in identities" :key="item.id" :value="String(item.id || 0)">
                                {{ item.title }}
                            </option>
                        </select>
                    </label>
                    <label>
                        <span>商品名称</span>
                        <input v-model="form.productTitle" placeholder="可选" />
                    </label>
                    <label>
                        <span>商品 ID</span>
                        <input v-model="form.productId" placeholder="可选" />
                    </label>
                    <label>
                        <span>标签</span>
                        <input v-model="form.tagsText" placeholder="英文逗号分隔" />
                    </label>
                </div>

                <div class="info-grid">
                    <div>
                        <span>片段类型</span>
                        <strong>{{ clipTypeLabel(selectedRecord.content.clipType) }}</strong>
                    </div>
                    <div>
                        <span>展示模式</span>
                        <strong>{{ displayModeLabel(selectedRecord.content.displayMode) }}</strong>
                    </div>
                    <div>
                        <span>身份</span>
                        <strong>{{ selectedRecord.content.identityTitle || "-" }}</strong>
                    </div>
                    <div>
                        <span>模板</span>
                        <strong>{{ selectedRecord.content.templateTitle || "-" }}</strong>
                    </div>
                </div>
            </div>
        </section>

        <section class="records-section">
            <div v-if="loading" class="empty-state">正在加载直播片段...</div>
            <div v-else-if="displayedRecords.length === 0" class="empty-state">暂无直播片段</div>
            <article
                v-for="record in displayedRecords"
                v-else
                :key="record.id"
                class="record-card"
                :class="{active: isSelected(record)}"
                @click="selectRecord(record)"
            >
                <div class="record-main">
                    <div>
                        <h3>{{ record.title }}</h3>
                        <p>{{ record.content.text || "未记录文案内容" }}</p>
                    </div>
                    <div class="record-actions">
                        <button type="button" :disabled="isSelected(record)" @click.stop="selectRecord(record)">
                            {{ isSelected(record) ? "当前" : "选中" }}
                        </button>
                        <button type="button" @click.stop="remove(record)">删除</button>
                    </div>
                </div>
                <div class="record-tags">
                    <span>{{ clipTypeLabel(record.content.clipType) }}</span>
                    <span>{{ displayModeLabel(record.content.displayMode) }}</span>
                    <span>{{ assetText(record) }}</span>
                    <span>{{ statusLabel(record.content.status) }}</span>
                </div>
                <div class="record-meta">
                    <span>身份：{{ record.content.identityTitle || "-" }}</span>
                    <span>模板：{{ record.content.templateTitle || "-" }}</span>
                    <span>用时：{{ durationText(record) }}</span>
                </div>
            </article>
        </section>
    </div>
</template>

<style scoped>
.clips-page {
    height: 100%;
    overflow-y: auto;
    background: #f6f8fc;
    padding: 24px;
    color: #0f172a;
    container-type: inline-size;
}

.clips-header,
.selected-panel,
.records-section {
    max-width: 1120px;
    width: 100%;
    margin: 0 auto;
}

.clips-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-radius: 14px;
    background: #fff;
    padding: 22px 24px;
    border: 1px solid #eef2f7;
}

h1,
h2,
h3,
p {
    margin: 0;
}

h1 {
    font-size: 30px;
    line-height: 1.2;
}

.clips-header p {
    margin-top: 10px;
    color: #64748b;
    font-size: 14px;
}

button,
select,
input {
    height: 34px;
    border: 0;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
}

button {
    cursor: pointer;
}

button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
}

select,
input {
    min-width: 0;
    background: #f1f5f9;
    padding: 0 12px;
    color: #334155;
}

.plain-button {
    min-width: 72px;
    background: #f1f5f9;
    color: #334155;
    padding: 0 18px;
}

.primary-button {
    min-width: 88px;
    background: #2563eb;
    color: #fff;
    padding: 0 18px;
}

.plain-button:hover,
.record-actions button:hover {
    background: #e2e8f0;
}

.primary-button:hover {
    background: #1d4ed8;
}

.stats-grid {
    max-width: 1120px;
    width: 100%;
    margin: 16px auto 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
}

.stat-card {
    border-radius: 12px;
    background: #fff;
    padding: 16px;
}

.stat-card span {
    display: block;
    color: #64748b;
    font-size: 13px;
}

.stat-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
}

.stat-card.green {
    background: #ecfdf5;
    color: #059669;
}

.stat-card.blue {
    background: #eff6ff;
    color: #2563eb;
}

.stat-card.violet {
    background: #f5f3ff;
    color: #7c3aed;
}

.filters {
    max-width: 1120px;
    width: 100%;
    margin: 16px auto 0;
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 12px;
    background: #fff;
    padding: 14px 16px;
}

.filters span {
    color: #64748b;
    font-size: 13px;
}

.selected-panel {
    margin-top: 16px;
    display: grid;
    grid-template-columns: minmax(360px, 0.92fr) minmax(420px, 1.08fr);
    gap: 16px;
}

.preview-panel,
.edit-panel,
.record-card,
.empty-state {
    border-radius: 14px;
    background: #fff;
    border: 1px solid #eef2f7;
}

.preview-panel {
    min-width: 0;
    padding: 16px;
}

.panel-title {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.panel-title h2 {
    font-size: 18px;
}

.panel-title p {
    margin-top: 4px;
    color: #64748b;
    font-size: 12px;
}

.asset-actions {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
}

.asset-actions button {
    flex-shrink: 0;
    border-radius: 8px;
    background: #eff6ff;
    padding: 0 12px;
    color: #2563eb;
    font-size: 13px;
}

.asset-actions button:hover {
    background: #dbeafe;
}

.preview-box {
    min-height: 300px;
    overflow: hidden;
    border-radius: 12px;
    background: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
}

.preview-box video,
.preview-box img {
    display: block;
    width: 100%;
    max-height: 360px;
    object-fit: contain;
}

.preview-box audio {
    width: calc(100% - 48px);
}

.no-preview {
    color: #94a3b8;
    font-size: 14px;
}

.asset-path {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: #f8fafc;
    border-radius: 10px;
    margin-top: 12px;
    padding: 10px 12px;
    color: #64748b;
    font-size: 12px;
}

.action-message {
    margin-top: 8px;
    color: #059669;
    font-size: 12px;
}

.edit-panel {
    padding: 16px;
}

.edit-title {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
}

.edit-title h2 {
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 20px;
}

.edit-title p {
    max-width: 360px;
    margin-top: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #64748b;
    font-size: 13px;
}

.save-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.save-actions span {
    color: #059669;
    font-size: 12px;
}

.form-grid {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.form-grid .wide {
    grid-column: span 2;
}

.form-grid label {
    display: grid;
    gap: 6px;
}

.form-grid label span {
    color: #64748b;
    font-size: 12px;
}

.info-grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.info-grid div {
    min-width: 0;
    border-radius: 10px;
    background: #f8fafc;
    padding: 10px 12px;
}

.info-grid span {
    display: block;
    color: #94a3b8;
    font-size: 11px;
}

.info-grid strong {
    display: block;
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #334155;
    font-size: 12px;
}

.records-section {
    margin-top: 16px;
    display: grid;
    gap: 12px;
    padding-bottom: 24px;
}

.empty-state {
    padding: 48px;
    text-align: center;
    color: #94a3b8;
}

.record-card {
    border: 1px solid transparent;
    padding: 16px;
    cursor: pointer;
}

.record-card.active {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px #dbeafe;
}

.record-main {
    display: flex;
    justify-content: space-between;
    gap: 16px;
}

.record-main h3 {
    font-size: 16px;
}

.record-main p {
    margin-top: 6px;
    max-width: 760px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #64748b;
    font-size: 13px;
}

.record-actions {
    display: flex;
    gap: 8px;
}

.record-actions button {
    background: #f1f5f9;
    color: #334155;
    padding: 0 12px;
}

.record-actions button:disabled {
    color: #2563eb;
}

.record-tags,
.record-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}

.record-tags span {
    border-radius: 999px;
    background: #f1f5f9;
    padding: 5px 10px;
    color: #475569;
    font-size: 12px;
}

.record-meta span {
    color: #64748b;
    font-size: 12px;
}

@media (max-width: 1180px) {
    .selected-panel {
        grid-template-columns: 1fr;
    }
}

@container (max-width: 860px) {
    .clips-page {
        padding: 18px;
    }

    .selected-panel {
        grid-template-columns: minmax(0, 1fr);
    }

    .stats-grid,
    .info-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .clips-header,
    .filters,
    .edit-title,
    .record-main {
        flex-direction: column;
        align-items: stretch;
    }

    .filters select {
        width: 100%;
    }

    .asset-actions,
    .save-actions,
    .record-actions {
        flex-wrap: wrap;
    }

    .preview-box {
        min-height: 220px;
    }

    .preview-box video,
    .preview-box img {
        max-height: 280px;
    }
}

@container (max-width: 620px) {
    .form-grid,
    .form-grid .wide {
        grid-template-columns: 1fr;
        grid-column: auto;
    }

    .stats-grid,
    .info-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 760px) {
    .clips-page {
        padding: 16px;
    }

    .stats-grid,
    .info-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .filters,
    .clips-header,
    .edit-title,
    .record-main {
        flex-direction: column;
        align-items: stretch;
    }

    .form-grid,
    .form-grid .wide {
        grid-template-columns: 1fr;
        grid-column: auto;
    }
}
</style>
