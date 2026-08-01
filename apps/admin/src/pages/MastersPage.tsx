import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./MastersPage.module.css";

interface Site {
  site_id: number;
  site_code: string;
  site_name: string;
}

interface Locality {
  site_id: number;
  locality_code: string;
  locality_name: string;
  locality_type?: string;
}

interface MappingFrame {
  household_id: string;
  structure_map_id: string;
  household_number: string;
  structure_id?: string;
  mapping_status: string;
  baseline_enrollment_status: string;
  consent_status?: string | null;
  can_delete?: boolean;
  site_id?: number;
  locality_code?: string;
}

interface MappingImportPreviewRow {
  source_line: number;
  household_id?: string;
  site_id?: number;
  locality_code?: string;
  structure_map_id?: string;
  household_number?: string;
  structure_id?: string;
  address?: string;
  household_head_name?: string;
  comments?: string;
  status: "ready" | "duplicate" | "error";
  errors: string[];
}

interface MappingImportPreview {
  rows: MappingImportPreviewRow[];
  ready: number;
  duplicate: number;
  invalid: number;
}

interface MappingImportUpload {
  upload_id: string;
  uploaded_at: string;
  site_id: number;
  original_file_name: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  original_csv_path: string;
  matched_csv_path: string;
  unmatched_csv_path: string;
}

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<"sites" | "localities" | "mapping">("sites");
  const [sites, setSites] = useState<Site[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [mappingFrames, setMappingFrames] = useState<MappingFrame[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [loadingMappingFrames, setLoadingMappingFrames] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSites();
    loadLocalities();
    loadMappingFrames();
  }, []);

  async function loadSites() {
    setLoadingSites(true);
    setError("");
    try {
      const data = await api.get<Site[]>("/masters/sites");
      setSites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites");
    } finally {
      setLoadingSites(false);
    }
  }

  async function loadLocalities() {
    setLoadingLocalities(true);
    setError("");
    try {
      const data = await api.get<Locality[]>("/masters/localities");
      setLocalities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load localities");
    } finally {
      setLoadingLocalities(false);
    }
  }

  async function handleCreateSite(formData: Site) {
    setError("");
    try {
      await api.post<Site>("/masters/sites", formData);
      await loadSites();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create site";
      setError(message);
      throw new Error(message);
    }
  }

  async function loadMappingFrames() {
    setLoadingMappingFrames(true);
    setError("");
    try {
      const result = await api.getPage<MappingFrame[]>("/masters/mapping-frame?per_page=500");
      setMappingFrames(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mapping frame");
    } finally {
      setLoadingMappingFrames(false);
    }
  }

  async function handleUpdateSite(siteId: number, formData: Omit<Site, "site_id">) {
    setError("");
    try {
      await api.patch<Site>(`/masters/sites/${siteId}`, formData);
      await loadSites();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update site";
      setError(message);
      throw new Error(message);
    }
  }

  async function handleUpdateLocality(
    siteId: number,
    localityCode: string,
    formData: Pick<Locality, "locality_code" | "locality_name" | "locality_type">,
  ) {
    setError("");
    try {
      await api.patch<Locality>(
        `/masters/localities/${siteId}/${encodeURIComponent(localityCode)}`,
        formData,
      );
      await loadLocalities();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update locality";
      setError(message);
      throw new Error(message);
    }
  }

  return (
    <div className={styles.container}>
      <h1>Study Masters</h1>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "sites" ? styles.active : ""}`}
          onClick={() => setActiveTab("sites")}
        >
          Sites
        </button>
        <button
          className={`${styles.tab} ${activeTab === "localities" ? styles.active : ""}`}
          onClick={() => setActiveTab("localities")}
        >
          Localities
        </button>
        <button
          className={`${styles.tab} ${activeTab === "mapping" ? styles.active : ""}`}
          onClick={() => setActiveTab("mapping")}
        >
          Add Households
        </button>
      </div>

      <div className={styles.tabContent}>
        {activeTab === "sites" && (
          <SitesTab
            sites={sites}
            loading={loadingSites}
            onCreateSite={handleCreateSite}
            onUpdateSite={handleUpdateSite}
          />
        )}
        {activeTab === "localities" && (
          <LocalitiesTab
            sites={sites}
            localities={localities}
            loading={loadingLocalities}
            onUpdateLocality={handleUpdateLocality}
          />
        )}
        {activeTab === "mapping" && (
          <MappingTab
            sites={sites}
            mappingFrames={mappingFrames}
            loading={loadingMappingFrames}
            onRefresh={loadMappingFrames}
          />
        )}
      </div>
    </div>
  );
}

function SitesTab({
  sites,
  loading,
  onCreateSite,
  onUpdateSite,
}: {
  sites: Site[];
  loading: boolean;
  onCreateSite: (data: Site) => Promise<void>;
  onUpdateSite: (siteId: number, data: Omit<Site, "site_id">) => Promise<void>;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);

  return (
    <div>
      <div className={styles.tabHeader}>
        <h2>Study Sites</h2>
        <button className={styles.primaryBtn} onClick={() => setShowCreateModal(true)}>
          Add Site
        </button>
      </div>

      {loading ? (
        <p>Loading sites...</p>
      ) : sites.length === 0 ? (
        <div className={styles.empty}>No sites found</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Site ID</th>
                <th>Site Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.site_id}>
                  <td>{site.site_id}</td>
                  <td>{site.site_name}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setEditingSite(site)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateSiteModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (data) => {
            await onCreateSite(data);
            setShowCreateModal(false);
          }}
        />
      )}

      {editingSite && (
        <EditSiteModal
          site={editingSite}
          onClose={() => setEditingSite(null)}
          onSubmit={async (data) => {
            await onUpdateSite(editingSite.site_id, data);
            setEditingSite(null);
          }}
        />
      )}
    </div>
  );
}

function CreateSiteModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: Site) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    site_id: "",
    site_name: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit({
        site_id: Number(formData.site_id),
        site_code: formData.site_id.trim(),
        site_name: formData.site_name.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create site");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Add Site</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close">
            X
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="site-id">Site ID *</label>
            <input
              id="site-id"
              type="number"
              min="1"
              value={formData.site_id}
              onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="site-name">Site Name *</label>
            <input
              id="site-name"
              type="text"
              value={formData.site_name}
              onChange={(e) => setFormData({ ...formData, site_name: e.target.value })}
              required
            />
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={styles.primaryBtn}>
              {saving ? "Saving..." : "Save Site"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditSiteModal({
  site,
  onClose,
  onSubmit,
}: {
  site: Site;
  onClose: () => void;
  onSubmit: (data: Omit<Site, "site_id">) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    site_name: site.site_name,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit({
        site_code: String(site.site_id),
        site_name: formData.site_name.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update site");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Edit Site</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close">
            X
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="edit-site-id">Site ID</label>
            <input id="edit-site-id" type="number" value={site.site_id} disabled />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="edit-site-name">Site Name *</label>
            <input
              id="edit-site-name"
              type="text"
              value={formData.site_name}
              onChange={(e) => setFormData({ ...formData, site_name: e.target.value })}
              required
            />
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={styles.primaryBtn}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LocalitiesTab({
  sites,
  localities,
  loading,
  onUpdateLocality,
}: {
  sites: Site[];
  localities: Locality[];
  loading: boolean;
  onUpdateLocality: (
    siteId: number,
    localityCode: string,
    data: Pick<Locality, "locality_code" | "locality_name" | "locality_type">,
  ) => Promise<void>;
}) {
  const siteNamesById = new Map(sites.map((site) => [site.site_id, site.site_name]));
  const [editingLocality, setEditingLocality] = useState<Locality | null>(null);

  return (
    <div>
      <div className={styles.tabHeader}>
        <h2>Study Localities</h2>
        <button className={styles.primaryBtn}>Add Locality</button>
      </div>

      {loading ? (
        <p>Loading localities...</p>
      ) : localities.length === 0 ? (
        <div className={styles.empty}>No localities found</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Site Name</th>
                <th>Site ID</th>
                <th>Locality Code</th>
                <th>Locality Name</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {localities.map((loc) => (
                <tr key={`${loc.site_id}-${loc.locality_code}`}>
                  <td>{siteNamesById.get(loc.site_id) || "—"}</td>
                  <td>{loc.site_id}</td>
                  <td>{loc.locality_code}</td>
                  <td>{loc.locality_name}</td>
                  <td>{loc.locality_type || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setEditingLocality(loc)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingLocality && (
        <EditLocalityModal
          locality={editingLocality}
          siteName={siteNamesById.get(editingLocality.site_id) || ""}
          onClose={() => setEditingLocality(null)}
          onSubmit={async (data) => {
            await onUpdateLocality(editingLocality.site_id, editingLocality.locality_code, data);
            setEditingLocality(null);
          }}
        />
      )}
    </div>
  );
}

function EditLocalityModal({
  locality,
  siteName,
  onClose,
  onSubmit,
}: {
  locality: Locality;
  siteName: string;
  onClose: () => void;
  onSubmit: (data: Pick<Locality, "locality_code" | "locality_name" | "locality_type">) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    locality_code: locality.locality_code,
    locality_name: locality.locality_name,
    locality_type: locality.locality_type || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit({
        locality_code: formData.locality_code.trim(),
        locality_name: formData.locality_name.trim(),
        locality_type: formData.locality_type.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update locality");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Edit Locality</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close">
            X
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="edit-locality-site">Site</label>
            <input
              id="edit-locality-site"
              type="text"
              value={`${siteName || "Site"} (${locality.site_id})`}
              disabled
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="edit-locality-code">Locality Code *</label>
            <input
              id="edit-locality-code"
              type="text"
              inputMode="numeric"
              maxLength={2}
              pattern="[0-9]{2}"
              title="Enter exactly 2 digits"
              value={formData.locality_code}
              onChange={(e) => setFormData({ ...formData, locality_code: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="edit-locality-name">Locality Name *</label>
            <input
              id="edit-locality-name"
              type="text"
              value={formData.locality_name}
              onChange={(e) => setFormData({ ...formData, locality_name: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="edit-locality-type">Type</label>
            <select
              id="edit-locality-type"
              value={formData.locality_type}
              onChange={(e) => setFormData({ ...formData, locality_type: e.target.value })}
            >
              <option value="">Not set</option>
              <option value="urban">Urban</option>
              <option value="rural">Rural</option>
            </select>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={styles.primaryBtn}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MappingTab({
  sites,
  mappingFrames,
  loading,
  onRefresh,
}: {
  sites: Site[];
  mappingFrames: MappingFrame[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [siteFilter, setSiteFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUploadsModal, setShowUploadsModal] = useState(false);
  const [uploads, setUploads] = useState<MappingImportUpload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [uploadsError, setUploadsError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = mappingFrames.filter((m) => {
    const matchesSite = siteFilter ? m.site_id?.toString() === siteFilter : true;
    const searchTerm = search.trim().toLowerCase();
    const matchesSearch = searchTerm
      ? [m.household_id, m.structure_map_id, m.structure_id, m.locality_code]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchTerm))
      : true;
    return matchesSite && matchesSearch;
  });
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [siteFilter, search]);

  async function openUploadsModal() {
    setShowUploadsModal(true);
    setUploadsLoading(true);
    setUploadsError("");
    try {
      const data = await api.get<MappingImportUpload[]>("/masters/mapping-frame/import-uploads");
      setUploads(data);
    } catch (err) {
      setUploadsError(err instanceof Error ? err.message : "Failed to load unmatched uploads");
    } finally {
      setUploadsLoading(false);
    }
  }

  async function handleDelete(frame: MappingFrame) {
    if (!window.confirm("Are you sure you want to delete?")) {
      return;
    }

    setDeleteError("");
    setDeletingId(frame.household_id);
    try {
      await api.delete<{ deleted: string }>(
        `/masters/mapping-frame/${encodeURIComponent(frame.household_id)}`,
      );
      await onRefresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete household");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div>
      <div className={styles.tabHeader}>
        <h2>Add Households</h2>
        <div className={styles.filterGroup}>
          <input
            type="text"
            placeholder="Search structure_map_id..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All Sites</option>
            {sites.map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {site.site_name} ({site.site_id})
              </option>
            ))}
          </select>
          <button className={styles.primaryBtn} onClick={() => setShowImportModal(true)}>
            Import CSV
          </button>
          <button className={styles.secondaryBtn} onClick={openUploadsModal}>
            Unmatched Uploads
          </button>
        </div>
      </div>

      {deleteError && <div className={styles.error}>{deleteError}</div>}

      {loading ? (
        <div className={styles.empty}>Loading households...</div>
      ) : mappingFrames.length === 0 ? (
        <div className={styles.empty}>No household data found</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No household rows match the filters</div>
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Household ID</th>
                  <th>Site</th>
                  <th>Locality</th>
                  <th>Structure</th>
                  <th>Household</th>
                  <th>Household consent given</th>
                  <th>Baseline Enrollment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((frame) => (
                  <tr key={frame.household_id}>
                    <td>{frame.household_id}</td>
                    <td>{frame.site_id || "—"}</td>
                    <td>{frame.locality_code || "—"}</td>
                    <td>{frame.structure_map_id}</td>
                    <td>{frame.household_number}</td>
                    <td>{formatConsent(frame.consent_status)}</td>
                    <td>{frame.baseline_enrollment_status}</td>
                    <td>
                      {frame.can_delete ? (
                        <button
                          type="button"
                          className={styles.dangerBtn}
                          onClick={() => handleDelete(frame)}
                          disabled={deletingId === frame.household_id}
                        >
                          {deletingId === frame.household_id ? "Deleting..." : "Delete"}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className={styles.pageBtn}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              className={styles.pageBtn}
            >
              Next
            </button>
          </div>
        </>
      )}

      {showImportModal && (
        <MappingCsvImportModal
          sites={sites}
          onClose={() => setShowImportModal(false)}
          onImported={async () => {
            await onRefresh();
            setShowImportModal(false);
          }}
        />
      )}
      {showUploadsModal && (
        <MappingUploadsModal
          uploads={uploads}
          loading={uploadsLoading}
          error={uploadsError}
          onClose={() => setShowUploadsModal(false)}
        />
      )}
    </div>
  );
}

function MappingCsvImportModal({
  sites,
  onClose,
  onImported,
}: {
  sites: Site[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MappingImportPreview | null>(null);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewPage, setPreviewPage] = useState(1);
  const canImport = Boolean(selectedSiteId && file && preview && preview.ready > 0);
  const previewPageSize = 100;
  const filteredPreviewRows = preview
    ? preview.rows.filter((row) => {
        const term = previewSearch.trim().toLowerCase();
        if (!term) return true;
        return [
          row.source_line,
          row.household_id,
          row.site_id,
          row.locality_code,
          row.structure_map_id,
          row.household_number,
          row.household_head_name,
          row.address,
          row.comments,
          row.status,
          ...row.errors,
        ]
          .filter((value) => value !== undefined && value !== null)
          .some((value) => String(value).toLowerCase().includes(term));
      })
    : [];
  const previewTotalPages = Math.max(1, Math.ceil(filteredPreviewRows.length / previewPageSize));
  const paginatedPreviewRows = filteredPreviewRows.slice(
    (previewPage - 1) * previewPageSize,
    previewPage * previewPageSize,
  );

  useEffect(() => {
    setPreviewPage(1);
  }, [preview, previewSearch]);

  function buildFormData() {
    if (!selectedSiteId) throw new Error("Select a study site first");
    if (!file) throw new Error("Choose a CSV file first");
    const formData = new FormData();
    formData.append("site_id", selectedSiteId);
    formData.append("file", file);
    return formData;
  }

  async function handlePreview() {
    setError("");
    setPreview(null);
    setPreviewing(true);
    try {
      const result = await api.upload<MappingImportPreview>(
        "/masters/mapping-frame/import-csv/preview",
        buildFormData(),
      );
      setPreview(result);
      setPreviewSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview CSV");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!window.confirm("Are you sure you want to import the csv?")) return;
    setError("");
    setImporting(true);
    try {
      await api.upload<{ inserted: number; skipped: number }>(
        "/masters/mapping-frame/import-csv",
        buildFormData(),
      );
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={styles.modal}>
      <div className={`${styles.modalContent} ${styles.wideModalContent}`}>
        <div className={styles.modalHeader}>
          <h2>Import Household CSV</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close">
            X
          </button>
        </div>

        <div className={styles.importBody}>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formGroupInline}>
            <label htmlFor="mapping-import-site">Study Site</label>
            <select
              id="mapping-import-site"
              value={selectedSiteId}
              onChange={(event) => {
                setSelectedSiteId(event.target.value);
                setFile(null);
                setPreview(null);
                setError("");
              }}
            >
              <option value="">Select site</option>
              {sites.map((site) => (
                <option key={site.site_id} value={site.site_id}>
                  {site.site_id} - {site.site_name}
                </option>
              ))}
            </select>
          </div>

          {selectedSiteId && (
            <div className={styles.fileRow}>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] || null;
                  if (nextFile && !nextFile.name.toLowerCase().endsWith(".csv")) {
                    setFile(null);
                    setPreview(null);
                    setError("Only CSV files are allowed");
                    event.target.value = "";
                    return;
                  }
                  setFile(nextFile);
                  setPreview(null);
                  setError("");
                }}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handlePreview}
                disabled={!file || previewing}
              >
                {previewing ? "Previewing..." : "Preview"}
              </button>
            </div>
          )}

          {preview && (
            <>
              <div className={styles.previewSummary}>
                <span>{preview.ready} ready</span>
                <span>{preview.duplicate} duplicate</span>
                <span>{preview.invalid} invalid</span>
              </div>
              <div className={styles.previewToolbar}>
                <input
                  type="text"
                  value={previewSearch}
                  onChange={(event) => setPreviewSearch(event.target.value)}
                  placeholder="Search preview rows..."
                />
                <span>
                  Showing {filteredPreviewRows.length === 0 ? 0 : (previewPage - 1) * previewPageSize + 1}-
                  {Math.min(previewPage * previewPageSize, filteredPreviewRows.length)} of{" "}
                  {filteredPreviewRows.length}
                </span>
              </div>
              <div className={styles.previewTableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>HHID</th>
                      <th>Site</th>
                      <th>Locality</th>
                      <th>Structure</th>
                      <th>HH No.</th>
                      <th>Head</th>
                      <th>Address</th>
                      <th>Comments</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPreviewRows.map((row) => (
                      <tr key={`${row.source_line}-${row.household_id || row.status}`}>
                        <td>{row.source_line}</td>
                        <td>{row.household_id || "—"}</td>
                        <td>{row.site_id || "—"}</td>
                        <td>{row.locality_code || "—"}</td>
                        <td>{row.structure_map_id || "—"}</td>
                        <td>{row.household_number || "—"}</td>
                        <td>{row.household_head_name || "—"}</td>
                        <td>{row.address || "—"}</td>
                        <td>{row.comments || "—"}</td>
                        <td>
                          <span
                            className={`${styles.statusPill} ${
                              row.status === "error" ? styles.invalid : styles[row.status]
                            }`}
                          >
                            {row.status}
                          </span>
                          {row.errors.length > 0 && (
                            <div className={styles.rowError}>{row.errors.join("; ")}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.previewPagination}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={previewPage === 1}
                  onClick={() => setPreviewPage(previewPage - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {previewPage} of {previewTotalPages}
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={previewPage === previewTotalPages}
                  onClick={() => setPreviewPage(previewPage + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" onClick={onClose} className={styles.secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canImport || importing}
            className={styles.primaryBtn}
            onClick={handleImport}
          >
            {importing ? "Adding..." : "Add Data"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatConsent(value?: string | null): string {
  if (!value) return "No";
  const normalized = String(value).trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) return "Yes";
  if (["no", "n", "false", "0"].includes(normalized)) return "No";
  return "No";
}

function formatUploadDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

async function downloadUploadFile(upload: MappingImportUpload, kind: "matched" | "unmatched") {
  const blob = await api.download(
    `/masters/mapping-frame/import-uploads/${encodeURIComponent(upload.upload_id)}/${kind}`,
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${upload.upload_id}-${kind}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function MappingUploadsModal({
  uploads,
  loading,
  error,
  onClose,
}: {
  uploads: MappingImportUpload[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const [downloadError, setDownloadError] = useState("");

  async function handleDownload(upload: MappingImportUpload, kind: "matched" | "unmatched") {
    setDownloadError("");
    try {
      await downloadUploadFile(upload, kind);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to download upload CSV");
    }
  }

  return (
    <div className={styles.modal}>
      <div className={`${styles.modalContent} ${styles.wideModalContent}`}>
        <div className={styles.modalHeader}>
          <h2>Unmatched Uploads</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close">
            X
          </button>
        </div>

        <div className={styles.importBody}>
          {(error || downloadError) && <div className={styles.error}>{error || downloadError}</div>}
          {loading ? (
            <div className={styles.empty}>Loading uploads...</div>
          ) : uploads.length === 0 ? (
            <div className={styles.empty}>No upload history found</div>
          ) : (
            <div className={styles.previewTableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Upload Date</th>
                    <th>Site ID</th>
                    <th>Original File</th>
                    <th>Matched</th>
                    <th>Unmatched</th>
                    <th>Matched CSV</th>
                    <th>Unmatched CSV</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr key={upload.upload_id}>
                      <td>{formatUploadDate(upload.uploaded_at)}</td>
                      <td>{upload.site_id}</td>
                      <td>{upload.original_file_name}</td>
                      <td>{upload.matched_rows}</td>
                      <td>{upload.unmatched_rows}</td>
                      <td>
                        <div className={styles.pathText}>{fileNameFromPath(upload.matched_csv_path)}</div>
                        <button
                          type="button"
                          className={styles.smallBtn}
                          onClick={() => handleDownload(upload, "matched")}
                        >
                          Download
                        </button>
                      </td>
                      <td>
                        <div className={styles.pathText}>{fileNameFromPath(upload.unmatched_csv_path)}</div>
                        <button
                          type="button"
                          className={styles.smallBtn}
                          onClick={() => handleDownload(upload, "unmatched")}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" onClick={onClose} className={styles.secondaryBtn}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
