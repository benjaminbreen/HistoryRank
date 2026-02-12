import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// Canonical historical figures - the "master" list
export const figures = sqliteTable('figures', {
  id: text('id').primaryKey(), // slug: "isaac-newton"
  canonicalName: text('canonical_name').notNull(),

  // Basic info
  birthYear: integer('birth_year'),
  deathYear: integer('death_year'),
  domain: text('domain'), // "Science", "Religion", "Politics", "Arts", "Military"
  occupation: text('occupation'), // More specific: "Physicist", "Philosopher"
  era: text('era'), // "Ancient", "Classical", "Late Antiquity", "Medieval", "Early Modern", "Industrial", "Modern", "Contemporary"
  regionMacro: text('region_macro'),
  regionSub: text('region_sub'),
  birthPolity: text('birth_polity'),
  birthPlace: text('birth_place'),
  birthLat: real('birth_lat'),
  birthLon: real('birth_lon'),

  // Wikipedia/Wikidata data
  wikipediaSlug: text('wikipedia_slug'),
  wikipediaExtract: text('wikipedia_extract'),
  wikidataQid: text('wikidata_qid'), // Q12345 - for provenance/re-enrichment
  sourceConfidence: text('source_confidence'), // 'high' | 'medium' | 'manual' | 'pantheon'
  pageviews2024: integer('pageviews_2024'),
  pageviews2025: integer('pageviews_2025'),
  pageviewsByLanguage: text('pageviews_by_language'), // JSON: { en: 100000, de: 50000, ... }
  pageviewsGlobal: integer('pageviews_global'), // Sum of top 10 languages

  // Pantheon data
  hpiRank: integer('hpi_rank'),
  hpiScore: real('hpi_score'),

  // Computed consensus (updated after imports)
  llmConsensusRank: real('llm_consensus_rank'),
  varianceScore: real('variance_score'), // 0-1, higher = more controversial

  // Google Ngrams data (book mention frequency 1920-2019, sampled every 2 years)
  ngramData: text('ngram_data'), // JSON: { years: [1920, 1922, ...], values: [0.0001, 0.0002, ...] }
  ngramAvg: real('ngram_avg'), // Average frequency across all years
  ngramPercentile: integer('ngram_percentile'), // 0-100, percentile rank among all figures

  // Related figures (LLM-generated connections)
  relatedFigures: text('related_figures'), // JSON: [{ id: "plato", name: "Plato", relationship: "teacher" }, ...]

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('domain_idx').on(table.domain),
  index('era_idx').on(table.era),
  index('consensus_idx').on(table.llmConsensusRank),
  index('variance_idx').on(table.varianceScore),
  index('hpi_idx').on(table.hpiRank),
]);

// Individual rankings from each source
export const rankings = sqliteTable('rankings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  figureId: text('figure_id').notNull().references(() => figures.id),

  source: text('source').notNull(), // "claude-sonnet-4.5", "gemini-flash-3", "pantheon"
  sampleId: text('sample_id'), // "list-1", "list-2" for multiple samples

  rank: integer('rank').notNull(),
  contribution: text('contribution'), // Primary contribution text from LLM

  rawName: text('raw_name').notNull(), // Original name from source

  importedAt: integer('imported_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('figure_source_idx').on(table.figureId, table.source),
  index('source_rank_idx').on(table.source, table.rank),
]);

// Name aliases for reconciliation
export const nameAliases = sqliteTable('name_aliases', {
  alias: text('alias').primaryKey(), // normalized: "gautama buddha"
  figureId: text('figure_id').notNull().references(() => figures.id),
});

