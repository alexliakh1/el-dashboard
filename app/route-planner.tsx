"use client";

import { FormEvent, useMemo, useState } from "react";

type RouteResult = {
  arrivalTime: string;
  departureTime: string;
  distanceMeters: number;
  endLabel: string;
  startLabel: string;
  trafficDelayInSeconds: number;
  travelTimeInSeconds: number;
};

function toLocalInputValue(date: Date) {
  let offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function RoutePlanner() {
  let defaultArrival = useMemo(function () {
    let next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(8, 30, 0, 0);
    return toLocalInputValue(next);
  }, []);
  let [start, setStart] = useState("");
  let [end, setEnd] = useState("");
  let [arriveAt, setArriveAt] = useState(defaultArrival);
  let [result, setResult] = useState<RouteResult | null>(null);
  let [error, setError] = useState("");
  let [isLoading, setIsLoading] = useState(false);

  async function calculateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setIsLoading(true);

    try {
      let response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: start.trim(),
          end: end.trim(),
          arriveAt: new Date(arriveAt).toISOString(),
        }),
      });
      let data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "We couldn’t calculate that route.");
      }

      setResult(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn’t calculate that route.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Leave by home">
          <span className="brand-mark" aria-hidden="true">LB</span>
          <span>Leave by</span>
        </a>
        <span className="live-pill">
          <span aria-hidden="true" /> Traffic-aware routing
        </span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">TomTom route planner</p>
          <h1>Know when to leave.<br />Arrive right on time.</h1>
          <p className="intro">
            Enter where you’re going and when you need to be there. We’ll work
            backward through expected traffic and give you a leave-by time.
          </p>
        </div>

        <div className="planner-card">
          <form onSubmit={calculateRoute}>
            <div className="route-fields">
              <label>
                <span className="field-label">
                  <span className="route-dot start-dot" aria-hidden="true" />
                  Start location
                </span>
                <input
                  type="text"
                  value={start}
                  onChange={function (event) { setStart(event.target.value); }}
                  placeholder="123 Main St, Los Gatos"
                  autoComplete="street-address"
                  required
                />
              </label>

              <div className="route-connector" aria-hidden="true" />

              <label>
                <span className="field-label">
                  <span className="route-dot end-dot" aria-hidden="true" />
                  Destination
                </span>
                <input
                  type="text"
                  value={end}
                  onChange={function (event) { setEnd(event.target.value); }}
                  placeholder="School, office, or address"
                  autoComplete="off"
                  required
                />
              </label>
            </div>

            <label className="arrival-field">
              <span className="field-label">Arrive by</span>
              <input
                type="datetime-local"
                value={arriveAt}
                min={toLocalInputValue(new Date())}
                onChange={function (event) { setArriveAt(event.target.value); }}
                required
              />
            </label>

            <button type="submit" disabled={isLoading}>
              {isLoading ? "Checking traffic…" : "Calculate leave time"}
              {!isLoading && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <div className="trust-row">
            <span>Live + historical traffic</span>
            <span>Fastest driving route</span>
            <span>Powered by TomTom</span>
          </div>
        </div>
      </section>

      <section className="result-zone" aria-live="polite">
        {!result && !error && (
          <div className="result-placeholder">
            <span className="placeholder-icon" aria-hidden="true">↗</span>
            <div>
              <p>Your leave-by time will appear here</p>
              <span>Plan tomorrow morning, school pickup, or your next meeting.</span>
            </div>
          </div>
        )}

        {error && (
          <div className="error-card" role="alert">
            <strong>Route not found</strong>
            <span>{error}</span>
          </div>
        )}

        {result && (
          <article className="result-card">
            <div className="result-summary">
              <p className="eyebrow">Your leave-by time</p>
              <p className="leave-time">{formatTime(result.departureTime)}</p>
              <p className="leave-date">{formatDate(result.departureTime)}</p>
            </div>
            <div className="trip-details">
              <div className="detail-route">
                <span className="route-dot start-dot" aria-hidden="true" />
                <div><small>From</small><p>{result.startLabel}</p></div>
              </div>
              <div className="detail-line" aria-hidden="true" />
              <div className="detail-route">
                <span className="route-dot end-dot" aria-hidden="true" />
                <div><small>To</small><p>{result.endLabel}</p></div>
              </div>
              <div className="metrics">
                <div><small>Drive time</small><strong>{Math.round(result.travelTimeInSeconds / 60)} min</strong></div>
                <div><small>Distance</small><strong>{(result.distanceMeters / 1609.344).toFixed(1)} mi</strong></div>
                <div><small>Traffic delay</small><strong>{Math.round(result.trafficDelayInSeconds / 60)} min</strong></div>
                <div><small>Arrive</small><strong>{formatTime(result.arrivalTime)}</strong></div>
              </div>
            </div>
          </article>
        )}
      </section>

      <footer>
        <span>Leave by</span>
        <span>Traffic estimates can change. Leave a little buffer for important trips.</span>
      </footer>
    </main>
  );
}
