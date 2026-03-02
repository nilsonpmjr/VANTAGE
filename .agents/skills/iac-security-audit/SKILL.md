---
name: iac-security-audit
description: Audita scripts de infraestrutura (Terraform, Dockerfiles) em busca de configurações inseguras.
---

# IaC (Infrastructure as Code) Security Audit

## Objetivo

Identificar erros de configuração em arquivos de infraestrutura que possam expor o ambiente.

## Como Usar

Para cada arquivo de infraestrutura (`Dockerfile`, `docker-compose.yml`, `.tf`, etc):

1. **Linter de Segurança**: Execute ferramentas como `hadolint` (Docker) ou `checkov` (Multi-cloud).
2. **Princípio do Menor Privilégio**: Verifique se portas desnecessárias estão expostas ou se containers rodam como `root`.

## Melhores Práticas

- Nunca armazene variáveis sensíveis em Dockerfiles.
- Use imagens base oficiais e minimalistas.
