import { DomainEventEnvelope } from "./types";

function compareNullableStrings(left?: string | null, right?: string | null): number {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareNullableNumbers(left?: number | null, right?: number | null): number {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  return left - right;
}

export function compareEventOrder(
  left: DomainEventEnvelope,
  right: DomainEventEnvelope,
): number {
  const byEventDate = compareNullableStrings(left.event_date, right.event_date);
  if (byEventDate !== 0) {
    return byEventDate;
  }

  const byRecordedAt = compareNullableStrings(left.recorded_at, right.recorded_at);
  if (byRecordedAt !== 0) {
    return byRecordedAt;
  }

  const byCommitSequence = compareNullableNumbers(
    left.server_commit_sequence ?? null,
    right.server_commit_sequence ?? null,
  );
  if (byCommitSequence !== 0) {
    return byCommitSequence;
  }

  const byVersion = left.event_version - right.event_version;
  if (byVersion !== 0) {
    return byVersion;
  }

  return compareNullableStrings(left.event_id, right.event_id);
}
