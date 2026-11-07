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

function lawUrl(section) {
  const lawCode = section === "17620" ? "EDC" : "GOV";
  return `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=${lawCode}&sectionNum=${encodeURIComponent(section)}`;
}

// Citation line shown at the TOP of each box. Same size as body text or smaller, never larger.
function citeTop(cite, tag) {
  return `<div class="cite-top"><span class="cite">${cite}</span>${tag ? `<span class="cite-tag">${esc(tag)}</span>` : ""}</div>`;
}

// Links line shown at the BOTTOM of each box.
function lawLinks(rule) {
  return `<p class="source"><a href="${lawUrl(rule.section)}" target="_blank" rel="noopener">Read § ${esc(rule.section)} on leginfo</a> · <a href="${esc(LAW.primary_source.url)}" target="_blank" rel="noopener">HCD ADU Handbook (Mar 2026), p. ${esc(rule.handbook_page)}</a> · checked ${esc(LAW.primary_source.checked)}</p>`;
}
function lawSrc(rule) { return lawLinks(rule); }

const ruleById = (id) => LAW.rules.find((r) => r.id === id);

// One side of a city-vs-state comparison.
function sideBox(side) {
  if (side.rule) {
    const r = ruleById(side.rule);
    return `<div class="side side-state">${citeTop(esc(r.cite), side.who || "State law")}<p><strong>${esc(r.title)}.</strong> ${esc(r.plain)}</p>${lawLinks(r)}</div>`;
  }
  if (side.renumbering) {
    return `<div class="side side-state">${citeTop("SB 477 (2024): Gov. Code §§ 66310–66342", side.who || "State law")}<p>${esc(LAW.renumbering.note)}</p><p class="source"><a href="${esc(LAW.primary_source.url)}" target="_blank" rel="noopener">HCD ADU Handbook (Mar 2026), pp. 13–14</a> · checked ${esc(LAW.renumbering.checked)}</p></div>`;
  }
  if (side.section) {
    return `<div class="side side-state">${citeTop(esc(side.cite), side.who || "State law")}<p>${esc(side.text)}</p><p class="source"><a href="${lawUrl(side.section)}" target="_blank" rel="noopener">Read § ${esc(side.section)} on leginfo</a> · <a href="${esc(side.url)}" target="_blank" rel="noopener">${esc(side.source)}</a></p></div>`;
  }
  return `<div class="side side-city">${citeTop(esc(side.cite), side.who || "City")}<p>${esc(side.text)}</p><p class="source"><a href="${esc(side.url)}" target="_blank" rel="noopener">Open the city source</a> · checked ${esc(side.checked)} ${chip(side.status)}</p></div>`;
}

function sideCite(side) {
  if (side.rule) return ruleById(side.rule).cite;
  if (side.renumbering) return "Gov. Code §§ 66310–66342";
  return side.cite;
}

// ---------- read form ----------
function readForm() { return ProjectForm.read(); }

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

// ---------- path layout ----------
// UI only: the content below is the same content the old tabs showed, regrouped under the
// homeowner's numbered steps. Nothing here changes data, rules or calculations.
const PATH_STEPS = [
  { n: 1, name: "Before you apply" },
  { n: 2, name: "Gather paperwork" },
  { n: 3, name: "Submit" },
  { n: 4, name: "City review" },
  { n: 5, name: "Corrections or denial" },
  { n: 6, name: "Fees" },
  { n: 7, name: "Build and move in" },
];

// Which step each state rule card belongs under.
const RULE_STEP = {
  "size-setback-800": 1, "height-detached": 1, "height-attached": 1, parking: 1, "parking-jadu": 1, "owner-occ-adu": 1, "jadu-owner": 1,
  "no-deed-adu": 2, "jadu-deed": 2, "garage-demo": 2,
  "completeness-15": 4, "decision-60": 4, "concurrent-new-home": 4, "preapproved-30": 4, ministerial: 4, coastal: 4,
  "denial-comments": 5, appeal: 5, nonconforming: 5,
  "impact-fee-750": 6, "impact-fee-over-750": 6, "impact-fee-jadu-500": 6, "utility-connection": 6, "school-fees": 6,
  co: 7, sprinklers: 7, "jadu-rental": 7,
};
const FEE_RULES = ["impact-fee-750", "impact-fee-over-750", "impact-fee-jadu-500", "utility-connection", "school-fees"];

