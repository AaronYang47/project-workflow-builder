import { currentUser, json } from "../_lib";
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) =>
  json({ user: await currentUser(request, env.DB, env.SESSION_SECRET) });
