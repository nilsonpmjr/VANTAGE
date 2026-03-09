# Auditoria de Qualidade e Segurança — Threat Intelligence Tool
**Data**: 2026-03-06
**Escopo**: Backend (Python/FastAPI), Frontend (React/Vite), Segurança/Infra (Docker), UX/Design
**Total de issues**: 59 (10 Críticos · 16 Altos · 25 Médios · 8 Baixos)

---

## 1. SEGURANÇA E INFRAESTRUTURA

### CRÍTICOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| SEC-01 | `.env` | — | `.env` commitado com API keys REAIS (VT, Shodan, AbuseIPDB, OTX, JWT_SECRET). Comprometido. | `git rm --cached .env`, revogar todas as chaves, criar `.env.example` |
| SEC-02 | `docker-compose.yml` | 8–9, 45 | Credenciais MongoDB e URI hardcoded no versionamento | Usar Docker secrets ou `.env` não commitado |
| SEC-03 | `docker-compose.yml` | 19, 25–28 | mongo-express exposto sem autenticação e sem versão pinada | Remover de produção; se dev, apenas `127.0.0.1` com senha forte |
| SEC-04 | `docker-compose.yml` | 6, 22, 41, 57 | `network_mode: host` em todos os containers — sem isolamento de rede | Substituir por bridge network com subnet privada |
| SEC-05 | `backend/config.py` | 7 | JWT_SECRET com valor default hardcoded `"iteam_soc_super_secret_key_2026"` | Remover default; exigir env var em qualquer ambiente |
| SEC-06 | `backend/crypto.py` | 18–24 | Chave Fernet derivada deterministicamente em dev (`sha256(b"threat-intel-mfa-dev-key...")`) | Gerar chave aleatória por instância dev; obrigar `MFA_ENCRYPTION_KEY` em produção |

### ALTOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| SEC-07 | `docker-compose.yml` | 46 | CORS permissivo com 4 origens incluindo `localhost:3000` em produção | Restringir a domínio único de produção |
| SEC-08 | `backend/main.py` | — | Sem middleware de headers OWASP (`X-Frame-Options`, `X-Content-Type-Options`, `HSTS`) | Adicionar middleware de security headers |
| SEC-09 | `backend/limiters.py` | 6 | Rate limiter usa `get_remote_address` — spoofável via `X-Forwarded-For` sem proxy trusted | Configurar trusted proxies ou validar header |
| SEC-10 | `backend/routers/api_keys.py` | 163 | Validação de role manual `if current_user["role"] != "admin"` em vez de `Depends(require_role(["admin"]))` | Usar dependency padrão do projeto |

### MÉDIOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| SEC-11 | `docker-compose.yml` | — | Imagens `mongo:latest` e `mongo-express` sem versão pinada | Pinar versões: `mongo:7.0`, `mongo-express:1.0.2` |
| SEC-12 | `web/Dockerfile` | 2 | `node:22-alpine` sem patch version | `node:22.x.y-alpine` |
| SEC-13 | `backend/Dockerfile` | 1 | `python:3.12-slim` sem patch version | `python:3.12.x-slim` |
| SEC-14 | `backend/config.py` | 42 | `environment: str = "development"` como padrão; validate_production() não impede startup com secret fraco | Adicionar fail-fast rigoroso |
| SEC-15 | `backend/routers/admin.py` | 424–430 | Falha silenciosa em datas malformadas no filtro de audit log (`except ValueError: pass`) | Retornar HTTP 422 com mensagem clara |
| SEC-16 | `backend/routers/auth.py` | 291 | Token de reset de senha usa SHA256 sem salt | PBKDF2 ou Argon2 para maior rigor |
| SEC-17 | `backend/routers/auth.py` | 346–409 | Tokens de reset sem contador de tentativas por token | Lockout após 3 tentativas por token |
| SEC-18 | `backend/routers/admin.py` | 448–470 | Export de audit log retorna até 10.000 registros sem paginação | Limitar a 5.000 ou implementar paginação |
| SEC-19 | `backend/routers/mfa.py` | 147 | `valid_window=1` (±30s) em TOTP — janela pode ser reduzida | Usar `valid_window=0` se latência permitir |
| SEC-20 | `backend/routers/auth.py` | 160–166 | Session fixation: revoga sessão anterior apenas pela mesma user_agent | Considerar revogação por IP+UA em mudanças suspeitas |

---

## 2. BACKEND — BUGS E QUALIDADE

### CRÍTICOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| BUG-01 | `backend/routers/admin.py` | 148 | `active_api_keys` usa `{"is_active": True}` — campo não existe, deve ser `{"revoked": False}` | `await db.api_keys.count_documents({"revoked": False})` |
| BUG-02 | `backend/routers/admin.py` | 132 | `is not False` antipadrão e confuso na contagem de usuários ativos | Trocar por `u.get("is_active", True) == True` |

### ALTOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| BUG-03 | `backend/routers/users.py` | 75 | Email é opcional, mas sem validação de unicidade; usuário sem email não consegue reset de senha | Tornar email obrigatório ou validar unicidade |
| BUG-04 | `backend/routers/analyze.py` | 81–92 | Cache hit não aplica rate limit — bypassa o limite de 10/min | Aplicar rate limit antes do cache check |

### MÉDIOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| QUAL-01 | `auth.py`, `mfa.py` | 34–51 / 55–66 | `_set_auth_cookies` duplicada em dois arquivos | Extrair para módulo compartilhado; importar em `mfa.py` |
| QUAL-02 | `main.py` | 132–149 | Routers registrados duas vezes (prefixos `/api` e `/api/v1`) com código repetido | Iterar lista: `for prefix in ["/api", "/api/v1"]: app.include_router(...)` |
| QUAL-03 | Múltiplos | — | `except Exception as e` genérico em 8+ lugares (db.py, worker.py, analyze.py) | Capturar exceções específicas do Motor/PyMongo |
| QUAL-04 | `backend/routers/analyze.py` | — | Cache TTL hardcoded de 24h | Tornar configurável via `settings` |
| QUAL-05 | `backend/routers/sessions.py` | 85 | Docs legados sem `session_id` nunca removidos do BD | Cleanup em background job ou migration |

### Lacunas de Teste

| ID | Arquivo | Status |
|----|---------|--------|
| TEST-01 | `backend/mailer.py` | Sem nenhum teste unitário |
| TEST-02 | `backend/worker.py` | Apenas 3 testes básicos; sem teste de falha de API ou retry |
| TEST-03 | `backend/routers/stats.py` | Apenas via integration, sem unitários |

---

## 3. FRONTEND — BUGS E QUALIDADE

### CRÍTICOS (UX/Funcional)

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| FE-01 | `components/layout/SettingsShell.jsx` | 10 | `window.scrollTo()` não afeta a `div` interna rolável do `App.jsx` | Passar `ref` da div scrollável via context ou prop |
| FE-02 | `context/AuthContext.jsx` | 76 | `alert()` nativo para expiração de sessão — bloqueia thread, péssima UX | Substituir por `ToastNotification` já existente |
| FE-03 | `index.css` | 168 + 251 | `.btn-primary` definido duas vezes — segunda sobrescreve background com `var(--status-neutral)` | Remover segunda definição (linha 251–259) |

### ALTOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| FE-04 | `App.jsx` | 74, 81 | `eslint-disable-line react-hooks/exhaustive-deps` suprime dependências reais | Estabilizar funções com `useCallback` e adicionar dependências corretas |
| FE-05 | `context/AuthContext.jsx` | 90 | Mesmo problema — `logout` como closure stale | `useCallback` em `logout` |
| FE-06 | `components/admin/AuditLogTable.jsx` | 54 | `useEffect(fetchLogs, [])` ignora dependências de `buildQuery` e `page` | Estabilizar com `useCallback` |
| FE-07 | `components/dashboard/Dashboard.jsx` | 74 | `fetchStats` sem `period` nas dependências | Mover `fetchStats` para dentro do `useEffect` |
| FE-08 | `components/auth/MFAEnroll.jsx` | — | QR Code via serviço externo `api.qrserver.com` — segredo TOTP passa por terceiro | Usar biblioteca local (`qrcode` npm package) |

### MÉDIOS

