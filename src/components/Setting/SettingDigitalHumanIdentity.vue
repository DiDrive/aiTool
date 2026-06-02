<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "../../lib/dialog";
import {
    createEmptyDigitalHumanIdentityRecord,
    DigitalHumanIdentityRecord,
    DigitalHumanIdentityService,
} from "../../service/DigitalHumanIdentityService";

const records = ref<DigitalHumanIdentityRecord[]>([]);
const visible = ref(false);
const formData = ref<DigitalHumanIdentityRecord>(createEmptyDigitalHumanIdentityRecord());
const displayModeOptions = [
    { label: "普通口播", value: "normal" },
    { label: "商品叠层", value: "overlay" },
    { label: "桌面展示", value: "table" },
    { label: "左手持", value: "hold-left" },
    { label: "右手持", value: "hold-right" },
    { label: "双手持", value: "hold-both" },
    { label: "专属商品片", value: "product-clip" },
];

const refresh = async () => {
    records.value = await DigitalHumanIdentityService.list();
};

refresh();

const openAdd = () => {
    formData.value = createEmptyDigitalHumanIdentityRecord();
    visible.value = true;
};

const openEdit = (record: DigitalHumanIdentityRecord) => {
    formData.value = JSON.parse(JSON.stringify(record));
    visible.value = true;
};

const pickFile = async (
    field:
        | "coverImage"
        | "productOverlayImage"
        | "referenceVideo"
        | "idleVideo"
        | "talkVideo"
        | "holdLeftVideo"
        | "holdRightVideo"
        | "holdBothVideo"
        | "tableDisplayVideo"
        | "voiceRefAudio"
) => {
    const filters =
        field === "coverImage" || field === "productOverlayImage"
            ? [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }]
            : field === "voiceRefAudio"
              ? [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "flac"] }]
              : [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv", "webm"] }];
    const selected = await window.$mapi.file.openFile({ filters });
    if (!selected || Array.isArray(selected)) {
        return;
    }
    formData.value.content[field] = selected;
};

