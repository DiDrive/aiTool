import { ipcRenderer } from "electron";

export type HotTrendCollectOptions = {
    keyword?: string;
    sources?: string[];
    limit?: number;
    mode?: "meme" | "topic";
};

const collect = async (options: HotTrendCollectOptions = {}) => {
    return ipcRenderer.invoke("hottrend:collect", options);
};

export default {
    collect,
};
