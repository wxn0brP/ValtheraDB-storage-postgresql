import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { PostgreSQLValthera } from "./actions.js";
export declare function remove(pgv: PostgreSQLValthera, query: VQueryT.Remove, one: boolean): Promise<DataInternal[]>;
