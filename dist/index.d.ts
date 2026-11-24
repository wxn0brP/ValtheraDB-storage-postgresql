import { ValtheraClass } from "@wxn0brp/db-core";
import { Data } from "@wxn0brp/db-core/types/data";
import { PostgreSQLValthera } from "./adapter.js";
import { PostgreSQLValtheraOptions, SupportedPostgreSQL } from "./types.js";
export declare function createPostgreSQLValthera<T extends Record<string, Data> = {}>(pgDB: SupportedPostgreSQL, opts?: PostgreSQLValtheraOptions): import("@wxn0brp/db-core/types/typed").TypedValthera<T, ValtheraClass>;
export declare const DYNAMIC: {
    def(connectionString: string, opts?: PostgreSQLValtheraOptions): Promise<PostgreSQLValthera>;
};
