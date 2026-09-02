export async function onRequestGet(context: {
  request: Request;
  env: {
    R2_BUCKET?: {
      get: (key: string) => Promise<any>;
    };
  };
}) {
  try {
    if (!context.env.R2_BUCKET) {
      return new Response("R2 storage not configured", { status: 500 });
    }

    const url = new URL(context.request.url);
    const key = url.searchParams.get("key");
    if (!key) {
      return new Response("Key parameter required", { status: 400 });
    }

    const object = await context.env.R2_BUCKET.get(key);
    if (!object) {
      return new Response("File not found in R2", { status: 404 });
    }

    const headers = new Headers();
    if (typeof object.writeHttpMetadata === "function") {
      object.writeHttpMetadata(headers);
    }
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000");

    const customMeta = object.customMetadata || {};
    const fileName = customMeta.fileName || key.split("/").pop() || "download";
    headers.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(fileName)}"`,
    );

    return new Response(object.body, { headers });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Error retrieving file",
      { status: 500 },
    );
  }
}
