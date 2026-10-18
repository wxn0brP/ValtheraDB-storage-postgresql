import { ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { PostgreSQLValthera } from "./actions.js";
import { PostgreSQLValtheraOptions, SupportedPostgreSQL } from "./types.js";
export declare function createPostgreSQLValthera<T extends Record<string, Data> = {}>(pgDB: SupportedPostgreSQL, opts?: PostgreSQLValtheraOptions): ValtheraClass & { [K in keyof T]: import("@wxn0brp/db-core/helpers/collection").Collection<T[K]>; };
export declare const DYNAMIC: {
    def(connectionString: string, opts?: PostgreSQLValtheraOptions): Promise<PostgreSQLValthera>;
};
