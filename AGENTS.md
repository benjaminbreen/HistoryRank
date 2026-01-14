# HistoryRank

## Project overview
HistoryRank builds a public, data-driven ranking of historical figures. It combines:
- LLM-generated rankings (multiple models, multiple samples)
- MIT Pantheon (HPI) data
- Wikipedia pageviews and metadata

## IMPORTANT: Vercel deploy step
Before deploying to Vercel, run `npm run prepare:db` and commit the updated
`historyrank.db`. This disables SQLite WAL mode and removes `-wal`/`-shm` so
Vercel can open the database file at runtime.

The goals are:
- Create a free, public history learning resource.
- Benchmark how different LLMs assess historical importance.
- Compare model output across languages (e.g., English vs. French prompts).

## Project owner
Benjamin Breen (UCSC), author of *Res Obscura*.

## Core LLM prompt (use exactly, unchanged)
Role: You are a senior historian and data scientist specializing in "Historiometry"—the statistical analysis of historical data. Task: Generate a ranked list of the 1,000 most influential figures in world history. Ranking Criteria: "Importance" must be calculated based on the following three metrics: Breadth: The geographic extent of their influence (Global vs. Regional). Depth: The degree to which they fundamentally altered human behavior, thought, or the state of the world. Longevity: The duration of their impact across centuries. Strict Constraints to Prevent Clustering: No Categorical Grouping: Do not group figures by profession, era, or nationality. This is a singular, linear competition of impact. For example, if rank #450 is a scientist and #451 is a poet, it must be because the scientist’s total score marginally exceeds the poet’s, not because you are listing "famous scientists" and then "famous poets." Linear Degradation: The list must represent a true descending order of influence. Rank #1 must be demonstrably more influential than #100, and #500 more than #1000. Global Balance: Ensure the list reflects major figures based on what you determine to be their objective historical weight, not just fame in one culture or region. Output Format: Provide the data in a raw JSON array of objects. Each object must contain: {"rank": integer, "name": "string", "primary_contribution": "string"} Technical Instruction: Do not include introductory or concluding conversational text—output the JSON block only. output the FULL list with no duplicates.

## Data and pipeline notes
- LLM lists are stored in `data/raw/` and normalized to JSON arrays before import.
- `npm run import:llm` imports all LLM lists and recalculates consensus ranks.
- Consensus ranks are recalculated via `scripts/recalculate-consensus.cjs` (single source of truth).
- `data/figure-overrides.json` is the master file for merges, renames, aliases, and Wikipedia slug mappings.
- `name_aliases` table has 5000+ aliases for name matching during import.
- Thumbnails are cached locally in `public/thumbnails/{figureId}.jpg|png|webp`.

## Consensus ranking formula
Missing model rankings are treated as rank **1001** (i.e., below the top-1000 cutoff).
Consensus is the mean of all model ranks after padding missing entries with 1001.

Example: Morton ranked 37 and 59 by 2 models out of 5:
- Padded list: [37, 59, 1001, 1001, 1001]
- Mean: **619.8**

This formula is implemented in `scripts/recalculate-consensus.cjs` (single source of truth).

## Key scripts (common workflow)
| Command | Description |
|---------|-------------|
| `npm run import:llm` | Import LLM lists + recalculate consensus + download thumbnails |
| `npm run enrich` | Auto-create figures from unmatched candidates via Wikipedia/Wikidata |
| `npm run enrich:dry` | Preview enrichment without changes |
| `npm run reconcile` | Apply merges, renames, fetch Wikipedia data, enrich missing fields |
| `npm run reconcile --dry-run` | Preview changes without applying |
| `npm run thumbnails` | Download missing thumbnails |
| `npm run thumbnails:check` | List figures missing thumbnails |
| `node scripts/recalculate-consensus.cjs` | Recompute consensus after manual DB edits |
| `npm run prepare:db` | Normalize `historyrank.db` for Vercel (disable WAL + remove `-wal`/`-shm`) |

## Adding new LLM lists (full workflow)
```bash
# 1. Add list files to data/raw/ with pattern: "MODEL NAME LIST N (Date).txt"
# 2. Import and match against existing figures (fast, local)
npm run import:llm

# 3. Auto-create new figures from unmatched candidates (network, batch)
npm run enrich

# That's it! New figures get:
# - Birth/death years from Wikidata
# - Birthplace with lat/lon coordinates
# - Occupation and domain classification
# - Era and region (derived from birth year and coordinates)
# - Wikipedia extract and thumbnail
# - All rankings from LLM files
```

