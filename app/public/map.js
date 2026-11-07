// Parcel screening map. Reads data/parcels.geojson (public layers, cached) and
// data/screening-rules.json (sourced rules), runs Screening.screenLot on every lot.
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Light grey (0) to dark green (max). Sequential, one hue.
  const RAMP = ["#e9ecea", "#c7e3d4", "#94cbb0", "#5aaa86", "#2f855f", "#17603f", "#0b3f28"];
  const HAZARD_OUTLINE = "#d9480f";
  const STATE_LABEL = { likely: "Likely", possible: "Possible", flag: "Needs review", unknown: "Unknown", no: "No" };
  const RESULT_ICON = { pass: "✓", fail: "✗", unknown: "?", flag: "!" };

  let RULES, DATA, map, layer;
  let lots = []; // { feature, screen }

  function colorFor(score, max) {
    const i = Math.round((score / Math.max(max, 1)) * (RAMP.length - 1));
    return RAMP[Math.min(RAMP.length - 1, Math.max(0, i))];
  }

  function style(feature) {
    const s = feature.__screen;
    return {
      fillColor: colorFor(s.score, s.maxScore),
      fillOpacity: 0.85,
      color: s.hazard ? HAZARD_OUTLINE : "#8a9590",
      weight: s.hazard ? 2.2 : 0.4,
      opacity: s.hazard ? 1 : 0.7,
    };
  }

  function popupHtml(p, s) {
    const sqft = p.acres != null ? Math.round(p.acres * Screening.SQFT_PER_ACRE).toLocaleString() : "unknown";
    const head = `<div class="pp-head">
      <strong>${p.address ? esc(p.address) : "Address unknown"}</strong><br>
      <span>APN ${esc(p.apn || "unknown")} · ${esc(p.city || "city unknown")}</span><br>
      <span>Zoning: ${esc(p.zoning_city || "none")} (SCAG ${esc(p.zoning_scag || "none")}) · ${p.acres != null ? p.acres.toFixed(3) : "?"} acres (~${sqft} sq ft) · built ${p.year_built || "unknown"}</span>
      <div class="pp-score"><span class="swatch" style="background:${colorFor(s.score, s.maxScore)}"></span> Score <b>${s.score} of ${s.maxScore}</b> paths plausible${s.hazard ? ` · <span class="pp-haz">hazard zone: review</span>` : ""}</div>
    </div>`;
    const body = s.paths.map((path) => `
      <details class="pp-path">
        <summary><span class="state ${path.state}">${STATE_LABEL[path.state]}</span> <b>${esc(path.name)}</b> <span class="muted">${esc(path.short)}</span></summary>
        <ul>${path.results.map((r) => `<li class="r-${r.result}"><span class="ri" aria-label="${r.result}">${RESULT_ICON[r.result]}</span><div><b>${esc(r.label)}</b>${r.core ? "" : ' <span class="muted">(not scored)</span>'}<br>${esc(r.reason)}<br><span class="muted">${esc(r.cite || "")}</span></div></li>`).join("")}</ul>
      </details>`).join("");
    return `<div class="pp">${head}${body}<p class="muted pp-foot">Screening only, not a legal determination.</p></div>`;
  }

  function currentFilter() {
    return {
      minAcres: Math.max(0, Number($("#f-acres").value) || 0),
      path: $("#f-path").value,
      hideHazard: $("#f-hazard").checked,
    };
  }

  function visible(l, f) {
    const p = l.feature.properties;
    if (f.minAcres > 0 && !(p.acres >= f.minAcres)) return false;
    if (f.hideHazard && l.screen.hazard) return false;
    if (f.path) {
      const ps = l.screen.paths.find((x) => x.id === f.path);
      if (!ps || !Screening.PLAUSIBLE.includes(ps.state)) return false;
    }
    return true;
  }

  function redraw() {
    const f = currentFilter();
    const shown = lots.filter((l) => visible(l, f));
    layer.clearLayers();
    layer.addData(shown.map((l) => l.feature));
    $("#count").textContent = `${shown.length.toLocaleString()} of ${lots.length.toLocaleString()} lots shown`;
  }

  function legend() {
    const max = RULES.paths.length;
    const steps = Array.from({ length: max + 1 }, (_, i) => i);
    $("#legend").innerHTML = `
      <h3>Score</h3>
      <p class="muted">Number of approval paths (of ${max}) rated likely, possible or needs review.</p>
      <div class="ramp">${steps.map((i) => `<span style="background:${colorFor(i, max)}" title="${i}"></span>`).join("")}</div>
      <div class="ramp-labels"><span>0</span><span>${max}</span></div>
      <p class="hz"><span class="hz-box"></span> Orange outline: lot sits in a mapped flood or fire hazard zone. Needs manual review.</p>
      <h3>Path states</h3>
      <ul class="states">
        <li><span class="state likely">Likely</span> every test we could run passed</li>
        <li><span class="state possible">Possible</span> no fails, but a scored test is unknown</li>
        <li><span class="state flag">Needs review</span> in a hazard zone the law treats specially</li>
        <li><span class="state unknown">Unknown</span> zoning (or key fact) unknown</li>
        <li><span class="state no">No</span> a scored test failed</li>
      </ul>`;
  }

  function caption() {
    const m = DATA.metadata;
    const L = m.layers;
    const src = (name, l) => `${name} (<a href="${esc(l.url)}" target="_blank" rel="noopener">source</a>, fetched ${esc(l.fetched)})`;
    const zb = m.zip_boundary;
    $("#caption").innerHTML = `<strong>Screening only — not a legal determination.</strong>
      Lots and zoning: ${src("SCAG 2024 Zoning (preliminary, Oct 2025)", L.zoning)}. Address and year built: ${src("OC Parcels", L.parcels)}.
      Flood: ${src("OC Floodplains / FEMA", L.flood)}; only Special Flood Hazard Areas count. Fire: ${src("OC Fire Hazard Severity Zones, LRA (2011 map)", L.fire)}. CAL FIRE adopted newer LRA maps in 2025 that are not used here.
      Rules: <a href="/data/screening-rules.json" target="_blank">screening-rules.json</a> (HCD fact sheets, April 2026; checked ${esc(RULES.checked)}).
      Study area: ${esc(m.study_area.name)}.${zb ? ` ZIP boundary: <a href="${esc(zb.source)}" target="_blank" rel="noopener">U.S. Census 2020 ZIP Code Tabulation Area</a> (fetched ${esc(zb.fetched)}, ${esc(zb.land_sq_mi)} sq mi of land). ${esc(zb.note)}` : ""} ${esc(m.hazard_method)}
      <br><strong>This screen does NOT check:</strong> ${RULES.not_checked.map(esc).join("; ")}.`;
  }

  // ---------- area loading: demo area or one Orange County ZIP ----------
  let boundary = null;
  function setData(geo) {
    DATA = geo;
    lots = DATA.features.map((feature) => {
      const screen = Screening.screenLot(feature.properties, RULES);
      feature.__screen = screen;
      return { feature, screen };
    });
    boundary.clearLayers();
    const zb = DATA.metadata.zip_boundary;
    if (zb) L.polygon(zb.rings.map((r) => r.map(([x, y]) => [y, x])), { color: "#1f2a2e", weight: 2, dashArray: "6 5", fill: false, interactive: false }).addTo(boundary);
    const [w, s, e, n] = DATA.metadata.study_area.bbox;
    map.closePopup();
    map.fitBounds([[s, w], [n, e]]);
    caption();
    redraw();
  }

  const zipStatus = (html) => { $("#zip-status").innerHTML = html; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loadDemo() {
    zipStatus("Loading the demo area…");
    setData(await fetch("/data/parcels.geojson").then((r) => r.json()));
    $("#zip-demo").hidden = true;
    zipStatus(`Showing the demo area: ${esc(DATA.metadata.study_area.name)}. Enter any Orange County ZIP to fetch its lots from the public layers listed in this repo (first load takes about 30–60 seconds, then it's cached).`);
    const u = new URL(location.href); u.searchParams.delete("zip"); history.replaceState(null, "", u);
  }

  async function loadZip(zip) {
    zip = String(zip).trim();
    if (!/^\d{5}$/.test(zip)) { zipStatus(`<span class="zip-err">Enter a 5-digit ZIP code.</span>`); return; }
    $("#zip-go").disabled = true;
    try {
      let r = await fetch(`/api/zip/${zip}`, { method: "POST" });
      let s = await r.json();
      const t0 = Date.now();
      while (s.state === "running") {
        const secs = Math.round((Date.now() - t0) / 1000);
        zipStatus(`<span class="spinner" aria-hidden="true"></span> Fetching ZIP ${esc(zip)}: ${esc(s.message || "working…")}${s.expected ? ` (about ${s.expected.toLocaleString()} lots)` : ""} · ${secs}s`);
        await sleep(2000);
        s = await fetch(`/api/zip/${zip}`).then((x) => x.json());
      }
      if (s.state !== "done") { zipStatus(`<span class="zip-err">${esc(s.error || "Could not load that ZIP.")}</span>`); return; }
      zipStatus(`Loading ${s.lots ? s.lots.toLocaleString() + " " : ""}lots for ZIP ${esc(zip)}…`);
      setData(await fetch(s.url).then((x) => x.json()));
      $("#zip").value = zip;
      $("#zip-demo").hidden = false;
      zipStatus(`Showing ZIP <b>${esc(zip)}</b>: ${DATA.features.length.toLocaleString()} lots${s.cities?.length ? ` in ${s.cities.map(esc).join(", ")}` : ""}, fetched ${esc(DATA.metadata.generated)} from the same public layers as the demo area, clipped to the Census ZIP boundary (dashed line).`);
      const u = new URL(location.href); u.searchParams.set("zip", zip); history.replaceState(null, "", u);
      refreshZipList();
    } catch (err) {
      console.error(err);
      zipStatus(`<span class="zip-err">Could not reach the server to load ZIP ${esc(zip)}.</span>`);
    } finally {
      $("#zip-go").disabled = false;
    }
  }

  async function refreshZipList() {
    try {
      const { zips } = await fetch("/api/zips").then((r) => r.json());
      $("#zip-list").innerHTML = zips.map((z) => `<option value="${esc(z.zip)}">${esc(z.cities.join(", "))} · ${z.lots.toLocaleString()} lots (ready)</option>`).join("");
    } catch {}
  }

  function how() {
    $("#how").innerHTML = `<p>Each lot is run through every test for each approval path. Tests return <b>pass</b>, <b>fail</b>, <b>unknown</b> (data or rule not available) or <b>needs review</b> (hazard). Only "scored" tests decide the path's state; the others are listed so you can see what still has to be checked.</p>
      ${RULES.paths.map((p) => `<h3>${esc(p.name)}: ${esc(p.short)} <span class="muted">${esc(p.law)}</span></h3><ul>${p.tests.map((t) => `<li>${esc(t.label)}${t.core ? "" : " <span class='muted'>(not scored)</span>"} — <span class="muted">${esc(t.cite)}</span></li>`).join("")}</ul>`).join("")}`;
  }

  async function init() {
    RULES = await fetch("/data/screening-rules.json").then((r) => r.json());

    $("#f-path").insertAdjacentHTML("beforeend", RULES.paths.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.short)}</option>`).join(""));
    // ?embed=1: compact view used inside the ADU guide (step 1). ?path=ADU preselects a path filter.
    const qs = new URLSearchParams(location.search);
    if (qs.get("embed") === "1") document.body.classList.add("embed");
    if (qs.get("path") && RULES.paths.some((p) => p.id === qs.get("path"))) $("#f-path").value = qs.get("path");

    map = L.map("map", { preferCanvas: true, scrollWheelZoom: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      opacity: 0.45,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layer = L.geoJSON(null, {
      style,
      onEachFeature: (feature, lyr) => lyr.bindPopup(() => popupHtml(feature.properties, feature.__screen), { maxWidth: 420, maxHeight: 420, autoPanPadding: [20, 20] }),
    }).addTo(map);

    boundary = L.layerGroup().addTo(map);

    legend();
    how();
    ["input", "change"].forEach((ev) => document.querySelector(".map-controls").addEventListener(ev, redraw));
    $("#zip-form").addEventListener("submit", (e) => { e.preventDefault(); loadZip($("#zip").value); });
    $("#zip-demo").addEventListener("click", () => { $("#zip").value = ""; loadDemo(); });
    refreshZipList();

    // ?zip=92808 loads that ZIP; otherwise the demo area.
    if (qs.get("zip")) await loadZip(qs.get("zip"));
    if (!DATA) await loadDemo();

    // Deep link: map.html?apn=12345678 zooms to that lot and opens its popup.
    const apn = new URLSearchParams(location.search).get("apn");
    if (apn) {
      layer.eachLayer((l) => {
        if (l.feature.properties.apn === apn) { map.fitBounds(l.getBounds(), { maxZoom: 18 }); l.openPopup(); }
      });
    }
  }

  init().catch((err) => { console.error(err); $("#count").textContent = "Could not load the map data."; });
})();
