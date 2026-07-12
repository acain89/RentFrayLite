// app/admin/page.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

type Property = {
  id: string;
  name: string;
  propertyCode: string;
  propertyType: string;
  isActive: boolean;
  contactName: string;
  contactEmail: string;
  unitCount: number;
  tierCount: number;
  occupiedUnits: number;
};

export default function AdminPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminChecked, setAdminChecked] = useState(false);
  const [adminAllowed, setAdminAllowed] = useState(false);

  const [propertyCodeSearch, setPropertyCodeSearch] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const trimmedSearch = useMemo(
    () => propertyCodeSearch.replace(/\D/g, "").slice(0, 5),
    [propertyCodeSearch]
  );

  const totalOccupiedUnits = useMemo(
    () => properties.reduce((sum, property) => sum + property.occupiedUnits, 0),
    [properties]
  );

  const totalEffectiveUnits = useMemo(
    () => properties.reduce((sum, property) => sum + property.unitCount, 0),
    [properties]
  );

const totalProperties = useMemo(
  () => properties.length,
  [properties]
);

  const refresh = useCallback(() => {
    setRefreshTick((p) => p + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      try {
        const res = await fetch("/api/admin/session", {
          cache: "no-store",
          credentials: "include",
        });

        if (!active) return;

        if (!res.ok) {
          window.location.href = "/admin-login";
          return;
        }

        setAdminAllowed(true);
      } catch {
        if (!active) return;
        window.location.href = "/admin-login";
        return;
      } finally {
        if (active) setAdminChecked(true);
      }
    }

    void checkAdmin();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!adminChecked || !adminAllowed) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError("");

        const query = trimmedSearch
          ? `?propertyCode=${encodeURIComponent(trimmedSearch)}`
          : "";

        const res = await fetch(`/api/admin/properties${query}`, {
          cache: "no-store",
          credentials: "include",
        });

        const data = (await res.json()) as {
          error?: string;
          properties?: Property[];
        };

        if (!active) return;

        if (!res.ok) {
          setError(data.error || "Failed to load properties.");
          setProperties([]);
          return;
        }

        setProperties(data.properties || []);
      } catch {
        if (!active) return;
        setError("Network error.");
        setProperties([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [trimmedSearch, refreshTick, adminAllowed, adminChecked]);

  async function logout(): Promise<void> {
    try {
      await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "include",
      });
      window.location.href = "/";
    } catch {
      alert("Logout failed");
    }
  }

  if (!adminChecked) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>Checking admin access...</div>
      </main>
    );
  }

  if (!adminAllowed) {
    return null;
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>ADMIN</div>
            <h1 className={styles.title}>Dashboard</h1>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={refresh}
              className={styles.searchButton}
            >
              Refresh
            </button>

            <Link href="/setup" className={styles.primaryButton}>
              + New Property
            </Link>

            <button
              type="button"
              onClick={logout}
              className={styles.searchButton}
            >
              Logout
            </button>
          </div>
        </div>

        <div className={styles.searchCard}>
          <div className={styles.cardTitle}>Find a property</div>

          <input
            value={propertyCodeSearch}
            onChange={(e) => setPropertyCodeSearch(e.target.value)}
            placeholder="Property code"
            className={styles.searchInput}
          />
        </div>

        <div className={styles.searchCard}>
          <div className={styles.cardTitle}>Your properties</div>

          {!loading && properties.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Total Accounts / Units: {totalProperties}/{totalEffectiveUnits}
            </div>
          )}

          {loading && <div>Loading...</div>}
          {error && <div>{error}</div>}

          {!loading && properties.length === 0 && <div>No properties yet</div>}

          {!loading && properties.length > 0 && (
            <div className={styles.propertyList}>
              {properties.map((p) => (
                <div key={p.id} className={styles.propertyCard}>
                  <Link href={`/admin/properties/${p.id}`}>
                    <div className={styles.propertyName}>{p.name}</div>
                    <div className={styles.propertyMeta}>
                      Code: {p.propertyCode}
                    </div>
                    <div className={styles.propertyMeta}>
                      Occupied: {p.occupiedUnits}/{p.unitCount}
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Delete this property permanently?")) return;

                      const res = await fetch(`/api/admin/properties/${p.id}`, {
                        method: "DELETE",
                        credentials: "include",
                      });

                      if (!res.ok) {
                        setError("Failed to delete property.");
                        return;
                      }

                      refresh();
                    }}
                    style={{ marginTop: 8, color: "red" }}
                  >
                    Delete Property
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}