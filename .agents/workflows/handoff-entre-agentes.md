---
description: Regra operacional de handoff entre Gemini Pro, Claude Code e Codex neste workspace
---

# Handoff Entre Agentes

Este workspace usa uma regra explicita de passagem de trabalho entre agentes.

## Regra Canonica

Skill:

- `.agents/skills/workspace-agent-handoff/SKILL.md`

## Ordem Padrao

1. Gemini Pro
2. Claude Code
3. Codex

Dono final da integracao: `Codex`.

Esta ordem e padrao, nao trilho fixo. A bola pode voltar quando o owner atual encontrar um bloqueio que pertence mais claramente a outro agente.

## Regra Curta

- Gemini entra para ler referencia, decompor interface e propor tokens.
- Claude Code entra para gerar blocos isolados, scaffolding, trabalho mecanico em lote e backend de baixo risco.
- Codex entra para integrar no repositorio real, consolidar primitives, refatorar, testar e validar.

Exemplos de retorno:

- Codex -> Claude Code: falta um lote grande de arquivos, placeholders ou boilerplate.
- Codex -> Gemini Pro: falta direcao visual confiavel para seguir sem adivinhar.

## Regra de Parada

Cada agente deve parar quando a proxima etapa pertencer mais claramente a outro agente do que a ele.

Nao vale:

- continuar editando por inercia
- dois agentes trabalhando no mesmo arquivo ao mesmo tempo
- redefinir tokens, naming ou contratos sem registrar no handoff

Checagem curta antes do handoff e permitida:

- `npm run build`
- teste pontual
- sanity check de import/sintaxe

Isso ajuda a evitar ida e volta por erro trivial, mas nao substitui a validacao final do integrador.

## Pacote Obrigatorio de Passagem

```md
Handoff:
- Goal:
- Done:
- Files touched:
- Decisions made:
- Assumptions:
- Validation:
- Open risks:
- Next owner:
- Next action:
- Stop reason:
```

Se houver duvida real de direcao, a bola volta para o usuario e nao para outro agente.

## Regra de Entrega

Ao finalizar uma implementacao de sessao ou milestone:

- o agente precisa entregar o handoff na resposta final
- o mesmo handoff precisa ser salvo em `docs/handoffs/`

Padrao sugerido de nome:

- `YYYY-MM-DD-sessao-a.md`
- `YYYY-MM-DD-sessao-b.md`
- `YYYY-MM-DD-nome-da-feature.md`
