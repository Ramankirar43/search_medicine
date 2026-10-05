import React, { memo, useCallback, useEffect, useRef, useState } from "react";

const FDA_URL = "https://api.fda.gov/drug/label.json";
const searchCache = new Map();
const DETAIL_FIELDS = [
  "generic_name",
  "manufacturer_name",
  "product_type",
  "route",
  "dosage_form",
  "substance_name",
  "pharm_class_epc",
  "pharm_class_moa",
  "pharm_class_cs",
];
const LABEL_FIELDS = [
  ["spl_product_data_elements", "Product description"],
  ["active_ingredient", "Active ingredients"],
  ["purpose", "Purpose"],
  ["indications_and_usage", "Indications and usage"],
  ["warnings", "Warnings"],
];

function getDetailId() {
  return new URLSearchParams(window.location.search).get("medicine");
}

function getField(openfda, key) {
  const value = openfda?.[key];
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }
  return value || "";
}

async function fetchLabels(search, signal) {
  const params = new URLSearchParams({ search, limit: "20" });
  const response = await fetch(`${FDA_URL}?${params}`, { signal });

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`The FDA service returned an error (${response.status}).`);
  }

  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

const MedicineCard = memo(function MedicineCard({ medicine, onOpen }) {
  const openfda = medicine.openfda || {};
  const brand = getField(openfda, "brand_name") || "Medicine";
  const manufacturer = getField(openfda, "manufacturer_name");
  const generic = getField(openfda, "generic_name");
  const productType = getField(openfda, "product_type");
  const route = getField(openfda, "route");
  const dosageForm = getField(openfda, "dosage_form");
  const CardElement = medicine.id ? "a" : "article";
  const detailUrl = new URL(window.location.href);
  if (medicine.id) {
    detailUrl.searchParams.set("medicine", medicine.id);
  }

  return (
    <CardElement
      className={`medicine-card${medicine.id ? " medicine-card-link" : ""}`}
      href={medicine.id ? detailUrl.href : undefined}
      onClick={medicine.id ? (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpen(medicine);
      } : undefined}
    >
      <div className="card-heading">
        <h2>{brand}</h2>
        {manufacturer && <span className="manufacturer">{manufacturer}</span>}
      </div>
      <p className="generic">
        <strong>Generic:</strong> {generic || "Not listed"}
      </p>
      <div className="card-footer">
        <dl className="card-facts">
          {productType && (
            <div>
              <dt>Product type</dt>
              <dd>{productType}</dd>
            </div>
          )}
          {route && (
            <div>
              <dt>Route</dt>
              <dd>{route}</dd>
            </div>
          )}
          {dosageForm && (
            <div>
              <dt>Dosage form</dt>
              <dd>{dosageForm}</dd>
            </div>
          )}
        </dl>
        {medicine.id && (
          <span className="details-link">
            View full details <span aria-hidden="true">→</span>
          </span>
        )}
      </div>
    </CardElement>
  );
});

