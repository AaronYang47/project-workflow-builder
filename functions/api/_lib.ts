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
      "SELECT users.id, users.email, users.name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
    )
    .bind(hashed, new Date().toISOString())
    .first<{ id: string; email: string; name: string }>();
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
