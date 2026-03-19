---
description: Feed Obsidian de ingestão para novos recursos
---

# Feed de novas ideias para implementação

Este workflow serve como stack de alimentação para o agente buscar novas ideias, ingeri-las, traduzi-las para a realidade do VANTAGE e colocá-las em fila para implementação no momento oportuno.

## Fonte canônica

Usar sempre este mesmo caminho como origem:

`/home/nilsonpmjr/GoogleDrive/Obsidian/2. 💡Ideas/1. 📓 Notes/VANTAGE/VANTAGE — Acompanhamento.md`

## Objetivo

Transformar ideias soltas em itens triados e rastreáveis, sem pular direto para implementação.

O workflow existe para garantir que:

- ideia não vira código sem passar por tradução para o projeto real;
- não haja retrabalho por ingestão duplicada;
- cada ideia seja roteada para a trilha correta;
- PRD e TODO só sejam criados quando fizer sentido;
- implementação só aconteça depois de aprovação explícita do usuário.

## Passos

1. Acessar o caminho canônico do Obsidian.
2. Ler apenas itens não concluídos e com `idea_id` definido.
3. Extrair cada ideia candidata.
4. Normalizar a ideia em um registro interno.
5. Verificar se o `idea_id` já foi ingerido antes.
6. Classificar a ideia em uma destas saídas:
   - `trilha_existente`
   - `novo_prd`
   - `backlog`
   - `descartar`
7. Traduzir a ideia para a realidade atual do repositório.
8. Propor PRD/TODO ao usuário quando necessário.
9. Parar antes de qualquer implementação.

## Semântica oficial das tags

Estas tags devem ser interpretadas literalmente pelo workflow:

- `🏁` = item ativo / elegível para acompanhamento
- `⛔ <id>` = bloqueado por outro item (`blocked_by`)
- `🆔 <id>` = identificador estável do item (`idea_id`)
- `➕` = criado hoje
- `🔁` = recorrente
- `⏬` = prioridade baixa
- `⏳` = agendado / em espera temporal
- `🛫` = início / start date
- `📅` = due date
- `🔺` = prioridade mais alta
- `🔼` = prioridade alta
- `⏫` = prioridade média
- `🔽` = prioridade mais baixa

## Regras de parsing

- Somente `🆔 <id>` define o `idea_id` oficial do item.
- `⛔ <id>` nunca deve ser tratado como `idea_id`; ele deve preencher `blocked_by`.
- Um item sem `🆔` continua fora do intake formal, mesmo que tenha `⛔`.
- Tags de prioridade devem ser convertidas para um campo normalizado de prioridade.
- Tags de data devem ser preservadas como metadata, sem inventar datas ausentes.

## Formato obrigatório de saída

Ao ingerir uma ideia, o agente deve produzir um registro com este shape:

```md
Idea Intake:
- idea_id:
- titulo:
- texto_original:
- resumo_normalizado:
- trilha_sugerida:
- destino:
- impacto:
- prioridade:
- blocked_by:
- datas:
- dependencias:
- status:
- proxima_acao:
```

### Campos

- `idea_id`: identificador estável vindo do Obsidian
- `titulo`: título curto da ideia
- `texto_original`: texto original resumido ou referenciado
- `resumo_normalizado`: tradução da ideia para linguagem de produto/projeto
- `trilha_sugerida`: trilha existente da fase atual, se houver
- `destino`: `trilha_existente`, `novo_prd`, `backlog` ou `descartar`
- `impacto`: `baixo`, `medio` ou `alto`
- `prioridade`: `mais_alta`, `alta`, `media`, `baixa` ou `mais_baixa`
- `blocked_by`: `idea_id` do item bloqueador quando houver `⛔`
- `datas`: mapa curto com `created`, `start`, `scheduled`, `due` quando presentes
- `dependencias`: PRDs, trilhas ou features das quais depende
- `status`: `novo`, `triado`, `documentado`, `aprovado`, `descartado`
- `proxima_acao`: o que deve acontecer depois

## Regras de deduplicação

- Nunca ingerir duas vezes o mesmo `idea_id` como se fosse item novo.
- Se o `idea_id` já tiver sido triado, atualizar o registro existente em vez de recriá-lo.
- Se a ideia já tiver PRD/TODO associado, apenas apontar o vínculo e atualizar o status.
- Se duas ideias diferentes apontarem para o mesmo trabalho, vincular ambas ao mesmo destino em vez de criar artefatos paralelos.

## Destino canônico dentro do projeto

Os registros normalizados devem apontar para um backlog interno do projeto.

Destino recomendado:

`docs/VANTAGE/backlog-ideas.md`

Se esse arquivo ainda não existir, o agente pode propor sua criação, mas não deve bloquear a triagem por isso.

## Regras de roteamento

Cada ideia ingerida deve cair em apenas um destes caminhos:

### 1. `trilha_existente`

Use quando:

- a ideia já pertence claramente a uma trilha ativa;
- já existe PRD compatível;
- a ideia é expansão natural de algo que já está planejado.

Saída esperada:

- atualizar TODO/PRD correspondente;
- pedir aprovação do usuário se isso mudar escopo.

### 2. `novo_prd`

Use quando:

- a ideia muda escopo de produto;
- a ideia cria uma frente nova;
- não existe trilha adequada no roadmap atual.

Saída esperada:

- propor criação de PRD próprio;
- depois propor TODO operacional;
- aguardar aprovação do usuário.

### 3. `backlog`

Use quando:

- a ideia é válida, mas ainda não está madura;
- depende de decisões futuras;
- compete com prioridades maiores.

Saída esperada:

- registrar no backlog interno;
- não abrir implementação.

### 4. `descartar`

Use quando:

- a ideia estiver duplicada;
- a ideia conflitar com decisões já tomadas;
- a ideia não fizer sentido para o produto atual.

Saída esperada:

- registrar motivo de descarte;
- não gerar PRD/TODO.

## Regras obrigatórias

- Não implementar sem antes documentar e traduzir a ideia para a realidade do projeto.
- Não implementar sem antes criar ou atualizar PRD/TODO quando necessário.
- Não implementar sem aprovação explícita do usuário.
- Não criar PRD novo se a ideia já couber claramente em trilha existente.
- Não abrir TODO novo se o trabalho já estiver coberto em TODO atual.
- Não misturar intake de ideias com execução de código na mesma etapa.

## Papel dos agentes

### Claude Code / Codex

Podem:

- ler e triar ideias;
- normalizar e classificar;
- propor PRD/TODO;
- atualizar backlog interno;
- pedir aprovação do usuário.

Não podem:

- implementar diretamente a partir do Obsidian;
- assumir que uma ideia nova substitui decisões já aprovadas;
- criar múltiplos documentos redundantes para a mesma ideia.

## Condição de parada

O workflow termina quando a ideia estiver em um destes estados:

- `triado`
- `documentado`
- `aprovado`
- `descartado`

Ele não continua para implementação automaticamente.

## Observação operacional

Como a fonte está fora do workspace principal, a leitura desse caminho pode depender do ambiente e das permissões do agente da vez.

Se o acesso direto falhar:

- registrar que a fonte está fora do workspace;
- pedir ajuda do usuário apenas para destravar a leitura;
- não inventar conteúdo nem pular a etapa de intake.
