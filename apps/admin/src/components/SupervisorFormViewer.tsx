import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import styles from "./SupervisorFormViewer.module.css";

type PreviewAnswer = { name: string; title: string; value?: string };
type PreviewQuestion = PreviewAnswer & { type?: string; panelRows?: { index: number; questions: PreviewAnswer[] }[] };
type SavedImage = { attachment_id: string; question_name: string; display_name: string; report_sequence: number; image_sequence: number; ultrasound_date: string | null; mime_type: string };
type ImageState = { url?: string; error?: string };
type SavedForm = {
  form_response_id: string;
  form_code: string;
  form_version: string;
  definition_version?: string;
  definition_note?: string;
  subject_id: string;
  submitted_at: string;
  submitted_by_user_id: string;
  language_code: string;
  title: string;
  attachments?: SavedImage[];
  preview: { name: string; title: string; questions: PreviewQuestion[] }[];
};
type HouseholdForms = { household_id: string; forms: SavedForm[] };
type Props = {
  householdId: string;
  userId: string;
  period: "all" | "today" | "date" | "range";
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  siteId?: number;
  localityCode?: string;
  onClose: () => void;
};

const formCode = (code: string) => code === "HHQ" ? "BHQ" : code === "WQ" ? "BWQ" : code;
const submittedDate = (date: string) => {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? date : value.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
};

export default function SupervisorFormViewer({ householdId, userId, period, date, dateFrom, dateTo, siteId, localityCode, onClose }: Props) {
  const [data, setData] = useState<HouseholdForms | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loadedQuery, setLoadedQuery] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [imageRevision, setImageRevision] = useState(0);
  const [imageState, setImageState] = useState<{ key: string; images: Record<string, ImageState> }>({ key: "", images: {} });
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  const query = new URLSearchParams({ household_id: householdId, user_id: userId, period });
  if (siteId != null) query.set("site_id", String(siteId));
  if (localityCode) query.set("locality_code", localityCode);
  if (period === "date" && date) query.set("date", date);
  if (period === "range") {
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
  }
  const queryString = query.toString();
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(""); setSelectedId("");
    api.get<HouseholdForms>(`/dashboard/household-forms?${queryString}`).then((result) => {
      if (cancelled) return;
      if (result.household_id !== householdId) { setError("The household could not be verified. Please try again."); return; }
      setLoadedQuery(queryString); setData(result);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load saved forms."); });
    return () => { cancelled = true; };
  }, [householdId, queryString, revision]);

  const form = loadedQuery === queryString ? data?.forms.find((entry) => entry.form_response_id === selectedId) || data?.forms[0] : undefined;
  const imageKey = `${queryString}:${form?.form_response_id || ""}`;
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setImageState({ key: imageKey, images: {} });
    for (const attachment of form?.attachments || []) {
      api.download(`/dashboard/household-forms/attachments/${encodeURIComponent(attachment.attachment_id)}?${queryString}`).then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        setImageState((state) => ({ key: imageKey, images: { ...state.images, [attachment.attachment_id]: { url } } }));
      }).catch((reason) => {
        if (!cancelled) setImageState((state) => ({ key: imageKey, images: { ...state.images, [attachment.attachment_id]: { error: reason instanceof Error ? reason.message : "Could not load this image." } } }));
      });
    }
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [form, imageKey, queryString, imageRevision]);
  const questionNames = new Set(form?.preview.flatMap((section) => section.questions.map((question) => question.name)));
  function images(attachments: SavedImage[]) {
    return attachments.length ? <div className={styles.images}>{attachments.map((attachment) => {
      const state = imageState.key === imageKey ? imageState.images[attachment.attachment_id] : undefined;
      const label = `${attachment.display_name || "Uploaded image"} - Report ${attachment.report_sequence}, image ${attachment.image_sequence}${attachment.ultrasound_date ? ` - ${attachment.ultrasound_date}` : ""}`;
      return <figure key={attachment.attachment_id}><figcaption>{label}</figcaption>{state?.error ? <div role="alert"><p>{state.error}</p><button type="button" onClick={() => setImageRevision((value) => value + 1)}>Retry images</button></div> : state?.url ? <img src={state.url} alt={label} onError={() => setImageState((current) => ({ key: imageKey, images: { ...current.images, [attachment.attachment_id]: { error: "This image could not be displayed in this browser." } } }))} /> : <p role="status">Loading image...</p>}</figure>;
    })}</div> : null;
  }
  return <div className={styles.backdrop}>
    <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="household-forms-title">
      <header className={styles.header}><div><h2 id="household-forms-title">Saved forms - {householdId}</h2><p>Read only - Forms matching the selected user and dates</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Close saved forms">Close</button></header>
      {error ? <div className={styles.state} role="alert"><p>{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Try again</button></div>
        : !data ? <p className={styles.state} role="status">Loading saved forms...</p>
        : !form ? <p className={styles.state}>No saved forms match the selected user and dates for this household.</p>
        : <><div className={styles.selection}><label>Saved form<select value={form.form_response_id} onChange={(event) => setSelectedId(event.target.value)}>{data.forms.map((entry) => <option key={entry.form_response_id} value={entry.form_response_id}>{formCode(entry.form_code)} - {entry.subject_id} - {submittedDate(entry.submitted_at)}</option>)}</select></label><p>{data.forms.length} saved {data.forms.length === 1 ? "form" : "forms"}</p></div>
          <div className={styles.content} tabIndex={0} aria-label="Saved questionnaire answers">
            <div className={styles.formHeading}><h3>{form.title || formCode(form.form_code)}</h3><p>Subject: {form.subject_id} - Version: {form.form_version} - Submitted: {submittedDate(form.submitted_at)} IST</p>{form.definition_note && <p role="note">{form.definition_note}{form.definition_version ? ` (Definition version: ${form.definition_version})` : ""}</p>}</div>
            {form.preview.map((section) => <section key={section.name} className={styles.section}><h4>{section.title || section.name}</h4>{section.questions.map((question) => question.panelRows ? <div key={question.name} className={styles.repeat}><h5>{question.title}</h5>{images((form.attachments || []).filter((attachment) => attachment.question_name === question.name))}{question.panelRows.map((row) => <div key={row.index} className={styles.repeatRow}><h6>Entry {row.index}</h6><dl>{row.questions.map((answer) => <div key={answer.name} className={styles.answer}><dt>{answer.title}</dt><dd>{answer.value || "-"}</dd></div>)}</dl></div>)}</div> : <dl key={question.name}><div className={styles.answer}><dt>{question.title}</dt><dd>{question.value || "-"}</dd>{images((form.attachments || []).filter((attachment) => attachment.question_name === question.name))}</div></dl>)}</section>)}
            {form.attachments?.some((attachment) => !questionNames.has(attachment.question_name)) && <section className={styles.section}><h4>Uploaded images</h4>{images(form.attachments.filter((attachment) => !questionNames.has(attachment.question_name)))}</section>}
          </div></>}
    </div>
  </div>;
}
