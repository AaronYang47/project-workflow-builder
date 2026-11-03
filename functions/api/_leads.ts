import { json } from "./_lib";

export const SALES_LEADS_DDL = `
CREATE TABLE IF NOT EXISTS sales_qualification_leads (
  lead_number TEXT PRIMARY KEY,
  pwb_project_id TEXT,
  company_id TEXT,
  company_json TEXT NOT NULL,
  form_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_leads_company ON sales_qualification_leads(company_id);
`;

export async function ensureSalesLeadsSchema(db: D1Database) {
  const statements = SALES_LEADS_DDL.split(";").map((item) => item.trim()).filter(Boolean);
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}

export type StoredLead = {
  lead_number: string;
  pwb_project_id: string | null;
  company_id: string | null;
  company_json: string;
  form_json: string;
  created_at: string;
  updated_at: string;
};

export async function getLead(db: D1Database, leadNumber: string) {
  await ensureSalesLeadsSchema(db);
  return db
    .prepare("SELECT * FROM sales_qualification_leads WHERE lead_number = ?")
    .bind(leadNumber)
    .first<StoredLead>();
}

export async function upsertLead(
  db: D1Database,
  payload: {
    leadNumber: string;
    projectId?: string | null;
    companyId?: string | null;
    companyJson: string;
    formJson: string;
  },
) {
  await ensureSalesLeadsSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO sales_qualification_leads (
        lead_number, pwb_project_id, company_id, company_json, form_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lead_number) DO UPDATE SET
        pwb_project_id = COALESCE(excluded.pwb_project_id, sales_qualification_leads.pwb_project_id),
        company_id = excluded.company_id,
        company_json = excluded.company_json,
        form_json = excluded.form_json,
        updated_at = excluded.updated_at`,
    )
    .bind(
      payload.leadNumber,
      payload.projectId ?? null,
      payload.companyId ?? null,
      payload.companyJson,
      payload.formJson,
      now,
      now,
    )
    .run();
  return getLead(db, payload.leadNumber);
}

export { json };
