// Fetches the screening map's default demo area (a few thousand lots) from public ArcGIS services,
// caches the raw responses, and writes data/parcels.geojson.
//
// Politeness: about 10 requests total, sequential, with a pause between them. Re-runs read from the
// cache in data/raw/screening/ unless you pass --refresh. Per-ZIP fetching lives in the server
// (/api/zip/:zip) and uses the same logic from area-lib.mjs.
//
// Run: node scripts/fetch-parcels.mjs [--refresh]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArea } from "./area-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const cacheDir = path.join(dataDir, "raw", "screening");

// Study area: part of Anaheim Hills and adjacent unincorporated land along the Santa Ana River.
// Chosen because it mixes single-family, multifamily, commercial and specific-plan zoning, and has
// both flood and fire-hazard polygons. It is a demo area, not a recommendation.
const STUDY_AREA = { name: "Anaheim Hills / Santa Ana River (demo area)", bbox: [-117.8, 33.85, -117.765, 33.865] };

async function main() {
  console.log("Fetching (or reading cache) for", STUDY_AREA.name);
  const geo = await buildArea({
    studyArea: STUDY_AREA,
    area: { kind: "envelope", bbox: STUDY_AREA.bbox },
    cacheDir,
    refresh: process.argv.includes("--refresh"),
    log: (m) => console.log("  " + m),
  });
  fs.writeFileSync(path.join(dataDir, "parcels.geojson"), JSON.stringify(geo));
  const f = geo.features;
  console.log(JSON.stringify(geo.metadata.joins), "flood lots:", f.filter((x) => x.properties.flood_zone).length, "fire lots:", f.filter((x) => x.properties.fire_class).length);
}

main().catch((e) => { console.error(e); process.exit(1); });
