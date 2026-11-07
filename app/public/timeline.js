// Baseline vs. fast-path timeline. All durations come from data/timeline-config.json.
// A missing (null) value is shown as "unknown", never filled in.
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLORS = { rezoning: "#8c6d46", completeness: "#4f86c6", decision: "#2d5b8a", plans: "#c99a2e", build: "#2f855f" };
  let CFG;

  const fmtMo = (m) => (m == null ? "unknown" : `${m < 10 ? m.toFixed(1) : Math.round(m)} mo`);
  const money = (n) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function clockToMonths(clock) {
    if (!clock || clock.days == null) return null;
    const conv = CFG.day_conversions;
    const cal = clock.unit === "business" ? clock.days * conv.calendar_days_per_business_day : clock.days;
    return cal / conv.calendar_days_per_month;
  }
  function clockText(clock) {
    if (!clock || clock.days == null) return "unknown";
    return `${clock.days} ${clock.unit === "business" ? "business " : ""}days`;
  }

  function build() {
    const path = CFG.paths.find((p) => p.id === $("#t-path").value) || CFG.paths[0];
    const end = $("#t-plans").value;
    const b = CFG.baseline.phases;
    const plans = end === "min" ? b.plans.months_min : b.plans.months_max;
    const baseline = [
      { id: "rezoning", months: b.rezoning.months, note: b.rezoning.text },
      { id: "completeness", months: b.completeness.months, note: b.completeness.text },
      { id: "decision", months: b.decision.months, note: b.decision.text },
      { id: "plans", months: plans, note: `${b.plans.text} (${end === "min" ? "low" : "high"} end)` },
      { id: "build", months: b.build.months, note: b.build.text },
    ];
    const fast = [
      { id: "rezoning", months: CFG.fast_path_rules.rezoning.months, note: "none: land already zoned correctly" },
      { id: "completeness", months: clockToMonths(path.completeness), note: `statutory max ${clockText(path.completeness)}` },
      { id: "decision", months: clockToMonths(path.decision), note: `statutory max ${clockText(path.decision)}` },
      { id: "plans", months: plans, note: "same as baseline" },
      { id: "build", months: b.build.months, note: "same as baseline" },
    ];
    return { path, baseline, fast };
  }

  const total = (segs) => segs.reduce((a, s) => a + (s.months || 0), 0);
  const hasUnknown = (segs) => segs.some((s) => s.months == null);

  function drawChart({ baseline, fast }) {
    const W = 920, labelW = 150, rightPad = 140, barH = 40, gap = 74, top = 18;
    const maxM = Math.max(total(baseline), total(fast), 1);
    const scale = (W - labelW - rightPad) / maxM;
    const rows = [{ name: "Baseline", sub: "ASSUMPTION (brief)", segs: baseline }, { name: "Fast path", sub: "statutory clocks", segs: fast }];
    const H = top + rows.length * (barH + gap) + 24;
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    // axis
    svg += `<g class="axis">`;
    for (let m = 0; m <= maxM + 0.01; m += 6) {
      const x = labelW + m * scale;
      svg += `<line x1="${x}" x2="${x}" y1="${top - 6}" y2="${H - 22}" stroke-dasharray="2 3"/><text x="${x}" y="${H - 6}" text-anchor="middle">${m} mo</text>`;
    }
    svg += `</g>`;
    rows.forEach((row, i) => {
      const y = top + i * (barH + gap);
      svg += `<text x="0" y="${y + 17}" font-weight="700">${row.name}</text><text x="0" y="${y + 34}" class="axis"><tspan fill="currentColor" font-size="11" opacity=".7">${row.sub}</tspan></text>`;
      let x = labelW;
      const parts = [];
      for (const s of row.segs) {
        const label = CFG.segments.find((c) => c.id === s.id).label;
        if (s.months == null) {
          // Unknown duration: dashed placeholder (width does not represent time).
          svg += `<g><title>${esc(label)}: unknown (${esc(s.note)})</title><rect x="${x + 2}" y="${y}" width="26" height="${barH}" rx="4" fill="none" stroke="${COLORS[s.id]}" stroke-width="2" stroke-dasharray="4 3"/><text x="${x + 15}" y="${y + 26}" text-anchor="middle" font-weight="700" fill="${COLORS[s.id]}">?</text></g>`;
          x += 30;
          parts.push(`${label}: unknown`);
          continue;
        }
        if (s.months <= 0) continue;
        const w = s.months * scale;
        svg += `<g><title>${esc(label)}: ${fmtMo(s.months)} (${esc(s.note)})</title><rect x="${x}" y="${y}" width="${w}" height="${barH}" fill="${COLORS[s.id]}"/>`;
        if (w > 44) svg += `<text x="${x + w / 2}" y="${y + 25}" text-anchor="middle" fill="#fff" font-weight="600">${fmtMo(s.months)}</text>`;
        svg += `</g>`;
        x += w;
        parts.push(`${label} ${fmtMo(s.months)}`);
      }
      const t = total(row.segs);
      svg += `<text x="${x + 10}" y="${y + 25}" class="total">${hasUnknown(row.segs) ? "≥ " : ""}${fmtMo(t)}${hasUnknown(row.segs) ? " + unknown" : ""}</text>`;
      svg += `<text x="${labelW}" y="${y + barH + 18}" class="axis"><tspan font-size="11.5" fill="currentColor" opacity=".75">${esc(parts.join(" · "))}</tspan></text>`;
    });
    svg += `</svg>`;
    $("#chart").innerHTML = svg;
    $("#chart").setAttribute("aria-label", `Baseline ${fmtMo(total(baseline))}; fast path ${hasUnknown(fast) ? "at least " : ""}${fmtMo(total(fast))}${hasUnknown(fast) ? " plus unknown phases" : ""}.`);
  }

  function savings({ baseline, fast }) {
    const homes = Math.max(0, Math.floor(Number($("#t-homes").value) || 0));
    const cost = Math.max(0, Number($("#t-cost").value) || 0);
    const diff = total(baseline) - total(fast);
    const unknown = hasUnknown(fast);
    if (unknown) {
      $("#saved").textContent = "unknown";
      $("#saved-sub").textContent = `A fast-path clock for this path is not in our sources. If that phase took 0 days, the most you could save is ${fmtMo(diff)}.`;
      $("#dollars").textContent = "unknown";
      $("#dollars-sub").textContent = `Upper bound on the same basis: ${money(diff * homes * cost)} (${homes} home${homes === 1 ? "" : "s"} × ${money(cost)}/month × ${diff.toFixed(1)} months).`;
    } else {
      $("#saved").textContent = fmtMo(diff);
      $("#saved-sub").textContent = `Baseline ${fmtMo(total(baseline))} − fast path ${fmtMo(total(fast))}. The fast path uses legal maximums; real reviews can be shorter or, if the city misses deadlines, longer.`;
      $("#dollars").textContent = money(diff * homes * cost);
      $("#dollars-sub").textContent = `${homes} home${homes === 1 ? "" : "s"} × ${money(cost)} per home per month × ${diff.toFixed(1)} months. Derived from your inputs, not a sourced fact.`;
    }
  }

  function cites({ path }) {
    const c = (clock, name) => clock && clock.days != null
      ? `<li><b>${name}:</b> ${clockText(clock)} — ${esc(clock.cite)}; ${clock.url ? `<a href="${esc(clock.url)}" target="_blank" rel="noopener">${esc(clock.source)}</a>` : esc(clock.source)}, checked ${esc(CFG.checked)}.</li>`
      : `<li><b>${name}:</b> <span class="chip unknown">Unknown</span> ${esc(clock?.source || "Not supplied")}.</li>`;
    $("#cites").innerHTML = `
      ${c(path.completeness, `Fast path completeness check (${path.label})`)}
      ${c(path.decision, `Fast path decision clock (${path.label})`)}
      <li><b>Baseline phases</b> <span class="chip assumption">ASSUMPTION</span>: ${esc(CFG.baseline.basis)}</li>
      <li><b>Fast path rezoning = 0:</b> ${esc(CFG.fast_path_rules.rezoning.basis)} Plans and construction are kept the same as the baseline.</li>
      <li><b>Day-to-month conversion</b> <span class="chip assumption">ASSUMPTION</span>: ${esc(CFG.day_conversions.note)}</li>
      <li><b>Default carrying cost</b> <span class="chip assumption">ASSUMPTION</span>: ${esc(CFG.carrying_cost_default.basis)}</li>
      <li><b>Statutory clocks are maximums</b> counted from a complete application. They do not include resubmittals, plan-check corrections, utility sign-offs or funding rounds.</li>`;
  }

  function legend() {
    $("#legend").innerHTML = CFG.segments.map((s) => `<li><span class="sw" style="background:${COLORS[s.id]}"></span>${esc(s.label)}</li>`).join("") + `<li><span class="sw" style="border:2px dashed var(--muted)"></span>Unknown duration (not to scale)</li>`;
  }

  function render() {
    const m = build();
    drawChart(m);
    savings(m);
    cites(m);
    try { localStorage.setItem("tl-inputs", JSON.stringify({ path: m.path.id, plans: $("#t-plans").value, homes: $("#t-homes").value, cost: $("#t-cost").value })); } catch {}
  }

  async function init() {
    CFG = await fetch("/data/timeline-config.json").then((r) => r.json());
    $("#t-path").innerHTML = CFG.paths.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
    $("#t-homes").value = CFG.carrying_cost_default.homes;
    $("#t-cost").value = CFG.carrying_cost_default.per_home_per_month;
    try {
      const s = JSON.parse(localStorage.getItem("tl-inputs") || "null");
      if (s) { if (s.path) $("#t-path").value = s.path; if (s.plans) $("#t-plans").value = s.plans; if (s.homes) $("#t-homes").value = s.homes; if (s.cost) $("#t-cost").value = s.cost; }
    } catch {}
    const qs = new URLSearchParams(location.search);
    if (qs.get("path")) $("#t-path").value = qs.get("path");
    legend();
    ["input", "change"].forEach((ev) => document.querySelector("main").addEventListener(ev, render));
    render();
  }

  init().catch((e) => { console.error(e); $("#chart").textContent = "Could not load timeline-config.json."; });
})();
