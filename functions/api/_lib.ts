const encoder = new TextEncoder();

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const randomToken = (bytes = 32) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sha256 = async (value: string) =>
  toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

export const PROJECT_VERSION_RETENTION = 50;

export type ProjectVersionChangeKind =
  | "baseline"
  | "created"
  | "updated"
  | "restored"
  | "approval";

export type ProjectAuditAction =
  | "project.created"
  | "project.updated"
  | "project.restored"
  | "project.deleted"
  | "approval.approved"
  | "approval.rejected";

export type UserRole =
  | "Coordinator"
  | "Project Manager"
  | "Estimator"
  | "Engineering"
  | "Finance"
  | "CRO"
  | "CEO"
  | "Client";

type ProjectSnapshot = {
  id: string;
  projectId: string;
  ownerUserId: string;
  name: string;
  projectNumber: string;
  workflowJson: string;
  contentHash: string;
  changeKind: ProjectVersionChangeKind;
  restoredFromVersionId?: string | null;
  actorUserId: string;
  createdAt: string;
};

type ProjectAuditEntry = {
  id: string;
  projectId: string;
  ownerUserId: string;
  actorUserId: string;
  actorRole: UserRole;
  action: ProjectAuditAction;
  versionId?: string | null;
  restoredFromVersionId?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

// Hash the exact persisted strings, including metadata that is restored with
// the workflow. The array encoding avoids ambiguous delimiter combinations.
export const projectSnapshotHash = (
  name: string,
  projectNumber: string,
  workflowJson: string,
) => sha256(JSON.stringify([name, projectNumber, workflowJson]));

export const appendProjectVersionStatement = (
  db: D1Database,
  snapshot: ProjectSnapshot,
) => db.prepare(
  `INSERT INTO project_versions (
    id, project_id, owner_user_id, version_number, name, project_number,
    workflow_json, content_hash, change_kind, restored_from_version_id,
    created_by_user_id, created_at
  ) VALUES (
    ?, ?, ?,
    (SELECT COALESCE(MAX(version_number), 0) + 1 FROM project_versions WHERE project_id = ?),
    ?, ?, ?, ?, ?, ?, ?, ?
  )`,
).bind(
  snapshot.id,
  snapshot.projectId,
  snapshot.ownerUserId,
  snapshot.projectId,
  snapshot.name,
  snapshot.projectNumber,
  snapshot.workflowJson,
  snapshot.contentHash,
  snapshot.changeKind,
  snapshot.restoredFromVersionId ?? null,
  snapshot.actorUserId,
  snapshot.createdAt,
);

// Projects created before migration 0002 receive one recoverable copy of their
// pre-update state the first time they are saved after the migration.
export const appendBaselineIfMissingStatement = (
  db: D1Database,
  snapshot: Omit<ProjectSnapshot, "changeKind">,
) => db.prepare(
  `INSERT INTO project_versions (
    id, project_id, owner_user_id, version_number, name, project_number,
    workflow_json, content_hash, change_kind, restored_from_version_id,
    created_by_user_id, created_at
  )
  SELECT ?, ?, ?, 1, ?, ?, ?, ?, 'baseline', NULL, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM project_versions WHERE project_id = ?
  )`,
).bind(
  snapshot.id,
  snapshot.projectId,
  snapshot.ownerUserId,
  snapshot.name,
  snapshot.projectNumber,
  snapshot.workflowJson,
  snapshot.contentHash,
  snapshot.actorUserId,
  snapshot.createdAt,
  snapshot.projectId,
);

export const appendProjectAuditStatement = (
  db: D1Database,
  entry: ProjectAuditEntry,
) => db.prepare(
  `INSERT INTO project_audit_log (
    id, project_id, owner_user_id, actor_user_id, actor_role, action,
    version_id, restored_from_version_id, details_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
).bind(
  entry.id,
  entry.projectId,
  entry.ownerUserId,
  entry.actorUserId,
  entry.actorRole,
  entry.action,
  entry.versionId ?? null,
  entry.restoredFromVersionId ?? null,
  JSON.stringify(entry.details),
  entry.createdAt,
);

export const trimProjectVersionsStatement = (
  db: D1Database,
  projectId: string,
) => db.prepare(
  `DELETE FROM project_versions
  WHERE project_id = ?
    AND id NOT IN (
      SELECT id
      FROM project_versions
      WHERE project_id = ?
      ORDER BY version_number DESC
      LIMIT ?
    )`,
).bind(projectId, projectId, PROJECT_VERSION_RETENTION);

export const hashPassword = async (password: string, salt = randomToken(16)) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    // Workers Web Crypto currently supports PBKDF2 up to 100,000 rounds.
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  return { hash: toHex(hash), salt };
};

export const secureEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

export const sessionCookie = (token: string, maxAge = 60 * 60 * 24 * 30) =>
  `pwb_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export const createSession = async (
  db: D1Database,
  userId: string,
  secret = "",
) => {
  const rawToken = randomToken();
  // When a SESSION_SECRET is configured we bind it into the stored hash so
  // tokens leaked from the DB alone can't be replayed.
  const token = secret ? `${rawToken}.${secret}` : rawToken;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  await db
    .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, await sha256(token), expires.toISOString(), now.toISOString())
    .run();
  // Return only the random half to the client; secret never leaves the server.
  return rawToken;
};

export const currentUser = async (
  request: Request,
  db: D1Database,
  secret = "",
) => {
  const token = request.headers.get("cookie")?.match(/(?:^|; )pwb_session=([^;]+)/)?.[1];
  if (!token) return null;
  const hashed = await sha256(secret ? `${token}.${secret}` : token);
  return db
    .prepare(
      "SELECT users.id, users.email, users.name, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
    )
    .bind(hashed, new Date().toISOString())
    .first<{ id: string; email: string; name: string; role: UserRole }>();
};

export const requireUser = async (
  request: Request,
  db: D1Database,
  secret = "",
) => {
  const user = await currentUser(request, db, secret);
  return user
    ? { user, response: null }
    : { user: null, response: json({ error: "Please sign in." }, 401) };
};

export const readJson = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};
