# HistoryRank

## Ongoing Work (2026-02-06)
- Figure detail enhancement initiative is in progress.
- Tracking doc: `figuredetailenhancement.md`
- Current focus: SQLite schema migration + manual ingestion pipeline scaffold + tabbed detail panel rollout.
- New progress: `/api/figures/[id]/evidence` endpoint, detail tabs wired, and pilot primary-source ingestion for Henry James + Abraham Lincoln.

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

## Experimental V2 prompt + workflow (do not mix with existing lists)
Purpose: generate a new set of LLM lists using a stricter, more reliable methodology (candidate-pool + merge) for comparison with the v1 lists. Keep v1 consensus unchanged.

Workflow:
1) Run `node --import tsx scripts/generate-openrouter-list-v2.ts --model <model>` to produce V2 lists.
2) Output goes to `data/raw_v2/` with filename pattern: `MODEL NAME V2 LIST N (Date).txt`.
3) V2 lists are *not* imported into the main DB by default. Comparison is done offline or in a future parallel DB.

Key idea: generate multiple candidate pools (chunked), forbid repeats across chunks, then merge + rank by rubric scores. This reduces local-minima collapse without forcing quotas.

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
| `npx tsx scripts/assess-all-lists.ts` | Batch quality assessment of all lists |

## List Quality Assessment

Generated lists are automatically assessed for quality issues. The assessment runs after each list generation and produces a quality report alongside the list file.

### Quality Metrics

| Metric | Description | Thresholds |
|--------|-------------|------------|
| **Repetition** | Exact and fuzzy duplicate names | FAIL: >50 exact; WARN: >15 exact |
| **Pattern Collapse** | Consecutive similar entries (e.g., "Lithuanian basketball player" × 20) | FAIL: >30 consecutive; WARN: >18 |
| **Structural** | Valid JSON, 1000 entries, sequential ranks | FAIL: <900 entries or invalid structure |
| **Anchor Coverage** | Presence of expected figures (Jesus, Newton, etc.) | FAIL: <70% coverage; WARN: <90% |

### Model Quality Score

The batch assessment calculates a quality score (0-100) for each model:
- Starts at 100
- Penalizes duplicates: -0.5 per duplicate (max -40)
- Penalizes pattern collapse: -2 per sequence length (max -40)
- Penalizes missing anchors: up to -20

**Score interpretation:**
- 🟢 80+ = High quality, suitable for consensus
- 🟡 50-79 = Acceptable, minor issues
- 🔴 <50 = Low quality, consider excluding

### Output Files

For each list `Model LIST N (Date).txt`, the generator creates:
- `Model LIST N (Date).quality.json` - Full assessment report with all metrics
- `Model LIST N (Date).quality.txt` - Human-readable report summary

### Batch Assessment

To re-assess all existing lists:

```bash
# Assess all lists, use cached reports where available
npx tsx scripts/assess-all-lists.ts

# Force re-assessment of all lists
npx tsx scripts/assess-all-lists.ts --rerun

# Show only failing lists
npx tsx scripts/assess-all-lists.ts --failing-only
```

Outputs summary files to `data/quality-reports/`:
- `summary.csv` - Spreadsheet-friendly summary
- `summary.md` - Markdown report with recommendations

### Model Exclusion Criteria

Models are excluded from consensus rankings if they consistently fail quality checks:
- **GLM 4.7**: Excluded due to pattern collapse (local minima generating irrelevant sequences)
- **Qwen 3**: Excluded due to repetition (same figures appearing 6-7 times)
- **Claude Haiku / GPT-5.2 Mini**: Never included due to category cycling and duplicate padding

The quality assessment system makes these decisions transparent and reproducible.

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
| `scripts/generate-openrouter-list.ts` | Generate new LLM list via OpenRouter API (auto-assesses quality) |
| `scripts/assess-all-lists.ts` | Batch quality assessment of all lists in data/raw/ |
| `scripts/lib/assess-list-quality.ts` | Core quality assessment module (shared library) |

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

# Future work ideas (not implemented)
- **Embedding map visualization**: add a page that projects figure embeddings into 2D/3D (UMAP/t‑SNE/PCA) and renders each figure as a thumbnail node.
- **Interpretable axes**: allow users to choose semantic “probe” axes (e.g., `scientist ↔ artist`, `war ↔ peace`, `religion ↔ secular`) by embedding anchor terms and projecting figures onto those axes.
- **Cluster labeling**: optional post‑hoc cluster summaries (e.g., top nearest words or LLM summary of cluster members) with explicit “interpretive” labeling in UI.

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

