import { useState } from "react";
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
  const [sites] = useState<Site[]>([]);
  const [localities] = useState<Locality[]>([]);
  const [mappingFrames] = useState<MappingFrame[]>([]);

  return (
    <div className={styles.container}>
      <h1>Study Masters</h1>

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
        {activeTab === "sites" && <SitesTab sites={sites} />}
        {activeTab === "localities" && <LocalitiesTab localities={localities} />}
        {activeTab === "mapping" && <MappingTab mappingFrames={mappingFrames} />}
      </div>
    </div>
  );
}

function SitesTab({ sites }: { sites: Site[] }) {
  return (
    <div>
      <div className={styles.tabHeader}>
        <h2>Study Sites</h2>
        <button className={styles.primaryBtn}>Add Site</button>
      </div>

      {sites.length === 0 ? (
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
    </div>
  );
}

function LocalitiesTab({ localities }: { localities: Locality[] }) {
  return (
    <div>
      <div className={styles.tabHeader}>
        <h2>Study Localities</h2>
        <button className={styles.primaryBtn}>Add Locality</button>
      </div>

      {localities.length === 0 ? (
        <div className={styles.empty}>No localities found</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Site ID</th>
                <th>Locality Code</th>
                <th>Locality Name</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {localities.map((loc) => (
                <tr key={`${loc.site_id}-${loc.locality_code}`}>
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