// Import log for tracking
export const importLogs = sqliteTable('import_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  sampleId: text('sample_id'),
  filename: text('filename'),
  recordCount: integer('record_count'),
  unmatchedCount: integer('unmatched_count'),
  importedAt: integer('imported_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const llmCandidates = sqliteTable('llm_candidates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  normalizedName: text('normalized_name').notNull(),
  displayName: text('display_name').notNull(),
  sources: text('sources').notNull(), // JSON array string
  sampleCount: integer('sample_count').notNull(),
  avgRank: real('avg_rank'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Research sources and evidence for enhanced detail panel
export const figureResearchSources = sqliteTable('figure_research_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  figureId: text('figure_id').notNull().references(() => figures.id),
  sourceRole: text('source_role').notNull(), // 'primary' | 'secondary' | 'reference'
  sourceCorpus: text('source_corpus').notNull(), // 'wikisource' | 'project_gutenberg' | 'internet_archive' | ...
  sourceKind: text('source_kind').notNull().default('text'), // 'text' | 'speech' | 'letter' | 'book' | ...
  title: text('title').notNull(),
  author: text('author'),
  publicationYear: integer('publication_year'),
  sourceUrl: text('source_url').notNull(),
  accessUrl: text('access_url'),
  snippet: text('snippet'),
  isPublicDomain: integer('is_public_domain', { mode: 'boolean' }).notNull().default(true),
  confidence: real('confidence').notNull().default(0.5),
  curationStatus: text('curation_status').notNull().default('auto'), // 'auto' | 'reviewed' | 'approved' | 'rejected'
  metadata: text('metadata').notNull().default('{}'), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('frs_figure_idx').on(table.figureId),
  index('frs_role_idx').on(table.sourceRole),
  index('frs_status_idx').on(table.curationStatus),
  index('frs_figure_url_idx').on(table.figureId, table.sourceUrl),
]);

export const figureQuotes = sqliteTable('figure_quotes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  figureId: text('figure_id').notNull().references(() => figures.id),
  sourceId: integer('source_id').references(() => figureResearchSources.id),
  quoteText: text('quote_text').notNull(),
  attributedTo: text('attributed_to'),
  quoteYear: integer('quote_year'),
  sourceUrl: text('source_url'),
  verificationStatus: text('verification_status').notNull().default('unverified'), // 'verified' | 'unverified' | 'disputed'
  warningShort: text('warning_short'),
  confidence: real('confidence'),
  curationStatus: text('curation_status').notNull().default('auto'),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('fq_figure_idx').on(table.figureId),
  index('fq_verification_idx').on(table.verificationStatus),
  index('fq_status_idx').on(table.curationStatus),
]);

export const figureHistoricalSnippets = sqliteTable('figure_historical_snippets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  figureId: text('figure_id').notNull().references(() => figures.id),
  corpus: text('corpus').notNull(), // 'britannica_1911' | 'project_gutenberg' | ...
  editionYear: integer('edition_year'),
  sourceTitle: text('source_title'),
  sourceUrl: text('source_url'),
  snippet: text('snippet').notNull(),
  matchScore: real('match_score'),
  curationStatus: text('curation_status').notNull().default('auto'),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('fhs_figure_idx').on(table.figureId),
  index('fhs_corpus_idx').on(table.corpus),
  index('fhs_status_idx').on(table.curationStatus),
]);

export const figureAssessments = sqliteTable('figure_assessments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  figureId: text('figure_id').notNull().references(() => figures.id),
  assessmentKind: text('assessment_kind').notNull(), // 'importance_summary' | 'timeline_events'
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  triggerMode: text('trigger_mode').notNull().default('on_demand'), // 'on_demand' | 'manual'
  inputHash: text('input_hash'),
  assessmentText: text('assessment_text'),
  assessmentJson: text('assessment_json').notNull().default('{}'), // JSON string
  citations: text('citations').notNull().default('[]'), // JSON string of source IDs
  status: text('status').notNull().default('draft'), // 'draft' | 'published' | 'stale'
  generatedAt: integer('generated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('fa_figure_idx').on(table.figureId),
  index('fa_kind_idx').on(table.assessmentKind),
  index('fa_status_idx').on(table.status),
]);

