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

// ---------- small UI helpers (presentation only) ----------
const ICON_WARN = `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.2 1.6 17h16.8L10 2.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 7.5v4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1.1" fill="currentColor"/></svg>`;
const ICON_INFO = `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="6.2" r="1.1" fill="currentColor"/></svg>`;
const ICON_CLOCK = `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 5.8V10l2.8 1.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_PHONE = `<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.2 2.5h2.6l1.3 3.6-1.8 1.2a9.5 9.5 0 0 0 5.4 5.4l1.2-1.8 3.6 1.3v2.6c0 .9-.7 1.6-1.6 1.6A13.7 13.7 0 0 1 3.6 4.1c0-.9.7-1.6 1.6-1.6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const PHONE_RE = /\(\d{3}\)\s?\d{3}-\d{4}/g;
const telHref = (phone) => `tel:+1${phone.replace(/\D/g, "")}`;
// Turns phone numbers in already-escaped text into tap-to-call buttons.
const telify = (html) => html.replace(PHONE_RE, (ph) => `<a class="btn tel" href="${telHref(ph)}">${ICON_PHONE}Call ${ph}</a>`);

// ---------- homeowner path ----------
// UI only. Same data, rules, citations and calculations as before; detail moved behind buttons.
const PATH_STEPS = [
  { n: 1, name: "Before you apply" },
  { n: 2, name: "Gather paperwork" },
  { n: 3, name: "Submit" },
  { n: 4, name: "City review" },
  { n: 5, name: "Corrections or denial" },
  { n: 6, name: "Fees" },
  { n: 7, name: "Build and move in" },
];

// Which step each state rule belongs under.
const RULE_STEP = {
  "size-setback-800": 1, "height-detached": 1, "height-attached": 1, parking: 1, "parking-jadu": 1, "owner-occ-adu": 1, "jadu-owner": 1,
  "no-deed-adu": 2, "jadu-deed": 2, "garage-demo": 2,
  "completeness-15": 4, "decision-60": 4, "deemed-approved": 4, "concurrent-new-home": 4, "preapproved-30": 4, ministerial: 4, coastal: 4,
  "denial-comments": 5, appeal: 5, nonconforming: 5,
  "impact-fee-750": 6, "impact-fee-over-750": 6, "impact-fee-jadu-500": 6, "utility-connection": 6, "school-fees": 6,
  co: 7, sprinklers: 7, "jadu-rental": 7,
};

// Plain-language headlines for the "Your rights" rows. The original wording is shown unchanged
// when a row is opened.
const RIGHT_HEADLINE = {
  "completeness-15": "The city has 15 business days to tell you if anything is missing",
  "decision-60": "The city must say yes or no within 60 days of a complete application",
  "deemed-approved": "No answer within 60 days? Your application counts as approved",
  "concurrent-new-home": "Building a new house too? The city can decide both together",
  "preapproved-30": "Using a pre-approved plan? The city must decide within 30 days",
  "denial-comments": "If the city says no, it must tell you in writing how to fix it",
  appeal: "You can appeal a \"no\" or an \"incomplete\" decision",
  ministerial: "No public hearing: the city must approve if you meet the written rules",
  "impact-fee-750": "No impact fees for an ADU of 750 sq ft or less",
  "impact-fee-over-750": "Over 750 sq ft, impact fees must be scaled to your house's size",
  "impact-fee-jadu-500": "No impact fees for a JADU of 500 sq ft or less",
  "utility-connection": "Water and sewer hookup fees can't treat your ADU as a new home",
  "school-fees": "School fees only apply to ADUs over 500 sq ft, if the district charges them",
  "size-setback-800": "The city must allow at least an 800 sq ft ADU, 4 ft from side and back lines",
  "height-detached": "A detached ADU can be at least 16 ft tall (18 ft in some cases)",
  "height-attached": "An attached ADU can be up to 25 ft tall, or your house's limit if lower",
  parking: "At most one parking space, and no replacement for a garage you convert",
  "parking-jadu": "The city can't require parking for a JADU",
  "owner-occ-adu": "You don't have to live on the property to build an ADU",
  "no-deed-adu": "The city can't make you record a deed restriction for an ADU",
  "jadu-deed": "A JADU needs a recorded deed restriction",
  "jadu-owner": "If the JADU shares a bathroom with the house, the owner must live there",
  "jadu-rental": "A JADU can't be rented for 30 days or less",
  coastal: "In the Coastal Zone, the coastal permit decision is due within 60 days",
  "garage-demo": "Tearing down a detached garage is approved together with your ADU",
  sprinklers: "Adding an ADU doesn't require fire sprinklers in your main house",
  nonconforming: "Older issues with your existing house usually can't block your ADU",
  co: "Get a Certificate of Occupancy before anyone moves in",
};

// Which step each city flag (City vs. state item) relates to; used to file its sources.
const FEE_RULES = ["impact-fee-750", "impact-fee-over-750", "impact-fee-jadu-500", "utility-connection", "school-fees"];
function flagStep(f) {
  const ids = [f.rule, ...(f.sides || []).map((sd) => sd.rule)].filter(Boolean);
  if (ids.some((id) => FEE_RULES.includes(id))) return 6;
  if (ids.some((id) => id === "no-deed-adu" || id === "jadu-deed")) return 2;
  if (f.type === "conflict") return 3;
  if (f.type === "missing" && /process|steps|checklist|portal|forms/i.test(f.text)) return 3;
  return 1;
}

