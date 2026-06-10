import { isRef, onBeforeUnmount, ref, watch, type Ref } from "vue";

type DraftSource = Record<string, any>;

const cloneJson = <T>(value: T): T => {
    return JSON.parse(JSON.stringify(value ?? null));
};

const readSourceValue = (value: any) => {
    return isRef(value) ? value.value : value;
};

const writeSourceValue = (target: any, value: any) => {
    if (isRef(target)) {
        target.value = value;
    }
};

export const usePageDraft = <T extends DraftSource>(
    key: string,
    source: T,
    options: {
        delay?: number;
        storageGroup?: string;
    } = {}
): {
    restored: Ref<boolean>;
    restore: () => Promise<void>;
    save: () => Promise<void>;
    clear: () => Promise<void>;
} => {
    const restored = ref(false);
    const storageGroup = options.storageGroup || "pageDraft";
    const delay = options.delay ?? 500;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const snapshot = () => {
        return Object.fromEntries(
            Object.entries(source).map(([name, value]) => [name, cloneJson(readSourceValue(value))])
        );
    };

    const save = async () => {
        if (!restored.value) {
            return;
        }
        await window.$mapi.storage.set(storageGroup, key, snapshot());
    };

    const scheduleSave = () => {
        if (!restored.value) {
            return;
        }
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = null;
            save();
        }, delay);
    };

    const restore = async () => {
        const saved = await window.$mapi.storage.get(storageGroup, key, null);
        if (saved && typeof saved === "object") {
            Object.entries(saved).forEach(([name, value]) => {
                if (name in source) {
                    writeSourceValue(source[name], value);
                }
            });
        }
        restored.value = true;
    };

    const clear = async () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        await window.$mapi.storage.set(storageGroup, key, null);
    };

    watch(snapshot, scheduleSave, { deep: true });

    onBeforeUnmount(() => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        save();
    });

    return {
        restored,
        restore,
        save,
        clear,
    };
};
