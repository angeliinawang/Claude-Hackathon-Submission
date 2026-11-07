// ADU Pathfinder front end. Plain JS, no build step.
// All facts come from /data/*.json, each carrying its own source and check date.
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let LAW, CITIES, STATS;

const TYPE_LABEL = {
  detached: "New detached ADU",
  attached: "Attached ADU",
  conversion: "Conversion of existing space",
  garage_replace: "Replace detached garage with an ADU",
  jadu: "Junior ADU (JADU)",
};

const STATUS_CHIP = {
  fetched: ['fetched', 'Read by team'],
  "repo-verified": ['repo', 'Verified (event list)'],
  snippet: ['snippet', 'Search summary only — confirm'],
  "repo-verified + snippet": ['snippet', 'Partly confirmed — check link'],
};

function chip(status) {
  const [cls, label] = STATUS_CHIP[status] || ["unknown", "Unconfirmed"];
  return `<span class="chip ${cls}" title="How this was confirmed">${esc(label)}</span>`;
}

function srcLine(src) {
  if (!src) return "";
  const host = (() => { try { return new URL(src.url).hostname.replace(/^www\./, ""); } catch { return src.url; } })();
  return `<p class="source">Source: <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(host)}</a> · checked ${esc(src.checked)} ${chip(src.status)}</p>`;
}

function lawSrc(rule) {
  const sec = rule.section;
  const lawCode = sec === "17620" ? "EDC" : "GOV";
  return `<p class="source">${esc(rule.cite)} · <a href="https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=${lawCode}&sectionNum=${esc(sec)}" target="_blank" rel="noopener">read the law</a> · <a href="${esc(LAW.primary_source.url)}" target="_blank" rel="noopener">HCD ADU Handbook (Mar 2026)</a> p. ${esc(rule.handbook_page)} · checked ${esc(LAW.primary_source.checked)} <span class="chip state">State law</span></p>`;
}

// ---------- read form ----------
function readForm() {
  return {
    city: $("#city").value,
    type: $('input[name="type"]:checked').value,
    size: Number($("#size").value) || 0,
    preapproved: $("#preapproved").checked,
    sharedBath: $("#sharedbath").checked,
    existing: $("#existing").checked,
    coastal: $("#coastal").value,
  };
}

// Which state-law rules apply to this project?
function applies(rule, p) {
  const isJadu = p.type === "jadu";
  const isDetached = p.type === "detached" || p.type === "garage_replace";
  switch (rule.applies) {
    case "all": return true;
    case "existing_dwelling": return p.existing;
    case "no_existing_dwelling": return !p.existing;
    case "preapproved_detached": return p.preapproved && isDetached;
    case "adu_size_le_750": return !isJadu && p.size > 0 && p.size <= 750;
    case "adu_size_gt_750": return !isJadu && p.size > 750;
    case "jadu": return isJadu;
    case "jadu_shared_bath": return isJadu && p.sharedBath;
    case "adu": return !isJadu;
    case "detached": return isDetached;
    case "attached": return p.type === "attached";
    case "coastal": return p.coastal !== "no";
    case "garage": return p.type === "garage_replace";
    default: return false;
  }
}

