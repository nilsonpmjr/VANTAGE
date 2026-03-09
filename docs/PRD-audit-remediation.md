# PRD — Remediação de Auditoria
**Baseado em**: `docs/AUDIT-2026.md`
**Data**: 2026-03-06
**Objetivo**: Corrigir issues identificados na auditoria de qualidade e segurança, em fases cadenciadas para preservar tokens de sessão.

---

## Critérios de Priorização

1. **Segurança crítica** — dados expostos, credenciais comprometidas
2. **Bugs funcionais** — funcionalidades quebradas ou retornando dados errados
3. **Qualidade de código** — manutenibilidade, padrões inconsistentes
4. **UX/Acessibilidade** — experiência do usuário e conformidade
5. **Melhorias** — oportunidades de evolução

---

## FASE 6 — Segurança Urgente
**Escopo de sessão**: Pequeno — apenas arquivos de configuração e infra
**IDs cobertos**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-11, SEC-12, SEC-13

### Tarefas

#### 6.1 Remover `.env` do git e revogar credenciais expostas
- Executar `git rm --cached .env` + commit
- Verificar `.gitignore` (`.env` já consta — confirmar)
- Criar `docs/ENV-SETUP.md` com instruções de configuração
- Criar `.env.example` com todas as vars e valores fictícios

#### 6.2 Corrigir `docker-compose.yml`
- Pinar versões: `mongo:7.0`, `mongo-express:1.0.2`, `node:22-alpine` → versão específica
- Remover credenciais hardcoded — substituir por `${MONGO_USER}`, `${MONGO_PASSWORD}`
- Remover `network_mode: host` — substituir por bridge network com subnet privada
- Remover ou isolar `mongo-express` (comentar serviço em produção)
- Mover URI do MongoDB para variável de ambiente

#### 6.3 Reforçar `backend/config.py` e `backend/crypto.py`
- Remover default do `jwt_secret` (falhar se não definido)
- `crypto.py`: logar WARNING explícito se chave dev for usada; falhar em `environment=production`
- Adicionar validação de `MFA_ENCRYPTION_KEY` no startup

**Arquivos alterados**: `.env`, `.gitignore`, `docker-compose.yml`, `backend/config.py`, `backend/crypto.py`, `.env.example` (novo)

---

## FASE 7 — Bugs Críticos de Backend
**Escopo de sessão**: Pequeno — mudanças cirúrgicas em 2–3 arquivos
**IDs cobertos**: BUG-01, BUG-02, SEC-10, SEC-15, QUAL-01

### Tarefas

#### 7.1 Corrigir métricas IAM incorretas (`admin.py`)
- `active_api_keys`: trocar `{"is_active": True}` → `{"revoked": False}`
- `active_users`: trocar `is not False` → `== True`
- Verificar se há outros campos com o mesmo problema no mesmo endpoint

#### 7.2 Centralizar autorização (`api_keys.py`)
- Endpoint `GET /admin/{username}`: trocar validação manual por `Depends(require_role(["admin"]))`
- Verificar todos os demais endpoints em `api_keys.py` por padrão consistente

#### 7.3 Validação de datas em audit log (`admin.py`)
- Trocar `except ValueError: pass` por retorno `HTTP 422` com mensagem clara
- Aplicar para `from_date` e `to_date`

#### 7.4 Extrair `_set_auth_cookies` duplicada
- Mover função para `backend/routers/auth.py` (já existe lá — verificar)
- Importar em `backend/routers/mfa.py`
- Remover duplicata

**Arquivos alterados**: `backend/routers/admin.py`, `backend/routers/api_keys.py`, `backend/routers/mfa.py`

---

## FASE 8 — Bugs Críticos de Frontend
**Escopo de sessão**: Médio — 4–5 arquivos JSX/CSS
**IDs cobertos**: FE-01, FE-02, FE-03, FE-08, FE-13, FE-14, DEAD-01, DEAD-02

### Tarefas

#### 8.1 Corrigir `.btn-primary` duplicado (`index.css`)
- Localizar segunda definição (linha ~251–259)
- Remover a segunda — manter apenas a com gradiente primário (linha ~168)

#### 8.2 Substituir `alert()` por Toast (`AuthContext.jsx`)
- Localizar `alert("Sua sessão expirou...")` (linha ~76)
- Substituir por chamada ao `useToast()` já existente no projeto

#### 8.3 Corrigir QR Code MFA (`MFAEnroll.jsx`)
- Remover chamada a `api.qrserver.com`
- Instalar `npm install qrcode.react` (ou `qrcode` + canvas)
- Gerar QR Code localmente com `<QRCodeSVG value={qrUri} />`

#### 8.4 Remover código morto
- Deletar `web/src/App.css`
- Deletar `web/public/vite.svg`
- Deletar `web/src/assets/react.svg`
- Remover import de `App.css` onde existir

#### 8.5 Internacionalizar strings hardcoded
- `FlyoutPanel.jsx:38`: `"Fechar painel"` → `t('flyout.close_label')`
- `Sidebar.jsx:109`: `"Meu Perfil"` → `t('sidebar.my_profile')`
- Adicionar chaves nos 3 locales (pt/en/es)

#### 8.6 Corrigir `window.scrollTo` no SettingsShell
- Passar `ref` da div scrollável do `App.jsx` via prop ou context
- Substituir `window.scrollTo(...)` por `scrollRef.current?.scrollTo(...)`

**Arquivos alterados**: `index.css`, `context/AuthContext.jsx`, `components/auth/MFAEnroll.jsx`, `App.jsx`, `components/layout/FlyoutPanel.jsx`, `components/layout/Sidebar.jsx`, `web/src/App.css` (deletar), locales pt/en/es

