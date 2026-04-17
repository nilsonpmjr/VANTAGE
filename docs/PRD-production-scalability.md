# PRD: Vantage — Escalabilidade e Prontidão para Produção

**Versão:** 2.0
**Data:** 2026-04-17
**Autor:** Engenharia
**Status:** Draft
**Modelo de deploy:** Self-managed B2B (on-premise / infra do cliente)

---

## 1. Executive Summary

### Problem Statement

O Vantage Threat Intelligence Tool opera em modo single-worker com variáveis globais mutáveis sem proteção, criando race conditions sob carga concorrente. O semáforo de concorrência está subdimensionado (20 slots para chamadas externas) e não há cleanup de recursos de streaming, causando memory leaks em sessões longas.

### Proposed Solution

Corrigir todas as race conditions com primitivas asyncio (locks, semáforos), ajustar parâmetros de concorrência para suportar 100+ usuários simultâneos em um único processo async, e implementar cleanup automático de recursos. Zero dependências novas — o modelo single-process do asyncio compartilha memória nativamente, eliminando a necessidade de estado distribuído.

### Decisão Arquitetural: Por que NÃO Redis

O Vantage é um produto **self-managed B2B** — cada empresa cliente faz deploy na própria infraestrutura. Isso implica:

- **Cada dependência é custo de suporte.** A equipe de TI do cliente precisa manter o que for deployado. Redis adiciona uma peça móvel que precisa ser monitorada, atualizada e troubleshooted.
- **O cenário de uso é previsível.** Uma empresa com equipe SOC terá 10-100 analistas simultâneos, não milhares de usuários imprevisíveis.
- **Single-process asyncio resolve.** Um único processo Uvicorn com asyncio roda centenas de coroutines concorrentes compartilhando memória. `asyncio.Lock` e `asyncio.Semaphore` funcionam perfeitamente nesse modelo porque todas as coroutines vivem no mesmo event loop.
- **Problema de multi-worker não existe.** Race conditions entre processos só ocorrem se rodarmos múltiplos workers. Com 1 worker async otimizado, o bottleneck real são as APIs externas (10s de timeout), não o processamento local.

### Success Criteria

| KPI | Baseline Atual | Meta |
|-----|---------------|------|
| Usuários simultâneos suportados | ~20-30 | 100+ |
| Tempo de resposta p95 (analyze, cache miss) | ~10-12s | ≤ 12s |
| Tempo de resposta p95 (analyze, cache hit) | ~200-500ms | ≤ 500ms |
| Uptime mensal (SLA) | Não medido | 99.9% |
| Taxa de erro sob carga (5xx) | Não medido | < 0.5% |
| Chamadas externas duplicadas (mesmo alvo simultâneo) | Possível (race) | 0 |
| Memory leak por hora (job queues) | Unbounded | 0 (cleanup automático) |
| Dependências adicionais de infra | — | 0 |

---

## 2. User Experience & Functionality

### User Personas

| Persona | Descrição | Preocupação Principal |
|---------|-----------|----------------------|
| **Analista SOC** | Usa o Vantage em turnos, pesquisando IOCs durante triagem de alertas | Resposta rápida, sem timeouts durante picos de incidentes |
| **Líder de Equipe** | Gerencia equipe de 10-20 analistas usando a plataforma simultaneamente | Plataforma estável, sem degradação quando toda a equipe está online |
| **Administrador (TI do cliente)** | Faz deploy e mantém a plataforma na infra da empresa | Stack simples, poucos containers, fácil de monitorar e atualizar |

### User Stories

**US-01: Análise concorrente sem degradação**
> Como analista SOC, quero pesquisar IOCs enquanto meus colegas fazem o mesmo, sem que o tempo de resposta aumente significativamente.

**Acceptance Criteria:**
- Com 100 usuários simultâneos analisando alvos distintos, o p95 de resposta não excede 12s (cache miss) ou 500ms (cache hit)
- Nenhum request retorna erro 5xx por exaustão de recursos internos
- O semáforo de concorrência limita chamadas externas sem bloquear requests indefinidamente

**US-02: Deduplicação confiável de análises**
> Como analista SOC, se eu e um colega pesquisarmos o mesmo IP no mesmo momento, quero que apenas uma chamada às APIs externas seja feita e ambos recebam o resultado.

