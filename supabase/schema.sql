-- GullyScore database schema.
-- Paste this whole file into Supabase › SQL Editor › New query, then click Run.
-- Safe to run once on a new project. (Running it again will fail on "already exists".)

-- ---------------------------------------------------------------
-- Teams and players
-- ---------------------------------------------------------------

create table teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  short_code  text not null check (char_length(short_code) between 1 and 6),
  colour      text not null default '#1E6FD9' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  -- Random key kept on the scorer's device; stands in for an account until logins exist.
  owner_key   uuid not null,
  -- false for a quick one-off team typed in at match setup ("don't save").
  is_saved    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index teams_owner_idx on teams (owner_key) where is_saved;

create table players (
  id          uuid primary key default gen_random_uuid(),
  -- null = guest player not saved to any team
  team_id     uuid references teams (id) on delete set null,
  name        text not null check (char_length(name) between 1 and 40),
  role        text check (role in ('batter', 'bowler', 'allrounder', 'keeper')),
  bat_style   text,
  bowl_style  text,
  created_at  timestamptz not null default now()
);
create index players_team_idx on players (team_id);

-- ---------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------

create table matches (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (char_length(title) between 1 and 80),
  venue               text,
  team_a              uuid not null references teams (id),
  team_b              uuid not null references teams (id),
  overs               int  not null check (overs between 1 and 50),
  players_per_side    int  not null default 11 check (players_per_side between 2 and 15),
  last_man_stands     boolean not null default false,
  toss_winner         uuid not null references teams (id),
  toss_decision       text not null check (toss_decision in ('bat', 'bowl')),
  batting_first       uuid not null references teams (id),
  -- [{striker, nonStriker, bowler}, {…}] — innings 2 openers are added at the innings break.
  openers             jsonb not null default '[]'::jsonb,
  -- Innings the scorer closed early with "End innings".
  ended_innings       smallint[] not null default '{}',
  status              text not null default 'upcoming'
                        check (status in ('upcoming', 'live', 'innings_break', 'finished')),
  result              text,
  -- SHA-256 of the secret scoring token. The token itself is never stored.
  scoring_token_hash  text not null,
  owner_key           uuid not null,
  created_at          timestamptz not null default now(),
  check (team_a <> team_b)
);
create index matches_status_idx on matches (status, created_at desc);

-- Who plays for each side today, and in what batting order.
create table match_players (
  match_id       uuid not null references matches (id) on delete cascade,
  player_id      uuid not null references players (id),
  team_id        uuid not null references teams (id),
  batting_order  int  not null,
  primary key (match_id, player_id)
);

-- ---------------------------------------------------------------
-- Balls: one row per delivery. Append-only; undo deletes the last row.
-- Over and ball numbers are not stored: the engine derives them.
-- ---------------------------------------------------------------

create table balls (
  id               bigint generated always as identity primary key,
  match_id         uuid not null references matches (id) on delete cascade,
  seq              int  not null check (seq >= 1),
  innings          smallint not null check (innings in (1, 2)),
  striker          uuid not null,
  non_striker      uuid,
  bowler           uuid not null,
  runs_bat         smallint not null default 0 check (runs_bat between 0 and 7),
  extra_type       text check (extra_type in ('wide', 'noball', 'bye', 'legbye')),
  extra_runs       smallint not null default 0 check (extra_runs between 0 and 7),
  wicket_type      text check (wicket_type in
                     ('bowled', 'caught', 'lbw', 'runout', 'stumped', 'hitwicket', 'retired')),
  player_out       uuid,
  fielder          uuid,
  incoming_batter  uuid,
  -- Set on the scorer's phone; makes retries from the offline queue safe.
  client_id        uuid not null,
  created_at       timestamptz not null default now(),
  unique (match_id, seq),
  unique (client_id)
);

-- Latest calculated state, for a fast first paint and the home page cards.
create table match_state_cache (
  match_id    uuid primary key references matches (id) on delete cascade,
  state       jsonb not null,
  last_seq    int  not null default 0,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Security: anyone can read, nobody writes directly.
-- All writes go through the app's API routes with the service role key.
-- ---------------------------------------------------------------

alter table teams             enable row level security;
alter table players           enable row level security;
alter table matches           enable row level security;
alter table match_players     enable row level security;
alter table balls             enable row level security;
alter table match_state_cache enable row level security;

create policy "public read" on teams             for select using (true);
create policy "public read" on players           for select using (true);
create policy "public read" on matches           for select using (true);
create policy "public read" on match_players     for select using (true);
create policy "public read" on balls             for select using (true);
create policy "public read" on match_state_cache for select using (true);

-- Hide the secret columns from the public: owner keys and the scoring token hash.
revoke select on teams   from anon, authenticated;
revoke select on matches from anon, authenticated;
grant select (id, name, short_code, colour, is_saved, created_at) on teams to anon, authenticated;
grant select (id, title, venue, team_a, team_b, overs, players_per_side, last_man_stands,
              toss_winner, toss_decision, batting_first, openers, ended_innings,
              status, result, created_at)
  on matches to anon, authenticated;

-- ---------------------------------------------------------------
-- Realtime: viewers subscribe to new and deleted balls, and the home page to cache updates.
-- ---------------------------------------------------------------

-- Full row on DELETE, so an undo can be matched to its match.
alter table balls replica identity full;

alter publication supabase_realtime add table balls, match_state_cache, matches;
