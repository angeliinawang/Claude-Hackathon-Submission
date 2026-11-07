// Shared "Tell us about your project" panel, used by the ADU guide and the fast-path timeline.
//
// UI flow:
//  - First visit (no saved city): the form opens as a centered modal with a "See my path" button,
//    disabled until a city is chosen.
//  - After saving: the form is hidden and a compact summary bar sits at the top of the results,
//    with an "Edit project" button that reopens the same form with the current values.
//  - Results update only when the form is saved (or when another tab saves the project).
//
// Data: one saved project (localStorage key "adu-form"), same fields as before, synced across tabs.
"use strict";
(function (root) {
  const KEY = "adu-form";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPE_LABEL = {
    detached: "New detached ADU",
    attached: "Attached ADU",
    conversion: "Conversion of existing space",
    garage_replace: "Replace detached garage with an ADU",
    jadu: "Junior ADU (JADU)",
  };

  const HTML = `
    <div class="pf-summary panel" id="pf-summary" hidden>
      <div class="pf-sum-row">
        <div class="pf-sum-text"><span class="pf-sum-label">Your project</span> <span id="pf-sum-text"></span></div>
        <button type="button" class="btn ghost" id="pf-edit">Edit project</button>
      </div>
      <div class="city-card" id="city-card" hidden></div>
    </div>

    <dialog class="pf-dialog" id="pf-dialog" aria-labelledby="pf-title">
      <form id="project-form" autocomplete="off">
        <h2 id="pf-title">Tell us about your project</h2>
        <p class="pf-tagline">Your backyard home, from paperwork to keys — Orange County, CA</p>
        <p class="hint pf-intro" id="pf-intro">Answer a few questions and we'll show your path: steps, paperwork, the state rules that protect you, and a timeline.</p>
        <div class="pf-grid">
          <div class="pf-col">
            <label>City
              <select id="city"><option value="">Choose your city…</option></select>
            </label>
            <fieldset>
              <legend>What are you building?</legend>
              <label class="radio"><input type="radio" name="type" value="detached" checked> New detached ADU (backyard cottage)</label>
              <label class="radio"><input type="radio" name="type" value="attached"> Attached ADU (addition to the house)</label>
              <label class="radio"><input type="radio" name="type" value="conversion"> Convert existing space (garage, room, accessory building)</label>
              <label class="radio"><input type="radio" name="type" value="garage_replace"> Tear down a detached garage &amp; build an ADU</label>
              <label class="radio"><input type="radio" name="type" value="jadu"> Junior ADU (JADU, inside the house, up to 500 sq ft)</label>
            </fieldset>
          </div>
          <div class="pf-col">
            <label>Interior living space (sq ft)
              <input id="size" type="number" min="100" max="2000" step="10" value="600" inputmode="numeric">
            </label>
            <label class="check" id="preapproved-wrap"><input id="preapproved" type="checkbox"> Using a city or state pre-approved plan</label>
            <label class="check" id="shared-bath-wrap" hidden><input id="sharedbath" type="checkbox"> JADU shares a bathroom with the main house</label>
            <label class="check"><input id="existing" type="checkbox" checked> There is already a house on the lot</label>
            <label>In the Coastal Zone?
              <select id="coastal">
                <option value="no">No</option>
                <option value="yes">Yes</option>
                <option value="unsure">Not sure</option>
              </select>
            </label>
            <p class="hint">Not sure about the coastal zone? Ask your city's planning division; the Coastal Commission also maps it.</p>
          </div>
        </div>
        <div class="pf-actions">
          <span class="hint" id="pf-need-city">Choose a city to continue.</span>
          <button type="button" class="btn ghost" id="pf-cancel" hidden>Cancel</button>
          <button type="submit" class="btn" id="pf-submit" disabled>See my path</button>
        </div>
      </form>
    </dialog>`;

  let el, dialog, listeners = [], snapshot = null, firstRun = true;
  const q = (s) => el.querySelector(s);

  function read() {
    return {
      city: q("#city").value,
      type: q('input[name="type"]:checked').value,
      size: Number(q("#size").value) || 0,
      preapproved: q("#preapproved").checked,
      sharedBath: q("#sharedbath").checked,
      existing: q("#existing").checked,
      coastal: q("#coastal").value,
    };
  }

  function apply(state) {
    if (!state) return;
    if (state.city !== undefined) q("#city").value = state.city || "";
    const r = state.type && q(`input[name="type"][value="${state.type}"]`); if (r) r.checked = true;
    if (state.size) q("#size").value = state.size;
    if (state.preapproved !== undefined) q("#preapproved").checked = !!state.preapproved;
    if (state.sharedBath !== undefined) q("#sharedbath").checked = !!state.sharedBath;
    if (state.existing !== undefined) q("#existing").checked = state.existing !== false;
    if (state.coastal) q("#coastal").value = state.coastal;
  }

  // Show only the options that make sense for the chosen project type.
  function tidy() {
    const p = read();
    q("#shared-bath-wrap").hidden = p.type !== "jadu";
    q("#preapproved-wrap").hidden = p.type === "jadu" || p.type === "conversion";
    if (p.type === "jadu" && p.size > 500) q("#size").value = 500;
    const ok = Boolean(p.city);
    q("#pf-submit").disabled = !ok;
    q("#pf-need-city").hidden = ok;
  }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(read())); } catch {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
  function emit() { const p = read(); listeners.forEach((fn) => fn(p)); }

  function usesPreapprovedDetached(p) { return p.preapproved && (p.type === "detached" || p.type === "garage_replace"); }

  function summaryText(p) {
    const parts = [p.city || "No city", TYPE_LABEL[p.type] || p.type, `${p.size || "?"} sq ft`];
    if (usesPreapprovedDetached(p)) parts.push("Pre-approved plan");
    if (p.type === "jadu") parts.push(p.sharedBath ? "Shares a bathroom" : "Own bathroom");
    parts.push(p.existing ? "House on lot" : "No house on lot yet");
    parts.push(p.coastal === "yes" ? "In coastal zone" : p.coastal === "unsure" ? "Coastal zone: not sure" : "Not in coastal zone");
    return parts;
  }

  function showSummary() {
    q("#pf-sum-text").innerHTML = summaryText(read()).map(esc).join(' <span class="pf-dot">·</span> ');
    q("#pf-summary").hidden = false;
  }

  function open(isFirstRun) {
    firstRun = isFirstRun;
    snapshot = isFirstRun ? null : read();
    q("#pf-cancel").hidden = isFirstRun;
    q("#pf-intro").hidden = !isFirstRun;
    q("#pf-submit").textContent = isFirstRun ? "See my path" : "Save changes";
    tidy();
    if (!dialog.open) dialog.showModal();
    (isFirstRun ? q("#city") : q("#pf-submit")).focus();
  }

  function close() { if (dialog.open) dialog.close(); }

  function cancel() {
    if (firstRun) return; // nothing to go back to yet
    apply(snapshot);
    tidy();
    close();
    q("#pf-edit").focus();
  }

  function mount(container, cityNames, initial) {
    el = container;
    el.innerHTML = HTML;
    dialog = q("#pf-dialog");
    q("#city").insertAdjacentHTML("beforeend", cityNames.map((n) => `<option>${esc(n)}</option>`).join(""));
    apply(load());
    apply(initial);
    tidy();

    const form = q("#project-form");
    form.addEventListener("input", tidy);
    form.addEventListener("change", tidy);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!read().city) return;
      tidy();
      save();
      close();
      showSummary();
      emit();
      q("#pf-edit").focus();
    });
    q("#pf-cancel").addEventListener("click", cancel);
    q("#pf-edit").addEventListener("click", () => open(false));
    // Escape key: cancel an edit; on first run the form must be completed.
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); cancel(); });
    // Click on the backdrop (outside the card) cancels an edit.
    dialog.addEventListener("click", (e) => { if (e.target === dialog) cancel(); });

    // Another tab or page saved the project: pick it up.
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY || !e.newValue) return;
      apply(JSON.parse(e.newValue));
      tidy();
      if (read().city) { if (firstRun && dialog.open) close(); firstRun = false; showSummary(); }
      emit();
    });

    if (read().city) { firstRun = false; save(); showSummary(); }
    else open(true);
  }

  function onChange(fn) { listeners.push(fn); }

  root.ProjectForm = { mount, read, onChange, TYPE_LABEL, usesPreapprovedDetached };
})(window);
