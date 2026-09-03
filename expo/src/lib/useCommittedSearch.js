import { useEffect, useState } from "react";

export const SEARCH_MIN_CHARACTERS = 3;
export const SEARCH_DEBOUNCE_MS = 300;

export function normalizeCommittedSearch(value) {
  return String(value || "").trim();
}

export function canCommitSearch(value, minimum = SEARCH_MIN_CHARACTERS) {
  const normalized = normalizeCommittedSearch(value);
  return normalized.length === 0 || normalized.length >= minimum;
}

/**
 * Keeps typing responsive while downstream list/SQLite work uses a committed
 * query only after a meaningful pause. Clearing is immediate; 1-2 characters
 * never become an active predicate.
 */
export function useCommittedSearch({
  minimum = SEARCH_MIN_CHARACTERS,
  delayMs = SEARCH_DEBOUNCE_MS,
} = {}) {
  const [input, setInput] = useState("");
  const [committed, setCommitted] = useState("");
  const normalized = normalizeCommittedSearch(input);

  useEffect(() => {
    if (!normalized || normalized.length < minimum) {
      setCommitted("");
      return undefined;
    }
    const timer = setTimeout(() => setCommitted(normalized), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, minimum, normalized]);

  return {
    input,
    setInput,
    committed,
    awaitingMinimum: normalized.length > 0 && normalized.length < minimum,
  };
}
