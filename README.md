# Ofix V546.11.2 Modular

Versão modular para GitHub Pages, mantendo o layout visual antigo do OficinaOS e usando motor limpo com `STATE` central.

## Como abrir

Em servidor local ou GitHub Pages:

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

> Observação: por usar `type="module"`, alguns navegadores bloqueiam imports abrindo diretamente por `file://`.

## Estrutura

- `assets/css`: base, layout e módulos.
- `assets/js/core`: app, router, state e storage.
- `assets/js/modules`: abas do sistema.
- `assets/js/services`: cálculos, PIX, NF-e, PDF e WhatsApp.
- `assets/js/utils`: formatação e validação.
- `assets/js/data`: simulação fictícia.

## Fluxo aplicado

1. Orçamento centraliza cliente/serviço.
2. Cliente vira CRM/histórico.
3. Orçamento aprovado cria recebíveis, PIX e NF-e no Financeiro.
4. Receita só entra no caixa após confirmação de pagamento.
5. Recibo nasce no Financeiro.
6. Relatórios e IA apenas leem dados consolidados.


## Correção V546.11.2
- Cache busting nos módulos JS (`?v=546112`).
- Proteção contra `orcHoras` ausente no módulo Orçamento.
- Recomendado apagar arquivos antigos do repositório antes de reenviar.
