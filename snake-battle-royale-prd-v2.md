# Product Requirements Document (PRD) v2.0: Snake Battle Royale (.io)

**Version:** 2.0 (supersedes v1.0)
**Status:** Ready for development, pending the Milestone 0 load test
**Platforms:** Web (desktop and mobile browsers)
**Hard constraint:** 100% free for players, hosted on free tiers. Zero-cost hosting is a design constraint, so the architecture is built around it.

**Stack:** Next.js (Cloudflare Pages or Vercel) + Supabase (Auth + Postgres) + PartyKit (Cloudflare Durable Objects) for the game server.

---

## 0. What Changed From v1.0

| # | v1.0 problem | v2.0 fix |
|---|---|---|
| 1 | `increment_player_coins` callable by any browser user (coin minting) | All money RPCs revoked from `anon`/`authenticated`; granted to `service_role` only; payouts idempotent and capped (§5) |
| 2 | PartyKit trusted any client-supplied identity | Server-signed, short-lived join ticket verified on connect (§6.2) |
| 3 | Full snake bodies broadcast to every client (~MB/s) | Viewport culling, delta/binary encoding, per-client send budget (§7) |
| 4 | Rooms ticked 24/7, burning free compute | Rooms hibernate when no humans are present; bot-only rooms never run (§6.4) |
| 5 | `human_count` only ever incremented; ghost slots | PartyKit is the source of truth; reservations expire; heartbeats (§5, §6.4) |
| 6 | `skip locked` spawned extra rooms under load | Row lock with deterministic selection (§5) |
| 7 | Coin farming (bot kills, anonymous accounts) | No payout for bot kills; per-match and per-day caps; CAPTCHA on anonymous sign-in (§8) |
| 8 | Coins lost on disconnect | Payout on death, leave and disconnect, keyed by session ID (§6.5) |
| 9 | Input lag (10Hz input, 15Hz tick, no prediction) | 20Hz input, client-side prediction, server turn-rate cap (§6.1, §9) |
| 10 | Vercel Hobby is non-commercial only | Frontend on Cloudflare Pages (or Vercel while strictly non-commercial) (§3) |
| 11 | Undefined edge cases (head-on, disconnect, reconnect) | Explicit rules (§6.6) |
| 12 | Supabase free project pauses after inactivity | Keep-alive cron (§12) |

---

## 1. Product Vision

A fast, free, no-signup multiplayer snake game inspired by Slither.io. A player opens the URL, types a nickname, taps **Play**, and is in a live arena within a few seconds. Arenas hold up to **N** snakes (default 30, configurable up to 50 after load testing), made up of humans plus server-controlled bots, so the board always feels busy.

Players earn coins by surviving and eating, and spend them on cosmetic skins. Cosmetics only: no pay-to-win, no paywalls, no ads required to play.

### Success criteria (measurable)
- Time from click on **Play** to first rendered frame: **< 3 s** on a mid-range phone on 4G (warm server), **< 8 s** on a cold start.
- Input-to-visible-turn latency feels responsive (client prediction), with a target below **100 ms** perceived.
- Bandwidth per player: **< 15 KB/s average, < 40 KB/s peak** (≈ 50 MB/hour or less).
- A mid-range Android phone sustains **≥ 45 fps**.
- Infrastructure cost: **₹0/month** up to the measured free-tier player cap (§12).

### Non-goals (v2)
Global all-time leaderboards, chat, friends, teams, paid skins, ads, native apps.

---

## 2. Core User Flows

### 2.1 Onboarding
1. First visit: sign in with **Supabase Anonymous Sign-In** in the background. Enable **CAPTCHA protection** (Cloudflare Turnstile, free) on anonymous sign-ins to stop bot account farming.
2. The player enters a nickname (validated, see §8.3) and presses **Play**.
3. **Account linking prompt:** after the player's first skin purchase or third match, show a non-blocking banner: "Save your progress, or you'll lose your coins if you clear your browser." Google sign-in links the anonymous identity (`linkIdentity`).

### 2.2 Lobby and Skin Shop
- Logo, nickname field, **PLAY** button, coin balance, equipped-skin preview, Shop button.
- Shop lists skins (§10). Unlocked skins show **Equip**; locked skins show **Buy for X coins**. Purchases go through a server API route that deducts coins atomically (§5).
- Show a clear "guest account" indicator and a Save Progress button.

