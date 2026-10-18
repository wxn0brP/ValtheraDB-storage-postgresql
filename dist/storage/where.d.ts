import { VQueryT } from "@wxn0brp/db-core/types/query";
import { PostgreSQLValthera } from "../actions.js";
export declare function buildWhere(pgv: PostgreSQLValthera, collection: string, config: VQueryT.Find | VQueryT.Update | VQueryT.Remove): Promise<{
    sql: string;
    values: any[];
}>;
