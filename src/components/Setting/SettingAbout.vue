<script setup lang="ts">
import {AppConfig} from "../../config";
import {t} from "../../lang";
import {useSettingStore} from "../../store/modules/setting";

const setting = useSettingStore();
const licenseYear = new Date().getFullYear();
</script>

<template>
    <div class="flex mb-3">
        <div class="w-20">{{ t("common.version") }}</div>
        <div class="flex-grow">
            <div>
                {{ $t("社区版") }}
                v{{ AppConfig.version }} Build {{ setting.buildInfo.buildId }}
            </div>
        </div>
    </div>
    <div class="flex mb-3 items-center">
        <div class="w-20">{{ t("声明") }}</div>
        <div class="flex-grow">
            {{ t("本产品为开源软件，遵循 AGPL-3.0 license 协议。") }}
        </div>
    </div>
    <div class="text-gray-400">&copy; {{ licenseYear }} {{ AppConfig.title }}</div>
</template>
