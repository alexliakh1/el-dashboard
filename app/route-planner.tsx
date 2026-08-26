"use client";

import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useState } from "react";

type AddressSuggestion = {
  id: string;
  label: string;
  secondary: string;
  value: string;
};

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

function formatTrafficDelay(seconds: number) {
  if (seconds > 0 && seconds < 60) {
    return "<1 min";
  }
  return `${Math.round(seconds / 60)} min`;
}

type AddressFieldProps = {
  dotClass: "start-dot" | "end-dot";
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

function AddressField({ dotClass, label, onChange, placeholder, value }: AddressFieldProps) {
  let inputId = useId();
  let listId = `${inputId}-suggestions`;
  let [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  let [isSearching, setIsSearching] = useState(false);
  let [isOpen, setIsOpen] = useState(false);
  let [activeIndex, setActiveIndex] = useState(-1);

  useEffect(
    function () {
      let query = value.trim();
      if (query.length < 3) {
        setSuggestions([]);
        setIsOpen(false);
        setIsSearching(false);
        return;
      }

      let controller = new AbortController();
      let timer = window.setTimeout(function () {
        setIsSearching(true);
        fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
          .then(function (response) {
            if (!response.ok) {
              throw new Error("Address search failed");
            }
            return response.json();
          })
          .then(function (data) {
            setSuggestions(data.suggestions || []);
            setActiveIndex(-1);
            setIsOpen(true);
          })
          .catch(function (error) {
            if (error.name !== "AbortError") {
              setSuggestions([]);
              setIsOpen(false);
            }
          })
          .finally(function () {
            setIsSearching(false);
          });
      }, 250);

      return function () {
        window.clearTimeout(timer);
        controller.abort();
      };
    },
    [value],
  );

  function chooseSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.value);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(function (current) {
        return current >= suggestions.length - 1 ? 0 : current + 1;
      });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(function (current) {
        return current <= 0 ? suggestions.length - 1 : current - 1;
      });
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="address-field">
      <label className="field-label" htmlFor={inputId}>
        <span className={`route-dot ${dotClass}`} aria-hidden="true" />
        {label}
      </label>
      <div className="autocomplete-shell">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={function (event) {
            onChange(event.target.value);
          }}
          onFocus={function () {
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onBlur={function () {
            window.setTimeout(function () {
              setIsOpen(false);
              setActiveIndex(-1);
            }, 120);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          required
        />
        {isSearching && <span className="searching-indicator">Searching…</span>}
        {isOpen && suggestions.length > 0 && (
          <ul className="suggestions" id={listId} role="listbox">
            {suggestions.map(function (suggestion, index) {
              return (
                <li
                  id={`${listId}-${index}`}
                  key={suggestion.id}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "is-active" : ""}
                  onMouseDown={function (event) {
                    event.preventDefault();
                    chooseSuggestion(suggestion);
                  }}
                >
                  <span className="suggestion-pin" aria-hidden="true" />
                  <span>
                    <strong>{suggestion.label}</strong>
                    {suggestion.secondary && <small>{suggestion.secondary}</small>}
                  </span>
                </li>
              );
            })}
            <li className="suggestions-credit" aria-hidden="true">
              Powered by TomTom
            </li>
          </ul>
        )}
      </div>
    </div>
  );
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
              <AddressField
                dotClass="start-dot"
                label="Start location"
                value={start}
                onChange={setStart}
                placeholder="123 Main St, Los Gatos"
              />

              <div className="route-connector" aria-hidden="true" />

              <AddressField
                dotClass="end-dot"
                label="Destination"
                value={end}
                onChange={setEnd}
                placeholder="School, office, or address"
              />
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
                <div><small>Expected traffic</small><strong>{formatTrafficDelay(result.trafficDelayInSeconds)}</strong></div>
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
