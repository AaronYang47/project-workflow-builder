export async function onRequestGet(context: {
  request: Request;
  env: {
    R2_BUCKET?: {
      list: (options?: any) => Promise<{
        objects: Array<{
          key: string;
          size: number;
          uploaded: string | Date;
          httpMetadata?: { contentType?: string };
          customMetadata?: {
            title?: string;
            description?: string;
            category?: string;
            fileName?: string;
            id?: string;
          };
        }>;
      }>;
    };
  };
}) {
  try {
    if (!context.env.R2_BUCKET) {
      return Response.json({ ok: true, files: [] });
    }

    const listed = await context.env.R2_BUCKET.list({ limit: 200 });
    const files = listed.objects.map((obj) => {
      const meta = obj.customMetadata || {};
      const keyParts = obj.key.split("/");
      const category = (meta.category || keyParts[0] || "supporting") as
        | "legal"
        | "customer"
        | "supporting";
      const rawFileName =
        meta.fileName || keyParts.slice(1).join("/") || obj.key;
      const fileName = rawFileName.replace(/^r2-\d+(-[a-z0-9]+)?-/, "");

      const rawTitle = meta.title || fileName;
      const title = rawTitle.replace(/^r2-\d+(-[a-z0-9]+)?-/, "");

      const rawId = meta.id || obj.key;
      const id = rawId.replace(/^r2-\d+(-[a-z0-9]+)?-/, "");
      const description = meta.description || "";
      const uploadedAt = obj.uploaded
        ? new Date(obj.uploaded).toISOString()
        : new Date().toISOString();

      return {
        id,
        key: obj.key,
        fileName,
        fileSize: obj.size,
        fileType: obj.httpMetadata?.contentType || "application/octet-stream",
        category,
        title,
        description,
        uploadedAt,
        url: `/api/files/download?key=${encodeURIComponent(obj.key)}`,
      };
    });

    files.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );

    return Response.json({ ok: true, files });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to list files",
      },
      { status: 500 },
    );
  }
}

export async function onRequestDelete(context: {
  request: Request;
  env: {
    R2_BUCKET?: {
      delete: (key: string) => Promise<void>;
    };
  };
}) {
  try {
    const url = new URL(context.request.url);
    const key = url.searchParams.get("key");
    if (!key) {
      return Response.json(
        { ok: false, error: "Key is required" },
        { status: 400 },
      );
    }

    if (context.env.R2_BUCKET) {
      await context.env.R2_BUCKET.delete(key);
    }

    return Response.json({ ok: true, deletedKey: key });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to delete file",
      },
      { status: 500 },
    );
  }
}
