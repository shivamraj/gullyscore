-- PR 23: Ask agent — shared answer cache, rate limit and question log.
-- Run once in Supabase › SQL Editor › New query (projects created before this PR).
-- New projects get this from schema.sql.

create table if not exists ask_log (
  id            bigint generated always as identity primary key,
  match_id      uuid not null references matches (id) on delete cascade,
  -- One-way hash of the viewer's random device id: enough to rate-limit, not to identify anyone.
  viewer        text not null,
  question      text not null,
  -- The question lower-cased without punctuation: "Score?" and "score" share one cached answer.
  question_key  text not null,
  -- The ball the answer is about. A new ball means a fresh answer.
  last_seq      int  not null,
  answer        text not null,
  -- ai = answered by the model, cache = reused answer, busy = AI unavailable, unavailable = no AI key.
  source        text not null check (source in ('ai', 'cache', 'busy', 'unavailable')),
  tools         text[] not null default '{}',
  ms            int  not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists ask_log_cache_idx  on ask_log (match_id, last_seq, question_key) where source = 'ai';
create index if not exists ask_log_viewer_idx on ask_log (viewer, created_at desc);

-- Private: only the app's server (service role key) reads or writes it. No public policies.
alter table ask_log enable row level security;
