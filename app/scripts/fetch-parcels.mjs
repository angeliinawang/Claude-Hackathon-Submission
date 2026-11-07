// Fetches ONE small study area (a few thousand lots) from public ArcGIS services, caches the raw
// responses, and writes data/parcels.geojson for the screening map.
//
// Politeness: about 10 requests total, sequential, with a pause between them. Re-runs read from the
// cache in data/raw/screening/ unless you pass --refresh.
//
// Run: node scripts/fetch-parcels.mjs [--refresh]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const cacheDir = path.join(dataDir, "raw", "screening");
fs.mkdirSync(cacheDir, { recursive: true });
const REFRESH = process.argv.includes("--refresh");

// Study area: part of Anaheim Hills and adjacent unincorporated land along the Santa Ana River.
// Chosen because it mixes single-family, multifamily, commercial and specific-plan zoning, and has
// both flood and fire-hazard polygons. It is a demo area, not a recommendation.
const STUDY_AREA = { name: "Anaheim Hills / Santa Ana River (demo area)", bbox: [-117.8, 33.85, -117.765, 33.865] };

const LAYERS = {
  zoning: {
    url: "https://maps.scag.ca.gov/scaggis/rest/services/LDX/Zoning_poly_OR/MapServer/0",
    fields: "APN24,CITY,ZN24_CITY,ZN24_SCAG,ACRES,SLOPE,YEAR_ZN",
    pageSize: 2000,
  },
  parcels: {
    url: "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Parcels/FeatureServer/0",
    fields: "ASSESSMENT_NO,SITE_ADDRESS,YEAR_BUILT",
    pageSize: 1000,
  },
  flood: {
    url: "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Floodplains/MapServer/0",
    fields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
    pageSize: 1000,
  },
  fire: {
    url: "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Fire_Hazard_Severity_Zones_LRA/MapServer/0",
    fields: "HAZ_CLASS,HAZ_CODE,SRA,INCORP",
    pageSize: 1000,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchLayer(key) {
  const cacheFile = path.join(cacheDir, `${key}.json`);
  if (!REFRESH && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const { url, fields, pageSize } = LAYERS[key];
  const features = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: STUDY_AREA.bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: fields,
      returnGeometry: "true",
      geometryPrecision: "6",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });
    let body;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${url}/query?${params}`, { headers: { "User-Agent": "adu-pathfinder-hackathon-prototype (one-time cached download)" } });
        body = await res.json();
        if (body.error) throw new Error(JSON.stringify(body.error));
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        console.warn(`  ${key}: retry ${attempt} after error: ${err.message}`);
        await sleep(3000 * attempt);
      }
    }
    features.push(...(body.features || []));
    console.log(`  ${key}: ${features.length} features`);
    await sleep(1500);
    if (!body.exceededTransferLimit && (body.features || []).length < pageSize) break;
  }
  const out = { source: url, fetched: new Date().toISOString().slice(0, 10), bbox: STUDY_AREA.bbox, features };
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

// ---------- geometry helpers (lon/lat, small area so planar math is fine for point tests) ----------
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
function centroid(rings) {
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
function inPolygon(pt, rings) { let c = 0; for (const r of rings) if (inRing(pt, r)) c++; return c % 2 === 1; }
function bboxOf(rings) { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of rings) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; }
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

async function main() {
  console.log("Fetching (or reading cache) for", STUDY_AREA.name);
  const zoning = await fetchLayer("zoning");
  const parcels = await fetchLayer("parcels");
  const flood = await fetchLayer("flood");
  const fire = await fetchLayer("fire");

  const prep = (layer) => layer.features.filter((f) => f.geometry?.rings).map((f) => ({ attributes: f.attributes, rings: f.geometry.rings, bbox: bboxOf(f.geometry.rings) }));
  // Only FEMA Special Flood Hazard Areas (SFHA_TF = "T", e.g. zones A/AE/AO/AH) count as a flood
  // hazard. Zone X polygons (SFHA_TF = "F") are kept only as context for the popup.
  const floodPolys = prep(flood).filter((p) => p.attributes.SFHA_TF === "T");
  const floodContext = prep(flood).filter((p) => p.attributes.SFHA_TF !== "T");
  const firePolys = prep(fire);
  const countyParcels = prep(parcels);
  const byApn = new Map(countyParcels.map((p) => [digits(p.attributes.ASSESSMENT_NO), p]));

  const out = [];
  let joinedByApn = 0, joinedBySpace = 0;
  for (const f of zoning.features) {
    if (!f.geometry?.rings) continue;
    const rings = f.geometry.rings;
    const a = f.attributes;
    const c = centroid(rings);
    // Join county parcel (address, year built): APN first, then centroid-in-polygon.
    let cp = byApn.get(digits(a.APN24));
    if (cp) joinedByApn++;
    else {
      cp = countyParcels.find((p) => bboxHit(p.bbox, c) && inPolygon(c, p.rings));
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
    study_area: STUDY_AREA,
    generated: new Date().toISOString().slice(0, 10),
    hazard_method: "A lot is marked in a flood or fire zone if its centroid or any corner point falls inside a zone polygon. Approximate.",
    layers: Object.fromEntries(Object.entries({ zoning, parcels, flood, fire }).map(([k, v]) => [k, { url: v.source, fetched: v.fetched, features: v.features.length }])),
    joins: { lots: out.length, county_parcel_by_apn: joinedByApn, county_parcel_by_location: joinedBySpace, no_county_parcel: out.length - joinedByApn - joinedBySpace },
  };
  fs.writeFileSync(path.join(dataDir, "parcels.geojson"), JSON.stringify({ type: "FeatureCollection", metadata: meta, features: out }));
  console.log(JSON.stringify(meta.joins), "flood lots:", out.filter((x) => x.properties.flood_zone).length, "fire lots:", out.filter((x) => x.properties.fire_class).length);
}

main().catch((e) => { console.error(e); process.exit(1); });
