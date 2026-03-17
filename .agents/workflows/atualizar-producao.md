---
description: Como reconstruir os bancos e subir as últimas alterações para produção
---

# Reconstruir e Atualizar Produção

Este workflow documenta os comandos necessários para reconstruir a infraestrutura (bancos de dados, backend e frontend) e aplicar as últimas alterações do código no ambiente de produção.

## Passos

1. Acesse o terminal na raiz do projeto (onde está o arquivo `docker-compose.yml`).
2. Execute o comando abaixo para reconstruir e subir as alterações:

```bash
// turbo
docker compose up -d --build
```

### Detalhes do Comando

* `up`: Inicia os serviços definidos no `docker-compose.yml`.
* `-d` (detached): Executa os contêineres em segundo plano para não travar o terminal.
* `--build`: Força a reconstrução das imagens Docker antes de iniciar os contêineres. Isso é essencial para garantir que as alterações mais recentes nos códigos fonte (ex. pastas `backend` e `web`) sejam incluídas nas novas imagens de produção.
