import { updateObj } from "@wxn0brp/db-core/utils/process";
import { find } from "./find.js";
import { encodeValue, serializeData } from "./storage/codec.js";
import { quoteIdentifier, sqlColumnForField } from "./storage/identifiers.js";
import { ensureColumns, getColumns } from "./storage/schema.js";
import { POSTGRES_STORAGE_ID } from "./types.js";
const SIMPLE_OPS = new Set([
    "$set",
    "$inc",
    "$dec",
]);
function tryBuildSimpleUpdate(updater, primaryKey) {
    const $fields = {};
    const flatFields = {};
    for (const k of Object.keys(updater)) {
        if (k.startsWith("$")) {
            $fields[k.toLowerCase()] = updater[k];
        }
        else {
            flatFields[k] = updater[k];
        }
    }
    if (Object.keys($fields).some(k => !SIMPLE_OPS.has(k)))
        return null;
    const setClauses = [];
    const values = [];
    const columns = [];
    if ("$set" in $fields) {
        for (const [field, value] of Object.entries($fields["$set"])) {
            if (field === primaryKey)
                continue;
            columns.push(field);
            const encoded = encodeValue(value);
            values.push(encoded.value);
            setClauses.push(`${sqlColumnForField(field)} = $${values.length}`);
        }
    }
    if ("$inc" in $fields) {
        for (const [field, value] of Object.entries($fields["$inc"])) {
            if (field === primaryKey)
                continue;
            if (typeof value !== "number")
                return null;
            columns.push(field);
            const f = sqlColumnForField(field);
            values.push(value, value);
            setClauses.push(`${f} = CASE WHEN ${f} IS NULL THEN $${values.length - 1} WHEN pg_typeof(${f})::text IN ('integer','bigint','numeric','double precision','real') THEN ${f} + $${values.length} ELSE ${f} END`);
        }
    }
    if ("$dec" in $fields) {
        for (const [field, value] of Object.entries($fields["$dec"])) {
            if (field === primaryKey)
                continue;
            if (typeof value !== "number")
                return null;
            columns.push(field);
            const f = sqlColumnForField(field);
            values.push(value, value);
            setClauses.push(`${f} = CASE WHEN ${f} IS NULL THEN (-1 * $${values.length - 1}) WHEN pg_typeof(${f})::text IN ('integer','bigint','numeric','double precision','real') THEN ${f} - $${values.length} ELSE ${f} END`);
        }
    }
    for (const [field, value] of Object.entries(flatFields)) {
        if (field === primaryKey)
            continue;
        if (typeof value === "object" && value !== null)
            return null;
        columns.push(field);
        const encoded = encodeValue(value);
        values.push(encoded.value);
        setClauses.push(`${sqlColumnForField(field)} = $${values.length}`);
    }
    if (setClauses.length === 0)
        return null;
    return {
        set: setClauses.join(", "),
        values,
        columns,
    };
}
export async function update(pgv, query, one) {
    const { collection, updater } = query;
    const primaryKey = pgv.primaryKey(collection);
    if (!one && typeof updater !== "function") {
        const simpleUpdate = tryBuildSimpleUpdate(updater, primaryKey);
        if (simpleUpdate) {
            await ensureColumns(pgv, collection, simpleUpdate.columns.map(c => ({
                key: c,
                value: null,
                sqlType: "TEXT",
            })));
            const matched = await find(pgv, query);
            if (matched.length === 0)
                return [];
            const pks = matched.map(doc => doc[primaryKey]);
            const setValues = simpleUpdate.values;
            const whereClause = `${quoteIdentifier(primaryKey)} = ANY($${setValues.length + 1}::text[])`;
            const allValues = [
                ...setValues,
                pks,
            ];
            const sql = `UPDATE ${pgv.table(collection)} SET ${simpleUpdate.set} WHERE ${whereClause}`;
            await pgv.query(sql, allValues);
            return matched.map(row => {
                const pk = row[primaryKey];
                const newData = updateObj(query, row);
                if (newData[primaryKey] !== pk) {
                    newData[primaryKey] = pk;
                }
                return newData;
            });
        }
    }
    const matched = await find(pgv, {
        ...query,
        dbFindOpts: {
            ...(query.dbFindOpts || {}),
            limit: one ? 1 : undefined,
        },
    });
    if (!matched.length)
        return [];
    const results = [];
    const columns = await getColumns(pgv, collection);
    for (const target of matched) {
        const storageId = target[POSTGRES_STORAGE_ID] ?? target[primaryKey];
        const newData = updateObj(query, target);
        if (target[primaryKey] !== undefined)
            newData[primaryKey] = target[primaryKey];
        else if (newData[primaryKey] !== undefined)
            delete newData[primaryKey];
        const fields = serializeData(newData, primaryKey);
        await ensureColumns(pgv, collection, fields, columns);
        const assignments = [];
        const values = [];
        for (const field of fields) {
            values.push(field.value);
            assignments.push(`${sqlColumnForField(field.key)} = $${values.length}`);
        }
        if (!assignments.length) {
            results.push(newData);
            continue;
        }
        values.push(storageId);
        await pgv.query(`UPDATE ${pgv.table(collection)}
			 SET ${assignments.join(", ")}
			 WHERE ${quoteIdentifier(primaryKey)} = $${values.length}`, values);
        results.push(newData);
    }
    return results;
}
