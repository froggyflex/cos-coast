import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { allowedAdmin, authConfigured, allowGoogleAccount } from "./access";
export { allowedAdmin, authConfigured } from "./access";
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "not-configured",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "not-configured",
      authorization: {
        params: { prompt: "select_account", scope: "openid email profile" },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/admin", error: "/admin" },
  callbacks: {
    async signIn({ account, profile }) {
      return authConfigured() && allowGoogleAccount(account?.provider, profile);
    },
    async jwt({ token, account, profile }) {
      if (account)
        token.adminVerified = allowGoogleAccount(account.provider, profile);
      return token;
    },
    async session({ session, token }) {
      if (token.adminVerified !== true || !allowedAdmin(token.email))
        session.user = undefined;
      return session;
    },
  },
  logger: {
    error(code) {
      console.error("Authentication error:", code);
    },
  },
};
