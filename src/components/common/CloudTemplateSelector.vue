<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
    CloudTemplateCapability,
    CloudTemplateRecord,
    CloudTemplateService,
    templateSupportsCapability,
} from "../../service/CloudTemplateService";

const props = withDefaults(
    defineProps<{
        modelValue?: number | null;
        capability?: CloudTemplateCapability | "";
        allowClear?: boolean;
        placeholder?: string;
    }>(),
    {
        modelValue: 0,
        capability: "",
        allowClear: true,
        placeholder: "请选择模板",
    }
);

const emit = defineEmits<{
    (e: "update:modelValue", value: number): void;
    (e: "change", record: CloudTemplateRecord | null): void;
}>();

const records = ref<CloudTemplateRecord[]>([]);

const filteredRecords = computed(() => {
    if (!props.capability) {
        return records.value;
    }
    return records.value.filter(item => templateSupportsCapability(item, props.capability as CloudTemplateCapability));
});

const refresh = async () => {
    records.value = await CloudTemplateService.list();
};

const onChange = (value: number) => {
    emit("update:modelValue", Number(value || 0));
    emit(
        "change",
        filteredRecords.value.find(item => item.id === Number(value || 0)) || null
    );
};

watch(
    () => props.capability,
    async () => {
        await refresh();
    }
);

onMounted(async () => {
    await refresh();
});

defineExpose({
    refresh,
});
</script>

<template>
    <a-select
        :model-value="modelValue || undefined"
        :allow-clear="allowClear"
        :placeholder="placeholder"
        @change="onChange as any"
    >
        <a-option v-for="record in filteredRecords" :key="record.id" :value="record.id">
            {{ record.title }} - {{ record.content.providerProfileTitle || record.content.providerType }}
        </a-option>
    </a-select>
</template>