function MedicineDetails({ medicine, onBack }) {
  const openfda = medicine?.openfda || {};
  const fields = DETAIL_FIELDS
    .map((key) => [key, openfda[key]])
    .filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    );
  const labelSections = LABEL_FIELDS
    .map(([key, title]) => [key, title, medicine[key]])
    .filter(([, , value]) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    );

  return (
    <section className="detail-panel" aria-labelledby="detail-title">
      <button className="back-button" onClick={onBack}>
        ← Back to search
      </button>
      <h1 id="detail-title">
        {getField(openfda, "brand_name") || "Medicine details"}
      </h1>
      {fields.length > 0 ? (
        <dl className="detail-facts">
          {fields.map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>No additional FDA information is available for this medicine.</p>
      )}
      {labelSections.length > 0 && (
        <section className="label-information" aria-labelledby="label-info-title">
          <h2 id="label-info-title">Label information</h2>
          {labelSections.map(([key, title, value]) => (
            <section
              className={`label-section${key === "warnings" ? " label-warning" : ""}`}
              key={key}
              aria-labelledby={`label-${key}`}
            >
              <h3 id={`label-${key}`}>{title}</h3>
              {(Array.isArray(value) ? value : [value]).map((text, index) => (
                <p key={`${key}-${index}`}>{String(text)}</p>
              ))}
            </section>
          ))}
        </section>
      )}
      <p className="medical-disclaimer">
        FDA label information is provided for reference only and may be
        unvalidated. Do not rely on openFDA to make decisions regarding medical
        care. Consult a healthcare professional for medical advice.
      </p>
    </section>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState(getDetailId);
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchError, setSearchError] = useState("");
  const [detailMedicine, setDetailMedicine] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [detailError, setDetailError] = useState("");
  const latestSearch = useRef(0);

  useEffect(() => {
    function handlePopState() {
      setDetailId(getDetailId());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const requestNumber = ++latestSearch.current;
    if (!normalizedQuery) {
      setResults([]);
      setSearchError("");
      setSearchStatus("idle");
      return undefined;
    }

    if (normalizedQuery.length < 3) {
      setResults([]);
      setSearchError("");
      setSearchStatus("too-short");
      return undefined;
    }

    setSearchStatus("loading");
    let controller;
    const timer = window.setTimeout(() => {
      const cacheKey = normalizedQuery.toLocaleLowerCase();
      if (searchCache.has(cacheKey)) {
        setResults(searchCache.get(cacheKey));
        setSearchError("");
        setSearchStatus("success");
        return;
      }

      controller = new AbortController();
      setSearchStatus("loading");
      setSearchError("");

      fetchLabels(`openfda.brand_name:"${normalizedQuery.replaceAll('"', '\\"')}"`, controller.signal)
        .then((medicines) => {
          if (requestNumber !== latestSearch.current) return;
          searchCache.set(cacheKey, medicines);
          setResults(medicines);
          setSearchStatus("success");
        })
        .catch((error) => {
          if (error.name === "AbortError" || requestNumber !== latestSearch.current) return;
          setResults([]);
          setSearchStatus("error");
          setSearchError(error.message || "Unable to search the FDA database.");
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!detailId) {
      setDetailMedicine(null);
      setDetailError("");
      setDetailStatus("idle");
      return undefined;
    }

    const controller = new AbortController();
    setDetailMedicine(null);
    setDetailError("");
    setDetailStatus("loading");
    const search = `id:"${detailId.replaceAll('"', '\\"')}"`;

    fetchLabels(search, controller.signal)
      .then((medicines) => {
        if (controller.signal.aborted) return;
        if (!medicines.length) {
          setDetailStatus("not-found");
          return;
        }
        setDetailMedicine(medicines[0]);
        setDetailStatus("success");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setDetailError(error.message || "Unable to load this medicine.");
        setDetailStatus("error");
      });

    return () => controller.abort();
  }, [detailId]);

  const openMedicine = useCallback((medicine) => {
    if (!medicine.id) return;
    const url = new URL(window.location.href);
    url.searchParams.set("medicine", medicine.id);
    window.history.pushState({}, "", url);
    setDetailId(medicine.id);
  }, []);

  function backToSearch() {
    const url = new URL(window.location.href);
    url.searchParams.delete("medicine");
    window.history.pushState({}, "", url);
    setDetailId(null);
  }

  if (detailId) {
    return (
      <main className="page">
        {detailStatus === "loading" && (
          <p className="state" role="status">Loading medicine details…</p>
        )}
        {detailStatus === "error" && (
          <div className="state error" role="alert">
            <p>{detailError}</p>
            <button className="back-button" onClick={backToSearch}>← Back to search</button>
          </div>
        )}
        {detailStatus === "not-found" && (
          <div className="state">
            <p>Medicine details could not be found.</p>
            <button className="back-button" onClick={backToSearch}>← Back to search</button>
          </div>
        )}
        {detailStatus === "success" && (
          <MedicineDetails medicine={detailMedicine} onBack={backToSearch} />
        )}
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Medicine Directory by MediBuddy</h1>
        <p>Search the FDA database for drug labels, indications, and active ingredients.</p>
      </header>
      <label className="search-box">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <span className="visually-hidden">Search medicines by brand name</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by brand name (for example, Advil)"
        />
      </label>

      {searchStatus === "idle" && (
        <p className="state">Enter a brand name to search medicines.</p>
      )}
      {searchStatus === "too-short" && (
        <p className="state">Please enter at least 3 characters to search.</p>
      )}
      {searchStatus === "loading" && (
        <p className="state" role="status">Searching FDA medicine labels…</p>
      )}
      {searchStatus === "error" && (
        <div className="state error" role="alert">
          <strong>Search unavailable</strong>
          <p>{searchError}</p>
          <p>Please check your connection and try another search.</p>
        </div>
      )}
      {searchStatus === "success" && results.length === 0 && (
        <div className="state">
          <strong>No results found</strong>
          <p>We couldn’t find any medicines matching “{query.trim()}”. Please check the spelling or try a different term.</p>
        </div>
      )}
      {searchStatus === "success" && results.length > 0 && (
        <>
          <p className="result-count">{results.length} result{results.length === 1 ? "" : "s"}</p>
          <section className="medicine-grid" aria-label="Medicine search results">
            {results.map((medicine, index) => (
              <MedicineCard
                key={medicine.id || `${getField(medicine.openfda, "brand_name")}-${index}`}
                medicine={medicine}
                onOpen={openMedicine}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
