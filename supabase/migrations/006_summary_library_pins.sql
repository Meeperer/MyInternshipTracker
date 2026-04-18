alter table if exists public.journal_period_summaries
  add column if not exists pinned boolean not null default false;

create index if not exists idx_journal_period_summaries_pinned_updated
  on public.journal_period_summaries(user_id, pinned desc, updated_at desc);
