// Shared parcel-fetch logic for the screening map.
// Fetches lots for one area (a bounding box or a ZIP polygon) from the public ArcGIS layers listed in
// lanes/1-find-it/data/DATA-SOURCES.md, caches every raw response, then joins and tags each lot.
//
// Politeness (event rule: no scraping at volume): requests are sequential with a pause between them,
// retries back off, results are cached on disk, and callers can cap the number of lots.
import fs from "node:fs";
import path from "node:path";

export const LAYERS = {
  zoning: { url: "https://maps.scag.ca.gov/scaggis/rest/services/LDX/Zoning_poly_OR/MapServer/0", fields: "APN24,CITY,ZN24_CITY,ZN24_SCAG,ACRES,SLOPE,YEAR_ZN", pageSize: 2000 },
  parcels: { url: "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Parcels/FeatureServer/0", fields: "ASSESSMENT_NO,SITE_ADDRESS,YEAR_BUILT", pageSize: 1000 },
  flood: { url: "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Floodplains/MapServer/0", fields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF", pageSize: 1000 },
  fire: { url: "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Fire_Hazard_Severity_Zones_LRA/MapServer/0", fields: "HAZ_CLASS,HAZ_CODE,SRA,INCORP", pageSize: 1000 },
};
// ZIP boundaries: U.S. Census Bureau TIGERweb, 2020 Census ZIP Code Tabulation Areas (ZCTAs).
// ZCTAs approximate USPS ZIP delivery areas; they are not identical to them.
export const ZCTA_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1";

const UA = { "User-Agent": "adu-pathfinder-hackathon-prototype (cached, on-demand download)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE_MS = 1500;

// ArcGIS query, POST (polygon geometries can be long), with retries.
async function arcgisQuery(url, params, label, log) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}/query`, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ f: "json", ...params }), signal: AbortSignal.timeout(90000) });
      const body = await res.json();
      if (body.error) throw new Error(JSON.stringify(body.error));
      return body;
    } catch (err) {
      if (attempt >= 4) throw err;
      log(`${label}: the server is slow, retrying (${attempt} of 3)…`);
      await sleep(5000 * attempt);
    }
  }
}

function geometryParams(area) {
  if (area.kind === "envelope") return { geometry: area.bbox.join(","), geometryType: "esriGeometryEnvelope", inSR: "4326" };
  return { geometry: JSON.stringify({ rings: area.rings, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPolygon", inSR: "4326" };
}

export async function countInArea(key, area, log = () => {}) {
  const body = await arcgisQuery(LAYERS[key].url, { where: "1=1", ...geometryParams(area), spatialRel: "esriSpatialRelIntersects", returnCountOnly: "true" }, `${key} count`, log);
  return body.count ?? 0;
}

export async function fetchLayer(key, area, cacheDir, { refresh = false, log = () => {} } = {}) {
  const cacheFile = path.join(cacheDir, `${key}.json`);
  if (!refresh && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const { url, fields, pageSize } = LAYERS[key];
  // County layers (parcels, flood, fire) are only used for joining, so query them by the area's
  // bounding box: lighter for the county server than a long polygon. Zoning keeps the exact shape.
  const queryArea = key !== "zoning" && area.kind === "polygon" ? { kind: "envelope", bbox: area.bbox } : area;
  const features = [];
  for (let offset = 0; ; offset += pageSize) {
    const body = await arcgisQuery(url, {
      where: "1=1", ...geometryParams(queryArea), spatialRel: "esriSpatialRelIntersects", outSR: "4326",
      outFields: fields, returnGeometry: "true", geometryPrecision: "6", resultOffset: String(offset), resultRecordCount: String(pageSize),
    }, key, log);
    features.push(...(body.features || []));
    log(`${key}: ${features.length.toLocaleString()} features`);
    await sleep(PAUSE_MS);
    if (!body.exceededTransferLimit && (body.features || []).length < pageSize) break;
  }
  const out = { source: url, fetched: new Date().toISOString().slice(0, 10), bbox: area.bbox, features };
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

// Census ZCTA polygon for a 5-digit ZIP (lightly simplified to keep queries small).
export async function fetchZcta(zip, cacheDir, { refresh = false, log = () => {} } = {}) {
  const cacheFile = path.join(cacheDir, "zcta.json");
  if (!refresh && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const body = await arcgisQuery(ZCTA_URL, { where: `ZCTA5='${zip}'`, outFields: "ZCTA5,AREALAND", returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.0002", geometryPrecision: "6" }, "zcta", log);
  const f = (body.features || [])[0];
  if (!f || !f.geometry?.rings) return null;
  const out = { source: ZCTA_URL, fetched: new Date().toISOString().slice(0, 10), zip, rings: f.geometry.rings, bbox: bboxOf(f.geometry.rings), land_sq_mi: Math.round((f.attributes.AREALAND / 2589988) * 10) / 10 };
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

// ---------- geometry helpers (lon/lat, small areas so planar math is fine for point tests) ----------
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
export function centroid(rings) {
  const r = rings.reduce((best, x) => (Math.abs(ringArea(x)) > Math.abs(ringArea(best)) ? x : best), rings[0]);
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; a += f;
  }
  if (a === 0) return r[0];
  return [x / (3 * a), y / (3 * a)];
}
function inRing(pt, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Esri rings: outer rings clockwise, holes counter-clockwise. Even-odd over all rings handles holes.
export function inPolygon(pt, rings) { let c = 0; for (const r of rings) if (inRing(pt, r)) c++; return c % 2 === 1; }
export function bboxOf(rings) { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of rings) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; }
function bboxHit(b, p) { return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]; }

// A lot is "in" a hazard polygon if its centroid or any of its corner points is inside it.
// Approximate: a hazard polygon that only clips a lot edge between corners can be missed.
function testPoints(rings) { return [centroid(rings), ...rings[0]]; }
function findHazard(rings, hazards) {
  const pts = testPoints(rings);
  for (const h of hazards) {
    if (!pts.some((p) => bboxHit(h.bbox, p))) continue;
    if (pts.some((p) => inPolygon(p, h.rings))) return h.attributes;
  }
  return null;
}
const digits = (s) => String(s ?? "").replace(/\D/g, "");

// Fetch all four layers for an area and build the screening GeoJSON.
// area: { kind: "envelope", bbox } or { kind: "polygon", rings, bbox }
// clipRings: keep only lots whose centroid is inside these rings (used for ZIP areas).
export async function buildArea({ studyArea, area, cacheDir, clipRings = null, refresh = false, log = () => {}, extraMeta = {} }) {
  const zoning = await fetchLayer("zoning", area, cacheDir, { refresh, log });
  const parcels = await fetchLayer("parcels", area, cacheDir, { refresh, log });
  const flood = await fetchLayer("flood", area, cacheDir, { refresh, log });
  const fire = await fetchLayer("fire", area, cacheDir, { refresh, log });
  log("Joining layers and tagging hazards…");

  const prep = (layer) => layer.features.filter((f) => f.geometry?.rings).map((f) => ({ attributes: f.attributes, rings: f.geometry.rings, bbox: bboxOf(f.geometry.rings) }));
  // Only FEMA Special Flood Hazard Areas (SFHA_TF = "T", e.g. zones A/AE/AO/AH) count as a flood
  // hazard. Zone X polygons (SFHA_TF = "F") are kept only as context for the popup.
  const floodPolys = prep(flood).filter((p) => p.attributes.SFHA_TF === "T");
  const floodContext = prep(flood).filter((p) => p.attributes.SFHA_TF !== "T");
  const firePolys = prep(fire);
  const countyParcels = prep(parcels);
  const byApn = new Map(countyParcels.map((p) => [digits(p.attributes.ASSESSMENT_NO), p]));
  // Spatial index for the location fallback join (grid of ~0.005° cells).
  const CELL = 0.005, grid = new Map();
  const cellKey = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  for (const p of countyParcels) for (let gx = Math.floor(p.bbox[0] / CELL); gx <= Math.floor(p.bbox[2] / CELL); gx++) for (let gy = Math.floor(p.bbox[1] / CELL); gy <= Math.floor(p.bbox[3] / CELL); gy++) {
    const k = `${gx},${gy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
  }

  const out = [];
  let joinedByApn = 0, joinedBySpace = 0, clipped = 0;
  for (const f of zoning.features) {
    if (!f.geometry?.rings) continue;
    const rings = f.geometry.rings;
    const a = f.attributes;
    const c = centroid(rings);
    if (clipRings && !inPolygon(c, clipRings)) { clipped++; continue; }
    // Join county parcel (address, year built): APN first, then centroid-in-polygon.
    let cp = byApn.get(digits(a.APN24));
    if (cp) joinedByApn++;
    else {
      cp = (grid.get(cellKey(c[0], c[1])) || []).find((p) => bboxHit(p.bbox, c) && inPolygon(c, p.rings));
      if (cp) joinedBySpace++;
    }
    const fl = findHazard(rings, floodPolys);
    const flx = fl ? null : findHazard(rings, floodContext);
    const fi = findHazard(rings, firePolys);
    const yb = cp ? Number(cp.attributes.YEAR_BUILT) : NaN;
    out.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: rings },
      properties: {
        apn: a.APN24 || null,
        address: cp?.attributes.SITE_ADDRESS?.trim() || null,
        city: a.CITY || null,
        zoning_city: a.ZN24_CITY || null,
        zoning_scag: a.ZN24_SCAG && a.ZN24_SCAG.trim() ? a.ZN24_SCAG.trim() : null,
        acres: typeof a.ACRES === "number" ? Math.round(a.ACRES * 10000) / 10000 : null,
        slope: a.SLOPE ?? null,
        year_built: Number.isFinite(yb) && yb > 0 ? yb : null,
        year_built_known: Boolean(cp),
        flood_zone: fl ? (fl.FLD_ZONE || "unnamed") : null,
        flood_context: flx ? [flx.FLD_ZONE, flx.ZONE_SUBTY].filter((v) => v && v.trim()).join(": ") : null,
        fire_class: fi ? (fi.HAZ_CLASS || "unnamed") : null,
        centroid: c.map((v) => Math.round(v * 1e6) / 1e6),
      },
    });
  }

  const meta = {
    study_area: studyArea,
    generated: new Date().toISOString().slice(0, 10),
    hazard_method: "A lot is marked in a flood or fire zone if its centroid or any corner point falls inside a zone polygon. Approximate.",
    layers: Object.fromEntries(Object.entries({ zoning, parcels, flood, fire }).map(([k, v]) => [k, { url: v.source, fetched: v.fetched, features: v.features.length }])),
    joins: { lots: out.length, county_parcel_by_apn: joinedByApn, county_parcel_by_location: joinedBySpace, no_county_parcel: out.length - joinedByApn - joinedBySpace },
    ...extraMeta,
  };
  if (clipRings) meta.joins.outside_boundary_dropped = clipped;
  return { type: "FeatureCollection", metadata: meta, features: out };
}
