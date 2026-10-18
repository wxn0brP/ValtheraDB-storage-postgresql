import { Data } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { PostgreSQLValthera } from "./actions.js";
export declare function find(pgv: PostgreSQLValthera, config: VQueryT.Find): Promise<Data[]>;
