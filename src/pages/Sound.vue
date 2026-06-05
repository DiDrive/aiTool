<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {SoundApps} from "./Apps/all";

const route = useRoute();
const router = useRouter();
const tab = ref("");
const defaultTab = SoundApps[0]?.name || "";

const syncTabFromRoute = () => {
    const queryTab = (route.query.tab as string) || "";
    tab.value = SoundApps.some(app => app.name === queryTab) ? queryTab : defaultTab;
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
        path: "/sound",
        query: {
            tab: name,
            _t: String(Date.now()),
        },
    });
};

const dynamicComponent = computed(() => {
    for (const app of SoundApps) {
        if (app.name === tab.value) {
            return app.component;
        }
    }
    return SoundApps[0]?.component || null;
});
</script>

<template>
    <div class="pb-device-container bg-white h-full relative select-none flex">
        <div class="p-6 w-52 flex-shrink-0 border-r border-solid border-gray-100 overflow-x-hidden overflow-y-auto">
            <a
                v-for="s in SoundApps"
                :href="tabHref(s.name)"
                data-route-path="/sound"
                :data-route-tab="s.name"
                class="block p-2 rounded-lg mb-4 cursor-pointer"
                :class="tab === s.name ? 'bg-gray-200' : ''"
                @click="goTab($event, s.name)"
            >
                <div class="text-base truncate flex items-center" data-route-path="/sound" :data-route-tab="s.name">
                    <img :src="s.icon" class="w-4 h-4 mr-2 object-contain" />
                    {{ s.title }}
                </div>
            </a>
        </div>
        <div class="flex-grow h-full overflow-y-auto">
            <component :is="dynamicComponent" :key="`${route.fullPath}:${tab}`" />
        </div>
    </div>
</template>