**Acceptance Criteria:**
- O lease distribuído via MongoDB impede chamadas duplicadas
- O `_analysis_inflight` dict protegido por `asyncio.Lock` garante dedup dentro do processo
- O segundo usuário recebe o resultado em ≤ 15s (tempo do lease + análise)
- Se o primeiro request falhar, o segundo faz retry automaticamente

**US-03: Batch jobs com streaming confiável**
> Como analista SOC, quero submeter um batch de 50 IOCs e acompanhar o progresso em tempo real, sem que a conexão caia ou consuma memória indefinidamente.

**Acceptance Criteria:**
- SSE streams de progresso entregam atualizações em tempo real
- Se o cliente desconectar, os recursos de streaming são liberados automaticamente
- Nenhuma fila de jobs órfã permanece em memória após conclusão ou desconexão
- Jobs concluídos têm suas queues removidas após TTL

**US-04: Deploy simples para TI do cliente**
> Como administrador de TI, quero fazer deploy do Vantage com `docker-compose up` sem precisar configurar ou manter serviços adicionais além do backend e MongoDB.

**Acceptance Criteria:**
- Stack de produção: 3 containers (frontend/nginx, backend, MongoDB) — nenhum a mais
- Configuração de performance via variáveis de ambiente (sem editar código)
- Health check endpoint reporta estado de todos os componentes

### Non-Goals

- **Redis ou qualquer dependência de infra adicional** — O stack permanece backend + MongoDB + nginx
- **Multi-worker / multi-processo** — Single-process async é suficiente para o cenário B2B
- **Migração de banco de dados** — MongoDB permanece como datastore principal
- **Otimização de APIs externas** — Não vamos negociar planos pagos ou trocar providers
- **Multi-tenancy** — O sistema é single-tenant por deploy
- **Auto-scaling** — Scaling vertical (mais CPU/RAM) é o modelo
- **Redesign de UI** — Apenas backend e middleware

---

## 3. Technical Specifications

### 3.1 Architecture Overview

```
                    ┌─────────────┐
                    │   Nginx     │
                    │ (frontend + │
                    │  reverse    │
                    │  proxy)     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Uvicorn    │
                    │  1 worker    │
                    │  (asyncio    │
                    │  event loop) │
                    │              │
                    │ ~100+ coros  │
                    │ simultâneas  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   MongoDB    │
                    │  (data +     │
                    │   cache +    │
                    │   leases)    │
                    └──────────────┘
```

**Por que funciona com 1 worker:** O Uvicorn com asyncio executa centenas de coroutines concorrentes em um único thread. Como as operações são I/O-bound (chamadas HTTP para APIs externas, queries MongoDB), o event loop alterna entre coroutines enquanto aguarda I/O. Não há CPU-bound blocking significativo no hot path.

### 3.2 Componentes Afetados

#### A. Race Conditions — Correção com asyncio.Lock

| Arquivo | Variável | Linha | Problema | Correção |
|---------|----------|-------|----------|----------|
| `clients/api_client_async.py` | `_service_cooldown` | 60 | Dict global mutável sem lock; dois requests concorrentes leem/escrevem simultaneamente | Proteger com `asyncio.Lock` |
| `routers/analyze.py` | `_analysis_inflight` | 54 | Lock existe (L55) mas contém lógica pesada dentro da seção crítica | Reduzir seção crítica ao mínimo (get/set), mover lógica para fora do lock |
| `threat_ingestion_runtime.py` | `_THREAT_INGESTION_CYCLE_LOCK` | 19 | Lock local; funciona em single-process (OK) | Nenhuma — já correto para o modelo proposto |
| `app_state.py` | `APP_INITIALIZED` | 14 | Bool global sem proteção | Proteger com `asyncio.Lock` no `check_initialization()` |

#### B. Semáforo — Redimensionamento

**Atual (`analyze.py:53`):** `asyncio.Semaphore(20)`

**Proposto:** `asyncio.Semaphore(80)`

**Racional:**
- 100 usuários simultâneos, mas nem todos disparam analyze ao mesmo tempo
- Pico estimado: ~60-80% dos usuários em analyze concorrente = 60-80 requests
- Cada request faz ~10 chamadas externas em paralelo, mas o semáforo controla o número de *análises* concorrentes, não chamadas individuais
- Com cache hit rate de ~40-60% após warm-up, a carga real nas APIs externas é menor
- Configurável via env var `ANALYZE_MAX_CONCURRENT` (default: 80)

