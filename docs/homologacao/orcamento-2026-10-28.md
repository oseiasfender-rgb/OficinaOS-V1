# Homologação do Orçamento — 28/10/2026

Versão: sync-v2-20261027-r5-quota1.
Commit avaliado: 98f05fda2ec04044226d5b8a93c9ff8c114ec739.
Ambiente: homologacao_v2, com dados de teste separados da produção.

## Resultado aprovado

Oséias Moreira confirmou a execução de “Manter todos ativos e corrigir numeração” no PC e Motorola G75 Android. As capturas mostram ambos os registros ativos no PC: Teste 28, orc_008, R$ 6.000,00; Teste, orc_009, R$ 1.875,00. O usuário confirmou que os resultados estão corretos nos dois aparelhos e que as fotos estão presentes em ambos. A conferência visual das fotos foi realizada pelo usuário; o agente não controlou os navegadores físicos.

Em 28/10/2026 o usuário autorizou registrar esta homologação no GitHub.

## Evidências complementares

Antes deste cenário, ambos os aparelhos confirmaram a revisão 40. Não foi apresentada a revisão final após a nova renumeração; não se atribui a revisão 40 ao novo resultado.

Teste isolado com os backups anteriores, base reconstruída e servidor simulado: keep-all nos dois conflitos resultou em nove registros ativos, números únicos e nenhum arquivado; IDs e campos quotePhoto/stagePhotos foram comparados integralmente com ambos os backups. A simulação não substitui a conferência física do usuário.

## Escopo

APROVADO o cenário testado de resolução de numeração duplicada com manutenção dos registros ativos e fotos nos dois aparelhos. Não constitui aprovação irrestrita de todos os fluxos de Orçamento ou demais módulos, nem publicação em produção. Branch main, versão instalada e dados de produção não foram alterados por este registro. Backups, fotos e credenciais não integram este documento.
