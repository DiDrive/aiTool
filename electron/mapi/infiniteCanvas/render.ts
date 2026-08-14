import {ipcRenderer} from "electron";

export type InfiniteCanvasMode = "external" | "bundled";

export type InfiniteCanvasStatus = {
    mode: InfiniteCanvasMode;
    configuredUrl: string;
    url: string;
    running: boolean;
    installed: boolean;
    starting: boolean;
    bundleRoot: string;
    message?: string;
    version?: string;
    credentials?: {
        username: string;
        password: string;
    };
};

const status = (): Promise<InfiniteCanvasStatus> => ipcRenderer.invoke("infiniteCanvas:status");

const configure = (patch: {mode?: InfiniteCanvasMode; externalUrl?: string}): Promise<InfiniteCanvasStatus> =>
    ipcRenderer.invoke("infiniteCanvas:configure", patch);

const start = (): Promise<InfiniteCanvasStatus> => ipcRenderer.invoke("infiniteCanvas:start");

const stop = (): Promise<InfiniteCanvasStatus> => ipcRenderer.invoke("infiniteCanvas:stop");

const open = (options: {modelConfig?: Record<string, unknown>} = {}): Promise<InfiniteCanvasStatus> =>
    ipcRenderer.invoke("infiniteCanvas:open", options);

export default {
    status,
    configure,
    start,
    stop,
    open,
};
