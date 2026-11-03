import { fileForbidden, mayAccessFile, requireFileUser } from "../_file-access";

function cleanGeneratedFileName(value: string) {
  return value
    .replace(/^r2-\d+(-[a-z0-9]+)?-/i, "")
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]/i, "");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireFileUser(request, env);
  if (auth.response) return auth.response;
  if (!env.R2_BUCKET) return new Response("Storage unavailable.", { status: 503 });

  const key = new URL(request.url).searchParams.get("key");
  if (!key) return new Response("Key is required.", { status: 400 });
  if (!(await mayAccessFile(env.DB, auth.user!.id, key))) return fileForbidden();

  try {
    const object = await env.R2_BUCKET.get(key);
    if (!object) return fileForbidden();
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    const fileName = cleanGeneratedFileName(object.customMetadata?.fileName || key.split("/").at(-1) || "download");
    headers.set("content-disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    return new Response(object.body, { headers });
  } catch {
    return new Response("Error retrieving file.", { status: 500 });
  }
};
