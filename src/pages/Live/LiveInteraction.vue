<script setup lang="ts">
import { useLiveStore } from '../../store/modules/live';
import { Dialog } from '../../lib/dialog';

const liveStore = useLiveStore();

const doSave = async () => {
    await liveStore.saveLocalConfig();
    Dialog.tipSuccess('设置已保存');
};
</script>

<template>
    <div class="p-5 h-full flex flex-col overflow-y-auto custom-scrollbar">
        <div class="mb-4 flex items-center justify-between">
            <div class="text-3xl font-bold">直播互动配置</div>
            <a-button type="primary" @click="doSave">保存所有配置</a-button>
        </div>

        <div class="bg-white rounded-xl shadow border p-6 mb-6">
            <div class="text-xl font-bold mb-4 flex items-center">
                <icon-user class="mr-2 text-blue-500" />
                AI 主播人设 (System Prompt)
            </div>
            <div class="text-gray-500 text-sm mb-4">
                这段话将作为系统指令发给大模型，决定了 AI 回复时的语气、性格和规矩。
            </div>
            <a-textarea 
                v-model="liveStore.localConfig.config.prompt.persona"
                :auto-size="{ minRows: 3, maxRows: 6 }"
                placeholder="请输入 AI 主播人设..."
            />
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
            <div class="bg-white rounded-xl shadow border p-6">
                <div class="text-xl font-bold mb-4 flex items-center">
                    <icon-message class="mr-2 text-green-500" />
                    弹幕回复 Prompt 模板
                </div>
                <div class="text-gray-500 text-sm mb-4">
                    大模型生成回复时使用的提示词。可用变量：<br>
                    <code class="bg-gray-100 px-1 rounded">{user}</code> - 观众名称<br>
                    <code class="bg-gray-100 px-1 rounded">{content}</code> - 弹幕内容
                </div>
                <a-textarea 
                    v-model="liveStore.localConfig.config.prompt.replyComment"
                    :auto-size="{ minRows: 4, maxRows: 6 }"
                />
            </div>

            <div class="bg-white rounded-xl shadow border p-6">
                <div class="text-xl font-bold mb-4 flex items-center">
                    <icon-thumb-up class="mr-2 text-red-500" />
                    大模型点赞感谢 Prompt
                </div>
                <div class="text-gray-500 text-sm mb-4">
                    当感谢模式选为“大模型”时生效。可用变量：<br>
                    <code class="bg-gray-100 px-1 rounded">{user}</code> - 观众名称
                </div>
                <a-textarea 
                    v-model="liveStore.localConfig.config.prompt.replyLike"
                    :auto-size="{ minRows: 4, maxRows: 6 }"
                />
            </div>
        </div>

        <div class="grid grid-cols-2 gap-6">
            <div class="bg-white rounded-xl shadow border p-6">
                <div class="text-xl font-bold mb-4 flex items-center">
                    <icon-gift class="mr-2 text-purple-500" />
                    大模型礼物感谢 Prompt
                </div>
                <div class="text-gray-500 text-sm mb-4">
                    当感谢模式选为“大模型”时生效。可用变量：<br>
                    <code class="bg-gray-100 px-1 rounded">{user}</code> - 老板名称<br>
                    <code class="bg-gray-100 px-1 rounded">{content}</code> - 礼物名称及数量
                </div>
                <a-textarea 
                    v-model="liveStore.localConfig.config.prompt.replyGift"
                    :auto-size="{ minRows: 4, maxRows: 6 }"
                />
            </div>

            <div class="bg-white rounded-xl shadow border p-6 flex flex-col">
                <div class="text-xl font-bold mb-4 flex items-center">
                    <icon-thunderbolt class="mr-2 text-yellow-500" />
                    本地极速感谢话术
                </div>
                <div class="text-gray-500 text-sm mb-4">
                    当感谢模式选为“本地”时，系统将从中随机抽取一句秒回。
                </div>
                <div class="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                    <div class="font-bold text-sm mb-2">👍 点赞话术 (每行一句, 支持 {user})</div>
                    <a-textarea 
                        :model-value="liveStore.localConfig.config.localThanks.like.join('\n')"
                        @update:model-value="val => liveStore.localConfig.config.localThanks.like = val.split('\n').filter(s => s.trim())"
                        :auto-size="{ minRows: 3, maxRows: 5 }"
                        class="mb-4"
                    />
                    
                    <div class="font-bold text-sm mb-2">🎁 礼物话术 (每行一句, 支持 {user}, {content})</div>
                    <a-textarea 
                        :model-value="liveStore.localConfig.config.localThanks.gift.join('\n')"
                        @update:model-value="val => liveStore.localConfig.config.localThanks.gift = val.split('\n').filter(s => s.trim())"
                        :auto-size="{ minRows: 3, maxRows: 5 }"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: #e5e7eb;
    border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #d1d5db;
}
</style>