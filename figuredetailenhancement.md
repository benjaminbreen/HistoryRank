# Figure Detail Enhancement Plan

Status: Ongoing
Owner: Benjamin Breen + Codex
Last updated: 2026-02-07

## Scope

Build a richer figure detail experience with three tabs:

- `Overview` (existing core details)
- `Research` (primary/secondary sources, historical encyclopedia snippets, quotes)
- `Timeline` (LLM evidence-grounded assessment + structured events for timeline/map)

## Product Constraints (locked)

- Language: English only (for now)
- Primary sources: prioritize 2-3 key authored works/speeches where possible
- Preferred source ecosystems: Wikisource, Internet Archive, Project Gutenberg
- Quote policy: show unverified quotes with a short warning
- Public-domain policy: outbound links first; in-app source browser optional future phase
- Pipeline cadence: manual runs
- LLM assessment cadence: on demand
- Moderation: lightweight review queue for low-confidence/auto-ingested items
- Timeline visualization: start with D3 2D timeline/map first; optional 3D globe later

## High-Level Milestones

### Phase 0 - Planning + Schema Scaffold

- [x] Define product constraints and phased architecture
- [x] Create this tracking document
- [x] Add SQLite migration for evidence tables
- [x] Add starter ingestion script for source candidate collection
- [x] Add starter importer script for approved source candidates

### Phase 1 - Data Layer (SQLite first)

- [x] Create tables:
- `figure_research_sources`
- `figure_quotes`
- `figure_historical_snippets`
- `figure_assessments`
- `figure_timeline_events`
- [x] Add indexes + updated-at trigger
- [x] Add `data_quality`/`curation_status` conventions
- [x] Add migration runbook (`research:migrate`) to deployment checklist

### Phase 2 - Ingestion Pipelines (manual)

- [x] `collect-primary-sources` script (Wikisource/Gutenberg/Internet Archive candidate gathering)
- [x] `import-primary-sources` script (persist approved candidates)
- [x] Expand source collection to secondary/reference pipelines:
- OpenAlex (secondary scholarship leads)
- Crossref (secondary DOI/metadata leads)
- Open Library (reference catalog leads)
- Library of Congress (reference catalog leads)
- [ ] `fetch-historical-snippets` script (start with Britannica public-domain corpus)
- [x] `fetch-historical-snippets` script (start with Britannica public-domain corpus)
- [ ] `collect-quotes` script (source + verification metadata)

### Phase 3 - UI Tabs

- [x] Add tab shell in `FigureDetailPanel` (`Overview`, `Research`, `Timeline`)
- [x] Move current metrics/summary into `Overview` with minimal regression
- [x] Build `Research` tab cards for:
- source links
- historical snippets
- quote cards + warning badges
- [ ] Build `Timeline` tab (partial: narrative + event list complete; map pending):
- narrative assessment block
- event timeline list
- interactive life-span timeline with event markers + tooltips
- map for extracted event locations

### Phase 4 - LLM Synthesis + Event Extraction

- [ ] Prompt template for evidence-grounded assessment
- [ ] Prompt template for timeline event/location extraction JSON
- [ ] Citation enforcement:
- output references must map to stored source IDs
- reject/regenerate uncited claims
- [ ] On-demand generation endpoint/script

Status update:
- Added `research:timeline` script for on-demand timeline assessment + event extraction (draft/published modes).
- Added `research:timeline:batch` for resumable top-N generation.
- Timeline event ingestion now preserves prior assessment event rows (non-destructive versioning) and stores real source IDs for per-event source cards.
- Hybrid source resolver now applies a simple balanced selection pass (role/corpus diversity) and captures Gutenberg summary snippets when available.

### Phase 5 - Editorial + QA

- [ ] Add low-confidence review queue
- [ ] Add source provenance labels in UI
- [ ] Add smoke tests + validation scripts for malformed evidence/JSON

## Data Model Notes (target)

Core tables should support:

- per-figure source records with type, corpus, URL, confidence, curation status
- quotes with verification status and warning text
- historical snippets from specific editions/corpora
- LLM assessments with prompt version, model, citations, and trigger metadata
- normalized timeline events with optional lat/lon and source linkage

## Immediate Next Tasks

1. [x] Improve source candidate recall/ranking (added multi-query lookup + seed fallback).
2. [x] Add optional figure-name aliases to source collection queries (`--aliases`).
3. [x] Start UI tab scaffold in `FigureDetailPanel` (no visual overhaul yet).
4. [x] Add `research:snippets` prototype for Britannica/Gutenberg historical snippets.
5. [x] Add `research:snippets:index` builder + alias-based matching for Britannica 1911.
6. [x] Extend `research:sources` to collect `primary,secondary,reference` roles (`--roles` flag).
7. [x] Extend `research:import` to ingest `.research-sources.json` and preserve provider metadata.
8. [x] Group Research tab source leads by role with provider-aware labels.
9. [x] Add hybrid source pipeline (`research:sources:hybrid`): Gemini 2.5 Flash-Lite title suggestions + deterministic URL resolver + optional `--publish`.

## Risks to Watch

- Source quality drift from auto-ingested links
- Quote attribution ambiguity
- LLM hallucination in synthesis (must enforce citation-backed outputs)
- UI overcrowding in detail panel (tab separation must remain strict)

## Definition of Done (v1)

- `FigureDetailPanel` has working tabs with no regressions in `Overview`.
- `Research` tab shows at least one high-quality source set for pilot figures.
- `Timeline` tab renders at least one generated assessment + structured events.
- All LLM narrative claims in Timeline are backed by stored evidence references.
