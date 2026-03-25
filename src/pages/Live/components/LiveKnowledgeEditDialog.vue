<script setup lang="ts">
import {ref} from "vue";
import {StorageRecord, StorageService} from "../../../service/StorageService";
import {Dialog} from "../../../lib/dialog";
import {t} from "../../../lang";
import {LiveKnowledgeContentType} from "../../../types/Live";
import {EventTypes} from "../util";

const visible = ref(false);
const isEdit = ref(false);
const currentRecordId = ref<number>(0);

const formData = ref<{ title: string; content: LiveKnowledgeContentType }>({
    title: "",
    content: {
        enable: true,
        type: "user",
        systemType: "Enter",
        tags: [],
        keywords: "",
        reply: "",
        replies: [],
        url: ""
    }
});

const show = (record?: StorageRecord, defaultType?: string) => {
    if (record) {
        isEdit.value = true;
        currentRecordId.value = record.id as number;
        formData.value = {
            title: record.title || "",
            content: JSON.parse(JSON.stringify(record.content)) // deep copy
        };
    } else {
        isEdit.value = false;
        currentRecordId.value = 0;
        formData.value = {
            title: "新知识库",
            content: {
                enable: true,
                type: (defaultType as any) || "user",
                systemType: "Follow",
                tags: [],
                keywords: "",
                reply: "",
                replies: [],
                url: ""
            }
        };
    }
    visible.value = true;
};

const doSave = async () => {
    if (!formData.value.title) {
        Dialog.tipError("请输入标题");
        return;
    }
    
    if (formData.value.content.type === 'user' && !formData.value.content.keywords) {
        Dialog.tipError("请输入触发关键词");
        return;
    }

    if (!formData.value.content.reply && formData.value.content.type !== 'flowVideo') {
        Dialog.tipError("请输入回复话术");
        return;
    }

    try {
        if (isEdit.value) {
            await StorageService.update(currentRecordId.value, formData.value);
            Dialog.tipSuccess("修改成功");
        } else {
            await StorageService.add("LiveKnowledge", formData.value);
            Dialog.tipSuccess("添加成功");
        }
        visible.value = false;
        emit("update");
    } catch (e) {
        Dialog.tipError("保存失败: " + e);
    }
};

defineExpose({
    show,
});

const emit = defineEmits({
    update: () => true,
});
</script>

<template>
    <a-modal v-model:visible="visible" width="600px" title-align="start" :esc-to-close="false" :mask-closable="false">
        <template #title>
            {{ isEdit ? '编辑知识库' : '添加知识库' }}
        </template>
        <template #footer>
            <a-button @click="visible = false">{{ $t("common.cancel") }}</a-button>
            <a-button type="primary" @click="doSave">{{ $t("common.save") }}</a-button>
        </template>
        <div style="max-height: 60vh" class="overflow-y-auto px-1">
            <a-form :model="formData" layout="vertical">
                <a-form-item label="标题 (方便你自己区分)" required>
                    <a-input v-model="formData.title" placeholder="例如：新人欢迎语、询问价格回复" />
                </a-form-item>
                
                <a-form-item label="是否启用">
                    <a-switch v-model="formData.content.enable" />
                </a-form-item>

                <!-- 隐藏类型选择器，避免数据交叉污染。类型由外部点击的按钮决定 -->
                <a-form-item label="知识类型" v-show="false">
                    <a-radio-group v-model="formData.content.type" type="button">
                        <a-radio value="user">弹幕关键词触发</a-radio>
                        <a-radio value="system">系统事件触发 (如进场/点赞)</a-radio>
                        <a-radio value="flowTalk">循环话术 (没人说话时播报)</a-radio>
                        <a-radio value="flowVideo">循环视频 (发呆视频)</a-radio>
                    </a-radio-group>
                </a-form-item>

                <!-- 弹幕关键词 -->
                <div v-if="formData.content.type === 'user'" class="bg-blue-50 p-4 rounded-lg mb-4">
                    <a-form-item label="触发关键词 (多个词用逗号分隔)" required>
                        <a-input v-model="formData.content.keywords" placeholder="例如：多少钱,怎么卖,价格" />
                    </a-form-item>
                </div>

                <!-- 系统事件 -->
                <div v-if="formData.content.type === 'system'" class="bg-purple-50 p-4 rounded-lg mb-4">
                    <div class="mb-4 text-orange-500 text-sm bg-orange-50 p-2 rounded">
                        提示：进场、点赞和送礼的互动话术现已迁移至全局的【直播互动】页面进行统一配置。这里仅保留对特殊自定义系统事件的支持。
                    </div>
                    <a-form-item label="选择系统事件" required>
                        <a-select v-model="formData.content.systemType">
                            <!-- 移除了 Enter, Like, Gift, 仅保留可能扩展的其他类型或提示 -->
                            <a-option value="Follow">用户关注 (Follow)</a-option>
                            <a-option value="Share">分享直播间 (Share)</a-option>
                        </a-select>
                    </a-form-item>
                </div>

                <!-- 回复内容 (视频类型不需要回复文本) -->
                <div v-if="formData.content.type !== 'flowVideo'">
                    <a-form-item label="回复话术" required>
                        <a-textarea 
                            v-model="formData.content.reply" 
                            placeholder="AI会直接朗读这段文字。可以使用 {user} 代表用户昵称。" 
                            :auto-size="{minRows: 3, maxRows: 6}"
                        />
                    </a-form-item>
                </div>

                <!-- 视频路径 (所有类型都可以附加特定动作视频，比如回答问题时挥手) -->
                <a-form-item label="关联动作视频 (可选)">
                    <a-input v-model="formData.content.url" placeholder="填写本地视频绝对路径，或通过媒体库选择" />
                    <template #extra>
                        <div>如果不填，数字人将只动嘴播放语音。如果填写了视频路径，播放这段话时会同时播放该动作视频。</div>
                    </template>
                </a-form-item>
            </a-form>
        </div>
    </a-modal>
</template>
