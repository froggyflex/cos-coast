import NextAuth from "next-auth";
import { authConfigured, authOptions } from "@/lib/auth";
export const runtime = "nodejs";
const handler = NextAuth(authOptions);
async function guarded(...args: Parameters<typeof handler>) {
  if (!authConfigured())
    return Response.json(
      { error: "Google sign-in is not configured yet." },
      { status: 503 },
    );
  return handler(...args);
}
export { guarded as GET, guarded as POST };
