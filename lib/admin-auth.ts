import { getServerSession } from "next-auth";
import { authConfigured, authOptions, allowedAdmin } from "./auth";
import { HttpError } from "./security";
export async function admin() {
  const session = authConfigured() ? await getServerSession(authOptions) : null;
  const u = session?.user;
  if (!u?.email) throw new HttpError(401, "Sign in to access operations.");
  if (!allowedAdmin(u.email))
    throw new HttpError(
      403,
      "This account does not have access to operations.",
    );
  return { ...u, email: u.email };
}
