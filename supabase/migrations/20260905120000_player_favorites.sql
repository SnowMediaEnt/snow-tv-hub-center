-- Player favourites, saved to the STREAMING line rather than to an app user.
--
-- Why the line and not auth.users: most Player users never make a website
-- account. From their side "my account" is the Dreamstreams / Vibez login, and
-- that is what they expect their favourites to follow. Keying on the line
-- gives every Player user the feature; keying on auth.users would give it only
-- to the few who also linked a website login.
--
-- ACCESS MODEL — read this before touching anything below.
--
-- Nothing in the client talks to this table. All reads and writes go through
-- the `player-favorites` edge function, which first verifies the caller's
-- username and password against the upstream panel (the same verifyLine the
-- player-login bridge uses) behind per-IP and per-line throttles, and only
-- then touches the table with the service role.
--
-- An earlier draft checked the caller's password against
-- player_signins.panel_password inside an anon-callable RPC. That column is
-- written verbatim by the capture-player-signin function, which is itself
-- unauthenticated and never checks the password — so anyone who knew a
-- username could overwrite the "secret", read and replace that line's
-- favourites, and lock the real user out. And an anon RPC answering
-- ok / not_verified with no rate limit is a brute-force oracle for real
-- streaming passwords, which is exactly what player-login's throttles exist
-- to prevent. Neither of those functions exists any more. Do not bring them
-- back: the only trustworthy check of a line password is the panel.
--
-- CONCURRENCY — compare-and-set on a server version, never on client clocks.
--
-- Each row carries updated_at, exposed to clients as an opaque integer
-- "version". A write must quote the version it last synced with; it applies
-- only if that is still the row's version, and gets the current row back
-- otherwise so the client can merge and retry. A box with a wrong clock, a
-- device that was offline for a week, a device that never pulled at all —
-- none of them can overwrite a newer list, because none of them can quote a
-- version they have not seen.

create table if not exists public.player_favorites (
  panel_host     text        not null,
  panel_username text        not null,
  favorites      jsonb       not null default '[]'::jsonb,
  updated_at     timestamptz not null default now(),
  primary key (panel_host, panel_username)
);

alter table public.player_favorites enable row level security;

-- Admins may read for support. No other policy: end users never reach this
-- table directly, and the service role bypasses RLS.
drop policy if exists "admins read player_favorites" on public.player_favorites;
create policy "admins read player_favorites"
  on public.player_favorites
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Remove the earlier draft's functions if they were ever applied.
drop function if exists public.player_favorites_get(text, text, text);
drop function if exists public.player_favorites_set(text, text, text, jsonb, bigint);
drop function if exists public.player_favorites_verify(text, text, text);
drop function if exists public.player_favorites_normalize_host(text);

-- ── the one write path ─────────────────────────────────────────────────────
--
-- Service-role only. The edge function has already verified the line and
-- normalised host/username; this does the compare-and-set atomically under a
-- row lock and reports what the row holds afterwards either way.
--
-- version = microseconds since the epoch of updated_at. Microseconds rather
-- than milliseconds so two writes to one line can never share a version.

create or replace function public.player_favorites_version(p_ts timestamptz)
returns bigint
language sql
immutable
as $$
  select (extract(epoch from p_ts) * 1000000)::bigint;
$$;

create or replace function public.player_favorites_upsert_cas(
  p_host         text,
  p_username     text,
  p_favorites    jsonb,
  p_base_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur   timestamptz;
  v_favs  jsonb;
  v_new   timestamptz := clock_timestamp();
begin
  if p_favorites is null or jsonb_typeof(p_favorites) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_favorites');
  end if;

  select updated_at into v_cur
  from public.player_favorites
  where panel_host = p_host and panel_username = p_username
  for update;

  if not found then
    -- No row yet. Any base is acceptable: there is nothing to conflict with.
    insert into public.player_favorites (panel_host, panel_username, favorites, updated_at)
    values (p_host, p_username, p_favorites, v_new);
    return jsonb_build_object(
      'ok', true, 'applied', true,
      'favorites', p_favorites,
      'version', public.player_favorites_version(v_new)
    );
  end if;

  if p_base_version is null or public.player_favorites_version(v_cur) <> p_base_version then
    -- The caller's copy is not the row's current version. Hand back what the
    -- row holds so the client can merge its changes into it and retry.
    select favorites into v_favs
    from public.player_favorites
    where panel_host = p_host and panel_username = p_username;
    return jsonb_build_object(
      'ok', true, 'applied', false,
      'favorites', v_favs,
      'version', public.player_favorites_version(v_cur)
    );
  end if;

  update public.player_favorites
  set favorites = p_favorites, updated_at = v_new
  where panel_host = p_host and panel_username = p_username;

  return jsonb_build_object(
    'ok', true, 'applied', true,
    'favorites', p_favorites,
    'version', public.player_favorites_version(v_new)
  );
end;
$$;

-- The read path. Service-role only, like the write path. Exists so the
-- version a client receives on GET is produced by the very same expression
-- that produces it on SET — one definition of "version", in SQL, not two.
create or replace function public.player_favorites_read(
  p_host     text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_favs jsonb;
  v_ts   timestamptz;
begin
  select favorites, updated_at into v_favs, v_ts
  from public.player_favorites
  where panel_host = p_host and panel_username = p_username;
  if not found then
    -- Distinct from an empty list: "nothing saved yet" lets the client seed
    -- the cloud from whatever this device already has.
    return jsonb_build_object('ok', true, 'favorites', null, 'version', null);
  end if;
  return jsonb_build_object(
    'ok', true,
    'favorites', v_favs,
    'version', public.player_favorites_version(v_ts)
  );
end;
$$;

-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated by default privilege, and `revoke ... from public` alone does
-- NOT undo that. Revoke from each role explicitly. service_role keeps its
-- grant, which is the only caller.
revoke all on function public.player_favorites_version(timestamptz) from public, anon, authenticated;
revoke all on function public.player_favorites_upsert_cas(text, text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.player_favorites_read(text, text) from public, anon, authenticated;
