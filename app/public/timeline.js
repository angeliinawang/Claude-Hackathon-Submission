// Calendar & deadlines. Plain JS, no build step.
// - Your paperwork goals (dates you set; spread in the city's listed order).
// - The city's legal reply deadlines (state law, cited), with countdowns.
// - "Is the city late?": legal deadline vs. days actually elapsed, and the rent that delay costs.
// Nothing is sent anywhere. Dates live only in this browser (localStorage "adu-calendar").
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY = "adu-calendar";
  const HB_URL = "https://www.hcd.ca.gov/sites/default/files/docs/policy-and-research/adu-handbook-update.pdf";
  const leginfo = (sec) => `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=${sec}`;

  let CFG, CITIES, STATS;
  let VIEW = "2", ANCHOR = null;

  // ---------- dates (local calendar days, noon to avoid DST edges) ----------
  const D = (s) => (s ? new Date(`${s}T12:00:00`) : null);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  // ASSUMPTION: business days skip weekends only (holidays not excluded).
  function addBusinessDays(d, n) { const dir = n < 0 ? -1 : 1; let x = new Date(d), left = Math.abs(n); while (left > 0) { x = addDays(x, dir); if (!isWeekend(x)) left--; } return x; }
  function businessDaysBetween(a, b) { // weekdays after a, up to and including b (negative if b < a)
    if (iso(a) === iso(b)) return 0;
    const sign = b > a ? 1 : -1; let x = new Date(a), n = 0;
    while (iso(x) !== iso(b)) { x = addDays(x, sign); if (!isWeekend(x)) n += sign; }
    return n;
  }
  const daysBetween = (a, b) => Math.round((D(iso(b)) - D(iso(a))) / 864e5);
  const fmt = (d, opt = { month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", opt);
  const fmtLong = (d) => fmt(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const plural = (n, w) => `${n} ${w}${Math.abs(n) === 1 ? "" : "s"}`;

  // ---------- state ----------
  function defaults() {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    return { start: iso(today), target: iso(addDays(today, 28)), submitted: "", complete: "", responded: false, decided: false, rent: "", today: iso(today) };
  }
  function load() { try { return { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY) || "null") || {}) }; } catch { return defaults(); } }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }
  function readInputs() {
    return {
      start: $("#d-start").value, target: $("#d-target").value, submitted: $("#d-submitted").value, complete: $("#d-complete").value,
      responded: $("#d-responded").checked, decided: $("#d-decided").checked, rent: $("#d-rent").value, today: $("#d-today").value || defaults().today,
    };
  }
  function writeInputs(st) {
    $("#d-start").value = st.start; $("#d-target").value = st.target; $("#d-submitted").value = st.submitted; $("#d-complete").value = st.complete;
    $("#d-responded").checked = !!st.responded; $("#d-decided").checked = !!st.decided; $("#d-rent").value = st.rent; $("#d-today").value = st.today;
  }

  // ---------- project → legal clock ----------
  function pathFor(project) {
    if (!project.existing) return "ADU_NEW_HOME";
    if (project.type === "jadu") return "JADU";
    if (ProjectForm.usesPreapprovedDetached(project)) return "ADU_PRE";
    return "ADU";
  }

  // City-published lead times, e.g. "Up to four days", "Within two to three business days".
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  function parseLead(value) {
    const nums = [...String(value).toLowerCase().matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/g)].map((m) => WORDS[m[1]] ?? Number(m[1]));
    if (!nums.length) return null;
    return { n: Math.max(...nums), business: /business/i.test(value) };
  }

  function documentsFor(city, p) {
    if (!city) return [];
    const isJadu = p.type === "jadu";
    const docs = city.documents.filter((d) => (!d.jadu_only || isJadu) && (!d.coastal_only || p.coastal !== "no")).map((d) => ({ name: d.name, src: city.documents_source }));
    if (isJadu && !city.documents.some((d) => d.jadu_only)) docs.push({ name: "JADU deed restriction (recorded)", cite: "Gov. Code § 66333(c)" });
    if (p.coastal !== "no" && !city.documents.some((d) => d.coastal_only)) docs.push({ name: "Coastal Development Permit application (if your parcel is in the Coastal Zone)", cite: "Gov. Code § 66329" });
    if (p.type === "garage_replace") docs.push({ name: "Demolition permit for the detached garage", cite: "Gov. Code § 66314(e)" });
    return docs;
  }

  // ---------- build the model ----------
  function build() {
    const st = readInputs();
    const project = ProjectForm.read();
    const city = CITIES.find((c) => c.name === project.city) || null;
    const path = CFG.paths.find((x) => x.id === pathFor(project));
    const today = D(st.today);
    const start = D(st.start) || today;
    const submitted = D(st.submitted);
    const target = submitted || D(st.target) || addDays(today, 28);
    const completeBase = D(st.complete) || submitted || target;
    const projected = !submitted;
    const ev = [];
    const push = (e) => ev.push(e);

    // Goals (your dates). ASSUMPTION: spread evenly in the city's listed order between start and target.
    push({ date: start, kind: "goal", short: "Confirm eligibility", title: "Confirm eligibility with the city", detail: "Ask the planning division which local objective standards apply to your lot.", cite: city ? `${city.name} ADU page` : "", url: city?.adu_page?.url });
    const docs = documentsFor(city, project);
    const span = Math.max(1, daysBetween(start, target) - 1);
    const docDates = docs.map((d, i) => addDays(start, Math.max(1, Math.round(((i + 1) * span) / (docs.length + 1)))));
    docs.forEach((d, i) => {
      push({ date: docDates[i], kind: "goal", title: `Ready: ${d.name}`, detail: `Paperwork item ${i + 1} of ${docs.length}, in the order ${city ? city.name : "the city"} lists it.`, cite: d.cite || (d.src ? `${city.name} submittal list` : ""), url: d.src?.url });
    });
    // City-published lead times (e.g. Anaheim sewer verification "up to four days"): request that many
    // days before the matching paperwork goal, or before the target if no item matches.
    if (city) for (const t of city.published_timelines.filter((t) => /sewer|meter|verification/i.test(t.step))) {
      const lead = parseLead(t.value);
      if (!lead) continue;
      const word = (t.step.match(/sewer|meter/i) || [])[0];
      const i = word ? docs.findIndex((d) => new RegExp(word, "i").test(d.name)) : -1;
      const due = i >= 0 ? docDates[i] : target;
      const date = lead.business ? addBusinessDays(due, -lead.n) : addDays(due, -lead.n);
      push({ date, kind: "goal", title: `Request: ${t.step}`, detail: `${city.name} says: ${t.value}. Request it by this date so it is back ${i >= 0 ? `for "${docs[i].name}" (${fmt(due)})` : "before you submit"}.`, cite: `${city.name} (checked ${t.checked})`, url: t.source });
    }
    push({ date: target, kind: "you", short: submitted ? "Submitted" : "Submit", title: submitted ? "You submitted your application" : "Target: submit your application", detail: submitted ? "Every legal clock below counts from your dates." : "Your target date. Deadlines after it are projected.", cite: "" });

    // City's legal deadlines.
    const comp = path.completeness;
    const compDue = addBusinessDays(target, comp.days);
    const compLate = !projected && !st.responded && today > compDue;
    push({ date: compDue, kind: compLate ? "late" : "city", projected, business: true, short: compLate ? "Completeness missed" : "Completeness reply due",
      title: compLate ? "Missed: completeness reply. Your application is deemed complete" : `City must say whether it's complete (${comp.days} business days)`,
      detail: compLate ? `The city had until ${fmtLong(compDue)} to tell you in writing whether your application was complete. When it misses that deadline, the application is deemed complete.` : "The city must tell you in writing whether your application is complete, listing anything missing.",
      cite: compLate ? "Gov. Code § 66317(a)(2)(F); HCD ADU Handbook p. 35" : `${comp.cite}; ${comp.source}`, url: comp.url });

    const dec = path.decision;
    let decDue = null, deemedDate = null;
    if (dec.days != null) {
      decDue = addDays(completeBase, dec.days);
      const late = !projected && !st.decided && today > decDue;
      push({ date: decDue, kind: late ? "late" : "city", projected, short: late ? "Decision missed" : "Decision due",
        title: late ? `Missed: ${dec.days}-day approve-or-deny deadline` : `City must approve or deny (${dec.days} days)`,
        detail: `${dec.days} days after your application became complete (${fmtLong(completeBase)}).`, cite: `${dec.cite}; ${dec.source}`, url: dec.url });
    }
    if (path.deemed_approved) {
      deemedDate = addDays(completeBase, path.deemed_approved.days);
      if (!decDue || iso(deemedDate) !== iso(decDue)) {
        const late = !projected && !st.decided && today > deemedDate;
        push({ date: deemedDate, kind: late ? "late" : "city", projected, short: "Deemed approved", title: late ? "Deemed approved: no decision within 60 days" : "Deemed approved if no decision by this date",
          detail: "An ADU or JADU application is deemed approved if the city has not approved or denied the completed application within 60 days.", cite: `${path.deemed_approved.cite}; ${path.deemed_approved.source}`, url: path.deemed_approved.url });
      }
    }
    if (project.coastal !== "no") push({ date: addDays(completeBase, 60), kind: "city", projected, short: "Coastal permit due", title: "Coastal Development Permit decision deadline (if needed)", detail: "If your parcel is in the Coastal Zone, the coastal permit must be approved or denied within 60 days of a complete application.", cite: "Gov. Code § 66329; HCD ADU Handbook p. 14", url: leginfo("66329") });

    const bt = city ? STATS.cities[city.name]?.permit_to_co : null;
    if (bt && decDue) push({ date: addDays(decDue, bt.median_days), kind: "typical", projected: true, short: "Typical move-in", title: `Typical move-in: Certificate of Occupancy (median ${bt.median_days} days)`, detail: `Historical median from building permit to Certificate of Occupancy in ${city.name} (middle half ${bt.p25_days}–${bt.p75_days} days). Not a deadline.`, cite: "BackyardADU.net build_times.csv, from HCD APR Table A2", url: STATS.sources.official });

    ev.sort((a, b) => a.date - b.date || ["goal", "you", "city", "late", "typical"].indexOf(a.kind) - ["goal", "you", "city", "late", "typical"].indexOf(b.kind));
    return { st, project, city, path, today, start, target, submitted, completeBase, projected, compDue, compLate, decDue, deemedDate, events: ev };
  }

  // ---------- countdown text ----------
  function countdown(e, today) {
    const d = daysBetween(today, e.date);
    let s = d === 0 ? "today" : d > 0 ? `in ${plural(d, "day")}` : `${plural(-d, "day")} ago`;
    if (e.business && d > 0) s += ` (${plural(businessDaysBetween(today, e.date), "business day")})`;
    return s;
  }
  const urgency = (days) => (days < 0 ? "late" : days <= 7 ? "soon" : "ok");

  // ---------- countdown cards ----------
  function renderCountdowns(m) {
    const { today, projected, st } = m;
    const card = (cls, k, v, s) => `<div class="cd ${cls}"><div class="cd-k">${k}</div><div class="cd-v">${v}</div><div class="cd-s">${s}</div></div>`;
    const cards = [];

    // 1. Completeness reply (business days)
    if (projected) cards.push(card("muted", "City's completeness reply", `${m.path.completeness.days} business days`, `Starts when you submit · projected due ${fmt(m.compDue)}`));
    else if (st.responded) cards.push(card("ok", "City's completeness reply", "Received", "You told us the city replied in writing."));
    else if (m.compLate) cards.push(card("late", "City's completeness reply", `${plural(businessDaysBetween(m.compDue, today), "business day")} late`, `Due ${fmt(m.compDue)}. Missed: your application is deemed complete (Gov. Code § 66317(a)(2)(F)).`));
    else { const bd = businessDaysBetween(today, m.compDue); cards.push(card(bd <= 5 ? "soon" : "ok", "City's completeness reply", `${plural(bd, "business day")} left`, `Due ${fmtLong(m.compDue)} · ${m.path.completeness.cite}`)); }

    // 2. Approve / deny
    if (!m.decDue) cards.push(card("muted", "Approve or deny", "Unknown", esc(m.path.decision.source)));
    else if (projected) cards.push(card("muted", "Approve or deny", `${m.path.decision.days} days`, `After your application is complete · projected due ${fmt(m.decDue)}`));
    else if (st.decided) cards.push(card("ok", "Approve or deny", "Decided", "You told us the city has approved or denied."));
    else { const d = daysBetween(today, m.decDue); cards.push(card(urgency(d), "Approve or deny", d >= 0 ? `${plural(d, "day")} left` : `${plural(-d, "day")} overdue`, `Due ${fmtLong(m.decDue)} · ${esc(m.path.decision.cite)}`)); }

    // 3. Next goal
    const next = m.events.find((e) => (e.kind === "goal" || (e.kind === "you" && projected)) && daysBetween(today, e.date) >= 0);
    const missedGoals = projected ? m.events.filter((e) => e.kind === "goal" && daysBetween(today, e.date) < 0).length : 0;
    if (next) { const d = daysBetween(today, next.date); cards.push(card(urgency(d), "Next goal", d === 0 ? "Today" : `in ${plural(d, "day")}`, `${esc(next.title)} · ${fmt(next.date)}${missedGoals ? ` · ${plural(missedGoals, "earlier goal")} past its date` : ""}`)); }
    else cards.push(card("muted", "Next goal", projected ? "None left" : "Submitted", projected ? "Set a later target date to plan more." : `You submitted on ${fmt(m.submitted)}.`));

    $("#countdowns").innerHTML = cards.join("");
  }

  // ---------- Is the city late? ----------
  function renderShotClock(m) {
    const el = $("#shot-clock");
    const { path, st, today } = m;
    const head = `<h2>Is the city late on my application?</h2>`;
    if (!path.decision.days) { el.innerHTML = `${head}<p>No separate approve-or-deny clock applies when the ADU is built together with a new house: <span class="chip unknown">Unknown</span> ${esc(path.decision.source)}</p>`; return; }
    if (m.projected) { el.innerHTML = `${head}<p class="hint">Once you enter the date you submitted, this compares the city's legal deadline (${path.decision.days} days after your application is complete) with the days that have actually passed, and shows what any delay costs you.</p>`; return; }
    if (st.decided) { el.innerHTML = `${head}<div class="callout ok"><strong>Decided</strong>You told us the city has approved or denied your application, so no clock is running.</div>`; return; }

    const legal = path.decision.days;
    const elapsed = Math.max(0, daysBetween(m.completeBase, today));
    const overdue = Math.max(0, elapsed - legal);
    const scale = Math.max(elapsed, legal, 1);
    const pct = (n) => `${(100 * n) / scale}%`;
    const deemedDays = path.deemed_approved?.days;
    const deemedReached = deemedDays != null && elapsed > deemedDays;
    const rent = Number(st.rent) || 0;
    const overdueMonths = overdue / CFG.day_conversions.calendar_days_per_month;

    const bars = `<div class="sc-bars" role="img" aria-label="Legal deadline ${legal} days; ${elapsed} days so far; ${overdue} days overdue">
      <div class="sc-row"><div class="sc-label">Legal deadline (${legal} days)</div><div class="sc-track"><div class="sc-bar legal" style="width:${pct(legal)}"></div></div><div class="sc-end">${fmt(m.decDue)}</div></div>
      <div class="sc-row"><div class="sc-label">What's actually happened</div><div class="sc-track"><div class="sc-bar elapsed" style="width:${pct(Math.min(elapsed, legal))}"></div>${overdue ? `<div class="sc-bar over" style="left:${pct(legal)};width:${pct(overdue)}"></div><div class="sc-mark" style="left:${pct(legal)}"><span>${plural(overdue, "day")} overdue</span></div>` : ""}</div><div class="sc-end">${plural(elapsed, "day")} so far</div></div>
    </div>`;

    let verdict;
    if (!overdue) verdict = `<div class="callout ok"><strong>On time so far</strong>${plural(legal - elapsed, "day")} left before the ${legal}-day deadline (${esc(path.decision.cite)}).</div>`;
    else verdict = `<div class="callout bad sc-alert"><strong>The city missed its ${legal}-day deadline (${esc(path.decision.cite)}).</strong>
      ${deemedReached ? `By law, an ADU or JADU application is deemed approved if the city has not approved or denied the completed application within 60 days (${esc(path.deemed_approved.cite)}; <a href="${esc(path.deemed_approved.url)}" target="_blank" rel="noopener">${esc(path.deemed_approved.source)}</a>). Your application may already be deemed approved.`
        : deemedDays ? `Deemed approval applies at ${deemedDays} days (${esc(path.deemed_approved.cite)}): ${fmtLong(m.deemedDate)}, in ${plural(daysBetween(today, m.deemedDate), "day")}.` : ""}
      <span class="hint">This assumes your application was complete on ${fmtLong(m.completeBase)}. Check with a land-use professional before relying on it.</span>
      <div class="row"><button type="button" class="btn" id="draft-btn">${deemedReached ? "Draft a polite “deemed approved” confirmation email" : "Draft a polite status-request email"}</button></div>
      <div id="draft" hidden></div></div>`;

    const cost = !overdue ? "" : rent
      ? `<div class="sc-cost"><div class="cd-k">Rent you could have been collecting <span class="chip assumption">ASSUMPTION</span></div><div class="cd-v">≈ ${money(rent * overdueMonths)}</div><div class="cd-s">${money(rent)}/mo (your estimate) × ${overdueMonths.toFixed(2)} months overdue (${plural(overdue, "day")} ÷ ${CFG.day_conversions.calendar_days_per_month})</div></div>`
      : `<div class="sc-cost"><div class="cd-k">Rent you could have been collecting</div><div class="cd-s">Enter your expected monthly rent under "Your dates" to see what this delay costs you.</div></div>`;

    el.innerHTML = head + bars + verdict + cost;
    const btn = $("#draft-btn");
    if (btn) btn.onclick = () => showDraft(m, deemedReached, legal, overdue);
  }

  function showDraft(m, deemed, legal, overdue) {
    const city = m.city ? m.city.name : "[City]";
    const text = deemed
      ? `Subject: ADU application [application number]: request to confirm deemed approval\n\nDear ${city} Planning Division,\n\nI submitted a complete application to create an accessory dwelling unit at [property address] (application [number]). It became complete on ${fmtLong(m.completeBase)}.\n\nUnder Government Code section 66317(a), an application to create an ADU or JADU is deemed approved if the permitting agency has not approved or denied the completed application within 60 days. As of ${fmtLong(m.today)}, ${plural(daysBetween(m.completeBase, m.today), "day")} have passed and I have not received a decision.\n\nCould you please confirm in writing that the application is deemed approved, and let me know the next steps to receive my permit? If you believe the application was not complete or the time was extended, please tell me which items and dates you are relying on.\n\nThank you for your help.\n\n[Your name]\n[Phone or email]`
      : `Subject: ADU application [application number]: status request\n\nDear ${city} Planning Division,\n\nI submitted a complete application to create an accessory dwelling unit at [property address] (application [number]). It became complete on ${fmtLong(m.completeBase)}.\n\nGovernment Code section ${m.path.id === "ADU_PRE" ? "65852.27 sets a 30-day deadline" : `66317(a) sets a ${legal}-day deadline`} to approve or deny. That deadline was ${fmtLong(m.decDue)}, ${plural(overdue, "day")} ago. Could you please tell me the status of my application and when I can expect a decision?\n\nThank you for your help.\n\n[Your name]\n[Phone or email]`;
    const box = $("#draft");
    box.hidden = false;
    box.innerHTML = `<p class="hint">Draft only: this page never sends anything. Fill in the [brackets], check every date, and send it yourself if it fits your situation.</p><textarea id="draft-text" rows="14">${esc(text)}</textarea><div class="row"><button type="button" class="btn ghost" id="draft-copy">Copy text</button><span class="hint" id="draft-status"></span></div>`;
    $("#draft-copy").onclick = async () => {
      try { await navigator.clipboard.writeText($("#draft-text").value); $("#draft-status").textContent = "Copied."; }
      catch { $("#draft-text").select(); $("#draft-status").textContent = "Select the text and copy it."; }
    };
  }

  // ---------- calendar ----------
  const MONTHS = (d) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  function byDay(events) { const m = new Map(); for (const e of events) { const k = iso(e.date); if (!m.has(k)) m.set(k, []); m.get(k).push(e); } return m; }
  const chip = (e, i, compact) => `<button type="button" class="ev ev-${e.kind}${e.projected ? " projected" : ""}" data-ev="${i}" title="${esc(`${fmtLong(e.date)} — ${e.title}${e.projected ? " (projected)" : ""}${e.cite ? ` · ${e.cite}` : ""}`)}">${compact ? "" : esc(e.short || e.title)}</button>`;

  function monthGrid(year, month, map, events, today, compact) {
    const first = new Date(year, month, 1, 12);
    const startCell = addDays(first, -first.getDay());
    const last = new Date(year, month + 1, 0, 12);
    const endCell = addDays(last, 6 - last.getDay());
    let cells = "";
    for (let d = new Date(startCell); d <= endCell; d = addDays(d, 1)) {
      const out = d.getMonth() !== month;
      const k = iso(d), list = out ? [] : map.get(k) || []; // events show only in their own month
      const max = compact ? 4 : 3;
      cells += `<div class="day${out ? " out" : ""}${k === iso(today) ? " today" : ""}${isWeekend(d) ? " wknd" : ""}">
        <span class="dn">${d.getDate()}</span>
        <div class="evs">${list.slice(0, max).map((e) => chip(e, events.indexOf(e), compact)).join("")}${list.length > max ? `<span class="more">+${list.length - max}</span>` : ""}</div></div>`;
    }
    return `<div class="month"><h3>${MONTHS(first)}</h3><div class="dow">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => `<span>${w}</span>`).join("")}</div><div class="grid">${cells}</div></div>`;
  }

  function renderCalendar(m) {
    const map = byDay(m.events);
    const a = ANCHOR || m.today;
    let html = "", title = "";
    if (VIEW === "week") {
      const start = addDays(a, -a.getDay());
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      title = `Week of ${fmt(start, { month: "long", day: "numeric", year: "numeric" })}`;
      html = `<div class="week">${days.map((d) => { const list = map.get(iso(d)) || []; return `<div class="wday${iso(d) === iso(m.today) ? " today" : ""}${isWeekend(d) ? " wknd" : ""}"><div class="wd-head"><span>${fmt(d, { weekday: "short" })}</span><b>${d.getDate()}</b></div>${list.map((e) => chip(e, m.events.indexOf(e), false)).join("") || `<span class="hint">—</span>`}</div>`; }).join("")}</div>`;
    } else {
      const n = Number(VIEW);
      const months = Array.from({ length: n }, (_, i) => new Date(a.getFullYear(), a.getMonth() + i, 1, 12));
      title = n === 1 ? MONTHS(months[0]) : `${MONTHS(months[0])} – ${MONTHS(months[n - 1])}`;
      html = `<div class="months m${n}">${months.map((mm) => monthGrid(mm.getFullYear(), mm.getMonth(), map, m.events, m.today, n === 3)).join("")}</div>`;
    }
    $("#cal-title").textContent = title;
    $("#cal").innerHTML = html;
    $$(".cal-views button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === VIEW)));
  }

  // ---------- agenda ----------
  function renderAgenda(m) {
    $("#agenda").innerHTML = m.events.map((e, i) => {
      const d = daysBetween(m.today, e.date);
      const when = countdown(e, m.today);
      const cls = e.kind === "late" ? "late" : e.kind === "typical" ? "typical" : d < 0 ? "past" : d <= 7 ? "soon" : "";
      return `<li id="ag-${i}" class="ag ag-${e.kind} ${cls}">
        <div class="ag-date"><b>${fmt(e.date)}</b><span>${fmt(e.date, { weekday: "short" })}${e.date.getFullYear() !== m.today.getFullYear() ? ` ${e.date.getFullYear()}` : ""}</span></div>
        <div class="ag-main"><div class="ag-title"><span class="ev-dot ${e.kind}"></span>${esc(e.title)}${e.projected && e.kind !== "typical" ? ` <span class="chip unknown">projected</span>` : ""}</div>
          <div class="ag-when">${esc(when)}</div>
          ${e.detail ? `<p>${esc(e.detail)}</p>` : ""}
          ${e.cite ? `<p class="source">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.cite)}</a>` : esc(e.cite)}</p>` : ""}</div></li>`;
    }).join("");
  }

  // ---------- sources ----------
  function renderCites(m) {
    const p = m.path;
    const li = (b, t) => `<li><b>${b}</b> ${t}</li>`;
    $("#cites").innerHTML = [
      li("Completeness reply:", `${p.completeness.days} business days — ${esc(p.completeness.cite)}; <a href="${esc(p.completeness.url)}" target="_blank" rel="noopener">${esc(p.completeness.source)}</a>. Missed deadline = deemed complete: Gov. Code § 66317(a)(2)(F), Handbook p. 35.`),
      li("Approve or deny:", p.decision.days != null ? `${p.decision.days} days — ${esc(p.decision.cite)}; <a href="${esc(p.decision.url)}" target="_blank" rel="noopener">${esc(p.decision.source)}</a>.` : `<span class="chip unknown">Unknown</span> ${esc(p.decision.source)}`),
      p.deemed_approved ? li("Deemed approved:", `after ${p.deemed_approved.days} days without a decision — ${esc(p.deemed_approved.cite)}; <a href="${esc(p.deemed_approved.url)}" target="_blank" rel="noopener">${esc(p.deemed_approved.source)}</a>.`) : "",
      m.project.coastal !== "no" ? li("Coastal Development Permit:", `60 days — Gov. Code § 66329; HCD ADU Handbook p. 14.`) : "",
      li("Business days <span class=\"chip assumption\">ASSUMPTION</span>:", esc(CFG.business_days_note)),
      li("Your goal dates <span class=\"chip assumption\">ASSUMPTION</span>:", "Your start and target dates; paperwork items are spread evenly between them in the order the city lists them. Items with a city-published lead time (for example a verification that takes \"up to four days\") are placed that many days before your target. The default target is 4 weeks from today."),
      li("Typical move-in:", "historical median days from building permit to Certificate of Occupancy, BackyardADU.net build_times.csv (third party, from HCD APR Table A2). Not a deadline."),
      li("Rent <span class=\"chip assumption\">ASSUMPTION</span>:", "your own monthly rent estimate × months overdue (days ÷ 30.44)."),
      li("Legal clocks are maximums", "counted from a complete application. They do not include corrections, utility sign-offs or construction."),
    ].join("");
  }

  function pathNote(m) {
    const what = ProjectForm.TYPE_LABEL[m.project.type] || "ADU";
    $("#path-note").innerHTML = `<strong>Deadlines for your project: ${esc(what)}${m.city ? ` in ${esc(m.city.name)}` : ""}</strong>Clock used: <b>${esc(m.path.label)}</b>. ${m.projected ? `You haven't entered a submission date, so the city's deadlines are <b>projected</b> from your target date (${fmtLong(m.target)}).` : `Counting from your submission on ${fmtLong(m.submitted)}.`}`;
  }

  // ---------- .ics export ----------
  function downloadIcs(m) {
    const d8 = (d) => iso(d).replace(/-/g, "");
    const escI = (s) => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ADU Pathfinder prototype//EN", "CALSCALE:GREGORIAN"];
    m.events.forEach((e, i) => lines.push("BEGIN:VEVENT", `UID:adu-${d8(e.date)}-${i}@adu-pathfinder.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(addDays(e.date, 1))}`,
      `SUMMARY:${escI(e.title + (e.projected && e.kind !== "typical" ? " (projected)" : ""))}`, `DESCRIPTION:${escI([e.detail, e.cite, "Prototype, not legal advice."].filter(Boolean).join("\n"))}`, "END:VEVENT"));
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "adu-deadlines.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- render ----------
  let M = null;
  function render() {
    save(readInputs());
    M = build();
    pathNote(M);
    renderCountdowns(M);
    renderShotClock(M);
    renderCalendar(M);
    renderAgenda(M);
    renderCites(M);
  }

  function step(dir) {
    const a = ANCHOR || M.today;
    ANCHOR = VIEW === "week" ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + Number(VIEW) * dir, 1, 12);
    renderCalendar(M);
  }

  async function init() {
    let cities;
    [CFG, { cities }, STATS] = await Promise.all(["timeline-config.json", "cities.json", "city-stats.json"].map((f) => fetch(`/data/${f}`).then((r) => r.json())));
    CITIES = cities;
    ProjectForm.mount($("#project-panel"), cities.map((c) => c.name).sort());
    ProjectForm.onChange(render);
    writeInputs(load());

    $(".cal-inputs").addEventListener("input", render);
    $(".cal-inputs").addEventListener("change", render);
    $("#cal-prev").onclick = () => step(-1);
    $("#cal-next").onclick = () => step(1);
    $("#cal-today").onclick = () => { ANCHOR = null; renderCalendar(M); };
    $$(".cal-views button").forEach((b) => (b.onclick = () => { VIEW = b.dataset.view; renderCalendar(M); }));
    $("#ics-btn").onclick = () => downloadIcs(M);
    $("#cal").addEventListener("click", (e) => {
      const c = e.target.closest(".ev"); if (!c) return;
      const li = $(`#ag-${c.dataset.ev}`); if (!li) return;
      li.scrollIntoView({ behavior: "smooth", block: "center" });
      li.classList.add("flash"); setTimeout(() => li.classList.remove("flash"), 1600);
    });
    $("#d-example").onclick = () => { writeInputs({ ...readInputs(), start: "2026-07-01", target: "2026-08-01", submitted: "2026-08-01", complete: "2026-08-01", responded: true, decided: false, rent: "2000", today: "2026-11-07" }); ANCHOR = null; render(); };
    $("#d-reset").onclick = () => { writeInputs(defaults()); ANCHOR = null; render(); };
    if (window.matchMedia("(max-width: 700px)").matches) VIEW = "1";
    render();
  }

  init().catch((e) => { console.error(e); $("#cal").textContent = "Could not load the calendar data."; });
})();
