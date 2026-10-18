import { QueryValidationError } from "@wxn0brp/db-core/errors";
export function quoteIdentifier(identifier) {
    if (!identifier)
        throw new QueryValidationError("PostgreSQL identifier cannot be empty", {
            identifier,
        });
    return `"${identifier.replace(/"/g, `""`)}"`;
}
export function columnForField(field) {
    return field;
}
export function sqlColumnForField(field) {
    return quoteIdentifier(columnForField(field));
}
