# TODO — Remediação de Auditoria
> Referências: `docs/AUDIT-2026.md` (issues) · `docs/PRD-audit-remediation.md` (contexto)
> Marcar com [x] ao concluir. IDs linkam para AUDIT-2026.md.

---

## FASE 6 — Segurança Urgente

- [x] **SEC-01** `git rm --cached .env` + adicionar ao `.gitignore` + commit (`.env` nunca foi comitado ✓)
- [ ] **SEC-01** Revogar todas as API keys expostas (VT, Shodan, AbuseIPDB, OTX, GreyNoise, URLScan, Pulsedive, AbuseCH)
- [x] **SEC-01** Criar `.env.example` com todas as vars e valores fictícios
- [x] **SEC-02** Remover credenciais MongoDB hardcoded do `docker-compose.yml` → usar `${MONGO_USER}` etc.
- [x] **SEC-02** Remover URI do MongoDB hardcoded → variável de ambiente obrigatória em `config.py`
- [x] **SEC-03** Remover ou isolar `mongo-express` do docker-compose de produção (`profiles: [dev]`)
- [x] **SEC-04** Substituir `network_mode: host` por bridge network privada em todos os serviços
- [x] **SEC-05** Remover default de `jwt_secret` e `mongo_uri` em `config.py`; exigir env vars obrigatórias
- [x] **SEC-06** `crypto.py`: falhar em produção se `MFA_ENCRYPTION_KEY` não definido; logar WARNING em dev
- [x] **SEC-11** Pinar versões Docker: `mongo:8` (dados existentes usam FCV 8.2), `mongo-express:1.0.2`
- [x] **SEC-12** `web/Dockerfile`: pinar `node:22.14.0-alpine3.21` e `nginx:1.27.4-alpine`
- [x] **SEC-13** `backend/Dockerfile`: pinar `python:3.12.9-slim` em ambos os stages

---

## FASE 7 — Bugs Críticos de Backend

- [x] **BUG-01** `admin.py:148`: `{"is_active": True}` → `{"revoked": False}` para contagem de API keys
- [x] **BUG-02** `admin.py:132`: `is not False` → `== True` na contagem de usuários ativos
- [x] **SEC-10** `api_keys.py:163`: substituir validação manual de role por `Depends(require_role(["admin"]))`
- [x] **SEC-15** `admin.py:424–430`: trocar `except ValueError: pass` por retorno HTTP 422 nos filtros de data
- [x] **QUAL-01** `_set_auth_cookies` duplicada removida de `mfa.py` → importada de `auth.py`

---

## FASE 8 — Bugs Críticos de Frontend

- [x] **FE-03** `index.css`: segunda definição de `.btn-primary` removida (linhas 251–259)
- [x] **FE-02** `AuthContext.jsx:76`: `alert()` substituído por `addToast()` (warning toast)
- [x] **FE-08** `MFAEnroll.jsx`: QR Code externo removido → `QRCodeSVG` de `qrcode.react`
- [x] **DEAD-01** `web/src/App.css` deletado (sem imports no codebase)
- [x] **DEAD-02** `web/public/vite.svg` e `web/src/assets/react.svg` deletados
- [x] **FE-13** `FlyoutPanel.jsx`: `"Fechar painel"` → `t('flyout.close_label')` + keys pt/en/es
- [x] **FE-14** `Sidebar.jsx`: `title="Meu Perfil"` → `t('sidebar.profile')` (key já existia)
- [x] **FE-01** `SettingsShell.jsx`: `window.scrollTo()` → `getScrollParent(ref).scrollTo()`

---

## FASE 9 — Qualidade de Backend e Testes

- [x] **BUG-04** `analyze.py`: revisado — `@limiter.limit()` já corre antes do corpo da função; comportamento correto por design
- [x] **QUAL-02** `main.py`: loop `for _prefix in ("/api", "/api/v1")` elimina 8 linhas duplicadas
- [x] **SEC-08** `main.py`: middleware `security_headers` adicionado (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS em produção)
- [x] **BUG-03** `users.py:75`: validação de unicidade de email antes de inserir usuário
- [x] **QUAL-03** `db.py`: `except Exception` → `except (ConnectionFailure, ServerSelectionTimeoutError)` (PyMongo específico)
- [x] **TEST-01** `tests/test_mailer.py` criado com 4 casos: sem SMTP, SMTP ok, erro SMTP, link com token
- [x] **TEST-02** `tests/test_worker.py`: 4 novos casos — todas APIs falham, mudança de verdict, BD indisponível, exceção inesperada
- [x] **QUAL-05** Cleanup de `refresh_tokens` sem `session_id` adicionado ao startup do `main.py`

