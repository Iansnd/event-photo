# Kinderlee — European kindergarten lead database (v1, 2026-09-30)

Everything in this folder was built from free sources only (web search, public registries, company
registers, open data). No paid tools.

## Files

| File | What it is |
|---|---|
| `kinderlee_leads_europe.xlsx` | Main workbook: **Leads** (623 orgs, 46 countries), **Decision makers** (149 named), **Free data sources** (166 registries/tools), **Summary** per country |
| `kinderlee_leads_europe.csv` | Same leads table as CSV (UTF-8) |
| `decision_makers.csv` | Only rows with a named decision maker, ready for LinkedIn / e-mail enrichment |
| `free_lead_sources.csv` | Every free registry, open-data set and tool we found, per country, with how to extract |
| `data/*.json` | Raw regional research (DACH, UK/IE, FR/Benelux, Nordics, South, CEE, Baltics/Balkans/TR/UA, pan-European platforms + investors) |
| `scripts/fetch_osm_kindergartens.py` | Pulls **every** kindergarten mapped in OpenStreetMap for all 46 European countries (name, address, website, e-mail, phone, geo) into one CSV |
| `scripts/enrich_websites.py` | Visits each kindergarten website and extracts e-mails, phones and the named director / Leitung / manager from Impressum, Contact and Team pages |
| `scripts/merge_leads.py` | Rebuilds the CSV/XLSX from `data/*.json` |

## What is in the lead table

Each row: org name, type (chain / franchise / non-profit group / church group / municipal /
independent / international-school kindergarten / investor), country, HQ, website, number of
settings and children, ownership (incl. PE backer), decision maker + title + LinkedIn where seen,
other executives, generic e-mail / phone, a 5-12 sentence background (history, M&A, 2024-2026
news, digital / parent-app situation, sales hooks), lead score 1-5, sources, and a
`confirmation_status` / `notes` column that says whether the decision maker was confirmed from a
search result this session or comes from prior knowledge and must be verified.

Highest-value accounts (score 5, confirmed decision maker): Grandir (Jean-Emmanuel Rodocanachi,
1,092 sites), Babilou Family (Christophe Fond, ~1,200 sites), La Maison Bleue (Antonia
Ryckbosch / Sylvain Forestier), Busy Bees (Peter Gowers, group CEO), Kids Planet (Clare Roberts),
Bright Horizons UK (Philip Smith), Partou Group, Humankind (Robin Alma), Smallsteps (Jeanine
Lemmens), FRÖBEL (Stefan Spieker), kitea = Kinderzentren Kunterbunt + Villa Luna (Dr. Jürgen Reul,
Annette Holtmann), AcadeMedia (Marcus Strömberg; Espira, Pysslingen, Kita Luna, Stepke, KIDS&Co.),
Dibber / Læringsverkstedet, FUS (Eli Sævareid), Norlandia (Kristin Voldsnes), Atvexa (Johan
Kyllerman), Nemomarlin (Héctor Díaz Reimóndez), KIDS&Co. Poland (Karina Trafna), Vaikystės sodas
(Tomas Deržanauskas), Clece Escuelas Infantiles (113 municipal concessions, Spain).

## Known conflicts to resolve before outreach

Different sources gave different names for the same seat. Both are kept in the table; check LinkedIn:

- Dibber group CEO: Hans Jacob Sundby (founder) vs Morten Vårdal (group CEO) — likely chair vs CEO.
- Busy Bees: Peter Gowers (Group CEO, Jul 2025) vs Christopher McCandless (UK CEO, Sep 2025).
- Kindred (UK): Ruth Pimentel vs Laura Wardley-Smith.
- Partou Group CEO: one source names Jeanine Lemmens (she is confirmed at Smallsteps); Partou's own CEO was not confirmed.
- Thrive Childcare (UK): Cary Rankin left 29 Sep 2025; successor unconfirmed.

## Honest coverage statement

- **Groups and chains**: good coverage for DE, GB, FR, NL, NO, SE, PL, ES, LT, LV, plus all pan-European platforms and their PE investors.
- **Decision makers**: 149 of 623 rows are named. The remaining rows say "not confirmed" because the
  session's web-search quota (200 searches, shared by all eight research agents) ran out roughly a
  third of the way through each region. No names were invented. AT, CH, BE, LU, IE, DK, FI, IT, PT,
  GR, CZ, SK, HU, RO, BG and most of the Balkans need a second research pass (about 40-50 searches
  per region) to fill decision makers.
- **Independent kindergartens**: Europe has roughly 250,000+ kindergartens. A curated table cannot
  hold "every" one; the two scripts in `scripts/` are the way to get them all:
  1. `fetch_osm_kindergartens.py` pulls the full OpenStreetMap set (typically 150-200k facilities in Europe, ~30-40 % with website/phone).
  2. `enrich_websites.py` then visits each website and pulls the director name + e-mail.
  3. For registry-grade completeness, use the per-country official registers listed in `free_lead_sources.csv`
     (e.g. Ofsted providers CSV, LRK open data NL, barnehagefakta NO, Skolverket SE, RSPO PL, MŠMT CZ, KIR HU, SIIIR RO, monenfant.fr / SIRENE NAF 88.91A FR, Opgroeien BE, MEB TR).
  These could not be run inside this session because the container's network policy blocks
  overpass-api.de, wikidata.org, company registers and all direct web fetches. Run them on a laptop.

