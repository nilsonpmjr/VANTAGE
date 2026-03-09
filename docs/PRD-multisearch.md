# PRD — Multi-Search (Batch Threat Intelligence)

> **Status**: Draft v2 · **Data**: 2026-03-09
> **Contexto**: Threat Intelligence Tool — FastAPI + MongoDB + React/Vite
> **Referências**: `docs/AUDIT-2026.md` · `docs/PRD-audit-remediation.md` · `backend/routers/analyze.py`

---

## 1. Executive Summary

### Problem Statement

O endpoint `/api/analyze` processa um alvo por vez. Analistas de SOC frequentemente precisam triagar dezenas de IPs, domínios ou hashes simultaneamente — o fluxo atual obriga repetição manual, desperdiça tempo e ignora resultados já em cache que não custam quota.

### Proposed Solution

Estender a barra de pesquisa existente para detectar automaticamente múltiplos alvos (separados por vírgula ou quebra de linha). Quando o modo batch é identificado, a mesma tela exibe uma tabela de progresso em tempo real via SSE, respeitando cotas gratuitas das APIs através de cache-first + throttle inter-alvo. O usuário não precisa navegar para nenhuma tela nova.

### Success Criteria

| KPI | Meta |
|---|---|
| Alvos já em cache retornados sem nenhuma chamada externa | 100 % dos hits |
| Redução de calls externas vs. N buscas individuais repetidas | ≥ 50 % em workloads típicos (mix cache + fresh) |
| Progresso visível no frontend a cada alvo concluído | latência ≤ 500 ms via SSE |
| Nenhum alvo "engolido" em silêncio — todo alvo tem status no resultado | 100 % |
| Usuário informado do impacto estimado antes de executar lote com misses | modal de pré-voo obrigatório |

---

## 2. User Experience & Functionality

### User Personas

| Persona | Descrição | Dor |
|---|---|---|
| **Analista SOC** | Investiga alertas, triage de IoCs | Cola 30 IPs do SIEM no campo e precisa de veredito consolidado |
| **Threat Hunter** | Pesquisa proativa de ameaças | Importa lista de domínios de relatório de threat intel externo |
| **Manager** | Revisão de incidentes | Quer visão resumida de múltiplos IoCs sem detalhes granulares |

### User Stories

1. **Como analista**, quero colar uma lista de IPs/domínios/hashes na barra de pesquisa existente e receber todos os vereditos numa tabela consolidada na mesma tela, para não precisar navegar para outra página nem repetir buscas manualmente.

2. **Como analista**, quero ver o progresso em tempo real enquanto os alvos são processados, para saber que o sistema está trabalhando e já ver resultados parciais.

3. **Como qualquer usuário**, quero ser avisado de quantas chamadas externas serão feitas *antes* de confirmar o lote, para não esgotar minha cota diária por acidente.

4. **Como analista**, quero clicar em qualquer linha da tabela consolidada e ver o resultado completo daquele alvo (igual à busca individual), sem refazer a query.

5. **Como analista**, quero exportar o resultado consolidado em CSV ou JSON para anexar a um ticket.

6. **Como admin/manager**, quero que o sistema respeite automaticamente os limites das APIs gratuitas, sem configuração manual.

### Acceptance Criteria

**Story 1 — Detecção Automática de Modo Batch**
- A barra de pesquisa existente detecta batch quando o valor contém vírgula (`,`) ou quebra de linha (`\n`)
- Com 1 alvo: comportamento atual inalterado (busca individual, resultado imediato)
- Com N alvos: barra expande para `<textarea>` e o botão muda para "Analisar Lote (N alvos)"
- Separadores aceitos: vírgula e/ou quebra de linha, qualquer combinação
  - `1.2.3.4, evil.com` → 2 alvos
  - `1.2.3.4\nevil.com` → 2 alvos
  - `1.2.3.4,evil.com,abc123` → 3 alvos
- Espaços em branco ao redor de cada alvo são ignorados (`trim`)
- Alvos duplicados são deduplicados silenciosamente
- Mix de tipos no mesmo lote é permitido (IPv4, domínio, hash MD5/SHA-256)
- Limite de 50 alvos por lote (configurável via env `BATCH_MAX_TARGETS=50`)
- Alvos inválidos exibidos com erro inline antes de executar; restantes podem prosseguir

