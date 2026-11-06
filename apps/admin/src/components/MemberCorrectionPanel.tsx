import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "../pages/HouseholdMemberCorrection.module.css";

interface CorrectionField {
  key: string;
  label: string;
  type: "number" | "choice";
  options?: { value: number; label: string }[];
  min?: number;
  max?: number;
  editable: boolean;
}
interface CorrectionContext {
  member_id: string;
  household_id: string;
  name: string | null;
  current: Record<string, number | null>;
  source_response_id: string | null;
  fields: CorrectionField[];
}
interface CorrectionPreview {
  preview_token: string;
  changes: { field: string; label: string; old_value: number | null; new_value: number }[];
  tasks_to_create: { form_code: string; target_date: string }[];
  tasks_to_withdraw: { task_id: string; form_code: string }[];
  warnings: string[];
  can_apply: boolean;
}
const formLabel = (code: string) => code === "WQ" ? "BWQ" : code === "HHQ" ? "BHQ" : code;

export default function MemberCorrectionPanel({ member, onCancel, onSaved, onBusyChange }: {
  member: { household_member_id: string; household_id: string; name?: string };
  onCancel: () => void;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [context, setContext] = useState<CorrectionContext | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const path = `/members/${encodeURIComponent(member.household_member_id)}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setContext(null);
    api.get<CorrectionContext>(`${path}/correction-context`)
      .then((result) => { if (!cancelled) setContext(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load correction details."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, revision]);

  const changes = Object.fromEntries(Object.entries(values)
    .filter(([key, value]) => value !== "" && Number(value) !== context?.current[key])
    .map(([key, value]) => [key, Number(value)]));
  const labelValue = (field: string, value: number | null) => context?.fields.find((item) => item.key === field)?.options?.find((item) => item.value === value)?.label ?? (value === null ? "Not recorded" : String(value));
  function invalidatePreview() { setPreview(null); setVerified(false); setError(""); }

  async function requestPreview(event: React.FormEvent) {
    event.preventDefault();
    if (!context || busy || !reason.trim() || !Object.keys(changes).length) return;
    setBusy(true); onBusyChange(true); setError(""); setPreview(null); setVerified(false);
    try { setPreview(await api.post<CorrectionPreview>(`${path}/correction-preview`, { changes, reason: reason.trim() })); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not preview these corrections."); }
    finally { setBusy(false); onBusyChange(false); }
  }

  async function applyCorrection() {
    if (!preview?.can_apply || !verified || busy) return;
    if (!window.confirm(`Apply these verified corrections for ${member.name || "this member"} (${member.household_member_id})? Original submissions and completed forms will be preserved.`)) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const result = await api.post<{ message: string; created_tasks: number; withdrawn_tasks: number }>(`${path}/corrections`, { changes, reason: reason.trim(), preview_token: preview.preview_token });
      onSaved(`${result.message} Ask the assigned field worker to sync the app.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the corrections. Preview again before retrying.");
      setPreview(null); setVerified(false);
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <section className={styles.panel} aria-labelledby="member-correction-title">
    <h2 id="member-correction-title">Correct member details and review task impact</h2>
    <p><strong>{member.name || member.household_member_id}</strong> · Member {member.household_member_id} · Household {member.household_id}</p>
    <p>Leave fields unchanged unless an entry was a verified mistake. Original submissions and completed work are preserved. A pregnancy correction applies to the saved BWQ interview; a newly detected pregnancy follows the usual field workflow.</p>
    {loading ? <p role="status">Loading current details…</p> : context && <form onSubmit={requestPreview}>
      <div className={styles.fieldGrid}>{context.fields.map((field) => <label key={field.key}>
        {field.label}<span className={styles.current}>Current: {labelValue(field.key, context.current[field.key])}</span>
        {field.type === "number" ? <input aria-label={field.label} type="number" min={field.min} max={field.max} step="1" placeholder="Leave unchanged" disabled={busy || !field.editable} value={values[field.key] ?? ""} onChange={(event) => { setValues((old) => ({ ...old, [field.key]: event.target.value })); invalidatePreview(); }} />
          : <select aria-label={field.label} disabled={busy || !field.editable} value={values[field.key] ?? ""} onChange={(event) => { setValues((old) => ({ ...old, [field.key]: event.target.value })); invalidatePreview(); }}><option value="">Leave unchanged</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
        {!field.editable && <span className={styles.current}>Available after an accepted BWQ interview.</span>}
      </label>)}</div>
      <label htmlFor="member-correction-reason">Reason and verification details</label>
      <textarea id="member-correction-reason" value={reason} required maxLength={1000} disabled={busy} onChange={(event) => { setReason(event.target.value); invalidatePreview(); }} />
      <div className={styles.actions}><button className={styles.save} type="submit" disabled={busy || !reason.trim() || !Object.keys(changes).length}>{busy ? "Checking…" : "Preview changes and tasks"}</button></div>
      {preview && <div className={styles.impact} aria-label="Correction impact preview">
        <h3>Review before saving</h3>
        {preview.changes.map((change) => <p key={change.field}><strong>{change.label}</strong>: {labelValue(change.field, change.old_value)} → {labelValue(change.field, change.new_value)}</p>)}
        <p>{preview.tasks_to_create.length} tasks to create · {preview.tasks_to_withdraw.length} unfinished tasks to withdraw</p>
        {!!preview.tasks_to_create.length && <details><summary>Tasks to create</summary>{preview.tasks_to_create.map((task, index) => <p key={index}>{formLabel(task.form_code)} · Target date {task.target_date}</p>)}</details>}
        {!!preview.tasks_to_withdraw.length && <details><summary>Unfinished tasks to withdraw</summary>{preview.tasks_to_withdraw.map((task) => <p key={task.task_id}>{formLabel(task.form_code)} · {task.task_id}</p>)}</details>}
        {preview.warnings.map((warning, index) => <p key={index} className={styles.warning}>{warning}</p>)}
        {preview.can_apply && <><label className={styles.confirm}><input type="checkbox" checked={verified} disabled={busy} onChange={(event) => setVerified(event.target.checked)} />I verified the corrected details and reviewed the task impact.</label><button type="button" className={styles.save} disabled={busy || !verified} onClick={applyCorrection}>{busy ? "Saving…" : "Confirm corrections"}</button></>}
      </div>}
    </form>}
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    {!loading && !context && <button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Reload correction details</button>}
    <div className={styles.actions}><button type="button" disabled={busy} onClick={onCancel}>Cancel correction</button></div>
  </section>;
}
