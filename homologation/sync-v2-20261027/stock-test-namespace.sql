-- Isola a candidata de estoque sem migrar dados ou alterar permissões.
DO $guard$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.oficinaos_sync_commit(text,bigint,uuid,jsonb)'::regprocedure) INTO definition;
  IF position($old$p_namespace not in ('homologacao','producao','homologacao_v2')$old$ in definition)=0 THEN
    RAISE EXCEPTION 'Assinatura de ambientes diferente da revisada';
  END IF;
  EXECUTE replace(definition,
    $old$p_namespace not in ('homologacao','producao','homologacao_v2')$old$,
    $new$p_namespace not in ('homologacao','producao','homologacao_v2','homologacao_estoque_v1')$new$);
END $guard$;
ALTER TABLE public.oficinaos_sync_heads DROP CONSTRAINT oficinaos_sync_heads_namespace_check;
ALTER TABLE public.oficinaos_sync_heads ADD CONSTRAINT oficinaos_sync_heads_namespace_check CHECK(namespace IN ('homologacao','producao','homologacao_v2','homologacao_estoque_v1'));
ALTER TABLE public.oficinaos_sync_versions DROP CONSTRAINT oficinaos_sync_versions_namespace_check;
ALTER TABLE public.oficinaos_sync_versions ADD CONSTRAINT oficinaos_sync_versions_namespace_check CHECK(namespace IN ('homologacao','producao','homologacao_v2','homologacao_estoque_v1'));
