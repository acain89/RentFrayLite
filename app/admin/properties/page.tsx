"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

type Property = {
  id: string;
  name: string;
  propertyCode: string;
  propertyType: string;
  isActive: boolean;
  contactName: string | null;
  contactEmail: string | null;
  unitCount: number;
  tierCount: number;
};

type PropertiesListResponse = {
  ok: boolean;
  properties: Property[];
  error?: string;
};

const PAGE_SIZE = 20;

export default function PropertiesPage() {
  const router = useRouter();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const trimmedSearch = useMemo(() => {
  const digits = search.replace(/\D/g, "").slice(0, 5);
  return digits.length >= 4 ? digits : "";
}, [search]);

  // ---------------- LOAD ----------------
  useEffect(() => {
  let active = true;

  const timeout = setTimeout(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const query = trimmedSearch
          ? `?propertyCode=${encodeURIComponent(trimmedSearch)}`
          : "";

        const res = await fetch(`/api/admin/properties/list${query}`, {
          cache: "no-store",
        });

        const data: PropertiesListResponse = await res.json();

        if (!active) return;

        if (!res.ok || !data.ok) {
          setError(data.error || "Failed to load properties.");
          setProperties([]);
          return;
        }

        setProperties(Array.isArray(data.properties) ? data.properties : []);
      } catch {
        if (!active) return;
        setError("Network error.");
        setProperties([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
  }, 250); // debounce

  return () => {
    active = false;
    clearTimeout(timeout);
  };
}, [trimmedSearch]);

  // ---------------- PAGINATION ----------------
  const totalPages = Math.max(1, Math.ceil(properties.length / PAGE_SIZE));

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return properties.slice(start, start + PAGE_SIZE);
  }, [properties, page]);

  // keep page valid
  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [totalPages, page]);

  // ---------------- NAV ----------------
  function handleRowClick(id: string) {
    router.push(`/admin/properties/${id}`);
  }

  // ---------------- UI ----------------
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {/* HEADER */}
        <div className={styles.header}>
          <h1>All Properties</h1>

          <Link href="/admin" className={styles.link}>
            ← Back to Admin
          </Link>
        </div>

        {/* SEARCH */}
        <div className={styles.searchRow}>
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search by property code"
            className={styles.input}
          />
        </div>

        {/* STATES */}
        {loading && <div>Loading...</div>}

        {!loading && error && (
          <div className={styles.error}>{error}</div>
        )}

        {!loading && !error && properties.length === 0 && (
  <div className={styles.empty}>
    {trimmedSearch
      ? "No properties match that code"
      : "No properties found"}
  </div>
)}

        {/* TABLE */}
        {!loading && !error && properties.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Units</th>
                  <th>Tiers</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {paginated.map((p) => (
                  <tr
                    key={p.id}
                    className={styles.row}
                    onClick={() => handleRowClick(p.id)}
                  >
                    <td>{p.name || "—"}</td>
                    <td>{p.propertyCode || "—"}</td>
                    <td>{p.unitCount ?? 0}</td>
                    <td>{p.tierCount ?? 0}</td>

                    <td>
                      {p.isActive ? (
                        <span className={styles.active}>Active</span>
                      ) : (
                        <span className={styles.inactive}>Inactive</span>
                      )}
                    </td>

                    <td>{p.contactName || "—"}</td>

                    <td>
                      <Link
                        href={`/admin/properties/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {!loading && !error && totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>

            <span>
              Page {page} / {totalPages}
            </span>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}