#### C. Memory Leak — Cleanup de Job Queues

**Problema (`batch.py:32`, `recon.py:42`):** `_job_queues` dict cresce indefinidamente. Queues de jobs concluídos e clientes desconectados nunca são removidas.

**Correção:**
1. Registrar callback `on_disconnect` no SSE endpoint que remove a queue
2. Background task periódica (a cada 5 minutos) que limpa queues de jobs com status terminal (completed/failed) há mais de 10 minutos
3. Limite máximo de queues em memória (500); rejeitar novos batch jobs se excedido (HTTP 429)

#### D. aiohttp.ClientSession — Reutilização

**Problema (`api_client_async.py`):** Cada `AsyncThreatIntelClient` cria uma nova `aiohttp.ClientSession`. Com 80 análises concorrentes, são 80 sessions com pools de conexão separados.

**Correção:**
- Criar uma `aiohttp.ClientSession` global no startup da app (`lifespan`)
- Passar como dependência para `AsyncThreatIntelClient`
- Fechar no shutdown
- Configurar `connector` com `limit=100` (max conexões simultâneas) e `limit_per_host=10`

#### E. MongoDB — Connection Pool

**Atual (`db.py:26`):** `AsyncIOMotorClient(mongo_url)` — pool default.

**Proposto:**
```python
AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=100,           # suficiente para 1 processo com 80 coros concorrentes
    minPoolSize=5,             # manter 5 conexões quentes
    maxIdleTimeMS=30000,       # fechar idle após 30s
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    waitQueueTimeoutMS=10000,  # timeout se pool cheio
)
```

#### F. Rate Limiting — Per-User

**Atual (`analyze.py:243`):** `@limiter.limit("10/minute")` — por IP via SlowAPI.

**Problema:** Em deploy corporativo, todos os analistas saem pelo mesmo IP (NAT corporativo). Rate limit por IP penaliza toda a equipe por causa de um único usuário.

**Proposto:**
- Manter SlowAPI, mas trocar key function para extrair `user_id` do JWT quando autenticado
- Limites ajustados:
  - Analyze: 30/min por usuário (vs. 10/min por IP atual)
  - Batch: 5/min por usuário
  - Recon: 10/hora por usuário
- Fallback para IP-based quando não autenticado (endpoints públicos)

#### G. Configuração via Env Vars

Todos os parâmetros de performance devem ser configuráveis sem alterar código:

| Env Var | Default | Descrição |
|---------|---------|-----------|
| `ANALYZE_MAX_CONCURRENT` | 80 | Slots do semáforo de análise |
| `MONGO_MAX_POOL_SIZE` | 100 | Conexões máximas ao MongoDB |
| `MONGO_MIN_POOL_SIZE` | 5 | Conexões mínimas mantidas |
| `HTTP_CLIENT_MAX_CONNECTIONS` | 100 | Conexões totais do aiohttp |
| `HTTP_CLIENT_MAX_PER_HOST` | 10 | Conexões por host externo |
| `RATE_LIMIT_ANALYZE` | "30/minute" | Rate limit do endpoint analyze |
| `RATE_LIMIT_BATCH` | "5/minute" | Rate limit do endpoint batch |
| `RATE_LIMIT_RECON` | "10/hour" | Rate limit do endpoint recon |
| `JOB_QUEUE_CLEANUP_INTERVAL` | 300 | Intervalo de cleanup de queues (s) |
| `JOB_QUEUE_MAX_SIZE` | 500 | Máximo de queues em memória |

### 3.3 Integration Points

| Sistema | Tipo | Mudança |
|---------|------|---------|
| MongoDB | Existente | Ajuste de pool size via env vars; sem schema changes |
| Nginx | Existente | Configuração de SSE (proxy_buffering off); sem mudança estrutural |
| APIs externas (VT, AbuseIPDB, etc.) | Existente | Session compartilhada; sem mudança na lógica de chamada |

### 3.4 Security & Privacy

- Sem exposição de novos serviços ou portas
- Rate limiting per-user reduz risco de abuse interno (um analista não pode degradar o serviço para os outros)
- `asyncio.Lock` previne race conditions que poderiam causar chamadas duplicadas (custo financeiro em APIs pagas)
- Connection pool com limites previne exaustão de file descriptors

---

## 4. Risks & Roadmap

### 4.1 Phased Rollout

#### Phase 1 — Race Conditions & Memory Leaks
**Objetivo:** Eliminar bugs de concorrência e vazamentos de memória.