// One plain line per paperwork item: what it is and who usually prepares it.
function docLine(name) {
  const n = name.toLowerCase();
  if (/coastal development permit/.test(n)) return "A separate permit if your lot is in the Coastal Zone. Ask the city where to apply.";
  if (/demolition permit/.test(n)) return "Permission to tear down the garage. The city reviews it together with your ADU.";
  if (/deed restriction|covenant/.test(n)) return "A document recorded on your property's title. The city usually provides it; you sign it, often before a notary.";
  if (/verification form/.test(n)) return "A city form that confirms the basics of your project. Ask the planning team for it; you fill it out.";
  if (/sewer/.test(n)) return "Written confirmation that the sewer line can serve the ADU. You request it from the city.";
  if (/water meter/.test(n)) return "Application for a water meter for the ADU. You fill it out.";
  if (/address/.test(n)) return "Request for a street address for the ADU. You fill it out.";
  if (/school fee/.test(n)) return "Form used to work out school fees. It comes in the city's application package.";
  if (/transportation corridor/.test(n)) return "A form for the Transportation Corridor Agencies. It comes in the city's application package.";
  if (/electronic signature/.test(n)) return "Needed only if you sign documents digitally.";
  if (/deposit/.test(n)) return "Sets up the account the city bills its review time to. You sign it.";
  if (/hold harmless|affidavit|authorization/.test(n)) return "A signed statement the city requires. You (the owner) sign it.";
  if (/grant deed/.test(n)) return "A copy of your property's deed. You may already have it, or can get it from the County Recorder.";
  if (/handout/.test(n)) return "The city's rules for ADUs, like size and setbacks. Read it before you design.";
  if (/pre-approved .*plan|plan set/.test(n)) return "Ready-made plans the city has already reviewed. Download them from the city.";
  if (/checklist/.test(n)) return "The city's list of what to include. Use it to check your package before you submit.";
  if (/application/.test(n)) return "The main application form. You or your designer fill it out and sign it.";
  if (/plan|drawing|calculation|construction document|title 24|structural|grading/.test(n)) return "Drawings and calculations for your ADU. Usually prepared by your designer, architect or engineer.";
  return "Ask the city what this item needs.";
}

// Short, plain duration for the sidebar and chip. Returns null when unknown (never shown).
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function parseLead(value) {
  const nums = [...String(value).toLowerCase().matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/g)].map((m) => WORDS[m[1]] ?? Number(m[1]));
  return nums.length ? { n: Math.max(...nums), business: /business/i.test(value) } : null;
}
function timelineStep(t) {
  if (/sewer|meter|verification/i.test(t.step)) return 2;
  if (/request/i.test(t.step)) return 3;
  return 4;
}
function plainDurations(city, p, bt) {
  const pre = p.preapproved && (p.type === "detached" || p.type === "garage_replace");
  const lead = (n) => {
    const leads = city.published_timelines.filter((t) => timelineStep(t) === n).map((t) => parseLead(t.value)).filter(Boolean);
    if (!leads.length) return null;
    const max = leads.reduce((a, b) => (b.n > a.n ? b : a));
    return `${n === 2 ? "City checks" : "City reply"}: up to ${max.n} ${max.business ? "business " : ""}day${max.n === 1 ? "" : "s"}`;
  };
  const m = (days) => Math.round(days / 30.44);
  return {
    1: null,
    2: lead(2),
    3: lead(3),
    // 15 business days (~3 weeks) + 60 or 30 days, as in the existing timeline estimate.
    4: p.existing ? `Up to about ${m(pre ? 51 : 81)} months` : null,
    5: null,
    6: null,
    7: bt ? `Typically about ${m(bt.median_days)} months` : null,
  };
}

