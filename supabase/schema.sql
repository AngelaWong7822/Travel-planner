-- 旅行筆記：雲端同步
-- 喺 Supabase → SQL Editor 貼晒成段執行一次就得（重複執行都唔會出錯）

-- ── 旅程：一個旅程一行，成個旅程放喺 data（JSON） ──
create table if not exists public.trips (
    id uuid primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    deleted boolean not null default false
);

create index if not exists trips_user_id_idx on public.trips (user_id);

alter table public.trips enable row level security;

-- 每個人只可以睇同改自己嘅旅程
drop policy if exists "trips: own rows" on public.trips;
create policy "trips: own rows" on public.trips
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ── 相片／PDF：私人 bucket，每個人一個資料夾（資料夾名 = user id） ──
insert into storage.buckets (id, name, public)
values ('trip-images', 'trip-images', false)
on conflict (id) do nothing;

drop policy if exists "trip-images: own folder read" on storage.objects;
create policy "trip-images: own folder read" on storage.objects
    for select
    using (bucket_id = 'trip-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "trip-images: own folder insert" on storage.objects;
create policy "trip-images: own folder insert" on storage.objects
    for insert
    with check (bucket_id = 'trip-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "trip-images: own folder update" on storage.objects;
create policy "trip-images: own folder update" on storage.objects
    for update
    using (bucket_id = 'trip-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "trip-images: own folder delete" on storage.objects;
create policy "trip-images: own folder delete" on storage.objects
    for delete
    using (bucket_id = 'trip-images' and (storage.foldername(name))[1] = auth.uid()::text);
