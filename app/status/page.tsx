"use client";
import { useState } from "react";
import { Header, Footer } from "@/components/shell";
import { api } from "@/components/booking";
import { EUR, athens } from "@/lib/domain";
export default function Status() {
  const [reference, setRef] = useState(""),
    [email, setEmail] = useState(""),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Header />
      <main id="main" className="narrow">
        <p className="eyebrow">YOUR JOURNEY, AT A GLANCE</p>
        <h1>Find your booking.</h1>
        <p>
          Use the reference you received and the email address on your request.
        </p>
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setResult(null);
            try {
              setResult(await api("lookup", { reference, email }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Booking reference
            <input
              required
              value={reference}
              onChange={(e) => setRef(e.target.value)}
              placeholder="KOS-…"
              maxLength={40}
            />
          </label>
          <label>
            Email address
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            {busy ? "Looking up…" : "Find booking"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        {result && (
          <section className="card stack" aria-live="polite">
            <span className={"badge " + result.status}>{result.status}</span>
            <h2>{result.reference}</h2>
            {result.legs.map((l: any) => (
              <div key={l.direction}>
                <h3>
                  {l.pickup_name} to {l.dropoff_name}
                </h3>
                <p>
                  {athens(l.pickup_at)} · {l.direction}
                </p>
                <small>{l.operational_status.replaceAll("_", " ")}</small>
              </div>
            ))}
            <p>
              <strong>{EUR(result.total_cents)}</strong> ·{" "}
              {result.payment_status.replaceAll("_", " ")}
            </p>
            <p>{result.quote.cancellation}</p>
            {result.status === "pending" && (
              <p className="notice">
                Awaiting review. Your transfer is not confirmed yet.
              </p>
            )}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
