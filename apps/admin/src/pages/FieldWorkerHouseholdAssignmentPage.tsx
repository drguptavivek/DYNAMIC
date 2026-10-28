import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { isHouseholdInAssignmentRange, parseHouseholdAssignmentRange } from "../../../../shared/householdAssignmentRange.cjs";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import styles from "./FieldWorkerHouseholdAssignmentPage.module.css";

const HOUSEHOLD_PAGE_SIZE = 1000;
const ASSIGNMENT_REQUEST_BATCH_SIZE = 500;

interface Site {
  site_id: number;
  site_code: string;
  site_name: string;
}

interface Locality {
  site_id: number;
  locality_code: string;
  locality_name: string;
}

interface User {
  user_id: string;
  display_name?: string;
  username: string;
  site_id?: number | null;
  role: string;
  active?: boolean;
}

interface AreaAssignment {
  site_id: number;
  locality_code: string;
  active_from?: string;
  active_to?: string;
}

interface Household {
  household_id: string;
  site_id: number;
  locality_code: string;
  household_number: string;
  assigned_user_ids?: string[];
  assigned_field_worker_names?: string[];
  assigned_field_worker_usernames?: string[];
}

function workerLabel(worker: User): string {
  return worker.display_name || worker.username;
}

function workerFilterLabel(worker: User): string {
  return workerLabel(worker) + (worker.username.trim().toLowerCase() !== workerLabel(worker).trim().toLowerCase() ? ` (${worker.username})` : "");
}

function selectedWorkers(fieldWorkers: User[], selectedIds: string[]): User[] {
  return selectedIds
    .map((userId) => fieldWorkers.find((worker) => worker.user_id === userId))
    .filter(Boolean) as User[];
}

