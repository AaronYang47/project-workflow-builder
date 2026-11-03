import { fileForbidden, filePrefix, isLegacyFileOwner, mayAccessFile, requireFileUser } from "../_file-access";

function cleanGeneratedFileName(value: string) {
  return value
    .replace(/^r2-\d+(-[a-z0-9]+)?-/i, "")
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]/i, "");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireFileUser(request, env);
  if (auth.response) return auth.response;
  if (!env.R2_BUCKET) return Response.json({ ok: true, ownerUserId: auth.user!.id, files: [] }, { headers: { "cache-control": "private, no-store" } });

  try {
    const own = await env.R2_BUCKET.list({ prefix: filePrefix(auth.user!.id), limit: 200, include: ["customMetadata", "httpMetadata"] });
    const legacy = await isLegacyFileOwner(env.DB, auth.user!.id)
      ? await env.R2_BUCKET.list({ limit: 200, include: ["customMetadata", "httpMetadata"] })
      : null;
    const objects = [
      ...own.objects,
      ...(legacy?.objects.filter((obj) => !obj.key.startsWith("users/")) || []),
    ];
    const files = objects.map((obj) => {
      const meta = obj.customMetadata || {};
      const keyParts = obj.key.split("/");
      const category = meta.category || (obj.key.startsWith("users/") ? keyParts[2] : keyParts[0]) || "supporting";
      const rawFileName = meta.fileName || keyParts.at(-1) || obj.key;
      const fileName = cleanGeneratedFileName(rawFileName);
      const title = cleanGeneratedFileName(meta.title || fileName);
      const id = meta.id && meta.id !== rawFileName ? meta.id : obj.key;
      return {
        id,
        key: obj.key,
        fileName,
        fileSize: obj.size,
        fileType: obj.httpMetadata?.contentType || "application/octet-stream",
        category,
        title,
        description: meta.description || "",
        uploadedAt: new Date(obj.uploaded).toISOString(),
        url: `/api/files/download?key=${encodeURIComponent(obj.key)}`,
      };
    });
    files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return Response.json({ ok: true, ownerUserId: auth.user!.id, files }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Failed to list files." }, { status: 500 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireFileUser(request, env);
  if (auth.response) return auth.response;
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return Response.json({ ok: false, error: "Key is required." }, { status: 400 });
  if (!(await mayAccessFile(env.DB, auth.user!.id, key))) return fileForbidden();
  if (!env.R2_BUCKET) return Response.json({ ok: false, error: "Storage unavailable." }, { status: 503 });
  try {
    await env.R2_BUCKET.delete(key);
    return Response.json({ ok: true, deletedKey: key }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Failed to delete file." }, { status: 500 });
  }
};
