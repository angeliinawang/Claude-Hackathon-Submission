// Parcel eligibility screening engine. Pure functions, no DOM.
// Works in the browser (window.Screening) and in Node (module.exports) for testing.
//
// Results per test: "pass" | "fail" | "unknown" | "flag"
// State per path:   "likely" | "possible" | "unknown" | "no" | "flag"
//
// Rules come from data/screening-rules.json. This file contains NO thresholds of its own: a test
// whose value is not supplied returns "unknown".
(function (root) {
  "use strict";

  const SQFT_PER_ACRE = 43560; // unit conversion, not a rule

  function zoneCategoryOf(code, rules) {
    for (const [id, cat] of Object.entries(rules.zone_categories)) if (cat.codes.includes(code)) return { id, ...cat };
    return null;
  }

  function zoneText(lot, rules) {
    const cat = lot.zoning_scag ? zoneCategoryOf(lot.zoning_scag, rules) : null;
    const city = lot.zoning_city ? `city zone ${lot.zoning_city}` : "no city zone code";
    return `SCAG code ${lot.zoning_scag ?? "none"}${cat ? ` (${cat.label})` : ""}, ${city}`;
  }

  const R = (result, reason) => ({ result, reason });

  const EVALUATORS = {
    zone_in(lot, t, rules) {
      const code = lot.zoning_scag;
      const unknownNote = rules.unknown_zone_codes[code ?? "null"];
      if (!code || unknownNote) return R("unknown", `${unknownNote || "No zoning code."} (${zoneText(lot, rules)})`);
      const wanted = t.categories.flatMap((c) => rules.zone_categories[c]?.codes || []);
      const labels = t.categories.map((c) => rules.zone_categories[c]?.label).filter(Boolean).join(" or ");
      if (wanted.includes(code)) return R("pass", `${zoneText(lot, rules)} is in: ${labels}.`);
      if (t.on_mismatch === "unknown") return R("unknown", `${zoneText(lot, rules)} is not in: ${labels}. This is only a proxy, so a mismatch does not rule the path out.`);
      return R("fail", `${zoneText(lot, rules)} is not in: ${labels}.`);
    },
    acres_lt(lot, t) {
      if (t.value == null) return R("unknown", "Threshold not supplied in our sources.");
      if (lot.acres == null) return R("unknown", "Lot size unknown.");
      return lot.acres < t.value ? R("pass", `${fmtAcres(lot.acres)} is under ${t.value} acres.`) : R("fail", `${fmtAcres(lot.acres)} is not under ${t.value} acres.`);
    },
    sqft_gte(lot, t) {
      if (t.value == null) return R("unknown", "Threshold not supplied in our sources.");
      if (lot.acres == null) return R("unknown", "Lot size unknown.");
      const sqft = Math.round(lot.acres * SQFT_PER_ACRE);
      return sqft >= t.value ? R("pass", `About ${sqft.toLocaleString()} sq ft, at least ${t.value.toLocaleString()} sq ft.`) : R("fail", `About ${sqft.toLocaleString()} sq ft, under ${t.value.toLocaleString()} sq ft.`);
    },
    incorporated(lot) {
      if (!lot.city) return R("unknown", "City unknown.");
      if (lot.city === "Unincorporated") return R("unknown", "Unincorporated county land. It may still qualify under the 'large urban county' clause, which we did not evaluate.");
      return R("pass", `In the City of ${lot.city}.`);
    },
    hazard_flood(lot, t) {
      if (!lot.flood_zone) return R("pass", `Not in a mapped FEMA Special Flood Hazard Area${lot.flood_context ? ` (mapped as ${lot.flood_context})` : ""}.`);
      if (t.rule_supplied === false) return R("unknown", `In FEMA flood zone ${lot.flood_zone}, but our source does not say how this path treats flood zones.`);
      return R("flag", `In FEMA Special Flood Hazard Area, zone ${lot.flood_zone}. Exclusions have exceptions: needs review.`);
    },
    hazard_fire(lot, t) {
      if (!lot.fire_class) return R("pass", "Not in a mapped local-responsibility-area fire hazard zone (2011 map).");
      if (!Array.isArray(t.classes) || !t.classes.length) return R("unknown", `In a ${lot.fire_class} fire hazard zone; which classes matter for this path was not supplied.`);
      if (t.classes.includes(lot.fire_class)) return R("flag", `In a ${lot.fire_class} Fire Hazard Severity Zone (2011 LRA map). Needs review.`);
      return R("pass", `In a ${lot.fire_class} zone, which is not one of the listed classes for this path.`);
    },
    has_building(lot) {
      if (lot.year_built) return R("pass", `County records a building built in ${lot.year_built}.`);
      return R("unknown", lot.year_built_known ? "No year built recorded (could be vacant, or a proposed home could qualify)." : "No matching county parcel record.");
    },
    vacant_proxy(lot) {
      if (lot.year_built) return R("fail", `County records a building built in ${lot.year_built}, so the lot is probably not vacant.`);
      return R("unknown", lot.year_built_known ? "No year built recorded: may be vacant, or simply missing data." : "No matching county parcel record.");
    },
    not_evaluable(lot, t) { return R("unknown", t.reason || "Not evaluated by this screen."); },
    rule_missing(lot, t) { return R("unknown", t.reason || "Rule not supplied in our sources."); },
  };

  function fmtAcres(a) { return `${a < 1 ? a.toFixed(3) : a.toFixed(2)} acres`; }

  function evaluateTest(lot, test, rules) {
    const fn = EVALUATORS[test.kind];
    const out = fn ? fn(lot, test, rules) : R("unknown", `Unknown test type "${test.kind}".`);
    return { id: test.id, label: test.label, core: !!test.core, gate: !!test.gate, cite: test.cite, source: test.source, note: test.note, ...out };
  }

  function pathState(results) {
    const core = results.filter((r) => r.core);
    if (core.some((r) => r.result === "fail")) return "no";
    if (core.some((r) => r.gate && r.result === "unknown")) return "unknown";
    if (core.some((r) => r.result === "flag")) return "flag";
    if (core.some((r) => r.result === "unknown")) return "possible";
    return "likely";
  }

  const PLAUSIBLE = ["likely", "possible", "flag"];

  function screenLot(lot, rules) {
    const paths = rules.paths.map((p) => {
      const results = p.tests.map((t) => evaluateTest(lot, t, rules));
      return { id: p.id, name: p.name, short: p.short, law: p.law, state: pathState(results), results };
    });
    return {
      score: paths.filter((p) => PLAUSIBLE.includes(p.state)).length,
      maxScore: rules.paths.length,
      hazard: Boolean(lot.flood_zone || lot.fire_class),
      paths,
    };
  }

  const api = { screenLot, evaluateTest, pathState, PLAUSIBLE, SQFT_PER_ACRE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Screening = api;
})(typeof window !== "undefined" ? window : globalThis);
