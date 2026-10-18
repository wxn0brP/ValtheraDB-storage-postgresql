import { find } from "./find.js";
import { quoteIdentifier } from "./storage/identifiers.js";
import { POSTGRES_STORAGE_ID } from "./types.js";
const BATCH_SIZE = +process.env.VALTHERA_POSTGRES_BATCH_SIZE || 500;
export async function remove(pgv, query, one) {
    const { collection } = query;
    const toDelete = await find(pgv, {
        ...query,
        dbFindOpts: {
            ...(query.dbFindOpts || {}),
            limit: one ? 1 : undefined,
        },
    });
    if (!toDelete.length)
        return [];
    const primaryKey = pgv.primaryKey(collection);
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE);
        await pgv.query(`DELETE FROM ${pgv.table(collection)} WHERE ${quoteIdentifier(primaryKey)} = ANY($1::text[])`, [
            batch.map(doc => doc[POSTGRES_STORAGE_ID] ?? doc[primaryKey]),
        ]);
    }
    return toDelete;
}
