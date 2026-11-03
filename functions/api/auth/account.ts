import { filePrefix, isLegacyFileOwner } from "../_file-access";
import { falconDb } from "../_falcon-customers";
import { hashPassword, json, readJson, requireUser, secureEqual, sessionCookie } from "../_lib";
import { ensureSalesLeadsSchema } from "../_leads";
import { checkAuthRateLimit } from "./_rate-limit";

type DeleteAccountBody = { password?: string; confirmation?: string };

async function deleteFiles(bucket: R2Bucket, userId: string, includeLegacy: boolean) {
  const deletePage = async (prefix?: string) => {
    let cursor: string | undefined;
    const keys: string[] = [];
    do {
      const page = await bucket.list({ prefix, limit: 1000, cursor });
      keys.push(...page.objects.map((object) => object.key)
        .filter((key) => prefix || !key.startsWith("users/")));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    for (let index = 0; index < keys.length; index += 1000) {
      await bucket.delete(keys.slice(index, index + 1000));
    }
  };

  await deletePage(filePrefix(userId));
  if (includeLegacy) await deletePage();
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;

  const body = await readJson<DeleteAccountBody>(request);
  if (body?.confirmation !== "DELETE" || !body.password) {
    return json({ error: "Enter your password and type DELETE to confirm." }, 400);
  }

  const limited = await checkAuthRateLimit(request, env, "login", auth.user!.email);
  if (limited) return limited;

  const credentials = await env.DB.prepare(
    "SELECT password_hash, password_salt FROM users WHERE id = ?",
  ).bind(auth.user!.id).first<{ password_hash: string; password_salt: string }>();
  if (!credentials) return json({ error: "Account not found." }, 404);
  const candidate = await hashPassword(body.password, credentials.password_salt);
  if (!secureEqual(candidate.hash, credentials.password_hash)) {
    return json({ error: "Incorrect password." }, 403);
  }

  if (!env.R2_BUCKET) return json({ error: "File storage is unavailable. Please try again later." }, 503);

  try {
    const leadDb = falconDb(env);
    if (!leadDb) return json({ error: "Account data storage is unavailable. Please try again later." }, 503);
    const projects = await env.DB.prepare("SELECT id FROM projects WHERE user_id = ?")
      .bind(auth.user!.id).all<{ id: string }>();
    const includeLegacy = await isLegacyFileOwner(env.DB, auth.user!.id);
    await ensureSalesLeadsSchema(leadDb);
    await deleteFiles(env.R2_BUCKET, auth.user!.id, includeLegacy);
    const projectIds = (projects.results || []).map((project) => project.id);
    for (let index = 0; index < projectIds.length; index += 100) {
      const ids = projectIds.slice(index, index + 100);
      await leadDb.prepare(
        `DELETE FROM sales_qualification_leads WHERE pwb_project_id IN (${ids.map(() => "?").join(",")})`,
      ).bind(...ids).run();
    }
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(auth.user!.id).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  } catch {
    return json({ error: "Account deletion could not be completed. Please try again or contact support." }, 500);
  }
};
