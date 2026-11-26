import { currentUser, json } from "../_lib";
import { isSalesUser } from "../_sales";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB, env.SESSION_SECRET);
  // Sales accounts belong on the Sales site; the app sends them there.
  const sales = user ? await isSalesUser(env.DB, user.id).catch(() => false) : false;
  return json({ user, sales });
};
