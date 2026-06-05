<script setup lang="ts">
import {onBeforeMount, ref} from "vue";
import PageNav from "./../components/PageNav.vue";
import {AppConfig} from "../config";
import AppQuitConfirm from "../components/AppQuitConfirm.vue";
import {useDragWindow} from "../components/common/dragWindow";
import CloudTaskSidebar from "../components/cloud/CloudTaskSidebar.vue";

const appQuitConfirm = ref<InstanceType<typeof AppQuitConfirm> | null>(null);
const isOsx = ref(false);
const isFullscreen = ref(false);
window.__page.onEnterFullScreen(() => {
    isFullscreen.value = true;
});
window.__page.onLeaveFullScreen(() => {
    isFullscreen.value = false;
});
window.__page.onShowQuitConfirmDialog(() => {
    appQuitConfirm.value?.show();
});

const {onDragWindowMouseDown} = useDragWindow({
    name: "main",
    ignore: e => {
        return !!(e.target && (e.target as any).tagName === "INPUT");
    },
});
const onDbClick = async () => {
    await window.$mapi.app.windowMax();
};

const doWindowMin = async () => {
    await window.$mapi.app.windowMin();
};

const doWindowMax = async () => {
    await window.$mapi.app.windowMax();
};

onBeforeMount(async () => {
    isOsx.value = window.$mapi.app.isPlatform("osx");
});

const doQuit = async () => {
    await appQuitConfirm.value?.show();
};
</script>
<template>
    <div class="window-container">
        <div
            class="window-header flex h-10 items-center border-b border-solid border-gray-200 dark:border-gray-800"
            :class="{osx: isOsx, fullscreen: isFullscreen}"
        >
            <div
                class="window-header-title no-drag flex-grow flex items-center"
                @dblclick="onDbClick"
                @mousedown="onDragWindowMouseDown"
            >
                <div class="pl-2 py-2">
                    <img src="/logo.svg" class="w-4 t-4" />
                </div>
                <div class="p-2 flex-grow">
                    {{ AppConfig.title }}
                </div>
            </div>
            <div v-if="!isOsx" class="p-1 leading-4">
                <div
                    class="inline-block w-6 h-6 leading-6 cursor-pointer hover:text-primary mr-1"
                    @click="doWindowMin"
                >
                    <i class="iconfont text-sm icon-min"></i>
                </div>
                <div
                    class="inline-block w-6 h-6 leading-6 cursor-pointer hover:text-primary mr-1"
                    @click="doWindowMax"
                >
                    <i class="iconfont text-sm icon-max"></i>
                </div>
                <div class="inline-block w-6 h-6 leading-6 cursor-pointer hover:text-red-500" @click="doQuit">
                    <i class="iconfont text-sm icon-close"></i>
                </div>
            </div>
        </div>
        <div class="window-body bg-[#f5f7fb]">
            <div class="page-container flex overflow-hidden">
                <div class="w-16 flex-shrink-0 h-full text-white" style="background-color: var(--color-bg-page-nav)">
                    <PageNav />
                </div>
                <div class="min-w-0 flex-grow h-full overflow-hidden">
                    <router-view :key="$route.fullPath"></router-view>
                </div>
                <div class="flex-shrink-0 h-full border-l border-white/70 bg-white/55 backdrop-blur">
                    <CloudTaskSidebar />
                </div>
            </div>
        </div>
    </div>
    <AppQuitConfirm ref="appQuitConfirm" />
</template>
