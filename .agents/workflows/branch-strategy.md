---
description: Estrategia de branches do projeto VANTAGE — dev como homologacao, main como producao
---

# Estrategia de Branches

## Regra canonica

- **`dev`** — branch de homologacao. Todo codigo que funciona vai aqui. Features devem ser entregues **completas e funcionais**, nao como stubs ou MVPs.
- **`main`** — branch de producao. So recebe merge de `dev` quando o codigo estiver pronto para deploy de infraestrutura real.

## Regras para agentes

1. **Trabalhe sempre em `dev`** (ou em feature branches que fazem merge em `dev`).
2. **Nunca faca push direto para `main`** — use PR de `dev` para `main`.
3. **Entregue funcionalidade pronta** — nao use badges "MVP", stubs, ou placeholders. Se a feature nao esta pronta, nao faca merge em `dev`.
4. **Testes devem passar** antes de qualquer merge em `dev`.
5. **Lint deve estar limpo** antes de qualquer merge em `dev`.
6. **Build deve completar** antes de qualquer merge em `dev`.

## O que pode estar em `dev` mas nao em `main`

- Features completas em homologacao aguardando validacao visual/funcional do usuario.
- Codigo que depende de infraestrutura ainda nao provisionada (ex: provider Sherlock real).
- Configuracoes de ambiente de homologacao.

## O que nunca deve estar em nenhuma branch

- Secrets, API keys, ou `.env` com valores reais.
- Stubs que retornam dados falsos sem sinalizacao clara.
- Codigo morto ou imports nao utilizados.

## Fluxo resumido

```
feature-branch → dev (homologacao) → main (producao)
```

Se uma feature precisa de mais de uma sessao, ela pode ter sua propria branch que faz merge em `dev` quando completa.