### 2.3 Matchmaking and Gameplay
1. The client calls `POST /api/matchmake` with the Supabase session token.
2. The server verifies the user, calls `find_or_create_room` (service role), receives a `room_id`, creates a **reservation**, and returns `{ room_id, ticket }`. The ticket is a short-lived (60 s), single-use signed token (§6.2).
3. The client opens `wss://<host>/parties/main/<room_id>?ticket=<ticket>`.
4. The server verifies the ticket, claims the reservation, and spawns the player at a safe location with **3 s invulnerability**.
5. The player eats pellets, boosts (at the cost of length), and outgrows others.
6. **Death or leave:** the body turns into loot orbs and the match payout is credited (§6.5). A **Game Over** screen shows length, kills, coins and **Play Again**.
7. **Reconnect:** a dropped connection keeps the snake alive for a 5 s grace period. If the player reconnects with a fresh ticket from the same session, they resume. Otherwise the snake dies and drops loot.

---

## 3. System Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js (static export where possible), TypeScript, Canvas 2D | Lobby, rendering, input, prediction, interpolation |
| Hosting (frontend) | **Cloudflare Pages** (free, commercial use allowed). Vercel Hobby is acceptable only while the project stays strictly non-commercial. | Static assets and API routes |
| API | Next.js route handlers / Cloudflare Workers | `/api/matchmake`, `/api/shop/buy`, `/api/shop/equip` |
| Database and Auth | Supabase Postgres + Auth | Profiles, skins, rooms, reservations, payouts |
| Game server | PartyKit (Durable Objects, one room per arena) | Authoritative simulation, bots, collision, culling, payouts |
| Edge protection | Cloudflare (free) in front of everything | Basic DDoS and rate limiting |

**Design principle:** Supabase handles slow, rare, durable operations (accounts, purchases, payouts). PartyKit handles fast, ephemeral operations (the match). Supabase is **never** called from inside the tick loop.

---

## 4. Free-Tier Budget (verify limits before building)

Free-tier limits change. **Milestone 0 must confirm current limits** for PartyKit/Cloudflare Durable Objects (requests, duration and CPU per day), Supabase (MAU, DB size, egress, project pausing) and Cloudflare Pages. Planning assumptions:

- Durable Object compute is metered by active duration and requests. A room that ticks continuously consumes the daily allowance on its own. **Rule: no humans, no ticking** (§6.4).
- Incoming WebSocket messages are billed at a reduced ratio but still count. At 20 inputs/s per player, 100 concurrent players produce about 2,000 msgs/s, so input must be **change-only** and rate-capped (§6.1).
- Anonymous users count toward Supabase monthly active users. Monitor this.
- **Capacity plan:** measure the sustainable concurrent-player ceiling in Milestone 0 and show a friendly "Arenas are full, try again shortly" screen when the global cap is reached. A hard cap is better than surprise throttling. The global cap is stored in config so it can be raised when moving to a paid plan.

---

## 5. Database Schema and Security (Supabase SQL)

> **Security rule:** every function that touches money or room counts is callable **only by `service_role`**. Browsers never call them directly. All definer functions set `search_path = ''`.

