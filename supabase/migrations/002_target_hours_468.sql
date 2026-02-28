-- Align target hours with app constant (468). Run after 001.

alter table public.profiles
  alter column target_hours set default 468;

update public.profiles set target_hours = 468 where target_hours = 486;

create or replace function public.recalculate_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_days integer;
  v_streak integer := 0;
  v_longest integer := 0;
  v_prev_date date;
  v_last_finished date;
  rec record;
  v_target numeric := 468;
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
      is_completed = (v_total >= v_target),
      completed_at = case when v_total >= v_target then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
  where user_id = coalesce(new.user_id, old.user_id);

  return coalesce(new, old);
end;
$$;
