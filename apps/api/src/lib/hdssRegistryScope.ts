import { and, inArray, or, sql, SQL } from "drizzle-orm";
import villageMapping from "../../../../shared/hdssVillageMapping.json";
import { schema } from "../db";
import { JwtPayload } from "../middleware/auth";
import { buildAreaScopeCondition } from "./areaScope";

export async function buildHdssRegistryScopeCondition(user: JwtPayload): Promise<SQL | undefined> {
  const villageColumn = schema.blbRegistryIndividuals.village_code;
  const directScope = await buildAreaScopeCondition(user, {
    site_id: sql`${villageMapping.siteId}`,
    locality_code: villageColumn,
  });
  if (!directScope) return undefined;

  // Study locality 02 covers these HDSS villages; study household access stays unchanged.
  const mappedLocalityScope = await buildAreaScopeCondition(user, {
    site_id: sql`${villageMapping.siteId}`,
    locality_code: sql`${villageMapping.localityCode}`,
  });
  return or(
    directScope,
    and(inArray(villageColumn, villageMapping.villageCodes), mappedLocalityScope),
  );
}
