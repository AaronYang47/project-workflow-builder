export async function onRequestPost(context: {
  request: Request;
  env: { R2_BUCKET?: { put: (key: string, body: any, options?: any) => Promise<any> } };
}) {
  try {
    const formData = await context.request.formData();
    const file = formData.get("file");
    const id = formData.get("id")?.toString() || `r2-${Date.now()}`;
    const category = formData.get("category")?.toString() || "supporting";
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";

    if (!file || typeof file === "string") {
      return Response.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const fileName = (file as File).name;
    const fileSize = (file as File).size;
    const fileType = (file as File).type || "application/octet-stream";

    const key = `${category}/${id}-${fileName}`;
    let r2Url: string | undefined;

    if (context.env.R2_BUCKET) {
      await context.env.R2_BUCKET.put(key, (file as File).stream(), {
        httpMetadata: {
          contentType: fileType,
        },
        customMetadata: {
          id,
          title,
          description,
          category,
          fileName,
        },
      });
      r2Url = `/api/files/${encodeURIComponent(key)}`;
    }

    return Response.json({
      ok: true,
      id,
      key,
      fileName,
      fileSize,
      fileType,
      category,
      title,
      description,
      url: r2Url,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
