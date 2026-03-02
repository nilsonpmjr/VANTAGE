---
name: sca-dependency-audit
description: Auditoria de integridade e vulnerabilidades em bibliotecas de terceiros (dependencies).
---

# SCA (Software Composition Analysis)

## Objetivo

Garantir que todas as dependências do projeto estejam livres de vulnerabilidades conhecidas (CVEs).

## Como Usar

1. **Identificar Manifestos**: Localize `requirements.txt`, `package.json`, `pom.xml`, etc.
2. **Auditoria**:
    - Python: `pip-audit -r requirements.txt`
    - Node.js: `npm audit`
3. **Correção**: Se vulnerabilidades forem encontradas, o agente deve sugerir a atualização para a versão segura mais próxima.

## Alerta de Risco

Sempre valide se a nova versão da dependência não introduz "breaking changes".
