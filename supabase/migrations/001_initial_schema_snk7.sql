-- =====================================================
-- SNAKE BATTLE ROYALE v2 SCHEMA
-- Isolated namespace suffix: _snk7
-- =====================================================

-- 1. PROFILES TABLE
create table if not exists public.profiles_snk7 (
  id uuid references auth.users on delete cascade primary key,
  username text not null default 'Snake' check (char_length(username) between 2 and 16),
  coins integer not null default 0 check (coins >= 0),
  equipped_skin text not null default 'classic_green',
  unlocked_skins text[] not null default array['classic_green'],
  daily_coins_earned integer not null default 0,
  daily_reset_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles_snk7 enable row level security;

drop policy if exists "own profile select" on public.profiles_snk7;
create policy "own profile select" on public.profiles_snk7
  for select using (auth.uid() = id);

-- 2. ROOMS TABLE
create table if not exists public.rooms_snk7 (
  room_id text primary key,
  human_count integer not null default 0 check (human_count >= 0),
  capacity integer not null default 30,
  status text not null default 'open' check (status in ('open','full','draining')),
  last_heartbeat timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.rooms_snk7 enable row level security;

-- 3. ROOM RESERVATIONS TABLE
create table if not exists public.room_reservations_snk7 (
  ticket_id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms_snk7(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '60 seconds',
  claimed boolean not null default false
);
create index if not exists idx_room_reservations_snk7 on public.room_reservations_snk7 (room_id, expires_at);
alter table public.room_reservations_snk7 enable row level security;

-- 4. MATCH PAYOUTS TABLE
create table if not exists public.match_payouts_snk7 (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id text not null,
  requested integer not null,
  granted integer not null,
  survived_seconds integer not null,
  created_at timestamptz not null default now()
);
alter table public.match_payouts_snk7 enable row level security;

-- 5. TRIGGER ON NEW AUTH USER
create or replace function public.handle_new_user_snk7()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles_snk7 (id, username)
  values (new.id, 'Snake_' || substr(new.id::text, 1, 5))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_snk7 on auth.users;
create trigger on_auth_user_created_snk7
  after insert on auth.users
  for each row execute procedure public.handle_new_user_snk7();

-- 6. MATCHMAKING FUNCTION
create or replace function public.find_or_create_room_snk7(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_room text;
begin
  delete from public.room_reservations_snk7 where expires_at < now() and claimed = false;

  select r.room_id into v_room
  from public.rooms_snk7 r
  where r.status = 'open'
    and r.last_heartbeat > now() - interval '45 seconds'
    and (r.human_count + (
          select count(*) from public.room_reservations_snk7 x
          where x.room_id = r.room_id and x.claimed = false and x.expires_at > now()
        )) < r.capacity
  order by r.human_count desc, r.created_at asc
  limit 1
  for update;

  if v_room is null then
    v_room := 'board_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.rooms_snk7 (room_id) values (v_room);
  end if;

  insert into public.room_reservations_snk7 (room_id, user_id) values (v_room, p_user);
  return v_room;
end;
$$;

-- 7. REPORT ROOM FUNCTION
create or replace function public.report_room_snk7(p_room text, p_humans integer)
returns void language sql security definer set search_path = '' as $$
  update public.rooms_snk7
  set human_count = p_humans,
      last_heartbeat = now(),
      status = case when p_humans >= capacity then 'full' else 'open' end
  where room_id = p_room;
$$;

-- 8. CLEANUP ROOMS FUNCTION
create or replace function public.cleanup_rooms_snk7()
returns void language sql security definer set search_path = '' as $$
  delete from public.rooms_snk7 where last_heartbeat < now() - interval '2 minutes';
$$;

-- 9. GRANT MATCH COINS FUNCTION
create or replace function public.grant_match_coins_snk7(
  p_user uuid,
  p_session uuid,
  p_room text,
  p_amount integer,
  p_survived integer
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_match_cap  constant integer := 150;
  v_daily_cap  constant integer := 1500;
  v_today_used integer;
  v_grant      integer;
begin
  if exists (select 1 from public.match_payouts_snk7 where session_id = p_session) then
    return 0;
  end if;

  update public.profiles_snk7
     set daily_coins_earned = 0, daily_reset_on = current_date
   where id = p_user and daily_reset_on < current_date;

  select daily_coins_earned into v_today_used from public.profiles_snk7 where id = p_user for update;
  v_grant := greatest(0, least(p_amount, v_match_cap, v_daily_cap - coalesce(v_today_used, 0)));

  update public.profiles_snk7
     set coins = coins + v_grant,
         daily_coins_earned = daily_coins_earned + v_grant,
         updated_at = now()
   where id = p_user;

  insert into public.match_payouts_snk7 (session_id, user_id, room_id, requested, granted, survived_seconds)
  values (p_session, p_user, p_room, p_amount, v_grant, p_survived);

  return v_grant;
end;
$$;

-- 10. BUY SKIN FUNCTION
create or replace function public.buy_skin_snk7(p_user uuid, p_skin text, p_cost integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles_snk7
     set coins = coins - p_cost,
         unlocked_skins = array_append(unlocked_skins, p_skin),
         updated_at = now()
   where id = p_user
     and coins >= p_cost
     and not (p_skin = any(unlocked_skins));
  return found;
end;
$$;

-- 11. ACCESS CONTROL (service_role only)
revoke execute on function public.find_or_create_room_snk7(uuid)                     from public, anon, authenticated;
revoke execute on function public.report_room_snk7(text, integer)                    from public, anon, authenticated;
revoke execute on function public.cleanup_rooms_snk7()                               from public, anon, authenticated;
revoke execute on function public.grant_match_coins_snk7(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.buy_skin_snk7(uuid, text, integer)                  from public, anon, authenticated;

grant execute on function public.find_or_create_room_snk7(uuid)                      to service_role;
grant execute on function public.report_room_snk7(text, integer)                     to service_role;
grant execute on function public.cleanup_rooms_snk7()                                to service_role;
grant execute on function public.grant_match_coins_snk7(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.buy_skin_snk7(uuid, text, integer)                  to service_role;