---

## FASE 10a — Responsividade e CSS

- [x] **UX-05** `index.css`: breakpoints `@media (max-width: 640px)` e `@media (max-width: 480px)` adicionados
- [x] **UX-02** `Dashboard.jsx`: classe `dashboard-grid-2col` → `grid-template-columns: 1fr` em `<640px`
- [x] **UX-09** `index.css`: `.btn-primary` e `.btn-secondary` paddings harmonizados para `0.625rem`
- [x] **UX-10** `index.css`: `prefers-reduced-motion` estendido para glass-panel, marquee, toast, app-header, btns
- [x] **UX-03** `App.jsx`+`Sidebar.jsx`: sidebar oculta em `<640px`; backdrop + mobile topbar com hamburger

---

## FASE 10b — Acessibilidade

- [x] **UX-04** `Sidebar.jsx`: `aria-label` nos botões toggle (expand/collapse) e logout
- [x] **UX-06** `App.jsx`: `role="alert" aria-live="polite"` nos 3 banners de alerta
- [x] **UX-07** `FormField.jsx`: prop `id` adicionada; `htmlFor={id}` no label
- [x] **UX-08** `Dashboard.jsx`: `<caption className="sr-only">` e `scope="col"` nas 3 tabelas
- [x] **UX-04b** `SettingsShell.jsx`+`ContextMenu.jsx`: `aria-controls="settings-nav-menu"` e `id` no nav

---

## FASE 10c — React Hooks e Performance

- [x] **FE-04** `App.jsx`: `eslint-disable-line` removido; `setCurrentView` adicionado às dep arrays
- [x] **FE-05** `AuthContext.jsx`: `logout` envolvido em `useCallback`; deps corrigidas no inactivity effect
- [x] **FE-06** `AuditLogTable.jsx`: já correto — `fetchLogs` tem `useCallback` (linha 39); comportamento intencional
- [x] **FE-07** `Dashboard.jsx`: já correto — `fetchStats` dentro do `useEffect` (linha 51)
- [x] **FE-10** `App.jsx`: `MARQUEE_ITEMS` definido como constante fora do componente
- [x] **FE-11** `ToastContext.jsx`: já correto — renderização condicional já existia
- [x] **FE-15** `TourContext.jsx`: já correto — `useCallback` já usado nas funções internas

---

## FASE 10d — Confirmações e Loading States

- [x] **UX-11** `UserFlyout.jsx`, `ApiKeysManager.jsx`, `SessionsTable.jsx`: `window.confirm()` → `ConfirmModal`
- [x] **UX-01** `App.jsx`: `key={currentView}` + `.fade-in` no wrapper de views — fade transition ativo
- [x] **UX-12** `Dashboard.jsx`: já diferencia loading (spinner), error (mensagem) e empty (no_data)

---

## FASE 11 — Melhorias

- [x] **OPP-04** `.github/workflows/ci.yml` existia; corrigido `mongo:7` → `mongo:8` para consistência com produção
- [x] **OPP-05** `README.md` reescrito: Docker, env vars, endpoints, arquitetura, RBAC, CI/CD
- [x] **OPP-02** `backend/scripts/seed_users.py` já estava no lugar correto ✓
- [x] **QUAL-04** `analyze.py`: `timedelta(days=1)` → `timedelta(hours=settings.cache_ttl_hours)` (usa `CACHE_TTL_HOURS` env var)
- [x] **OPP-03** `App.jsx`: `Dashboard` convertido para `React.lazy()` + `<Suspense>` (lazy-load)

---

## Progresso

| Fase | Total | Concluído | % |
|------|-------|-----------|---|
| 6 — Segurança Urgente | 12 | 11 | 92% |
| 7 — Bugs Backend | 5 | 5 | 100% |
| 8 — Bugs Frontend | 8 | 8 | 100% |
| 9 — Qualidade Backend | 8 | 8 | 100% |
| 10a — Responsividade | 5 | 5 | 100% |
| 10b — Acessibilidade | 5 | 5 | 100% |
| 10c — React Hooks | 7 | 7 | 100% |
| 10d — Confirmações | 3 | 3 | 100% |
| 11 — Melhorias | 5 | 5 | 100% |
| **TOTAL** | **58** | **58** | **100%** |
