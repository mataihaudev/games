create table if not exists rooms (
  id text primary key,
  host_id text not null,
  stage text not null default 'lobby',
  current_round_index integer not null default 0,
  current_validation_category_index integer not null default 0,
  timer_started_at timestamptz,
  timer_ends_at timestamptz,
  finisher_id text,
  rounds jsonb not null default '[]'::jsonb,
  reveal_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id text primary key,
  room_id text not null references rooms(id) on delete cascade,
  name text not null,
  score integer not null default 0,
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);

create table if not exists submissions (
  room_id text not null references rooms(id) on delete cascade,
  round_number integer not null,
  category_index integer not null,
  player_id text not null references players(id) on delete cascade,
  answer text,
  awarded_points integer,
  finished_at timestamptz,
  is_finisher boolean not null default false,
  primary key (room_id, round_number, category_index, player_id)
);

alter table submissions add column if not exists finished_at timestamptz;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table rooms to anon, authenticated;
grant select, insert, update, delete on table players to anon, authenticated;
grant select, insert, update, delete on table submissions to anon, authenticated;

alter table rooms enable row level security;
alter table players enable row level security;
alter table submissions enable row level security;

drop policy if exists "rooms_public_select" on rooms;
create policy "rooms_public_select" on rooms
for select to anon, authenticated
using (true);

drop policy if exists "rooms_public_insert" on rooms;
create policy "rooms_public_insert" on rooms
for insert to anon, authenticated
with check (true);

drop policy if exists "rooms_public_update" on rooms;
create policy "rooms_public_update" on rooms
for update to anon, authenticated
using (true)
with check (true);

drop policy if exists "rooms_public_delete" on rooms;
create policy "rooms_public_delete" on rooms
for delete to anon, authenticated
using (true);

drop policy if exists "players_public_select" on players;
create policy "players_public_select" on players
for select to anon, authenticated
using (true);

drop policy if exists "players_public_insert" on players;
create policy "players_public_insert" on players
for insert to anon, authenticated
with check (true);

drop policy if exists "players_public_update" on players;
create policy "players_public_update" on players
for update to anon, authenticated
using (true)
with check (true);

drop policy if exists "players_public_delete" on players;
create policy "players_public_delete" on players
for delete to anon, authenticated
using (true);

drop policy if exists "submissions_public_select" on submissions;
create policy "submissions_public_select" on submissions
for select to anon, authenticated
using (true);

drop policy if exists "submissions_public_insert" on submissions;
create policy "submissions_public_insert" on submissions
for insert to anon, authenticated
with check (true);

drop policy if exists "submissions_public_update" on submissions;
create policy "submissions_public_update" on submissions
for update to anon, authenticated
using (true)
with check (true);

drop policy if exists "submissions_public_delete" on submissions;
create policy "submissions_public_delete" on submissions
for delete to anon, authenticated
using (true);

do $$
begin
  alter publication supabase_realtime add table rooms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table players;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table submissions;
exception
  when duplicate_object then null;
end $$;