| Task | Impacto | Esforço |
|------|---------|---------|
| Adicionar `asyncio.Lock` ao `_service_cooldown` | Elimina race condition principal | Baixo |
| Reduzir seção crítica do `_analysis_inflight_lock` | Reduz contention sob carga | Baixo |
| Proteger `APP_INITIALIZED` com lock | Elimina race no startup | Baixo |
| Implementar cleanup de `_job_queues` (batch) | Elimina memory leak | Médio |
| Implementar cleanup de `_job_queues` (recon) | Elimina memory leak | Médio |
| Registrar handler `on_disconnect` nos SSE endpoints | Libera recursos de clientes desconectados | Baixo |

#### Phase 2 — Performance & Capacity
**Objetivo:** Suportar 100 usuários simultâneos com tempos de resposta estáveis.

| Task | Impacto | Esforço |
|------|---------|---------|
| Criar `aiohttp.ClientSession` global no lifespan | Elimina overhead de 80+ sessions | Médio |
| Subir semáforo para 80 (configurável via env) | 4x capacidade de análise concorrente | Baixo |
| Ajustar MongoDB connection pool | Suportar mais queries concorrentes | Baixo |
| Migrar rate limiting de per-IP para per-user | Funciona corretamente em rede corporativa | Médio |
| Extrair todos os parâmetros de performance para env vars | Deploy configurável pelo cliente | Baixo |

#### Phase 3 — Validação & Documentação
**Objetivo:** Confirmar que as metas são atingidas; documentar para clientes.

| Task | Impacto | Esforço |
|------|---------|---------|
| Load test com k6/Locust (100 users simultâneos) | Validação das metas de KPI | Médio |
| Stress test de memory leak (sessão de 24h) | Confirmar que cleanup funciona | Médio |
| Documentar env vars de performance no README | Cliente pode tunar para seu cenário | Baixo |
| Adicionar métricas ao health check (`/health/ready`) | Visibilidade operacional | Médio |

### 4.2 Technical Risks

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Single-process não suporta 100 users | Baixa | Alto | Load test na Phase 3 valida; asyncio I/O-bound escala bem. Se insuficiente, subir para `--workers 2` com estado compartilhado via MongoDB (não precisa de Redis) |
| APIs externas bloqueiam por excesso de requests | Média | Alto | Semáforo + per-service rate limiter existente + cooldown com lock |
| MongoDB connection pool exhaustion | Baixa | Alto | Pool de 100, monitorado via health check; alertar a 80% |
| CPU-bound ops bloqueiam event loop (report generation) | Baixa | Médio | Perfilar no load test; se necessário, mover para `run_in_executor` |
| Cliente configura env vars incorretamente | Média | Médio | Validação no startup com mensagens claras de erro; defaults seguros |

### 4.3 Escalabilidade Futura (Se Necessário)

Se um cliente exceder 100 usuários e o single-process não for suficiente:

1. **Scaling vertical (primeiro):** Mais CPU/RAM no container. Asyncio escala linearmente com I/O.
2. **Multi-worker (segundo):** `--workers 2-4`. O estado in-memory (inflight, cooldown) passa a precisar ser movido para MongoDB (não Redis — já temos MongoDB). Custo: médio, mas evita dependência nova.
3. **Redis (último recurso):** Só se MongoDB não atender como camada de coordenação e o cliente tiver equipe para manter. Improvável para B2B < 1000 users.

---

## 5. SLA — Baseado em Melhores Práticas SaaS (Self-Managed)

| Métrica | Target | Nota |
|---------|--------|------|
| **Uptime mensal** | 99.9% (~43 min downtime/mês) | Dependente da infra do cliente |
| **Tempo de resposta p50 (cache hit)** | ≤ 300ms | |
| **Tempo de resposta p95 (cache hit)** | ≤ 500ms | |
| **Tempo de resposta p95 (cache miss)** | ≤ 12s | Limitado pelas APIs externas |
| **Taxa de erro (5xx)** | < 0.5% | Sob carga de 100 users simultâneos |
| **Tempo de recuperação (MTTR)** | ≤ 15 min | Com docker-compose restart |
| **RPO (Recovery Point Objective)** | ≤ 1 hora | MongoDB backups configurados pelo cliente |
| **Degradação graceful** | Se MongoDB ficar lento, requests retornam timeout (504), não crash | |