// ---------- tab: steps ----------
function renderSteps(city, p) {
  const isJadu = p.type === "jadu";
  const items = [];

  items.push(`<li class="phase"><h3>Before you apply</h3>
    <ul class="sub">
      <li>Confirm your lot is eligible and which standards apply with ${esc(city.name)}'s planning division.${city.contact ? ` Contact: ${esc(city.contact.text)} ${chip(city.contact.status)}` : ""}</li>
      ${p.coastal !== "no" ? `<li><strong>Coastal Zone${p.coastal === "unsure" ? " (not sure)" : ""}:</strong> you may need a Coastal Development Permit. ${p.coastal === "unsure" ? "Ask the city whether your parcel is in the Coastal Zone." : ""}</li>` : ""}
      ${city.programs.length ? `<li>Look at ${esc(city.name)}'s programs: ${city.programs.map((g) => `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a>`).join("; ")}.</li>` : ""}
      ${p.preapproved && (p.type === "detached" || p.type === "garage_replace") ? `<li>Pre-approved detached plan: state law gives the city <strong>30 days</strong> to approve or deny (Gov. Code § 65852.27).</li>` : ""}
    </ul></li>`);

  if (city.steps.length) {
    items.push(...city.steps.map((s) => `<li><p>${esc(s)}</p></li>`));
  } else {
    items.push(`<li><h3>${esc(city.name)}'s own process: <span class="chip unknown">Unknown</span></h3>
      <p>${esc(city.name)} does not publish step-by-step ADU instructions that our team could find. Ask the planning division for its ADU submittal checklist. Under Gov. Code § 65913.3 (AB 2234), cities must post checklists online for ADU permits.</p></li>`);
  }
  const stepsSrc = city.steps.length ? srcLine(city.steps_source) : "";

  items.push(`<li class="phase"><h3>State clocks that start when you submit</h3>
    <ul class="sub">
      <li>Within <strong>15 business days</strong>: the city must tell you in writing whether the application is complete. If it doesn't, the application is deemed complete. <span class="source">Gov. Code § 66317(a)(2)</span></li>
      ${p.existing ? `<li>Within <strong>${p.preapproved && (p.type === "detached" || p.type === "garage_replace") ? "30 days (pre-approved detached plan)" : "60 days"}</strong> of a complete application: approve or deny. <span class="source">${p.preapproved && (p.type === "detached" || p.type === "garage_replace") ? "Gov. Code § 65852.27" : "Gov. Code § 66317(a)(3)"}</span></li>` : `<li>No existing house: the city may decide the ADU together with your new house's permit. <span class="source">Gov. Code § 66317(a)(3)</span></li>`}
      <li>If denied: a written list of what to fix, within the same period. You can appeal. <span class="source">Gov. Code § 66317(b), (d)(1)</span></li>
      ${p.coastal !== "no" ? `<li>Coastal Development Permit: decision within <strong>60 days</strong> of a complete application. <span class="source">Gov. Code § 66329</span></li>` : ""}
    </ul></li>`);

  if (isJadu) {
    items.push(`<li><h3>Record the JADU deed restriction</h3><p>Required by state law: it bars selling the JADU separately from the house and limits its size and attributes. <span class="source">Gov. Code § 66333(c)</span></p></li>`);
  }

  items.push(`<li><h3>Build, inspections, and Certificate of Occupancy</h3><p>No one may live in the ADU until the city issues a Certificate of Occupancy. <span class="source">Gov. Code § 66328</span></p></li>`);

  $("#tab-steps").innerHTML = `
    <h2>Your path: ${esc(TYPE_LABEL[p.type])} in ${esc(city.name)}</h2>
    ${portalBlock(city)}
    <ol class="steps">${items.join("")}</ol>
    ${stepsSrc}
    ${city.flags.filter((f) => f.type === "conflict").map((f) => `<div class="callout warn"><strong>Heads up: the city's own pages disagree</strong>${esc(f.text)}</div>`).join("")}`;
}

function portalBlock(city) {
  if (!city.portal) return `<div class="callout info"><strong>Where to submit: <span class="chip unknown">Unknown</span></strong>The city's ADU page does not say how to submit. Ask the planning division.</div>`;
  return `<div class="callout info"><strong>Where to submit</strong>${city.portal.url ? `<a href="${esc(city.portal.url)}" target="_blank" rel="noopener">${esc(city.portal.name)}</a>` : esc(city.portal.name)}${city.portal.note ? ` — ${esc(city.portal.note)}` : ""} ${chip(city.portal.status)}</div>`;
}

// ---------- tab: paperwork ----------
function renderPaperwork(city, p) {
  const isJadu = p.type === "jadu";
  const docs = city.documents.filter((d) => (!d.jadu_only || isJadu) && (!d.coastal_only || p.coastal !== "no"));
  const stateDocs = [];
  if (isJadu && !docs.some((d) => d.jadu_only)) stateDocs.push({ name: "JADU deed restriction (recorded)", how: "No separate sale from the house; size/attributes per state law. Your city provides the form.", sign: true, record: true, cite: "Gov. Code § 66333(c)" });
  if (p.coastal !== "no" && !docs.some((d) => d.coastal_only)) stateDocs.push({ name: "Coastal Development Permit application (if your parcel is in the Coastal Zone)", how: "From the city (if it has a certified Local Coastal Program) or the Coastal Commission.", cite: "Gov. Code § 66329" });
  if (p.type === "garage_replace") stateDocs.push({ name: "Demolition permit for the detached garage", how: "The city must review and issue it at the same time as the ADU permit.", cite: "Gov. Code § 66314(e)" });

  const tags = (d) => [
    d.sign ? `<span class="tag sign">Sign</span>` : "",
    d.notary ? `<span class="tag notary">Notarize</span>` : "",
    d.record ? `<span class="tag record">Record with County Recorder</span>` : "",
    d.physical === false ? `<span class="tag">Plans / drawings</span>` : `<span class="tag">Form to fill out</span>`,
    d.law_flag ? `<span class="tag law">See state-law check</span>` : "",
  ].join("");

  const li = (d, i, prefix) => `<li><input type="checkbox" id="${prefix}${i}" aria-label="Done: ${esc(d.name)}"><label for="${prefix}${i}"><span class="name">${esc(d.name)}</span>${d.how ? `<br><span class="hint">${/^https?:/.test(d.how) ? `<a href="${esc(d.how)}" target="_blank" rel="noopener">Get the form</a>` : esc(d.how)}</span>` : ""}<br>${tags(d)}${d.cite ? `<span class="source"> ${esc(d.cite)}</span>` : ""}</label></li>`;

  $("#tab-paperwork").innerHTML = `
    <div class="print-only"><h1>ADU paperwork checklist — ${esc(city.name)}</h1><p>${esc(TYPE_LABEL[p.type])}, ${p.size || "?"} sq ft. Printed from ADU Pathfinder (prototype, not legal advice). Confirm every item with the city.</p></div>
    <div class="row no-print" style="justify-content:space-between"><h2 style="margin:0">Paperwork for ${esc(city.name)}</h2><button class="btn ghost" id="print-btn">Print packet</button></div>
    <h3 style="margin-top:1rem">${esc(city.name)} asks for</h3>
    ${docs.length ? `<ul class="docs">${docs.map((d, i) => li(d, i, "cd")).join("")}</ul>${srcLine(city.documents_source)}`
      : `<div class="callout bad"><strong>Unknown</strong>${esc(city.name)} has not published an ADU submittal list that our team could find. Ask the planning division for its ADU checklist; cities must post one online (Gov. Code § 65913.3).</div>`}
    ${stateDocs.length ? `<h3 style="margin-top:1.2rem">Required by state law for your project</h3><ul class="docs">${stateDocs.map((d, i) => li(d, i, "sd")).join("")}</ul>` : ""}
    <div class="callout info"><strong>Fees</strong>${city.fees.length ? city.fees.map((f) => `${esc(f.item)}: ${esc(f.value)} <a href="${esc(f.source)}" target="_blank" rel="noopener">source</a> ${chip(f.status)}`).join("<br>") : `<span class="chip unknown">Unknown</span> No ADU fee amounts confirmed for ${esc(city.name)}. Ask for the current fee schedule.`}</div>`;
  $("#print-btn").onclick = () => printTab("paperwork");
}

function printTab(name) {
  const panel = $(`#tab-${name}`);
  panel.classList.add("printing");
  window.print();
  panel.classList.remove("printing");
}

// ---------- tab: state-law check ----------
function renderLaw(city, p) {
  const rules = LAW.rules.filter((r) => applies(r, p));
  const relevantFlags = city.flags.filter((f) => !f.rule || LAW.rules.some((r) => r.id === f.rule && applies(r, p)) || f.type === "stale-citation");
  const kinds = { "state-law": ["bad", "Possible conflict with state law"], "stale-citation": ["bad", "Cites old (renumbered) law"], stale: ["warn", "May be out of date"], conflict: ["warn", "City sources disagree"], missing: ["warn", "Missing information"], history: ["info", "History"], note: ["info", "Worth knowing"] };
  $("#flag-count").textContent = relevantFlags.filter((f) => ["state-law", "stale-citation", "conflict"].includes(f.type)).length || "";

  const sizeNote = p.type !== "jadu" && p.size > 0 ? (p.size <= 750
    ? `<div class="callout ok"><strong>At ${p.size} sq ft, no impact fees</strong>ADUs of 750 sq ft or less are exempt from impact fees.${p.size < 500 ? " Under 500 sq ft, school impact fees do not apply either." : " Over 500 sq ft, a school district may charge school fees."}</div>`
    : `<div class="callout warn"><strong>At ${p.size} sq ft, impact fees may apply</strong>Over 750 sq ft, impact fees are allowed but must be proportional to the main house's size. Dropping to 750 sq ft or less removes them.</div>`) : "";

  $("#tab-law").innerHTML = `
    <h2>State-law check for ${esc(city.name)}</h2>
    <p>State law sets the maximum a city can require. Where ${esc(city.name)}'s materials look out of step, we flag it. We show both sides; we don't decide who is right.</p>
    ${relevantFlags.map((f) => `<div class="callout ${kinds[f.type]?.[0] || "info"}"><strong>${esc(kinds[f.type]?.[1] || "Note")}</strong>${esc(f.text)}${f.source ? ` <a href="${esc(f.source)}" target="_blank" rel="noopener">source</a>` : ""}</div>`).join("") || `<div class="callout ok"><strong>No conflicts flagged</strong>We did not find a mismatch in the ${esc(city.name)} materials we read. That is not the same as compliant: we only read what is linked.</div>`}
    ${sizeNote}
    <h3 style="margin-top:1.2rem">Rules that apply to your project (${rules.length})</h3>
    <div class="rules">${rules.map((r) => `<div class="rule"><div class="topic">${esc(r.topic)}</div><h3>${esc(r.title)}</h3><p>${esc(r.plain)}</p>${lawSrc(r)}</div>`).join("")}</div>`;
}

// ---------- tab: timeline ----------
function renderTimeline(city, p) {
  const st = STATS.cities[city.name] || {};
  const pre = p.preapproved && (p.type === "detached" || p.type === "garage_replace");
  const b = st.permit_to_co;
  const row = (step, val, src) => `<div class="tl-row"><div class="tl-step">${step}</div><div><div class="tl-val">${val}</div>${src || ""}</div></div>`;

  const rows = [
    row("Design &amp; plans", `<span class="chip unknown">Unknown</span> Depends on your designer${pre ? "; a pre-approved plan skips most architectural design but still needs site-specific work" : ""}. We found no source for typical times.`),
    row("Completeness check", `State max: <strong>15 business days</strong> (about 3 weeks)` , `<p class="source">Gov. Code § 66317(a)(2)</p>`),
    ...city.published_timelines.map((t) => row(esc(t.step) + ` <span class="chip repo">${esc(city.name)}</span>`, esc(t.value), srcLine({ url: t.source, checked: t.checked, status: t.status }))),
    row("Approve or deny", p.existing ? `State max: <strong>${pre ? "30" : "60"} days</strong> after the application is complete` : "Decided with your new house's permit", `<p class="source">${pre ? "Gov. Code § 65852.27" : "Gov. Code § 66317(a)(3)"}</p>`),
    ...(p.coastal !== "no" ? [row("Coastal Development Permit", "State max: <strong>60 days</strong> after complete", `<p class="source">Gov. Code § 66329</p>`)] : []),
    row("Construction to Certificate of Occupancy", b
      ? `Median <strong>${b.median_days} days</strong> (middle half: ${b.p25_days}–${b.p75_days} days) in ${esc(city.name)}, from ${b.pairs} ADUs. ${Math.round(b.share_within_12mo * 100)}% finished within 12 months.`
      : `<span class="chip unknown">Unknown</span> No permit-to-occupancy data for ${esc(city.name)} in our dataset.`,
      `<p class="source">BackyardADU.net build_times.csv (third party, from HCD APR Table A2) · downloaded ${esc(STATS.downloaded)} · <a href="${esc(STATS.sources.official)}" target="_blank" rel="noopener">official APR data</a></p>`),
  ];

  const total = b && p.existing ? `<div class="callout info"><strong>Rough picture, from a complete application to move-in</strong>Up to ${pre ? "about 3 weeks + 30 days" : "about 3 weeks + 60 days"} for review (legal maximums; many cities are faster), plus a median of ${b.median_days} days to build and get the Certificate of Occupancy in ${esc(city.name)}. That adds up to roughly ${Math.round(((pre ? 51 : 81) + b.median_days) / 30)} months, not counting design and plan corrections. <span class="chip assumption">ASSUMPTION</span> We add a legal maximum to a historical median; this is a rough guide, not a forecast.</div>` : "";

  const permits = (st.permits_by_year || []).filter((r) => r.year >= 2019);
  $("#tab-timeline").innerHTML = `
    <h2>How long will it take in ${esc(city.name)}?</h2>
    <div class="tl">${rows.join("")}</div>
    ${total}
    <h3 style="margin-top:1.2rem">ADUs permitted in ${esc(city.name)} per year</h3>
    ${permits.length ? barChart(permits) : `<p><span class="chip unknown">Unknown</span> No data.</p>`}
    ${city.name === "Irvine" ? `<div class="callout warn"><strong>Data looks incomplete</strong>The dataset shows very few Irvine ADU permits and is missing some years. Check HCD's Annual Progress Report data directly before drawing conclusions.</div>` : ""}
    <p class="source">BackyardADU.net permits_ca.csv (third party, merged from HCD APR Table A2) · downloaded ${esc(STATS.downloaded)}. Cite the <a href="${esc(STATS.sources.official)}" target="_blank" rel="noopener">HCD APR dataset</a> for anything official.</p>`;
}

function barChart(rows) {
  const w = 560, h = 180, pad = 26, max = Math.max(...rows.map((r) => r.permits), 1);
  const bw = (w - pad * 2) / rows.length;
  const bars = rows.map((r, i) => {
    const bh = ((h - pad * 2) * r.permits) / max;
    const x = pad + i * bw + bw * 0.18, y = h - pad - bh;
    return `<rect class="bar" x="${x}" y="${y}" width="${bw * 0.64}" height="${Math.max(bh, 1)}" rx="3"><title>${r.year}: ${r.permits} ADU permits</title></rect>
      <text class="val" x="${x + bw * 0.32}" y="${y - 5}" text-anchor="middle">${r.permits}</text>
      <text x="${x + bw * 0.32}" y="${h - 8}" text-anchor="middle">${r.year}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="ADU permits per year">${bars}</svg>`;
}

// ---------- stale-citation checker ----------
const OLD_SECTIONS = [
  ["65852.22", "Renumbered by SB 477 (2024) into Gov Code 66310–66342. JADU rules now cite 66333 onward (e.g. deed restriction: 66333(c))."],
  ["65852.23", "Renumbered by SB 477 (2024) into Gov Code 66310–66342."],
  ["65852.26", "Renumbered by SB 477 (2024) into Gov Code 66310–66342."],
  ["65852.2", "Renumbered by SB 477 (2024) to Gov Code 66310–66342 (ADU approvals: 66314–66331)."],
  ["66324", "Renumbered in 2025 to Gov Code 66311.5 (fees)."],
  ["66327", "Renumbered in 2025 to Gov Code 66313.5."],
  ["66332", "Renumbered in 2025 to Gov Code 66311.7 (unpermitted ADUs)."],
];
function runStale() {
  const text = $("#stale-input").value;
  if (!text.trim()) { $("#stale-out").innerHTML = ""; return; }
  const found = new Map();
  // Match the longest numbers first so 65852.22 is not read as 65852.2.
  const re = /\b(65852\.2[236]?|66324|66327|66332)(?![\d.]*\d)/g;
  const marked = esc(text).replace(re, (m) => { found.set(m, (found.get(m) || 0) + 1); return `<mark class="old">${m}</mark>`; });
  if (!found.size) {
    $("#stale-out").innerHTML = `<div class="callout ok"><strong>No old ADU section numbers found</strong>That doesn't mean the text is current. Other rules may have changed.</div>`;
    return;
  }
  $("#stale-out").innerHTML = `<div class="callout bad"><strong>${[...found.values()].reduce((a, b) => a + b, 0)} outdated citation(s) found</strong>${[...found.keys()].map((k) => `<code>${k}</code>: ${esc(OLD_SECTIONS.find(([o]) => o === k)[1])}`).join("<br>")}</div><div class="answer">${marked}</div>`;
}