export const figureTimelineEvents = sqliteTable('figure_timeline_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  figureId: text('figure_id').notNull().references(() => figures.id),
  assessmentId: integer('assessment_id').references(() => figureAssessments.id),
  eventLabel: text('event_label').notNull(),
  eventDescription: text('event_description'),
  eventStartYear: integer('event_start_year'),
  eventEndYear: integer('event_end_year'),
  placeLabel: text('place_label'),
  placeLat: real('place_lat'),
  placeLon: real('place_lon'),
  confidence: real('confidence'),
  sourceIds: text('source_ids').notNull().default('[]'), // JSON string of source IDs
  sortIndex: integer('sort_index').notNull().default(0),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('fte_figure_idx').on(table.figureId),
  index('fte_assessment_idx').on(table.assessmentId),
  index('fte_year_idx').on(table.eventStartYear, table.eventEndYear),
]);

export const influenceEdges = sqliteTable('influence_edges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromFigureId: text('from_figure_id').notNull().references(() => figures.id),
  toFigureId: text('to_figure_id').notNull().references(() => figures.id),
  direction: text('direction').notNull(), // 'directed' | 'undirected'
  relationType: text('relation_type').notNull(), // 'influenced' | 'mentored' | 'rival' | 'associated'
  confidence: real('confidence').notNull().default(0),
  evidenceScore: real('evidence_score').notNull().default(0),
  supportCount: integer('support_count').notNull().default(0),
  sourceFamilyCount: integer('source_family_count').notNull().default(0),
  status: text('status').notNull().default('candidate'), // 'candidate' | 'approved' | 'rejected'
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('ie_from_idx').on(table.fromFigureId),
  index('ie_to_idx').on(table.toFigureId),
  index('ie_status_idx').on(table.status),
  index('ie_confidence_idx').on(table.confidence),
]);

export const influenceEdgeEvidence = sqliteTable('influence_edge_evidence', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  edgeId: integer('edge_id').notNull().references(() => influenceEdges.id),
  evidenceKind: text('evidence_kind').notNull(), // 'timeline_ref' | 'source_excerpt' | 'snippet_match' | 'llm_seed'
  sourceTable: text('source_table').notNull(),
  sourceRowId: integer('source_row_id'),
  excerpt: text('excerpt'),
  weight: real('weight').notNull().default(0),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('iee_edge_idx').on(table.edgeId),
  index('iee_kind_idx').on(table.evidenceKind),
]);

// Type exports
export type Figure = typeof figures.$inferSelect;
export type NewFigure = typeof figures.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;
export type NameAlias = typeof nameAliases.$inferSelect;
export type LlmCandidate = typeof llmCandidates.$inferSelect;
export type FigureResearchSource = typeof figureResearchSources.$inferSelect;
export type NewFigureResearchSource = typeof figureResearchSources.$inferInsert;
export type FigureQuote = typeof figureQuotes.$inferSelect;
export type NewFigureQuote = typeof figureQuotes.$inferInsert;
export type FigureHistoricalSnippet = typeof figureHistoricalSnippets.$inferSelect;
export type NewFigureHistoricalSnippet = typeof figureHistoricalSnippets.$inferInsert;
export type FigureAssessment = typeof figureAssessments.$inferSelect;
export type NewFigureAssessment = typeof figureAssessments.$inferInsert;
export type FigureTimelineEvent = typeof figureTimelineEvents.$inferSelect;
export type NewFigureTimelineEvent = typeof figureTimelineEvents.$inferInsert;
export type InfluenceEdge = typeof influenceEdges.$inferSelect;
export type NewInfluenceEdge = typeof influenceEdges.$inferInsert;
export type InfluenceEdgeEvidence = typeof influenceEdgeEvidence.$inferSelect;
export type NewInfluenceEdgeEvidence = typeof influenceEdgeEvidence.$inferInsert;