const NOT_CONFIRMED = (status) => /snippet/.test(status || "");
const ntag = (status) => (NOT_CONFIRMED(status) ? ` <span class="tag nc">Not yet confirmed</span>` : "");
const ext = (url, text, cls = "btn ghost act") => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${text} <span aria-hidden="true">↗</span></a>`;

function contactAction(city) {
  const phone = city.contact ? (city.contact.text.match(PHONE_RE) || [])[0] : null;
  return phone ? `<a class="btn ghost act" href="${telHref(phone)}">${ICON_PHONE}Call Planning: ${esc(phone)}</a>` : ext(city.adu_page.url, "Find contact info");
}

// ---------- build everything for one project ----------
function buildPath(city, p) {
  const isJadu = p.type === "jadu";
  const pre = p.preapproved && (p.type === "detached" || p.type === "garage_replace");
  const mk = () => ({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] });
  const TODO = mk(), BODY = mk(), TILES = mk(), RIGHTS = mk(), SRC = mk();
  const st = STATS.cities[city.name] || {};
  const bt = st.permit_to_co;
  const DUR = plainDurations(city, p, bt);

  // Sources: { group, label, url, checked, status, note }
  const src = (n, s) => SRC[n].push(s);
  const lawSrcs = (n, cite, section, page, label) => {
    src(n, { group: "Law", label: label ? `${label}: ${cite}` : cite, url: lawUrl(section), linkText: "Read the law on leginfo" });
    if (page) src(n, { group: "Law", label: `HCD ADU Handbook (March 2026), p. ${page}`, url: LAW.primary_source.url, checked: LAW.primary_source.checked });
  };
  const citySrc = (n, label, s) => s && src(n, { group: city.name, label, url: s.url, checked: s.checked, status: s.status });

  const bullet = (html, actions = "") => `<li><span class="td-body">${html}</span>${actions ? `<span class="td-actions">${actions}</span>` : ""}</li>`;
  const note = (html, actions = "") => `<div class="soft-note">${ICON_INFO}<div><p>${html}</p>${actions ? `<div class="td-actions">${actions}</div>` : ""}</div></div>`;
  const tile = (big, label, small = "") => `<div class="tile"><div class="tile-big">${big}</div><div class="tile-label">${label}</div>${small ? `<div class="tile-small">${small}</div>` : ""}</div>`;

  // ----- Step 1: Before you apply -----
  const programs = city.programs.map((g) => ext(g.url, esc(g.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/:.*$/, "").trim()))).join("");
  TODO[1].push(bullet(`Ask ${esc(city.name)}'s planning team which local rules ${UI.info("objective")} apply to your lot.`, contactAction(city) + ext(city.adu_page.url, "City's ADU page") + programs));
  citySrc(1, `${city.name} ADU page`, city.adu_page);
  if (city.contact) src(1, { group: city.name, label: `Planning contact: ${city.contact.text}`, checked: city.contact.checked, status: city.contact.status });
  for (const g of city.programs) src(1, { group: city.name, label: `${g.name}${g.detail ? `: ${g.detail}` : ""}`, url: g.url, checked: g.checked, status: g.status });
  if (p.coastal !== "no") {
    TODO[1].push(bullet(`${p.coastal === "unsure" ? "Not sure if you're in the Coastal Zone? Ask the city. " : ""}In the Coastal Zone ${UI.info("coastal")} you may also need a coastal permit, decided within 60 days.`));
    lawSrcs(1, "Gov. Code § 66329", "66329", "14", "Coastal Development Permit");
  }
  if (pre) {
    TODO[1].push(bullet(`Using a pre-approved plan ${UI.info("preapproved")}? The city must approve or deny within 30 days.`));
    lawSrcs(1, "Gov. Code § 65852.27 (AB 1332)", "65852.27", "13, 50", "Pre-approved plans");
  }
  BODY[1].push(`<section class="map-card step-sec">
    <h3>See what can be built on your lot</h3>
    <p>Orange outline = flood or fire zone. Covers the Anaheim Hills demo area and any Orange County ZIP you load, for now.</p>
    <div class="td-actions">${ext("/map.html", "Open the map", "btn act")}</div>
  </section>`);
  for (const [label, url] of [["Screening map: lots and zoning, SCAG 2024 Zoning (preliminary, Oct 2025)", "https://maps.scag.ca.gov/scaggis/rest/services/LDX/Zoning_poly_OR/MapServer/0"], ["Screening map: address and year built, OC Parcels", "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Parcels/FeatureServer/0"], ["Screening map: flood zones, OC Floodplains / FEMA", "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Floodplains/MapServer/0"], ["Screening map: fire zones, OC Fire Hazard Severity Zones LRA (2011 map)", "https://www.ocgis.com/arcpub/rest/services/Map_Layers/Fire_Hazard_Severity_Zones_LRA/MapServer/0"], ["Screening map: ZIP boundaries, U.S. Census 2020 ZIP Code Tabulation Areas", "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1"], ["Screening map rules (HCD fact sheets, April 2026)", "/data/screening-rules.json"]]) src(1, { group: "Data", label, url, checked: "2026-11-07" });
  src(1, { group: "Notes", label: "Design and plans: we found no source for typical times, so no duration is shown for this step." });

  // ----- Step 2: Gather paperwork -----
  TODO[2].push(bullet("Collect each item in the checklist below, then print the packet to bring to the city."));
  if (isJadu) { TODO[2].push(bullet(`Record a deed restriction ${UI.info("deed")} for the JADU: it can't be sold separately from the house.`)); lawSrcs(2, "Gov. Code § 66333(c)", "66333", "21", "JADU deed restriction"); }
  const docs = city.documents.filter((d) => (!d.jadu_only || isJadu) && (!d.coastal_only || p.coastal !== "no"));
  const stateDocs = [];
  if (isJadu && !docs.some((d) => d.jadu_only)) stateDocs.push({ name: "JADU deed restriction (recorded)", how: "No separate sale from the house; size/attributes per state law. Your city provides the form.", sign: true, record: true, cite: "Gov. Code § 66333(c)", section: "66333" });
  if (p.coastal !== "no" && !docs.some((d) => d.coastal_only)) stateDocs.push({ name: "Coastal Development Permit application (if your parcel is in the Coastal Zone)", how: "From the city (if it has a certified Local Coastal Program) or the Coastal Commission.", cite: "Gov. Code § 66329", section: "66329" });
  if (p.type === "garage_replace") stateDocs.push({ name: "Demolition permit for the detached garage", how: "The city must review and issue it at the same time as the ADU permit.", cite: "Gov. Code § 66314(e)", section: "66314" });
  const docStatus = city.documents_source?.status;
  const tags = (d) => [d.sign ? `<span class="tag sign">Sign</span>` : "", d.notary ? `<span class="tag notary">Notarize</span>` : "", d.record ? `<span class="tag record">Record with County Recorder</span>` : ""].join("");
  const li = (d, i, prefix, status) => `<li><input type="checkbox" id="${prefix}${i}"><label for="${prefix}${i}"><span class="name">${esc(d.name)}</span>${ntag(status)}<span class="doc-what">${esc(docLine(d.name))}</span>${d.how ? `<span class="doc-how">${/^https?:/.test(d.how) ? `<a href="${esc(d.how)}" target="_blank" rel="noopener">Get the form <span aria-hidden="true">↗</span></a>` : esc(d.how)}</span>` : ""}${tags(d) ? `<span class="doc-tags">${tags(d)}</span>` : ""}</label></li>`;
  BODY[2].push(`<section class="step-sec paperwork">
    <div class="print-only"><h1>ADU paperwork checklist — ${esc(city.name)}</h1><p>${esc(TYPE_LABEL[p.type])}, ${p.size || "?"} sq ft. Printed from ADU Pathfinder (prototype, not legal advice). Confirm every item with the city.</p></div>
    <div class="row no-print sec-head"><h3>Paperwork checklist</h3><button class="btn ghost" id="print-btn">Print packet</button></div>
    ${docs.length ? `<h4>${esc(city.name)} asks for</h4><ul class="docs">${docs.map((d, i) => li(d, i, "cd", docStatus)).join("")}</ul>`
      : note(`${esc(city.name)} hasn't posted an ADU checklist online that we could find. Ask the planning team for it.`, contactAction(city))}
    ${stateDocs.length ? `<h4>Required by state law for your project</h4><ul class="docs">${stateDocs.map((d, i) => li(d, i, "sd")).join("")}</ul>` : ""}
  </section>`);
  citySrc(2, `${city.name} ADU submittal list`, city.documents_source);
  for (const d of docs) {
    if (/^https?:/.test(d.how || "")) src(2, { group: city.name, label: `Form: ${d.name}`, url: d.how, checked: city.documents_source?.checked, status: docStatus });
    if (d.cite) src(2, { group: "Law", label: `${d.name}: ${d.cite}` });
    if (d.law_flag) { const r = ruleById(d.law_flag); src(2, { group: "Law", label: `City vs. state: ${city.name} lists "${d.name}"; state law: ${r.cite} — ${r.title}. Details in the Old-law checker.`, url: lawUrl(r.section), linkText: "Read the law on leginfo" }); }
  }
  for (const d of stateDocs) src(2, { group: "Law", label: `${d.name}: ${d.cite}`, url: lawUrl(d.section), linkText: "Read the law on leginfo" });
  if (!docs.length) lawSrcs(2, "Gov. Code § 65913.3 (AB 2234: ADU checklists must be posted online)", "65913.3", null);

  // ----- Step 3: Submit -----
  if (city.portal) {
    // Internal research notes like "(per DATA-SOURCES; not confirmed …)" stay in Sources; show a tag instead.
    const internal = /per DATA-SOURCES/i.test(city.portal.name);
    const portalName = internal ? city.portal.name.replace(/\s*\(.*\)\s*$/, "") : city.portal.name;
    TODO[3].push(bullet(`Submit through ${esc(portalName)}.${internal ? ` <span class="tag nc">Not yet confirmed</span>` : ntag(city.portal.status)}${city.portal.note ? ` ${esc(city.portal.note)}` : ""}`, city.portal.url ? ext(city.portal.url, "Open the portal") : contactAction(city)));
    citySrc(3, `Where to submit: ${city.portal.name}`, city.portal.url ? city.portal : { ...city.portal, url: city.adu_page.url });
  } else {
    BODY[3].push(note(`${esc(city.name)}'s page doesn't say how to submit. Ask the planning team.`, contactAction(city)));
  }
  if (city.steps.length) {
    TODO[3].push(bullet(`Follow ${esc(city.name)}'s steps below, in order.`));
    const steps = city.steps.map((s) => {
      const text = typeof s === "string" ? s : s.text;
      const r = typeof s === "object" && s.state_rule ? ruleById(s.state_rule) : null;
      return `<li>${telify(esc(text))}${r ? `<span class="hint">State rule: ${esc(r.title)}.</span>` : ""}</li>`;
    });
    const unconfirmed = NOT_CONFIRMED(city.steps_source?.status);
    BODY[3].push(`<section class="step-sec">
      <h3 class="sec-title">${esc(city.name)}'s steps</h3>
      ${unconfirmed ? note(`These steps come from a summary of ${esc(city.name)}'s page that we haven't confirmed yet. Check them on the city's page.`, ext(city.steps_source.url, "City's page")) : ""}
      <ol class="city-steps">${steps.slice(0, 5).join("")}</ol>
      ${steps.length > 5 ? `<div class="more-steps" hidden><ol class="city-steps" start="6">${steps.slice(5).join("")}</ol></div><button type="button" class="btn ghost more-btn" aria-expanded="false">Show all ${steps.length} steps</button>` : ""}
    </section>`);
    citySrc(3, `${city.name} process page`, city.steps_source);
    for (const s of city.steps) if (typeof s === "object" && s.state_rule) { const r = ruleById(s.state_rule); lawSrcs(3, r.cite, r.section, r.handbook_page, "State rule matching a city step"); }
  } else {
    BODY[3].push(note(`${esc(city.name)} hasn't posted step-by-step instructions online. Ask the planning team for its ADU checklist.`, contactAction(city)));
    lawSrcs(3, "Gov. Code § 65913.3 (AB 2234: ADU checklists must be posted online)", "65913.3", null);
  }

  // ----- Step 4: City review -----
  TILES[4].push(tile("15 business days", "for the city to say if your application is complete", `If it doesn't answer in time, the application counts as complete ${UI.info("deemedcomplete")}.`));
  TILES[4].push(p.existing
    ? tile(`${pre ? 30 : 60} days`, "for the city to approve or deny", "You can ask for more time; the clock pauses.")
    : tile("With your house", "the city may decide the ADU together with your new home's permit", "No public hearing for the ADU."));
  TODO[4].push(bullet(`Review is ministerial ${UI.info("ministerial")}: staff check your plans against written rules. Keep every letter and note the date your application became complete.`, `<a class="btn ghost act" href="/timeline.html">Track your deadlines</a>`));
  lawSrcs(4, "Gov. Code § 66317(a)(2)(A): 15 business days to decide if complete", "66317", "14, 35");
  src(4, { group: "Law", label: "Gov. Code § 66317(a)(2)(F): deemed complete if the city misses that deadline (HCD ADU Handbook p. 35)", url: LAW.primary_source.url, checked: LAW.primary_source.checked });
  if (pre) lawSrcs(4, "Gov. Code § 65852.27: 30 days for a pre-approved detached plan", "65852.27", "50");
  else lawSrcs(4, "Gov. Code § 66317(a)(3): approve or deny within 60 days", "66317", "11, 35");
  if (p.coastal !== "no") lawSrcs(4, "Gov. Code § 66329: Coastal Development Permit within 60 days", "66329", "14");
  for (const t of city.published_timelines.filter((t) => timelineStep(t) === 4)) src(4, { group: city.name, label: `${t.step}: ${t.value}`, url: t.source, checked: t.checked, status: t.status });
  src(4, { group: "Data", label: "ADU permits issued per year by city: BackyardADU.net permits_ca.csv (third party, merged from HCD APR Table A2)", url: "https://backyardadu.net/data/permits_ca.csv", checked: STATS.downloaded });
  src(4, { group: "Data", label: "Official source: HCD Housing Element Annual Progress Report data", url: STATS.sources.official, checked: STATS.downloaded });

  // ----- Step 5: Corrections or denial -----
  TODO[5].push(bullet("If the city says no, it must tell you in writing what's missing and how to fix it."));
  TODO[5].push(bullet("You can appeal. The city must give you a written decision within 60 business days of your appeal."));
  lawSrcs(5, "Gov. Code § 66317(b), (d)(1)", "66317", "11, 14");

  // ----- Step 6: Fees -----
  if (p.size > 0) {
    if (isJadu) TILES[6].push(tile("$0", `impact fees ${UI.info("impact")} at ${p.size} sq ft`, "A JADU of 500 sq ft or less is exempt."));
    else if (p.size <= 750) TILES[6].push(tile("$0", `impact fees ${UI.info("impact")} at ${p.size} sq ft`, "ADUs of 750 sq ft or less are exempt."));
    else TILES[6].push(tile("Maybe", `impact fees ${UI.info("impact")} at ${p.size} sq ft`, "Over 750 sq ft, fees are allowed but must be scaled to your house's size. 750 sq ft or less removes them."));
    TILES[6].push(p.size < 500 ? tile("$0", "school fees", "Under 500 sq ft, school fees don't apply.") : tile("Maybe", "school fees", "A school district may charge them for ADUs over 500 sq ft."));
  }
  if (city.fees.length) {
    for (const f of city.fees) { TODO[6].push(bullet(`${esc(f.item)}: ${esc(f.value)}${ntag(f.status)}`)); src(6, { group: city.name, label: `${f.item}: ${f.value}`, url: f.source, checked: f.checked, status: f.status }); }
    if (TODO[6].length > 3) TODO[6].length = 3;
  } else {
    TODO[6].push(`<li class="li-note">${note(`${esc(city.name)}'s fee amounts aren't confirmed. Ask the city for its current fee schedule.`, contactAction(city))}</li>`);
  }
  lawSrcs(6, "Gov. Code § 66311.5(c): impact fees", "66311.5", "15, 22");
  src(6, { group: "Law", label: "Education Code § 17620: school fees (as described in the HCD ADU Handbook p. 22)", url: lawUrl("17620"), linkText: "Read the law on leginfo" });

  // ----- Step 7: Build and move in -----
  if (bt) TILES[7].push(tile(`About ${Math.round(bt.median_days / 30.44)} months`, `typical time from building permit to move-in in ${esc(city.name)}`, `Half of ${esc(city.name)}'s ADUs took between ${Math.round(bt.p25_days / 30.44)} and ${Math.round(bt.p75_days / 30.44)} months.`));
  TODO[7].push(bullet(`Build, pass the city's inspections, then get a Certificate of Occupancy ${UI.info("co")} before anyone moves in.`));
  lawSrcs(7, "Gov. Code § 66328", "66328", "35");
  src(7, { group: "Data", label: bt ? `Build time: median ${bt.median_days} days (middle half ${bt.p25_days}–${bt.p75_days} days) from ${bt.pairs} ADUs in ${city.name}, BackyardADU.net build_times.csv (third party, from HCD APR Table A2)` : `Build time: no permit-to-occupancy data for ${city.name} in BackyardADU.net build_times.csv`, url: "https://backyardadu.net/data/build_times.csv", checked: STATS.downloaded });
  src(7, { group: "Data", label: "Official source: HCD Housing Element Annual Progress Report data", url: STATS.sources.official, checked: STATS.downloaded });
  if (bt && p.existing) src(7, { group: "Notes", label: `Rough picture (ASSUMPTION): up to ${pre ? "about 3 weeks + 30 days" : "about 3 weeks + 60 days"} for review (legal maximums; many cities are faster), plus a median of ${bt.median_days} days to build and get the Certificate of Occupancy in ${city.name}, roughly ${Math.round(((pre ? 51 : 81) + bt.median_days) / 30)} months, not counting design and plan corrections. We add a legal maximum to a historical median; this is a rough guide, not a forecast.` });

  // Timing sources for steps 2 and 3 (city lead times)
  for (const t of city.published_timelines.filter((t) => timelineStep(t) !== 4)) src(timelineStep(t), { group: city.name, label: `${t.step}: ${t.value}`, url: t.source, checked: t.checked, status: t.status });

  // ----- Your rights -----
  const rules = LAW.rules.filter((r) => applies(r, p));
  for (const r of rules) {
    const n = RULE_STEP[r.id] || 1;
    RIGHTS[n].push(`<details class="right-row">
      <summary><span class="cat-tag">${esc(r.topic)}</span><span class="rr-head">${esc(RIGHT_HEADLINE[r.id] || r.title)}</span></summary>
      <div class="rr-body"><p><strong>${esc(r.title)}.</strong> ${esc(r.plain)}</p><p class="source">${esc(r.cite)} · <a href="${lawUrl(r.section)}" target="_blank" rel="noopener">Read § ${esc(r.section)} on leginfo</a> · <a href="${esc(LAW.primary_source.url)}" target="_blank" rel="noopener">HCD ADU Handbook (Mar 2026), p. ${esc(r.handbook_page)}</a> · checked ${esc(LAW.primary_source.checked)}</p></div>
    </details>`);
    lawSrcs(n, r.cite, r.section, r.handbook_page, r.title);
  }

  // City vs. state items live in the Old-law checker (not in the homeowner steps). Their source
  // links stay reachable from the Sources box of the step they relate to.
  const relevantFlags = city.flags.filter((f) => !f.rule || LAW.rules.some((x) => x.id === f.rule && applies(x, p)) || f.type === "stale-citation");
  for (const f of relevantFlags) {
    const n = flagStep(f);
    const g = "City vs. state (details in the Old-law checker)";
    const head = f.title || f.text;
    for (const sd of f.sides || []) {
      if (sd.rule) { const r = ruleById(sd.rule); src(n, { group: g, label: `${head} — state: ${r.cite}`, url: lawUrl(r.section), linkText: "Read the law on leginfo" }); }
      else if (sd.renumbering) src(n, { group: g, label: `${head} — state: SB 477 (2024) renumbering, HCD ADU Handbook pp. 13–14`, url: LAW.primary_source.url, checked: LAW.renumbering.checked });
      else if (sd.section) src(n, { group: g, label: `${head} — state: ${sd.cite}`, url: sd.url, checked: "2026-11-07" });
      else if (sd.url) src(n, { group: g, label: `${head} — ${sd.who}: ${sd.cite}`, url: sd.url, checked: sd.checked, status: sd.status });
    }
    if (f.source) src(n, { group: g, label: `${head} — more context`, url: f.source });
    if (!(f.sides || []).length && !f.source) src(n, { group: g, label: head });
  }
  return { TODO, BODY, TILES, RIGHTS, SRC, DUR, relevantFlags };
}

