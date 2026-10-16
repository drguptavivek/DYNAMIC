type ApiErrorIssue = {
  path?: Array<string | number>;
  message?: string;
};

type HdssIssue = {
  line?: unknown;
  code?: unknown;
  column?: unknown;
};

function formatHdssIssue(issue: HdssIssue): string | null {
  if (typeof issue.line !== "number" || !Number.isInteger(issue.line) || issue.line < 1) return null;
  if (typeof issue.code !== "string" || !issue.code) return null;
  const line = `line ${issue.line}`;
  const column = typeof issue.column === "string" && issue.column ? `, column ${issue.column}` : "";
  const code = issue.code.replace(/_/g, " ");
  return `${line}${column}: ${code}`;
}

export function formatApiError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;

  const error = (json as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;

  const message = (error as { message?: unknown }).message;
  const details = (error as { details?: unknown }).details;
  if (details && typeof details === "object") {
    const issues = (details as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const formatted = issues
        .slice(0, 3)
        .map((issue) => (issue && typeof issue === "object" ? formatHdssIssue(issue as HdssIssue) : null))
        .filter((issue): issue is string => Boolean(issue));
      if (formatted.length > 0) {
        const summary = issues.length > 3
          ? `; ${issues.length} issues total`
          : "";
        const issueMessage = formatted.join("; ") + summary;
        return typeof message === "string" && message ? `${message}: ${issueMessage}` : issueMessage;
      }
    }
  }

  const errors = details && typeof details === "object"
    ? (details as { errors?: unknown }).errors
    : undefined;

  if (Array.isArray(errors) && errors.length > 0) {
    const formatted = errors
      .map((issue: ApiErrorIssue | unknown) => {
        if (!issue || typeof issue !== "object") return undefined;
        const candidate = issue as ApiErrorIssue;
        const path = Array.isArray(candidate.path) && candidate.path.every(
          (part) => typeof part === "string" || typeof part === "number",
        )
          ? candidate.path.join(".")
          : "";
        const issueMessage = typeof candidate.message === "string" ? candidate.message : "";
        return path && issueMessage ? `${path}: ${issueMessage}` : issueMessage || undefined;
      })
      .filter(Boolean);

    if (formatted.length > 0) return formatted.slice(0, 3).join("; ");
  }

  return typeof message === "string" && message ? message : fallback;
}
