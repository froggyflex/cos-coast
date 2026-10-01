"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="narrow card">
      <h1>Let’s try that again.</h1>
      <p>
        Something interrupted this page. Your submitted bookings remain saved.
      </p>
      <button onClick={reset}>Reload page</button>
      <p>
        <a href="/">Return to booking</a>
      </p>
    </main>
  );
}
