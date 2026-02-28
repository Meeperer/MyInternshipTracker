-- ============================================
-- Internship Journal Tracker - Supabase Schema
-- ============================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  full_name text,
  internship_company text,
  target_hours numeric default 468,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Journal entries table
create table public.journals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  hours numeric(4,1) not null check (hours >= 0 and hours <= 24),
  content_raw text,
  content_ai_refined text,
  aras_action text,
  aras_reflection text,
  aras_analysis text,
  aras_summary text,
  status text default 'draft' check (status in ('draft', 'finished')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- Internship progress tracking
create table public.internship_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  total_hours numeric(6,1) default 0,
  days_completed integer default 0,
  current_streak integer default 0,
  longest_streak integer default 0,
  is_completed boolean default false,
  completed_at timestamptz,
  updated_at timestamptz default now()
);

-- AI processing logs
create table public.ai_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  journal_id uuid references public.journals(id) on delete cascade not null,
  action text not null check (action in ('refine', 'aras', 'compile')),
  input_text text,
  output_text text,
  model text,
  tokens_used integer,
  created_at timestamptz default now()
);

-- Compiled reports
create table public.compiled_reports (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  date_range_start date not null,
  date_range_end date not null,
  total_hours numeric(6,1) not null,
  total_days integer not null,
  report_data jsonb not null,
  created_at timestamptz default now()
);

-- Indexes
create index idx_journals_user_date on public.journals(user_id, date);
create index idx_journals_status on public.journals(status);
create index idx_ai_logs_journal on public.ai_logs(journal_id);
create index idx_ai_logs_user on public.ai_logs(user_id);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.journals enable row level security;
alter table public.internship_progress enable row level security;
alter table public.ai_logs enable row level security;
alter table public.compiled_reports enable row level security;

-- Policies: users can only access their own data
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can view own journals"
  on public.journals for select using (auth.uid() = user_id);

create policy "Users can insert own journals"
  on public.journals for insert with check (auth.uid() = user_id);

create policy "Users can update own draft journals"
  on public.journals for update
  using (auth.uid() = user_id and status = 'draft')
  with check (auth.uid() = user_id);

-- Finish day: run as definer so RLS does not block the status change to 'finished'
create or replace function public.finish_journal_day(p_journal_id uuid, p_user_id uuid)
returns setof public.journals
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.journals
  set status = 'finished', updated_at = now()
  where id = p_journal_id and user_id = p_user_id and status = 'draft'
  returning *;
end;
$$;

grant execute on function public.finish_journal_day(uuid, uuid) to authenticated;
grant execute on function public.finish_journal_day(uuid, uuid) to service_role;

create policy "Users can view own progress"
  on public.internship_progress for select using (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.internship_progress for update using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on public.internship_progress for insert with check (auth.uid() = user_id);

create policy "Users can view own ai logs"
  on public.ai_logs for select using (auth.uid() = user_id);

create policy "Users can insert own ai logs"
  on public.ai_logs for insert with check (auth.uid() = user_id);

create policy "Users can view own reports"
  on public.compiled_reports for select using (auth.uid() = user_id);

create policy "Users can insert own reports"
  on public.compiled_reports for insert with check (auth.uid() = user_id);

-- Function: auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.internship_progress (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function: recalculate progress after journal update
create or replace function public.recalculate_progress()
returns trigger as $$
declare
  v_total numeric;
  v_days integer;
  v_streak integer := 0;
  v_longest integer := 0;
  v_prev_date date;
  v_last_finished date;
  rec record;
begin
  select coalesce(sum(hours), 0), count(*)
  into v_total, v_days
  from public.journals
  where user_id = coalesce(new.user_id, old.user_id)
    and status = 'finished';

  for rec in
    select date from public.journals
    where user_id = coalesce(new.user_id, old.user_id)
      and status = 'finished'
    order by date desc
  loop
    if v_prev_date is null or rec.date = v_prev_date - interval '1 day' then
      v_streak := v_streak + 1;
    else
      if v_streak > v_longest then v_longest := v_streak; end if;
      v_streak := 1;
    end if;
    v_prev_date := rec.date;
  end loop;

  if v_streak > v_longest then v_longest := v_streak; end if;

  -- Current streak: only count if most recent finished day is today or yesterday
  select date into v_last_finished
  from public.journals
  where user_id = coalesce(new.user_id, old.user_id)
    and status = 'finished'
  order by date desc
  limit 1;
  if v_last_finished is null or v_last_finished < current_date - interval '1 day' then
    v_streak := 0;
  end if;

  update public.internship_progress
  set total_hours = v_total,
      days_completed = v_days,
      current_streak = v_streak,
      longest_streak = v_longest,
      is_completed = (v_total >= 468),
      completed_at = case when v_total >= 468 then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
  where user_id = coalesce(new.user_id, old.user_id);

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger on_journal_change
  after insert or update or delete on public.journals
  for each row execute function public.recalculate_progress();
