export function allowedAdmin(email?: string | null) {
  return (
    !!email &&
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase())
  );
}
export function authConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.NEXTAUTH_SECRET &&
    process.env.ADMIN_EMAILS
  );
}
export function allowGoogleAccount(
  provider?: string,
  profile?: { email?: string; email_verified?: boolean },
) {
  return (
    provider === "google" &&
    profile?.email_verified === true &&
    allowedAdmin(profile.email)
  );
}