```sql
-- =====================================================
-- 1. PROFILES
-- =====================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text not null default 'Snake'
    check (char_length(username) between 2 and 16),
  coins integer not null default 0 check (coins >= 0),
  equipped_skin text not null default 'classic_green',
  unlocked_skins text[] not null default array['classic_green'],
  daily_coins_earned integer not null default 0,
  daily_reset_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile select" on public.profiles
  for select using (auth.uid() = id);

-- Browsers cannot UPDATE profiles directly at all.
-- Username and equip changes go through API routes (service role) so that
-- coins, skins and quotas can never be tampered with, and so usernames are validated.
-- (No insert/update/delete policies = denied under RLS.)

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'Snake_' || substr(new.id::text, 1, 5));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- 2. ROOMS + RESERVATIONS
-- =====================================================
create table public.rooms (
  room_id text primary key,
  human_count integer not null default 0 check (human_count >= 0),   -- reported by PartyKit
  capacity integer not null default 30,
  status text not null default 'open' check (status in ('open','full','draining')),
  last_heartbeat timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.rooms enable row level security;   -- no policies: service_role only

create table public.room_reservations (
  ticket_id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '60 seconds',
  claimed boolean not null default false
);
create index on public.room_reservations (room_id, expires_at);
alter table public.room_reservations enable row level security;

-- Find the fullest room with a free slot (counting unexpired, unclaimed reservations),
-- or create one. Uses a plain row lock (NOT skip locked) so concurrent callers
-- queue briefly instead of each creating a new room.
create or replace function public.find_or_create_room(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_room text;
begin
  -- Release stale reservations
  delete from public.room_reservations where expires_at < now() and claimed = false;

  select r.room_id into v_room
  from public.rooms r
  where r.status = 'open'
    and r.last_heartbeat > now() - interval '45 seconds'
    and (r.human_count + (
          select count(*) from public.room_reservations x
          where x.room_id = r.room_id and x.claimed = false and x.expires_at > now()
        )) < r.capacity
  order by r.human_count desc, r.created_at asc
  limit 1
  for update;

  if v_room is null then
    v_room := 'board_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.rooms (room_id) values (v_room);
  end if;

  insert into public.room_reservations (room_id, user_id) values (v_room, p_user);
  return v_room;
end; $$;

-- Heartbeat/count update called by PartyKit (service role) every ~15s and on join/leave.
create or replace function public.report_room(p_room text, p_humans integer)
returns void language sql security definer set search_path = '' as $$
  update public.rooms
  set human_count = p_humans,
      last_heartbeat = now(),
      status = case when p_humans >= capacity then 'full' else 'open' end
  where room_id = p_room;
$$;

-- Rooms with 0 humans are deleted by PartyKit on shutdown (and by the cleanup cron).
create or replace function public.cleanup_rooms()
returns void language sql security definer set search_path = '' as $$
  delete from public.rooms where last_heartbeat < now() - interval '2 minutes';
$$;

-- =====================================================
-- 3. IDEMPOTENT, CAPPED MATCH PAYOUTS
-- =====================================================
create table public.match_payouts (
  session_id uuid primary key,            -- one payout per play session, ever
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id text not null,
  requested integer not null,
  granted integer not null,
  survived_seconds integer not null,
  created_at timestamptz not null default now()
);
alter table public.match_payouts enable row level security;

create or replace function public.grant_match_coins(
  p_user uuid, p_session uuid, p_room text, p_amount integer, p_survived integer
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_match_cap  constant integer := 150;    -- max per match
  v_daily_cap  constant integer := 1500;   -- max per UTC day
  v_today_used integer;
  v_grant      integer;
begin
  -- idempotency: a second call for the same session is a no-op
  if exists (select 1 from public.match_payouts where session_id = p_session) then
    return 0;
  end if;

  -- reset daily counter when the day rolls over
  update public.profiles
     set daily_coins_earned = 0, daily_reset_on = current_date
   where id = p_user and daily_reset_on < current_date;

  select daily_coins_earned into v_today_used from public.profiles where id = p_user for update;
  v_grant := greatest(0, least(p_amount, v_match_cap, v_daily_cap - coalesce(v_today_used, 0)));

  update public.profiles
     set coins = coins + v_grant,
         daily_coins_earned = daily_coins_earned + v_grant,
         updated_at = now()
   where id = p_user;

  insert into public.match_payouts (session_id, user_id, room_id, requested, granted, survived_seconds)
  values (p_session, p_user, p_room, p_amount, v_grant, p_survived);

  return v_grant;
end; $$;

-- =====================================================
-- 4. ATOMIC SKIN PURCHASE
-- =====================================================
create or replace function public.buy_skin(p_user uuid, p_skin text, p_cost integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set coins = coins - p_cost,
         unlocked_skins = array_append(unlocked_skins, p_skin),
         updated_at = now()
   where id = p_user
     and coins >= p_cost
     and not (p_skin = any(unlocked_skins));
  return found;
end; $$;
-- Skin prices are defined server-side (config/skins.ts on the server); never trust a client price.

-- =====================================================
-- 5. LOCK DOWN EXECUTION (critical)
-- =====================================================
revoke execute on function public.find_or_create_room(uuid)                     from public, anon, authenticated;
revoke execute on function public.report_room(text, integer)                    from public, anon, authenticated;
revoke execute on function public.cleanup_rooms()                               from public, anon, authenticated;
revoke execute on function public.grant_match_coins(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.buy_skin(uuid, text, integer)                 from public, anon, authenticated;

grant execute on function public.find_or_create_room(uuid)                      to service_role;
grant execute on function public.report_room(text, integer)                     to service_role;
grant execute on function public.cleanup_rooms()                                to service_role;
grant execute on function public.grant_match_coins(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.buy_skin(uuid, text, integer)                  to service_role;
```

