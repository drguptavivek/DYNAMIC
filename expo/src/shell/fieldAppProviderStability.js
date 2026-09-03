/**
 * Return true when a clock-guard update carries the same user-visible state.
 *
 * Clock evaluations create a fresh object even when the result is unchanged;
 * comparing only the fields consumed by the provider avoids an unnecessary
 * context-value update while retaining the latest object when any field moves.
 */
export function areClockGuardValuesEqual(previous, next) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return (
    previous.status === next.status &&
    previous.message === next.message &&
    previous.skewMs === next.skewMs
  );
}

export function stabilizeClockGuard(previous, next) {
  return areClockGuardValuesEqual(previous, next) ? previous : next;
}
