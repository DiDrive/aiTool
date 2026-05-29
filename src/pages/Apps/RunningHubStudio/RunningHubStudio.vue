<script setup lang="ts">
import { onMounted } from "vue";
import TaskBatchDeleteAction from "../../../components/Server/TaskBatchDeleteAction.vue";
import TaskBatchDownloadAction from "../../../components/Server/TaskBatchDownloadAction.vue";
import { useCheckAll } from "../../../components/common/check-all";
import { usePaginate } from "../../../hooks/paginate";
import { useTaskChangeRefresh } from "../../../hooks/task";
import { TaskRecord, TaskService } from "../../../service/TaskService";
import RunningHubStudioCreate from "./components/RunningHubStudioCreate.vue";
import RunningHubStudioItem from "./components/RunningHubStudioItem.vue";

const { page, records, recordsForPage } = usePaginate<TaskRecord>({
    pageSize: 10,
});

const {
    mergeCheck,
    isIndeterminate,
    isAllChecked,
    onCheckAll,
    checkRecords,
} = useCheckAll({
    records: recordsForPage,
});

useTaskChangeRefresh("RunningHubTask", () => {
    doRefresh();
});

const doRefresh = async () => {
    records.value = mergeCheck(await TaskService.list("RunningHubTask"));
};

onMounted(async () => {
    await doRefresh();
});
</script>

<template>
    <div class="p-5">
        <div class="app-header mb-4 flex items-center">
            <div class="flex-grow flex items-end">
                <div class="text-3xl font-bold">RunningHub 工作台</div>
                <div class="text-gray-400 ml-3">统一提交生图、生视频、对口型、生音频、克隆音色、普通数字人任务</div>
            </div>
        </div>

        <RunningHubStudioCreate @submitted="doRefresh" />

        <div v-if="records.length > 0">
            <div class="rounded-xl shadow border p-4 mt-4 hover:shadow-lg flex items-center">
                <div class="flex-grow flex items-center">
                    <div class="mr-3">
                        <a-checkbox
                            :model-value="isAllChecked"
                            :indeterminate="isIndeterminate"
                            @change="onCheckAll"
                        >
                            全选
                        </a-checkbox>
                    </div>
                    <TaskBatchDeleteAction :records="checkRecords" @update="doRefresh" />
                    <TaskBatchDownloadAction :records="checkRecords" />
                </div>
                <div>
                    <a-pagination
                        v-model:current="page"
                        :total="records.length"
                        :page-size="10"
                        show-total
                        simple
                    />
                </div>
            </div>

            <RunningHubStudioItem
                v-for="record in recordsForPage"
                :key="record.id"
                :record="record as any"
                :on-refresh="doRefresh"
            />
        </div>

        <m-empty v-else class="mt-4" />
    </div>
</template>