**Security tests (acceptance criteria):** with an anonymous user's JWT, each of these must fail: calling any function above via RPC, updating `coins` or `unlocked_skins`, inserting into `rooms` or `match_payouts`, or reading another user's profile.

---

## 6. Game Server Specification (PartyKit)

### 6.1 Arena Constants (all tunable in one `config.ts`)

| Constant | Default | Notes |
|---|---|---|
| Map size | **2400 × 2400** | Smaller than v1 (3000) so thinner populations still meet often |
| Capacity | **30** (configurable to 50) | Raise only after the Milestone 0 load test passes |
| Tick rate | **15 Hz** simulation, **15 Hz** state broadcast | Client prediction hides the latency |
| Input rate | Client sends at **up to 20 Hz, only on change** | Server caps accepted input at 30 msgs/s per connection |
| Base speed | 180 u/s | |
| Boost speed | 300 u/s | |
| Max turn rate | ~**4.5 rad/s** (server-enforced) | Prevents instant-turn cheats and matches client prediction |
| Boost rule | Only when length ≥ minimum (e.g. 15); costs 2 length/s; drops a pellet every 500 ms | |
| Head / body radius | 12 / 10 | Collision test uses head vs. other snakes' body only |
| Standard pellets | 250 (scales with live players, minimum 100) | Spawned in a spatial grid |
| Spawn invulnerability | 3 s | See §6.6 for the exact rule |

### 6.2 Authentication (join ticket)
1. `/api/matchmake` verifies the Supabase JWT, calls `find_or_create_room`, and signs a **join ticket** (HMAC-SHA256 or EdDSA JWT) containing `{ uid, room_id, ticket_id, session_id, nickname, skin, exp ≤ 60 s }`. The signing secret is stored as a secret in both the API and PartyKit.
2. On WebSocket connect, PartyKit (`onBeforeConnect`) **verifies the signature, expiry, room match and single use**, then rejects invalid connections **before** a Durable Object slot is spent.
3. One active connection per `uid` per room. A second connection kicks or rejects the older one (§6.6).
4. Player identity inside a match is an **ephemeral short ID** (an integer such as `7`). **Real user UUIDs are never sent to other clients.**

### 6.3 Server Authority
- The client sends **intent only**: `{ angle, boost }`.
- The server validates the type and range of every message, clamps `angle` changes to the turn-rate cap, ignores `boost` when below the minimum length, and drops oversize or malformed messages.
- **Rate limiting:** more than 30 msgs/s, or more than 5 invalid messages, closes the connection.
- All positions, scores, coins, kills and deaths are computed on the server only.

### 6.4 Room Lifecycle (cost control)
- A room **starts** on the first valid connection and fills with bots up to a target population (see below).
- A room **hibernates** when the last human leaves (after a 10 s grace period): tick timers are cleared, bots are discarded and the room reports `human_count = 0`. No alarms or intervals survive.
- **Heartbeat:** every ~15 s the room calls `report_room(room_id, humans)`, and also on join and leave. This keeps `human_count` accurate and removes the ghost-slot problem.
- **Bot target:** `max(0, target_population − humans)`, where `target_population` defaults to `min(capacity, 12 + humans)` so small rooms are lively without being full of bots. When a human joins, despawn the shortest bot, preferring bots that are not near any human.
- Bots run in the same tick (no separate timers). Bot logic runs at **5 Hz**, not every tick.

### 6.5 Payouts
- The server tracks `match_coins` per session, from gold pellets and loot orbs.
- A payout RPC (`grant_match_coins`) is sent on **death, voluntary leave, disconnect-grace-expiry and room shutdown**, with the unique `session_id` for idempotency.
- **Bot kills grant no coins.** Human kills grant a small flat bonus, but only if the victim was a human who survived at least 20 s (this stops two accounts feeding each other).
- Payout formula (default): `coins = floor(match_coins) + min(20, floor(survived_seconds / 30))`, then the database caps it per match and per day (§5).
- On RPC failure, retry with backoff (3 tries) and keep the payout in a short in-memory queue. The `session_id` guarantees there is no double credit.

