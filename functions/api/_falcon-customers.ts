import { json, requireUser } from "./_lib";

function parseCompany(row: { record_json?: string } | null) {
  if (!row?.record_json) return null;
  try {
    return JSON.parse(row.record_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function falconDb(env: Env) {
  return env.FALCON_DB ?? null;
}

export async function searchFalconMaster(db: D1Database, query: string, limit = 12) {
  const like = `%${query.replace(/[%_]/g, "").trim()}%`;
  if (like.length < 3) return [];
  const { results } = await db
    .prepare(
      `SELECT record_json FROM company_master
       WHERE organization_name LIKE ? COLLATE NOCASE
          OR IFNULL(legal_name, '') LIKE ? COLLATE NOCASE
          OR IFNULL(trade_name, '') LIKE ? COLLATE NOCASE
          OR IFNULL(domain, '') LIKE ? COLLATE NOCASE
          OR IFNULL(aliases, '') LIKE ? COLLATE NOCASE
          OR IFNULL(acronyms, '') LIKE ? COLLATE NOCASE
       ORDER BY customer_quality_score DESC
       LIMIT ?`,
    )
    .bind(like, like, like, like, like, like, limit)
    .all<{ record_json: string }>();
  return (results || []).map(parseCompany).filter(Boolean);
}

export async function getFalconMasterCompany(db: D1Database, idOrName: string) {
  const exact = await db
    .prepare("SELECT record_json FROM company_master WHERE company_id = ?")
    .bind(idOrName)
    .first<{ record_json: string }>();
  if (exact) return parseCompany(exact);

  const byName = await db
    .prepare(
      `SELECT record_json FROM company_master
       WHERE organization_name = ? COLLATE NOCASE
          OR legal_name = ? COLLATE NOCASE
          OR trade_name = ? COLLATE NOCASE
          OR domain = ? COLLATE NOCASE
       LIMIT 1`,
    )
    .bind(idOrName, idOrName, idOrName, idOrName.toLowerCase())
    .first<{ record_json: string }>();
  return parseCompany(byName);
}

export { json, requireUser };
