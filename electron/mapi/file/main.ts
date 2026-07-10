import {dialog, ipcMain} from "electron";
import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import archiver from "archiver";
import fileIndex from "./index";

type SpreadsheetReadResult = {
    headers: string[];
    rows: Record<string, string>[];
};

const escapeSpreadsheetXml = (value: unknown) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const spreadsheetColumnName = (index: number) => {
    let current = index + 1;
    let name = "";
    while (current > 0) {
        const remainder = (current - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        current = Math.floor((current - 1) / 26);
    }
    return name;
};

const spreadsheetCellXml = (rowIndex: number, columnIndex: number, value: unknown) => {
    const text = escapeSpreadsheetXml(value).replace(/\r?\n/g, "&#10;");
    return `<c r="${spreadsheetColumnName(columnIndex)}${rowIndex}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
};

const writeSpreadsheetRows = async (filePath: string, headers: string[], rows: Record<string, unknown>[]) => {
    const sheetRows = [headers, ...rows.map(row => headers.map(header => row?.[header] ?? ""))]
        .map((values, rowIndex) => `<row r="${rowIndex + 1}">${values.map((value, columnIndex) => spreadsheetCellXml(rowIndex + 1, columnIndex, value)).join("")}</row>`)
        .join("");
    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
    const files: Record<string, string> = {
        "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
        "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="批量提示词" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        "xl/worksheets/sheet1.xml": sheetXml,
    };
    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver("zip", {zlib: {level: 9}});
        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);
        archive.pipe(output);
        Object.entries(files).forEach(([name, content]) => archive.append(content, {name}));
        archive.finalize();
    });
};

const decodeXml = (value: string) => String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");

const columnIndexOfCell = (cellRef: string) => {
    const letters = String(cellRef || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "";
    let index = 0;
    for (const letter of letters) {
        index = index * 26 + letter.charCodeAt(0) - 64;
    }
    return Math.max(0, index - 1);
};

const zipEntryText = (zipFile: string, entryName: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        yauzl.open(zipFile, {lazyEntries: true}, (openErr, zip) => {
            if (openErr || !zip) {
                reject(openErr || new Error("Excel 文件打开失败"));
                return;
            }
            zip.readEntry();
            zip.on("entry", entry => {
                if (entry.fileName !== entryName) {
                    zip.readEntry();
                    return;
                }
                zip.openReadStream(entry, (streamErr, stream) => {
                    if (streamErr || !stream) {
                        zip.close();
                        reject(streamErr || new Error(`Excel 条目读取失败：${entryName}`));
                        return;
                    }
                    const chunks: Buffer[] = [];
                    stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
                    stream.on("end", () => {
                        zip.close();
                        resolve(Buffer.concat(chunks).toString("utf8"));
                    });
                    stream.on("error", err => {
                        zip.close();
                        reject(err);
                    });
                });
            });
            zip.on("end", () => resolve(""));
            zip.on("error", reject);
        });
    });
};

const parseSharedStrings = (xml: string) => {
    const strings: string[] = [];
    const itemRegex = /<si\b[\s\S]*?<\/si>/g;
    const textRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    for (const item of xml.match(itemRegex) || []) {
        const parts: string[] = [];
        let textMatch: RegExpExecArray | null;
        textRegex.lastIndex = 0;
        while ((textMatch = textRegex.exec(item))) {
            parts.push(decodeXml(textMatch[1]));
        }
        strings.push(parts.join(""));
    }
    return strings;
};

const parseSheetRows = (xml: string, sharedStrings: string[]) => {
    const rows: string[][] = [];
    const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(xml))) {
        const row: string[] = [];
        let cellMatch: RegExpExecArray | null;
        cellRegex.lastIndex = 0;
        while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
            const attrs = cellMatch[1] || "";
            const body = cellMatch[2] || "";
            const cellRef = attrs.match(/\br="([^"]+)"/)?.[1] || "";
            const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
            const colIndex = columnIndexOfCell(cellRef) || row.length;
            const inlineText = body.match(/<is\b[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1];
            const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
            let value = "";
            if (type === "s") {
                value = sharedStrings[Number(rawValue)] || "";
            } else if (type === "inlineStr") {
                value = decodeXml(inlineText || "");
            } else {
                value = decodeXml(rawValue);
            }
            row[colIndex] = String(value || "").trim();
        }
        if (row.some(Boolean)) {
            rows.push(row);
        }
    }
    return rows;
};

const rowsToObjects = (rows: string[][]): SpreadsheetReadResult => {
    const headers = (rows[0] || []).map((header, index) => String(header || `列${index + 1}`).trim());
    const dataRows = rows.slice(1).map(row => {
        const item: Record<string, string> = {};
        headers.forEach((header, index) => {
            item[header] = String(row[index] || "").trim();
        });
        return item;
    }).filter(item => Object.values(item).some(Boolean));
    return {headers, rows: dataRows};
};

const parseCsvLine = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];
        if (char === "\"" && quoted && next === "\"") {
            current += "\"";
            i += 1;
        } else if (char === "\"") {
            quoted = !quoted;
        } else if (char === "," && !quoted) {
            cells.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    cells.push(current.trim());
    return cells;
};

const readSpreadsheetRows = async (filePath: string): Promise<SpreadsheetReadResult> => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".csv") {
        const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
        return rowsToObjects(text.split(/\r?\n/).filter(Boolean).map(parseCsvLine));
    }
    if (ext !== ".xlsx") {
        throw new Error("仅支持 .xlsx 或 .csv 批量清单");
    }
    const sharedStrings = parseSharedStrings(await zipEntryText(filePath, "xl/sharedStrings.xml"));
    const workbookXml = await zipEntryText(filePath, "xl/workbook.xml");
    const workbookRels = await zipEntryText(filePath, "xl/_rels/workbook.xml.rels");
    const firstSheetRelId = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1] || "";
    const firstSheetTarget = firstSheetRelId
        ? workbookRels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${firstSheetRelId}"[^>]*\\bTarget="([^"]+)"`))?.[1]
        : "";
    const fallbackSheetTarget = workbookRels.match(/<Relationship\b[^>]*Type="[^"]*\/worksheet"[^>]*Target="([^"]+)"/)?.[1] || "worksheets/sheet1.xml";
    const sheetEntry = `xl/${(firstSheetTarget || fallbackSheetTarget).replace(/^\/?xl\//, "")}`;
    const sheetXml = await zipEntryText(filePath, sheetEntry);
    if (!sheetXml) {
        throw new Error("Excel 第一张工作表为空或无法读取");
    }
    return rowsToObjects(parseSheetRows(sheetXml, sharedStrings));
};

