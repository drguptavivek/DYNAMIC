import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { isHouseholdInAssignmentRange, parseHouseholdAssignmentRange } from "../../../../shared/householdAssignmentRange.cjs";
import { api } from "../lib/api";
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

function selectedWorkers(fieldWorkers: User[], selectedIds: string[]): User[] {
  return selectedIds
    .map((userId) => fieldWorkers.find((worker) => worker.user_id === userId))
    .filter(Boolean) as User[];
}

export default function FieldWorkerHouseholdAssignmentPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedLocalityCode, setSelectedLocalityCode] = useState("");
  const [householdRangeStart, setHouseholdRangeStart] = useState("");
  const [householdRangeEnd, setHouseholdRangeEnd] = useState("");
  const [fieldWorkers, setFieldWorkers] = useState<User[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHouseholdIds, setSelectedHouseholdIds] = useState<string[]>([]);
  const [workerIdsByHouseholdId, setWorkerIdsByHouseholdId] = useState<Record<string, string[]>>({});
  const [openWorkerMenuFor, setOpenWorkerMenuFor] = useState<string | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkWorkerIds, setBulkWorkerIds] = useState<string[]>([]);
  const [householdSearch, setHouseholdSearch] = useState("");
  const [householdPage, setHouseholdPage] = useState(1);
  const [hasViewed, setHasViewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [allScopeHouseholdIds, setAllScopeHouseholdIds] = useState<string[]>([]);
  const [allSelectionLoading, setAllSelectionLoading] = useState(false);
  const requestVersion = useRef(0);
  const filterKey = JSON.stringify([selectedSiteId, selectedLocalityCode, householdRangeStart, householdRangeEnd, householdSearch]);
  const currentFilterKey = useRef(filterKey);
  currentFilterKey.current = filterKey;
  const busy = tableLoading || allSelectionLoading;

  const availableLocalities = useMemo(() => {
    if (!selectedSiteId) return localities;
    return localities.filter((locality) => String(locality.site_id) === selectedSiteId);
  }, [localities, selectedSiteId]);

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
    ? households.filter((household) => isHouseholdInAssignmentRange(household, rangeResult.range!))
    : [], [households, rangeResult]);

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
    setHouseholdPage(1);
    setSelectedHouseholdIds([]);
    setAllScopeHouseholdIds([]);
    setBulkAssignOpen(false);
    setOpenWorkerMenuFor(null);
  }, [householdRangeEnd, householdRangeStart, householdSearch, selectedLocalityCode, selectedSiteId]);

  useEffect(() => {
    requestVersion.current += 1;
    setHouseholds([]);
    setFieldWorkers([]);
    setWorkerIdsByHouseholdId({});
    setHasViewed(false);
    setTableLoading(false);
    setAllSelectionLoading(false);
  }, [selectedLocalityCode, selectedSiteId]);

  useEffect(() => {
    async function loadMasters() {
      setLoading(true);
      setError("");
      try {
        const [siteData, localityData] = await Promise.all([
          api.get<Site[]>("/masters/sites"),
          api.get<Locality[]>("/masters/localities"),
        ]);
        setSites(siteData);
        setLocalities(localityData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sites and localities");
      } finally {
        setLoading(false);
      }
    }

    void loadMasters();
  }, []);

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

  async function loadAssignmentTable(options: { resetSelection: boolean }) {
    const version = ++requestVersion.current;
    const requestedFilterKey = filterKey;
    const isCurrent = () => version === requestVersion.current && requestedFilterKey === currentFilterKey.current;
    setError("");
    setMessage("");
    setHasViewed(true);
    if (options.resetSelection) {
      setSelectedHouseholdIds([]);
      setWorkerIdsByHouseholdId({});
    }
    setOpenWorkerMenuFor(null);
    setBulkAssignOpen(false);
    setHouseholdPage(1);

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
      if (householdRangeStart.trim()) params.set("household_start", householdRangeStart.trim());
      if (householdRangeEnd.trim()) params.set("household_end", householdRangeEnd.trim());

      const [householdResult, workerData] = await Promise.all([
        api.get<Household[]>(`/field-worker-household-assignments?${params.toString()}`),
        api.get<User[]>(
          `/users?site_id=${encodeURIComponent(selectedSiteId)}&role=field_worker&active=1`,
        ),
      ]);

      if (!isCurrent()) return;

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
      setFieldWorkers(workerData);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "Failed to load assignment table");
      setHouseholds([]);
      setFieldWorkers([]);
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
      const ids = rows.map((household) => household.household_id);
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
        });
      }
      await loadAssignmentTable({ resetSelection: false });
      setWorkerIdsByHouseholdId((current) => {
        const next = { ...current };
        selectedHouseholdIds.forEach((householdId) => {
          next[householdId] = [];
        });
        return next;
      });
      setSelectedHouseholdIds([]);
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
      setWorkerIdsByHouseholdId((current) => {
        const selected = current[householdId] ?? [];
        return { ...current, [householdId]: selected.filter((userId) => userId !== worker.user_id) };
      });
      await loadAssignmentTable({ resetSelection: false });
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
      await loadAssignmentTable({ resetSelection: false });
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
            disabled={loading || busy}
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
            <div className={styles.toolbarActions}>
              <label className={styles.selectAllLabel}>
                <input type="checkbox" aria-label="Select all households in selected site/locality" checked={allScopeSelected} disabled={busy || !selectedSiteId}
                  onChange={(event) => void selectAllInScope(event.target.checked)} />
                Select all households in selected site/locality (ignores range and search)
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

          {tableLoading ? (
            <div className={styles.emptyState}>Loading households...</div>
          ) : searchedHouseholds.length === 0 ? (
            <div className={styles.emptyState}>No households found for the selected filters</div>
          ) : (
            <>
              <div className={styles.tableWrap} style={openWorkerMenuFor ? { paddingBottom: 240 } : undefined}>
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
                    const pickedWorkers = selectedWorkers(fieldWorkers, selectedWorkerIds);
                    const isOpen = openWorkerMenuFor === household.household_id;
                    return (
                      <tr key={household.household_id}>
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
                              onClick={() =>
                                !busy && setOpenWorkerMenuFor(isOpen ? null : household.household_id)
                              }
                              onKeyDown={(event) => {
                                if (!busy && (event.key === "Enter" || event.key === " ")) {
                                  event.preventDefault();
                                  setOpenWorkerMenuFor(isOpen ? null : household.household_id);
                                }
                              }}
                            >
                              <span>Select field workers</span>
                              <span aria-hidden="true">v</span>
                            </div>
                            {isOpen && (
                              <div className={styles.workerMenu}>
                                {fieldWorkers.length === 0 ? (
                                  <p>No active field workers for this site</p>
                                ) : (
                                  fieldWorkers.map((worker) => (
                                    <label key={worker.user_id} className={styles.workerOption}>
                                      <input
                                        type="checkbox"
                                        disabled={busy}
                                        checked={selectedWorkerIds.includes(worker.user_id)}
                                        onChange={() =>
                                          toggleWorkerForHousehold(household.household_id, worker.user_id)
                                        }
                                      />
                                      <span>{workerLabel(worker)}</span>
                                    </label>
                                  ))
                                )}
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
                    disabled={currentHouseholdPage <= 1}
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
                    disabled={currentHouseholdPage >= totalHouseholdPages}
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
          <div className={styles.bulkModal}>
            <div className={styles.bulkModalHeader}>
              <h2>Assign Selected Households</h2>
              <button type="button" onClick={() => setBulkAssignOpen(false)}>x</button>
            </div>
            <p>{selectedHouseholdIds.length} selected household rows</p>
            <div className={styles.bulkWorkerList}>
              {fieldWorkers.length === 0 ? (
                <div className={styles.emptyState}>No active field workers for this site</div>
              ) : (
                fieldWorkers.map((worker) => (
                  <label key={worker.user_id} className={styles.workerOption}>
                    <input
                      type="checkbox"
                      checked={bulkWorkerIds.includes(worker.user_id)}
                      onChange={() => toggleBulkWorker(worker.user_id)}
                    />
                    <span>{workerLabel(worker)}</span>
                  </label>
                ))
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
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
