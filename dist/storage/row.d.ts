import { Data } from "@wxn0brp/db-core/types/data";
import { ColumnInfo } from "./types.js";
export declare function rowToData(row: Record<string, any>, columns: Map<string, ColumnInfo>): Data;
