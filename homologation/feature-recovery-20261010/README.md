# Recuperação funcional do Index — 10/10/2026

Base: main 3054fedbe8572701761a9b8ad057ee5c30542c2d. Referência funcional: index_fase3_historico_agenda_integrados(8).html. O HTML e os backups reais não integram esta alteração.

## Incorporado

- DAS MEI novamente visível em Financeiro → Contas, com atualização do ano.
- Cenários de margem 20%, 30% e 50% clicáveis; sem gravação automática.
- PDF baixável, PNG, impressão e compartilhamento de orçamento; mensagem WhatsApp preservada.
- Recibo de serviço com cliente, veículo, valor e referência do lançamento; exclusivamente para receita paga, sem novo lançamento financeiro.
- PIX avulso local com QR Code e copia e cola, fora do resumo do orçamento; não registra nem confirma recebimento.
- Seleção de materiais cadastrados no orçamento, sem baixa automática do estoque.
- Catálogo de Peças Usadas & Recuperadas com cadastro, edição, busca, condição, aplicação, quantidade, valor, foto e cópia preventiva ao excluir.
- Fotos por etapa da OS, remoção e compartilhamento; persistência em IndexedDB e exportação JSON.
- Agenda com edição de veículo, serviço, entrada, entrega, horário, valor e observação, mantendo cliente e orçamento vinculados.
- Atalhos do orçamento salvo para Agenda/OS e receita pendente vinculada; repetição e sincronização de entrega reutilizam a receita existente.
- Consultor convertido em Manual local com busca, contextos, instruções do sistema, indicadores e ranking reais. Sem provedor externo na interface; assunto ausente é informado.
- Importação/exportação permanecem em JSON. Não foi adicionada exportação CSV.
- Identidade visual, fontes locais e estrutura modular preservadas. Nenhum dado real ou lista de estoque foi carregado automaticamente.

## Validação

164 testes unitários aprovados; compilação aprovada; testes gerais de importação, hashes financeiros, persistência, navegação, impressão e exportação/reimportação aprovados. Testes novos cobrem DAS, PIX, documentos, compartilhamento/alternativa de download, materiais sem baixa, catálogo, fotos/reload, JSON com novos dados, manual offline e ausência de transbordamento a 1440 e 390 pixels. PDF conferido pelo Poppler e visualmente. Os testes usam somente uma cópia sintética isolada.

## Limites e próximos passos

- Não é declaração de equivalência integral com cada função histórica do HTML, que contém substituições repetidas, atalhos e integrações externas.
- Leitura do PIX em aplicativo bancário real e envio pelo WhatsApp no Android instalado ainda dependem de conferência prática. O teste do caminho nativo de compartilhamento usa uma implementação controlada.
- Login/sincronização Google, emissão de NFS-e e integração com IA real não foram incorporados neste lote. IA real permanece opcional para uma etapa futura; parâmetros técnicos específicos exigem a documentação do fabricante.
- A versão precisa ser publicada antes da conferência no Android instalado.

## Referências

- [Código do gerador PIX](../../src/modules/documentos/pix.js)
- [Manual do Banco Central: padrões para iniciação do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf), exemplo estático das seções 2.6.3/2.6.4 e CRC 1D3D.
- [Testes dos recursos recuperados](../../tests/unit/recovered-features.test.js)
- [Teste em navegador](../../scripts/homologate-recovered-features.mjs)
- [Evidências](evidence.json)