**Story 2 — Progresso SSE**
- Frontend abre `EventSource` para `/api/analyze/batch/{job_id}/stream`
- Evento `progress` emitido a cada alvo concluído: `{ target, status, verdict, from_cache }`
- Evento `done` emitido quando todos os alvos terminam
- Se SSE desconectar, frontend pode reconectar e receber snapshot do estado atual
- Progresso visível: barra de progresso `X / N alvos` e tabela parcial já populando linha a linha
- Alvos de cache aparecem imediatamente (sem delay); alvos externos chegam conforme processados

**Story 3 — Modal de Pré-Voo**

O modal de pré-voo é uma tela de confirmação que aparece **antes de executar o batch**, mostrando o custo estimado em chamadas externas às APIs. É análogo a uma checagem pré-decolagem: o usuário revisa o impacto antes de "decolar".

Regra de exibição:
- **Aparece** sempre que houver ≥ 1 alvo fora do cache (vai consumir chamadas externas)
- **Não aparece** se o lote for 100 % cache-hit (executa direto, sem fricção)

Conteúdo do modal:

```
┌─────────────────────────────────────────────┐
│  Confirmar análise em lote                  │
├─────────────────────────────────────────────┤
│  3 alvos detectados                         │
│                                             │
│  ✅  1 alvo já em cache  (sem custo)        │
│  🔴  2 alvos farão chamadas externas        │
│                                             │
│  Serviços afetados:                         │
│  VirusTotal · AbuseIPDB · Shodan            │
│                                             │
│  Tempo estimado: ~4 segundos               │
│                                             │
│  [Cancelar]              [Analisar agora]   │
└─────────────────────────────────────────────┘
```

- Usuário confirma → batch inicia; cancela → retorna ao campo de entrada
- Os dados do modal vêm de `POST /api/analyze/batch/estimate` (consulta leve ao cache, sem chamar APIs externas)

**Story 4 — Drill-down**
- Tabela consolidada: linha clicável abre FlyoutPanel com resultado completo (mesmo layout do `/analyze` individual)
- Dados do flyout vêm do MongoDB (`scans`), sem nova chamada externa

**Story 5 — Export**
- Botão "Exportar CSV" e "Exportar JSON" abaixo da tabela consolidada
- CSV: `target,type,verdict,risk_score,from_cache,timestamp`
- JSON: array com os mesmos campos mais `summary` completo

**Story 6 — Quota Preservation**
- Sistema aplica throttle configurável entre alvos externos (`BATCH_INTER_TARGET_DELAY_MS`, default `500`)
- Cache-hits não consomem delay
- Rate limiter global do `slowapi` não sofre impacto: o batch usa delay interno

### Non-Goals

- Criação de nova página ou item de navegação na Sidebar para busca em lote
- Upload de arquivo CSV/TXT de alvos (v1.1)
- Agendamento de batch recorrente (v2.0)
- Notificação por email ao terminar (v2.0)
- Priorização por tipo de alvo (v1.1)
- UI de gerenciamento de jobs históricos (v2.0)

---

## 3. Quota Preservation Strategy

Esta é a restrição mais crítica do projeto. O sistema deve ser **quota-safe por design**, não por disciplina do usuário.

### 3.1 Cache-First Obrigatório

```
Para cada alvo no lote:
  1. Consultar MongoDB (scans) com TTL = CACHE_TTL_HOURS
  2. Se hit → retornar cached; marcar from_cache=true; custo = 0
  3. Se miss → enfileirar para chamada externa
```

Estimativa de savings: em um time de 5 analistas que repetem alvos comuns, ~60–80 % dos alvos já estarão em cache.

### 3.2 Throttle Inter-Alvo

```
Para cada alvo na fila de misses (externos):
  await asyncio.sleep(BATCH_INTER_TARGET_DELAY_MS / 1000)
  result = await async_client.query_all(target, type)
```

- Default: 500 ms entre alvos externos
- O `AsyncThreatIntelClient` já paraleliza os serviços *dentro* de cada alvo — o throttle se aplica *entre* alvos, não entre serviços
- Para lotes com muitos misses, o pré-voo exibe o tempo estimado, prevenindo surpresas

### 3.3 Endpoint de Estimativa (Pré-Voo)

O frontend consulta `POST /api/analyze/batch/estimate` *antes* de confirmar o lote. Essa chamada apenas verifica o cache MongoDB — não aciona nenhuma API externa.