---

# HistoryBench: Benchmark System for LLM Historical Reasoning

## What This Is

HistoryBench evaluates how well LLMs reason about historical influence when asked to rank the most important figures in history. It assesses both the quality of their ranked lists and the quality of their rationale text.

The system lives in `scripts/benchmark/` and outputs to `data/derived/historybench-*.json`. Results are displayed at `/experiments` in the web app.

## Current State (v0.1 — Trial Run)

Single-judge (Claude Opus 4.6), small sample (64 descriptions, 13 models), unblinded. Useful as a proof of concept but not defensible as a benchmark. The main value so far is identifying the evaluation dimensions and failure modes.

## Architecture: Three Layers

### Layer 1: Objective Metrics (No Judge Needed)

These are computed directly from the database and require no subjective evaluation. They form the defensible foundation of the benchmark.

**Self-consistency.** Each model produced 3-10 independent ranking lists. Compute Spearman rank correlation between all pairs of a model's own lists. A model that ranks Newton #3 on one run and #47 on another is less reliable than one that places him top-10 consistently. This yields a per-model reliability score.

- Source: `rankings` table, group by `source` and `sample_id`
- Metric: mean pairwise Spearman rho across a model's own lists
- Script: `scripts/benchmark/compute-consistency.cjs` (to build)

**Temporal calibration.** What percentage of a model's top-100 are living people? Born after 1900? After 1950? Compute the median birth year of the top 100. This is a measurable proxy for recency bias.

- Source: `rankings` joined with `figures` on birth_year/death_year
- Metrics: % living in top-100, % born after 1900, median birth year of top-100
- Script: `scripts/benchmark/compute-temporal.cjs` (to build)

**Description substantiveness.** Measurable text characteristics that correlate with reasoning quality:
- Average description length per model
- % of descriptions under 20 characters (keyword-only)
- % of descriptions containing causal language (because, enabling, leading to, resulting in, catalyzing, transforming, establishing)
- % of descriptions that are title-cased labels vs. actual sentences

- Source: `rankings` table, `contribution` column
- Script: `scripts/benchmark/compute-substantiveness.cjs` (to build)

**Hallucination rate.** For each description, have a verification model check whether the specific claims match the figure. This can be automated: extract the figure name and description, ask a separate model "Is this description factually accurate for this person? Answer YES or NO with a brief explanation if NO."

- Source: sampled descriptions
- Script: `scripts/benchmark/verify-facts.cjs` (to build)
- Requires: API calls to a verification model

### Layer 2: Blinded Multi-Judge Evaluation

This layer adds subjective quality assessment but does it properly.

**Blinding.** Strip model identifiers from all samples before scoring. The judge sees "Model A ranked Galileo at #25 with this description" — never the model name. This is the single most important methodological requirement.

**Multiple judges.** Run 3-5 different LLMs as judges using the same criteria set. Compute inter-rater reliability (Krippendorff's alpha or Cohen's kappa). If judges disagree on a dimension, that dimension gets weighted less in the final score.

**Anchor examples.** Before scoring, show each judge 3-4 calibration examples at different quality levels with pre-assigned scores. This reduces drift between judges and sessions.

**Sample size.** 20-30 descriptions per model across rank tiers. With 13 models that's ~300 descriptions — feasible for LLM judges.

**Ranking quality via pairwise tests.** Instead of holistic list scoring, present judges with specific pairs: "Model X ranked Figure A at #15 and Figure B at #85. Is this ordering defensible?" Binary yes/no aggregated across many pairs is more reliable than 1-5 holistic scales. Sample pairs where models disagree most.

### Layer 3: Human Calibration (Optional)

Have 2-3 historians score a 50-description subset. Compare LLM judge scores to human scores. If LLM judges systematically disagree with historians, adjust the weighting or flag the discrepancy. This layer is expensive but provides ground truth for validating the LLM judges.

## Evaluation Criteria

Two criteria set options. Both avoid prescriptive biases.

### Option A: Structured Rubric (5 dimensions, 1-5 each)

1. **Defensibility of Ordering** — Could a historian defend each top-50 placement by connecting the figure to specific, lasting downstream consequences? Weak rankings rely on fame or symbolic importance rather than measurable civilizational impact.

2. **Temporal Calibration** — Does the list appropriately weight the difference between demonstrated long-term influence and projected future importance? Recent figures can appear, but their placement should reflect demonstrated impact, not current prominence.

