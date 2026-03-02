---
name: sast-automated-review
description: Identifica vulnerabilidades de segurança (SQLi, XSS, etc) no código fonte em tempo real.
---

# SAST (Static Application Security Testing)

## Objetivo

Detectar falhas de segurança no código antes que elas cheguem ao ambiente de produção.

## Como Usar

Para cada alteração significativa no código:

1. **Scanner Automático**: Execute uma ferramenta de SAST (ex: `semgrep` ou `snyk code test`).
2. **Revisão Contextual**: O agente deve revisar o código focado em vetores de ataque comuns no OWASP Top 10.
3. **Geração de Alerta**: Se uma falha for encontrada, documente-a com:
    - Gravidade (Critica, Alta, Media, Baixa)
    - Localização (Arquivo e Linha)
    - Recomendação de Correção

## Ferramentas Sugeridas

- Semgrep: `semgrep scan --config auto`
- Snyk CLI: `snyk test`
