import { decodeValue } from "./codec.js";
export function rowToData(row, columns) {
    const data = {};
    for (const column of columns.keys()) {
        if (row[column] !== null && row[column] !== undefined)
            data[column] = decodeValue(row[column], columns.get(column));
    }
    return data;
}