export default function FieldWorkerHouseholdAssignmentPage() {
  const { user } = useAuth();
  const isSiteDataManager = user?.role === "site_data_manager";
  const [sites, setSites] = useState<Site[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedLocalityCode, setSelectedLocalityCode] = useState("");
  const [householdRangeStart, setHouseholdRangeStart] = useState("");
  const [householdRangeEnd, setHouseholdRangeEnd] = useState("");
  const [fieldWorkers, setFieldWorkers] = useState<User[]>([]);
  const [workerAreas, setWorkerAreas] = useState<Record<string, AreaAssignment[] | undefined>>({});
  const [workerSearch, setWorkerSearch] = useState("");
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHouseholdIds, setSelectedHouseholdIds] = useState<string[]>([]);
  const [workerIdsByHouseholdId, setWorkerIdsByHouseholdId] = useState<Record<string, string[]>>({});
  const [openWorkerMenuFor, setOpenWorkerMenuFor] = useState<string | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkWorkerIds, setBulkWorkerIds] = useState<string[]>([]);
  const [householdSearch, setHouseholdSearch] = useState("");
  const [assignedWorkerId, setAssignedWorkerId] = useState("");
  const [householdPage, setHouseholdPage] = useState(1);
  const [hasViewed, setHasViewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [allScopeHouseholdIds, setAllScopeHouseholdIds] = useState<string[]>([]);
  const [allSelectionLoading, setAllSelectionLoading] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const pendingScrollHouseholdId = useRef<string | null>(null);
  const selectedAssignedWorkerLabel = useRef("");
  const requestVersion = useRef(0);
  const filterKey = JSON.stringify([selectedSiteId, selectedLocalityCode, householdRangeStart, householdRangeEnd, householdSearch, assignedWorkerId]);
  const currentFilterKey = useRef(filterKey);
  currentFilterKey.current = filterKey;
  const busy = tableLoading || allSelectionLoading;

  function workerLocalities(worker: User): string {
    const assignments = workerAreas[worker.user_id];
    if (!assignments) return "Localities unavailable";
    const now = new Date();
    const labels = assignments
      .filter((area) => area.site_id === worker.site_id &&
        (!area.active_from || new Date(area.active_from) <= now) &&
        (!area.active_to || new Date(area.active_to) >= now))
      .map((area) => {
        const locality = localities.find((item) => item.site_id === area.site_id && item.locality_code === area.locality_code);
        return locality ? `${locality.locality_name} (${area.locality_code})` : area.locality_code;
      });
    return labels.length ? [...new Set(labels)].join(", ") : "No assigned locality";
  }

  const matchingWorkers = fieldWorkers.filter((worker) =>
    [workerLabel(worker), worker.username, workerLocalities(worker)]
      .join(" ").toLowerCase().includes(workerSearch.trim().toLowerCase()));

  function workerDetails(worker: User) {
    return <span className={styles.workerDetails}>
      <strong>{workerLabel(worker)}</strong>
      {worker.username.trim().toLowerCase() !== workerLabel(worker).trim().toLowerCase() &&
        <span className={styles.workerUsername}>{worker.username}</span>}
      <span className={styles.workerLocalities}>Assigned locality: {workerLocalities(worker)}</span>
    </span>;
  }

  const availableLocalities = useMemo(() => {
    if (!selectedSiteId) return localities;
    return localities.filter((locality) => String(locality.site_id) === selectedSiteId);
  }, [localities, selectedSiteId]);

  const assignedHouseholdCounts = useMemo(() => {
    const counts = new Map<string, number>();
    households.forEach((household) => new Set(household.assigned_user_ids || []).forEach((id) =>
      counts.set(id, (counts.get(id) || 0) + 1)));
    return counts;
  }, [households]);

  const knownWorkers = useMemo(() => {
    const workers = new Map(fieldWorkers.map((worker) => [worker.user_id, worker]));
    households.forEach((household) => (household.assigned_user_ids || []).forEach((id, index) => {
      if (!workers.has(id)) workers.set(id, {
        user_id: id, username: household.assigned_field_worker_usernames?.[index] || id,
        role: "field_worker", site_id: household.site_id,
      });
    }));
    return [...workers.values()];
  }, [fieldWorkers, households]);

  const localityWorkers = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return knownWorkers.filter((worker) => assignedHouseholdCounts.has(worker.user_id) ||
      worker.user_id === assignedWorkerId || (workerAreas[worker.user_id] || []).some((area) =>
        String(area.site_id) === selectedSiteId && (!selectedLocalityCode || area.locality_code === selectedLocalityCode) &&
        (!area.active_from || area.active_from <= today) && (!area.active_to || area.active_to >= today)))
      .sort((left, right) => (assignedHouseholdCounts.get(right.user_id) || 0) - (assignedHouseholdCounts.get(left.user_id) || 0) ||
        workerLabel(left).localeCompare(workerLabel(right)) || left.username.localeCompare(right.username));
  }, [knownWorkers, assignedHouseholdCounts, workerAreas, selectedSiteId, selectedLocalityCode, assignedWorkerId]);

  function matchesAssignedWorker(household: Household) {
    return !assignedWorkerId || household.assigned_user_ids?.includes(assignedWorkerId);
  }

  const rangeResult = useMemo(() => {
    try {
      return { range: parseHouseholdAssignmentRange(householdRangeStart, householdRangeEnd, {
        siteId: selectedSiteId ? Number(selectedSiteId) : undefined,
        localityCode: selectedLocalityCode || undefined,
      }), error: "" };
    } catch (err) {
      return { range: undefined, error: err instanceof Error ? err.message : "Invalid household range" };
    }
  }, [householdRangeEnd, householdRangeStart, selectedSiteId, selectedLocalityCode]);

  const visibleHouseholds = useMemo(() => rangeResult.range
    ? households.filter((household) => matchesAssignedWorker(household) && isHouseholdInAssignmentRange(household, rangeResult.range!))
    : [], [households, rangeResult, assignedWorkerId]);

  const searchedHouseholds = useMemo(() => {
    const query = householdSearch.trim().toLowerCase();
    if (!query) return visibleHouseholds;

    return visibleHouseholds.filter((household) =>
      [
        household.household_id,
        String(household.site_id),
        household.locality_code,
        household.household_number,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [householdSearch, visibleHouseholds]);

  const totalHouseholdPages = Math.max(1, Math.ceil(searchedHouseholds.length / HOUSEHOLD_PAGE_SIZE));
  const currentHouseholdPage = Math.min(householdPage, totalHouseholdPages);
  const pagedHouseholds = searchedHouseholds.slice(
    (currentHouseholdPage - 1) * HOUSEHOLD_PAGE_SIZE,
    currentHouseholdPage * HOUSEHOLD_PAGE_SIZE,
  );
  const selectedHouseholdIdSet = useMemo(() => new Set(selectedHouseholdIds), [selectedHouseholdIds]);

  const allVisibleSelected =
    pagedHouseholds.length > 0 &&
    pagedHouseholds.every((household) => selectedHouseholdIdSet.has(household.household_id));
  const allScopeSelected = allScopeHouseholdIds.length > 0 &&
    allScopeHouseholdIds.every((id) => selectedHouseholdIdSet.has(id));

  useEffect(() => {
    if (tableLoading || !pendingScrollHouseholdId.current) return;
    const wrap = tableWrapRef.current;
    const row = wrap && Array.from(wrap.querySelectorAll<HTMLTableRowElement>("tbody tr"))
      .find((item) => item.dataset.householdId === pendingScrollHouseholdId.current);
    if (wrap && row) {
      const bounds = wrap.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      const headerHeight = wrap.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      if (rowBounds.top < bounds.top + headerHeight) {
        wrap.scrollTop += rowBounds.top - bounds.top - headerHeight;
      } else if (rowBounds.bottom > bounds.bottom) {
        wrap.scrollTop += rowBounds.bottom - bounds.bottom;
      }
    }
    pendingScrollHouseholdId.current = null;
  }, [households, householdPage, tableLoading]);

  useEffect(() => {
    setHouseholdPage(1);
    setSelectedHouseholdIds([]);
    setAllScopeHouseholdIds([]);
    setBulkAssignOpen(false);
    setOpenWorkerMenuFor(null);
    setWorkerSearch("");
  }, [householdRangeEnd, householdRangeStart, householdSearch, selectedLocalityCode, selectedSiteId, assignedWorkerId]);

  useEffect(() => {
    requestVersion.current += 1;
    setHouseholds([]);
    setFieldWorkers([]);
    setWorkerAreas({});
    setAssignedWorkerId("");
    selectedAssignedWorkerLabel.current = "";
    setWorkerIdsByHouseholdId({});
    setHasViewed(false);
    setTableLoading(false);
    setAllSelectionLoading(false);
  }, [selectedLocalityCode, selectedSiteId]);

  useEffect(() => {
    let cancelled = false;
    async function loadMasters() {
      setLoading(true);
      setError("");
      if (isSiteDataManager) {
        setSites([]);
        setLocalities([]);
        setSelectedSiteId("");
        setSelectedLocalityCode("");
      }
      try {
        if (isSiteDataManager && !user?.site_id) throw new Error("Your account is not assigned to a site");
        const [siteData, localityData, ownAreas] = await Promise.all([
          api.get<Site[]>("/masters/sites"),
          api.get<Locality[]>("/masters/localities"),
          isSiteDataManager
            ? api.get<AreaAssignment[]>(`/users/${encodeURIComponent(user!.user_id)}/area-assignments`)
            : Promise.resolve([] as AreaAssignment[]),
        ]);
        if (cancelled) return;
        if (isSiteDataManager) {
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
          const activeCodes = new Set(ownAreas.filter((area) => area.site_id === user!.site_id &&
            (!area.active_from || area.active_from <= today) && (!area.active_to || area.active_to >= today))
            .map((area) => area.locality_code));
          const allowedLocalities = localityData.filter((locality) => locality.site_id === user!.site_id && activeCodes.has(locality.locality_code));
          if (!allowedLocalities.length) throw new Error("No active localities are assigned to your account");
          setSites(siteData.filter((site) => site.site_id === user!.site_id));
          setLocalities(allowedLocalities);
          setSelectedSiteId(String(user!.site_id));
          setSelectedLocalityCode("");
        } else {
          setSites(siteData);
          setLocalities(localityData);
        }
      } catch (err) {
        if (cancelled) return;
        setSites([]);
        setLocalities([]);
        setSelectedSiteId("");
        setError(err instanceof Error ? err.message : "Failed to load sites and localities");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMasters();
    return () => { cancelled = true; };
  }, [isSiteDataManager, user?.site_id, user?.user_id]);

  useEffect(() => {
    function closeWorkerMenu(event: globalThis.MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(`.${styles.workerPicker}`)) {
        setOpenWorkerMenuFor(null);
      }
    }

    document.addEventListener("mousedown", closeWorkerMenu);
    return () => document.removeEventListener("mousedown", closeWorkerMenu);
  }, []);

  async function loadAssignmentTable(options: { resetSelection: boolean; anchorHouseholdIds?: string[] }) {
    const version = ++requestVersion.current;
    const requestedFilterKey = filterKey;
    const isCurrent = () => version === requestVersion.current && requestedFilterKey === currentFilterKey.current;
    setError("");
    setMessage("");
    setHasViewed(true);
    if (options.resetSelection) {
      setSelectedHouseholdIds([]);
      setHouseholdPage(1);
      pendingScrollHouseholdId.current = null;
    }
    setOpenWorkerMenuFor(null);
    setBulkAssignOpen(false);

    if (!selectedSiteId) {
      setError("Select a site before viewing households");
      setHouseholds([]);
      setFieldWorkers([]);
      return;
    }

    if (rangeResult.error) {
      setError(rangeResult.error);
      return;
    }

    setTableLoading(true);
    try {
      const params = new URLSearchParams({ site_id: selectedSiteId });
      if (selectedLocalityCode) params.set("locality_code", selectedLocalityCode);

      const [householdResult, workerResult] = await Promise.all([
        api.get<Household[]>(`/field-worker-household-assignments?${params.toString()}`),
        api.get<User[]>(
          `/users?site_id=${encodeURIComponent(selectedSiteId)}&role=field_worker&active=1`,
        ).then((workers) => isSiteDataManager
          ? workers.filter((worker) => worker.site_id === Number(selectedSiteId) && worker.role === "field_worker")
          : workers).then(async (workers) => ({
          workers,
          areas: options.resetSelection ? Object.fromEntries(await Promise.all(workers.map(async (worker) => {
            try {
              return [worker.user_id, await api.get<AreaAssignment[]>(`/users/${encodeURIComponent(worker.user_id)}/area-assignments`)] as const;
            } catch {
              return [worker.user_id, undefined] as const;
            }
          }))) : undefined,
        })),
      ]);

      if (!isCurrent()) return false;

      if (options.anchorHouseholdIds) {
        const anchorIds = new Set(options.anchorHouseholdIds);
        // Anchor by displayed order, which can differ from checkbox selection order.
        const query = householdSearch.trim().toLowerCase();
        const refreshedRows = householdResult.filter((household) =>
          matchesAssignedWorker(household) &&
          (!rangeResult.range || isHouseholdInAssignmentRange(household, rangeResult.range)) &&
          (!query || [household.household_id, String(household.site_id), household.locality_code,
            household.household_number].join(" ").toLowerCase().includes(query)),
        );
        let anchorIndex = -1;
        refreshedRows.forEach((household, index) => {
          if (anchorIds.has(household.household_id)) anchorIndex = index;
        });
        if (anchorIndex >= 0) {
          setHouseholdPage(Math.floor(anchorIndex / HOUSEHOLD_PAGE_SIZE) + 1);
          pendingScrollHouseholdId.current = refreshedRows[anchorIndex].household_id;
        }
      }

      setHouseholds(householdResult);
      setWorkerIdsByHouseholdId(
        Object.fromEntries(
          householdResult.map((household) => [
            household.household_id,
            household.assigned_user_ids && household.assigned_user_ids.length > 0
              ? household.assigned_user_ids
              : [],
          ]),
        ),
      );
      setFieldWorkers(workerResult.workers);
      if (workerResult.areas) setWorkerAreas(workerResult.areas);
      return true;
    } catch (err) {
      if (!isCurrent()) return false;
      const detail = err instanceof Error ? err.message : "Failed to load assignment table";
      setError(options.resetSelection ? detail : `Changes saved, but the table could not refresh: ${detail}. Click View to retry.`);
      return false;
    } finally {
      if (version === requestVersion.current) setTableLoading(false);
    }
  }

  async function handleView() {
    await loadAssignmentTable({ resetSelection: true });
  }

  function toggleHousehold(householdId: string) {
    setSelectedHouseholdIds((current) =>
      current.includes(householdId)
        ? current.filter((id) => id !== householdId)
        : [...current, householdId],
    );
  }

  function selectAllVisible() {
    setSelectedHouseholdIds((current) => [
      ...new Set([
        ...current,
        ...pagedHouseholds.map((household) => household.household_id),
      ]),
    ]);
  }

  function deselectVisible() {
    const visibleIds = new Set(pagedHouseholds.map((household) => household.household_id));
    setSelectedHouseholdIds((current) => current.filter((id) => !visibleIds.has(id)));
  }

  async function selectAllInScope(checked: boolean) {
    if (!checked) {
      setSelectedHouseholdIds([]);
      setAllScopeHouseholdIds([]);
      return;
    }
    const requestedFilterKey = filterKey;
    setAllSelectionLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ site_id: selectedSiteId });
      if (selectedLocalityCode) params.set("locality_code", selectedLocalityCode);
      const rows = await api.get<Household[]>(`/field-worker-household-assignments?${params.toString()}`);
      if (requestedFilterKey !== currentFilterKey.current) return;
      const ids = rows.filter(matchesAssignedWorker).map((household) => household.household_id);
      setAllScopeHouseholdIds(ids);
      setSelectedHouseholdIds(ids);
    } catch (err) {
      if (requestedFilterKey === currentFilterKey.current) {
        setError(err instanceof Error ? err.message : "Failed to select all households");
      }
    } finally {
      setAllSelectionLoading(false);
    }
  }

  async function clearSelectedAssignments() {
    setError("");
    setMessage("");
    setOpenWorkerMenuFor(null);

    if (selectedHouseholdIds.length === 0) {
      setError("Select household rows before clearing assignments");
      return;
    }

    if (!window.confirm("Are you sure you want to clear field worker assignments for selected households?")) {
      return;
    }

    setTableLoading(true);
    try {
      for (
        let offset = 0;
        offset < selectedHouseholdIds.length;
        offset += ASSIGNMENT_REQUEST_BATCH_SIZE
      ) {
        const householdBatch = selectedHouseholdIds.slice(
          offset,
          offset + ASSIGNMENT_REQUEST_BATCH_SIZE,
        );
        setMessage(
          `Clearing households ${offset + 1}-${Math.min(offset + householdBatch.length, selectedHouseholdIds.length)} of ${selectedHouseholdIds.length}...`,
        );
        await api.delete<{ cleared: number }>("/field-worker-household-assignments", {
          household_ids: householdBatch,
          ...(assignedWorkerId ? { user_ids: [assignedWorkerId] } : {}),
        });
      }
      const completedIds = new Set(selectedHouseholdIds);
      setSelectedHouseholdIds((current) => current.filter((id) => !completedIds.has(id)));
      if (!await loadAssignmentTable({ resetSelection: false, anchorHouseholdIds: selectedHouseholdIds })) return;
      setMessage(
        `${selectedHouseholdIds.length} household${selectedHouseholdIds.length === 1 ? "" : "s"} cleared`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear assignments");
    } finally {
      setTableLoading(false);
    }
  }

  async function unassignWorkerFromHousehold(
    event: MouseEvent<HTMLButtonElement>,
    householdId: string,
    worker: User,
  ) {
    event.stopPropagation();
    setError("");
    setMessage("");
    setOpenWorkerMenuFor(null);

    if (!window.confirm("Are you sure you wish to unassign?")) {
      return;
    }

    setTableLoading(true);
    try {
      await api.delete<{ cleared: number }>("/field-worker-household-assignments", {
        household_ids: [householdId],
        user_ids: [worker.user_id],
      });
      if (!await loadAssignmentTable({ resetSelection: false, anchorHouseholdIds: [householdId] })) return;
      setMessage(`${workerLabel(worker)} unassigned from ${householdId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unassign field worker");
    } finally {
      setTableLoading(false);
    }
  }

  function toggleWorkerForHousehold(householdId: string, userId: string) {
    setWorkerIdsByHouseholdId((current) => {
      const selected = current[householdId] ?? [];
      const next = selected.includes(userId)
        ? selected.filter((id) => id !== userId)
        : [...selected, userId];
      return { ...current, [householdId]: next };
    });
  }

  function toggleBulkWorker(userId: string) {
    setBulkWorkerIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function assignHouseholds(householdIds: string[], userIds: string[]) {
    setError("");
    setMessage("");
    setOpenWorkerMenuFor(null);

    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      setError("Select at least one field worker before assigning households");
      return;
    }

    setTableLoading(true);
    try {
      for (let offset = 0; offset < householdIds.length; offset += ASSIGNMENT_REQUEST_BATCH_SIZE) {
        const householdBatch = householdIds.slice(offset, offset + ASSIGNMENT_REQUEST_BATCH_SIZE);
        setMessage(
          `Assigning households ${offset + 1}-${Math.min(offset + householdBatch.length, householdIds.length)} of ${householdIds.length}...`,
        );
        await api.post<{ assigned: number; field_workers: number }>(
          "/field-worker-household-assignments",
          { household_ids: householdBatch, user_ids: uniqueUserIds },
        );
      }
      setBulkAssignOpen(false);
      setBulkWorkerIds([]);
      const completedIds = new Set(householdIds);
      setSelectedHouseholdIds((current) => current.filter((id) => !completedIds.has(id)));
      if (!await loadAssignmentTable({ resetSelection: false, anchorHouseholdIds: householdIds })) return;
      setMessage(
        `${householdIds.length} household${householdIds.length === 1 ? "" : "s"} assigned to ${uniqueUserIds.length} field worker${uniqueUserIds.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign households");
    } finally {
      setTableLoading(false);
    }
  }

  function openBulkAssign() {
    setError("");
    setMessage("");
    setBulkWorkerIds([]);
    setWorkerSearch("");
    setBulkAssignOpen(true);
  }

  return (
    <div className={styles.container}>
      <h1>Field Worker Household Assignment</h1>

      {(rangeResult.error || error) && <div className={styles.error}>{rangeResult.error || error}</div>}
      {message && <div className={styles.success}>{message}</div>}

      <div className={styles.filterBox}>
        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-site">Sites</label>
          <select
            id="assignment-site"
            value={selectedSiteId}
            onChange={(event) => {
              setSelectedSiteId(event.target.value);
              setSelectedLocalityCode("");
            }}
            disabled={loading || busy || isSiteDataManager}
          >
            <option value="">Select site</option>
            {sites.map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {site.site_id} - {site.site_name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-locality">Localities</label>
          <select
            id="assignment-locality"
            value={selectedLocalityCode}
            onChange={(event) => setSelectedLocalityCode(event.target.value)}
            disabled={loading || busy}
          >
            <option value="">Select locality</option>
            {availableLocalities.map((locality) => (
              <option
                key={`${locality.site_id}-${locality.locality_code}`}
                value={locality.locality_code}
              >
                {locality.locality_code} - {locality.locality_name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label>Household Range</label>
          <div className={styles.rangeFields}>
            <input
              type="text"
              aria-label="Household range start"
              disabled={busy}
              value={householdRangeStart}
              onChange={(event) => setHouseholdRangeStart(event.target.value)}
              placeholder="Start"
            />
            <input
              type="text"
              aria-label="Household range end"
              disabled={busy}
              value={householdRangeEnd}
              onChange={(event) => setHouseholdRangeEnd(event.target.value)}
              placeholder="End"
            />
          </div>
        </div>

        <button
          type="button"
          className={styles.viewButton}
          onClick={handleView}
          disabled={loading || busy || Boolean(rangeResult.error)}
        >
          View
        </button>
      </div>

      {hasViewed && (
        <div className={styles.tableCard}>
          <div className={styles.tableToolbar}>
            <div className={styles.tableSummary}>
              <h2>Household Assignments</h2>
              <p>
                {searchedHouseholds.length} household rows · {selectedHouseholdIds.length} selected
                {searchedHouseholds.length !== visibleHouseholds.length
                  ? ` from ${visibleHouseholds.length}`
                  : ""}
              </p>
            </div>
            <div className={styles.tableSearchBar}>
              <input
                type="search"
                aria-label="Search household"
                disabled={busy}
                value={householdSearch}
                onChange={(event) => setHouseholdSearch(event.target.value)}
                placeholder="Search household"
              />
            </div>
            <div className={styles.assignedWorkerFilter}>
              <label htmlFor="assigned-worker-filter">Assigned field worker</label>
              <select id="assigned-worker-filter" aria-label="Assigned field worker" value={assignedWorkerId}
                disabled={busy} onChange={(event) => {
                  const worker = knownWorkers.find((item) => item.user_id === event.target.value);
                  selectedAssignedWorkerLabel.current = worker ? workerFilterLabel(worker) : "";
                  setAssignedWorkerId(event.target.value);
                }}>
                <option value="">All households</option>
                {assignedWorkerId && !localityWorkers.some((worker) => worker.user_id === assignedWorkerId) &&
                  <option value={assignedWorkerId}>{selectedAssignedWorkerLabel.current || "Selected worker"} — 0 households</option>}
                {localityWorkers.map((worker) => <option key={worker.user_id} value={worker.user_id}>
                  {workerFilterLabel(worker)}
                  {` — ${assignedHouseholdCounts.get(worker.user_id) || 0} ${assignedHouseholdCounts.get(worker.user_id) === 1 ? "household" : "households"}`}
                </option>)}
              </select>
              <small>{assignedHouseholdCounts.size} {assignedHouseholdCounts.size === 1 ? "worker has" : "workers have"} assigned households in this {selectedLocalityCode ? "locality" : "site"}</small>
            </div>
            <div className={styles.toolbarActions}>
              <label className={styles.selectAllLabel}>
                <input type="checkbox" aria-label="Select all households in selected site/locality" checked={allScopeSelected} disabled={busy || !selectedSiteId}
                  onChange={(event) => void selectAllInScope(event.target.checked)} />
                {assignedWorkerId ? "Select all this worker's households in selected site/locality" : "Select all households in selected site/locality"} (ignores range and search)
              </label>
              <button
                type="button"
                className={styles.viewButton}
                onClick={openBulkAssign}
                disabled={busy || selectedHouseholdIds.length === 0}
              >
                Assign all selected
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={clearSelectedAssignments}
                disabled={busy || selectedHouseholdIds.length === 0}
              >
                Clear all selected
              </button>
            </div>
          </div>

          {allSelectionLoading && <div role="status">Selecting all households in the selected site/locality...</div>}

          {tableLoading && <div className={styles.tableStatus} role="status">Refreshing households...</div>}

          {searchedHouseholds.length === 0 ? (
            tableLoading ? <div className={styles.emptyState}>Loading households...</div> :
            <div className={styles.emptyState}>No households found for the selected filters</div>
          ) : (
            <>
              <div ref={tableWrapRef} className={styles.tableWrap} aria-busy={busy} style={openWorkerMenuFor ? { paddingBottom: 440 } : undefined}>
                <table className={styles.assignmentTable}>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select visible households"
                          disabled={busy}
                          checked={allVisibleSelected}
                          onChange={(event) =>
                            event.target.checked ? selectAllVisible() : deselectVisible()
                          }
                        />
                      </th>
                      <th>Site ID</th>
                      <th>Assigned Field workers</th>
                      <th>Field worker Name</th>
                      <th>Households</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedHouseholds.map((household) => {
                    const selectedWorkerIds = workerIdsByHouseholdId[household.household_id] ?? [];
                    const pickedWorkers = selectedWorkers(knownWorkers, selectedWorkerIds);
                    const isOpen = openWorkerMenuFor === household.household_id;
                    return (
                      <tr key={household.household_id} data-household-id={household.household_id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select household ${household.household_id}`}
                            disabled={busy}
                            checked={selectedHouseholdIdSet.has(household.household_id)}
                            onChange={() => toggleHousehold(household.household_id)}
                          />
                        </td>
                        <td>{household.site_id}</td>
                        <td>
                          {pickedWorkers.length === 0 ? (
                            <span className={styles.unassignedText}>Not assigned</span>
                          ) : (
                            <span className={styles.workerChips}>
                              {pickedWorkers.map((worker) => (
                                <span key={worker.user_id} className={styles.workerChip}>
                                  {workerLabel(worker)}
                                  <button
                                    type="button"
                                    disabled={busy}
                                    aria-label={`Unassign ${workerLabel(worker)}`}
                                    onClick={(event) =>
                                      unassignWorkerFromHousehold(
                                        event,
                                        household.household_id,
                                        worker,
                                      )
                                    }
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className={styles.workerPicker}>
                            <div
                              role="button"
                              tabIndex={busy ? -1 : 0}
                              aria-disabled={busy}
                              className={styles.workerPickerButton}
                              onClick={() => {
                                if (busy) return;
                                setWorkerSearch("");
                                setOpenWorkerMenuFor(isOpen ? null : household.household_id);
                              }}
                              onKeyDown={(event) => {
                                if (!busy && (event.key === "Enter" || event.key === " ")) {
                                  event.preventDefault();
                                  setWorkerSearch("");
                                  setOpenWorkerMenuFor(isOpen ? null : household.household_id);
                                }
                              }}
                            >
                              <span>Select field workers</span>
                              <span aria-hidden="true">v</span>
                            </div>
                            {isOpen && (
                              <div className={styles.workerMenu}>
                                <div className={styles.workerSearch}>
                                  <input type="search" aria-label="Search field workers" placeholder="Search name, username or locality" value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} />
                                </div>
                                <div className={styles.workerMenuList}>
                                {fieldWorkers.length === 0 ? (
                                  <p>No active field workers for this site</p>
                                ) : matchingWorkers.length === 0 ? (
                                  <p>No field workers match your search</p>
                                ) : (
                                  matchingWorkers.map((worker) => (
                                    <label key={worker.user_id} className={styles.workerOption}>
                                      <input
                                        type="checkbox"
                                        disabled={busy}
                                        checked={selectedWorkerIds.includes(worker.user_id)}
                                        onChange={() =>
                                          toggleWorkerForHousehold(household.household_id, worker.user_id)
                                        }
                                      />
                                      {workerDetails(worker)}
                                    </label>
                                  ))
                                )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>{household.household_id}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.assignButton}
                            disabled={busy}
                            onClick={() => assignHouseholds([household.household_id], selectedWorkerIds)}
                          >
                            Assign
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={styles.paginationBar}>
                <span>
                  Showing {(currentHouseholdPage - 1) * HOUSEHOLD_PAGE_SIZE + 1}-
                  {Math.min(currentHouseholdPage * HOUSEHOLD_PAGE_SIZE, searchedHouseholds.length)} of{" "}
                  {searchedHouseholds.length}
                </span>
                <div className={styles.paginationActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setHouseholdPage((page) => Math.max(1, page - 1))}
                    disabled={busy || currentHouseholdPage <= 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentHouseholdPage} of {totalHouseholdPages}
                  </span>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      setHouseholdPage((page) => Math.min(totalHouseholdPages, page + 1))
                    }
                    disabled={busy || currentHouseholdPage >= totalHouseholdPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {bulkAssignOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.bulkModal} role="dialog" aria-modal="true" aria-labelledby="bulk-assignment-title">
            <div className={styles.bulkModalHeader}>
              <h2 id="bulk-assignment-title">Assign Selected Households</h2>
              <button type="button" aria-label="Close assignment dialog" disabled={busy} onClick={() => setBulkAssignOpen(false)}>x</button>
            </div>
            <p>{selectedHouseholdIds.length} selected household rows - {bulkWorkerIds.length} field workers selected</p>
            <div className={styles.workerSearch}>
              <input type="search" aria-label="Search field workers" placeholder="Search name, username or locality" disabled={busy} value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} />
            </div>
            <div className={styles.bulkWorkerList}>
              {fieldWorkers.length === 0 ? (
                <div className={styles.emptyState}>No active field workers for this site</div>
              ) : matchingWorkers.length === 0 ? (
                <div className={styles.emptyState}>No field workers match your search</div>
              ) : (
                matchingWorkers.map((worker) => (
                  <label key={worker.user_id} className={styles.workerOption}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={bulkWorkerIds.includes(worker.user_id)}
                      onChange={() => toggleBulkWorker(worker.user_id)}
                    />
                    {workerDetails(worker)}
                  </label>
                ))
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => setBulkAssignOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.viewButton}
                onClick={() => assignHouseholds(selectedHouseholdIds, bulkWorkerIds)}
                disabled={busy || bulkWorkerIds.length === 0}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