// Which step each city flag belongs under.
function flagStep(f) {
  const ids = [f.rule, ...(f.sides || []).map((sd) => sd.rule)].filter(Boolean);
  if (ids.some((id) => FEE_RULES.includes(id))) return 6;
  if (ids.some((id) => id === "no-deed-adu" || id === "jadu-deed")) return 2;
  if (f.type === "conflict") return 3;
  if (f.type === "missing" && /process|steps|checklist|portal|forms/i.test(f.text)) return 3;
  return 1;
}

// Which step a city-published timeline item belongs under.
function timelineStep(t) {
  if (/sewer|meter|verification/i.test(t.step)) return 2;
  if (/request/i.test(t.step)) return 3;
  return 4;
}

function portalBlock(city) {
  if (!city.portal) return `<div class="callout info"><strong>Where to submit: <span class="chip unknown">Unknown</span></strong>The city's ADU page does not say how to submit. Ask the planning division.</div>`;
  return `<div class="callout info"><strong>Where to submit</strong>${city.portal.url ? `<a href="${esc(city.portal.url)}" target="_blank" rel="noopener">${esc(city.portal.name)}</a>` : esc(city.portal.name)}${city.portal.note ? ` — ${esc(city.portal.note)}` : ""} ${chip(city.portal.status)}</div>`;
}

const FLAG_KINDS = { "state-law": ["bad", "City vs. state law"], "stale-citation": ["bad", "Cites old (renumbered) law"], stale: ["warn", "May be out of date"], conflict: ["warn", "City sources disagree"], missing: ["warn", "Missing information"], history: ["info", "History"], note: ["info", "Worth knowing"] };

function flagBox(f) {
  const [cls, kind] = FLAG_KINDS[f.type] || ["info", "Note"];
  const sides = f.sides || [];
  const isState = (sd) => sd.rule || sd.renumbering || sd.section;
  const group = (list, who) => list.length ? `${who}: ${list.map((sd) => esc(sideCite(sd))).join(' <span class="cite-sep">+</span> ')}` : "";
  const cityS = sides.filter((sd) => !isState(sd)), stateS = sides.filter(isState);
  const cites = !sides.length ? (f.source ? `<a href="${esc(f.source)}" target="_blank" rel="noopener">Source</a>` : "No source to compare")
    : stateS.length ? `${group(cityS, "City")} <span class="cite-sep">vs.</span> ${group(stateS, "State")}`
    : cityS.map((sd) => esc(sideCite(sd))).join(' <span class="cite-sep">vs.</span> ');
  return `<div class="callout ${cls} flag">${citeTop(cites, kind)}
    ${f.title ? `<h3>${esc(f.title)}</h3>` : ""}<p>${esc(f.text)}</p>
    ${sides.length ? `<div class="sides">${sides.map(sideBox).join("")}</div>` : ""}
    ${f.source && sides.length ? `<p class="source"><a href="${esc(f.source)}" target="_blank" rel="noopener">More context</a></p>` : ""}</div>`;
}

function ruleCard(r) {
  return `<div class="rule">${citeTop(esc(r.cite), r.topic)}<h3>${esc(r.title)}</h3><p>${esc(r.plain)}</p>${lawLinks(r)}</div>`;
}