// ---------- Q&A ----------
async function ask(e) {
  e.preventDefault();
  const q = $("#ask-input").value.trim();
  if (!q) return;
  const p = readForm();
  $("#ask-btn").disabled = true; $("#ask-status").textContent = "Thinking…";
  try {
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, context: { city: p.city, type: p.type, size: p.size, preapproved: p.preapproved, coastal: p.coastal } }) });
    const data = await r.json();
    $("#ask-out").hidden = false;
    $("#ask-out").textContent = data.answer || data.error || "No answer.";
  } catch {
    $("#ask-out").hidden = false; $("#ask-out").textContent = "Could not reach the server.";
  } finally {
    $("#ask-btn").disabled = false; $("#ask-status").textContent = "";
  }
}

// ---------- city card ----------
function renderCityCard(city) {
  const st = STATS.cities[city.name];
  const last = st?.permits_by_year?.at(-1);
  $("#city-card").hidden = false;
  $("#city-card").innerHTML = `<h3>${esc(city.name)}</h3>
    <p><a href="${esc(city.adu_page.url)}" target="_blank" rel="noopener">City ADU page</a> ${chip(city.adu_page.status)}</p>
    ${last ? `<p>${last.permits} ADU permits in ${last.year} <span class="hint">(APR via BackyardADU)</span></p>` : ""}
    ${city.contact ? `<p>${esc(city.contact.text)}</p>` : ""}`;
}

