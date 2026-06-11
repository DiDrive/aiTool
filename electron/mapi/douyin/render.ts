import { ipcRenderer } from "electron";

export type DouyinImportOptions = {
    url: string;
    cookie?: string;
    customApiUrl?: string;
    download?: boolean;
};

export type DouyinImportResult = {
    sourceUrl: string;
    resolvedUrl: string;
    awemeId?: string;
    title?: string;
    desc?: string;
    author?: string;
    coverUrl?: string;
    videoUrl?: string;
    localVideoPath?: string;
    imageUrls?: string[];
    adapter?: "dy-downloader" | "custom-api" | "builtin";
    raw?: any;
};

const importVideo = async (options: DouyinImportOptions): Promise<DouyinImportResult> => {
    return ipcRenderer.invoke("douyin:importVideo", options);
};

export default {
    importVideo,
};
