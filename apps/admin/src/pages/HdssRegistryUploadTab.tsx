import { useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import styles from "./MastersPage.module.css";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

interface HdssUploadResult {
  imported: number;
}

export default function HdssRegistryUploadTab() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (user?.role !== "central_admin") return null;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    setSuccess("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setError("Choose a CSV file.");
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError("The CSV file must be 25 MB or smaller.");
      return;
    }
    setFile(selected);
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<HdssUploadResult>("/masters/blb-registry/upload", formData);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setSuccess(`Imported ${result.imported} people.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className={styles.tabHeader}>
        <div>
          <h2>Ballabgarh HDSS registry</h2>
          <p className={styles.uploadHelp}>
            Upload the 2026-10-14 snapshot of HDSS people. Re-imports update records by <code>hdss_unique_id</code>.
          </p>
        </div>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {success && <div className={styles.success} role="status">{success}</div>}

      <form className={styles.uploadForm} onSubmit={handleUpload}>
        <label className={styles.fileLabel} htmlFor="hdss-registry-file">
          HDSS registry CSV
          <input
            ref={inputRef}
            id="hdss-registry-file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={busy}
          />
        </label>
        <button type="submit" className={styles.primaryBtn} disabled={!file || busy}>
          {busy ? "Uploading…" : "Upload CSV"}
        </button>
      </form>

      <p className={styles.uploadHelp}>
        Field users receive this data on mobile through Sync Now, restricted to Ballabgarh villages assigned to their mapped site.
      </p>
    </section>
  );
}
