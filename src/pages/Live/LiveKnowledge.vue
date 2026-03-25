<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {StorageRecord, StorageService} from "../../service/StorageService";
import {Dialog} from "../../lib/dialog";
import {t} from "../../lang";
import LiveKnowledgeEditDialog from "./components/LiveKnowledgeEditDialog.vue";

const loading = ref(false);
const records = ref<StorageRecord[]>([]);
const editDialog = ref<InstanceType<typeof LiveKnowledgeEditDialog> | null>(null);
const currentTab = ref("all");

// 批量添加循环话术相关
const batchDialogVisible = ref(false);
const batchTalksText = ref("");
const batchSaving = ref(false);

const filteredRecords = computed(() => {
    if (currentTab.value === "all") return records.value;
    return records.value.filter(r => r.content.type === currentTab.value);
});

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

const doAdd = (defaultType?: string) => {
    editDialog.value?.show(undefined, defaultType);
};

const doBatchAddTalks = () => {
    batchTalksText.value = "";
    batchDialogVisible.value = true;
};

const saveBatchTalks = async () => {
    if (!batchTalksText.value.trim()) {
        Dialog.tipError("请输入话术内容");
        return;
    }

    batchSaving.value = true;
    try {
        const lines = batchTalksText.value.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        // 去重
        const uniqueLines = [...new Set(lines)];
        
        let successCount = 0;
        for (const text of uniqueLines) {
            await StorageService.add("LiveKnowledge", {
                title: text.substring(0, 15) + (text.length > 15 ? "..." : ""),
                content: {
                    enable: true,
                    type: "flowTalk",
                    reply: text,
                    keywords: "",
                    action: "",
                    systemType: "Follow"
                }
            });
            successCount++;
        }
        
        Dialog.tipSuccess(`成功批量添加 ${successCount} 条循环话术`);
        batchDialogVisible.value = false;
        await doRefresh();
        currentTab.value = "flowTalk"; // 切换到循环话术 tab 方便查看
    } catch (e) {
        Dialog.tipError("批量添加失败");
        console.error(e);
    } finally {
        batchSaving.value = false;
    }
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
                <a-dropdown-button class="ml-1" type="primary" @click="doAdd('user')">
                    <template #icon>
                        <icon-down />
                    </template>
                    添加知识 (默认关键词)
                    <template #content>
                        <a-doption @click="doAdd('user')">添加关键词回复</a-doption>
                        <a-doption @click="doAdd('system')">添加系统事件回复</a-doption>
                        <a-doption @click="doAdd('flowTalk')">添加循环话术</a-doption>
                        <a-doption @click="doBatchAddTalks">批量添加循环话术</a-doption>
                        <a-doption @click="doAdd('flowVideo')">添加循环发呆视频</a-doption>
                    </template>
                </a-dropdown-button>
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

        <!-- 批量添加循环话术弹窗 -->
        <a-modal v-model:visible="batchDialogVisible" title="批量添加循环话术" @ok="saveBatchTalks" :ok-loading="batchSaving">
            <div class="mb-2 text-gray-500 text-sm">
                请在下方输入话术，<span class="text-red-500 font-bold">每行一句</span>。系统会自动过滤空行和重复内容。
            </div>
            <a-textarea 
                v-model="batchTalksText" 
                :auto-size="{ minRows: 10, maxRows: 15 }"
                placeholder="例如：
欢迎大家来到直播间！
右下角小黄车有惊喜哦~
喜欢主播的可以点点关注，谢谢支持！"
            />
            <div class="mt-2 text-xs text-gray-400 text-right">
                已输入 {{ batchTalksText.split('\n').filter(s => s.trim()).length }} 条有效话术
            </div>
        </a-modal>
    </div>
</template>
