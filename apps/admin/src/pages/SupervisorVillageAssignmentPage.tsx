import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import styles from "./SupervisorVillageAssignmentPage.module.css";

type Site = { site_id: number; site_name: string };
type Supervisor = { user_id: string; username: string; display_name: string | null; assigned_locality_codes: string[] };
type AssignmentOptions = { site_id: number; supervisors: Supervisor[]; localities: { locality_code: string; locality_name: string }[] };

export default function SupervisorVillageAssignmentPage() {
  const { user } = useAuth();
  return user && ["central_admin", "site_data_manager"].includes(user.role)
    ? <AssignmentView key={`${user.user_id}:${user.site_id}`} /> : <Navigate to="/dashboard" replace />;
}

function AssignmentView() {
  const { user } = useAuth();
  const central = user?.role === "central_admin";
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState(central ? "" : String(user?.site_id || ""));
  const [supervisorId, setSupervisorId] = useState("");
  const [data, setData] = useState<AssignmentOptions | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get<Site[]>("/masters/sites").then((rows) => {
      if (cancelled) return;
      const visible = central ? rows : rows.filter((site) => site.site_id === user?.site_id);
      setSites(visible);
      setSiteId((value) => value || (visible[0] ? String(visible[0].site_id) : ""));
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load sites."); });
    return () => { cancelled = true; };
  }, [central, user?.site_id]);

  useEffect(() => {
    let cancelled = false;
    if (!siteId) { setLoading(false); return; }
    setLoading(true); setError("");
    api.get<AssignmentOptions>(`/supervisor-village-assignments?site_id=${encodeURIComponent(siteId)}`)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        const supervisor = result.supervisors.find((row) => row.user_id === supervisorId);
        setSelected(supervisor?.assigned_locality_codes || []);
      })
      .catch((reason) => { if (!cancelled) { setData(null); setError(reason instanceof Error ? reason.message : "Could not load supervisor villages."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, revision]);

  const visibleVillages = (data?.localities ?? []).filter((village) => `${village.locality_name} ${village.locality_code}`.toLowerCase().includes(search.trim().toLowerCase()));
  const supervisor = data?.supervisors.find((row) => row.user_id === supervisorId);
  const ready = !loading && data?.site_id === Number(siteId) && !!supervisor;
  async function save() {
    if (!ready || savingRef.current || error) return;
    savingRef.current = true; setSaving(true); setError(""); setMessage("");
    try {
      await api.put("/supervisor-village-assignments", { supervisor_user_id: supervisorId, site_id: Number(siteId), locality_codes: selected });
      setMessage("Supervisor village access saved. The supervisor will see the updated villages when the dashboard refreshes.");
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save supervisor villages.");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <div className={styles.container}>
    <header><h1>Supervisor Village Assignment</h1><p>Assign read-only dashboard access to villages. This does not change field-worker household assignments.</p></header>
    <div className={styles.filters}>
      <label>Site<select value={siteId} disabled={!central || saving} onChange={(event) => { setSiteId(event.target.value); setSupervisorId(""); setSelected([]); setSearch(""); setMessage(""); }}><option value="">Select site</option>{sites.map((site) => <option key={site.site_id} value={site.site_id}>{site.site_name}</option>)}</select></label>
      <label>Field Supervisor<select value={supervisorId} disabled={loading || saving || !data || !!error} onChange={(event) => { const id = event.target.value; setSupervisorId(id); setSelected(data?.supervisors.find((row) => row.user_id === id)?.assigned_locality_codes || []); setMessage(""); }}><option value="">Select field supervisor</option>{!loading && data?.supervisors.map((row) => <option key={row.user_id} value={row.user_id}>{row.display_name || row.username}{row.display_name && row.display_name !== row.username ? ` (${row.username})` : ""}</option>)}</select></label>
      <button type="button" disabled={loading || saving || !siteId} onClick={() => setRevision((value) => value + 1)}>Refresh</button>
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.success} role="status">{message}</div>}
    {loading ? <p role="status">Loading supervisor villages...</p> : !siteId ? <p>Select a study site to manage supervisor access.</p> : !error && data && <section className={styles.panel}>
      <div className={styles.toolbar}><div><h2>Villages</h2><p>{selected.length} selected of {data.localities.length} manageable villages</p></div><input type="search" aria-label="Search villages" placeholder="Search village name or code" value={search} onChange={(event) => setSearch(event.target.value)} disabled={saving} /></div>
      {!data.supervisors.length ? <p className={styles.empty}>No Field Supervisor accounts exist for this site. Create a user with the Field Supervisor role first.</p>
        : !supervisor ? <p className={styles.empty}>Select a supervisor to assign villages.</p>
        : <><div className={styles.bulk}><button type="button" disabled={saving || !data.localities.length} onClick={() => setSelected(data.localities.map((village) => village.locality_code))}>Select all villages</button><button type="button" disabled={saving || !selected.length} onClick={() => setSelected([])}>Clear selection</button></div>
          {!data.localities.length ? <p className={styles.empty}>No villages are available within your assignment permissions.</p>
            : <div className={styles.villages}>{visibleVillages.length ? visibleVillages.map((village) => <label key={village.locality_code}><input type="checkbox" checked={selected.includes(village.locality_code)} disabled={saving} onChange={(event) => setSelected((codes) => event.target.checked ? [...codes, village.locality_code] : codes.filter((code) => code !== village.locality_code))} /><span>{village.locality_name} <small>({village.locality_code})</small></span></label>) : <p className={styles.empty}>No villages match this search.</p>}</div>}
          <footer><span>{supervisor.display_name || supervisor.username} can only view the dashboard for assigned villages. Clearing all villages removes their study-data access.</span><button type="button" className={styles.primary} disabled={!ready || saving} onClick={save}>{saving ? "Saving..." : "Save village access"}</button></footer>
        </>}
    </section>}
  </div>;
}