```json
Request:  { "targets": ["1.2.3.4", "evil.com", "abc123..."] }
Response: {
  "total": 3,
  "cache_hits": 1,
  "external_calls": 2,
  "estimated_seconds": 4,
  "services_impacted": ["virustotal", "abuseipdb", "shodan"],
  "quota_warning": null
}
```

### 3.4 Serviços com Quota Diária Baixa

| Serviço | Limite Free | Política batch |
|---|---|---|
| VirusTotal | 4 req/min | Inter-alvo delay previne burst |
| AbuseIPDB | 1.000/dia | Pré-voo informa contagem estimada |
| Shodan | Limitado (créditos) | Idem |
| UrlScan | 100/dia | Idem |
| OTX | Generoso | Sem restrição adicional |
| GreyNoise | Community | Sem restrição adicional |
| Pulsedive | Free | Sem restrição adicional |
| Abuse.ch | Free | Sem restrição adicional |

> **v1.1**: Contador de calls diárias por serviço em MongoDB; pré-voo mostra uso atual vs. limite.

---

## 4. Technical Specifications

### 4.1 Architecture Overview

```
Frontend (SearchBar.jsx — existente, estendido)
  │
  ├─ Detecta N alvos → modo batch
  │
  ├─ POST /api/analyze/batch/estimate   →  dados para modal de pré-voo
  │
  ├─ POST /api/analyze/batch            →  cria job, retorna job_id
  │                                         (worker async inicia em background)
  │
  └─ GET  /api/analyze/batch/{job_id}/stream  →  SSE stream de progresso
       │
       └─ GET /api/analyze/batch/{job_id}     →  resultado final (polling fallback)

Backend Worker (batch_worker coroutine)
  ├─ Para cada alvo: cache check → [hit: emitir evento] / [miss: throttle → API → emitir evento]
  └─ Atualiza doc batch_jobs no MongoDB a cada alvo

MongoDB
  ├─ scans              (cache individual — existente)
  └─ batch_jobs         (novo) TTL 24h
```

### 4.2 Nova Coleção MongoDB: `batch_jobs`

```json
{
  "_id": "uuid4",
  "created_at": "ISODate",
  "analyst": "username",
  "status": "pending | running | done | failed",
  "targets": ["1.2.3.4", "evil.com"],
  "results": [
    {
      "target": "1.2.3.4",
      "type": "ip",
      "status": "done",
      "verdict": "Malicious",
      "risk_score": 8,
      "from_cache": true,
      "scan_id": "ObjectId ref to scans"
    }
  ],
  "progress": { "done": 0, "total": 2 },
  "error": null
}
```

TTL index: `created_at`, expira em 24h (configurável `BATCH_JOB_TTL_HOURS`).

### 4.3 Novos Endpoints da API

#### `POST /api/analyze/batch/estimate`

```
Auth: JWT (qualquer role)
Body: { "targets": ["string"] }
Response 200: {
  "total": int,
  "cache_hits": int,
  "external_calls": int,
  "estimated_seconds": float,
  "services_impacted": ["string"],
  "quota_warning": "string | null"
}
Response 400: { "detail": [{ "target": "x", "error": "invalid" }] }
```

#### `POST /api/analyze/batch`

```
Auth: JWT (qualquer role)
Rate limit: 2/minute (independente do /analyze individual)
Body: { "targets": ["string"], "lang": "pt|en|es" }
Response 202: { "job_id": "uuid4", "status": "pending" }
Response 400: validation errors
Response 422: lote > BATCH_MAX_TARGETS
```

#### `GET /api/analyze/batch/{job_id}/stream`

```
Auth: JWT
Response: text/event-stream
Events:
  data: {"type": "progress", "target": "1.2.3.4", "verdict": "Clean", "from_cache": true, "done": 1, "total": 3}
  data: {"type": "progress", "target": "evil.com", "verdict": "Malicious", "from_cache": false, "done": 2, "total": 3}
  data: {"type": "done", "job_id": "uuid4"}
  data: {"type": "error", "message": "..."}
```

#### `GET /api/analyze/batch/{job_id}`

```
Auth: JWT (deve ser o analyst do job ou admin)
Response 200: batch_jobs document completo
Response 404: job não encontrado
Response 403: não é o dono
```

### 4.4 Backend — Novos Arquivos