| ID | Arquivo | Linha | Problema | Correção |
|----|---------|-------|---------|---------|
| FE-09 | `App.jsx` | 192–195 | `Object.assign(e.currentTarget.style, {...})` em `onMouseOver/Out` | Usar classes CSS com `:hover` |
| FE-10 | `App.jsx` | 245 | `[...INTEGRATIONS, ...INTEGRATIONS]` duplicado a cada render | Mover constante para fora do componente |
| FE-11 | `context/ToastContext.jsx` | 22 | `ToastContainer` renderizado mesmo com 0 toasts | `{toasts.length > 0 && <ToastContainer />}` |
| FE-12 | `components/shared/StatCard.jsx` | — | Prop `color` aplicada diretamente em `style` — risco de CSS injection | Whitelist de cores ou usar CSS vars |
| FE-13 | `components/layout/FlyoutPanel.jsx` | 38 | String "Fechar painel" hardcoded em PT-BR | Usar `t('flyout.close_label')` |
| FE-14 | `components/layout/Sidebar.jsx` | 109 | String "Meu Perfil" hardcoded em PT-BR no `title` do avatar | Usar `t('sidebar.my_profile')` |
| FE-15 | `context/TourContext.jsx` | 92 | `useMemo` com todas as funções como dependências — re-render global desnecessário | `useCallback` em cada função individualmente |

### Código Morto

| ID | Arquivo | Problema |
|----|---------|---------|
| DEAD-01 | `web/src/App.css` | 100% morto — estilos do scaffold Vite, nenhum usado no JSX atual |
| DEAD-02 | `web/public/vite.svg` + `web/src/assets/react.svg` | Assets padrão Vite não usados |

---

## 4. UX / DESIGN / ACESSIBILIDADE

### ALTOS

| ID | Arquivo | Problema | Correção |
|----|---------|---------|---------|
| UX-01 | `App.jsx` | Sem loading state/transição entre views (home→settings→profile) | Adicionar fade transition ao trocar `currentView` |
| UX-02 | `components/dashboard/Dashboard.jsx` | Grid `minmax(250px, 1fr)` quebra em telas `<500px` | Media query `@media (max-width: 640px) { grid-template-columns: 1fr }` |
| UX-03 | `components/layout/Sidebar.jsx` | Sem mobile drawer — sidebar de 80px em mobile inútil | Ocultar em `<640px`; drawer hambúrguer no header |
| UX-04 | `components/layout/Sidebar.jsx` | Botões sem `aria-label` descritivo | `aria-label="Abrir/fechar menu"`, `aria-label="Sair da conta"` |

### MÉDIOS

| ID | Arquivo | Problema | Correção |
|----|---------|---------|---------|
| UX-05 | `index.css` | Sem breakpoints `640px` e `480px` (mobile) — apenas `1024px` e `768px` | Adicionar `@media (max-width: 640px)` e `@media (max-width: 480px)` |
| UX-06 | `App.jsx` | Banners de alerta sem `role="alert" aria-live="polite"` | Adicionar atributos ARIA aos 3 banners |
| UX-07 | `components/shared/FormField.jsx` | `<label>` sem `htmlFor` vinculado ao input | Passar `id` e usar `htmlFor={id}` |
| UX-08 | `components/dashboard/Dashboard.jsx` | Tabelas sem `<caption>` e `<th scope="col">` | Adicionar atributos de acessibilidade |
| UX-09 | `index.css` | `.btn-primary` e `.btn-secondary` com paddings diferentes sem critério | Padronizar: `0.75rem 1.5rem` para ambos |
| UX-10 | `index.css` | `prefers-reduced-motion` não cobre todas as transitions CSS | Adicionar `transition: none` completo no media query |
| UX-11 | Múltiplos | Ausência de confirmação antes de ações destrutivas (deletar usuário, revogar sessões) | Reutilizar `ConfirmModal.jsx` já existente |
| UX-12 | `components/admin/Settings.jsx` | Estados de loading/empty/error não diferenciados | Loading skeleton, mensagem "sem dados", banner de erro distintos |

---

## 5. OPORTUNIDADES DE MELHORIA

| ID | Área | Sugestão |
|----|------|---------|
| OPP-01 | Backend | Headers de segurança OWASP como middleware FastAPI (`starlette-security-headers` ou manual) |
| OPP-02 | Backend | `seed_users.py` mover para `backend/scripts/` conforme estrutura-alvo do PRD |
| OPP-03 | Frontend | Lazy-loading do `Dashboard` (recharts + html2canvas + jsPDF são pesados) |
| OPP-04 | Infra | CI/CD com GitHub Actions: lint + testes automáticos no push |
| OPP-05 | Docs | `README.md` desatualizado — não documenta `/api/v1`, MFA, API Keys, variáveis de ambiente |

---

## Resumo por Prioridade

| Prioridade | Quantidade | Sessão Sugerida |
|-----------|-----------|----------------|
| CRÍTICO | 10 | Sessões 1–2 |
| ALTO | 16 | Sessões 2–3 |
| MÉDIO | 25 | Sessões 4–5 |
| BAIXO/OPP | 13 | Sessão 6 |
