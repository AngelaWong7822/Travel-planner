-- 旅行筆記：雲端同步
-- 同 PM tracker 共用「PM Management」Supabase project，所以 table 同 bucket 都加 travel 前綴，
-- 唔會郁到 PM 嘅 projects / tasks / task-attachments。
-- 喺 Supabase → SQL Editor 貼晒成段執行一次就得（重複執行都唔會出錯）

-- ── 旅程：一個旅程一行，成個旅程放喺 data（JSON） ──
create table if not exists public.travel_trips (
    id uuid primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    deleted boolean not null default false
);

create index if not exists travel_trips_user_id_idx on public.travel_trips (user_id);

alter table public.travel_trips enable row level security;

-- 每個人只可以睇同改自己嘅旅程
drop policy if exists "travel_trips: own rows" on public.travel_trips;
create policy "travel_trips: own rows" on public.travel_trips
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ── 相片／PDF：私人 bucket，每個人一個資料夾（資料夾名 = user id） ──
insert into storage.buckets (id, name, public)
values ('travel-images', 'travel-images', false)
on conflict (id) do nothing;

drop policy if exists "travel-images: own folder read" on storage.objects;
create policy "travel-images: own folder read" on storage.objects
    for select
    using (bucket_id = 'travel-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "travel-images: own folder insert" on storage.objects;
create policy "travel-images: own folder insert" on storage.objects
    for insert
    with check (bucket_id = 'travel-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "travel-images: own folder update" on storage.objects;
create policy "travel-images: own folder update" on storage.objects
    for update
    using (bucket_id = 'travel-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "travel-images: own folder delete" on storage.objects;
create policy "travel-images: own folder delete" on storage.objects
    for delete
    using (bucket_id = 'travel-images' and (storage.foldername(name))[1] = auth.uid()::text);