3. **Analytical Depth of Rationale** — Do descriptions explain WHY a figure matters, or merely STATE THAT they matter? Strong rationale identifies specific mechanisms: what changed, for whom, through what channel, with what durability.

4. **Factual Reliability** — Are specific claims correct? A single clear hallucination (describing the wrong person, inventing facts) caps this at 2 for the affected entry.

5. **Coherence of Framework** — Does the list apply a consistent theory of "historical influence" evenly across entries? A list can prioritize political, intellectual, or technological impact, but should apply its lens consistently.

### Option B: Principles-Based Guide (single holistic 1-5 score)

Core principle: **Influence is structural, not reputational.** Historical importance is determined by lasting downstream consequences, not current name recognition.

- Temporal durability matters. A figure whose influence is 25 years old and speculative has a weaker claim than one whose influence has been structurally present for centuries.
- Mechanisms over labels. A strong rationale identifies how influence propagated, not just that it existed.
- Consistency over correctness. A list with a clear, consistently applied framework is better than one that shifts criteria opportunistically.
- Surprising placements that can be defended are BETTER than safe consensus reproductions.

### What NOT to Penalize

Both criteria sets explicitly prohibit:
- Imposing demographic or geographic requirements on the list
- Penalizing for lack of "representation" of any region, gender, or occupation
- Rewarding or punishing inclusion of any specific individual
- Treating surprising or unconventional placements as inherently wrong

Historical influence was not evenly distributed. A list skewed toward one region or time period is not inherently flawed — it may be an accurate reflection of where civilizational-scale influence actually originated. The benchmark evaluates reasoning quality, not ideological conformity.

### What IS a Failure Mode

- **Recency/popularity bias.** Ranking figures based on current fame rather than demonstrated long-term influence. Clearest signal: living people in the top 100 whose lasting impact is speculative.
- **Template/quota construction.** Lists that fill category slots ("need a musician, need a scientist") rather than reasoning from first principles about who actually changed the most.
- **Hallucination.** Describing the wrong person or inventing factual claims.
- **Keyword-only descriptions.** Single words or title-cased labels that demonstrate no reasoning.

## Output Schema

The final per-model scorecard combines objective and judged metrics:

| Metric | Type | Source |
|--------|------|--------|
| Self-consistency (Spearman rho) | Objective | Cross-list correlation |
| Temporal skew (median birth year, % living in top-100) | Objective | Database query |
| Description substantiveness (avg length, % keyword-only) | Objective | String analysis |
| Hallucination rate | Semi-automated | Verification model |
| Description reasoning quality | Judged | Blinded multi-judge mean |
| Pairwise defensibility rate | Judged | Blinded multi-judge mean |
| Inter-judge agreement | Meta | Krippendorff's alpha |

## HistoryBench File Map

```
scripts/benchmark/
  extract-samples.cjs        # Stratified sample extraction (BUILT)
  aggregate-results.cjs       # Score aggregation and reporting (BUILT)
  compute-consistency.cjs     # Layer 1: self-consistency (TO BUILD)
  compute-temporal.cjs        # Layer 1: temporal calibration (TO BUILD)
  compute-substantiveness.cjs # Layer 1: description metrics (TO BUILD)
  verify-facts.cjs            # Layer 1: hallucination detection (TO BUILD)
  blind-and-score.cjs         # Layer 2: blinded multi-judge eval (TO BUILD)

data/derived/
  historybench-samples.json   # 64 stratified description samples (BUILT)
  historybench-scores.json    # Per-description scores with notes (BUILT)
  historybench-ranking-quality.json # Per-model ranking assessments (BUILT)
  historybench-results.json   # Aggregated holistic results (BUILT)

src/app/experiments/
  page.tsx                    # Web UI for results (BUILT)
```

## v0.1 Trial Run Findings (for reference)

1. **Recency bias is the #1 failure mode.** Models that rank Tim Cook, Serena Williams, or Beyonce in the top 100 are conflating fame with civilizational impact.
2. **Description length correlates with quality (r=0.79).** Keyword-only models (Sonnet 4.5, GLM 4.7, Qwen3) scored lowest.
3. **One hallucination detected.** Mistral-Large-3 described Jackie Chan as a "theorist who advanced carceral capitalism."
4. **Template contamination.** GPT-5.3-thinking reused identical generic descriptions across unrelated mid-range figures.
5. **The most historically literate lists** prioritize institutional/systemic impact over fame and include figures like Ashoka, Hammurabi, and Constantine that most models underrank.

These findings should be validated by the full multi-judge system before being treated as conclusions.
