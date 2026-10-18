import { QueryValidationError } from "@wxn0brp/db-core/errors";
import { serialize } from "v8";
import { isEncodedNull, serializeData } from "./codec.js";
import { columnForField, quoteIdentifier, sqlColumnForField, } from "./identifiers.js";
const columnsCache = new Map();
const CACHE_TTL = 5000; // 5 seconds
const SQL_TYPE_UDT_NAMES = {
    TEXT: "text",
    "DOUBLE PRECISION": "float8",
    BOOLEAN: "bool",
    TIMESTAMPTZ: "timestamptz",
    BYTEA: "bytea",
};
function udtNameForSqlType(sqlType) {
    return SQL_TYPE_UDT_NAMES[sqlType] ?? sqlType.toLowerCase();
}
export async function getColumns(pgv, collection) {
    const schema = pgv.schema || "public";
    const cacheKey = `${schema}.${pgv.metadataTable(collection)}`;
    const now = Date.now();
    const cached = columnsCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL) {
        return cached.columns;
    }
    const result = await pgv.query(`SELECT column_name, data_type, udt_name
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`, [
        schema,
        pgv.metadataTable(collection),
    ]);
    const columns = new Map();
    for (const row of result.rows) {
        columns.set(row.column_name, {
            name: row.column_name,
            dataType: row.data_type,
            udtName: row.udt_name,
        });
    }
    columnsCache.set(cacheKey, {
        columns,
        timestamp: now,
    });
    return columns;
}
export function invalidateColumnsCache(pgv, collection) {
    const schema = pgv.schema || "public";
    const cacheKey = `${schema}.${pgv.metadataTable(collection)}`;
    columnsCache.delete(cacheKey);
}
function compatibleType(existing, sqlType) {
    if (!existing)
        return true;
    return existing.udtName === udtNameForSqlType(sqlType);
}
export async function ensureColumns(pgv, collection, fields, columns) {
    columns ??= await getColumns(pgv, collection);
    for (const field of fields) {
        const column = columnForField(field.key);
        const existing = columns.get(column);
        if (field.value === null && existing)
            continue;
        if (existing && isEncodedNull(field.value)) {
            field.value = null;
            continue;
        }
        if (!existing && pgv.mode === "strict")
            throw new QueryValidationError(`PostgreSQL column ${sqlColumnForField(field.key)} for field "${field.key}" does not exist in table ${pgv.table(collection)}`, {
                collection,
                column,
                field: field.key,
                mode: pgv.mode,
            });
        if (existing && !compatibleType(existing, field.sqlType)) {
            if (existing.udtName === "bytea") {
                field.value = serialize(field.value);
                field.sqlType = "BYTEA";
                continue;
            }
            const nonNull = await pgv.query(`SELECT COUNT(*)::text AS count
                 FROM ${pgv.table(collection)}
					WHERE ${sqlColumnForField(field.key)} IS NOT NULL`);
            if (Number(nonNull.rows[0]?.count || 0) === 0) {
                await pgv.query(`ALTER TABLE ${pgv.table(collection)}
					 ALTER COLUMN ${sqlColumnForField(field.key)} TYPE ${field.sqlType}`);
                columns.set(column, {
                    name: column,
                    dataType: field.sqlType,
                    udtName: udtNameForSqlType(field.sqlType),
                });
                invalidateColumnsCache(pgv, collection);
                continue;
            }
            const primaryKey = pgv.primaryKey(collection);
            const existingRows = await pgv.query(`SELECT ${quoteIdentifier(primaryKey)} AS __pk, ${sqlColumnForField(field.key)} AS __val
                 FROM ${pgv.table(collection)}
                 WHERE ${sqlColumnForField(field.key)} IS NOT NULL`);
            await pgv.query(`ALTER TABLE ${pgv.table(collection)}
				 ALTER COLUMN ${sqlColumnForField(field.key)} TYPE BYTEA
                 USING NULL`);
            for (const row of existingRows.rows) {
                const serialized = serialize(row.__val);
                await pgv.query(`UPDATE ${pgv.table(collection)}
					 SET ${sqlColumnForField(field.key)} = $1
                     WHERE ${quoteIdentifier(primaryKey)} = $2`, [
                    serialized,
                    row.__pk,
                ]);
            }
            columns.set(column, {
                name: column,
                dataType: "BYTEA",
                udtName: "bytea",
            });
            invalidateColumnsCache(pgv, collection);
            field.value = serialize(field.value);
            field.sqlType = "BYTEA";
        }
        if (!existing) {
            await pgv.query(`ALTER TABLE ${pgv.table(collection)}
				 ADD COLUMN IF NOT EXISTS ${sqlColumnForField(field.key)} ${field.sqlType}`);
            columns.set(column, {
                name: column,
                dataType: field.sqlType,
                udtName: udtNameForSqlType(field.sqlType),
            });
            invalidateColumnsCache(pgv, collection);
        }
    }
}
export async function migrateLegacyJsonb(pgv, collection) {
    const columns = await getColumns(pgv, collection);
    if (!columns.has("data") || columns.get("data")?.udtName !== "jsonb")
        return;
    if (pgv.mode === "strict")
        throw new QueryValidationError(`PostgreSQL table ${pgv.table(collection)} uses legacy data JSONB storage; run in lazy mode to migrate it`, {
            collection,
            mode: pgv.mode,
            legacy: "jsonb",
        });
    const primaryKey = pgv.primaryKey(collection);
    const result = await pgv.query(`SELECT ${quoteIdentifier(primaryKey)} AS __pk, data FROM ${pgv.table(collection)} ORDER BY ctid`);
    for (const row of result.rows) {
        const data = {
            ...row.data,
            [primaryKey]: row.data?.[primaryKey] ?? row.__pk,
        };
        const fields = serializeData(data, primaryKey);
        await ensureColumns(pgv, collection, fields);
        if (!fields.length)
            continue;
        const assignments = fields.map((field, index) => `${sqlColumnForField(field.key)} = $${index + 1}`);
        const values = [
            ...fields.map(field => field.value),
            row.__pk,
        ];
        await pgv.query(`UPDATE ${pgv.table(collection)}
             SET ${assignments.join(", ")}
             WHERE ${quoteIdentifier(primaryKey)} = $${values.length}`, values);
    }
    await pgv.query(`ALTER TABLE ${pgv.table(collection)}
         DROP COLUMN data`);
}