**`backend/routers/batch.py`**
- Router prefix `/analyze`
- `POST /batch/estimate`: consulta MongoDB, retorna estimativa sem chamar APIs externas
- `POST /batch`: valida alvos, cria doc `batch_jobs`, dispara `asyncio.create_task(process_batch(...))`
- `GET /batch/{job_id}/stream`: `StreamingResponse` que lê de `asyncio.Queue` associada ao job
- `GET /batch/{job_id}`: lê snapshot do MongoDB

**`backend/batch_worker.py`**
- `async def process_batch(job_id, targets, lang, db):`
  1. Itera alvos em ordem
  2. Para cada um: verifica cache → se hit, emite evento imediatamente
  3. Para misses: `await asyncio.sleep(delay)` → `async_client.query_all()` → emite evento
  4. Atualiza `batch_jobs` via `$push` a cada alvo
- Queue registry global: `_job_queues: dict[str, asyncio.Queue]` (suficiente para MVP single-process)
- Reutiliza `AsyncThreatIntelClient` e `_sanitize_for_mongo` de `analyze.py`

**`backend/main.py`**
- Incluir `batch_router` junto com os demais routers no loop de prefixes

### 4.5 Frontend — Modificações

**`web/src/components/dashboard/SearchBar.jsx`** (existente, estendido)

```
Lógica de detecção:
  value.includes(',') || value.includes('\n')
    → isBatch = true
    → expandir para <textarea> (auto-resize)
    → targets = parse(value)  // split + trim + dedupe + validate
    → label do botão: isBatch ? `Analisar Lote (${N} alvos)` : "Analisar"

Ao submeter em modo batch:
  1. POST /estimate → recebe dados para o modal
  2. Se external_calls > 0 → abre <BatchPreflightModal>
     - Confirmar → POST /batch → recebe job_id → abre <BatchResultsPanel>
     - Cancelar → retorna ao campo
  3. Se external_calls === 0 (100% cache) → POST /batch direto → <BatchResultsPanel>
```

**`web/src/components/dashboard/BatchPreflightModal.jsx`** (novo)
- Modal usando `ConfirmModal` como base ou criado inline
- Props: `estimate`, `onConfirm`, `onCancel`
- Exibe: total, cache_hits, external_calls, services_impacted, estimated_seconds

**`web/src/components/dashboard/BatchResultsPanel.jsx`** (novo)
- Renderizado na mesma tela da busca, abaixo da SearchBar
- Barra de progresso `X / N alvos` + indicador "em andamento"
- Tabela: Target · Tipo · Veredito (badge colorido) · Risk · Da cache? · Ações
- Linha clicável → abre FlyoutPanel existente com resultado completo
- Após `done`: botões "Exportar CSV" e "Exportar JSON"

**Locale keys** (`batch.*`) — pt/en/es
- `batch.button_label` (ex: "Analisar Lote (3 alvos)")
- `batch.preflight.title`, `batch.preflight.cache_hits`, `batch.preflight.external_calls`
- `batch.preflight.services`, `batch.preflight.estimated`, `batch.preflight.confirm`, `batch.preflight.cancel`
- `batch.progress.label` (ex: "3 / 10 alvos")
- `batch.results.from_cache`, `batch.results.columns.*`
- `batch.export.csv`, `batch.export.json`
- `batch.errors.too_many_targets`, `batch.errors.all_invalid`

### 4.6 Security & Privacy

- Job pertence ao `analyst` que criou; outros usuários não podem acessar (exceto admin)
- SSE valida JWT no cookie ou header `Authorization` (mesma lógica do `get_current_user`)
- Audit log: `action="batch_analyze"`, `target="<N alvos>"`, `result=verdict_summary`
- Rate limit no `POST /batch`: 2 req/min evita abuso de quota via automação
- `BATCH_MAX_TARGETS` impede lotes que esgotariam cota diária

---

## 5. Risks & Roadmap

### 5.1 Phased Rollout

#### MVP (v1.0)

- Detecção automática de modo batch na SearchBar existente (sem nova página)
- `POST /api/analyze/batch` + worker asyncio in-process
- `GET /api/analyze/batch/{job_id}/stream` SSE
- `POST /api/analyze/batch/estimate` + `BatchPreflightModal`
- `BatchResultsPanel` com progresso, tabela consolidada, drill-down e export
- Throttle inter-alvo, cache-first
- Limite: 50 alvos, worker single-process

