import { sql, SQL } from "drizzle-orm";
import villageMapping from "../../../../shared/hdssVillageMapping.json";
import { schema } from "../db";
import { JwtPayload } from "../middleware/auth";
import { buildAreaScopeCondition } from "./areaScope";

export async function buildHdssRegistryScopeCondition(user: JwtPayload): Promise<SQL | undefined> {
  const villageColumn = schema.blbRegistryIndividuals.village_code;
  return buildAreaScopeCondition(user, {
    site_id: sql`${villageMapping.siteId}`,
    locality_code: villageColumn,
  });
}
