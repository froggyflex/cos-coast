import { Header, Footer } from "@/components/shell";
import { config } from "@/lib/db";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Privacy and booking terms",
  robots: { index: false, follow: false },
};
export default async function Privacy() {
  let cfg: any = null;
  try {
    cfg = await config();
  } catch {}
  return (
    <>
      <Header />
      <main id="main" className="narrow">
        <p className="eyebrow">PRIVACY & BOOKING TERMS</p>
        <h1>
          Your details.
          <br />
          Handled with care.
        </h1>
        <div className="card stack">
          <h2>Demo service notice</h2>
          <p>
            This demonstration stores the information you submit to test booking
            and operations. No real transport contract, online payment or email
            delivery is created. Use fictional customer details when testing.
          </p>
          <h2>How information is used</h2>
          <p>
            {cfg?.privacy ??
              "Contact and journey information are used to manage requests. Contact admin@example.com for privacy requests."}
          </p>
          <p>
            Bookings record contact details, destinations, travel times,
            passenger requirements, privacy acknowledgement, and an optional
            marketing preference. Access is restricted to authorised operations
            users. No card details are collected.
          </p>
          <h2>Booking requests and payment</h2>
          <p>
            A reference acknowledges receipt. A transfer is confirmed only when
            operations changes its status to confirmed. Prices are in EUR,
            including applicable taxes. Payment is arranged manually; recording
            payment does not charge or refund a card.
          </p>
          <h2>Cancellation</h2>
          <p>
            {cfg?.cancellation ??
              "Cancellation requests require operator review."}
          </p>
          <h2>Access and deletion</h2>
          <p>
            Contact {cfg?.email ?? "admin@example.com"} for access, correction
            or deletion. The operator must verify identity and apply retention
            requirements. Marketing permission is optional and can be withdrawn.
          </p>
          <h2>Before launch</h2>
          <p>
            The operator must replace this draft with its legal identity,
            contact details, approved terms, processing basis, retention
            schedule and processor disclosures. This is not an approved legal
            policy.
          </p>
          <small>Notice version: 2026-10-01</small>
        </div>
      </main>
      <Footer />
    </>
  );
}
