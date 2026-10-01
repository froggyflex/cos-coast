import { Waves, ArrowUpRight, MapPin } from "lucide-react";
export function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Kos Coast Transfers home">
        <span className="brand-icon">
          <Waves size={27} />
        </span>
        <span>
          KOS COAST<small>PRIVATE TRANSFERS</small>
        </span>
      </a>
      <nav aria-label="Main navigation">
        <a href="/#journey">Book a transfer</a>
        <a href="/transfers">Our services</a>
        <a href="/status">Find my booking</a>
      </nav>
      <a href="/admin" className="outline small">
        Operations <ArrowUpRight size={14} />
      </a>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div>
        <a href="/" className="brand">
          <Waves /> KOS COAST
        </a>
        <p>Good journeys start with local knowledge.</p>
        <small>
          <MapPin size={13} /> Kos, Dodecanese · Greece
        </small>
      </div>
      <div>
        <a href="/transfers">Transfer services</a>
        <a href="/status">Find my booking</a>
        <a href="/privacy">Privacy & booking terms</a>
        <a href="/admin">Operations login</a>
      </div>
      <p className="footer-note">
        Demo booking service · EUR · Europe/Athens
        <br />
        No payment is collected online.
      </p>
    </footer>
  );
}
