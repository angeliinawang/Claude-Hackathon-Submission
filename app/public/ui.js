// Shared small UI pieces: plain-language "ⓘ" definitions and pop-up menus.
// Definitions are general explanations of terms; they add no legal claims. Keep them 1–2 sentences.
"use strict";
(function (root) {
  const GLOSSARY = {
    adu: ["ADU", "An accessory dwelling unit: a second, smaller home on the same lot as a house, such as a backyard cottage, an addition or a converted garage."],
    jadu: ["Junior ADU (JADU)", "A small unit of up to 500 sq ft made inside a single-family home. It can share some facilities with the main house."],
    objective: ["Local standards", "Your city's written, measurable rules, like height limits or distance from property lines, applied the same way to everyone without a judgment call."],
    setbacks: ["Setbacks", "The required distance between a building and your property lines."],
    ministerial: ["Ministerial review", "Staff check your plans against written rules only. If you meet them, the city must approve, with no public hearing."],
    deemedcomplete: ["Deemed complete", "If the city doesn't tell you in time whether your application is complete, it is treated as complete."],
    deed: ["Deed restriction", "A written condition recorded with the county on your property's title. It stays with the property if it's sold."],
    owner: ["Owner-occupancy", "A requirement that the property owner live on the property."],
    co: ["Certificate of Occupancy", "The city's final sign-off that a new home is ready to live in. No one may move in before it's issued."],
    preapproved: ["Pre-approved plan", "A set of ADU plans the city (or another agency) has already reviewed, so approval can be faster. Your lot's details still need to be added."],
    coastal: ["Coastal Zone", "Land near the coast covered by California's Coastal Act, where building can need an extra coastal permit. Not sure if your lot is in it? Ask your city's planning division."],
    impact: ["Impact fees", "One-time fees some public agencies charge new construction to help pay for things like parks, roads, water or sewer systems."],
  };

  const info = (key) => {
    const g = GLOSSARY[key];
    if (!g) return "";
    return `<button type="button" class="info-btn" data-term="${key}" aria-label="What is ${g[0]}?" aria-expanded="false" aria-haspopup="dialog">i</button>`;
  };

  let pop = null, openBtn = null, openMenu = null;
  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "info-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "false");
    pop.hidden = true;
    document.body.appendChild(pop);
    return pop;
  }
  function closeInfo() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (openBtn) { openBtn.setAttribute("aria-expanded", "false"); }
    openBtn = null;
  }
  function openInfo(btn) {
    const g = GLOSSARY[btn.dataset.term];
    if (!g) return;
    if (openBtn === btn) { closeInfo(); btn.focus(); return; }
    closeInfo(); closeMenu();
    const p = ensurePop();
    p.innerHTML = `<p><strong>${g[0]}</strong></p><p>${g[1]}</p>`;
    p.setAttribute("aria-label", g[0]);
    p.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 24);
    p.style.width = `${w}px`;
    const left = Math.max(12, Math.min(window.scrollX + r.left - 12, window.scrollX + window.innerWidth - w - 12));
    let top = window.scrollY + r.bottom + 8;
    p.style.left = `${left}px`; p.style.top = `${top}px`;
    // flip above if it would go off the bottom
    const ph = p.offsetHeight;
    if (r.bottom + 8 + ph > window.innerHeight && r.top - 8 - ph > 0) p.style.top = `${window.scrollY + r.top - 8 - ph}px`;
    btn.setAttribute("aria-expanded", "true");
    openBtn = btn;
  }

  function closeMenu() {
    if (!openMenu) return;
    const { btn, menu } = openMenu;
    menu.hidden = true; btn.setAttribute("aria-expanded", "false");
    openMenu = null;
  }
  function toggleMenu(btn) {
    const menu = document.getElementById(btn.getAttribute("aria-controls"));
    if (!menu) return;
    if (openMenu && openMenu.btn === btn) { closeMenu(); return; }
    closeMenu(); closeInfo();
    menu.hidden = false; btn.setAttribute("aria-expanded", "true");
    openMenu = { btn, menu };
    const first = menu.querySelector("a, button"); if (first) first.focus();
  }

  document.addEventListener("click", (e) => {
    const ib = e.target.closest(".info-btn");
    if (ib) { e.preventDefault(); e.stopPropagation(); openInfo(ib); return; }
    const mb = e.target.closest("[data-menu-toggle]");
    if (mb) { e.preventDefault(); toggleMenu(mb); return; }
    if (pop && !pop.hidden && !e.target.closest(".info-pop")) closeInfo();
    if (openMenu && !e.target.closest(`#${openMenu.menu.id}`)) closeMenu();
    if (openMenu && e.target.closest(`#${openMenu.menu.id} a, #${openMenu.menu.id} button`)) closeMenu();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // preventDefault stops a surrounding <dialog> (e.g. the project form) from closing too.
    if (pop && !pop.hidden) { const b = openBtn; closeInfo(); if (b) b.focus(); e.preventDefault(); e.stopPropagation(); return; }
    if (openMenu) { const b = openMenu.btn; closeMenu(); b.focus(); }
  }, true);
  window.addEventListener("resize", closeInfo);

  root.UI = { info, GLOSSARY, closeInfo, closeMenu };
})(window);
