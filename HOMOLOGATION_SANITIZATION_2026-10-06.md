# Saneamento autorizado e homologação concluída

O usuário autorizou atualizar/reorganizar os vínculos em 06/10/2026. Foram desvinculadas somente 11 referências fromTx sem alvo no snapshot original. O valor anterior permanece no histórico privado de saneamento. O backup original continua preservado no GitHub, criptografado.

Não foram criados lançamentos nem alterados valores, datas, status, IDs, pagamentos ou outras coleções. A igualdade desses campos foi conferida registro a registro e todos os ALL_TX permaneceram idênticos. Cada conta continua existente e operável sem ligação a um lançamento inexistente.

Snapshot original (NO-GO): 8edaf955eccd9f56aa373825a379a667fcd719e46e768a4928b4fe4a1857a239.
Snapshot saneado (GO): e9df0c002e4e5efb4e99f7e790939068886896711ff1699d0d4ee3f923c96945.

Homologação privada com Chromium: 94 testes PASS, serviços PASS, Vite PASS, 18 gates browser PASS. Todas as 10 etapas têm derivedCount=0, missingExpectedCount=0 e sourceLinksValid=true. Todos os gates do finalizador passaram; parecer GO para o snapshot saneado e código desta branch.

Não houve relaxamento do algoritmo ou das fórmulas. O contrato foi vinculado ao novo SHA-256 do snapshot autorizado. A origem original permanece NO-GO; este GO não comprova históricos de orçamentos ausentes no backup fornecido. Não significa publicação em produção ou alteração de main.

O workflow remoto usa fixture sintética; sua decisão isolada continua NO-GO por ausência de evidências privadas no runner. O parecer GO oficial provém da execução privada integral no snapshot saneado, documentada no pacote de evidências e resumo público.
