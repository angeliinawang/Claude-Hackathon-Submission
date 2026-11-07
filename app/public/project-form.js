// Shared "Tell us about your project" panel, used by the ADU guide and the fast-path timeline.
// One saved project (localStorage key "adu-form") drives both pages, and stays in sync across
// open tabs via the "storage" event. Works without storage too (selections just aren't remembered).
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
    <h2>Tell us about your project</h2>
    <form id="project-form" autocomplete="off">
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
    </form>
    <div class="city-card" id="city-card" hidden></div>`;

  let el, listeners = [];
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
  }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(read())); } catch {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
  function emit() { const p = read(); listeners.forEach((fn) => fn(p)); }

  function mount(container, cityNames, initial) {
    el = container;
    el.innerHTML = HTML;
    q("#city").insertAdjacentHTML("beforeend", cityNames.map((n) => `<option>${esc(n)}</option>`).join(""));
    apply(load());
    apply(initial);
    tidy();
    save();
    const onEdit = () => { tidy(); save(); emit(); };
    q("#project-form").addEventListener("input", onEdit);
    q("#project-form").addEventListener("change", onEdit);
    // Another tab or page changed the project: pick it up.
    window.addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { apply(JSON.parse(e.newValue)); tidy(); emit(); } });
  }

  function onChange(fn) { listeners.push(fn); }

  // Clean read of the "pre-approved plan" option: it only applies to detached ADUs.
  function usesPreapprovedDetached(p) { return p.preapproved && (p.type === "detached" || p.type === "garage_replace"); }

  root.ProjectForm = { mount, read, onChange, TYPE_LABEL, usesPreapprovedDetached };
})(window);
