-- SQLite migration: Figure detail evidence tables

create table if not exists figure_research_sources (
  id integer primary key autoincrement,
  figure_id text not null references figures(id) on delete cascade,
  source_role text not null check (source_role in ('primary', 'secondary', 'reference')),
  source_corpus text not null check (source_corpus in ('wikisource', 'project_gutenberg', 'internet_archive', 'britannica_1911', 'britannica_1902', 'other')),
  source_kind text not null default 'text' check (source_kind in ('text', 'speech', 'letter', 'book', 'article', 'archive_record', 'other')),
  title text not null,
  author text,
  publication_year integer,
  source_url text not null,
  access_url text,
  snippet text,
  is_public_domain integer not null default 1,
  confidence real not null default 0.5,
  curation_status text not null default 'auto' check (curation_status in ('auto', 'reviewed', 'approved', 'rejected')),
  metadata text not null default '{}',
  created_at integer not null default (strftime('%s','now')),
  updated_at integer not null default (strftime('%s','now'))
);

create index if not exists frs_figure_idx on figure_research_sources(figure_id);
create index if not exists frs_role_idx on figure_research_sources(source_role);
create index if not exists frs_status_idx on figure_research_sources(curation_status);
create unique index if not exists frs_figure_url_unique on figure_research_sources(figure_id, source_url);

create table if not exists figure_quotes (
  id integer primary key autoincrement,
  figure_id text not null references figures(id) on delete cascade,
  source_id integer references figure_research_sources(id) on delete set null,
  quote_text text not null,
  attributed_to text,
  quote_year integer,
  source_url text,
  verification_status text not null default 'unverified' check (verification_status in ('verified', 'unverified', 'disputed')),
  warning_short text,
  confidence real,
  curation_status text not null default 'auto' check (curation_status in ('auto', 'reviewed', 'approved', 'rejected')),
  metadata text not null default '{}',
  created_at integer not null default (strftime('%s','now')),
  updated_at integer not null default (strftime('%s','now'))
);

create index if not exists fq_figure_idx on figure_quotes(figure_id);
create index if not exists fq_verification_idx on figure_quotes(verification_status);
create index if not exists fq_status_idx on figure_quotes(curation_status);

create table if not exists figure_historical_snippets (
  id integer primary key autoincrement,
  figure_id text not null references figures(id) on delete cascade,
  corpus text not null check (corpus in ('britannica_1911', 'britannica_1902', 'wikisource', 'project_gutenberg', 'internet_archive', 'other')),
  edition_year integer,
  source_title text,
  source_url text,
  snippet text not null,
  match_score real,
  curation_status text not null default 'auto' check (curation_status in ('auto', 'reviewed', 'approved', 'rejected')),
  metadata text not null default '{}',
  created_at integer not null default (strftime('%s','now')),
  updated_at integer not null default (strftime('%s','now'))
);

create index if not exists fhs_figure_idx on figure_historical_snippets(figure_id);
create index if not exists fhs_corpus_idx on figure_historical_snippets(corpus);
create index if not exists fhs_status_idx on figure_historical_snippets(curation_status);

create table if not exists figure_assessments (
  id integer primary key autoincrement,
  figure_id text not null references figures(id) on delete cascade,
  assessment_kind text not null check (assessment_kind in ('importance_summary', 'timeline_events')),
  model text not null,
  prompt_version text not null,
  trigger_mode text not null default 'on_demand' check (trigger_mode in ('on_demand', 'manual')),
  input_hash text,
  assessment_text text,
  assessment_json text not null default '{}',
  citations text not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published', 'stale')),
  generated_at integer not null default (strftime('%s','now')),
  created_at integer not null default (strftime('%s','now')),
  updated_at integer not null default (strftime('%s','now'))
);

create index if not exists fa_figure_idx on figure_assessments(figure_id);
create index if not exists fa_kind_idx on figure_assessments(assessment_kind);
create index if not exists fa_status_idx on figure_assessments(status);

create table if not exists figure_timeline_events (
  id integer primary key autoincrement,
  figure_id text not null references figures(id) on delete cascade,
  assessment_id integer references figure_assessments(id) on delete set null,
  event_label text not null,
  event_description text,
  event_start_year integer,
  event_end_year integer,
  place_label text,
  place_lat real,
  place_lon real,
  confidence real,
  source_ids text not null default '[]',
  sort_index integer not null default 0,
  metadata text not null default '{}',
  created_at integer not null default (strftime('%s','now')),
  updated_at integer not null default (strftime('%s','now'))
);

create index if not exists fte_figure_idx on figure_timeline_events(figure_id);
create index if not exists fte_assessment_idx on figure_timeline_events(assessment_id);
create index if not exists fte_year_idx on figure_timeline_events(event_start_year, event_end_year);