### Enrichment options
| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without creating figures |
| `--limit=N` | Process only N candidates |
| `--min-sources=N` | Only candidates appearing in N+ different models |

### How enrichment works
1. Reads `data/unmatched/*.txt` files to build candidate list
2. For each candidate, searches Wikipedia → gets Wikidata QID
3. Fetches structured data from Wikidata (P569 birth, P570 death, P19 birthplace, P106 occupation)
4. Scores confidence based on: title match, is-human check, biographical data
5. Auto-creates figures with HIGH confidence, or MEDIUM confidence + multiple sources
6. Downloads thumbnails and imports rankings from LLM files
7. Recalculates consensus rankings

## Fixing data issues

### Merging duplicates
Add to `data/figure-overrides.json`:
```json
"merges": {
  "keep-id": ["delete-id-1", "delete-id-2"]
}
```

### Adding Wikipedia data for missing figures
Add to `data/figure-overrides.json`:
```json
"updates": {
  "figure-id": {
    "wikipedia_slug": "Wikipedia_Article_Name"
  }
}
```
Then run `npm run reconcile` - it will fetch birth/death years, era, domain, pageviews, and thumbnail.

### Compound names (e.g., "Watson and Crick")
Add to `data/figure-overrides.json`:
```json
"compound_names": {
  "watson and crick": ["james-watson", "francis-crick"]
}
```
Both figures will receive the ranking when this name appears in an LLM list.

## Database schema (key tables)
- `figures` - Canonical historical figures with metadata
- `rankings` - Individual rankings from each LLM source
- `name_aliases` - Maps normalized name variants to figure IDs

## Tech stack
- Next.js 16 + React 19 + Tailwind v4
- SQLite via better-sqlite3 + Drizzle ORM
- D3 for visualizations

---

# Architecture Reference

## Directory structure
```
historyrank/
├── data/
│   ├── raw/                    # LLM output files (*.txt with JSON arrays)
│   ├── unmatched/              # Names that couldn't be matched during import
│   └── figure-overrides.json   # Master file for fixes (merges, renames, aliases)
├── public/
│   └── thumbnails/             # Cached figure images ({id}.jpg|png|webp)
├── scripts/                    # CLI tools for data management
├── src/
│   ├── app/                    # Next.js pages and API routes
│   ├── components/             # React components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Shared utilities and DB
│   └── types/                  # TypeScript types
└── historyrank.db              # SQLite database
```

## Deployment note (important)
SQLite WAL mode is used locally for performance, but Vercel only ships the main
`historyrank.db` file. Before deploying, run:

```bash
npm run prepare:db
```

This checkpoints WAL, switches to DELETE journal mode, and removes `-wal`/`-shm`.

## Data flow
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  LLM Output     │────▶│  import-data.ts  │────▶│   SQLite DB     │
│  (data/raw/)    │     │  + name matching │     │  (figures,      │
└─────────────────┘     └──────────────────┘     │   rankings,     │
                                │                │   name_aliases) │
                                ▼                └────────┬────────┘
                        ┌──────────────────┐              │
                        │ recalculate-     │◀─────────────┘
                        │ consensus.cjs    │
                        └──────────────────┘
                                │
                                ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │  API Routes      │────▶│  React UI       │
                        │  (/api/figures)  │     │  (page.tsx)     │
                        └──────────────────┘     └─────────────────┘
```

## API routes
| Route | Purpose |
|-------|---------|
| `GET /api/figures` | Paginated list with filters, sorting |
| `GET /api/figures/[id]` | Single figure with all rankings |
| `GET /api/scatter` | All figures for scatter plot (cached 5 min) |
| `GET /api/wikipedia/[slug]` | Proxy to Wikipedia API for thumbnails/extracts |

## Component organization
```
components/
├── ui/              # Reusable primitives (Button, Table, Dialog, etc.)
├── rankings/        # Table view components
│   ├── RankingsTable.tsx      # Main table with memoized rows
│   ├── RankingsFilters.tsx    # Domain/era/search filters
│   ├── FigureThumbnail.tsx    # Thumbnail with local-first loading
│   └── VarianceBadge.tsx      # Controversy indicator
├── detail/          # Figure detail panel
│   ├── FigureDetailPanel.tsx  # Slide-out panel with Wikipedia data
│   └── BirthplaceGlobe.tsx    # D3 globe visualization
└── viz/             # Scatter plot components
    ├── ScatterPlotChart.tsx   # D3 scatter visualization
    ├── ScatterPlotControls.tsx
    └── ScatterPlotLegend.tsx
