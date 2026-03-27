<script setup lang="ts">
import {onMounted, ref} from "vue";
import {Dialog} from "../../lib/dialog";
import {t} from "../../lang";
import {VideoActionRecord, VideoActionService} from "../../service/VideoActionService";
import VideoPlayer from "../../components/common/VideoPlayer.vue";
import VideoActionEditDialog from "./components/VideoActionEditDialog.vue";

const editDialog = ref<InstanceType<typeof VideoActionEditDialog>>();
const records = ref<VideoActionRecord[]>([]);
const loading = ref(true);

const doRefresh = async () => {
    loading.value = true;
    records.value = await VideoActionService.list();
    loading.value = false;
};

onMounted(async () => {
    await doRefresh();
});

const doDelete = async (record: VideoActionRecord) => {
    await Dialog.confirm(t("common.deleteConfirm"));
    await VideoActionService.delete(record);
    await doRefresh();
};

const onUpdate = async () => {
    await doRefresh();
};
</script>

<template>
    <div class="p-5 h-full flex flex-col">
        <div class="mb-4 flex items-center">
            <div class="flex-grow flex items-end">
                <div class="text-3xl font-bold">数字人动作库</div>
                <div class="text-gray-400 ml-3">管理数字人的微动作与互动动作片段</div>
            </div>
            <div class="flex items-center">
                <a-button @click="editDialog?.add()" type="primary">
                    <template #icon>
                        <icon-plus />
                    </template>
                    添加动作片段
                </a-button>
            </div>
        </div>
        
        <div class="flex-grow overflow-y-auto">
            <m-empty v-if="!records.length && !loading" />
            <m-loading v-else-if="!records.length && loading" page />
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <div v-for="r in records" :key="r.id" class="bg-white rounded-xl shadow border p-4 hover:shadow-lg transition-shadow">
                    <div class="flex items-center justify-between mb-2">
                        <div class="font-bold truncate text-lg" :title="r.name">{{ r.name }}</div>
                        <div class="flex items-center space-x-2">
                            <a-tag :color="r.type === 'idle' ? 'blue' : 'orange'" size="small">
                                {{ r.type === 'idle' ? '闲时微动' : '触发动作' }}
                            </a-tag>
                            <a-button type="text" status="danger" size="mini" @click="doDelete(r)">
                                <template #icon><icon-delete /></template>
                            </a-button>
                        </div>
                    </div>
                    
                    <div class="mb-3 h-40 bg-black rounded-lg overflow-hidden relative group">
                        <VideoPlayer :url="'file://' + r.video" width="100%" height="100%" />
                    </div>
                    
                    <div class="flex flex-wrap gap-1 mt-2">
                        <a-tag v-for="tag in r.tags.split(',').filter(Boolean)" :key="tag" color="gray" size="small" bordered>
                            #{{ tag.trim() }}
                        </a-tag>
                        <span v-if="!r.tags" class="text-xs text-gray-400">暂无标签</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <VideoActionEditDialog @update="onUpdate" ref="editDialog" />
</template>
