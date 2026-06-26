import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./DataQualityPage.module.css";

interface DataQualityFlag {
  flag_id: string;
  flag_type: string;
  subject_type: string;
  subject_id: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "reviewed" | "resolved";
  created_at: string;
  review_note?: string;
}

const FLAG_TYPES = [
  "missing_data",
  "inconsistent_data",
  "logic_error",
  "duplicate",
  "validation_error",
];
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["open", "reviewed", "resolved"] as const;

export default function DataQualityPage() {
  const [flags, setFlags] = useState<DataQualityFlag[]>([]);
  const [flagTypeFilter, setFlagTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedFlag, setSelectedFlag] = useState<DataQualityFlag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadFlags() {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.getPage<DataQualityFlag[]>("/data-quality-flags");
        if (!cancelled) {
          setFlags(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data quality flags");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFlags();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReviewFlag(note: string) {
    if (!selectedFlag) return;
    setLoading(true);
    setError("");
    try {
      await api.patch(`/data-quality-flags/${selectedFlag.flag_id}`, {
        status: "reviewed",
        review_note: note,
      });
      setFlags((prev) =>
        prev.map((f) =>
          f.flag_id === selectedFlag.flag_id ? { ...f, status: "reviewed", review_note: note } : f,
        ),
      );
      setSelectedFlag(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update flag");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveFlag(note: string) {
    if (!selectedFlag) return;
    setLoading(true);
    setError("");
    try {
      await api.patch(`/data-quality-flags/${selectedFlag.flag_id}`, {
        status: "resolved",
        review_note: note,
      });
      setFlags((prev) =>
        prev.map((f) =>
          f.flag_id === selectedFlag.flag_id ? { ...f, status: "resolved", review_note: note } : f,
        ),
      );
      setSelectedFlag(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update flag");
    } finally {
      setLoading(false);
    }
  }

  const filtered = flags.filter((flag) => {
    if (flagTypeFilter && flag.flag_type !== flagTypeFilter) return false;
    if (severityFilter && flag.severity !== severityFilter) return false;
    if (statusFilter && flag.status !== statusFilter) return false;
    return true;
  });

  const getSeverityClass = (severity: string) =>
    `${styles.badge} ${styles[`severity_${severity}`]}`;
  const getStatusClass = (status: string) => `${styles.badge} ${styles[`flagStatus_${status}`]}`;

  return (
    <div className={styles.container}>
      <h1>Data Quality Flags</h1>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filters}>
        <select
          value={flagTypeFilter}
          onChange={(e) => setFlagTypeFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Flag Types</option>
          {FLAG_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Severities</option>
          {SEVERITIES.map((sev) => (
            <option key={sev} value={sev}>
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loading && flags.length === 0 ? (
        <div className={styles.empty}>Loading data quality flags...</div>
      ) : flags.length === 0 ? (
        <div className={styles.empty}>No data quality flags found</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Flag ID</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((flag) => (
                <tr key={flag.flag_id}>
                  <td className={styles.flagId}>{flag.flag_id.substring(0, 8)}...</td>
                  <td>{flag.flag_type.replace(/_/g, " ")}</td>
                  <td>
                    {flag.subject_type}: {flag.subject_id}
                  </td>
                  <td>
                    <span className={getSeverityClass(flag.severity)}>{flag.severity}</span>
                  </td>
                  <td>
                    <span className={getStatusClass(flag.status)}>{flag.status}</span>
                  </td>
                  <td>{new Date(flag.created_at).toLocaleDateString()}</td>
                  <td>
                    <button onClick={() => setSelectedFlag(flag)} className={styles.actionBtn}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedFlag && (
        <FlagReviewModal
          flag={selectedFlag}
          loading={loading}
          onReview={handleReviewFlag}
          onResolve={handleResolveFlag}
          onClose={() => setSelectedFlag(null)}
        />
      )}
    </div>
  );
}

function FlagReviewModal({
  flag,
  loading,
  onReview,
  onResolve,
  onClose,
}: {
  flag: DataQualityFlag;
  loading: boolean;
  onReview: (note: string) => Promise<void>;
  onResolve: (note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(flag.review_note || "");
  const [error, setError] = useState("");

  async function handleReviewClick() {
    setError("");
    try {
      await onReview(note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleResolveClick() {
    setError("");
    try {
      await onResolve(note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Review Flag: {flag.flag_id}</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.section}>
            <h3>Flag Details</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <label>Type</label>
                <span>{flag.flag_type.replace(/_/g, " ")}</span>
              </div>
              <div className={styles.infoItem}>
                <label>Severity</label>
                <span>{flag.severity}</span>
              </div>
              <div className={styles.infoItem}>
                <label>Status</label>
                <span>{flag.status}</span>
              </div>
              <div className={styles.infoItem}>
                <label>Subject</label>
                <span>
                  {flag.subject_type}: {flag.subject_id}
                </span>
              </div>
              <div className={styles.infoItem}>
                <label>Created</label>
                <span>{new Date(flag.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3>Review Note</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter your review notes here..."
              className={styles.textarea}
              rows={4}
              disabled={loading}
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.secondaryBtn} disabled={loading}>
            Cancel
          </button>
          {flag.status !== "resolved" && (
            <>
              <button onClick={handleReviewClick} className={styles.warningBtn} disabled={loading}>
                {loading ? "Updating..." : "Mark Reviewed"}
              </button>
              <button onClick={handleResolveClick} className={styles.primaryBtn} disabled={loading}>
                {loading ? "Updating..." : "Mark Resolved"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
