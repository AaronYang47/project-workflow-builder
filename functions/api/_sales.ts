import {
  appendBaselineIfMissingStatement,
  appendProjectAuditStatement,
  appendProjectVersionStatement,
  currentUser,
  json,
  projectSnapshotHash,
  projectTooLarge,
  trimProjectVersionsStatement,
} from "./_lib";

/**
 * Sales intake site: Sales accounts may use only /api/sales/* (and sign-in).
 * They see the project names of the account whose access code they entered,
 * and change only the Job number and Qualification Form of those projects.
 */

type SignedInUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

const encoder = new TextEncoder();

const sha256 = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** No 0/O, 1/I/L: codes are read out loud and typed on phones. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const normalizeAccessCode = (value: unknown) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export const newAccessCode = () => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

export const hashAccessCode = (code: string, secret = "") =>
  sha256(`sales-code|${secret}|${normalizeAccessCode(code)}`);

export type SalesAccount = {
  userId: string;
  /** The team account whose projects this Sales account works on; null until a valid code. */
  ownerUserId: string | null;
  ownerName: string | null;
};

/** The Sales record of this user, or null for a team account. */
export const salesAccountOf = async (db: D1Database, userId: string) => {
  const row = await db
    .prepare(
      `SELECT sales_accounts.user_id, codes.owner_user_id, owners.name AS owner_name
       FROM sales_accounts
       LEFT JOIN sales_access_codes AS codes
         ON codes.id = sales_accounts.access_code_id AND codes.revoked_at IS NULL
       LEFT JOIN users AS owners ON owners.id = codes.owner_user_id
       WHERE sales_accounts.user_id = ?`,
    )
    .bind(userId)
    .first<{ user_id: string; owner_user_id: string | null; owner_name: string | null }>();
  if (!row) return null;
  return {
    userId: row.user_id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
  } satisfies SalesAccount;
};

export const isSalesUser = async (db: D1Database, userId: string) =>
  Boolean(
    await db.prepare("SELECT 1 AS yes FROM sales_accounts WHERE user_id = ?").bind(userId).first(),
  );

/** A signed-in Sales account. `linked` also requires a valid (not revoked) access code. */
export const requireSales = async (request: Request, env: Env, { linked = true } = {}) => {
  const user = await currentUser(request, env.DB, env.SESSION_SECRET);
  if (!user) return { response: json({ error: "Please sign in." }, 401) } as const;
  const sales = await salesAccountOf(env.DB, user.id);
  if (!sales)
    return {
      response: json(
        { error: "This is a team account. Sign in with a Sales account.", code: "NOT_SALES" },
        403,
      ),
    } as const;
  if (linked && !sales.ownerUserId)
    return {
      response: json(
        { error: "Enter an access code to see projects.", code: "NEEDS_ACCESS_CODE" },
        403,
      ),
    } as const;
  return { user, sales: sales as SalesAccount & { ownerUserId: string }, response: null } as const;
};

/** A signed-in team account (not a Sales account). */
export const requireTeam = async (request: Request, env: Env) => {
  const user = await currentUser(request, env.DB, env.SESSION_SECRET);
  if (!user) return { response: json({ error: "Please sign in." }, 401) } as const;
  if (await isSalesUser(env.DB, user.id))
    return { response: json({ error: "Not available to Sales accounts." }, 403) } as const;
  return { user, response: null } as const;
};

export type StoredProject = {
  id: string;
  name: string;
  project_number: string;
  workflow_json: string;
  updated_at: string;
};

/**
 * Saves a project change made through the Sales site, with the same version
 * history and audit entry as a save from the app.
 */
export const saveProjectFromSales = async (
  env: Env,
  {
    existing,
    ownerUserId,
    actor,
    name,
    projectNumber,
    workflowJson,
    details,
  }: {
    existing: StoredProject | null;
    ownerUserId: string;
    actor: SignedInUser;
    name: string;
    projectNumber: string;
    workflowJson: string;
    details: Record<string, unknown>;
  },
) => {
  const tooLarge = projectTooLarge(name, projectNumber, workflowJson);
  if (tooLarge) return { response: tooLarge } as const;
  const now = new Date().toISOString();
  const id = existing?.id ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const contentHash = await projectSnapshotHash(name, projectNumber, workflowJson);
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(
      env.DB.prepare(
        "UPDATE projects SET name = ?, project_number = ?, workflow_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      ).bind(name, projectNumber, workflowJson, now, id, ownerUserId),
      appendBaselineIfMissingStatement(env.DB, {
        id: crypto.randomUUID(),
        projectId: id,
        ownerUserId,
        name: existing.name,
        projectNumber: existing.project_number,
        workflowJson: existing.workflow_json,
        contentHash: await projectSnapshotHash(
          existing.name,
          existing.project_number,
          existing.workflow_json,
        ),
        actorUserId: actor.id,
        createdAt: now,
      }),
    );
  } else {
    statements.push(
      env.DB.prepare(
        "INSERT INTO projects (id, user_id, name, project_number, workflow_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, ownerUserId, name, projectNumber, workflowJson, now, now),
    );
  }
  statements.push(
    appendProjectVersionStatement(env.DB, {
      id: versionId,
      projectId: id,
      ownerUserId,
      name,
      projectNumber,
      workflowJson,
      contentHash,
      changeKind: existing ? "updated" : "created",
      actorUserId: actor.id,
      createdAt: now,
    }),
    appendProjectAuditStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId: id,
      ownerUserId,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: existing ? "project.updated" : "project.created",
      versionId,
      details: { source: "sales-intake", snapshotHash: contentHash, ...details },
      createdAt: now,
    }),
    trimProjectVersionsStatement(env.DB, id),
  );
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes)
    return {
      response: json({ error: "This project is no longer available." }, 404),
    } as const;
  return { id, updatedAt: now, response: null } as const;
};
