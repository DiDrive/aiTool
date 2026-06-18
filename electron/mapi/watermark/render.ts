import {ipcRenderer} from "electron";

const detect = async (payload: {input: string}) => {
    return ipcRenderer.invoke("watermark:detect", payload);
};

const detectVision = async (payload: {input?: string; imageDataUrl?: string; config?: any}) => {
    return ipcRenderer.invoke("watermark:detectVision", payload);
};

const repairImage = async (payload: {input: string; masks: any[]}) => {
    return ipcRenderer.invoke("watermark:repairImage", payload);
};

const repairVideo = async (payload: {input: string; masks: any[]; outputName?: string; keepAudio?: boolean}) => {
    return ipcRenderer.invoke("watermark:repairVideo", payload);
};

const repairServiceStatus = async (payload: {url?: string}) => {
    return ipcRenderer.invoke("watermark:repairServiceStatus", payload);
};

const startRepairService = async (payload: {url?: string}) => {
    return ipcRenderer.invoke("watermark:startRepairService", payload);
};

export default {
    detect,
    detectVision,
    repairImage,
    repairVideo,
    repairServiceStatus,
    startRepairService,
};