// Builds every step's content and its sidebar duration from the same pieces the old tabs used.
function buildPath(city, p) {
  const isJadu = p.type === "jadu";
  const pre = p.preapproved && (p.type === "detached" || p.type === "garage_replace");
  const S = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  const DUR = {};
  const cityPage = (src, label) => src ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(label || `${city.name} ADU page`)}</a> ${chip(src.status)}` : `<span class="chip unknown">No city source</span>`;
  const gov = (cite, section) => `<a href="${lawUrl(section)}" target="_blank" rel="noopener">${esc(cite)}</a>`;
  const item = (cite, title, body) => `<div class="rule step-item">${citeTop(cite)}${title ? `<h3>${title}</h3>` : ""}${body ? `<p>${body}</p>` : ""}</div>`;

  // ----- What to do (from the old "Your steps" tab) -----
  S[1].push(item(`City rule: ${cityPage(city.adu_page)}`, "Before you apply: confirm eligibility with the city",
    `Ask ${esc(city.name)}'s planning division which local objective standards apply to your lot.${city.contact ? ` Contact: ${esc(city.contact.text)} ${chip(city.contact.status)}` : ""}${city.programs.length ? ` Programs: ${city.programs.map((g) => `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a>`).join("; ")}.` : ""}`));
  if (p.coastal !== "no") S[1].push(item(gov("Gov. Code § 66329", "66329"), `Coastal Zone${p.coastal === "unsure" ? " (not sure)" : ""}: Coastal Development Permit`,
    `You may need a Coastal Development Permit; it must be decided within 60 days of a complete application.${p.coastal === "unsure" ? " Ask the city whether your parcel is in the Coastal Zone." : ""}`));
  if (pre) S[1].push(item(gov("Gov. Code § 65852.27", "65852.27"), "Pre-approved detached plan", "The city must approve or deny within <strong>30 days</strong> when you use a plan it (or another California agency) pre-approved."));

  if (isJadu) S[2].push(item(gov("Gov. Code § 66333(c)", "66333"), "Record the JADU deed restriction", "Bars selling the JADU separately from the house and limits its size and attributes."));

  S[3].push(portalBlock(city));
  if (city.steps.length) {
    const lis = city.steps.map((st) => {
      const text = typeof st === "string" ? st : st.text;
      const r = typeof st === "object" && st.state_rule ? ruleById(st.state_rule) : null;
      const cite = `City rule: ${cityPage(city.steps_source, `${city.name} process page`)}${r ? ` <span class="cite-sep">·</span> State: ${gov(r.cite, r.section)}` : ""}`;
      return `<li>${citeTop(cite)}<p>${esc(text) + (r ? `<br><span class="hint">State rule: ${esc(r.title)}.</span>` : "")}</p></li>`;
    });
    S[3].push(`<h3 class="step-sub">${esc(city.name)}'s own process, in the city's order</h3><ol class="steps city-steps">${lis.join("")}</ol>`);
  } else {
    S[3].push(item(`${gov("Gov. Code § 65913.3", "65913.3")} (AB 2234: checklists must be online)`, `${esc(city.name)}'s own process: <span class="chip unknown">Unknown</span>`,
      `${esc(city.name)} does not publish step-by-step ADU instructions that our team could find. Ask the planning division for its ADU submittal checklist.`));
  }

  S[4].push(item(gov("Gov. Code § 66317(a)(2)", "66317"), "Within 15 business days: completeness decision",
    "The city must tell you in writing whether the application is complete, listing anything missing. If it doesn't, the application is deemed complete."));
  if (p.existing) S[4].push(item(pre ? gov("Gov. Code § 65852.27", "65852.27") : gov("Gov. Code § 66317(a)(3)", "66317"), `Within ${pre ? "30" : "60"} days: approve or deny`, "Counted from a complete application. You may ask for a delay; the clock pauses."));
  else S[4].push(item(gov("Gov. Code § 66317(a)(3)", "66317"), "Decided together with your new house", "With no existing house, the city may decide the ADU together with the new home's permit, still without a hearing."));

  S[5].push(item(gov("Gov. Code § 66317(b), (d)(1)", "66317"), "If denied: written fix-it list, and a right to appeal", "The denial must list what is deficient and how to fix it. Appeals get a written decision within 60 business days."));

  S[7].push(item(gov("Gov. Code § 66328", "66328"), "Build, inspections, and Certificate of Occupancy", "No one may live in the ADU until the city issues a Certificate of Occupancy."));

  // ----- Paperwork (from the old "Paperwork" tab) -----
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
    d.law_flag ? `<span class="tag law">City vs. state</span>` : "",
  ].join("");
  const li = (d, i, prefix) => `<li><input type="checkbox" id="${prefix}${i}" aria-label="Done: ${esc(d.name)}"><label for="${prefix}${i}"><span class="name">${esc(d.name)}</span>${d.how ? `<br><span class="hint">${/^https?:/.test(d.how) ? `<a href="${esc(d.how)}" target="_blank" rel="noopener">Get the form</a>` : esc(d.how)}</span>` : ""}<br>${tags(d)}${d.cite ? `<span class="source"> ${esc(d.cite)}</span>` : ""}${d.law_flag ? `<div class="mini-compare"><span><b>City:</b> ${esc(city.name)} lists this form ${chip(city.documents_source?.status)}</span><span><b>State:</b> <a href="${lawUrl(ruleById(d.law_flag).section)}" target="_blank" rel="noopener">${esc(ruleById(d.law_flag).cite)}</a>: ${esc(ruleById(d.law_flag).title)}</span></div>` : ""}</label></li>`;
  S[2].unshift(`
    <div class="print-only"><h1>ADU paperwork checklist — ${esc(city.name)}</h1><p>${esc(TYPE_LABEL[p.type])}, ${p.size || "?"} sq ft. Printed from ADU Pathfinder (prototype, not legal advice). Confirm every item with the city.</p></div>
    <div class="row no-print" style="justify-content:space-between"><h3 class="step-sub" style="margin:0;padding:0;border:0">Paperwork for ${esc(city.name)}</h3><button class="btn ghost" id="print-btn">Print packet</button></div>
    <h3 style="margin-top:1rem">${esc(city.name)} asks for</h3>
    ${docs.length ? `<ul class="docs">${docs.map((d, i) => li(d, i, "cd")).join("")}</ul>${srcLine(city.documents_source)}`
      : `<div class="callout bad"><strong>Unknown</strong>${esc(city.name)} has not published an ADU submittal list that our team could find. Ask the planning division for its ADU checklist; cities must post one online (Gov. Code § 65913.3).</div>`}
    ${stateDocs.length ? `<h3 style="margin-top:1.2rem">Required by state law for your project</h3><ul class="docs">${stateDocs.map((d, i) => li(d, i, "sd")).join("")}</ul>` : ""}`);
  S[6].push(`<div class="callout info"><strong>Fees</strong>${city.fees.length ? city.fees.map((f) => `${esc(f.item)}: ${esc(f.value)} <a href="${esc(f.source)}" target="_blank" rel="noopener">source</a> ${chip(f.status)}`).join("<br>") : `<span class="chip unknown">Unknown</span> No ADU fee amounts confirmed for ${esc(city.name)}. Ask for the current fee schedule.`}</div>`);

  // ----- How long (from the old "Timeline" tab) -----
  const st = STATS.cities[city.name] || {};
  const bt = st.permit_to_co;
  const row = (step, val, src) => `<div class="tl-row"><div class="tl-step">${step}</div><div><div class="tl-val">${val}</div>${src || ""}</div></div>`;
  const TL = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  TL[1].push(row("Design &amp; plans", `<span class="chip unknown">Unknown</span> Depends on your designer${pre ? "; a pre-approved plan skips most architectural design but still needs site-specific work" : ""}. We found no source for typical times.`));
  TL[4].push(row("Completeness check", `State max: <strong>15 business days</strong> (about 3 weeks)`, `<p class="source">Gov. Code § 66317(a)(2)</p>`));
  for (const t of city.published_timelines) TL[timelineStep(t)].push(row(esc(t.step) + ` <span class="chip repo">${esc(city.name)}</span>`, esc(t.value), srcLine({ url: t.source, checked: t.checked, status: t.status })));
  TL[4].push(row("Approve or deny", p.existing ? `State max: <strong>${pre ? "30" : "60"} days</strong> after the application is complete` : "Decided with your new house's permit", `<p class="source">${pre ? "Gov. Code § 65852.27" : "Gov. Code § 66317(a)(3)"}</p>`));
  if (p.coastal !== "no") TL[4].push(row("Coastal Development Permit", "State max: <strong>60 days</strong> after complete", `<p class="source">Gov. Code § 66329</p>`));
  TL[7].push(row("Construction to Certificate of Occupancy", bt
    ? `Median <strong>${bt.median_days} days</strong> (middle half: ${bt.p25_days}–${bt.p75_days} days) in ${esc(city.name)}, from ${bt.pairs} ADUs. ${Math.round(bt.share_within_12mo * 100)}% finished within 12 months.`
    : `<span class="chip unknown">Unknown</span> No permit-to-occupancy data for ${esc(city.name)} in our dataset.`,
    `<p class="source">BackyardADU.net build_times.csv (third party, from HCD APR Table A2) · downloaded ${esc(STATS.downloaded)} · <a href="${esc(STATS.sources.official)}" target="_blank" rel="noopener">official APR data</a></p>`));
  const total = bt && p.existing ? `<div class="callout info"><strong>Rough picture, from a complete application to move-in</strong>Up to ${pre ? "about 3 weeks + 30 days" : "about 3 weeks + 60 days"} for review (legal maximums; many cities are faster), plus a median of ${bt.median_days} days to build and get the Certificate of Occupancy in ${esc(city.name)}. That adds up to roughly ${Math.round(((pre ? 51 : 81) + bt.median_days) / 30)} months, not counting design and plan corrections. <span class="chip assumption">ASSUMPTION</span> We add a legal maximum to a historical median; this is a rough guide, not a forecast.</div>` : "";
  for (const n of [1, 2, 3, 4, 7]) {
    if (!TL[n].length) continue;
    S[n].push(`<h3 class="step-sub">${n === 4 ? `How long will it take in ${esc(city.name)}?` : "How long"}</h3><div class="tl">${TL[n].join("")}</div>`);
  }
  if (total) S[7].push(total);
  const permits = (st.permits_by_year || []).filter((r) => r.year >= 2019);
  S[4].push(`<h3 class="step-sub">ADUs permitted in ${esc(city.name)} per year</h3>
    ${permits.length ? barChart(permits) : `<p><span class="chip unknown">Unknown</span> No data.</p>`}
    ${city.name === "Irvine" ? `<div class="callout warn"><strong>Data looks incomplete</strong>The dataset shows very few Irvine ADU permits and is missing some years. Check HCD's Annual Progress Report data directly before drawing conclusions.</div>` : ""}
    <p class="source">BackyardADU.net permits_ca.csv (third party, merged from HCD APR Table A2) · downloaded ${esc(STATS.downloaded)}. Cite the <a href="${esc(STATS.sources.official)}" target="_blank" rel="noopener">HCD APR dataset</a> for anything official.</p>`);

  // Sidebar durations: from the Timeline data above; "unknown" where it has none.
  const vals = (n) => city.published_timelines.filter((t) => timelineStep(t) === n).map((t) => `${t.step}: ${t.value}`);
  DUR[1] = "Design & plans: unknown";
  DUR[2] = vals(2).join("; ") || "unknown";
  DUR[3] = vals(3).join("; ") || "unknown";
  DUR[4] = p.existing ? `≤ 15 business days + ${pre ? "30" : "60"} days (state max)` : "≤ 15 business days + decided with your new house";
  DUR[5] = "unknown";
  DUR[6] = "unknown";
  DUR[7] = bt ? `median ${bt.median_days} days to Certificate of Occupancy` : "unknown";

  // ----- State-law check (from the old "State-law check" tab) -----
  const rules = LAW.rules.filter((r) => applies(r, p));
  const relevantFlags = city.flags.filter((f) => !f.rule || LAW.rules.some((r) => r.id === f.rule && applies(r, p)) || f.type === "stale-citation");
  const feeRule = p.type !== "jadu" && p.size > 0 ? ruleById(p.size <= 750 ? "impact-fee-750" : "impact-fee-over-750") : null;
  const sizeNote = feeRule ? `<div class="callout ${p.size <= 750 ? "ok" : "warn"} flag">${citeTop(esc(feeRule.cite), "Your size")}
    <h3>At ${p.size} sq ft, ${p.size <= 750 ? "no impact fees" : "impact fees may apply"}</h3>
    <p>${p.size <= 750 ? "ADUs of 750 sq ft or less are exempt from impact fees." : "Over 750 sq ft, impact fees are allowed but must be proportional to the main house's size. 750 sq ft or less removes them."}${p.size < 500 ? " Under 500 sq ft, school impact fees do not apply either." : " Over 500 sq ft, a school district may charge school fees (Education Code § 17620)."}</p>${lawLinks(feeRule)}</div>` : "";

  const FLAGS = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const f of relevantFlags) FLAGS[flagStep(f)].push(flagBox(f));
  const RULES = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const r of rules) RULES[RULE_STEP[r.id] || 1].push(ruleCard(r));

  const lawIntro = `<p>State law sets the maximum a city can require. Where ${esc(city.name)}'s materials look out of step, we show the city's version and the state's version side by side. We don't decide who is right.</p>`;
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const extra = n === 6 ? sizeNote : "";
    if (FLAGS[n].length || extra || n === 1) {
      S[n].push(`<h3 class="step-sub">State-law check: ${esc(city.name)} vs. state law</h3>${n === 1 ? lawIntro : ""}`);
      if (n === 1 && !relevantFlags.length) S[n].push(`<div class="callout ok"><strong>No conflicts flagged</strong>We did not find a mismatch in the ${esc(city.name)} materials we read. That is not the same as compliant: we only read what is linked.</div>`);
      S[n].push(FLAGS[n].join("") + extra);
    }
    if (RULES[n].length) S[n].push(`<h3 class="step-sub">State rules for this step (${RULES[n].length} of the ${rules.length} rules that apply to your project)</h3><div class="rules">${RULES[n].join("")}</div>`);
  }
  const flagCount = Object.fromEntries(Object.keys(FLAGS).map((n) => [n, relevantFlags.filter((f) => flagStep(f) === Number(n) && ["state-law", "stale-citation", "conflict"].includes(f.type)).length]));
  return { S, DUR, flagCount };
}

// ---------- step state (page memory only: no accounts, no server) ----------
const DONE = new Set();
let VIEW = null; // 1..7, "stale" or "ask"

function firstUnfinished() { return (PATH_STEPS.find((s) => !DONE.has(s.n)) || {}).n || null; }

function renderSidebar(DUR, flagCount) {
  const here = firstUnfinished();
  $("#ps-list").innerHTML = PATH_STEPS.map((s) => {
    const done = DONE.has(s.n), active = VIEW === s.n, isHere = here === s.n;
    return `<li class="ps${done ? " done" : ""}${isHere ? " here" : ""}${active ? " active" : ""}">
      <button type="button" class="ps-btn" data-step="${s.n}"${active ? ' aria-current="step"' : ""}>
        <span class="ps-num" aria-hidden="true">${done ? "✓" : s.n}</span>
        <span class="ps-text">
          <span class="ps-name">${s.n}. ${esc(s.name)}${flagCount[s.n] ? ` <span class="badge" title="City vs. state items">${flagCount[s.n]}</span>` : ""}</span>
          <span class="ps-dur">${esc(DUR[s.n])}</span>
          ${isHere ? `<span class="ps-here">You are here</span>` : ""}
        </span>
      </button>
      <label class="ps-done"><input type="checkbox" data-done="${s.n}"${done ? " checked" : ""}> <span>Done</span></label>
    </li>`;
  }).join("");
  $$(".ps-tool").forEach((b) => b.classList.toggle("active", VIEW === b.dataset.view));
}

function showView(view) {
  VIEW = view;
  $$(".path-content .tab-panel").forEach((pnl) => {
    const id = typeof view === "number" ? `step-${view}` : `view-${view}`;
    pnl.hidden = pnl.id !== id;
  });
  $("#path-head").hidden = typeof view !== "number";
  render(true);
}

let LAST = null;
function renderPath(city, p) {
  const { S, DUR, flagCount } = buildPath(city, p);
  for (const s of PATH_STEPS) {
    const next = PATH_STEPS.find((x) => x.n === s.n + 1);
    $(`#step-${s.n}`).innerHTML = `
      <div class="step-top">
        <h2>Step ${s.n}: ${esc(s.name)}</h2>
        <label class="step-done"><input type="checkbox" data-done="${s.n}"${DONE.has(s.n) ? " checked" : ""}> Mark this step done</label>
      </div>
      <p class="hint step-dur">Expected duration: ${esc(DUR[s.n])}</p>
      ${S[s.n].join("")}
      ${next ? `<div class="row step-next"><button type="button" class="btn ghost" data-goto="${next.n}">Next: ${next.n}. ${esc(next.name)} →</button></div>` : ""}`;
  }
  $("#path-head").innerHTML = `<h2>Your path: ${esc(TYPE_LABEL[p.type])} in ${esc(city.name)}</h2>`;
  const pb = $("#print-btn"); if (pb) pb.onclick = () => printTab(2);
  LAST = { DUR, flagCount };
  renderSidebar(DUR, flagCount);
}

function printTab(n) {
  const panel = $(`#step-${n}`);
  panel.classList.add("printing");
  window.print();
  panel.classList.remove("printing");
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
function render(sidebarOnly) {
  const p = readForm();
  const city = CITIES.find((c) => c.name === p.city);
  if (!city) { $("#empty").hidden = false; $("#output").hidden = true; $("#city-card").hidden = true; return; }
  $("#empty").hidden = true; $("#output").hidden = false;
  if (sidebarOnly === true && LAST) { renderSidebar(LAST.DUR, LAST.flagCount); return; }
  renderCityCard(city);
  renderPath(city, p);
}

async function init() {
  [LAW, { cities: CITIES }, STATS] = await Promise.all(["state-law.json", "cities.json", "city-stats.json"].map((f) => fetch(`/data/${f}`).then((r) => r.json())));
  CITIES.sort((a, b) => a.name.localeCompare(b.name));
  const qs = new URLSearchParams(location.search);
  ProjectForm.mount($("#project-panel"), CITIES.map((c) => c.name), { city: qs.get("city") ?? undefined, type: qs.get("type") || undefined });
  ProjectForm.onChange(() => render());

  // Sidebar: step buttons, tools, done checkboxes (sidebar and in-step), "Next" buttons.
  document.addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".ps-btn");
    if (stepBtn) return showView(Number(stepBtn.dataset.step));
    const tool = e.target.closest(".ps-tool");
    if (tool) return showView(tool.dataset.view);
    const go = e.target.closest("[data-goto]");
    if (go) { showView(Number(go.dataset.goto)); $("#output").scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  document.addEventListener("change", (e) => {
    const box = e.target.closest("input[data-done]");
    if (!box) return;
    const n = Number(box.dataset.done);
    if (box.checked) DONE.add(n); else DONE.delete(n);
    $$(`input[data-done="${n}"]`).forEach((x) => (x.checked = box.checked));
    render(true);
  });

  $("#stale-run").onclick = runStale;
  $("#stale-sample").onclick = () => { $("#stale-input").value = "A JADU covenant shall be recorded per Government Code Section 65852.22. ADUs shall comply with Gov. Code 65852.2 and fees per Section 66324."; runStale(); };
  $("#ask-form").addEventListener("submit", ask);

  fetch("/api/status").then((r) => r.json()).then((s) => { if (!s.qa) $("#ask-status").textContent = "Q&A is off on this server (no API key). Everything else works."; }).catch(() => {});
  render();
  const start = qs.get("step") ? (/^\d$/.test(qs.get("step")) ? Number(qs.get("step")) : qs.get("step")) : firstUnfinished() || 1;
  showView(start);
}

init();