// ---------- City vs. state (shown in the Old-law checker) ----------
const FLAG_KINDS = { "state-law": ["bad", "City vs. state law"], "stale-citation": ["bad", "Cites old (renumbered) law"], stale: ["warn", "May be out of date"], conflict: ["warn", "City sources disagree"], missing: ["warn", "Missing information"], history: ["info", "History"], note: ["info", "Worth knowing"] };
function flagBox(f) {
  const [cls, kind] = FLAG_KINDS[f.type] || ["info", "Note"];
  const sides = f.sides || [];
  return `<details class="alert-bar ${cls}">
    <summary>${cls === "info" ? ICON_INFO : ICON_WARN}<span class="ab-head">${esc(f.title || f.text)}</span><span class="ab-kind">${esc(kind)}</span></summary>
    <div class="ab-body"><p>${telify(esc(f.text))}</p>
      ${sides.length ? `<div class="sides">${sides.map(sideBox).join("")}</div>` : ""}
      ${f.source ? `<p class="source"><a href="${esc(f.source)}" target="_blank" rel="noopener">More context</a></p>` : ""}
    </div></details>`;
}
function renderCityVsState(city, flags) {
  $("#city-vs-state").innerHTML = `<h3 class="sec-title" style="margin-top:1.5rem">City vs. state for ${esc(city.name)} (${flags.length})</h3>
    <p class="hint">State law sets the maximum a city can require. Where ${esc(city.name)}'s materials look out of step, we show the city's version and the state's version side by side. We don't decide who is right.</p>
    ${flags.map(flagBox).join("") || `<div class="soft-note">${ICON_INFO}<div><p>We did not find a mismatch in the ${esc(city.name)} materials we read. That is not the same as compliant: we only read what is linked.</p></div></div>`}`;
}

