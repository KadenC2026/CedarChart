# CedarChart

CedarChart helps MIT students discover interesting courses and understand the prerequisite pathways leading to them.

## What works

- Natural-language course discovery with AI query expansion and grounded reranking
- Deterministic keyword fallback when the model API is unavailable
- Relevance-ranked catalog search: subject numbers beat titles, titles beat description mentions
- Filter menu for course number, level, offered term, requirement attribute, and units
- Interactive course graph
- Course detail panel
- Cross-feature "Show on map" navigation
- Recursive prerequisite pathways
- AND / OR prerequisite groups
- Add any course to a plan term from the progression chart or the course map
- Schedule lab (experimental): rank the classes you want, see which pairs overlap under
  every section option, and compare up to four conflict-free weekly schedules
- Completed-course tracking persisted in localStorage
- Official MIT catalog source links

## Run locally

Requirements: Node 22.12+

```bash
npm install
npm run dev
```

Then open the URL Vite prints, normally http://localhost:5173.

## Tests and build

```bash
npm test
npm run build
```

## AI setup

Create `.env.local`:

```
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-luna
```

The browser never receives the API key. The server interprets the student's goal into academic search concepts, retrieves a small candidate set from the checked-in catalog, and asks the model to rank only those candidates. Returned course IDs are validated against that candidate set, and supporting text always comes from the catalog. If the AI endpoint is unavailable, discovery automatically falls back to deterministic keyword matching.

## Deploy

Recommended host: Vercel.

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in Vercel Environment Variables.
- Redeploy after adding the environment variable. `vercel.json` bundles the checked-in catalog with the recommendation function.

## Catalog, requirements, and prior credit

The planner and progression use a checked-in FireRoad snapshot in `public/data/`:
7,182 subjects and 162 requirement trees imported on September 19, 2026. This is
all records returned by the source, including graduate and special subjects, not
a guarantee that every record is offered this semester. Empty source titles are
shown as “Title unavailable in source.” Refresh the snapshot with Python 3 and curl:

```bash
python3 scripts/import_catalog.py
```

The importer validates unique subject IDs and downloads every requirement tree
before writing data. Import provenance and counts are in `public/data/manifest.json`.
See [FireRoad's requirement format](https://fireroad.mit.edu/reference/requirements).

- Major/minor labels include Course number, name, and program variant.
- Check subjects in the requirements panel or term cards to mark them completed.
- Prior credit accepts credited MIT subjects and distinguishes passed ASEs from
  AP/IB/transfer credit. Removing credit does not erase a separate completion mark.
- Completed progress uses checked subjects plus credit; projected progress also
  includes the plan. Duplicate subjects count once.
- Percentages are local planning estimates, not degree audits. All/any groups,
  explicit subjects, GIR attributes, and GTE subject/unit/distinct thresholds are
  evaluated. All-groups average child progress, any-groups use the best option,
  and thresholds count distinct matched subjects or their units. Free-form electives, missing/legacy subjects, and unsupported
  constraints remain flagged for review. Whole-degree GIRs are only included when
  present in the selected program's source tree.
- Progression groups prerequisite references by major/department. Expand a branch
  to reveal every matching subject; select a subject to continue. GIR prerequisite
  references are included. Corequisites remain separate, and graph edges do not
  assert eligibility or replace the original prerequisite rule.
- State persists in this browser. Existing saved plans and completions are retained.
- Local development does not require serverless API routes for planning, progress,
  graphs, or keyword discovery. AI discovery still uses the deployed server API.