ipcMain.handle("file:openFile", async (
    event,
    options: {
        filters?: {
            name: string;
            extensions: string[];
        }[],
        defaultPath?: string;
        properties?: ("multiSelections" | "openFile")[]
    } = {}): Promise<string | string[] | null> => {
    options = Object.assign({
        filters: [],
        properties: [],
    }, options);
    if (!options.properties.includes("openFile")) {
        options.properties.push("openFile");
    }
    const defaultPath =
        options.defaultPath ||
        (process.platform === "win32" ? "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}" : undefined);
    const res = await dialog
        .showOpenDialog({
            ...options,
            defaultPath,
        })
        .catch(e => {
        });
    if (!res || res.canceled) {
        return null;
    }
    if (options.properties.includes("multiSelections")) {
        return res.filePaths || null;
    }
    return res.filePaths?.[0] || null;
});

ipcMain.handle("file:openDirectory", async (_, options): Promise<string | null> => {
    const res = await dialog
        .showOpenDialog({
            properties: ["openDirectory"],
            ...options,
        })
        .catch(e => {
        });
    if (!res || res.canceled) {
        return null;
    }
    return res.filePaths?.[0] || null;
});

ipcMain.handle("file:openSave", async (_, options): Promise<string | null> => {
    const res = await dialog
        .showSaveDialog({
            ...options,
        })
        .catch(e => {
        });
    if (!res || res.canceled) {
        return null;
    }
    return res.filePath || null;
});

ipcMain.handle("file:readSpreadsheetRows", async (_, filePath: string): Promise<SpreadsheetReadResult> => {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error("批量清单文件不存在");
    }
    return await readSpreadsheetRows(filePath);
});

ipcMain.handle("file:writeSpreadsheetRows", async (_, filePath: string, headers: string[], rows: Record<string, unknown>[]) => {
    await writeSpreadsheetRows(filePath, headers, rows);
});

const autoCleanTemp = async () => {
    fileIndex.autoCleanTemp(1).finally(() => {
        setTimeout(() => {
            autoCleanTemp();
        }, 10 * 60 * 1000);
    });
}

setTimeout(() => {
    autoCleanTemp().then();
}, 5000);


export default {
    ...fileIndex,
};

export const Files = {
    ...fileIndex,
};
