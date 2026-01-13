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
  era: text('era'), // "Ancient", "Medieval", "Early Modern", "Modern", "Contemporary"

  // Wikipedia data
  wikipediaSlug: text('wikipedia_slug'),
  wikipediaExtract: text('wikipedia_extract'),
  pageviews2024: integer('pageviews_2024'),
  pageviews2025: integer('pageviews_2025'),

  // Pantheon data
  hpiRank: integer('hpi_rank'),
  hpiScore: real('hpi_score'),

  // Computed consensus (updated after imports)
  llmConsensusRank: real('llm_consensus_rank'),
  varianceScore: real('variance_score'), // 0-1, higher = more controversial

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

// Type exports
export type Figure = typeof figures.$inferSelect;
export type NewFigure = typeof figures.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;
export type NameAlias = typeof nameAliases.$inferSelect;
