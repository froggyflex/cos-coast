"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Waves,
  LayoutDashboard,
  CalendarDays,
  Bell,
  Settings,
  Plus,
  Download,
  Car,
  ChevronLeft,
  RefreshCw,
} from "lucide-react";
import Booking, { api } from "./booking";
import { SignOut } from "./auth-buttons";
import { EUR, athens, localTime, transitions, operations } from "@/lib/domain";
export default function Admin({ email }: { email: string }) {
  const [now, setNow] = useState<number | null>(null);
  const [view, setView] = useState("overview"),
    [bookings, setBookings] = useState<any[]>([]),
    [schedule, setSchedule] = useState<any[]>([]),
    [resources, setResources] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [date, setDate] = useState(""),
    [notifications, setNotifications] = useState<any>(null),
    [settings, setSettings] = useState<any>(null),
    [saving, setSaving] = useState(false);
  async function refresh() {
    try {
      await api("catalog");
      setError("");
      setNow(Date.now());
      const [b, r, n, s, journeys] = await Promise.all([
        api("admin/bookings"),
        api("admin/resources"),
        api("admin/notifications"),
        api("admin/settings"),
        api("admin/schedule"),
      ]);
      setBookings(b);
      setResources(r);
      setNotifications(n);
      setSettings(s);
      setSchedule(journeys);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // Initial external data fetch; refresh updates state only after network completion.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);
  async function open(id: string) {
    setLoading(true);
    setError("");
    try {
      setSelected(await api("admin/bookings/" + id));
      setView("detail");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function save(path: string, data: any) {
    setSaving(true);
    setError("");
    setToast("");
    try {
      const r = await api(path, data);
      if (r?.reference && r?.legs) setSelected(r);
      setToast(r.message || "Saved successfully.");
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  function navigate(v: string) {
    setView(v);
    setError("");
    setToast("");
  }
  const filtered = (view === "calendar" ? schedule : bookings).filter(
    (b) =>
      (filter === "all" || b.status === filter) &&
      (!date || localTime(b.pickup_at).startsWith(date)) &&
      `${b.reference} ${b.name} ${b.email} ${b.route}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const today = now ? localTime(now).slice(0, 10) : "",
    unread =
      notifications?.notifications.filter((n: any) => !n.read_at).length ?? 0;
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <Waves size={30} />
          <span>
            KOS COAST<small>OPERATIONS</small>
          </span>
        </Link>
        <nav aria-label="Operations">
          {[
            ["overview", LayoutDashboard, "Overview"],
            ["bookings", Car, "Bookings"],
            ["calendar", CalendarDays, "Schedule"],
            [
              "notifications",
              Bell,
              `Notifications${unread ? " · " + unread : ""}`,
            ],
            ["settings", Settings, "Settings"],
          ].map(([id, Icon, label]: any) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>{email}</span>
          <span>Europe/Athens · EUR</span>
          <Link href="/">Customer website</Link>
          <SignOut />
        </div>
      </aside>
      <main id="main" className="admin-main">
        <div className="admin-top">
          <div>
            <p className="eyebrow">YOUR ISLAND, IN MOTION</p>
            <h1>
              {
                {
                  overview: "A good day starts here.",
                  bookings: "Every journey, in order.",
                  calendar: "The road ahead.",
                  notifications: "Keep everyone in the loop.",
                  settings: "Make it yours.",
                  detail: "Journey details.",
                  new: "Create a booking.",
                }[view]
              }
            </h1>
            <p>
              {now ? athens(now) : "Kos, Greece"} · All times shown in Kos local
              time
            </p>
          </div>
          <div className="admin-actions">
            <button
              className="outline small"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh operations"
            >
              <RefreshCw size={16} />
            </button>
            <a className="outline small" href="/api/admin/export" download>
              <Download size={16} />
              Export
            </a>
            <button className="small" onClick={() => navigate("new")}>
              <Plus size={17} />
              New booking
            </button>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {toast && (
          <p className="toast" role="status">
            {toast}
          </p>
        )}
        {loading && <p role="status">Loading operations…</p>}
        {view === "overview" && (
          <div className="kpis">
            {[
              [
                "Today's pickups",
                schedule.filter(
                  (b) =>
                    b.status !== "cancelled" &&
                    localTime(b.pickup_at).startsWith(today),
                ).length,
              ],
              [
                "Awaiting review",
                bookings.filter((b) => ["new", "pending"].includes(b.status))
                  .length,
              ],
              [
                "Ready to assign",
                bookings.filter((b) => b.status === "confirmed").length,
              ],
              [
                "Booked value",
                EUR(
                  bookings
                    .filter((b) => b.status !== "cancelled")
                    .reduce((n, b) => n + b.total_cents, 0),
                ),
              ],
            ].map(([label, n]) => (
              <div className="kpi" key={label}>
                <span>{label}</span>
                <strong>{n}</strong>
              </div>
            ))}
          </div>
        )}
        {["overview", "bookings", "calendar"].includes(view) && (
          <>
            <div className="toolbar">
              <label>
                Search bookings
                <input
                  placeholder="Name, reference, email or destination"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                Status
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {[
                    "all",
                    "new",
                    "pending",
                    "confirmed",
                    "assigned",
                    "completed",
                    "cancelled",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Pickup date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <button
                className="outline"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setDate("");
                }}
              >
                Reset
              </button>
            </div>
            {filtered.length === 0 && !loading ? (
              <div className="card empty">
                <h2>No journeys here yet.</h2>
                <p>Create a booking or change your filters.</p>
                <button onClick={() => navigate("new")}>
                  Create a booking
                </button>
              </div>
            ) : view === "calendar" ? (
              <div className="calendar">
                {Array.from(
                  new Set(
                    filtered.map((b) => localTime(b.pickup_at).slice(0, 10)),
                  ),
                )
                  .sort()
                  .map((day) => (
                    <section key={day} className="calendar-day">
                      <h3>{day}</h3>
                      <div>
                        {filtered
                          .filter((b) => localTime(b.pickup_at).startsWith(day))
                          .map((b) => (
                            <article className="calendar-event" key={b.id}>
                              <div>
                                <strong>
                                  {localTime(b.pickup_at).slice(11)} · {b.name}
                                </strong>
                                <p>
                                  {b.route} · {b.direction}
                                </p>
                                <small>
                                  {b.driver_name || "Driver unassigned"} ·{" "}
                                  {b.vehicle_name || "Vehicle unassigned"}
                                </small>
                                <span className={"badge " + b.status}>
                                  {b.status}
                                </span>
                              </div>
                              <button
                                className="outline small"
                                onClick={() => open(b.booking_id)}
                              >
                                View booking
                              </button>
                            </article>
                          ))}
                      </div>
                    </section>
                  ))}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Booking / customer</th>
                      <th>Journey</th>
                      <th>Pickup in Kos</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <button onClick={() => open(b.id)}>
                            {b.reference}
                          </button>
                          <small>
                            {b.name}
                            {b.demo ? " · demo" : ""}
                          </small>
                        </td>
                        <td>{b.route}</td>
                        <td>{athens(b.pickup_at)}</td>
                        <td>
                          <span className={"badge " + b.status}>
                            {b.status}
                          </span>
                        </td>
                        <td>{b.payment_status.replaceAll("_", " ")}</td>
                        <td>{EUR(b.total_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="field-hint">
              Showing up to 1,000 most recent pickups. Export includes all
              journeys.
            </p>
          </>
        )}
        {view === "new" && <Booking manual />}
        {view === "detail" && selected && (
          <>
            <button
              className="text-button"
              onClick={() => navigate("bookings")}
            >
              <ChevronLeft size={16} /> All bookings
            </button>
            <Detail
              key={selected.id + "-" + selected.version}
              b={selected}
              resources={resources}
              save={save}
              busy={saving}
            />
          </>
        )}
        {view === "notifications" && notifications && (
          <>
            <div className="admin-actions">
              <button
                className="outline"
                disabled={saving}
                onClick={() => save("admin/notifications", {})}
              >
                Mark all read
              </button>
              <button
                disabled={saving}
                onClick={() => save("admin/deliver", {})}
              >
                Process delivery queue
              </button>
            </div>
            <p className="notice">
              In-app notifications are live. Without a configured provider,
              email and push events remain queued and nothing is sent.
            </p>
            <div className="card">
              {notifications.notifications.length ? (
                notifications.notifications.map((n: any) => (
                  <article
                    className={"notification " + (!n.read_at ? "unread" : "")}
                    key={n.id}
                  >
                    <div>
                      <button
                        className="text-button"
                        onClick={() => n.booking_id && open(n.booking_id)}
                      >
                        {n.message}
                      </button>
                      <small>{athens(n.created_at)}</small>
                    </div>
                    <span>{n.read_at ? "Read" : "New"}</span>
                  </article>
                ))
              ) : (
                <p>No notifications yet.</p>
              )}
            </div>
            <h2>Delivery queue</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>State</th>
                    <th>Attempts</th>
                    <th>Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.outbox.map((n: any) => (
                    <tr key={n.id}>
                      <td>
                        {n.event}
                        <small>{athens(n.created_at)}</small>
                      </td>
                      <td>{n.status}</td>
                      <td>{n.attempts}</td>
                      <td>{n.last_error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {view === "settings" && settings && (
          <SettingsEditor data={settings} save={save} busy={saving} />
        )}
      </main>
    </div>
  );
}
function Detail({ b, resources, save, busy }: any) {
  const [form, setForm] = useState({
    version: b.version,
    status: b.status,
    paymentStatus: b.payment_status,
    internalNotes: b.internal_notes,
    name: b.name,
    email: b.email,
    phone: b.phone,
    requests: b.requests,
  });
  return (
    <div className="detail-grid">
      <div>
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            save("admin/bookings/" + b.id, form);
          }}
        >
          <div>
            <p className="eyebrow">{b.reference}</p>
            <h2>{b.name}</h2>
            <span className={"badge " + b.status}>{b.status}</span>
          </div>
          <div className="form-grid">
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {[b.status, ...(transitions[b.status] ?? [])].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Payment record
              <select
                value={form.paymentStatus}
                onChange={(e) =>
                  setForm({ ...form, paymentStatus: e.target.value })
                }
              >
                {[
                  "unpaid",
                  "deposit_paid",
                  "paid",
                  "refund_pending",
                  "refunded",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="full">
              Customer requests
              <textarea
                value={form.requests}
                onChange={(e) => setForm({ ...form, requests: e.target.value })}
              />
            </label>
            <label className="full">
              Internal notes
              <textarea
                rows={4}
                value={form.internalNotes}
                onChange={(e) =>
                  setForm({ ...form, internalNotes: e.target.value })
                }
              />
            </label>
          </div>
          <button disabled={busy}>Save booking</button>
          <small className="muted">
            Payment status is a manual record. It does not charge or refund the
            customer.
          </small>
        </form>
        <div className="card">
          <h2>Dispatch & pickups</h2>
          <p className="field-hint">
            Confirm before assigning. Conflict checks include the journey
            duration and turnaround buffer.
          </p>
          {b.legs.map((l: any) => (
            <Leg
              key={l.id}
              l={l}
              b={b}
              resources={resources}
              save={save}
              busy={busy}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="card">
          <h2>Booking summary</h2>
          <p>
            {b.passengers} passengers · {b.luggage} cases · {b.child_seats}{" "}
            child seats
          </p>
          <div className="price-lines">
            {b.quote.items?.map((x: any) => (
              <div key={x.label}>
                <span>{x.label}</span>
                <strong>{EUR(x.cents)}</strong>
              </div>
            ))}
            <div className="price-total">
              <span>Total</span>
              <strong>{EUR(b.total_cents)}</strong>
            </div>
          </div>
          <p className="field-hint">{b.quote.cancellation}</p>
          <small>
            Privacy notice {b.privacy_version} accepted {athens(b.consent_at)}.
            <br />
            Marketing: {b.marketing ? "Opted in" : "Not opted in"}
          </small>
        </div>
        <div className="card">
          <h2>Activity history</h2>
          <ol className="audit-list">
            {b.audit.map((a: any) => (
              <li key={a.id}>
                <strong>{a.action.replaceAll("_", " ")}</strong>
                <small>
                  {athens(a.created_at)} · {a.actor}
                </small>
                <details>
                  <summary>Details</summary>
                  <pre>{a.details}</pre>
                </details>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
function Leg({ l, b, resources, save, busy }: any) {
  const [v, setV] = useState({
    version: b.version,
    driverId: l.driver_id || "",
    vehicleId: l.vehicle_id || "",
    pickupTime: localTime(l.pickup_at),
    operationalStatus: l.operational_status,
    flightNumber: l.flight_number,
    pickupAddress: l.pickup_address,
    dropoffAddress: l.dropoff_address,
  });
  return (
    <form
      className="leg-card stack"
      onSubmit={(e) => {
        e.preventDefault();
        save(`admin/bookings/${b.id}/legs/${l.id}`, {
          ...v,
          driverId: v.driverId || null,
          vehicleId: v.vehicleId || null,
        });
      }}
    >
      <div>
        <p className="eyebrow">{l.direction}</p>
        <h3>
          {l.pickup_name} to {l.dropoff_name}
        </h3>
        <small>
          Original scheduled time: {athens(l.scheduled_at)}
          {l.arrival_buffer ? ` + ${l.arrival_buffer} min arrival buffer` : ""}
        </small>
      </div>
      <div className="form-grid">
        <label>
          Driver
          <select
            value={v.driverId}
            onChange={(e) => setV({ ...v, driverId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {resources.drivers
              .filter((d: any) => d.active || d.id === v.driverId)
              .map((d: any) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Vehicle
          <select
            value={v.vehicleId}
            onChange={(e) => setV({ ...v, vehicleId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {resources.vehicles
              .filter(
                (x: any) =>
                  x.type_id === b.vehicle_type &&
                  (x.active || x.id === v.vehicleId),
              )
              .map((x: any) => (
                <option value={x.id} key={x.id}>
                  {x.name} · {x.plate}
                </option>
              ))}
          </select>
        </label>
        <label>
          Actual planned pickup
          <input
            required
            type="datetime-local"
            value={v.pickupTime}
            onChange={(e) => setV({ ...v, pickupTime: e.target.value })}
          />
        </label>
        <label>
          Operational status
          <select
            value={v.operationalStatus}
            onChange={(e) => setV({ ...v, operationalStatus: e.target.value })}
          >
            {[
              l.operational_status,
              ...(operations[l.operational_status] ?? []),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Flight / ferry number
          <input
            maxLength={30}
            value={v.flightNumber}
            onChange={(e) => setV({ ...v, flightNumber: e.target.value })}
          />
        </label>
        <label>
          Pickup address
          <input
            maxLength={300}
            value={v.pickupAddress}
            onChange={(e) => setV({ ...v, pickupAddress: e.target.value })}
          />
        </label>
        <label className="full">
          Drop-off address
          <input
            maxLength={300}
            value={v.dropoffAddress}
            onChange={(e) => setV({ ...v, dropoffAddress: e.target.value })}
          />
        </label>
      </div>
      <button
        className="outline"
        disabled={busy || !["confirmed", "assigned"].includes(b.status)}
      >
        Save journey
      </button>
    </form>
  );
}
const blanks: Record<string, any> = {
  zones: { id: "", name: "" },
  destinations: {
    id: "",
    name: "",
    zone_id: "airport",
    kind: "hotel",
    active: 1,
  },
  routes: {
    id: "",
    from_zone: "airport",
    to_zone: "town",
    cents: 4500,
    minutes: 40,
  },
  extras: { id: "", name: "", cents: 500, active: 1 },
  drivers: { id: "", name: "", phone: "", active: 1 },
  vehicles: { id: "", name: "", plate: "", type_id: "sedan", active: 1 },
  types: {
    id: "",
    name: "",
    passengers: 3,
    luggage: 3,
    multiplier: 100,
    description: "",
  },
};
function SettingsEditor({ data, save, busy }: any) {
  const [tab, setTab] = useState("business"),
    [value, setValue] = useState<any>(data.business);
  function change(t: string) {
    setTab(t);
    setValue(t === "business" ? data.business : null);
  }
  return (
    <>
      <div className="settings-tabs">
        {[
          "business",
          "zones",
          "destinations",
          "routes",
          "types",
          "extras",
          "drivers",
          "vehicles",
        ].map((t) => (
          <button
            key={t}
            className={t === tab ? "" : "outline"}
            onClick={() => change(t)}
          >
            {t === "types"
              ? "Vehicle classes"
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="settings-editor">
        {tab !== "business" && (
          <div className="card">
            <div className="panel-head">
              <h2>{tab.charAt(0).toUpperCase() + tab.slice(1)}</h2>
              <button
                className="small"
                onClick={() => setValue({ ...blanks[tab] })}
              >
                Add new
              </button>
            </div>
            {data[tab].map((r: any) => (
              <div className="settings-row" key={r.id}>
                <div>
                  <strong>{r.name || `${r.from_zone} ↔ ${r.to_zone}`}</strong>
                  <small className="muted">
                    {" "}
                    · {r.id}
                    {r.cents !== undefined ? " · " + EUR(r.cents) : ""}
                    {r.active === 0 ? " · inactive" : ""}
                  </small>
                </div>
                <button
                  className="outline small"
                  onClick={() => setValue({ ...r })}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}
        {value && (
          <form
            className="card stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save("admin/settings", { entity: tab, value }))
                if (tab !== "business") setValue(null);
            }}
          >
            <h2>
              {tab === "business" ? "Business & booking rules" : "Edit " + tab}
            </h2>
            <div className="form-grid">
              {Object.entries(value)
                .filter(([k]) => k !== "pricingVersion")
                .map(([k, v]) => (
                  <label
                    key={tab + k}
                    className={
                      [
                        "privacy",
                        "cancellation",
                        "notificationRecipients",
                        "description",
                      ].includes(k)
                        ? "full"
                        : ""
                    }
                  >
                    {(
                      {
                        cents: "Price (EUR cents)",
                        childSeatCents: "Child seat price per journey (cents)",
                        multiplier: "Price multiplier (100 = 1×)",
                        leadMinutes: "Minimum notice (minutes)",
                        turnaroundMinutes: "Turnaround buffer (minutes)",
                        arrivalBuffer: "Default arrival buffer (minutes)",
                        active: "Active (1 = yes, 0 = no)",
                        notificationRecipients:
                          "Notification recipients (comma separated)",
                        demo: "Demo mode",
                        from_zone: "From zone ID",
                        to_zone: "To zone ID",
                        zone_id: "Zone ID",
                        type_id: "Vehicle class ID",
                      } as any
                    )[k] || k.charAt(0).toUpperCase() + k.slice(1)}
                    {typeof v === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={v}
                        onChange={(e) =>
                          setValue({ ...value, [k]: e.target.checked })
                        }
                      />
                    ) : ["privacy", "cancellation", "description"].includes(
                        k,
                      ) ? (
                      <textarea
                        rows={4}
                        value={String(v)}
                        onChange={(e) =>
                          setValue({ ...value, [k]: e.target.value })
                        }
                      />
                    ) : (
                      <input
                        required={k !== "phone"}
                        type={typeof v === "number" ? "number" : "text"}
                        value={Array.isArray(v) ? v.join(", ") : String(v)}
                        onChange={(e) =>
                          setValue({
                            ...value,
                            [k]: Array.isArray(v)
                              ? e.target.value.split(",").map((x) => x.trim())
                              : typeof v === "number"
                                ? +e.target.value
                                : e.target.value,
                          })
                        }
                      />
                    )}
                  </label>
                ))}
            </div>
            <button disabled={busy}>Save settings</button>
            <p className="field-hint">
              Prices are per vehicle per journey. Existing bookings keep their
              original quote. Route prices are bidirectional. Use inactive to
              retire a destination, extra, driver or vehicle without losing
              history.
            </p>
          </form>
        )}
      </div>
    </>
  );
}
