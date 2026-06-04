<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Dialog } from "../../lib/dialog";
import {
    DirectApiCapability,
    DirectApiPlatformRecord,
    DirectApiPlatformService,
    DirectApiPlatformType,
} from "../../service/DirectApiPlatformService";

const platformTypeOptions: Array<{ label: string; value: DirectApiPlatformType }> = [
    { label: "ExchangeToken", value: "exchangetoken" },
    { label: "自定义平台", value: "custom" },
];

const capabilityOptions: Array<{ label: string; value: DirectApiCapability }> = [
    { label: "Seedance 2.0", value: "seedance" },
    { label: "GPT Image 2", value: "gpt-image-2" },
];

const records = ref<DirectApiPlatformRecord[]>([]);
const visible = ref(false);
const testingKey = ref<string | number>("");
const form = ref<DirectApiPlatformRecord>({
    title: "",
    content: {
        platformType: "exchangetoken",
        baseUrl: "https://api.exchangetoken.ai",
        apiKey: "",
        proxyUrl: "",
        directFileRelay: {
            provider: "123pan",
            enabled: false,
            clientID: "",
            clientSecret: "",
            parentFileID: "",
            urlAuthKey: "",
            assetMode: true,
        },
        capabilities: ["seedance", "gpt-image-2"],
        isDefault: true,
    },
});

const refresh = async () => {
    records.value = await DirectApiPlatformService.list();
};

onMounted(refresh);

const resetForm = () => {
    form.value = {
        title: "ExchangeToken",
        content: {
            platformType: "exchangetoken",
            baseUrl: "https://api.exchangetoken.ai",
            apiKey: "",
            proxyUrl: "",
            directFileRelay: {
                provider: "123pan",
                enabled: false,
                clientID: "",
                clientSecret: "",
                parentFileID: "",
                urlAuthKey: "",
                assetMode: true,
            },
            capabilities: ["seedance", "gpt-image-2"],
            isDefault: records.value.length === 0,
        },
    };
};

const openAdd = () => {
    resetForm();
    visible.value = true;
};

const openEdit = (record: DirectApiPlatformRecord) => {
    form.value = JSON.parse(JSON.stringify(record));
    visible.value = true;
};

const save = async () => {
    if (!form.value.title.trim()) {
        Dialog.tipError("请输入平台名称");
        return;
    }
    if (!form.value.content.baseUrl.trim()) {
        Dialog.tipError("请输入 Base URL");
        return;
    }
    if (form.value.content.capabilities.length === 0) {
        Dialog.tipError("请至少选择一个支持能力");
        return;
    }
    const relay = form.value.content.directFileRelay;
    if (relay?.enabled) {
        if (!String(relay.clientID || "").trim()) {
            Dialog.tipError("请输入 123 云盘 Client ID");
            return;
        }
        if (!String(relay.clientSecret || "").trim()) {
            Dialog.tipError("请输入 123 云盘 Client Secret");
            return;
        }
        if (!String(relay.parentFileID || "").trim()) {
            Dialog.tipError("请输入 123 云盘 Folder ID");
            return;
        }
    }
    const exists = await DirectApiPlatformService.getByTitle(form.value.title);
    if (exists && exists.id !== form.value.id) {
        Dialog.tipError("平台名称重复");
        return;
    }
    await DirectApiPlatformService.save(form.value);
    visible.value = false;
    await refresh();
};

const setDefault = async (record: DirectApiPlatformRecord) => {
    await DirectApiPlatformService.save({
        ...record,
        content: {
            ...record.content,
            isDefault: true,
        },
    });
    await refresh();
};

const deleteRecord = async (record: DirectApiPlatformRecord) => {
    await DirectApiPlatformService.delete(record);
    await refresh();
};

const platformLabel = (value: string) => {
    return platformTypeOptions.find(item => item.value === value)?.label || value;
};

const capabilityLabels = (record: DirectApiPlatformRecord) => {
    return record.content.capabilities
        .map(value => capabilityOptions.find(item => item.value === value)?.label || value)
        .join("、");
};

const callRunningHubHandle = async (handle: string, payload: any = {}) => {
    const appAny = (window as any)?.$mapi?.app as any;
    if (appAny?.callHandleFromMainOrRender) {
        return await appAny.callHandleFromMainOrRender(handle, payload);
    }
    if (window.ipcRenderer) {
        return await window.ipcRenderer.invoke(handle, payload);
    }
    return await window.$mapi.event.callPage("main", handle, payload);
};

const testPlatform = async (record: DirectApiPlatformRecord, key: string | number = record.id || record.title) => {
    if (!record.content.baseUrl.trim()) {
        Dialog.tipError("请输入 Base URL");
        return;
    }
    testingKey.value = key;
    Dialog.loadingOn("正在检测平台连通性...");
    try {
        const res = await callRunningHubHandle("runninghub:testDirectApi", {
            apiBaseUrl: record.content.baseUrl,
            apiKey: record.content.apiKey,
            proxyUrl: record.content.proxyUrl || "",
        });
        const diagnostics = res?._diagnostics || {};
        const status = diagnostics.httpStatus ? `HTTP ${diagnostics.httpStatus}` : "未收到 HTTP 响应";
        const requestUrl = diagnostics.requestUrl || `${record.content.baseUrl.replace(/\/+$/, "")}/v1/models`;
        if (res?.code === 0) {
            Dialog.alertSuccess(`连通性检测成功\n${status}\n${requestUrl}`, "平台检测");
            return;
        }
        const msg = String(res?.msg || diagnostics.error || "检测失败");
        Dialog.alertError(`连通性检测失败\n${status}\n${requestUrl}\n${msg}`, "平台检测");
    } catch (e: any) {
        Dialog.alertError(String(e?.message || e || "检测失败"), "平台检测");
    } finally {
        Dialog.loadingOff();
        testingKey.value = "";
    }
};
</script>

