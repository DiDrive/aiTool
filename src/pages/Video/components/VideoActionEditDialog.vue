<script setup lang="ts">
import {ref} from "vue";
import {Dialog} from "../../../lib/dialog";
import {t} from "../../../lang";
import VideoPlayer from "../../../components/common/VideoPlayer.vue";
import {VideoActionRecord, VideoActionService} from "../../../service/VideoActionService";
import {ffmpegVideoNormal} from "../../../lib/ffmpeg";
import {ffprobeVideoInfo} from "../../../lib/ffprobe";

const visible = ref(false);
const videoPlayer = ref<InstanceType<typeof VideoPlayer> | null>(null);

const formData = ref({
    name: "",
    tags: "",
    type: "idle" as "idle" | "action",
    video: "",
});

const tagInput = ref("");

const add = () => {
    formData.value.name = "";
    formData.value.tags = "";
    formData.value.type = "idle";
    formData.value.video = "";
    tagInput.value = "";
    visible.value = true;
};

const doSelectFile = async () => {
    const path = await window.$mapi.file.openFile({
        accept: "video/*",
    });
    if (path) {
        formData.value.video = path;
    }
};

const handleTagInputEnter = () => {
    if (tagInput.value) {
        const currentTags = formData.value.tags ? formData.value.tags.split(',') : [];
        if (!currentTags.includes(tagInput.value)) {
            currentTags.push(tagInput.value);
            formData.value.tags = currentTags.join(',');
        }
        tagInput.value = "";
    }
};

const removeTag = (tagToRemove: string) => {
    const currentTags = formData.value.tags.split(',').filter(t => t !== tagToRemove);
    formData.value.tags = currentTags.join(',');
};

const doSave = async () => {
    if (!formData.value.name) {
        Dialog.tipError(t("hint.inputName"));
        return;
    }
    if (!formData.value.video) {
        Dialog.tipError(t("hint.selectVideo"));
        return;
    }
    try {
        Dialog.loadingOn(t("msg.videoProcessing"));
        const normalPath = await ffmpegVideoNormal(formData.value.video, {
            durationMax: 300, // 动作片段可以长一点，比如5分钟
        });
        const videoInfo = await ffprobeVideoInfo(normalPath);
        const videoPathFull = await window.$mapi.file.hubSave(normalPath);
        
        await VideoActionService.insert({
            name: formData.value.name,
            tags: formData.value.tags,
            type: formData.value.type,
            video: videoPathFull,
            info: videoInfo,
        } as VideoActionRecord);
        
        visible.value = false;
        emit("update");
    } catch (e) {
        console.error(e);
        Dialog.tipError(t("error.videoProcessFailed") + ":" + e);
    } finally {
        Dialog.loadingOff();
    }
};

defineExpose({
    add,
});

const emit = defineEmits({
    update: () => true,
});
</script>

<template>
    <a-modal v-model:visible="visible" width="800px" title-align="start">
        <template #title>
            添加数字人动作片段
        </template>
        <template #footer>
            <a-button @click="visible = false">取消</a-button>
            <a-button type="primary" @click="doSave">保存动作</a-button>
        </template>
        
        <div class="flex gap-6 max-h-[60vh] overflow-y-auto p-2">
            <!-- 左侧表单 -->
            <div class="w-1/2 flex flex-col gap-4">
                <a-form :model="formData" layout="vertical">
                    <a-form-item label="动作名称" required>
                        <a-input v-model="formData.name" placeholder="例如：挥手欢迎、看右下角" />
                    </a-form-item>
                    
                    <a-form-item label="动作类型" required>
                        <a-radio-group v-model="formData.type" type="button">
                            <a-radio value="idle">闲时微动 (循环)</a-radio>
                            <a-radio value="action">交互动作 (触发)</a-radio>
                        </a-radio-group>
                        <div class="text-xs text-gray-400 mt-1">
                            闲时微动会在数字人不说话时随机循环播放；交互动作会在特定话术或弹幕触发时强行插入。
                        </div>
                    </a-form-item>
                    
                    <a-form-item label="动作标签">
                        <div class="flex flex-col gap-2 w-full">
                            <div class="flex flex-wrap gap-2">
                                <a-tag v-for="tag in formData.tags.split(',').filter(Boolean)" :key="tag" closable @close="removeTag(tag)">
                                    {{ tag }}
                                </a-tag>
                            </div>
                            <a-input v-model="tagInput" @press-enter="handleTagInputEnter" placeholder="输入标签后回车添加，如：欢迎" />
                        </div>
                    </a-form-item>
                </a-form>
            </div>
            
            <!-- 右侧视频 -->
            <div class="w-1/2">
                <div class="font-bold mb-2">动作视频素材</div>
                <div class="w-full">
                    <div class="mb-3" v-if="formData.video">
                        <div class="h-64 rounded-lg p-2 bg-black flex items-center justify-center">
                            <VideoPlayer ref="videoPlayer" :url="`file://${formData.video}`" width="100%" height="100%" />
                        </div>
                        <div class="mt-2 text-center">
                            <a-button size="small" @click="doSelectFile">重新选择</a-button>
                        </div>
                    </div>
                    <div class="mb-3" v-else>
                        <div
                            class="h-64 bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-center cursor-pointer transition-colors"
                            @click="doSelectFile"
                        >
                            <div class="mx-auto text-gray-400">
                                <icon-upload class="text-4xl mb-2" />
                                <div>点击选择本地短视频或切片</div>
                                <div class="text-xs mt-1">建议时长：闲时5-10秒，动作2-5秒</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </a-modal>
</template>
