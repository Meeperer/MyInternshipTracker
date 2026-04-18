create table if not exists public.journal_period_summaries (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  period_type text not null check (period_type in ('week', 'month')),
  start_date date not null,
  end_date date not null,
  summary text not null,
  entry_count integer not null default 0 check (entry_count >= 0),
  summarized_entry_count integer not null default 0 check (summarized_entry_count >= 0),
  total_hours numeric(6, 2) not null default 0,
  model text default 'llama-3.1-8b-instant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_period_summaries_unique_range unique (user_id, period_type, start_date, end_date)
);

create index if not exists idx_journal_period_summaries_user_id
  on public.journal_period_summaries(user_id);

create index if not exists idx_journal_period_summaries_lookup
  on public.journal_period_summaries(user_id, period_type, start_date, end_date);

alter table public.journal_period_summaries enable row level security;

create policy "Users can view own journal period summaries"
  on public.journal_period_summaries for select using (auth.uid() = user_id);

create policy "Users can insert own journal period summaries"
  on public.journal_period_summaries for insert with check (auth.uid() = user_id);

create policy "Users can update own journal period summaries"
  on public.journal_period_summaries for update using (auth.uid() = user_id);

create policy "Users can delete own journal period summaries"
  on public.journal_period_summaries for delete using (auth.uid() = user_id);