const save = async () => {
    if (!formData.value.title.trim()) {
        Dialog.tipError("请输入身份名称");
        return;
    }
    const exists = await DigitalHumanIdentityService.getByTitle(formData.value.title.trim());
    if (exists && exists.id !== formData.value.id) {
        Dialog.tipError("身份名称重复");
        return;
    }
    formData.value.title = formData.value.title.trim();
    formData.value.content.tags = String(formData.value.content.tags || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
    await DigitalHumanIdentityService.save(formData.value);
    visible.value = false;
    await refresh();
    Dialog.tipSuccess("身份已保存");
};

const remove = async (record: DigitalHumanIdentityRecord) => {
    await DigitalHumanIdentityService.delete(record);
    await refresh();
    Dialog.tipSuccess("身份已删除");
};

const fileName = (value?: string) => {
    return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
};
</script>

<template>
    <div class="rounded-xl border border-solid border-gray-200 p-4">
        <div class="flex items-center mb-3">
            <div class="flex-grow">
                <div class="text-base font-bold">数字人身份</div>
                <div class="text-gray-400 text-sm">
                    用来沉淀主播的一致性资产，后续模板里可直接引用 `identity.xxx`
                </div>
            </div>
            <a-button type="primary" @click="openAdd">新增身份</a-button>
        </div>
        <div v-if="records.length" class="space-y-3">
            <div
                v-for="record in records"
                :key="record.id"
                class="rounded-lg border border-solid border-gray-200 p-3"
            >
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <div class="font-bold">{{ record.title }}</div>
                    <a-tag color="arcoblue">{{ record.content.status === "ready" ? "可用" : "草稿" }}</a-tag>
                    <div v-if="record.content.bindings?.runninghub?.avatarId" class="text-xs text-gray-500">
                        RH Avatar: {{ record.content.bindings.runninghub.avatarId }}
                    </div>
                    <div v-if="record.content.bindings?.heygem?.avatarId" class="text-xs text-gray-500">
                        HeyGem Avatar: {{ record.content.bindings.heygem.avatarId }}
                    </div>
                </div>
                <div class="text-xs text-gray-500 leading-6">
                    <div v-if="record.content.referenceVideo">参考视频：{{ fileName(record.content.referenceVideo) }}</div>
                    <div v-if="record.content.idleVideo">待机片：{{ fileName(record.content.idleVideo) }}</div>
                    <div v-if="record.content.holdLeftVideo">左手持：{{ fileName(record.content.holdLeftVideo) }}</div>
                    <div v-if="record.content.holdRightVideo">右手持：{{ fileName(record.content.holdRightVideo) }}</div>
                    <div v-if="record.content.holdBothVideo">双手持：{{ fileName(record.content.holdBothVideo) }}</div>
                    <div v-if="record.content.voiceRefAudio">参考音频：{{ fileName(record.content.voiceRefAudio) }}</div>
                    <div v-if="record.content.voiceRefText">参考文案：{{ record.content.voiceRefText }}</div>
                </div>
                <div class="flex gap-2 mt-3">
                    <a-button size="small" @click="openEdit(record)">编辑</a-button>
                    <a-popconfirm content="确认删除这个数字人身份？" @ok="remove(record)">
                        <a-button size="small" status="danger">删除</a-button>
                    </a-popconfirm>
                </div>
            </div>
        </div>
        <a-empty v-else description="还没有数字人身份" />
    </div>

    <a-modal v-model:visible="visible" width="760px" title="数字人身份" :mask-closable="false">
        <template #footer>
            <a-button @click="visible = false">取消</a-button>
            <a-button type="primary" @click="save">保存</a-button>
        </template>
        <a-form :model="formData" layout="vertical">
            <a-form-item label="身份名称" required>
                <a-input v-model="formData.title" placeholder="例如：主播小美-直播间白衬衫" />
            </a-form-item>
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="封面图">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('coverImage')">选择图片</a-button>
                            <a-input v-model="formData.content.coverImage" allow-clear placeholder="可选" />
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="状态">
                        <a-select v-model="formData.content.status">
                            <a-option value="draft">草稿</a-option>
                            <a-option value="ready">可用</a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="参考视频">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('referenceVideo')">选择视频</a-button>
                            <a-input v-model="formData.content.referenceVideo" allow-clear placeholder="固定底片/参考视频" />
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="待机片">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('idleVideo')">选择视频</a-button>
                            <a-input v-model="formData.content.idleVideo" allow-clear placeholder="切片衔接用待机片" />
                        </div>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="普通讲解片">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('talkVideo')">选择视频</a-button>
                            <a-input v-model="formData.content.talkVideo" allow-clear placeholder="通用口播母版" />
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="桌面展示片">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('tableDisplayVideo')">选择视频</a-button>
                            <a-input v-model="formData.content.tableDisplayVideo" allow-clear placeholder="桌面摆放商品的母版" />
                        </div>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-row :gutter="16">
                <a-col :span="8">
                    <a-form-item label="左手持片">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('holdLeftVideo')">选择视频</a-button>
                            <a-input v-model="formData.content.holdLeftVideo" allow-clear placeholder="左手持商品" />
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="右手持片">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('holdRightVideo')">选择视频</a-button>
                            <a-input v-model="formData.content.holdRightVideo" allow-clear placeholder="右手持商品" />
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="8">
                    <a-form-item label="双手持片">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('holdBothVideo')">选择视频</a-button>
                            <a-input v-model="formData.content.holdBothVideo" allow-clear placeholder="双手托举商品" />
                        </div>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="参考音频">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('voiceRefAudio')">选择音频</a-button>
                            <a-input v-model="formData.content.voiceRefAudio" allow-clear placeholder="音色参考音频" />
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="参考文案">
                        <a-input v-model="formData.content.voiceRefText" allow-clear placeholder="与参考音频对应的文案" />
                    </a-form-item>
                </a-col>
            </a-row>
            <a-form-item label="背景描述">
                <a-input v-model="formData.content.backgroundPrompt" allow-clear placeholder="例如：直播间暖光背景，货架在后方" />
            </a-form-item>
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="服装描述">
                        <a-input v-model="formData.content.outfitPrompt" allow-clear placeholder="例如：白衬衫，简约主播风" />
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="镜头描述">
                        <a-input v-model="formData.content.cameraPrompt" allow-clear placeholder="例如：正面半身，中景，镜头稳定" />
                    </a-form-item>
                </a-col>
            </a-row>
            <a-form-item label="手持/展示提示">
                <a-input
                    v-model="formData.content.holdingPrompt"
                    allow-clear
                    placeholder="例如：双手自然托举商品，商品朝向镜头，避免遮挡脸部"
                />
            </a-form-item>
            <a-row :gutter="16">
                <a-col :span="12">
                    <a-form-item label="商品叠层参考图">
                        <div class="flex gap-2">
                            <a-button @click="pickFile('productOverlayImage')">选择图片</a-button>
                            <a-input v-model="formData.content.productOverlayImage" allow-clear placeholder="可选，用于固定商品叠层样式" />
                        </div>
                    </a-form-item>
                </a-col>
                <a-col :span="12">
                    <a-form-item label="支持的展示模式">
                        <a-select
                            v-model="formData.content.supportedDisplayModes"
                            multiple
                            allow-search
                            placeholder="这个主播可用哪些商品展示方式"
                        >
                            <a-option v-for="item in displayModeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </a-option>
                        </a-select>
                    </a-form-item>
                </a-col>
            </a-row>
            <a-form-item label="商品叠层安全区">
                <a-row :gutter="12">
                    <a-col :span="6">
                        <a-input-number v-model="formData.content.overlaySafeArea!.x" :min="0" :max="1" :step="0.01" placeholder="x" />
                    </a-col>
                    <a-col :span="6">
                        <a-input-number v-model="formData.content.overlaySafeArea!.y" :min="0" :max="1" :step="0.01" placeholder="y" />
                    </a-col>
                    <a-col :span="6">
                        <a-input-number v-model="formData.content.overlaySafeArea!.width" :min="0" :max="1" :step="0.01" placeholder="width" />
                    </a-col>
                    <a-col :span="6">
                        <a-input-number v-model="formData.content.overlaySafeArea!.height" :min="0" :max="1" :step="0.01" placeholder="height" />
                    </a-col>
                </a-row>
                <div class="mt-1 text-xs text-gray-500">
                    使用 0-1 相对坐标，后续做商品叠层或商品贴边展示时直接复用。
                </div>
            </a-form-item>
            <a-form-item label="RunningHub 绑定">
                <a-row :gutter="12">
                    <a-col :span="8">
                        <a-input v-model="formData.content.bindings!.runninghub!.avatarId" allow-clear placeholder="avatarId" />
                    </a-col>
                    <a-col :span="8">
                        <a-input v-model="formData.content.bindings!.runninghub!.voiceId" allow-clear placeholder="voiceId" />
                    </a-col>
                    <a-col :span="8">
                        <a-input v-model="formData.content.bindings!.runninghub!.faceId" allow-clear placeholder="faceId" />
                    </a-col>
                </a-row>
            </a-form-item>
            <a-form-item label="HeyGem 绑定">
                <a-row :gutter="12">
                    <a-col :span="8">
                        <a-input v-model="formData.content.bindings!.heygem!.avatarId" allow-clear placeholder="avatarId" />
                    </a-col>
                    <a-col :span="8">
                        <a-input v-model="formData.content.bindings!.heygem!.voiceId" allow-clear placeholder="voiceId" />
                    </a-col>
                    <a-col :span="8">
                        <a-input v-model="formData.content.bindings!.heygem!.speakerId" allow-clear placeholder="speakerId" />
                    </a-col>
                </a-row>
            </a-form-item>
            <a-form-item label="标签">
                <a-input
                    :model-value="Array.isArray(formData.content.tags) ? formData.content.tags.join(', ') : ''"
                    @update:model-value="value => formData.content.tags = String(value || '') as any"
                    allow-clear
                    placeholder="多个标签用英文逗号分隔"
                />
            </a-form-item>
        </a-form>
    </a-modal>
</template>
