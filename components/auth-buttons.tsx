"use client";
import { signIn, signOut } from "next-auth/react";
export function GoogleSignIn() {
  return (
    <button onClick={() => signIn("google", { callbackUrl: "/admin" })}>
      Sign in with Google
    </button>
  );
}
export function SignOut() {
  return (
    <button
      className="outline"
      onClick={() => signOut({ callbackUrl: "/admin" })}
    >
      Sign out
    </button>
  );
}