```

## Database tables
| Table | Purpose | Key columns |
|-------|---------|-------------|
| `figures` | Canonical historical figures | id, canonical_name, birth_year, era, domain, wikipedia_slug, llm_consensus_rank, variance_score, pageviews_2025 |
| `rankings` | Individual LLM rankings | figure_id, source, sample_id, rank, raw_name |
| `name_aliases` | Name → figure_id mapping | alias (normalized), figure_id |
| `import_logs` | Import history | source, sample_id, record_count, unmatched_count |

---

# Scripts reference

## Primary scripts (use these)
| Script | Purpose |
|--------|---------|
| `scripts/import-data.ts` | Import LLM lists, match names to figures |
| `scripts/reconcile.ts` | Apply fixes, enrich data, download thumbnails |
| `scripts/recalculate-consensus.cjs` | Recompute weighted consensus ranks |
| `scripts/download-thumbnails.ts` | Download missing Wikipedia thumbnails |
| `scripts/seed-aliases.ts` | Populate name_aliases from knownAliases array |

## Deprecated/redundant (candidates for removal)
| Script | Replaced by |
|--------|-------------|
| `download-thumbnails.cjs` | `download-thumbnails.ts` |
| `merge-manual-duplicates.cjs` | `reconcile.ts` merges |
| `merge-safe-duplicates.cjs` | `reconcile.ts` merges |
| `enrich-figures.cjs` | `reconcile.ts --enrich` |

---

# Known tech debt & refactoring opportunities

## Large files to break up
| File | Lines | Suggested refactor |
|------|-------|-------------------|
| `scripts/reconcile.ts` | 794 | Extract into modules: `lib/reconcile/{merges,enrichment,thumbnails,aliases}.ts` |
| `scripts/import-data.ts` | 609 | Extract: `lib/import/{parser,matcher,llm-import}.ts` |
| `src/app/page.tsx` | 531 | Extract filter state to custom hook, split header into component |
| `FigureDetailPanel.tsx` | 519 | Extract tabs into separate components |

## Mixed script languages
Currently have both `.ts` and `.cjs` scripts. Standardize on TypeScript:
- Convert remaining `.cjs` to `.ts`
- Use `tsx` runner consistently

## Duplicate logic
- `download-thumbnails.cjs` and `download-thumbnails.ts` - delete the .cjs version
- Multiple merge scripts - consolidate into `reconcile.ts`
- Wikipedia fetching logic in multiple places - extract to `lib/wikipedia.ts`

## Suggested new modules
```
src/lib/
├── wikipedia/
│   ├── api.ts           # fetchSummary, fetchPageviews
│   └── parser.ts        # extractBirthYear, inferDomain
├── reconcile/
│   ├── merges.ts
│   ├── enrichment.ts
│   └── thumbnails.ts
└── import/
    ├── parser.ts        # parseLLMFile
    ├── matcher.ts       # findFigureIds, fuzzy matching
    └── index.ts
```

---

# Coding conventions

## Naming
- **Figure IDs**: lowercase-kebab-case from canonical name (`isaac-newton`)
- **Aliases**: normalized lowercase, no punctuation (`isaac newton`)
- **Wikipedia slugs**: exact Wikipedia article name with underscores (`Isaac_Newton`)

## Adding new LLM sources
1. Save output as `data/raw/MODEL NAME LIST N (Date).txt`
2. Run `npm run import:llm`
3. Check `data/unmatched/` for failed matches
4. Add missing aliases to `data/figure-overrides.json`
5. Run `npm run reconcile`

## Database changes
- Schema in `src/lib/db/schema.ts`
- Run `npm run db:push` after schema changes
- Always recalculate consensus after manual DB edits: `node scripts/recalculate-consensus.cjs`

## Performance considerations
- FigureThumbnail uses local-first loading (no API calls if thumbnail exists)
- RankingsTable rows are memoized to prevent re-renders
- API routes have cache headers for CDN caching
- Scatter API uses ISR (5 min revalidation)
