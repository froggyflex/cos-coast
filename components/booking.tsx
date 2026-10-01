"use client";
import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Users,
  Luggage,
  Check,
  Car,
  ShieldCheck,
  Clock,
  CalendarDays,
  ChevronLeft,
} from "lucide-react";
import { EUR, athens, localTime } from "@/lib/domain";
export async function api(path: string, data?: unknown): Promise<any> {
  const r = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const p: any = await r.json();
  if (!r.ok) throw new Error(p.error || "Please try again.");
  return p;
}
const initial = {
  type: "airport",
  pickupId: "kgs",
  dropoffId: "kos-town",
  pickupAddress: "",
  dropoffAddress: "",
  dateTime: "",
  returnDateTime: "",
  passengers: 2,
  luggage: 2,
  childSeats: 0,
  flightNumber: "",
  returnFlightNumber: "",
  arrivalBuffer: 45,
  extras: [] as string[],
  vehicleType: "",
};
export default function Booking({ manual = false }: { manual?: boolean }) {
  const [c, setC] = useState<any>(null),
    [j, setJ] = useState(initial),
    [contact, setContact] = useState({
      name: "",
      email: "",
      phone: "",
      requests: "",
      consent: false,
      marketing: false,
    }),
    [step, setStep] = useState(0),
    [q, setQ] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null),
    [returnTrip, setReturn] = useState(false),
    [retry, setRetry] = useState(0);
  const key = useRef(""),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    api("catalog")
      .then((x) => {
        setC(x);
        setJ((v) => ({ ...v, arrivalBuffer: x.business?.arrivalBuffer ?? 45 }));
      })
      .catch((e) => setError(e.message));
    key.current = crypto.randomUUID();
  }, [retry]);
  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);
  const update = (k: string, v: any) => {
    setJ((x) => ({ ...x, [k]: v }));
    setError("");
  };
  const selected = q?.options.find((x: any) => x.id === j.vehicleType);
  async function next(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (step === 0) {
      setBusy(true);
      try {
        const quote = await api("quote", {
          ...j,
          vehicleType: undefined,
          returnDateTime: returnTrip ? j.returnDateTime : "",
        });
        setQ(quote);
        update("vehicleType", quote.options[0].id);
        key.current = crypto.randomUUID();
        setStep(1);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else if (step < 3) setStep(step + 1);
    else {
      setBusy(true);
      try {
        setResult(
          await api(manual ? "admin/bookings" : "bookings", {
            journey: {
              ...j,
              returnDateTime: returnTrip ? j.returnDateTime : "",
            },
            contact,
            idempotencyKey: key.current,
            expectedTotal: selected.totalCents,
          }),
        );
        setStep(4);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }
  }
  const destination = (id: string) =>
    c?.destinations.find((d: any) => d.id === id);
  if (result)
    return (
      <section className="booking-panel success" aria-live="polite">
        <span className="success-icon">
          <Check size={30} />
        </span>
        <p className="eyebrow">REQUEST RECEIVED</p>
        <h2 tabIndex={-1} ref={heading}>
          Your island journey is one step closer.
        </h2>
        <p>
          Operations will review availability and confirm your transfer. This is
          a request, not a confirmed reservation.
        </p>
        <div className="reference">
          <small>YOUR BOOKING REFERENCE</small>
          <strong>{result.reference}</strong>
        </div>
        <p>
          Total: <strong>{EUR(result.totalCents)}</strong> · Payment due by
          arrangement
        </p>
        <p className="notice">
          Save your reference. Email delivery is not connected in this demo; no
          email or payment has been sent.
        </p>
        <a className="button" href="/status">
          Check booking status
        </a>
        {manual && (
          <a className="outline" href="/admin">
            Back to operations
          </a>
        )}
      </section>
    );
  return (
    <section id="journey" className="booking-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">YOUR JOURNEY STARTS HERE</p>
          <h2 ref={heading} tabIndex={-1}>
            {
              [
                "Where are we taking you?",
                "A little room to unwind.",
                "Who’s coming along?",
                "Everything look right?",
              ][step]
            }
          </h2>
        </div>
        <span className="step-count">0{step + 1} / 04</span>
      </div>
      <ol className="steps" aria-label="Booking progress">
        {["Journey", "Vehicle", "Your details", "Review"].map((s, i) => (
          <li
            key={s}
            className={i === step ? "current" : i < step ? "done" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {!c ? (
        <div className="empty">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                onClick={() => {
                  setError("");
                  setRetry((x) => x + 1);
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <p role="status">Loading destinations and prices…</p>
          )}
        </div>
      ) : !c.business ? (
        <p className="notice">
          The booking service is being configured. Please check back shortly.
        </p>
      ) : (
        <form onSubmit={next}>
          {step === 0 && (
            <>
              <div className="trip-tabs" role="group" aria-label="Journey type">
                <button
                  type="button"
                  className={!returnTrip ? "selected" : ""}
                  aria-pressed={!returnTrip}
                  onClick={() => setReturn(false)}
                >
                  One way
                </button>
                <button
                  type="button"
                  className={returnTrip ? "selected" : ""}
                  aria-pressed={returnTrip}
                  onClick={() => setReturn(true)}
                >
                  Return journey
                </button>
              </div>
              <div className="form-grid">
                <label className="full">
                  Transfer service
                  <select
                    value={j.type}
                    onChange={(e) => update("type", e.target.value)}
                  >
                    <option value="airport">Airport transfer</option>
                    <option value="port">Port transfer</option>
                    <option value="hotel">Hotel / villa transfer</option>
                    <option value="private">
                      Private / touristic transfer
                    </option>
                    <option value="business">Business transfer</option>
                  </select>
                </label>
                <label>
                  <span>
                    <MapPin size={15} /> Pick-up location
                  </span>
                  <select
                    value={j.pickupId}
                    onChange={(e) => update("pickupId", e.target.value)}
                  >
                    {c.destinations.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <MapPin size={15} /> Drop-off location
                  </span>
                  <select
                    value={j.dropoffId}
                    onChange={(e) => update("dropoffId", e.target.value)}
                  >
                    {c.destinations.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!["airport", "port"].includes(
                  destination(j.pickupId)?.kind,
                ) && (
                  <label className="full">
                    Pickup hotel, villa or street address
                    <input
                      required
                      maxLength={300}
                      value={j.pickupAddress}
                      placeholder="Hotel name and entrance or full address"
                      onChange={(e) => update("pickupAddress", e.target.value)}
                    />
                  </label>
                )}
                {!["airport", "port"].includes(
                  destination(j.dropoffId)?.kind,
                ) && (
                  <label className="full">
                    Drop-off hotel, villa or street address
                    <input
                      required
                      maxLength={300}
                      value={j.dropoffAddress}
                      placeholder="Where would you like to arrive?"
                      onChange={(e) => update("dropoffAddress", e.target.value)}
                    />
                  </label>
                )}
                <label>
                  <span>
                    <CalendarDays size={15} />{" "}
                    {destination(j.pickupId)?.kind === "airport"
                      ? "Flight arrival date & time"
                      : "Pickup date & time"}
                  </span>
                  <input
                    required
                    type="datetime-local"
                    min={localTime(Date.now() + 2 * 3600000)}
                    value={j.dateTime}
                    onChange={(e) => update("dateTime", e.target.value)}
                  />
                </label>
                <label>
                  <span>
                    <Users size={15} /> Passengers, including children
                  </span>
                  <input
                    required
                    type="number"
                    min={1}
                    max={16}
                    value={j.passengers}
                    onChange={(e) => update("passengers", +e.target.value)}
                  />
                </label>
                <label>
                  <span>
                    <Luggage size={15} /> Standard suitcases
                  </span>
                  <input
                    required
                    type="number"
                    min={0}
                    max={20}
                    value={j.luggage}
                    onChange={(e) => update("luggage", +e.target.value)}
                  />
                </label>
                <label>
                  Child seats
                  <input
                    required
                    type="number"
                    min={0}
                    max={4}
                    value={j.childSeats}
                    onChange={(e) => update("childSeats", +e.target.value)}
                  />
                </label>
                <label>
                  {destination(j.pickupId)?.kind === "airport"
                    ? "Arriving flight number"
                    : "Flight / ferry number (optional)"}
                  <input
                    required={destination(j.pickupId)?.kind === "airport"}
                    maxLength={30}
                    value={j.flightNumber}
                    placeholder="e.g. A3 224"
                    onChange={(e) => update("flightNumber", e.target.value)}
                  />
                </label>
                <label>
                  Collection buffer after landing
                  <select
                    value={j.arrivalBuffer}
                    onChange={(e) => update("arrivalBuffer", +e.target.value)}
                  >
                    {[15, 30, 45, 60, 90, 120, 180].map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                </label>
                {returnTrip && (
                  <>
                    <label>
                      Return{" "}
                      {destination(j.dropoffId)?.kind === "airport"
                        ? "flight arrival"
                        : "pickup"}{" "}
                      date & time
                      <input
                        type="datetime-local"
                        required
                        min={j.dateTime}
                        value={j.returnDateTime}
                        onChange={(e) =>
                          update("returnDateTime", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Return flight / ferry number
                      <input
                        required={destination(j.dropoffId)?.kind === "airport"}
                        maxLength={30}
                        value={j.returnFlightNumber}
                        onChange={(e) =>
                          update("returnFlightNumber", e.target.value)
                        }
                      />
                    </label>
                  </>
                )}
              </div>
              <p className="field-hint">
                <Clock size={14} /> All times are local to Kos (Europe/Athens).
                Airport pickups use landing time plus your collection buffer.
                Flight delays are reviewed by operations; there is no live
                flight tracking.
              </p>
              {(destination(j.dropoffId)?.kind === "airport" ||
                (returnTrip &&
                  destination(j.pickupId)?.kind === "airport")) && (
                <p className="notice">
                  For airport departures, choose a pickup time that allows for
                  the drive and your airline’s check-in requirements.
                </p>
              )}
              <fieldset className="extras">
                <legend>
                  Make it yours <span>Optional extras</span>
                </legend>
                {c.extras.map((x: any) => (
                  <label className="check-line" key={x.id}>
                    <input
                      type="checkbox"
                      checked={j.extras.includes(x.id)}
                      onChange={(e) =>
                        update(
                          "extras",
                          e.target.checked
                            ? [...j.extras, x.id]
                            : j.extras.filter((v) => v !== x.id),
                        )
                      }
                    />
                    {x.name}
                    <span>{EUR(x.cents)} / journey</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {step === 1 && (
            <div className="vehicle-options">
              {q.options.map((v: any) => (
                <label
                  key={v.id}
                  className={
                    "vehicle-option " + (j.vehicleType === v.id ? "chosen" : "")
                  }
                >
                  <input
                    type="radio"
                    name="vehicle"
                    value={v.id}
                    checked={j.vehicleType === v.id}
                    onChange={() => update("vehicleType", v.id)}
                  />
                  <span className="vehicle-icon">
                    <Car size={35} />
                  </span>
                  <span>
                    <strong>{v.name}</strong>
                    <small>{v.description}</small>
                    <span className="capacity">
                      <Users size={14} /> {v.passengers} <Luggage size={14} />{" "}
                      {v.luggage}
                    </span>
                  </span>
                  <b>
                    {EUR(v.totalCents)}
                    <small>total, including extras</small>
                  </b>
                </label>
              ))}
              <p className="field-hint">
                All vehicles are private. Child seats count within the passenger
                capacity. Vehicle availability is confirmed by operations.
              </p>
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <label className="full">
                Full name
                <input
                  required
                  autoComplete="name"
                  maxLength={120}
                  minLength={2}
                  value={contact.name}
                  onChange={(e) =>
                    setContact({ ...contact, name: e.target.value })
                  }
                />
              </label>
              <label>
                Email address
                <input
                  required
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  value={contact.email}
                  onChange={(e) =>
                    setContact({ ...contact, email: e.target.value })
                  }
                />
              </label>
              <label>
                Phone with country code
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  maxLength={25}
                  placeholder="+44 …"
                  value={contact.phone}
                  onChange={(e) =>
                    setContact({ ...contact, phone: e.target.value })
                  }
                />
              </label>
              <label className="full">
                Special requests <span className="muted">Optional</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="Child ages for suitable seats, oversized luggage, accessibility requirements…"
                  value={contact.requests}
                  onChange={(e) =>
                    setContact({ ...contact, requests: e.target.value })
                  }
                />
              </label>
              <p className="field-hint full">
                Please avoid adding sensitive medical information. We’ll confirm
                whether we can meet your accessibility or luggage requirements.
              </p>
              <label className="check-line full">
                <input
                  type="checkbox"
                  required
                  checked={contact.consent}
                  onChange={(e) =>
                    setContact({ ...contact, consent: e.target.checked })
                  }
                />
                <span>
                  I have read the{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer">
                    privacy notice and booking terms
                  </a>{" "}
                  and agree to use of my details to manage this request.
                </span>
              </label>
              <label className="check-line full">
                <input
                  type="checkbox"
                  checked={contact.marketing}
                  onChange={(e) =>
                    setContact({ ...contact, marketing: e.target.checked })
                  }
                />
                Send me occasional news and offers. Optional.
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="review">
              <div className="review-route">
                {q.legs.map((l: any) => (
                  <div key={l.direction}>
                    <p className="eyebrow">{l.direction} JOURNEY</p>
                    <h3>
                      {l.pickupName} <span>to</span> {l.dropoffName}
                    </h3>
                    <p>
                      {athens(l.pickupAt)} · estimated drive {l.minutes} min
                    </p>
                    {l.arrivalBuffer > 0 && (
                      <small>
                        Landing {athens(l.scheduledAt)} + {l.arrivalBuffer} min
                        collection buffer
                      </small>
                    )}
                    <p>
                      {l.direction === "outbound"
                        ? j.pickupAddress
                        : j.dropoffAddress}{" "}
                      {l.direction === "outbound"
                        ? j.dropoffAddress
                        : j.pickupAddress}
                    </p>
                  </div>
                ))}
              </div>
              <p>
                <strong>{contact.name}</strong> · {contact.email}
                <br />
                {contact.phone}
              </p>
              <p>
                {j.passengers} passengers · {j.luggage} suitcases ·{" "}
                {j.childSeats} child seats
              </p>
              {contact.requests && <p>{contact.requests}</p>}
              <div className="price-lines">
                {selected.items
                  .filter((x: any) => x.cents > 0)
                  .map((x: any) => (
                    <div key={x.label}>
                      <span>{x.label}</span>
                      <strong>{EUR(x.cents)}</strong>
                    </div>
                  ))}
                <div className="price-total">
                  <span>Total in EUR</span>
                  <strong>{EUR(selected.totalCents)}</strong>
                </div>
                <small>
                  Includes applicable taxes. No online payment. Pay by
                  arrangement with the operator.
                </small>
              </div>
              <p className="notice">{q.cancellation}</p>
              {c.business.demo && (
                <p className="notice">
                  Demo service and illustrative pricing. Requests will be saved
                  for testing; no actual transfer is arranged.
                </p>
              )}
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="form-actions">
            {step > 0 && (
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep(step - 1);
                  setError("");
                }}
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button type="submit" className="button" disabled={busy}>
              {busy
                ? "Please wait…"
                : [
                    "Find my transfer",
                    "Continue with this vehicle",
                    "Review my booking",
                    "Send booking request",
                  ][step]}
            </button>
          </div>
          <p className="secure-note">
            <ShieldCheck size={14} /> Clear pricing. Private journeys. No
            payment needed to request.
          </p>
        </form>
      )}
    </section>
  );
}
