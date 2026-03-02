---
name: secret-scanning
description: Detecção automática de chaves de API, senhas e tokens no repositório.
---

# Secret Scanning

## Objetivo

Impedir o vazamento de credenciais no controle de versão (Git).

## Como Usar

Sempre que novos arquivos forem criados ou modificados:

1. **Scan de Entropia**: Buscar por strings de alta entropia que pareçam chaves.
2. **Tooling**: Use ferramentas como `gitleaks` ou `trufflehog`.
3. **Remediação**: Caso um segredo seja detectado, ele deve ser imediatamente revogado e o arquivo adicionado ao `.gitignore`.

## Dica

Nunca comite arquivos `.env`. Utilize o segredo via variáveis de ambiente do sistema.
