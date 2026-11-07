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

A web app (no build step) with five views:

| View | What it shows |
|---|---|
| **Your steps** | Where to submit, the city's own steps in order, then the state clocks (15-business-day completeness check, 60-day decision or 30 days for pre-approved detached plans, coastal permit), JADU deed restriction, Certificate of Occupancy |
| **Paperwork** | Every form and document the city lists, tagged *Sign / Notarize / Record with County Recorder*, with links to the forms; state-required documents for your project; a printable packet |
| **State-law check** | Only the state rules that apply to *your* project (type, size, coastal, pre-approved plan, shared bathroom), plus flags: stale citations, possible conflicts with state law, and city pages that disagree with each other |
| **Timeline** | State legal maximums, city-published step times, and the city's real median build time (permit to Certificate of Occupancy) and ADU permits per year from Annual Progress Report data |
| **Old-law checker** | Paste text from any city form; it highlights renumbered ADU sections (65852.2, .22, .23, .26, 66324, 66327, 66332) and shows the current numbers |

Cities covered: Anaheim, Costa Mesa, Fullerton, Garden Grove, Huntington Beach, Irvine, Orange, Santa Ana, Tustin.

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

## Where it gets things wrong

- Some city facts come only from search snippets because Santa Ana, Anaheim, Costa Mesa, Fullerton and Orange block automated reading. They are labelled *Search summary only — confirm*.
- Fees are mostly **unknown**. Only Irvine's planning deposit and Garden Grove's free plans are confirmed.
- Santa Ana's own pages disagree on paper vs. electronic submittal. We show both and don't pick one.
- Irvine shows very few ADU permits in the dataset, with years missing. This looks like a data gap, and we flag it.
- Flags such as Irvine's covenant are questions to ask the city, not findings that the city is wrong.
- We do not check zoning, setbacks, lot eligibility or fire zones for a specific address.

## Next steps

- Fill the other 25 OC cities in `lanes/2-clear-it/data/oc-cities.json` using the same schema (each city takes about 20 minutes with sources). A city permit tech could maintain its own entry.
- Add an AB 2234 (Gov Code 65913.3) audit: is each city's checklist and sample application actually online?
- Pull timelines directly from the official APR API instead of the third-party copy.
- Give permit counters a "send this packet to the applicant" view (draft only; the tool never sends anything).

## Data and privacy

This project uses only public data. It contains no personal information about real tenants, buyers or residents. The form selections stay in the visitor's browser (localStorage) and are sent to Claude only when they press **Ask**. It does not file applications or contact any city or person.

## License

MIT, see the LICENSE file in this repo.
