import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import common from "./MastersPage.module.css";
import styles from "./AddHouseholdModal.module.css";

type Site = { site_id: number; site_name: string };
type Locality = { site_id: number; locality_code: string; locality_name: string };
export type AddedHousehold = {
  household_id: string; site_id: number; locality_code: string; structure_map_id: string;
  household_number: string; address?: string | null; household_head_name?: string | null;
  mapping_status: string; baseline_enrollment_status: string;
  can_delete?: boolean; consent_status?: string | null;
};
type Props = { sites: Site[]; localities: Locality[]; initialSite: string; onClose: () => void; onSaved: (entry: AddedHousehold) => void };

const padNumeric = (value: string, width: number) => /^\d+$/.test(value.trim()) ? value.trim().padStart(width, "0") : value.trim();

export default function AddHouseholdModal({ sites, localities, initialSite, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const central = user?.role === "central_admin";
  const manager = user?.role === "site_data_manager";
  const canAdd = !!user && ["central_admin", "site_data_manager", "site_research_scientist"].includes(user.role);
  const [siteChoice, setSite] = useState(initialSite);
  const site = central ? siteChoice : String(user?.site_id || "");
  const [locality, setLocality] = useState("");
  const [structure, setStructure] = useState("");
  const [number, setNumber] = useState("");
  const [head, setHead] = useState("");
  const [address, setAddress] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [areas, setAreas] = useState<{ userId: string; codes: string[] } | null>(null);
  const [areaError, setAreaError] = useState("");
  const [areaRevision, setAreaRevision] = useState(0);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const availableSites = central ? sites : sites.filter((row) => row.site_id === user?.site_id);
  const areasReady = !manager || areas?.userId === user?.user_id;
  const villages = localities.filter((row) => String(row.site_id) === site && (!manager || (areasReady && areas?.codes.includes(row.locality_code))));
  const normalizedStructure = padNumeric(structure.toUpperCase(), 4);
  const normalizedNumber = padNumeric(number, 2);
  const normalizedLocality = padNumeric(locality, 2);
  const validIdentity = availableSites.some((row) => String(row.site_id) === site) && villages.some((row) => padNumeric(row.locality_code, 2) === normalizedLocality) && /^[A-Z0-9]{1,6}$/.test(normalizedStructure) && /^\d{2}$/.test(normalizedNumber);
  const householdId = validIdentity ? `${Number(site)}-${normalizedLocality}-${normalizedStructure}-${normalizedNumber}` : "Complete site, village, structure and household number";

  useEffect(() => {
    let cancelled = false;
    if (!manager || !user) return;
    setAreas(null); setAreaError("");
    api.get<{ site_id: number; locality_code: string; active_from: string | null; active_to: string | null }[]>(`/users/${encodeURIComponent(user.user_id)}/area-assignments`).then((rows) => {
      if (cancelled) return;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      setAreas({ userId: user.user_id, codes: rows.filter((row) => row.site_id === user.site_id && (!row.active_from || row.active_from <= today) && (!row.active_to || row.active_to >= today)).map((row) => row.locality_code) });
    }).catch((reason) => { if (!cancelled) setAreaError(reason instanceof Error ? reason.message : "Could not load your assigned villages."); });
    return () => { cancelled = true; };
  }, [manager, user?.user_id, user?.site_id, areaRevision]);

  useEffect(() => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (central) firstRef.current?.focus();
    else dialogRef.current?.querySelector<HTMLElement>("select:not([disabled]),input:not([disabled])")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])") ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (first && event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      if (last && !event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); focused?.focus(); };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current || !canAdd || !areasReady || areaError) return;
    if (!validIdentity) { setError("Select a site and village, enter 1-6 alphanumeric structure characters and a household number of up to 2 digits."); return; }
    if (!head.trim() || !address.trim()) { setError("Enter the household head name and address."); return; }
    savingRef.current = true; setSaving(true); setError("");
    try {
      const entry = await api.post<AddedHousehold>("/masters/mapping-frame", { site_id: Number(site), locality_code: normalizedLocality, structure_map_id: normalizedStructure, household_number: normalizedNumber, household_head_name: head.trim(), address: address.trim(), comments: comments.trim() });
      onSaved(entry);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add household.");
    } finally { savingRef.current = false; setSaving(false); }
  }

  if (!canAdd) return null;
  return <div className={common.modal}>
    <div ref={dialogRef} className={`${common.modalContent} ${styles.dialog}`} role="dialog" aria-modal="true" aria-labelledby="add-household-title">
      <header className={common.modalHeader}><h2 id="add-household-title">Add Household</h2><button type="button" className={common.closeBtn} disabled={saving} onClick={onClose} aria-label="Close Add Household">X</button></header>
      <form onSubmit={save}>
        <div className={styles.body}>
          {error && <div className={common.error} role="alert">{error}</div>}
          {manager && !areasReady && !areaError && <p role="status">Loading your assigned villages...</p>}
          {areaError && <div role="alert">{areaError} <button type="button" onClick={() => setAreaRevision((value) => value + 1)}>Retry villages</button></div>}
          <div className={styles.fields}>
            <label>Study site<select ref={firstRef} value={site} disabled={saving || !central} required onChange={(event) => { setSite(event.target.value); setLocality(""); setError(""); }}><option value="">Select site</option>{availableSites.map((row) => <option key={row.site_id} value={row.site_id}>{row.site_name} ({row.site_id})</option>)}</select></label>
            <label>Village / locality<select value={locality} disabled={saving || !site || !areasReady} required onChange={(event) => setLocality(event.target.value)}><option value="">Select village</option>{villages.map((row) => <option key={row.locality_code} value={row.locality_code}>{row.locality_name} ({row.locality_code})</option>)}</select></label>
            <label>Structure number<input value={structure} disabled={saving} required maxLength={6} pattern="[A-Za-z0-9]{1,6}" onChange={(event) => setStructure(event.target.value)} onBlur={() => setStructure(normalizedStructure)} /><small>1-6 letters or digits. Numeric values are padded to at least four digits.</small></label>
            <label>Household number<input value={number} disabled={saving} required inputMode="numeric" maxLength={2} pattern="[0-9]{1,2}" onChange={(event) => setNumber(event.target.value)} onBlur={() => setNumber(normalizedNumber)} /></label>
          </div>
          <p className={styles.identity}>Household ID: <strong>{householdId}</strong></p>
          <label>Household head name<input value={head} disabled={saving} required maxLength={300} onChange={(event) => setHead(event.target.value)} /></label>
          <label>Address / location<textarea value={address} disabled={saving} required maxLength={2000} rows={3} onChange={(event) => setAddress(event.target.value)} /></label>
          <label>Comments (optional)<textarea value={comments} disabled={saving} maxLength={2000} rows={2} onChange={(event) => setComments(event.target.value)} /></label>
        </div>
        <footer className={common.modalFooter}><button type="button" className={common.secondaryBtn} disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className={common.primaryBtn} disabled={saving || !areasReady || !!areaError}>{saving ? "Adding..." : "Add Household"}</button></footer>
      </form>
    </div>
  </div>;
}
