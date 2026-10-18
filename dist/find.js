import { findUtil } from "@wxn0brp/db-core/utils/action";
import { findObj } from "@wxn0brp/db-core/utils/process";
import { rowToData } from "./storage/row.js";
import { getColumns } from "./storage/schema.js";
import { buildWhere } from "./storage/where.js";
import { POSTGRES_STORAGE_ID } from "./types.js";
export async function find(pgv, config) {
    const { collection } = config;
    await pgv.ensureCollection(collection);
    const columns = await getColumns(pgv, collection);
    const where = await buildWhere(pgv, collection, config);
    const primaryKey = pgv.primaryKey(collection);
    const result = await pgv.query(`SELECT * FROM ${pgv.table(collection)} ${where.sql} ORDER BY ctid`, where.values);
    const docs = result.rows
        .map(row => {
        const data = rowToData(row, columns);
        const search = config.search;
        if (search && typeof search === "object" && !Array.isArray(search)) {
            for (const [key, value] of Object.entries(search)) {
                if (!key.startsWith("$") && value === null && row[key] === null) {
                    data[key] = null;
                }
                if (key === primaryKey &&
                    typeof value === "number" &&
                    typeof data[key] === "string") {
                    const num = Number(data[key]);
                    if (!Number.isNaN(num) &&
                        Number.isFinite(num) &&
                        String(num) === data[key]) {
                        data[key] = num;
                    }
                }
            }
        }
        Object.defineProperty(data, POSTGRES_STORAGE_ID, {
            value: row[primaryKey],
            enumerable: false,
            configurable: true,
        });
        return findObj(config, data);
    })
        .filter(Boolean);
    return findUtil(config, docs, []);
}