<template>
    <div class="rounded-xl border border-solid border-gray-200 p-4">
        <div class="flex items-center mb-3">
            <div class="flex-grow">
                <div class="text-base font-bold">平台接入</div>
                <div class="text-gray-400 text-sm">
                    普通模型 API 的平台账号统一在这里维护，工具页只负责选择平台和创作。
                </div>
            </div>
            <a-button type="primary" @click="openAdd">新增平台</a-button>
        </div>

        <div v-if="records.length" class="space-y-3">
            <div
                v-for="record in records"
                :key="record.id"
                class="rounded-lg border border-solid border-gray-200 p-3"
            >
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <div class="font-bold">{{ record.title }}</div>
                    <a-tag>{{ platformLabel(record.content.platformType) }}</a-tag>
                    <a-tag v-if="record.content.isDefault" color="green">默认</a-tag>
                    <div class="text-gray-400 text-xs truncate">{{ record.content.baseUrl }}</div>
                </div>
                <div class="text-xs text-gray-500 mb-3">支持能力：{{ capabilityLabels(record) }}</div>
                <div v-if="record.content.proxyUrl" class="text-xs text-gray-500 mb-3">代理：{{ record.content.proxyUrl }}</div>
                <div v-if="record.content.directFileRelay?.enabled" class="text-xs text-gray-500 mb-3">
                    文件中转：123 云盘 / Folder ID {{ record.content.directFileRelay.parentFileID }}
                </div>
                <div class="flex gap-2">
                    <a-button size="small" :loading="testingKey === (record.id || record.title)" @click="testPlatform(record)">检测</a-button>
                    <a-button size="small" @click="openEdit(record)">编辑</a-button>
                    <a-button v-if="!record.content.isDefault" size="small" @click="setDefault(record)">设为默认</a-button>
                    <a-popconfirm content="确认删除这个平台配置？" @ok="deleteRecord(record)">
                        <a-button size="small" status="danger">删除</a-button>
                    </a-popconfirm>
                </div>
            </div>
        </div>
        <a-empty v-else description="还没有平台配置" />
    </div>

    <a-modal v-model:visible="visible" width="720px" title="平台接入配置">
        <template #footer>
            <a-button @click="visible = false">取消</a-button>
            <a-button type="primary" @click="save">保存</a-button>
        </template>
        <a-form :model="form" layout="vertical">
            <a-form-item label="平台名称" required>
                <a-input v-model="form.title" placeholder="例如 ExchangeToken" />
            </a-form-item>
            <a-form-item label="平台类型" required>
                <a-select v-model="form.content.platformType">
                    <a-option v-for="item in platformTypeOptions" :key="item.value" :value="item.value">
                        {{ item.label }}
                    </a-option>
                </a-select>
            </a-form-item>
            <a-form-item label="Base URL" required>
                <a-input v-model="form.content.baseUrl" placeholder="https://api.exchangetoken.ai" />
            </a-form-item>
            <a-form-item label="API Key">
                <a-input-password v-model="form.content.apiKey" allow-clear />
            </a-form-item>
            <a-form-item label="代理地址">
                <a-input v-model="form.content.proxyUrl" allow-clear placeholder="留空使用系统网络；例如 http://127.0.0.1:7890，或填 direct / system" />
            </a-form-item>
            <div class="mb-4 rounded-lg border border-solid border-gray-200 p-3">
                <div class="mb-3 flex items-center justify-between">
                    <div class="font-semibold">123 云盘中转</div>
                    <a-switch v-model="form.content.directFileRelay.enabled" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <a-form-item label="Client ID">
                        <a-input v-model="form.content.directFileRelay.clientID" allow-clear />
                    </a-form-item>
                    <a-form-item label="Client Secret">
                        <a-input-password v-model="form.content.directFileRelay.clientSecret" allow-clear />
                    </a-form-item>
                </div>
                <a-form-item label="Folder ID">
                    <a-input v-model="form.content.directFileRelay.parentFileID" allow-clear placeholder="例如 46915397" />
                </a-form-item>
                <a-form-item label="URL 鉴权密钥">
                    <a-input-password v-model="form.content.directFileRelay.urlAuthKey" allow-clear placeholder="开启 URL 鉴权时填写" />
                </a-form-item>
                <a-form-item label="ExchangeToken 资产入库">
                    <a-switch v-model="form.content.directFileRelay.assetMode" />
                </a-form-item>
            </div>
            <a-form-item label="支持能力" required>
                <a-checkbox-group v-model="form.content.capabilities">
                    <a-checkbox v-for="item in capabilityOptions" :key="item.value" :value="item.value">
                        {{ item.label }}
                    </a-checkbox>
                </a-checkbox-group>
            </a-form-item>
            <a-form-item label="默认平台">
                <a-switch v-model="form.content.isDefault" />
            </a-form-item>
            <a-form-item>
                <a-button :loading="testingKey === 'form'" @click="testPlatform(form, 'form')">检测当前配置</a-button>
            </a-form-item>
        </a-form>
    </a-modal>
</template>
