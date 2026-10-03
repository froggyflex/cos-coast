export function siteOrigin() {
  return (
    process.env.PUBLIC_ORIGIN ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
