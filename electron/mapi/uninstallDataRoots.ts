import fs from "node:fs";
import path from "node:path";
import {AppEnv} from "./env";

const manifestPath = () => path.join(AppEnv.userData, "uninstall-data-roots.txt");

const normalizePath = (dir: string) => path.resolve(dir).replace(/[\\/]+$/, "");

const isInside = (dir: string, parent: string) => {
    const relative = path.relative(normalizePath(parent), normalizePath(dir));
    return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
};

const isDangerousRoot = (dir: string) => {
    const normalized = normalizePath(dir);
    const parsed = path.parse(normalized);
    return normalized === parsed.root || normalized.length < parsed.root.length + 3;
};

export const rememberExternalUninstallDataRoot = (dir?: string | null) => {
    if (!dir || !AppEnv.userData) return;

    const normalized = normalizePath(dir);
    if (isDangerousRoot(normalized) || isInside(normalized, AppEnv.userData)) return;

    const file = manifestPath();
    const parent = path.dirname(file);
    if (!fs.existsSync(parent)) {
        fs.mkdirSync(parent, {recursive: true});
    }

    let records: string[] = [];
    if (fs.existsSync(file)) {
        records = fs
            .readFileSync(file, "utf8")
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean);
    }
    if (!records.includes(normalized)) {
        records.push(normalized);
        fs.writeFileSync(file, records.join("\r\n") + "\r\n");
    }
};
