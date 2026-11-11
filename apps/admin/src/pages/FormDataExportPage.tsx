import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type FormMetadata = { form_code: string; title: string; version: string; question_count?: number };
type ExportSubmitter = { user_id: string; username: string | null; display_name: string | null };

export default function FormDataExportPage() {
  const [forms, setForms] = useState<FormMetadata[]>([]);
  const [formCode, setFormCode] = useState("");
  const [valueFormat, setValueFormat] = useState<"coded" | "labels">("coded");
  const [privacy, setPrivacy] = useState<"pis" | "non_pis">("pis");
  const [submitterId, setSubmitterId] = useState("");
  const [period, setPeriod] = useState<"all" | "date" | "range">("all");
  const [exportDate, setExportDate] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [submitters, setSubmitters] = useState<{ formCode: string; users: ExportSubmitter[]; loading: boolean; error: string }>({ formCode: "", users: [], loading: false, error: "" });
  const submittersRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"form" | "members" | null>(null);
  const exportingRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ forms: FormMetadata[] }>("/protocol/forms")
      .then((result) => { setForms(result.forms); setFormCode(result.forms[0]?.form_code || ""); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load forms"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!formCode) return;
    const request = ++submittersRequest.current;
    setSubmitters({ formCode, users: [], loading: true, error: "" });
    api.get<ExportSubmitter[]>(`/form-responses/export-submitters?form_code=${encodeURIComponent(formCode)}`)
      .then((users) => {
        if (request === submittersRequest.current) setSubmitters({ formCode, users, loading: false, error: "" });
      })
      .catch((err) => {
        if (request === submittersRequest.current) setSubmitters({ formCode, users: [], loading: false, error: err instanceof Error ? err.message : "Failed to load submitting users" });
      });
    return () => { submittersRequest.current++; };
  }, [formCode]);

  const submittersReady = submitters.formCode === formCode && !submitters.loading;
  const validSubmitter = !submitterId || (submittersReady && submitters.users.some((user) => user.user_id === submitterId));
  const isValidDate = (value: string) => /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const validRange = isValidDate(dateFrom) && isValidDate(dateTo) && dateFrom <= dateTo;
  const exportDisabled = !formCode || loading || exporting !== null || !submittersReady || !validSubmitter || (period === "date" && !isValidDate(exportDate)) || (period === "range" && !validRange);

  async function exportForm(kind: "form" | "members" = "form") {
    const requestedFormCode = formCode;
    const requestedValueFormat = valueFormat;
    const requestedPrivacy = privacy;
    const requestedSubmitterId = submitterId;
    const requestedDate = period === "date" ? exportDate : "";
    const requestedFrom = period === "range" ? dateFrom : "";
    const requestedTo = period === "range" ? dateTo : "";
    if (exportDisabled || exportingRef.current || (kind === "members" && requestedFormCode !== "HHQ")) return;
    exportingRef.current = true;
    setExporting(kind);
    setError("");
    try {
      const blob = await api.download(`/form-responses/export?form_code=${encodeURIComponent(requestedFormCode)}${kind === "members" ? "&export_type=members" : ""}${requestedValueFormat === "labels" ? "&value_format=labels" : ""}${requestedPrivacy === "non_pis" ? "&privacy=non_pis" : ""}${requestedSubmitterId ? `&submitted_by_user_id=${encodeURIComponent(requestedSubmitterId)}` : ""}${requestedDate ? `&date=${encodeURIComponent(requestedDate)}` : ""}${requestedFrom ? `&date_from=${encodeURIComponent(requestedFrom)}&date_to=${encodeURIComponent(requestedTo)}` : ""}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filename = requestedFormCode === "HHQ"
        ? (kind === "members" ? "bhq-members" : "bhq-form-responses")
        : `${requestedFormCode.toLowerCase()}-form-responses`;
      link.download = `${filename}${requestedPrivacy === "non_pis" ? "-non-pis" : ""}${requestedValueFormat === "labels" ? "-uncoded" : ""}${requestedDate ? `-${requestedDate}` : ""}${requestedFrom ? `-${requestedFrom}-to-${requestedTo}` : ""}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      exportingRef.current = false;
      setExporting(null);
    }
  }

  const selected = forms.find((form) => form.form_code === formCode);
  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <h1>Form Data Export</h1>
      <p>Export submitted answers by form. Column headers match the Form Language Management variable names. Choose stored option codes or readable option text below.</p>
      {error && <div style={{ color: "#a11", background: "#fee", padding: 12, marginBottom: 16 }}>{error}</div>}
      <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap", padding: 20, border: "1px solid #d9e0ea", borderRadius: 8 }}>
        <label style={{ display: "grid", gap: 8, flex: "1 1 320px", minWidth: 0 }}>
          Form
          <select value={formCode} onChange={(event) => { setFormCode(event.target.value); setSubmitterId(""); }} disabled={loading || exporting !== null} style={{ padding: 10 }}>
            {forms.map((form) => <option key={form.form_code} value={form.form_code}>{form.form_code === "HHQ" ? "BHQ" : form.form_code} - {form.title}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          Answer format
          <select value={valueFormat} onChange={(event) => setValueFormat(event.target.value as "coded" | "labels")} disabled={loading || exporting !== null} style={{ padding: 10 }}>
            <option value="coded">Coded data</option>
            <option value="labels">Uncoded data (option text)</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          Privacy
          <select value={privacy} onChange={(event) => setPrivacy(event.target.value as "pis" | "non_pis")} disabled={loading || exporting !== null} style={{ padding: 10 }}>
            <option value="pis">PIS data</option>
            <option value="non_pis">Non-PIS data (masked)</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 8, minWidth: 220 }}>
          Submitted by
          <select value={submitterId} onChange={(event) => setSubmitterId(event.target.value)} disabled={loading || exporting !== null || !submittersReady || !!submitters.error} style={{ padding: 10 }}>
            <option value="">All users</option>
            {submitters.formCode === formCode && submitters.users.map((user) => <option key={user.user_id} value={user.user_id}>{user.display_name || user.username || user.user_id}{user.display_name && user.username && user.display_name !== user.username ? ` (${user.username})` : ""}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          Export period
          <select value={period} onChange={(event) => setPeriod(event.target.value as "all" | "date" | "range")} disabled={loading || exporting !== null} style={{ padding: 10 }}>
            <option value="all">All data</option>
            <option value="date">Date wise</option>
            <option value="range">Date range</option>
          </select>
        </label>
        {period === "date" && <label style={{ display: "grid", gap: 8 }}>
          Submission date (IST)
          <input type="date" aria-label="Submission date (IST)" required value={exportDate} onChange={(event) => setExportDate(event.target.value)} disabled={loading || exporting !== null} style={{ padding: 10, minWidth: 0, maxWidth: "100%" }} />
        </label>}
        {period === "range" && <label style={{ display: "grid", gap: 8 }}>
          From date (IST)
          <input type="date" aria-label="From date (IST)" required value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} disabled={loading || exporting !== null} style={{ padding: 10, minWidth: 0, maxWidth: "100%" }} />
        </label>}
        {period === "range" && <label style={{ display: "grid", gap: 8 }}>
          To date (IST)
          <input type="date" aria-label="To date (IST)" required value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} disabled={loading || exporting !== null} style={{ padding: 10, minWidth: 0, maxWidth: "100%" }} />
        </label>}
        <button type="button" onClick={() => exportForm()} disabled={exportDisabled} style={{ padding: "11px 20px", fontWeight: 700 }}>
          {exporting === "form" ? "Preparing export..." : formCode === "HHQ" ? "BHQ" : "Export CSV"}
        </button>
        {formCode === "HHQ" && <button type="button" onClick={() => exportForm("members")} disabled={exportDisabled} style={{ padding: "11px 20px", fontWeight: 700 }}>
          {exporting === "members" ? "Preparing members..." : "BHQ Members"}
        </button>}
      </div>
      {submitters.formCode === formCode && submitters.loading && <p role="status">Loading submitting users...</p>}
      {submitters.formCode === formCode && submitters.error && <p role="alert" style={{ color: "#a11" }}>Submitting users could not be loaded: {submitters.error}. All users export remains available.</p>}
      {formCode === "HHQ" && <p>The BHQ member list contains names only. BHQ Members downloads one row per member with their household ID and recorded member details, using the selected privacy and answer format. Both downloads are Excel-compatible CSV files.</p>}
      <p style={{ color: "#59677d" }}>Coded data keeps stored option codes. Uncoded data uses the questionnaire's English option text; unknown values keep their stored codes.</p>
      <p style={{ color: "#59677d" }}>All data exports every date. Date wise selects one day; Date range includes both From and To dates. Both use the recorded submission date in IST, including forms filled offline and synced later. If that timestamp is unavailable, the server receipt date is used. The same date filter applies to BHQ Members.</p>
      <p style={{ color: "#59677d" }}>PIS data includes recorded personal information. Non-PIS data masks personal information and keeps household IDs for linking records. Submitted by lists users with submitted responses visible to your access scope.</p>
      {selected && <p style={{ color: "#59677d" }}>Latest definition: {selected.version}{selected.question_count ? ` · ${selected.question_count} questions` : ""}. The export includes submitted responses matching your selected filters and current access scope.</p>}
    </div>
  );
}
