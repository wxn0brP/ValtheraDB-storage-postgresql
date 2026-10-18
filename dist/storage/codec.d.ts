import { Data } from "@wxn0brp/db-core/types/data";
import { ColumnInfo, SerializedField } from "./types.js";
export declare function encodeValue(value: any): {
    value: any;
    sqlType: string;
};
export declare function decodeValue(value: any, column?: ColumnInfo): any;
export declare function isEncodedNull(value: any): boolean;
export declare function serializeData(data: Data, primaryKey?: string): SerializedField[];
