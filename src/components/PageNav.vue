<script setup lang="ts">
import {computed} from "vue";
import {useRouter} from "vue-router";
import {AppConfig} from "../config";
import {useUserStore} from "../store/modules/user";
import {t} from "../lang";
import {useSettingStore} from "../store/modules/setting";

const route = useRouter();
const user = useUserStore();
const setting = useSettingStore();

const activeTab = computed(() => {
    switch (route.currentRoute.value.path) {
        case "/":
        case "/home":
            return "home";
        case "/server":
            return "server";
        case "/setting":
            return "setting";
        case "/sound":
            return "sound";
        case "/video":
            return "video";
        case "/image":
            return "image";
        case "/live":
            return "live";
        case "/tool":
            return "tool";
    }
});

const userTip = computed(() => {
    return user.user.id ? user.user.name : t("common.notLoggedIn");
});

const doUser = async () => {
    if (!setting.basic.userEnable) {
        return;
    }
    await window.$mapi.user.open();
};

const pageHref = (path: string) => `#${path}`;

const goPage = (event: MouseEvent, path: string) => {
    event.preventDefault();
    const current = route.currentRoute.value;
    route.replace({
        path,
        query: current.path === path ? {_t: String(Date.now())} : {},
    });
};
</script>

<template>
    <div class="flex flex-col h-full border-r border-gray-200 dark:border-gray-600">
        <div class="py-4 px-3" :class="setting.basic.userEnable ? 'cursor-pointer' : ''" @click="doUser">
            <a-tooltip v-if="setting.basic.userEnable" :content="userTip as string" position="right" mini>
                <img
                    v-if="!user.isInit || !user.user.id"
                    class="rounded-full border border-solid border-gray-200 w-10 h-10 shadow-lg"
                    src="./../assets/image/avatar.svg"
                />
                <img
                    v-else
                    :src="user.user.avatar as string"
                    class="rounded-full border border-solid border-gray-200 w-10 h-10 shadow-lg"
                />
            </a-tooltip>
            <div v-else>
                <img
                    v-if="!user.isInit || !user.user.id"
                    class="rounded-full border border-solid border-gray-200 w-10 h-10 shadow-lg"
                    src="./../assets/image/avatar.svg"
                />
                <img
                    v-else
                    :src="user.user.avatar as string"
                    class="rounded-full border border-solid border-gray-200 w-10 h-10 shadow-lg"
                />
            </div>
        </div>
        <div class="flex-grow mt-2">
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'home' ? 'active' : ''"
                data-route-path="/"
                @click="goPage($event, '/')"
                :href="pageHref('/')"
            >
                <div>
                    <icon-home class="text-xl" />
                </div>
                <div class="text-sm">{{ $t("nav.home") }}</div>
            </a>
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'live' ? 'active' : ''"
                data-route-path="/live"
                @click="goPage($event, '/live')"
                :href="pageHref('/live')"
            >
                <div>
                    <icon-live-broadcast class="text-xl" />
                </div>
                <div class="text-sm">数字人</div>
            </a>
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'server' ? 'active' : ''"
                data-route-path="/server"
                @click="goPage($event, '/server')"
                :href="pageHref('/server')"
            >
                <div>
                    <i class="iconfont icon-server text-xl"></i>
                </div>
                <div class="text-sm">{{ $t("model.model") }}</div>
            </a>
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'video' ? 'active' : ''"
                data-route-path="/video"
                @click="goPage($event, '/video')"
                :href="pageHref('/video')"
            >
                <div>
                    <i class="iconfont icon-video text-xl"></i>
                </div>
                <div class="text-sm">{{ $t("media.video") }}</div>
            </a>
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'sound' ? 'active' : ''"
                data-route-path="/sound"
                @click="goPage($event, '/sound')"
                :href="pageHref('/sound')"
            >
                <div>
                    <i class="iconfont icon-sound text-xl"></i>
                </div>
                <div class="text-sm">{{ $t("voice.voice") }}</div>
            </a>
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'image' ? 'active' : ''"
                data-route-path="/image"
                @click="goPage($event, '/image')"
                :href="pageHref('/image')"
            >
                <div>
                    <icon-image class="text-xl" />
                </div>
                <div class="text-sm">生图</div>
            </a>
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'tool' ? 'active' : ''"
                data-route-path="/tool"
                @click="goPage($event, '/tool')"
                :href="pageHref('/tool')"
            >
                <div>
                    <icon-tool class="text-xl" />
                </div>
                <div class="text-sm">工具</div>
            </a>
            <a
                class="page-nav-item block text-center py-3"
                :class="activeTab === 'setting' ? 'active' : ''"
                data-route-path="/setting"
                @click="goPage($event, '/setting')"
                :href="pageHref('/setting')"
            >
                <div>
                    <icon-settings class="text-xl" />
                </div>
                <div class="text-sm">{{ $t("common.setting") }}</div>
            </a>
        </div>
        <div></div>
    </div>
</template>

<style scoped></style>
