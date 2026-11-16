import { json } from "./_auth";

/** Reached only through the sign-in check in _middleware. */
export const onRequestGet: PagesFunction<Env> = async () => json({ ok: true });
