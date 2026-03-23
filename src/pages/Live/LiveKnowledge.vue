<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {StorageRecord, StorageService} from "../../service/StorageService";
import {Dialog} from "../../lib/dialog";
import {t} from "../../lang";
import LiveKnowledgeEditDialog from "./components/LiveKnowledgeEditDialog.vue";

const loading = ref(false);
const records = ref<StorageRecord[]>([]);
const editDialog = ref<InstanceType<typeof LiveKnowledgeEditDialog> | null>(null);

const doRefresh = async () => {
    loading.value = true;
    records.value = await StorageService.list("LiveKnowledge");
    loading.value = false;
};

const doDelete = async (record: StorageRecord) => {
    await Dialog.confirm(t("common.deleteConfirm"));
    await StorageService.delete(record);
    await doRefresh();
};

const doAdd = () => {
    editDialog.value?.show();
};

const doEdit = (record: StorageRecord) => {
    editDialog.value?.show(record);
};

onMounted(() => {
    doRefresh();
});
</script>

<template>
    <div class="p-5 h-full flex flex-col">
        <div class="mb-4 flex items-center">
            <div class="text-3xl font-bold flex-grow">直播知识库</div>
            <div class="flex items-center">
                <a-button class="ml-1" type="primary" @click="doAdd()">
                    <template #icon>
                        <icon-plus />
                    </template>
                    添加知识
                </a-button>
                <a-button class="ml-1" @click="doRefresh()">
                    <template #icon>
                        <icon-refresh />
                    </template>
                    刷新
                </a-button>
            </div>
        </div>
        
        <div class="flex-grow overflow-auto">
            <div v-if="loading">
                <m-loading />
            </div>
            <div v-else-if="records.length === 0" class="py-20">
                <m-empty />
            </div>
            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div v-for="r in records" :key="r.id" 
                     class="rounded-xl shadow border p-4 bg-white hover:shadow-lg transition-shadow relative group cursor-pointer"
                     @click="doEdit(r)">
                    <div class="flex items-center mb-2 border-b pb-2">
                        <div class="flex-grow font-bold text-lg text-gray-800">
                            {{ r.title }}
                        </div>
                        <div class="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-100">
                            {{ r.content.type === 'flowVideo' ? '循环视频' : r.content.type === 'flowTalk' ? '循环话术' : r.content.type === 'user' ? '用户互动' : '系统互动' }}
                        </div>
                    </div>
                    
                    <div class="text-sm text-gray-600 mb-2 h-16 overflow-hidden">
                        <div v-if="r.content.type === 'user'" class="mb-1">
                            <span class="text-gray-400">关键词：</span> {{ r.content.keywords || '无' }}
                        </div>
                        <div v-if="r.content.type === 'system'" class="mb-1">
                            <span class="text-gray-400">触发事件：</span> {{ r.content.systemType || '无' }}
                        </div>
                        <div class="truncate">
                            <span class="text-gray-400">回复：</span> {{ r.content.reply || '无' }}
                        </div>
                    </div>

                    <div class="flex items-center justify-between mt-4 pt-2 border-t border-gray-50">
                        <div class="text-xs text-gray-400">
                            <timeago :datetime="r['createdAt'] * 1000" />
                        </div>
                        <div class="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a-button type="text" size="mini" @click.stop="doDelete(r)">
                                <template #icon><icon-delete class="text-red-500" /></template>
                            </a-button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <LiveKnowledgeEditDialog ref="editDialog" @update="doRefresh" />
    </div>
</template>
