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