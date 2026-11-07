# ADU Pathfinder

> For Orange County homeowners adding an ADU: shows the city's paperwork, the state rules that protect you, and a realistic timeline in one place, with every fact sourced and dated.

**Team:** [team name]
**Members:** [names]
**Lane:** 2 Clear it
**Built at:** Claude Impact Lab: UCI × SoCal Affordable Housing, November 7, 2026

## The real user

A first-time homeowner in one Orange County city who wants to add a backyard home (ADU) or a junior ADU (scenario C01 in `lanes/2-clear-it/scenarios.json`). Every city has its own forms, portal and fees. City documents sometimes cite state law that has been renumbered, and most homeowners don't know the deadlines the city must meet.

**Before:** they dig through a city website, PDFs and a 55-page state handbook, and often call the counter several times.
**After:** they pick their city and project, then get an ordered path, a printable paperwork checklist, the state rules that apply (with section numbers), flags where the city's materials look stale or out of step with state law, and a timeline built from the state's legal deadlines and real permit data.

## What we built

A web app (no build step). The **homeowner guide** (`/`) is written for someone with no legal or planning background:

- A first-run pop-up asks about the project (city, type, size, house on the lot, coastal zone); a summary bar with **Edit project**, a tap-to-call planning number (or "Find contact info ↗") and the city's ADU page stays on top.
- A collapsible sidebar shows **7 steps**: Before you apply, Gather paperwork, Submit, City review, Corrections or denial, Fees, Build and move in, with a plain duration when one is known (e.g. "Up to about 3 months", "Typically about 10 months") and a Done checkbox.
- Each step page: big **number tiles** where a number is the point (15 business days / 60 days; $0 or "Maybe" fees; typical months to move in), **What to do** in at most 3 plain bullets with action buttons, **Your rights for this step** as collapsed rows (plain headline; original wording and citation inside), and Back/Next.
- Step 1 links to the screening map; Step 2 has the printable **paperwork checklist** with one plain line per item ("what it is, who prepares it") and "Not yet confirmed" tags.
- Every citation, dataset and city source for a step sits behind its **Sources** button, with checked dates and "Not yet confirmed" where it applies. Terms like ADU, JADU, setbacks or deemed complete have a small **ⓘ** with a 1–2 sentence plain definition.
- **For cities & builders** menu: Screening map, Fast-path timeline (deadline calendar), and the **Old-law checker** (paste text to flag renumbered ADU sections; also lists each city's City-vs-state comparisons).

Cities covered: Anaheim, Costa Mesa, Fullerton, Garden Grove, Huntington Beach, Irvine, Orange, Santa Ana, Tustin.

### Parcel screening map (`/map.html`)

2,622 real lots in a demo area (Anaheim Hills and adjacent unincorporated land along the Santa Ana River). Each lot is tested against 6 approval paths: ADU, SB 9, SB 684 (multifamily lots), SB 1123 (vacant single-family lots), AB 2011 and SB 4.

- Every test returns **pass / fail / unknown / needs review**, and every path gets a state: **likely / possible / needs review / unknown / no**. A test whose rule or data we lack returns *unknown*; it is never guessed.
- The lot's **score** is the number of paths rated likely, possible or needs review, colored light grey (0) to dark green (6). An **orange outline** marks lots in a mapped FEMA Special Flood Hazard Area or a Very High Fire Hazard Severity Zone.
- Click a lot to see its APN, address, zoning, score, and every test with its result, reason and citation.
- Filters: minimum acreage, a specific path, hide hazard lots, with a running "X of Y lots shown" count.
- `map.html?apn=35631101` deep-links to one lot.
- **Any Orange County ZIP:** type a ZIP and the server fetches that ZIP's lots on demand from the same layers (listed in `lanes/1-find-it/data/DATA-SOURCES.md`), clipped to the U.S. Census 2020 ZIP Code Tabulation Area (an approximation of the USPS ZIP). Orange County is checked against SCAG's Orange County layer. One ZIP at a time, paced requests, a 20,000-lot cap, cached in `data/zips/` (git-ignored). `map.html?zip=92808` deep-links. First load takes ~30–60 s; the county parcel server sometimes times out, in which case the page says to try again.
- All rules live in `data/screening-rules.json` (editable). The engine (`public/screening.js`) has no thresholds of its own.

### Calendar & deadlines (`/timeline.html`)

Answers "Is the city late on my application, and how much is that costing me?" for the project in the shared **Tell us about your project** panel.

- **Countdowns:** the city's completeness reply (15 business days, Gov. Code § 66317(a)(2)), the approve-or-deny decision (60 days, or 30 for a pre-approved detached plan), and your next paperwork goal. Missed completeness deadline = deemed complete (§ 66317(a)(2)(F)).
- **Is the city late?** Legal-deadline bar vs. days actually elapsed since your application became complete, with an overdue marker. Past 60 days without a decision, the application is deemed approved (§ 66317(a); HCD ADU Handbook p. 51, AB 3182). A **draft** "deemed approved" confirmation or status-request email to copy: nothing is ever sent. Lost rent = your monthly rent estimate (ASSUMPTION) × months overdue.
- **Calendar:** Week, Month, 2-month and 3-month views. Your paperwork goals in the city's listed order between your start and target dates (ASSUMPTION: spread evenly), city-published lead times (e.g. Anaheim sewer verification "up to four days") placed before the matching item, the city's legal deadlines (projected until you enter a submission date), and the city's historical median move-in. Download a `.ics` file to add it to any calendar app.
- Example: submitted Aug 1, today Nov 7 → deadline Sep 30, 98 days so far, 38 days overdue, ≈ $2,497 at $2,000/month. Dates are saved only in the browser.
- No existing house: no separate ADU clock (unknown), so no overdue or deemed-approved claim.

## How Claude is used

- **Built with Claude Code:** reading city pages and the HCD Handbook, extracting the rules with page cites, and writing the app.
- **Inside the tool:** the optional *Ask a question* box sends the question to Claude (`claude-opus-5-5`) along with our sourced JSON only. The prompt requires a citation on every fact, "unknown" when our data doesn't say, a note when a fact is only from a search snippet, and a not-legal-advice line. The person should still click through to the cited source.

## Try it

```bash
cd app
npm install
npm start            # http://localhost:3000
```

Needs Node 18+. The Q&A box is optional: copy `app/.env.example` to `app/.env` and set `ANTHROPIC_API_KEY`. Without a key, everything else works and the Q&A box says it is off. Never commit `.env`.

To rebuild the permit stats from the CSVs: `npm run stats`.

## Sources and assumptions

| Item | Source or assumption | Date checked |
|---|---|---|
| All state rules (deadlines, fees, size, height, parking, owner-occupancy, deed restrictions, coastal) | HCD ADU Handbook, March 2026, with the Gov Code section and page for each rule: https://www.hcd.ca.gov/sites/default/files/docs/policy-and-research/adu-handbook-update.pdf | 2026-11-07 |
| Renumbering 65852.2 etc. → 66310–66342; 66324/66327/66332 → 66311.5/66313.5/66311.7 | Same Handbook, pp. 13–14 | 2026-11-07 |
| City steps, forms, portals, published timelines | Each city page, linked per item in `data/cities.json` with a status: *fetched*, *repo-verified*, or *snippet* | 2026-11-06 / 2026-11-07 |
| ADU permits per year; median permit-to-CO days | BackyardADU.net `permits_ca.csv`, `build_times.csv` (third party, CC0, derived from HCD APR Table A2). Official source: data.ca.gov APR dataset | 2026-11-07 |
| Screening map lots, zoning, slope | SCAG Zoning_poly_OR (2024 zoning, preliminary Oct 2025), cached in `data/raw/screening/` | 2026-11-07 |
| Address, year built (vacancy proxy) | OC Public Works Parcels FeatureServer | 2026-11-07 |
| Flood hazard | OC Floodplains (FEMA zones); only `SFHA_TF = T` counts as a hazard | 2026-11-07 |
| Fire hazard | OC Fire Hazard Severity Zones LRA (2011 map). CAL FIRE's 2025 LRA maps were **not** used | 2026-11-07 |
| Zoning categories (SCAG codes) | SCAG 2024 Land Use Code table in the layer description | 2026-11-07 |
| SB 9, SB 684/1123, AB 2011, SB 4 rules and clocks | HCD Housing Law Fact Sheets, April 2026 (page cited per rule in `data/screening-rules.json` and `data/timeline-config.json`) | 2026-11-07 |
| SB 9 split size 2,400 sq ft | Our arithmetic: 2 × 1,200 sq ft lots (fact sheet p. 1). The statute's proportion rule is not encoded | 2026-11-07 |
| Hazard overlap method | **ASSUMPTION:** a lot is "in" a zone if its centroid or any corner falls inside the zone polygon | 2026-11-07 |
| Baseline timeline phases | **ASSUMPTION** from the challenge brief (`lanes/2-clear-it/data/timeline.json`) | 2026-11-06 |
| Day → month conversion | **ASSUMPTION:** 30.44 days/month; business days × 7/5 | 2026-11-07 |
| Default carrying cost $1,771/home/month | **ASSUMPTION** derived from the brief's mock example ($85k time costs ÷ ~48 months). Users replace it | 2026-11-07 |
| "Roughly N months" total on the Timeline tab | **ASSUMPTION:** adds the state legal maximum review time (15 business days ≈ 3 weeks + 30/60 days) to the city's historical median build time. A rough guide, not a forecast; excludes design and plan corrections | 2026-11-07 |

## What is real and what is mocked

| Part | Status |
|---|---|
| State-law rules engine (filters rules by project) | Working, real sourced rules |
| City data for 9 cities | Working; depth varies by city (Irvine and Garden Grove deep; Fullerton, Huntington Beach and Tustin mostly "unknown") |
| Permit and build-time stats | Working, real data (third-party copy of APR) |
| Old-law checker | Working |
| Claude Q&A | Working when an API key is set |
| Printable packet | Working (browser print) |
| Parcel screening map | Working on real public data for one demo area (2,622 lots); other areas need `npm run fetch-parcels` with a new bounding box |
| Calendar & deadlines | Working; legal clocks from state law, goals from your dates, .ics export; business days skip weekends only (holidays not excluded, ASSUMPTION) |

## Where it gets things wrong

- Some city facts come only from search snippets because Santa Ana, Anaheim, Costa Mesa, Fullerton and Orange block automated reading. They are labelled *Search summary only — confirm*.
- Fees are mostly **unknown**. Only Irvine's planning deposit and Garden Grove's free plans are confirmed.
- Santa Ana's own pages disagree on paper vs. electronic submittal. We show both and don't pick one.
- Irvine shows very few ADU permits in the dataset, with years missing. This looks like a data gap, and we flag it.
- Flags such as Irvine's covenant are questions to ask the city, not findings that the city is wrong.
- The ADU guide does not check zoning, setbacks or lot eligibility for a specific address; the screening map does a partial check for one demo area only.
- Screening map: SCAG zoning is a regional, preliminary dataset; city zoning maps win. The fire layer is the 2011 LRA map. Lots coded Specific Plan (7777) or Unknown (9999) are *unknown*. Year built is only a proxy for "vacant". SB 4 is *unknown* everywhere because ownership isn't in free data. "Likely" means every test we could run passed, not that the path applies.
- Timeline: the baseline is the brief's rounded typical project, not a measurement, and it includes rezoning even for project types that would not need it.

## Next steps

- Fill the other 25 OC cities in `lanes/2-clear-it/data/oc-cities.json` using the same schema (each city takes about 20 minutes with sources). A city permit tech could maintain its own entry.
- Add an AB 2234 (Gov Code 65913.3) audit: is each city's checklist and sample application actually online?
- Pull timelines directly from the official APR API instead of the third-party copy.
- Give permit counters a "send this packet to the applicant" view (draft only; the tool never sends anything).

## Data and privacy

This project uses only public data. It contains no personal information about real tenants, buyers or residents. The form selections stay in the visitor's browser (localStorage) and are sent to Claude only when they press **Ask**. It does not file applications or contact any city or person.

## License

MIT, see the LICENSE file in this repo.
