-- Isolate the existing 64 MiB backup quota by account AND environment.
-- No snapshots, permissions, authentication or payload limits are changed.
do $migration$
declare
  definition text;
  previous_line text := 'from public.oficinaos_sync_versions where owner_id=caller;';
begin
  definition := pg_get_functiondef('public.oficinaos_sync_commit(text,bigint,uuid,jsonb)'::regprocedure);
  if position(previous_line in definition)=0 or position('bytes_used+octet_length(p_payload::text)>67108864' in definition)=0 then
    raise exception 'Unexpected sync commit definition; quota migration aborted';
  end if;
  definition := replace(definition, previous_line, 'from public.oficinaos_sync_versions where owner_id=caller and namespace=p_namespace;');
  execute definition;
end;
$migration$;
