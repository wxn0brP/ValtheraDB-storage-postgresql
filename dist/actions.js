import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import { AdapterCloseError, AdapterError, AdapterInitError, isValtheraError, QueryValidationError, TransactionError, } from "@wxn0brp/db-core/errors";
import { addId, addIdBulk } from "@wxn0brp/db-core/helpers/addId";
import { genId } from "@wxn0brp/db-core/helpers/gen";
import { find } from "./find.js";
import { remove } from "./remove.js";
import { serializeData } from "./storage/codec.js";
import { quoteIdentifier, sqlColumnForField } from "./storage/identifiers.js";
import { ensureColumns, migrateLegacyJsonb } from "./storage/schema.js";
import { buildWhere } from "./storage/where.js";
import { update } from "./update.js";
import { version } from "./version.js";
export class PostgreSQLValthera extends ActionsBase {
    db;
    _inited = true;
    version = version;
    capabilities = {
        transactions: true,
        indexes: true,
        persistent: true,
    };
    schema;
    mode;
    primaryKeyOption;
    connectionString;
    _knownCollections = new Set();
    constructor(db, opts = {}) {
        super();
        this.db = db;
        this.schema = opts.schema;
        this.mode = opts.mode ?? "strict";
        this.primaryKeyOption = opts.primaryKey ?? "_id";
        this.connectionString =
            this.db.connectionString ||
                this.db.options?.connectionString;
    }
    async init() {
        if (this.db && !this.db.ended)
            return;
        if (!this.connectionString)
            return;
        try {
            const { Pool } = await import("pg");
            this.db = new Pool({
                connectionString: this.connectionString,
            });
        }
        catch (err) {
            if (isValtheraError(err))
                throw err;
            throw new AdapterInitError(err, {
                schema: this.schema,
                mode: this.mode,
            });
        }
    }
    async close() {
        const end = this.db.end;
        if (typeof end !== "function")
            return;
        try {
            await Promise.resolve(end.call(this.db));
        }
        catch (err) {
            if (isValtheraError(err))
                throw err;
            throw new AdapterCloseError(err, {
                schema: this.schema,
            });
        }
    }
    async query(sql, values = []) {
        try {
            return await this.db.query(sql, values);
        }
        catch (err) {
            if (isValtheraError(err))
                throw err;
            throw new AdapterError(err, {
                sql,
            });
        }
    }
    table(collection) {
        const table = quoteIdentifier(collection);
        return this.schema ? `${quoteIdentifier(this.schema)}.${table}` : table;
    }
    metadataTable(collection) {
        return collection;
    }
    primaryKey(collection) {
        return typeof this.primaryKeyOption === "string"
            ? this.primaryKeyOption
            : (this.primaryKeyOption[collection] ?? "_id");
    }
    async getCollections() {
        const schema = this.schema || "public";
        const result = await this.query(`SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'
             ORDER BY table_name`, [
            schema,
        ]);
        return result.rows.map(row => row.table_name);
    }
    async ensureCollection(collection) {
        const exists = await this.issetCollection(collection);
        if (!exists && this.mode === "strict")
            throw new QueryValidationError(`PostgreSQL table ${this.table(collection)} does not exist`, {
                collection,
                mode: this.mode,
            });
        if (!exists) {
            const primaryKey = this.primaryKey(collection);
            await this.query(`CREATE TABLE ${this.table(collection)} (
                ${quoteIdentifier(primaryKey)} TEXT PRIMARY KEY
            )`);
            this._knownCollections.add(collection);
            return true;
        }
        await migrateLegacyJsonb(this, collection);
        return false;
    }
    async issetCollection(collection) {
        if (this._knownCollections.has(collection))
            return true;
        const schema = this.schema || "public";
        const result = await this.query(`SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'
            ) AS "exists"`, [
            schema,
            this.metadataTable(collection),
        ]);
        const exists = Boolean(result.rows[0]?.exists);
        if (exists) {
            this._knownCollections.add(collection);
        }
        return exists;
    }
    async removeCollection(collection) {
        await this.query(`DROP TABLE IF EXISTS ${this.table(collection)}`);
        this._knownCollections.delete(collection);
        return true;
    }
    async add(config) {
        const { data, collection } = config;
        await this.ensureCollection(collection);
        const primaryKey = this.primaryKey(collection);
        if (primaryKey === "_id") {
            await addId(config, this, true);
        }
        else if (data[primaryKey] === undefined) {
            data[primaryKey] = genId();
        }
        const originalId = data[primaryKey] ?? genId();
        const storageId = typeof originalId !== "string" ? String(originalId) : originalId;
        const fields = serializeData(data, primaryKey);
        await ensureColumns(this, collection, fields);
        const columns = [
            quoteIdentifier(primaryKey),
            ...fields.map(field => sqlColumnForField(field.key)),
        ];
        const values = [
            storageId,
            ...fields.map(field => field.value),
        ];
        const placeholders = values.map((_, index) => `$${index + 1}`);
        await this.query(`INSERT INTO ${this.table(collection)}
			(${columns.join(", ")})
             VALUES (${placeholders.join(", ")})`, values);
        return data;
    }
    async bulkAdd(config) {
        const { collection, datas } = config;
        if (!datas.length)
            return datas;
        await this.ensureCollection(collection);
        const primaryKey = this.primaryKey(collection);
        if (primaryKey === "_id") {
            await addIdBulk(config, this, true);
        }
        else {
            for (const data of datas) {
                if (data[primaryKey] === undefined)
                    data[primaryKey] = genId();
            }
        }
        const serialized = datas.map(data => serializeData(data, primaryKey));
        await ensureColumns(this, collection, serialized.flat());
        const keys = [];
        const seen = new Set();
        for (const fields of serialized) {
            for (const field of fields) {
                if (seen.has(field.key))
                    continue;
                seen.add(field.key);
                keys.push(field.key);
            }
        }
        const columns = [
            quoteIdentifier(primaryKey),
            ...keys.map(sqlColumnForField),
        ];
        const values = [];
        const rows = [];
        for (let i = 0; i < datas.length; i++) {
            const byKey = new Map(serialized[i].map(field => [
                field.key,
                field.value,
            ]));
            const originalId = datas[i][primaryKey] ?? genId();
            const storageId = typeof originalId !== "string" ? String(originalId) : originalId;
            const row = [
                storageId,
                ...keys.map(key => (byKey.has(key) ? byKey.get(key) : null)),
            ];
            const base = values.length;
            rows.push(`(${row.map((_, index) => `$${base + index + 1}`).join(", ")})`);
            values.push(...row);
        }
        await this.query(`INSERT INTO ${this.table(collection)}
			(${columns.join(", ")})
             VALUES ${rows.join(", ")}`, values);
        return datas;
    }
    find(config) {
        return find(this, config);
    }
    async findOne(config) {
        config.dbFindOpts = {
            ...(config.dbFindOpts || {}),
            limit: 1,
        };
        const result = await this.find(config);
        return result.length ? result[0] : null;
    }
    update(config) {
        return update(this, config, false);
    }
    async updateOne(config) {
        const result = await update(this, config, true);
        return result[0] || null;
    }
    remove(config) {
        return remove(this, config, false);
    }
    async removeOne(config) {
        const result = await remove(this, config, true);
        return result[0] || null;
    }
    async beginTransaction(id, collections = []) {
        try {
            await this.query("BEGIN");
        }
        catch (err) {
            throw new TransactionError("Failed to begin transaction", {
                cause: err,
                context: {
                    collections,
                },
            });
        }
        return {
            id,
        };
    }
    async commitTransaction(handle) {
        try {
            await this.query("COMMIT");
        }
        catch (err) {
            throw new TransactionError("Failed to commit transaction", {
                cause: err,
                context: {
                    handle: handle.id,
                },
            });
        }
    }
    async rollbackTransaction(handle) {
        try {
            await this.query("ROLLBACK");
        }
        catch (err) {
            throw new TransactionError("Failed to rollback transaction", {
                cause: err,
                context: {
                    handle: handle.id,
                },
            });
        }
    }
    async createIndex(config) {
        const { collection, index } = config;
        const { fields, opts } = index;
        const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
        const uniqueStr = opts?.unique ? "UNIQUE " : "";
        const fieldsStr = fields.map(f => quoteIdentifier(f)).join(", ");
        await this.query(`CREATE ${uniqueStr}INDEX IF NOT EXISTS ${quoteIdentifier(indexName)} ON ${this.table(collection)} (${fieldsStr})`);
    }
    async removeIndex(config) {
        const { collection, index } = config;
        const { fields, opts } = index;
        const indexName = opts?.name || `idx_${collection}_${fields.join("_")}`;
        await this.query(`DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`);
    }
    async count(config) {
        const { collection } = config;
        await this.ensureCollection(collection);
        const where = await buildWhere(this, collection, config);
        const result = await this.query(`SELECT COUNT(*) as count FROM ${this.table(collection)} ${where.sql}`, where.values);
        return parseInt(result.rows[0]?.count || "0", 10);
    }
}
