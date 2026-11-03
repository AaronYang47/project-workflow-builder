import { json, requireUser } from "./_lib";

export const filePrefix = (userId: string) => `users/${userId}/`;

export const requireFileUser = async (request: Request, env: Env) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  const expectedUser = request.headers.get("x-workflow-account");
  if (auth.user && expectedUser && expectedUser !== auth.user.id) {
    return { user: null, response: json({ error: "Your account changed. Refresh and try again." }, 409) };
  }
  return auth;
};

export const isLegacyFileOwner = async (db: D1Database, userId: string) => {
  // Migration pins the historical owner once. Deleting that account must never
  // transfer its unscoped files to whichever account happens to be oldest next.
  const owner = await db.prepare("SELECT user_id FROM legacy_file_owner WHERE singleton = 1")
    .first<{ user_id: string }>();
  return owner?.user_id === userId;
};

export const mayAccessFile = async (db: D1Database, userId: string, key: string) => {
  if (key.startsWith(filePrefix(userId))) return true;
  if (key.startsWith("users/")) return false;
  return isLegacyFileOwner(db, userId);
};

export const fileForbidden = () => json({ error: "File not found." }, 404);

