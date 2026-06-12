<script setup lang="ts">
import {ref} from "vue";
import {AppConfig} from "../config";
import {t} from "../lang";
import {useSettingStore} from "../store/modules/setting";

const setting = useSettingStore();
const licenseYear = new Date().getFullYear();
const devSettingVisible = ref(false);

let clickTimes = 0;
let clickLastTime = 0;
const doDevSettingTriggerClick = () => {
    // click more than 5 times in 3 seconds
    const now = new Date().getTime();
    if (0 === clickLastTime) {
        clickLastTime = now;
    }
    if (now - clickLastTime < 3000) {
        clickTimes++;
        if (clickTimes >= 5) {
            devSettingVisible.value = true;
            clickTimes = 0;
        }
    } else {
        clickTimes = 0;
    }
};
</script>

<template>
    <div class="flex overflow-auto" style="height: calc(100vh - 2.5rem)">
        <div class="p-4 m-auto">
            <div class="flex pb-6">
                <div class="m-auto">
                    <div>
                        <img class="w-14 h-14 mx-auto" src="./../assets/image/logo.svg" />
                    </div>
                    <div class="text-xl pt-2 font-bold">
                        {{ AppConfig.title }}
                    </div>
                </div>
            </div>
            <div class="flex mb-3 items-center">
                <div class="w-20">{{ t("common.version") }}</div>
                <div class="flex-grow">
                    <div class="inline-block">v{{ AppConfig.version }} Build {{ setting.buildInfo.buildId }}</div>
                </div>
            </div>
            <div class="flex mb-3 items-center">
                <div class="w-20">{{ t("about.disclaimer") }}</div>
                <div class="flex-grow">
                    {{ t("about.license") }}
                </div>
            </div>
            <div v-if="devSettingVisible" class="bg-gray-100 p-3 rounded-lg">
                <div class="flex mb-4 items-center">
                    <icon-code class="mr-2" />
                    {{ t("common.developerSettings") }}
                </div>
                <div class="flex mb-4">
                    <div class="flex-grow">Test</div>
                    <div>
                        <a-radio-group
                            :model-value="setting.configEnvGet('test', 'auto').value"
                            @change="setting.onConfigEnvChange('test', $event)"
                        >
                            <a-radio value="light">ON</a-radio>
                            <a-radio value="dark">OFF</a-radio>
                        </a-radio-group>
                    </div>
                </div>
            </div>
            <div class="text-gray-400 text-center select-none" @click="doDevSettingTriggerClick">
                &copy; {{ licenseYear }} {{ AppConfig.title }}
            </div>
        </div>
    </div>
</template>

<style scoped></style>