## Recommended next steps

1. Run `scripts/fetch_osm_kindergartens.py` locally (~1 h) → full independent-kindergarten list with contacts.
2. Run `scripts/enrich_websites.py --limit 20000` → director names + e-mails for every site with a website.
3. Re-run the regional research for the countries above with a fresh search budget to fill decision makers.
4. Push `decision_makers.csv` through Hunter.io / Apollo free tiers for e-mail patterns and LinkedIn Sales Navigator trial for verification.

## E-mail coverage (added after review)

Only 21 of 623 rows carry a confirmed e-mail (mostly generic info@ addresses) because e-mail
harvesting needs website visits and lookup tools that this container's network policy blocks.
`decision_makers.csv` now has a `likely_email_patterns_UNVERIFIED` column (first.last@, f.last@,
first@ on the company domain) for the 149 named decision makers. Verify each with Hunter.io,
Apollo or a mail-server check before sending. `scripts/enrich_websites.py` harvests real
addresses from every site once run on a machine with internet access.

## E-mail hunt, pass 1 (search-based, 2026-09-30)

185 priority leads (score 4-5 or named decision maker) were each searched once for addresses.
Result: 136 of them gained an e-mail, 45 with a personal address for a named person, all copied
verbatim from search results (none constructed). Overall 149 of 623 rows now carry an address.
New columns: `personal_emails_found`, `email_pattern_observed` (only where a real address on that
domain was seen), `email_sources`. Leadership changes surfaced during the hunt, already worth
knowing: Partou UK is now run by joint MDs Kirsty Jackson and John Everton (from 1 Jun 2026);
Jeanine Lemmens handed over Partou responsibilities on 1 Jun; Dibber Sverige VD is Erik Johannes
Stiigh; Kind & Co Ludens board is Carla van de Venne and Ruud van Overbeek; Wij zijn JONG
bestuurder is Jaco Donselaar; Samenwerkende Kinderopvang CEO is Vlad Enache; Touhula CEO is
Kaisa Ilola; Pilke CEO is Mari Puoskari; Coopselios president is Giovanni Umberto Calabrese;
Kindred CEO confirmed as Laura Wardley-Smith. 

## E-mail hunt, pass 2 (2026-09-30)

The remaining rows were searched in lead-score order until the session's search cap was hit.
Totals after pass 2: **315 of 623 rows have an e-mail** (77 with a personal, named address).
Of the 308 rows still without one, 37 were searched and nothing surfaced (contact forms only, or
addresses obfuscated on the site), and 271 were never searched because the cap was reached; those
are listed in `data/unsearched_orgs.json` and are almost all lead-score 1-2 placeholders. Domain
corrections and leadership changes surfaced during the hunt are in the `email_sources` /
`notes` columns of the affected rows. Fastest way to close the gap: run
`scripts/enrich_websites.py` locally (it reads every site's contact page directly), then verify
the personal addresses with Hunter.io or a mail-server check before sending.

## Website harvest (after network access was opened, 2026-09-30)

`scripts/enrich_websites.py` visited all 574 reachable lead websites (home + contact/imprint/team
pages). Result: 259 sites yielded addresses, 102 rows gained their first e-mail, and 121 rows now
carry director / Leitung / manager names scraped from the site (column
`website_directors_harvested`; these are regex extractions next to a title word, so eyeball them).
Totals now: **417 of 623 rows have an e-mail**. Raw harvest is in `data/website_harvest_raw.csv`.

## Full OpenStreetMap pull: every mapped kindergarten in Europe (2026-09-30)

`scripts/fetch_osm_kindergartens.py` walked a 1° grid over Europe (2,702 tiles, 0 failures) and
assigned each facility to a country with Natural Earth polygons. Files in `osm/`:

| File | Rows | What |
|---|---|---|
| `osm_kindergartens_europe.csv.gz` | 178,287 | Every kindergarten / childcare / preschool node in 45 countries: name, operator, brand, address, website, e-mail, phone, opening hours, capacity, lat/lon, OSM link |
| `osm_kindergartens_with_contact.csv` | 85,390 | The subset with a website, e-mail or phone. This is the independent-kindergarten outreach list |
| `operators_discovered.csv` | 3,712 | Every operator or brand with 3+ sites in one country, ranked by site count. Cross-check against the Leads sheet to find chains we have not profiled yet (e.g. municipal and church Träger, Partou 149 NL sites, LPCR 108 FR, Babilou 98 FR) |
| `summary_by_country.csv` | 45 | Facilities, contactable and e-mail counts per country |

Coverage: 156,994 named; 67,375 with website; 34,713 with e-mail; 63,878 with phone.
Biggest countries: DE 50,008 · GB 24,191 · PL 11,487 · IT 9,133 · FR 9,065 · UA 7,143 · ES 6,692 · NL 6,516 · NO 6,298 · SE 5,350.
OSM is community-mapped, so coverage varies by country (Germany, UK, Poland, Nordics are near-complete;
Italy, Spain, Greece and the Balkans are partial). For registry-grade completeness in those, use the
national registers in `free_lead_sources.csv`. To scrape directors/e-mails for these 85k sites, run
`scripts/enrich_websites.py --in osm/osm_kindergartens_with_contact.csv` (about 3 days at 1 req/s;
split by country and run in parallel).
Licence: ODbL, © OpenStreetMap contributors.
