// Builds data/city-stats.json from the BackyardADU CSVs in data/raw/.
// Source: https://backyardadu.net/data/ (third party, derived from HCD APR Table A2). Downloaded 2026-11-07.
// Run: node scripts/build-stats.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = path.join(here, "..", "data", "raw");
const cities = JSON.parse(fs.readFileSync(path.join(here, "..", "data", "cities.json"), "utf8")).cities.map((c) => c.name);

function readCsv(file) {
  const [header, ...rows] = fs.readFileSync(path.join(raw, file), "utf8").trim().split(/\r?\n/);
  const keys = header.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [keys[i], v])));
}

const permits = readCsv("permits_ca.csv");
const builds = readCsv("build_times.csv");
const out = {
  about: "ADU permits issued per year and median days from building permit to certificate of occupancy, per city. THIRD-PARTY data from BackyardADU.net, derived from HCD Annual Progress Report (APR) Table A2. Cite the APR for anything official. Permit-to-CO only: it does NOT include the time before the permit (design, application, plan check).",
  sources: {
    permits: "https://backyardadu.net/data/permits_ca.csv",
    build_times: "https://backyardadu.net/data/build_times.csv",
    official: "https://data.ca.gov/dataset/housing-element-annual-progress-report-apr-data-by-jurisdiction-and-year"
  },
  downloaded: "2026-11-07",
  cities: {}
};
for (const name of cities) {
  const p = permits.filter((r) => r.Place === name && r.Type === "city" && Number(r.Year) >= 2019)
    .map((r) => ({ year: Number(r.Year), permits: Number(r.ADU_Permits), partial: r.Partial || null }));
  const b = builds.find((r) => r.Place === name && r.Type === "city");
  out.cities[name] = {
    permits_by_year: p,
    permit_to_co: b ? {
      pairs: Number(b.Pairs), median_days: Number(b.Median_Days), p25_days: Number(b.P25_Days), p75_days: Number(b.P75_Days),
      share_within_12mo: Number(b.Share_Within_12mo), share_within_24mo: Number(b.Share_Within_24mo)
    } : null
  };
}
fs.writeFileSync(path.join(here, "..", "data", "city-stats.json"), JSON.stringify(out, null, 2));
console.log("wrote city-stats.json for", Object.keys(out.cities).length, "cities");
