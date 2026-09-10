"use client";
import { KeyboardEvent, useEffect, useId, useState } from 'react';
import { apiFetch } from './api-client';
type AddressSuggestion = { id: string; label: string; secondary: string; value: string };
type AddressFieldProps = {
  dotClass: "start-dot" | "end-dot";
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

export function AddressField({ dotClass, label, onChange, placeholder, value }: AddressFieldProps) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(
    function () {
      const query = searchQuery.trim();
      if (query.length < 3) {
        const reset = window.setTimeout(() => {
          setSuggestions([]); setIsOpen(false); setIsSearching(false);
        }, 0);
        return () => window.clearTimeout(reset);
      }

      const controller = new AbortController();
      const timer = window.setTimeout(function () {
        setIsSearching(true);
        apiFetch(`/api/search?q=${encodeURIComponent(query)}`, {
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
    [searchQuery],
  );

  function chooseSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.value);
    setSearchQuery('');
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
            setSearchQuery(event.target.value);
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