// ---------- sources box ----------
let LASTSRC = null;
function renderSources(n) {
  const list = [];
  const seen = new Set();
  for (const s of LASTSRC[n]) { const k = `${s.label}|${s.url || ""}`; if (!seen.has(k)) { seen.add(k); list.push(s); } }
  const groups = [...new Set(list.map((s) => s.group))];
  const item = (s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}${s.url && s.linkText ? ` <span class="src-meta">(${esc(s.linkText)})</span>` : ""}${s.checked ? ` <span class="src-meta">· checked ${esc(s.checked)}</span>` : ""}${ntag(s.status)}</li>`;
  $("#src-title").textContent = `Sources for Step ${n}: ${PATH_STEPS[n - 1].name}`;
  $("#src-body").innerHTML = groups.map((g) => `<h3>${esc(g)}</h3><ul class="src-list">${list.filter((s) => s.group === g).map(item).join("")}</ul>`).join("");
}

// ---------- step state (page memory only: no accounts, no server) ----------
const DONE = new Set();
let VIEW = null; // 1..7, "stale" or "ask"
let QA = false;
let LAST = null;
const SIDEBAR_KEY = "adu-sidebar-collapsed";
function firstUnfinished() { return (PATH_STEPS.find((s) => !DONE.has(s.n)) || {}).n || 1; }

function renderSidebar(DUR) {
  $("#ps-list").innerHTML = PATH_STEPS.map((s) => {
    const done = DONE.has(s.n), active = VIEW === s.n;
    return `<li class="ps${done ? " done" : ""}${active ? " active" : ""}">
      <button type="button" class="ps-btn" data-step="${s.n}"${active ? ' aria-current="step"' : ""} aria-label="Step ${s.n}: ${esc(s.name)}${done ? " (done)" : ""}">
        <span class="ps-num" aria-hidden="true">${done ? "✓" : s.n}</span>
        <span class="ps-text"><span class="ps-name">${esc(s.name)}</span>${DUR[s.n] ? `<span class="ps-dur">${esc(DUR[s.n])}</span>` : ""}</span>
      </button>
      <label class="ps-done"><input type="checkbox" data-done="${s.n}"${done ? " checked" : ""} aria-label="Mark step ${s.n}, ${esc(s.name)}, done"> <span aria-hidden="true">Done</span></label>
    </li>`;
  }).join("");
  $("#pn-foot").innerHTML = QA ? `<button type="button" class="pn-link" data-view="ask">Ask a question</button>` : "";
}

function setCollapsed(c) {
  $("#output").classList.toggle("nav-collapsed", c);
  const t = $("#pn-toggle");
  t.setAttribute("aria-expanded", String(!c));
  t.setAttribute("aria-label", c ? "Open the steps panel" : "Close the steps panel");
  t.innerHTML = `<span aria-hidden="true">${c ? "»" : "«"}</span>`;
  try { localStorage.setItem(SIDEBAR_KEY, c ? "1" : "0"); } catch {}
}

function showView(view, focus) {
  VIEW = view;
  $$(".path-content .tab-panel").forEach((pnl) => {
    const id = typeof view === "number" ? `step-${view}` : `view-${view}`;
    pnl.hidden = pnl.id !== id;
  });
  if (LAST) renderSidebar(LAST.DUR);
  if (focus) { const h = $(`#${typeof view === "number" ? `step-${view}` : `view-${view}`} h2`); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } $("#output").scrollIntoView({ block: "start" }); }
}

