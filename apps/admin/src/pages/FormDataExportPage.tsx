import { useEffect, useState } from "react";
import { api } from "../lib/api";

type FormMetadata = { form_code: string; title: string; version: string; question_count?: number };

export default function FormDataExportPage() {
  const [forms, setForms] = useState<FormMetadata[]>([]);
  const [formCode, setFormCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ forms: FormMetadata[] }>("/protocol/forms")
      .then((result) => { setForms(result.forms); setFormCode(result.forms[0]?.form_code || ""); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load forms"))
      .finally(() => setLoading(false));
  }, []);

  async function exportForm() {
    if (!formCode) return;
    setExporting(true);
    setError("");
    try {
      const blob = await api.download(`/form-responses/export?form_code=${encodeURIComponent(formCode)}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${formCode.toLowerCase()}-form-responses.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const selected = forms.find((form) => form.form_code === formCode);
  return (
    <div style={{ maxWidth: 1000 }}>
      <h1>Form Data Export</h1>
      <p>Export submitted answers by form. Column headers match the Form Language Management variable names and option values remain the exact codes stored in the database.</p>
      {error && <div style={{ color: "#a11", background: "#fee", padding: 12, marginBottom: 16 }}>{error}</div>}
      <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap", padding: 20, border: "1px solid #d9e0ea", borderRadius: 8 }}>
        <label style={{ display: "grid", gap: 8, minWidth: 320 }}>
          Form
          <select value={formCode} onChange={(event) => setFormCode(event.target.value)} disabled={loading || exporting} style={{ padding: 10 }}>
            {forms.map((form) => <option key={form.form_code} value={form.form_code}>{form.form_code} - {form.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={exportForm} disabled={!formCode || loading || exporting} style={{ padding: "11px 20px", fontWeight: 700 }}>
          {exporting ? "Preparing export..." : "Export CSV"}
        </button>
      </div>
      {selected && <p style={{ color: "#59677d" }}>Latest definition: {selected.version}{selected.question_count ? ` · ${selected.question_count} questions` : ""}. The export includes all submitted responses visible to your current access scope.</p>}
    </div>
  );
}
