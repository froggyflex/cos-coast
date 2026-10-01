import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { admin } from "@/lib/security";
import { Header, Footer } from "@/components/shell";
import Admin from "@/components/admin";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};
export default async function AdminPage() {
  const user = await getChatGPTUser();
  let allowed = false;
  try {
    await admin();
    allowed = true;
  } catch {}
  if (!allowed)
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
          {user ? (
            <>
              <p className="notice">
                Signed in as {user.email}. This account has not been authorised
                for operations. The demo uses a placeholder admin email; set
                ADMIN_EMAILS to your real account before using the hosted
                dashboard.
              </p>
              <a
                className="outline"
                href="/signout-with-chatgpt?return_to=/admin"
                target="_top"
              >
                Sign out
              </a>
            </>
          ) : (
            <a
              className="button"
              href={chatGPTSignInPath("/admin")}
              target="_top"
            >
              Sign in with ChatGPT
            </a>
          )}
          <p className="field-hint">
            Only explicitly authorised accounts can access customer information.
          </p>
        </main>
        <Footer />
      </>
    );
  return <Admin email={user!.email} />;
}