// ---------- wiring ----------
function render() {
  const p = readForm();
  $("#shared-bath-wrap").hidden = p.type !== "jadu";
  $("#preapproved-wrap").hidden = p.type === "jadu" || p.type === "conversion";
  if (p.type === "jadu" && p.size > 500) $("#size").value = 500;
  const city = CITIES.find((c) => c.name === p.city);
  try { localStorage.setItem("adu-form", JSON.stringify(p)); } catch {}
  if (!city) { $("#empty").hidden = false; $("#output").hidden = true; $("#city-card").hidden = true; return; }
  $("#empty").hidden = true; $("#output").hidden = false;
  const q = readForm();
  renderCityCard(city);
  renderSteps(city, q);
  renderPaperwork(city, q);
  renderLaw(city, q);
  renderTimeline(city, q);
}

function selectTab(name) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  $$(".tab-panel").forEach((pnl) => (pnl.hidden = pnl.id !== `tab-${name}`));
}

async function init() {
  [LAW, { cities: CITIES }, STATS] = await Promise.all(["state-law.json", "cities.json", "city-stats.json"].map((f) => fetch(`/data/${f}`).then((r) => r.json())));
  CITIES.sort((a, b) => a.name.localeCompare(b.name));
  $("#city").insertAdjacentHTML("beforeend", CITIES.map((c) => `<option>${esc(c.name)}</option>`).join(""));

  try {
    const saved = JSON.parse(localStorage.getItem("adu-form") || "null");
    if (saved) {
      $("#city").value = saved.city || "";
      const r = $(`input[name="type"][value="${saved.type}"]`); if (r) r.checked = true;
      if (saved.size) $("#size").value = saved.size;
      $("#preapproved").checked = !!saved.preapproved; $("#sharedbath").checked = !!saved.sharedBath;
      $("#existing").checked = saved.existing !== false; $("#coastal").value = saved.coastal || "no";
    }
  } catch {}

  $("#project-form").addEventListener("input", render);
  $("#project-form").addEventListener("change", render);
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
  $("#stale-run").onclick = runStale;
  $("#stale-sample").onclick = () => { $("#stale-input").value = "A JADU covenant shall be recorded per Government Code Section 65852.22. ADUs shall comply with Gov. Code 65852.2 and fees per Section 66324."; runStale(); };
  $("#ask-form").addEventListener("submit", ask);

  fetch("/api/status").then((r) => r.json()).then((s) => { if (!s.qa) $("#ask-status").textContent = "Q&A is off on this server (no API key). Everything else works."; }).catch(() => {});
  const qs = new URLSearchParams(location.search);
  if (qs.get("city")) { $("#city").value = qs.get("city"); }
  if (qs.get("type")) { const r = $(`input[name="type"][value="${qs.get("type")}"]`); if (r) r.checked = true; }
  render();
  if (qs.get("tab")) selectTab(qs.get("tab"));
}

init();
