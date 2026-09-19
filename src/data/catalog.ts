import { useEffect, useState } from "react";
import type { CatalogData } from "../domain/types";

let cached: Promise<CatalogData> | undefined;
export function loadCatalog(): Promise<CatalogData> {
  if (!cached) cached = Promise.all(["catalog", "requirements", "manifest"].map(async name => {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
    if (!response.ok) throw new Error("Unable to load the imported MIT catalog. Please retry.");
    return response.json();
  })).then(([courses, requirements, manifest]) => ({ courses, requirements, importedAt: manifest.importedAt }))
    .catch(error => { cached = undefined; throw error; });
  return cached;
}
export function useCatalog() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    loadCatalog().then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(String(reason.message)); });
    return () => { active = false; };
  }, [attempt]);
  return { data, error, retry: () => setAttempt(n => n + 1) };
}
