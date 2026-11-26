import { currentUser, json } from "../_lib";
import { salesAccountOf } from "../_sales";

/** The signed-in account as the Sales site sees it. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentUser(request, env.DB, env.SESSION_SECRET);
  if (!user) return json({ user: null, sales: null });
  const sales = await salesAccountOf(env.DB, user.id);
  return json({
    user: { id: user.id, email: user.email, name: user.name },
    sales: sales ? { linked: Boolean(sales.ownerUserId), team: sales.ownerName || "" } : null,
  });
};
