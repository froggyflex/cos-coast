import { Header, Footer } from "@/components/shell";
import Booking from "@/components/booking";
import { Plane, Ship, Palmtree, Briefcase, Check, MapPin } from "lucide-react";
export default function Home() {
  return (
    <>
      <Header />
      <main id="main">
        <section className="home-grid">
          <div className="island-story">
            <div className="story-copy">
              <p className="eyebrow">
                <span className="sun-dot" /> A WARM WELCOME TO KOS
              </p>
              <h1>
                Less planning.
                <br />
                More <em>island time.</em>
              </h1>
              <p>
                From your first arrival to your last Aegean sunset. Private
                transfers, made wonderfully simple.
              </p>
              <div className="story-pills">
                <span>
                  <Check size={15} /> Just your group
                </span>
                <span>
                  <Check size={15} /> Every corner of Kos
                </span>
              </div>
            </div>
            <div className="island-photo">
              <img
                src="/aegean-abstract.webp"
                alt="Abstract Aegean blue and sunlit ivory curves inspired by the Mediterranean"
                width="1200"
                height="900"
                fetchPriority="high"
              />
              <div className="photo-label">
                <MapPin size={18} />
                <span>
                  Kos, Greece<small>36.89° N · 27.29° E</small>
                </span>
                <span className="photo-stamp">
                  THE AEGEAN
                  <br />
                  IS CALLING
                </span>
              </div>
            </div>
            <div className="welcome-note">
              <span>01</span>
              <p>
                <strong>Land. Breathe. We’ll take it from here.</strong>
                <br />
                Tell us where you’re headed and request your private ride in a
                few simple steps.
              </p>
            </div>
          </div>
          <Booking />
        </section>
        <section className="services-strip">
          <div>
            <p className="eyebrow">AN ISLAND OF POSSIBILITIES</p>
            <h2>Every reason to go.</h2>
          </div>
          {[
            {
              icon: Plane,
              title: "Airport arrivals",
              text: "A smooth start and an easy farewell.",
            },
            {
              icon: Ship,
              title: "Port connections",
              text: "From the ferry to your next chapter.",
            },
            {
              icon: Palmtree,
              title: "Your island, your pace",
              text: "Hotels, villas and private island outings.",
            },
            {
              icon: Briefcase,
              title: "Business, made personal",
              text: "Space to arrive ready for the day.",
            },
          ].map((x) => (
            <a href="/transfers" key={x.title}>
              <x.icon size={23} />
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </a>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
