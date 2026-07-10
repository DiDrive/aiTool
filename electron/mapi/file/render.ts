import fileIndex from "./index";
import {ipcRenderer} from "electron";

const openFile = async (options: {} = {}) => {
    return ipcRenderer.invoke("file:openFile", options);
};

const openDirectory = async (options: {} = {}) => {
    return ipcRenderer.invoke("file:openDirectory", options);
};

const openSave = async (options: {} = {}) => {
    return ipcRenderer.invoke("file:openSave", options);
};

const readSpreadsheetRows = async (path: string) => {
    return ipcRenderer.invoke("file:readSpreadsheetRows", path);
};

const writeSpreadsheetRows = async (path: string, headers: string[], rows: Record<string, unknown>[]) => {
    return ipcRenderer.invoke("file:writeSpreadsheetRows", path, headers, rows);
};

export default {
    ...fileIndex,
    openFile,
    openDirectory,
    openSave,
    readSpreadsheetRows,
    writeSpreadsheetRows,
};
