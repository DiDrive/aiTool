export type VideoActionRecord = {
    id?: number;
    name: string; // 动作名称，如 "挥手欢迎"
    tags: string; // 动作标签，如 "欢迎,打招呼,互动"
    video: string; // 切片或单段视频的本地绝对路径
    type: 'idle' | 'action'; // 动作类型：idle(闲时循环)、action(触发动作)
    info: any; // 存储视频的元数据信息（如时长、分辨率）
};

export const VideoActionService = {
    tableName() {
        return "data_video_action";
    },
    decodeRecord(record: VideoActionRecord): VideoActionRecord | null {
        if (!record) {
            return null;
        }
        return {
            ...record,
            info: record.info ? JSON.parse(record.info) : {},
        } as VideoActionRecord;
    },
    encodeRecord(record: VideoActionRecord): VideoActionRecord {
        if ("info" in record) {
            record.info = JSON.stringify(record.info || {});
        }
        return record;
    },
    async get(id: number): Promise<VideoActionRecord | null> {
        const record: any = await window.$mapi.db.first(
            `SELECT *
             FROM ${this.tableName()}
             WHERE id = ?`,
            [id]
        );
        return this.decodeRecord(record);
    },
    async list(): Promise<VideoActionRecord[]> {
        const records: VideoActionRecord[] = await window.$mapi.db.select(`SELECT *
                                                                             FROM ${this.tableName()}
                                                                             ORDER BY id DESC`);
        return records.map(this.decodeRecord) as VideoActionRecord[];
    },
    async insert(record: VideoActionRecord) {
        record = this.encodeRecord(record);
        const fields = Object.keys(record).join(", ");
        const values = Object.values(record);
        const valuePlaceholders = values.map(() => "?").join(", ");
        return await window.$mapi.db.insert(
            `INSERT INTO ${this.tableName()} (${fields})
             VALUES (${valuePlaceholders})`,
            values
        );
    },
    async delete(record: VideoActionRecord) {
        if (record.video) {
            await window.$mapi.file.hubDelete(record.video);
        }
        await window.$mapi.db.delete(
            `DELETE
             FROM ${this.tableName()}
             WHERE id = ?`,
            [record.id]
        );
    },
    async update(id: number, record: Partial<VideoActionRecord>) {
        record = this.encodeRecord(record as VideoActionRecord);
        const fields = Object.keys(record)
            .map(key => `${key} = ?`)
            .join(", ");
        const values = Object.values(record);
        values.push(id);
        return await window.$mapi.db.update(
            `UPDATE ${this.tableName()}
             SET ${fields}
             WHERE id = ?`,
            values
        );
    },
};
