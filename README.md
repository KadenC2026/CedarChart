# CedarChart

CedarChart helps MIT students discover interesting courses and understand the prerequisite pathways leading to them.

## What works

- Natural-language course discovery
- AI-backed recommendations with a deterministic keyword fallback
- Interactive course graph
- Course detail panel
- Cross-feature "Show on map" navigation
- Recursive prerequisite pathways
- AND / OR prerequisite groups
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

The browser never receives the API key. If the AI endpoint is unavailable, discovery automatically falls back to deterministic keyword matching.

## Deploy

Recommended host: Vercel.

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in Vercel Environment Variables.