### 6.6 Defined Edge Cases

| Case | Rule |
|---|---|
| Head-to-head collision | The **longer** snake survives. Equal length: both die. |
| Head into a snake's body | The moving head's snake dies. |
| Invulnerability | An invulnerable snake can't die and can't kill; it passes through bodies. It ends early if the player boosts. |
| Wall | Death on touch, no wraparound. |
| Disconnect | Snake stays 5 s, controlled by "continue straight" or auto-avoid, then dies and drops loot. |
| Reconnect within grace | Resume the same snake with a new ticket for the same `session_id`. |
| Two tabs, same account | The new connection replaces the old one. |
| Loot on death | Every 3rd segment becomes an orb worth its length. Orbs are capped per death (≤ 60) and de-duplicated to limit message size. |
| Room full at join | `find_or_create_room` creates a new room. If the global cap is hit, return HTTP 503 with a friendly message. |

### 6.7 Spatial Indexing
Use a **uniform grid** (cell ≈ 200 units) for food and for snake body segments. Collision tests, food pickup, bot vision and culling all query neighbouring cells instead of looping over every segment. Cost scales with local density, not total snakes × segments.

### 6.8 Leaderboard
Compute the Top 5 plus each player's own rank **twice per second** using a partial sort. Broadcast the Top 5 once to everyone, and `your_rank` as a small field piggybacked on that message.

---

## 7. Network Protocol (bandwidth-aware)

Goal: **< 15 KB/s average per player.** v1 sent every snake's full point list to every client, which was around 900 KB/s.

### 7.1 Principles
1. **Interest management.** Each client only receives snakes and food whose bounding box intersects its viewport plus a margin (roughly 1.3× the visible area).
2. **Compressed bodies.** A snake's body is a smooth path. Send the **head position, angle, speed state and length**, plus the full body only (a) when a snake first enters a client's view and (b) as occasional keyframes (every ~2 s). Between keyframes, clients reconstruct the body by trailing the head along its own recorded path.
3. **Quantized numbers.** Positions as 16-bit ints (0.05–0.1 unit precision is plenty), angle as 8–16 bit, no floats, no long strings.
4. **Binary format** (`ArrayBuffer`, `DataView`) for `tick` messages. JSON is acceptable for rare messages (`init`, `death`, `leaderboard`).
5. **Food deltas only.** `food_added` and `food_eaten` are sent only for food inside the client's interest area. The initial `init` carries nearby food only; more arrives as the player moves.
6. **Per-client send budget** (e.g. ≤ 40 KB/s). Over budget, drop the lowest-priority updates first (far-away snakes, then far food).
7. **Backpressure.** Skip sending to a connection whose socket buffer is backed up.

### 7.2 Messages

**Client → Server**
```json
{ "t": "input", "a": 157, "b": 0, "seq": 1042 }
```
- `a` is the angle quantized to 0–255 (or 0–1023). `b` is the boost flag.
- Sent only on change, at most 20/s. `seq` lets the server tell the client which input it has applied (for prediction reconciliation).

**Server → Client**
- `init` (JSON, once): ephemeral `self_id`, map size, config version, nearby food, the player's own snake.
- `tick` (binary, 15 Hz): `server_tick`, `last_applied_seq`, the player's own authoritative state, visible snakes `{ short_id, x, y, angle, length, flags, [keyframe body] }`, `food_added`, `food_eaten`.
- `lb` (JSON, 2 Hz): Top 5 `{ rank, short_id, name, score }` plus `your_rank`.
- `death` (JSON, once): final length, kills, coins granted, survived seconds.
- `error` / `kick` (JSON): reason codes.

### 7.3 Protocol Versioning
Every message set carries a `v` field. The server rejects clients on an incompatible version with a "please refresh" screen. This avoids half-deployed mismatches after updates.

---

## 8. Anti-Abuse, Moderation and Privacy

### 8.1 Cheating
Server-authoritative simulation, input validation, turn-rate and boost enforcement (§6.3), rate limits, and no client-reported coins, positions or scores.

### 8.2 Coin farming
No coins for bot kills, per-match and per-day caps (§5), CAPTCHA on anonymous sign-up, idempotent payouts, minimum survive time for kill bonuses, and review `match_payouts` for outliers (a simple SQL query is enough at this scale).

