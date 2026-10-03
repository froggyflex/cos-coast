import Link from "next/link";
import { Waves, ArrowUpRight, MapPin } from "lucide-react";
export function Header() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Kos Coast Transfers home">
        <span className="brand-icon">
          <Waves size={27} />
        </span>
        <span>
          KOS COAST<small>PRIVATE TRANSFERS</small>
        </span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#journey">Book a transfer</Link>
        <Link href="/transfers">Our services</Link>
        <Link href="/status">Find my booking</Link>
      </nav>
      <Link href="/admin" className="outline small">
        Operations <ArrowUpRight size={14} />
      </Link>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div>
        <Link href="/" className="brand">
          <Waves /> KOS COAST
        </Link>
        <p>Good journeys start with local knowledge.</p>
        <small>
          <MapPin size={13} /> Kos, Dodecanese · Greece
        </small>
      </div>
      <div>
        <Link href="/transfers">Transfer services</Link>
        <Link href="/status">Find my booking</Link>
        <Link href="/privacy">Privacy & booking terms</Link>
        <Link href="/admin">Operations login</Link>
      </div>
      <p className="footer-note">
        Demo booking service · EUR · Europe/Athens
        <br />
        No payment is collected online.
      </p>
    </footer>
  );
}
