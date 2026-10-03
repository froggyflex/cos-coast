import Link from "next/link";
import { Header, Footer } from "@/components/shell";
export const metadata = { title: "Transfer services" };
export default function Transfers() {
  return (
    <>
      <Header />
      <main id="main" className="content-page">
        <p className="eyebrow">WHEREVER KOS TAKES YOU</p>
        <h1>
          One island.
          <br />
          <em>So many journeys.</em>
        </h1>
        <div className="service-grid">
          {[
            [
              "01",
              "Airport transfers",
              "Enter your scheduled landing time and flight number; your collection time includes the buffer you choose. Operations can adjust pickup if your flight changes.",
            ],
            [
              "02",
              "Port connections",
              "Connect Kos Ferry Port or Mastichari Port with your accommodation. Add your ferry name or number to help organise collection.",
            ],
            [
              "03",
              "Hotels & villas",
              "Travel between Kos Town, Psalidi, Tigaki, Marmari, Kardamena, Kefalos and Mastichari. Include the exact property name and address.",
            ],
            [
              "04",
              "Private & touristic",
              "Book a private point-to-point journey to explore more of the island. For multi-stop tours, hourly hire or destinations outside the list, add your request for a custom arrangement.",
            ],
            [
              "05",
              "Business transfers",
              "Choose an executive car for meetings, events and business travel. Add any timing or invoice requirements to your booking request.",
            ],
          ].map(([n, title, text]) => (
            <article className="card" key={n}>
              <span className="eyebrow">{n}</span>
              <h2>{title}</h2>
              <p>{text}</p>
              <Link href="/#journey">Plan your journey</Link>
            </article>
          ))}
        </div>
        <div className="notice">
          Working demo with illustrative routes and prices. Operations must
          confirm each request. No live flight monitoring or online payment is
          connected.
        </div>
      </main>
      <Footer />
    </>
  );
}