function renderPath(city, p) {
  const B = buildPath(city, p);
  LASTSRC = B.SRC;
  for (const s of PATH_STEPS) {
    const n = s.n;
    const prev = PATH_STEPS[n - 2], next = PATH_STEPS[n];
    $(`#step-${n}`).innerHTML = `
      <div class="step-head">
        <div class="step-title">
          <p class="step-kicker">Step ${n} of 7</p>
          <h2>${esc(s.name)}</h2>
          ${B.DUR[n] ? `<span class="dur-chip static">${ICON_CLOCK}<span>${esc(B.DUR[n])}</span></span>` : ""}
        </div>
        <button type="button" class="btn ghost src-btn" data-sources="${n}" aria-haspopup="dialog">Sources</button>
      </div>
      ${B.TILES[n].length ? `<div class="tiles">${B.TILES[n].join("")}</div>` : ""}
      <section class="step-sec todo"><h3 class="sec-title">What to do</h3><ul class="todo-list">${B.TODO[n].join("")}</ul></section>
      ${B.BODY[n].join("")}
      ${B.RIGHTS[n].length ? `<section class="step-sec rights"><h3 class="sec-title">Your rights for this step (${B.RIGHTS[n].length})</h3>${B.RIGHTS[n].join("")}</section>` : ""}
      <nav class="step-nav" aria-label="Step navigation">
        ${prev ? `<button type="button" class="btn ghost" data-goto="${prev.n}">← Back: ${esc(prev.name)}</button>` : "<span></span>"}
        ${next ? `<button type="button" class="btn" data-goto="${next.n}">Next: ${esc(next.name)} →</button>` : ""}
      </nav>`;
  }
  const pb = $("#print-btn"); if (pb) pb.onclick = () => printTab(2);
  renderCityVsState(city, B.relevantFlags);
  LAST = { DUR: B.DUR };
  renderSidebar(B.DUR);
}

