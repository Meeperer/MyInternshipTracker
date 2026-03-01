-- Events table for calendar events & meetings
do $$ begin
  create type public.event_type as enum ('meeting', 'deadline', 'reminder', 'personal');
exception when duplicate_object then null;
end $$;

create table if not exists public.events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  title text not null check (char_length(trim(title)) >= 1 and char_length(title) <= 200),
  description text default '',
  start_time time,
  end_time time,
  type public.event_type not null default 'personal',
  reminder_enabled boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_events_user_id on public.events(user_id);
create index if not exists idx_events_date on public.events(date);
create index if not exists idx_events_user_date on public.events(user_id, date);

alter table public.events enable row level security;

create policy "Users can view own events"
  on public.events for select using (auth.uid() = user_id);
create policy "Users can insert own events"
  on public.events for insert with check (auth.uid() = user_id);
create policy "Users can update own events"
  on public.events for update using (auth.uid() = user_id);
create policy "Users can delete own events"
  on public.events for delete using (auth.uid() = user_id);

alter table public.events add constraint events_time_order
  check (start_time is null or end_time is null or start_time < end_time);

