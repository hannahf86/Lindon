-- =============================================================================
-- 0027_message_retention.sql — the 5-year message clear-out (safeguarding)
--
-- Messages are kept as a permanent record and can't be edited or deleted by
-- the app. The one exception is this clear-out: purge_old_messages(cutoff)
-- deletes messages sent before the cutoff (the daily job passes "5 years
-- ago"), then any conversations left with no messages at all. It flips a
-- transaction-only flag that the protect trigger checks, so nothing else can
-- delete messages. Callable only by the server (service role).
-- =============================================================================
create or replace function public.protect_messages()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.body is distinct from old.body or new.sender is distinct from old.sender
       or new.sender_email is distinct from old.sender_email or new.created_at is distinct from old.created_at
       or new.conversation_id is distinct from old.conversation_id then
      raise exception 'Messages cannot be edited';
    end if;
    return new;
  end if;
  -- Deletes: allowed when cascading from a conversation / teacher, or by the clear-out
  if pg_trigger_depth() = 1 and coalesce(current_setting('lindon.message_purge', true), '') <> 'on' then
    raise exception 'Messages cannot be deleted';
  end if;
  return old;
end $$;

create or replace function public.purge_old_messages(cutoff timestamptz)
returns table (messages_deleted integer, conversations_deleted integer)
language plpgsql security definer set search_path = public as $$
declare m integer; c integer;
begin
  if cutoff > now() - interval '5 years' + interval '1 day' then
    raise exception 'Only messages more than 5 years old can be cleared out';
  end if;
  perform set_config('lindon.message_purge', 'on', true);  -- this transaction only
  delete from public.messages where created_at < cutoff;
  get diagnostics m = row_count;
  delete from public.conversations cv
   where not exists (select 1 from public.messages ms where ms.conversation_id = cv.id)
     and cv.last_message_at < cutoff;
  get diagnostics c = row_count;
  perform set_config('lindon.message_purge', 'off', true);
  return query select m, c;
end $$;

revoke all on function public.purge_old_messages(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_old_messages(timestamptz) to service_role;

notify pgrst, 'reload schema';