### 8.3 Nicknames
- 2–16 characters, allowed set: letters, numbers, spaces, `_`, `-`.
- Server-side profanity filter (word list with normalization for leetspeak) applied at set time. Rejected names fall back to a default `Snake_xxxxx`.
- Names are validated again when the join ticket is created, never trusted from the client.

### 8.4 Connection abuse
Max connections per IP per room, ticket rate limit per user, Cloudflare in front, WebSocket message-size cap (e.g. 256 bytes inbound).

### 8.5 Privacy
No real UUIDs, emails or IPs are exposed to other players. Store only what's needed. Provide a short privacy note and a "delete my account and data" path (Supabase deletes cascade from `auth.users`).

---

## 9. Frontend Requirements

### 9.1 Controls
- **Desktop:** mouse steers toward the cursor (or WASD/arrows). Boost with Space or left mouse button.
- **Mobile:** floating virtual joystick on the left half, a boost button bottom-right. Use `touch-action: none`, `overscroll-behavior: none`, prevent pull-to-refresh and double-tap zoom, and handle multi-touch properly (joystick and boost used simultaneously).
- Pause rendering when the tab is hidden, and show a "connection lost, reconnecting" overlay.

### 9.2 Prediction and Interpolation
- **Own snake:** predicted locally using the same movement and turn-rate rules as the server. Reconcile smoothly on each tick using `last_applied_seq` (gentle correction, no teleporting).
- **Other snakes:** interpolated about **100–150 ms behind** the latest server state (fixed render delay) for smoothness, with limited extrapolation if a tick is late.
- Render at the display's refresh rate with `requestAnimationFrame`, using delta-time.

### 9.3 Field of View
- Target a consistent visible **area** across devices rather than a fixed radius. Use a **minimum visible width** (~900 units) so portrait phones don't shrink snakes to dots, with the visible height derived from the aspect ratio.
- Zoom out slightly as the player's snake grows (capped), like Slither.io.
- Show a **dotted danger edge** near the map boundary.

### 9.4 Performance (mobile first)
- Pre-render snake segments and food into offscreen sprite atlases. **Avoid `shadowBlur` and per-frame gradients** in the hot path.
- Draw only entities in the viewport. Use a background tile pattern instead of a giant grid.
- **Adaptive quality:** monitor frame time. If it drops under ~45 fps, turn off particles, glows and the minimap redraw rate.
- Cap devicePixelRatio at 2.
- Target bundle: initial JS < 250 KB gzipped for the lobby. Load the game canvas code on **Play**.

