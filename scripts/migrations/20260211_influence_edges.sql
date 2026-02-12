-- SQLite migration: Influence edges + evidence items

create table if not exists influence_edges (
  id integer primary key autoincrement,
  from_figure_id text not null references figures(id) on delete cascade,
  to_figure_id text not null references figures(id) on delete cascade,
  direction text not null check (direction in ('directed', 'undirected')),
  relation_type text not null check (relation_type in ('influenced', 'mentored', 'rival', 'associated')),
  confidence real not null default 0.0,
  evidence_score real not null default 0.0,
  support_count integer not null default 0,
  source_family_count integer not null default 0,
  status text not null default 'candidate' check (status in ('candidate', 'approved', 'rejected')),
  metadata text not null default '{}',
  created_at integer not null default (strftime('%s','now')),
  updated_at integer not null default (strftime('%s','now'))
);

create index if not exists ie_from_idx on influence_edges(from_figure_id);
create index if not exists ie_to_idx on influence_edges(to_figure_id);
create index if not exists ie_status_idx on influence_edges(status);
create index if not exists ie_confidence_idx on influence_edges(confidence);
create unique index if not exists ie_unique_idx
  on influence_edges(from_figure_id, to_figure_id, direction, relation_type);

create table if not exists influence_edge_evidence (
  id integer primary key autoincrement,
  edge_id integer not null references influence_edges(id) on delete cascade,
  evidence_kind text not null check (evidence_kind in ('timeline_ref', 'source_excerpt', 'snippet_match', 'llm_seed')),
  source_table text not null check (source_table in ('figure_timeline_events', 'figure_research_sources', 'figure_historical_snippets', 'figures')),
  source_row_id integer,
  excerpt text,
  weight real not null default 0.0,
  metadata text not null default '{}',
  created_at integer not null default (strftime('%s','now')),
  updated_at integer not null default (strftime('%s','now'))
);

create index if not exists iee_edge_idx on influence_edge_evidence(edge_id);
create index if not exists iee_kind_idx on influence_edge_evidence(evidence_kind);
