<script setup lang="ts">
import ModelSelector from "./ModelSelector.vue";
import {onMounted, ref, watch} from "vue";
import {StorageUtil} from "../../lib/storage";
import {useModelStore} from "./store/model";
import {StringUtil} from "../../lib/util";
import {ModelChatResult} from "./provider/provider";
import {t} from "../../lang";
import {ChatParam} from "./types";

const modelStore = useModelStore();
const selectedModel = ref<string>("");
const props = defineProps({
    biz: {
        type: String,
        default: "",
    },
});
watch(selectedModel, newValue => {
    if (props.biz) {
        StorageUtil.set(`ModelGenerator.${props.biz}`, newValue);
    }
});
onMounted(() => {
    if (props.biz) {
        selectedModel.value = StorageUtil.get(`ModelGenerator.${props.biz}`, "");
    }
});

const chat = async (
    prompt: string,
    chatParam: ChatParam,
    param?: Record<string, any>,
    option?: {
        format?: "text" | "json";
    }
): Promise<ModelChatResult> => {
    option = Object.assign({
        format: "text",
    }, option);
    if (param) {
        prompt = StringUtil.replaceParam(prompt, param);
        if (chatParam.systemPrompt) {
            chatParam.systemPrompt = StringUtil.replaceParam(chatParam.systemPrompt, param);
        }
    }
    const [providerId, modelId] = (selectedModel.value || "|").split("|");
    const ret = await modelStore.chat(providerId, modelId, prompt, chatParam);
    if (ret.code) {
        return ret;
    }
    if (option.format === 'json') {
        let content = ret.data!.content;
        if (!content) {
            ret.code = -1;
            ret.msg = t("error.responseEmpty");
            return ret;
        }
        content = content.trim();
        content = normalizeJsonLikeContent(content);
        try {
            ret.data!.json = parseJsonLikeContent(content);
        } catch (e) {
            ret.code = -1;
            ret.msg = t("error.parseFailed") + ':' + content;
        }
    }
    return ret;
};

const normalizeJsonLikeContent = (content: string) => {
    let result = content.trim();
    result = result
        .replace(/^<\|begin_of_box\|>/i, "")
        .replace(/<\|end_of_box\|>$/i, "")
        .replace(/^<\|begin_of_text\|>/i, "")
        .replace(/<\|end_of_text\|>$/i, "")
        .trim();
    if (/^```json/i.test(result)) {
        result = result.replace(/^```json/i, "").replace(/```$/i, "").trim();
    } else if (/^```/.test(result)) {
        result = result.replace(/^```/, "").replace(/```$/i, "").trim();
    }
    if (/^[\[{]/.test(result)) {
        return result;
    }
    const objectStart = result.indexOf("{");
    const objectEnd = result.lastIndexOf("}");
    const arrayStart = result.indexOf("[");
    const arrayEnd = result.lastIndexOf("]");
    const objectCandidate = objectStart >= 0 && objectEnd > objectStart ? result.slice(objectStart, objectEnd + 1) : "";
    const arrayCandidate = arrayStart >= 0 && arrayEnd > arrayStart ? result.slice(arrayStart, arrayEnd + 1) : "";
    if (objectCandidate && (!arrayCandidate || objectStart < arrayStart)) {
        return objectCandidate;
    }
    if (arrayCandidate) {
        return arrayCandidate;
    }
    return result;
};

const parseJsonLikeContent = (content: string) => {
    const attempts = Array.from(
        new Set([
            content,
            extractBalancedJson(content),
            sanitizeJsonText(content),
            sanitizeJsonText(extractBalancedJson(content)),
        ].filter(Boolean))
    );
    let lastError: any = null;
    for (const attempt of attempts) {
        try {
            return JSON.parse(attempt);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("JSON parse failed");
};

const extractBalancedJson = (content: string) => {
    const raw = String(content || "").trim();
    const firstObject = raw.indexOf("{");
    const firstArray = raw.indexOf("[");
    const start =
        firstObject >= 0 && (firstArray < 0 || firstObject < firstArray)
            ? firstObject
            : firstArray;
    if (start < 0) {
        return raw;
    }
    const openChar = raw[start];
    const closeChar = openChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === "\"") {
                inString = false;
            }
            continue;
        }
        if (ch === "\"") {
            inString = true;
        } else if (ch === openChar) {
            depth++;
        } else if (ch === closeChar) {
            depth--;
            if (depth === 0) {
                return raw.slice(start, i + 1);
            }
        }
    }
    return raw.slice(start);
};

const sanitizeJsonText = (content: string) => {
    let inString = false;
    let escaped = false;
    let result = "";
    for (const ch of String(content || "").replace(/^\uFEFF/, "")) {
        if (inString) {
            if (escaped) {
                result += ch;
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                result += ch;
                escaped = true;
                continue;
            }
            if (ch === "\"") {
                result += ch;
                inString = false;
                continue;
            }
            if (ch === "\n") {
                result += "\\n";
                continue;
            }
            if (ch === "\r") {
                result += "\\r";
                continue;
            }
            if (ch === "\t") {
                result += "\\t";
                continue;
            }
            result += ch;
            continue;
        }
        if (ch === "\"") {
            inString = true;
        }
        if (ch >= " " || ch === "\n" || ch === "\r" || ch === "\t") {
            result += ch;
        }
    }
    return result.replace(/,\s*([}\]])/g, "$1").trim();
};

const getSelectedModelInfo = () => {
    const [providerId, modelId] = (selectedModel.value || "|").split("|");
    const provider = modelStore.providers.find(item => item.id === providerId);
    const model = provider?.data.models.find(item => item.id === modelId) || null;
    return {
        providerId,
        providerTitle: provider?.title || "",
        modelId,
        modelName: model?.name || "",
        model,
    };
};

defineExpose({
    chat,
    getSelectedModelInfo,
});
</script>

<template>
    <ModelSelector v-model="selectedModel"/>
</template>