### 9.5 HUD
- Top-right: Top 5 + your rank and length. Top-left: match coins and length. Bottom-left: 120×120 minimap (player dot + #1 marker, redrawn at a low rate).
- #1 snake gets a crown.
- Accessible touch targets (≥ 44 px), colour-blind-safe food colours, optional "reduced effects" toggle.

---

## 10. Cosmetics

Prices are enforced on the server. The client's skin config is for rendering only.

| Skin ID | Name | Cost | Style | Performance note |
|---|---|---|---|---|
| `classic_green` | Classic Viper | 0 | Emerald body, lime outline | Baseline |
| `neon_cyber` | Cyber Neon | 100 | Cyan/magenta alternating segments | Pre-rendered glow sprite, not live blur |
| `inferno_blaze` | Inferno Blaze | 250 | Orange/red gradient, ember trail on boost | Particles capped, auto-off on slow devices |
| `gold_vip` | Royal Gold | 500 | Metallic gold, sparkles | Sparkles capped |
| `void_phantom` | Void Phantom | 1000 | Obsidian purple, violet outline | Baseline |

**Economy tuning (starting point):** a typical 3–5 minute match should yield roughly 20–40 coins, so the first skin takes about 3–5 matches, and the most expensive skin takes a long time but is reachable. Tune with real data from `match_payouts`.

---

## 11. Environment and Secrets

**Frontend/API host**
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never exposed to the browser
JOIN_TICKET_SECRET=               # shared with PartyKit
NEXT_PUBLIC_PARTYKIT_HOST=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

**PartyKit**
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # used only for report_room / grant_match_coins
JOIN_TICKET_SECRET=
```

**Rules:** never prefix the service role key with `NEXT_PUBLIC_`. Rotate it if it is ever committed. Keep `.env*` in `.gitignore`.

---

## 12. Operations, Monitoring and Free-Tier Survival

- **Supabase keep-alive:** a free scheduled job (GitHub Actions or Cloudflare Cron) pings the database daily so the free project doesn't pause. The same job runs `cleanup_rooms()` and prunes old `match_payouts`.
- **Global concurrency cap** in config, with a friendly full-capacity screen (§4).
- **Metrics to track** (even if only in logs): concurrent players, rooms alive, average bytes/s per client, tick time (p95), payout failures, rejected tickets, and daily Supabase MAU.
- **Error reporting:** Sentry free tier on client and server.
- **Alerts:** a free uptime monitor on the site, and an alert when the daily payout total looks abnormal.
- **Cold starts:** show an animated "finding an arena" state. Warm the PartyKit room before the player's socket opens where possible.
- **Deploy safety:** protocol version check (§7.3), and drain old rooms (`status = 'draining'`) before breaking changes.
- **Backups:** the free tier has limited backups, so export `profiles` weekly with a script if the player base grows.

---

## 13. Testing Strategy

1. **Headless load test (Milestone 0):** a Node script launching 30–100 fake clients with realistic input. Measures bandwidth per client, tick time, memory, and the Durable Object daily usage extrapolated to a full day.
2. **Simulation unit tests:** collision rules (§6.6), turn-rate cap, boost rules, loot generation, payout calculation.
3. **Security tests:** the checks in §5, forged and expired tickets, replayed tickets, spoofed messages, oversize messages.
4. **Network chaos:** simulated 150 ms latency, 5% packet loss and jitter. Disconnect and reconnect tests.
5. **Device tests:** one low-end Android phone, one iPhone and one desktop. Check 45+ fps and that touch controls don't scroll the page.
6. **Matchmaking concurrency test:** 100 simultaneous joins should produce about ⌈100 / capacity⌉ rooms, not 100.

---

## 14. Milestones and Acceptance Criteria

### Milestone 0: Feasibility and Load Test (do first)
- [ ] Confirm current free-tier limits for PartyKit/Durable Objects, Supabase and Cloudflare Pages.
- [ ] Minimal server: one room, 30 bots, binary tick with culling. Headless clients measure bandwidth and CPU.
- [ ] **Go/no-go:** < 15 KB/s per player average; daily free usage supports at least the planned concurrent-player cap. Otherwise reduce capacity, tick rate or map size.

### Milestone 1: Core Client
- [ ] Canvas rendering, camera, zoom, desktop and mobile controls, local single-player with bots, 45+ fps on the test phone.

### Milestone 2: Authoritative Multiplayer Server
- [ ] Spatial grid, collisions with defined edge cases, bots, loot, boost, leaderboard, hibernation, input validation, client prediction and interpolation.

### Milestone 3: Auth, Tickets and Matchmaking
- [ ] Anonymous sign-in with CAPTCHA, `/api/matchmake`, join tickets, reservations, heartbeats. The concurrency test passes. Ghost slots self-heal.

### Milestone 4: Economy and Cosmetics
- [ ] Idempotent capped payouts on death, leave and disconnect. Server-side purchases, equip, skins rendered in multiplayer. Security tests pass. Account linking prompt.

### Milestone 5: Hardening and Launch
- [ ] Nickname filter, rate limits, Cloudflare in front, monitoring, keep-alive cron, privacy note, global cap screen, device matrix pass. Soft launch with a small group, then watch metrics for a week before sharing widely.

---

## 15. Risks and Open Questions

| Risk | Mitigation |
|---|---|
| Free-tier limits too low for a viral spike | Global cap, friendly full screen, config switch to raise capacity, a documented upgrade path |
| Free tiers change terms or pricing | Keep server logic portable (a plain Node WebSocket server is a fallback); avoid deep vendor lock-in |
| Few players online = empty-feeling arenas | Smart bot target (§6.4), smaller map, shared room fill preference |
| Anonymous accounts get lost | Link-account prompts, clear "guest" labelling |
| Cheating via modified clients | Server authority, rate limits, payout caps, outlier review |
| Latency for faraway players | Prediction and interpolation; the single-region limitation is documented, and region choice can improve later |

**Open questions to decide before Milestone 1:** final capacity (30 vs 50), whether to add a spectate-after-death mode, whether to keep the 5-skin catalogue at launch, and whether to allow Google-only linking or also email.
