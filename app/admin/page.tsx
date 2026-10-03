import { getServerSession } from "next-auth";
import { allowedAdmin, authConfigured, authOptions } from "@/lib/auth";
import { Header, Footer } from "@/components/shell";
import { GoogleSignIn, SignOut } from "@/components/auth-buttons";
import Admin from "@/components/admin";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = authConfigured();
  const session = configured ? await getServerSession(authOptions) : null;
  const { error } = await searchParams;
  if (session?.user?.email && allowedAdmin(session.user.email))
    return <Admin email={session.user.email} />;
  return (
    <>
      <Header />
      <main id="main" className="card login">
        <p className="eyebrow">KOS COAST OPERATIONS</p>
        <h1>
          A smooth day
          <br />
          starts here.
        </h1>
        <p>Manage requests, plan pickups and keep every journey on track.</p>
        {error && (
          <p className="error" role="alert">
            Sign-in could not be completed. Use your authorised Google account
            and try again.
          </p>
        )}
        {!configured ? (
          <p className="notice">
            Operations sign-in is being configured. Please check back shortly.
          </p>
        ) : session?.user ? (
          <>
            <p className="notice">
              This account does not have access to operations.
            </p>
            <SignOut />
          </>
        ) : (
          <GoogleSignIn />
        )}
        <p className="field-hint">
          Only authorised accounts can access customer information.
        </p>
      </main>
      <Footer />
    </>
  );
}
