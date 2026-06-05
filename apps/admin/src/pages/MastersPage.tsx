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
  household_number: number;
  mapping_status: string;
  baseline_enrollment_status: string;
  site_id?: number;
  locality_code?: string;
}

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<"sites" | "localities" | "mapping">("sites");
  const [sites, setSites] = useState<Site[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [mappingFrames] = useState<MappingFrame[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSites();
    loadLocalities();
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
          Mapping Frame
        </button>
      </div>

      <div className={styles.tabContent}>
        {activeTab === "sites" && (
          <SitesTab sites={sites} loading={loadingSites} onCreateSite={handleCreateSite} />
        )}
        {activeTab === "localities" && (
          <LocalitiesTab sites={sites} localities={localities} loading={loadingLocalities} />
        )}
        {activeTab === "mapping" && <MappingTab mappingFrames={mappingFrames} />}
      </div>
    </div>
  );
}

function SitesTab({
  sites,
  loading,
  onCreateSite,
}: {
  sites: Site[];
  loading: boolean;
  onCreateSite: (data: Site) => Promise<void>;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);

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
                <th>Site Code</th>
                <th>Site Name</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.site_id}>
                  <td>{site.site_id}</td>
                  <td>{site.site_code}</td>
                  <td>{site.site_name}</td>
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
    site_code: "",
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
        site_code: formData.site_code.trim(),
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
            <label htmlFor="site-code">Site Code *</label>
            <input
              id="site-code"
              type="text"
              value={formData.site_code}
              onChange={(e) => setFormData({ ...formData, site_code: e.target.value })}
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

function LocalitiesTab({
  sites,
  localities,
  loading,
}: {
  sites: Site[];
  localities: Locality[];
  loading: boolean;
}) {
  const siteNamesById = new Map(sites.map((site) => [site.site_id, site.site_name]));

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MappingTab({ mappingFrames }: { mappingFrames: MappingFrame[] }) {
  const [siteFilter, setSiteFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = mappingFrames.filter((m) =>
    siteFilter ? m.site_id?.toString() === siteFilter : true,
  );
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <div>
      <div className={styles.tabHeader}>
        <h2>Mapping Frame</h2>
        <div className={styles.filterGroup}>
          <input
            type="text"
            placeholder="Search structure_map_id..."
            className={styles.searchInput}
          />
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All Sites</option>
          </select>
          <button className={styles.primaryBtn}>Import CSV</button>
        </div>
      </div>

      {mappingFrames.length === 0 ? (
        <div className={styles.empty}>No mapping frame data found</div>
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Household ID</th>
                  <th>Structure Map ID</th>
                  <th>Household Number</th>
                  <th>Mapping Status</th>
                  <th>Baseline Enrollment</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((frame) => (
                  <tr key={frame.household_id}>
                    <td>{frame.household_id}</td>
                    <td>{frame.structure_map_id}</td>
                    <td>{frame.household_number}</td>
                    <td>{frame.mapping_status}</td>
                    <td>{frame.baseline_enrollment_status}</td>
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
    </div>
  );
}
