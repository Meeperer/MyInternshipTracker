-- Create finish_journal_day function (fixes PGRST202 "function not found in schema cache")
-- Run this in Supabase Dashboard → SQL Editor if the function is missing.

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
