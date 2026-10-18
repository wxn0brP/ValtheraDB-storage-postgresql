import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { PostgreSQLValthera } from "./actions.js";
export function createPostgreSQLValthera(pgDB, opts = {}) {
    const adapter = new PostgreSQLValthera(pgDB, opts);
    const db = new ValtheraClass({
        adapter,
    });
    return forgeTypedValthera(db);
}
export const DYNAMIC = {
    async def(connectionString, opts = {}) {
        const { Pool } = await import("pg");
        return new PostgreSQLValthera(new Pool({
            connectionString,
        }), opts);
    },
};
