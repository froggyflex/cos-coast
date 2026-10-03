import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="narrow">
      <h1>A little off course.</h1>
      <p>We couldn’t find that page.</p>
      <Link href="/" className="button">
        Back to Kos Coast
      </Link>
    </main>
  );
}