---

## FASE 9 — Qualidade de Backend e Testes
**Escopo de sessão**: Médio — refatorações e novos testes
**IDs cobertos**: BUG-03, BUG-04, QUAL-02, QUAL-03, TEST-01, TEST-02, SEC-08

#### 9.1 Rate limit antes do cache em `analyze.py`
- Reestruturar endpoint: aplicar rate limit decorator antes de verificar cache

#### 9.2 Refatorar registro duplo de routers em `main.py`
```python
# Antes: 16 linhas repetidas
# Depois:
_routers = [auth, users, analyze, stats, admin, mfa, sessions, api_keys]
for prefix in ["/api", "/api/v1"]:
    for router in _routers:
        app.include_router(router.router, prefix=prefix)
```

#### 9.3 Middleware de security headers em `main.py`
Adicionar após middlewares existentes:
```python
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response
```

#### 9.4 Testes para `mailer.py`
- Mock SMTP com `unittest.mock`
- Testar: envio OK, fallback sem SMTP configurado, formato do email

#### 9.5 Melhorar testes de `worker.py`
- Teste: worker com falha de API externa (mock)
- Teste: worker com BD indisponível
- Teste: alteração de verdict SAFE → HIGH RISK

**Arquivos alterados**: `backend/routers/analyze.py`, `backend/main.py`, `backend/tests/test_mailer.py` (novo), `backend/tests/test_worker.py`

---

## FASE 10 — UX, Acessibilidade e Responsividade
**Escopo de sessão**: Grande — múltiplos componentes
**IDs cobertos**: UX-01 a UX-12, FE-04 a FE-10

### Sub-fase 10a — Responsividade e CSS (sessão independente)
- Adicionar breakpoints `640px` e `480px` em `index.css`
- Corrigir grid do Dashboard para mobile (`grid-template-columns: 1fr` em `<640px`)
- Padding adaptativo no container home (`clamp(0.5rem, 5vw, 2rem)`)
- Padronizar paddings de `.btn-primary` e `.btn-secondary`
- Completar `prefers-reduced-motion` para cobrir todas as transitions

### Sub-fase 10b — Acessibilidade (sessão independente)
- `aria-label` em botões da Sidebar
- `role="alert" aria-live="polite"` nos 3 banners de alerta em `App.jsx`
- `htmlFor` em `FormField.jsx`
- `<caption>` e `scope="col"` nas tabelas do Dashboard
- `aria-controls` no toggle da SettingsShell mobile

### Sub-fase 10c — React hooks e performance (sessão independente)
- Resolver `eslint-disable react-hooks/exhaustive-deps` com `useCallback` adequado
- `[...INTEGRATIONS, ...INTEGRATIONS]` → constante fora do componente
- `ToastContainer` renderizar condicionalmente
- `TourContext`: `useCallback` em cada função individualmente

### Sub-fase 10d — Confirmações e loading states (sessão independente)
- Modal de confirmação antes de deletar usuário, revogar sessão, revogar API key
- Skeleton loader em transições de view
- Diferenciar estados: loading / empty / error em Settings e Dashboard

**Arquivos alterados**: `index.css`, `App.jsx`, `components/dashboard/Dashboard.jsx`, `components/layout/Sidebar.jsx`, `components/shared/FormField.jsx`, `context/TourContext.jsx`, `context/ToastContext.jsx`

---

## FASE 11 — Melhorias e Débito Técnico
**Escopo de sessão**: Pequeno a médio
**IDs cobertos**: OPP-01 a OPP-05, SEC-02 (docs), QUAL-04, QUAL-05

#### 11.1 CI/CD — GitHub Actions
- Workflow de PR: lint Python (`flake8`/`ruff`) + pytest + lint JS (`eslint`)
- Workflow de push main: build Docker + healthcheck

#### 11.2 Documentação
- Atualizar `README.md`: arquitetura, setup com Docker, variáveis de ambiente, endpoints `/api/v1`
- Criar `docs/ENV-SETUP.md` com descrição de cada variável
- Criar `docs/ARCHITECTURE.md` com diagrama de componentes

#### 11.3 Mover `seed_users.py` para `backend/scripts/`

#### 11.4 Cache TTL configurável em `analyze.py`

#### 11.5 Cleanup de refresh_tokens legados (sem `session_id`)

---

## Matriz de Risco x Esforço

| Fase | Risco Resolvido | Esforço | Prioridade |
|------|----------------|---------|-----------|
| 6 — Segurança Urgente | CRÍTICO | Baixo | 1 |
| 7 — Bugs Backend | CRÍTICO+ALTO | Baixo | 2 |
| 8 — Bugs Frontend | CRÍTICO+ALTO | Médio | 3 |
| 9 — Qualidade Backend | ALTO+MÉDIO | Médio | 4 |
| 10 — UX/Acessibilidade | MÉDIO | Alto | 5 |
| 11 — Melhorias | BAIXO | Médio | 6 |

---

## Dependências entre Fases

```
Fase 6 (infra/secrets) ──► Fase 7 (backend bugs) ──► Fase 9 (qualidade)
                                                              │
Fase 8 (frontend bugs) ──────────────────────────────────────┤
                                                              │
Fase 10 (UX) ────────────────────────────────────────────────┘
                                                              │
                                              Fase 11 (melhorias)
```

Fases 6, 7 e 8 podem ser executadas em paralelo (arquivos diferentes).
Fase 10 pode ser subdividida (10a, 10b, 10c, 10d) — cada sub-fase é independente.
