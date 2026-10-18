import { PostgreSQLValthera } from "../actions.js";
import { ColumnInfo, SerializedField } from "./types.js";
export declare function getColumns(pgv: PostgreSQLValthera, collection: string): Promise<Map<string, ColumnInfo>>;
export declare function invalidateColumnsCache(pgv: PostgreSQLValthera, collection: string): void;
export declare function ensureColumns(pgv: PostgreSQLValthera, collection: string, fields: SerializedField[], columns?: Map<string, ColumnInfo>): Promise<void>;
export declare function migrateLegacyJsonb(pgv: PostgreSQLValthera, collection: string): Promise<void>;
