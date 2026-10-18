import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { PostgreSQLValthera } from "./actions.js";
export declare function update(pgv: PostgreSQLValthera, query: VQueryT.Update, one: boolean): Promise<DataInternal[]>;