function printTab(n) {
  const panel = $(`#step-${n}`);
  panel.classList.add("printing");
  window.print();
  panel.classList.remove("printing");
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

// ---------- summary bar, row 2 ----------
function renderCityCard(city) {
  const phone = city.contact ? (city.contact.text.match(PHONE_RE) || [])[0] : null;
  $("#city-card").hidden = false;
  $("#city-card").innerHTML = `
    <div class="cc-item"><span class="cc-label">Questions?</span> ${phone
      ? `<a class="cc-link" href="${telHref(phone)}">${ICON_PHONE}Call Planning: ${esc(phone)}</a>`
      : `<a class="cc-link" href="${esc(city.adu_page.url)}" target="_blank" rel="noopener">Find contact info <span aria-hidden="true">↗</span></a>`}</div>
    <div class="cc-item"><span class="cc-label">City info</span> <a class="cc-link" href="${esc(city.adu_page.url)}" target="_blank" rel="noopener">City's ADU page <span aria-hidden="true">↗</span></a></div>`;
}

// ---------- wiring ----------
function render() {
  const p = readForm();
  const city = CITIES.find((c) => c.name === p.city);
  if (!city) { $("#empty").hidden = false; $("#output").hidden = true; $("#city-card").hidden = true; return; }
  $("#empty").hidden = true; $("#output").hidden = false;
  renderCityCard(city);
  renderPath(city, p);
  if (VIEW == null) VIEW = firstUnfinished();
  showView(VIEW);
}

async function init() {
  [LAW, { cities: CITIES }, STATS] = await Promise.all(["state-law.json", "cities.json", "city-stats.json"].map((f) => fetch(`/data/${f}`).then((r) => r.json())));
  CITIES.sort((a, b) => a.name.localeCompare(b.name));
  const qs = new URLSearchParams(location.search);
  ProjectForm.mount($("#project-panel"), CITIES.map((c) => c.name), { city: qs.get("city") ?? undefined, type: qs.get("type") || undefined });
  ProjectForm.onChange(() => render());
  let collapsed = false; try { collapsed = localStorage.getItem(SIDEBAR_KEY) === "1"; } catch {}
  setCollapsed(collapsed);

  document.addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".ps-btn");
    if (stepBtn) return showView(Number(stepBtn.dataset.step), true);
    const viewBtn = e.target.closest("[data-view]");
    if (viewBtn) return showView(viewBtn.dataset.view, true);
    if (e.target.closest("[data-back-to-steps]")) return showView(firstUnfinished(), true);
    const go = e.target.closest("[data-goto]");
    if (go) return showView(Number(go.dataset.goto), true);
    if (e.target.closest("#pn-toggle")) return setCollapsed(!$("#output").classList.contains("nav-collapsed"));
    const sb = e.target.closest("[data-sources]");
    if (sb) { renderSources(Number(sb.dataset.sources)); $("#src-dialog").returnTo = sb; $("#src-dialog").showModal(); return; }
    const more = e.target.closest(".more-btn");
    if (more) {
      const box = more.previousElementSibling; const open = box.hidden;
      box.hidden = !open; more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? "Show fewer steps" : `Show all ${more.closest("section").querySelectorAll(".city-steps li").length} steps`;
    }
  });
  document.addEventListener("change", (e) => {
    const box = e.target.closest("input[data-done]");
    if (!box) return;
    const n = Number(box.dataset.done);
    if (box.checked) DONE.add(n); else DONE.delete(n);
    if (LAST) renderSidebar(LAST.DUR);
    const again = $(`#ps-list input[data-done="${n}"]`); if (again) again.focus();
  });
  // Rights rows: one open at a time per step.
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("right-row") || !d.open) return;
    d.closest(".rights").querySelectorAll("details.right-row[open]").forEach((o) => { if (o !== d) o.open = false; });
  }, true);
  // Sources dialog: Esc (native), Close button, or click outside.
  const dlg = $("#src-dialog");
  $("#src-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { if (dlg.returnTo) dlg.returnTo.focus(); });

  $("#stale-run").onclick = runStale;
  $("#stale-sample").onclick = () => { $("#stale-input").value = "A JADU covenant shall be recorded per Government Code Section 65852.22. ADUs shall comply with Gov. Code 65852.2 and fees per Section 66324."; runStale(); };
  $("#ask-form").addEventListener("submit", ask);

  try { QA = (await fetch("/api/status").then((r) => r.json())).qa === true; } catch { QA = false; }
  const start = qs.get("view") === "stale" ? "stale" : qs.get("step") && /^[1-7]$/.test(qs.get("step")) ? Number(qs.get("step")) : null;
  VIEW = start;
  render();
}

init();