#### v1.1

- Upload de arquivo `.txt` / `.csv` com lista de alvos
- Contador de calls diárias por serviço em MongoDB; pré-voo mostra uso atual vs. limite
- Filtros na tabela: por veredito, por tipo, apenas misses
- Histórico de jobs (lista dos últimos 20 lotes do usuário, acessível via painel)

#### v2.0

- Worker distribuído (Redis Queue / Celery) para escalar além de single-process
- Agendamento recorrente (re-scan diário de watchlist)
- Notificação por email quando batch terminar
- Dashboard de consumo de quota por serviço

### 5.2 Technical Risks

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| SSE desconecta em proxies reversos com timeout curto | Média | Alto | Heartbeat a cada 15s; polling fallback via `GET /batch/{job_id}` |
| Worker asyncio bloqueado por outra coroutine longa | Baixa | Médio | `asyncio.sleep(0)` yield points; timeout por alvo de 30s |
| Queue in-memory perdida em restart do processo | Média | Baixo | Reconexão SSE relê snapshot do MongoDB; estado sempre persistido |
| API externa retorna 429 no meio do batch | Média | Médio | Retry com backoff (já no `AsyncThreatIntelClient`); alvo marcado como `partial` |
| Lote com 50 misses esgota cota diária do UrlScan (100/dia) | Alta para heavy users | Alto | Pré-voo adverte; v1.1 adiciona contador diário |
| Job "órfão" se worker crashar antes de finalizar | Baixa | Baixo | TTL de 24h limpa jobs; startup do backend faz cleanup de jobs `running` antigos |

---

## 6. Design & Code Quality Constraints

### 6.1 Estética e Coesão Visual

Todos os novos elementos devem seguir a identidade visual existente do projeto sem exceções:

- **Glassmorphism**: usar as classes CSS já definidas (`glass-panel`, `glass-card`, etc.) para containers
- **Paleta de cores**: reutilizar as variáveis CSS do `index.css` (`--color-*`, `--bg-*`, badges de veredito existentes)
- **Badges de veredito**: reutilizar os mesmos badges coloridos já usados no painel de resultado individual
- **Tipografia e espaçamento**: seguir o sistema de espaçamento existente; não introduzir valores ad-hoc
- **Botões**: usar `.btn-primary` e `.btn-secondary` já definidos; não criar variantes novas sem necessidade
- **Tabelas**: usar a classe `.data-table` já existente no `index.css`
- **Modais**: usar o componente `ConfirmModal` existente como base ou padrão para o `BatchPreflightModal`
- **FlyoutPanel**: reutilizar o componente existente para o drill-down — nenhuma nova implementação de painel lateral
- **Ícones**: usar exclusivamente os ícones já importados do `lucide-react`
- **Animações**: respeitar `prefers-reduced-motion` já configurado globalmente; não adicionar animações fora do padrão
- **i18n**: toda string visível ao usuário deve estar nos arquivos de locale (pt/en/es); zero strings hardcoded em JSX

### 6.2 Boas Práticas de Código

**Frontend (React):**
- Componentes novos seguem o padrão funcional com hooks já usado no projeto
- `useCallback` e `useMemo` onde aplicável para evitar re-renders desnecessários
- `React.lazy()` + `<Suspense>` para `BatchResultsPanel` (componente pesado, só renderizado após submit)
- Sem `window.confirm()`, `alert()`, `console.log()` em código de produção
- Acessibilidade: `aria-label`, `role`, `aria-live` nos elementos dinâmicos (progresso, tabela que popula)

**Backend (Python/FastAPI):**
- Seguir o padrão de router existente (`routers/*.py`) — sem lógica de negócio inline no endpoint
- Exceções tratadas com `HTTPException` com códigos semânticos corretos
- Logging via `get_logger()` já configurado — sem `print()`
- Audit log em toda ação relevante via `log_action()`
- Type hints completos em funções públicas
- Sem hardcode de valores configuráveis — usar `settings.*` ou env vars

---

## 7. Open Questions

1. **Limite de alvos**: 50 é suficiente para o perfil atual de uso? Ou 20 é mais conservador para proteger cotas?
2. **Delay entre alvos**: 500ms é o default; existe preferência por expor isso nas configurações de admin?
3. **Histórico de jobs**: incluir no MVP ou empurrar para v1.1?
