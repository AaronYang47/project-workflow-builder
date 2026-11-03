import { fileForbidden, filePrefix, mayAccessFile, requireFileUser } from "../_file-access";

function cleanGeneratedFileName(value: string) {
  return value
    .replace(/^r2-\d+(-[a-z0-9]+)?-/i, "")
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]/i, "");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireFileUser(request, env);
  if (auth.response) return auth.response;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const category = formData.get("category")?.toString() || "supporting";
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const replaceKey = formData.get("replaceKey")?.toString();

    if (!file || typeof file === "string") {
      return Response.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    if (!["legal", "customer", "supporting"].includes(category)) {
      return Response.json({ ok: false, error: "Invalid file category." }, { status: 400 });
    }
    if ((file as File).size > 50 * 1024 * 1024) {
      return Response.json({ ok: false, error: "File must be 50 MB or smaller." }, { status: 413 });
    }
    const fileName = (file as File).name.replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(0, 160) || "upload";
    const fileSize = (file as File).size;
    const fileType = (file as File).type || "application/octet-stream";

    if (!env.R2_BUCKET) {
      return Response.json({ ok: false, error: "Storage unavailable." }, { status: 503 });
    }
    let id = crypto.randomUUID();
    let key = `${filePrefix(auth.user!.id)}${category}/${crypto.randomUUID()}-${fileName}`;
    if (replaceKey) {
      if (!(await mayAccessFile(env.DB, auth.user!.id, replaceKey))) return fileForbidden();
      const existing = await env.R2_BUCKET.get(replaceKey);
      if (!existing) return fileForbidden();
      const existingMeta = existing.customMetadata || {};
      const keyParts = replaceKey.split("/");
      const existingCategory = existingMeta.category || (replaceKey.startsWith("users/") ? keyParts[2] : keyParts[0]);
      const existingName = cleanGeneratedFileName(existingMeta.fileName || keyParts.at(-1) || replaceKey);
      const normalizeName = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
      if (existingCategory !== category || normalizeName(existingName) !== normalizeName(fileName)) {
        return Response.json({ ok: false, error: "The selected Library file no longer matches this filename and category." }, { status: 409 });
      }
      id = existingMeta.id && existingMeta.id !== (existingMeta.fileName || existingName)
        ? existingMeta.id
        : replaceKey;
      key = replaceKey;
    }
    await env.R2_BUCKET.put(key, (file as File).stream(), {
        httpMetadata: {
          contentType: fileType,
        },
        customMetadata: {
          ownerUserId: auth.user!.id,
          id,
          title: title || fileName,
          description,
          category,
          fileName,
        },
    });
    const r2Url = `/api/files/download?key=${encodeURIComponent(key)}`;

    return Response.json({
      ok: true,
      ownerUserId: auth.user!.id,
      id,
      key,
      fileName,
      fileSize,
      fileType,
      category,
      title: title || fileName,
      description,
      url: r2Url,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: "Upload failed." }, { status: 500 });
  }
};
