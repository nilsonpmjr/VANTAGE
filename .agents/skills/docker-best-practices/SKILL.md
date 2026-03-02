---
name: docker-best-practices
description: Melhores práticas para criar imagens Docker seguras e leves.
---

# Docker Best Practices

## Objetivo

Reduzir o tamanho das imagens, melhorar a segurança e acelerar o tempo de build.

## Como Usar

Ao editar `Dockerfile` ou `docker-compose.yml`:

### 1. Otimização de Imagem

- **Imagens Base Minimalistas**: Use versões `alpine` ou `slim` sempre que possível.
- **Multi-stage Builds**: Separe o ambiente de build do ambiente de execução para remover dependências desnecessárias da imagem final.
- **.dockerignore**: Exclua `node_modules`, `.git` e outros arquivos temporários do contexto de build.

### 2. Segurança e Camadas

- **Non-root USER**: Evite rodar o container como root. Use a instrução `USER` para um usuário com privilégios limitados.
- **Menos Camadas**: Combine comandos `RUN` semelhantes (ex: `RUN apt-get update && apt-get install ...`).
- **Ordem das Instruções**: Coloque as instruções que mudam menos (como instalação de dependências) antes das que mudam frequentemente (código fonte).

### 3. Gestão de Segredos

- **Nunca comite segredos**: Utilize variáveis de ambiente ou Docker Secrets para passar chaves de API e senhas.
