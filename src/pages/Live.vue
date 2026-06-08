<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import LiveTalk from "./Live/LiveTalk.vue";
import LiveKnowledge from "./Live/LiveKnowledge.vue";
import LiveMonitor from "./Live/LiveMonitor.vue";
import LiveInteraction from "./Live/LiveInteraction.vue";
import {DigitalHumanApps} from "./Apps/all";

const route = useRoute();
const router = useRouter();
const tab = ref("");
const liveApps = [
    ...DigitalHumanApps,
    {
        name: "knowledge",
        title: "直播知识库",
        icon: "",
        component: LiveKnowledge,
    },
    {
        name: "monitor",
        title: "直播控制台",
        icon: "",
        component: LiveMonitor,
    },
    {
        name: "event",
        title: "直播互动",
        icon: "",
        component: LiveInteraction,
    },
    {
        name: "liveTalk",
        title: "播报历史",
        icon: "",
        component: LiveTalk,
    },
];
const defaultTab = liveApps[0]?.name || "";

const syncTabFromRoute = () => {
    const queryTab = (route.query.tab as string) || "";
    tab.value = liveApps.some(app => app.name === queryTab) ? queryTab : defaultTab;
};

watch(
    () => route.query.tab,
    () => {
        syncTabFromRoute();
    },
    {immediate: true}
);

const tabHref = (name: string) => `#${route.path}?tab=${encodeURIComponent(name)}&_t=${Date.now()}`;

const goTab = (event: MouseEvent, name: string) => {
    event.preventDefault();
    router.replace({
        path: "/live",
        query: {
            tab: name,
            _t: String(Date.now()),
        },
    });
};

const dynamicComponent = computed(() => {
    for (const app of liveApps) {
        if (app.name === tab.value) {
            return app.component;
        }
    }
    return liveApps[0]?.component || null;
});
</script>

<template>
    <div class="pb-device-container bg-white h-full relative select-none flex">
        <div class="p-4 w-56 flex-shrink-0 border-r border-solid border-gray-100 overflow-x-hidden overflow-y-auto">
            <a
                v-for="s in liveApps"
                :key="s.name"
                :href="tabHref(s.name)"
                data-route-path="/live"
                :data-route-tab="s.name"
                class="block p-2 rounded-lg mb-3 cursor-pointer"
                :class="tab === s.name ? 'bg-gray-200' : ''"
                @click="goTab($event, s.name)"
            >
                <div class="text-base truncate flex items-center" data-route-path="/live" :data-route-tab="s.name">
                    <img v-if="s.icon" :src="s.icon" class="w-4 h-4 mr-2 object-contain" />
                    <span v-else class="inline-block w-4 h-4 mr-2 text-center leading-4 text-gray-400">•</span>
                    {{ s.title }}
                </div>
            </a>
        </div>
        <div class="flex-grow bg-gray-50 h-full overflow-hidden">
            <component :is="dynamicComponent" :key="`${route.fullPath}:${tab}`" />
        </div>
    </div>
</template>

<style scoped></style>
