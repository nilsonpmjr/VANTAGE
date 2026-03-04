# PRD — Funções Administrativas Avançadas e IAM

**Produto:** Threat Intelligence Tool — Plataforma SOC
**Versão:** 1.0
**Data:** 2026-03-03
**Status:** Draft

---

## 1. Executive Summary

### Problema

A plataforma SOC possui autenticação JWT funcional e RBAC básico (admin/manager/tech), mas carece de controles de identidade exigidos em ambientes corporativos e de segurança: MFA, gestão de sessões, políticas de senha, lockout de conta, audit trail navegável e chaves de API. Isso cria lacunas de segurança e dificulta a conformidade com frameworks como NIST SP 800-63, ISO 27001 e SOC 2.

### Solução Proposta

Implementar um módulo IAM (Identity & Access Management) completo, incorporado à interface administrativa existente, com suporte a MFA multi-provedor (padrão TOTP RFC 6238), gerenciamento de sessões ativas, políticas de senha configuráveis, lockout de conta, audit log navegável, API keys com escopo e permissões granulares por usuário.

### Critérios de Sucesso (KPIs)

| KPI | Meta |
|-----|------|
| Cobertura MFA entre usuários com role admin/manager | ≥ 100% (obrigatório) |
| Redução de tentativas de brute force bem-sucedidas | 0 logins após 5 falhas |
| Tempo de resposta dos endpoints IAM | ≤ 200ms (p95) |
| Cobertura de eventos no audit log | 100% das ações IAM |
| Compatibilidade MFA com apps TOTP padrão | ≥ 5 apps verificados |

---

## 2. Personas e User Stories

### Personas

| Persona | Role | Contexto |
|---------|------|----------|
| **Carlos (Admin SOC)** | admin | Gerencia usuários, configura políticas, monitora sessões |
| **Ana (Gerente SOC)** | manager | Utiliza dashboard, analisa ameaças, gerencia sua própria conta |
| **Pedro (Analista)** | tech | Realiza análises de threat intel, acesso básico |
| **Sistema CI/CD** | service | Consome API via API key para automação |

---

### Feature 1 — MFA Multi-Provedor (TOTP)

**User Stories:**

- `US-1.1` Como **usuário**, quero enrolar meu autenticador TOTP (ex: Google Authenticator, Microsoft Authenticator, IBM Verify, Authy) para que minha conta exija um segundo fator no login.
- `US-1.2` Como **usuário**, quero receber backup codes no momento do enrolamento para que eu possa recuperar o acesso caso perca o dispositivo.
- `US-1.3` Como **admin**, quero configurar quais roles exigem MFA obrigatoriamente (ex: admin e manager) para que a política seja aplicada automaticamente.
- `US-1.4` Como **admin**, quero revogar o dispositivo MFA de outro usuário e forçar re-enrolamento para que eu possa responder a incidentes de segurança.
- `US-1.5` Como **usuário**, quero ver o status do meu MFA no perfil (ativado/desativado) e poder desativar se não for obrigatório para o meu role.

**Critérios de Aceite:**

- [ ] QR code gerado com `pyotp.totp.TOTP.provisioning_uri()`, compatível com qualquer app TOTP RFC 6238
- [ ] Secret TOTP armazenado criptografado em repouso (AES-256 via `cryptography.fernet`)
- [ ] 10 backup codes de uso único gerados no enrolamento; armazenados como hashes
- [ ] Fluxo de login: senha válida → tela de OTP → token JWT emitido somente após OTP correto
- [ ] Janela de tolerância TOTP: ±1 step (30s cada lado = 90s de tolerância)
- [ ] Endpoint `POST /api/mfa/enroll` retorna `{ qr_uri, secret_preview, backup_codes }` apenas na primeira chamada
- [ ] Endpoint `POST /api/mfa/verify` valida o OTP e completa o login
- [ ] Endpoint `DELETE /api/mfa/{username}` (admin only) revoga o dispositivo
- [ ] Campo `mfa_required_roles` em config do sistema (padrão: `["admin", "manager"]`)
- [ ] Usuário com MFA obrigatório não pendente recebe HTTP 403 com `{ detail: "mfa_setup_required" }` após login bem-sucedido

**Non-Goals:**

- SMS OTP (inseguro, não será implementado)
- Hardware keys (FIDO2/WebAuthn) — escopo de versão futura
- OAuth/SAML SSO — escopo de versão futura

---

### Feature 2 — Gerenciamento Avançado de Sessões

**User Stories:**

- `US-2.1` Como **usuário**, quero ver todas as minhas sessões ativas (dispositivo, IP, última atividade) para identificar acessos não autorizados.
- `US-2.2` Como **usuário**, quero revogar uma sessão específica ou todas as outras sessões de uma vez.
- `US-2.3` Como **admin**, quero ver e encerrar sessões ativas de qualquer usuário para responder a incidentes.

**Critérios de Aceite:**

- [ ] Coleção `sessions` no MongoDB com campos: `session_id`, `username`, `ip`, `user_agent`, `created_at`, `last_active`, `is_active`
- [ ] TTL index em `created_at` (expirar após `refresh_token_expire_days`)
- [ ] Endpoint `GET /api/sessions/me` retorna sessões ativas do usuário atual
- [ ] Endpoint `DELETE /api/sessions/me/{session_id}` revoga sessão específica
- [ ] Endpoint `DELETE /api/sessions/me/all` revoga todas exceto a atual
- [ ] Endpoint `GET /api/admin/sessions` (admin) lista sessões de todos os usuários com filtro por username
- [ ] Endpoint `DELETE /api/admin/sessions/{session_id}` (admin) encerra qualquer sessão
- [ ] UI: aba "Sessões Ativas" no perfil do usuário e no painel admin

---

### Feature 3 — Políticas de Senha

**User Stories:**

- `US-3.1` Como **admin**, quero configurar a política de senha (comprimento mínimo, complexidade, histórico, expiração) para garantir conformidade com a política de segurança da organização.
- `US-3.2` Como **usuário**, quero ser notificado quando minha senha está prestes a expirar para que eu possa renová-la antes de ser bloqueado.
- `US-3.3` Como **usuário**, quero ser impedido de reutilizar senhas anteriores ao trocar de senha.

**Critérios de Aceite:**

- [ ] Documento `password_policy` no MongoDB (singleton) com campos:

  ```json
  {
    "min_length": 8,
    "require_uppercase": true,
    "require_numbers": true,
    "require_symbols": false,
    "history_count": 5,
    "expiry_days": 90,
    "expiry_warning_days": 14
  }
  ```

- [ ] Endpoint `GET /api/admin/password-policy` (admin) retorna política atual
- [ ] Endpoint `PUT /api/admin/password-policy` (admin) atualiza política
- [ ] Validação de política aplicada em: criação de usuário, troca de senha, reset de senha
- [ ] Campo `password_history` no documento do usuário: lista das últimas N hashes Argon2
- [ ] Campo `password_changed_at` no documento do usuário
- [ ] Campo `force_password_reset` (bool) — admin pode marcar para forçar troca no próximo login
- [ ] Validação de expiração no `get_current_user`: se `password_changed_at + expiry_days < now`, retornar `{ detail: "password_expired" }` com HTTP 403
- [ ] Aviso de expiração: retornar header `X-Password-Expires-In: <days>` quando dentro da janela de aviso
- [ ] Frontend: banner de aviso exibido quando `X-Password-Expires-In` presente

---

### Feature 4 — Lockout de Conta e Proteção a Brute Force

**User Stories:**

- `US-4.1` Como **sistema**, quero bloquear automaticamente uma conta após N tentativas de login falhas para prevenir ataques de brute force.
- `US-4.2` Como **admin**, quero desbloquear manualmente uma conta e configurar os thresholds de lockout.
- `US-4.3` Como **usuário**, quero receber uma mensagem clara informando que minha conta foi bloqueada e por quanto tempo.

**Critérios de Aceite:**

- [ ] Campos no documento do usuário: `failed_login_count`, `locked_until` (datetime), `last_failed_at`
- [ ] Configuração global `lockout_policy`:

  ```json
  {
    "max_attempts": 5,
    "lockout_duration_minutes": 15,
    "reset_attempts_after_minutes": 30
  }
  ```

- [ ] Endpoint `GET /api/admin/lockout-policy` e `PUT /api/admin/lockout-policy` (admin)
- [ ] Login com conta bloqueada retorna HTTP 423 com `{ detail: "account_locked", locked_until: "<ISO>" }`
- [ ] Login com conta desbloqueada mas tentativas acumuladas: continuar contador, não resetar
- [ ] Endpoint `POST /api/admin/users/{username}/unlock` (admin) zera `failed_login_count` e `locked_until`
- [ ] Evento auditado: `account_locked` e `account_unlocked` com actor e target
- [ ] Rate limiting atual (5/min no IP) mantido como camada adicional

---

### Feature 5 — Log de Auditoria Avançado com Interface

**User Stories:**

- `US-5.1` Como **admin**, quero visualizar o log de auditoria completo em uma tabela filtrável para investigar incidentes.
- `US-5.2` Como **admin**, quero exportar o log filtrado em CSV ou JSON para análise externa ou compliance.
- `US-5.3` Como **manager**, quero ver somente meu próprio histórico de auditoria.

**Critérios de Aceite:**

- [ ] Índices MongoDB em `audit_logs`: `{ timestamp: -1 }`, `{ user: 1, timestamp: -1 }`, `{ action: 1 }`
- [ ] Endpoint `GET /api/admin/audit-logs` com query params:
  - `user` (string), `action` (string), `result` (success|failure|denied), `ip` (string)
  - `from_date`, `to_date` (ISO 8601)
  - `page` (int, default 1), `page_size` (int, max 500)
- [ ] Endpoint `GET /api/audit-logs/me` — usuário vê apenas seus próprios eventos
- [ ] Endpoint `GET /api/admin/audit-logs/export?format=csv|json` — download direto
- [ ] Novos eventos auditados obrigatoriamente:

  | Ação | Trigger |
  |------|---------|
  | `user_created` | POST /api/users |
  | `user_updated` | PUT /api/users/{username} |
  | `user_deleted` | DELETE /api/users/{username} |
  | `role_changed` | PUT role em /api/users/{username} |
  | `mfa_enrolled` | POST /api/mfa/enroll |
  | `mfa_revoked` | DELETE /api/mfa/{username} |
  | `account_locked` | Trigger automático |
  | `account_unlocked` | POST /api/admin/.../unlock |
  | `session_revoked` | DELETE /api/sessions/... |
  | `password_policy_changed` | PUT /api/admin/password-policy |
  | `lockout_policy_changed` | PUT /api/admin/lockout-policy |
  | `api_key_created` | POST /api/apikeys |
  | `api_key_revoked` | DELETE /api/apikeys/{id} |
  | `password_reset_forced` | Admin set force_password_reset |
  | `bulk_import` | POST /api/admin/users/import |

- [ ] UI: nova aba "Audit Log" em Settings (admin) e seção "Meu Histórico" em Profile

---

### Feature 6 — Gerenciamento de API Keys

**User Stories:**

- `US-6.1` Como **admin**, quero criar API keys com escopos limitados para que sistemas externos possam consumir a API com o mínimo de privilégios.
- `US-6.2` Como **admin ou dono**, quero listar, revogar e rotacionar API keys sem interromper outros serviços.
- `US-6.3` Como **sistema CI/CD**, quero autenticar via API key (header `X-API-Key`) para executar análises automatizadas.

**Critérios de Aceite:**

- [ ] Formato da key: `iti_<32 chars aleatórios>` (prefixo visível para identificação)
- [ ] Armazenamento: somente hash SHA-256 da key no banco; valor completo exibido **apenas na criação**
- [ ] Campos da API key: `id`, `name`, `owner` (username), `scopes[]`, `created_at`, `expires_at` (nullable), `last_used_at`, `is_active`
- [ ] Escopos disponíveis inicialmente: `analyze:read`, `stats:read`, `admin:users:read`
- [ ] Endpoint `POST /api/apikeys` (admin ou próprio usuário com permissão) — cria key
- [ ] Endpoint `GET /api/apikeys` — lista keys do usuário atual; admin lista todas com `?all=true`
- [ ] Endpoint `DELETE /api/apikeys/{id}` — revoga key
- [ ] Endpoint `POST /api/apikeys/{id}/rotate` — gera nova key, revoga a antiga
- [ ] Middleware de auth: aceita `X-API-Key: iti_xxx` como alternativa a Bearer/Cookie
- [ ] Rate limiting por API key: configurável por key (padrão: 60 req/min)
- [ ] Keys expiradas rejeitadas com HTTP 401 `{ detail: "api_key_expired" }`

---

### Feature 7 — Permissões Granulares (Fine-Grained Permissions)

**User Stories:**

- `US-7.1` Como **admin**, quero conceder permissões específicas a usuários individuais além das definidas pelo role, para casos de exceção controlada.
- `US-7.2` Como **sistema**, quero verificar permissões granulares sem substituir o modelo RBAC existente.

**Critérios de Aceite:**

- [ ] Campo `extra_permissions[]` no documento do usuário (lista de strings)
- [ ] Permissões disponíveis inicialmente:

  | Permissão | Descrição |
  |-----------|-----------|
  | `audit_logs:read` | Pode visualizar audit logs |
  | `users:export` | Pode exportar lista de usuários |
  | `apikeys:manage` | Pode criar/revogar API keys próprias |
  | `stats:export` | Pode exportar relatórios de estatísticas |

- [ ] Função `has_permission(user, permission)` no backend verifica role padrão OU extra_permissions
- [ ] Endpoint `PUT /api/admin/users/{username}/permissions` (admin) — atualiza extra_permissions
- [ ] Role `admin` tem todas as permissões implicitamente (sem necessidade de lista explícita)

---

### Feature 8 — Recuperação e Self-Service de Conta

**User Stories:**

- `US-8.1` Como **usuário**, quero recuperar o acesso via e-mail quando esquecer a senha.
- `US-8.2` Como **usuário**, quero usar backup codes MFA para recuperar o acesso quando perder o dispositivo.
- `US-8.3` Como **admin**, quero forçar a redefinição de senha de um usuário no próximo login.

**Critérios de Aceite:**

- [ ] Endpoint `POST /api/auth/forgot-password` — recebe `{ email }`, envia link com token de 15 min
- [ ] Endpoint `POST /api/auth/reset-password` — recebe `{ token, new_password }`, valida e troca
- [ ] Token de reset: UUID v4 + hash SHA-256, TTL index MongoDB (15 min), uso único
- [ ] Campo `email` adicionado ao documento do usuário (opcional, necessário para reset por e-mail)
- [ ] Configuração SMTP em `config.py` (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
- [ ] Backup codes MFA: endpoint `POST /api/mfa/recover` aceita backup code, autentica e invalida o code usado
- [ ] Admin: `PUT /api/admin/users/{username}` aceita `{ force_password_reset: true }`
- [ ] Login com `force_password_reset: true` retorna HTTP 403 com `{ detail: "password_reset_required" }` após senha correta; frontend redireciona para tela de troca

---

### Feature 9 — Importação/Exportação de Usuários

**User Stories:**

- `US-9.1` Como **admin**, quero importar uma lista de usuários via CSV para provisionamento em massa.
- `US-9.2` Como **admin**, quero exportar a lista de usuários (sem senhas) para auditoria ou migração.

**Critérios de Aceite:**

- [ ] Endpoint `POST /api/admin/users/import` — aceita arquivo CSV multipart
- [ ] Formato CSV: `username,name,role,email,preferred_lang` (password gerada aleatoriamente + force_password_reset: true)
- [ ] Resposta de importação: `{ created: N, skipped: N, errors: [{ row, reason }] }`
- [ ] Endpoint `GET /api/admin/users/export?format=csv|json` — exporta sem `password_hash`, `mfa_secret`, `password_history`
- [ ] Limite de importação: máximo 500 usuários por request
- [ ] Validação: username único, role válido, email válido se fornecido
- [ ] Evento `bulk_import` auditado com `{ created, skipped }` no campo `detail`

---

### Feature 10 — Dashboard Administrativo Expandido

**User Stories:**

- `US-10.1` Como **admin**, quero ver métricas IAM em tempo real no dashboard para monitorar a saúde do sistema de identidade.
- `US-10.2` Como **admin**, quero poder deletar usuários diretamente na interface sem precisar usar a API.
- `US-10.3` Como **admin**, quero ver o status MFA e sessões ativas de cada usuário na tabela.

**Critérios de Aceite:**

- [ ] Endpoint `GET /api/admin/stats` retorna:

  ```json
  {
    "total_users": 42,
    "active_users": 38,
    "suspended_users": 4,
    "users_with_mfa": 15,
    "active_sessions": 7,
    "failed_logins_24h": 23,
    "locked_accounts": 2,
    "active_api_keys": 5
  }
  ```

- [ ] Tabela de usuários em Settings: colunas adicionadas — Status MFA, Sessões Ativas, Último Login, Ações (editar/suspender/deletar/encerrar sessões)
- [ ] Botão "Deletar" com confirmação modal na interface (atualmente só via API)
- [ ] Indicador visual de lockout: badge "BLOQUEADO" na tabela de usuários
- [ ] Cards de métricas IAM exibidos em aba "Visão Geral" em Settings (admin only)

---

## 3. Especificações Técnicas

### 3.1 Arquitetura — Novos Componentes

```
┌─────────────────────────────────────────────────────────┐
│                    FastAPI Application                   │
│                                                         │
│  /api/mfa          → routers/mfa.py                     │
│  /api/sessions     → routers/sessions.py                │
│  /api/apikeys      → routers/apikeys.py                 │
│  /api/admin        → routers/admin.py  (policy mgmt)    │
│  /api/auth         → routers/auth.py  (+ forgot/reset)  │
│  /api/users        → routers/users.py  (+ import/export)│
│                                                         │
│  auth.py           → + has_permission(), api_key_auth() │
│  audit.py          → + log_action() novos eventos       │
│  crypto.py         → AES-256 para MFA secrets (novo)    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    MongoDB Collections                   │
│                                                         │
│  users             → + mfa_secret_enc, mfa_backup_codes │
│                      + password_history, password_changed_at │
│                      + force_password_reset, email      │
│                      + extra_permissions[], locked_until │
│                      + failed_login_count               │
│                                                         │
│  sessions          → session_id, username, ip, ua,      │
│                      created_at (TTL), last_active       │
│                                                         │
│  api_keys          → id, name, key_hash, owner, scopes, │
│                      expires_at, last_used_at, is_active │
│                                                         │
│  password_policy   → singleton document                 │
│  lockout_policy    → singleton document                 │
│  password_reset_tokens → token_hash, username, expires_at (TTL) │
│  audit_logs        → índices compostos + TTL (90 dias)  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│                                                         │
│  Settings.jsx      → abas: Usuários | Políticas |       │
│                       API Keys | Audit Log | Visão Geral │
│                                                         │
│  Profile.jsx       → + aba MFA Setup | Sessões Ativas   │
│  MFAEnroll.jsx     → QR code + backup codes (novo)      │
│  MFAVerify.jsx     → tela OTP pós-login (novo)          │
│  ForgotPassword.jsx → novo                              │
│  ResetPassword.jsx  → novo                              │
│  AuditLogTable.jsx  → filtros + exportação (novo)       │
│  SessionsTable.jsx  → revogação de sessões (novo)       │
│  ApiKeysManager.jsx → CRUD de API keys (novo)           │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Fluxo MFA no Login

```
1. POST /api/auth/login  { username, password }
   → Senha válida, MFA ativo
   → Emitir "pre-auth token" de vida curta (5 min, escopo: mfa_pending)
   → HTTP 200 { mfa_required: true, pre_auth_token: "..." }

2. POST /api/mfa/verify  { pre_auth_token, otp }
   → OTP válido
   → Revogar pre-auth token
   → Emitir access_token + refresh_token normais
   → HTTP 200 { user: {...} }

3. Usuário sem MFA, role obrigatório (admin/manager)
   → Após login, HTTP 403 { detail: "mfa_setup_required" }
   → Frontend redireciona para /mfa/enroll
```

### 3.3 Novas Dependências Python

```
pyotp>=2.9.0          # TOTP RFC 6238
cryptography>=42.0.0  # AES-256 Fernet para MFA secrets
aiosmtplib>=3.0.0     # SMTP assíncrono para reset de senha
python-multipart      # já existe (para CSV upload)
```

### 3.4 Variáveis de Ambiente Novas

```bash
# MFA
MFA_ENCRYPTION_KEY=<32-byte Fernet key>  # obrigatório em produção

# SMTP (opcional — necessário para Feature 8)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=<senha>
SMTP_FROM="SOC Platform <noreply@example.com>"
SMTP_TLS=true

# Políticas (defaults; podem ser sobrescritos via UI)
DEFAULT_LOCKOUT_MAX_ATTEMPTS=5
DEFAULT_LOCKOUT_DURATION_MINUTES=15
DEFAULT_PASSWORD_MIN_LENGTH=8
DEFAULT_PASSWORD_EXPIRY_DAYS=90
```

### 3.5 Segurança e Privacidade

| Dado | Armazenamento | Proteção |
|------|---------------|----------|
| MFA secret | `mfa_secret_enc` (string) | AES-256 Fernet |
| Backup codes | Lista de hashes Argon2 | Argon2 hash, uso único |
| API key | `key_hash` (string) | SHA-256; plain text exibido apenas 1x |
| Password history | Lista de hashes Argon2 | Argon2 hash |
| Password reset token | `token_hash` | SHA-256; TTL 15 min |
| Session data | Campos em `sessions` | TTL automático |

**Conformidade:**

- LGPD: Export de usuário não inclui hashes de senhas nem secrets MFA
- Audit log retido por 90 dias (TTL index configurável)
- Princípio do menor privilégio via escopos de API key

---

## 4. Roadmap e Faseamento

### Fase 1 — MVP de Segurança (Sprint 1-2) ⚡ Alta Prioridade

Impacto imediato na postura de segurança.

| Feature | Entregável |
|---------|-----------|
| F4 — Lockout | Bloqueio automático + unlock admin |
| F3 — Políticas de Senha | Validação de complexidade + histórico |
| F10 — Dashboard (parcial) | Botão deletar na UI + badge BLOQUEADO |
| F5 — Audit Log (backend) | Novos eventos + índices MongoDB |

### Fase 2 — MFA e Sessões (Sprint 3-4) 🔒 Crítico

Elimina a maior lacuna de segurança atual.

| Feature | Entregável |
|---------|-----------|
| F1 — MFA TOTP | Enrolamento + verificação + revogação admin |
| F2 — Sessões | Painel de sessões + revogação |
| F5 — Audit Log (UI) | Interface web com filtros + exportação |

### Fase 3 — IAM Avançado (Sprint 5-6) 🏗️ Expansão

Capacidades enterprise e automação.

| Feature | Entregável |
|---------|-----------|
| F6 — API Keys | CRUD + middleware de auth + rate limiting |
| F7 — Permissões Granulares | extra_permissions + has_permission() |
| F8 — Recuperação de Conta | Forgot password + reset via email |

### Fase 4 — Operações em Escala (Sprint 7) 📦 Maturidade

| Feature | Entregável |
|---------|-----------|
| F9 — Import/Export | CSV import + export de usuários |
| F10 — Dashboard (completo) | Cards de métricas IAM |

---

## 5. Riscos e Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Usuário perde dispositivo MFA sem backup codes | Alto | Médio | Admin pode revogar MFA; backup codes gerados obrigatoriamente |
| MFA_ENCRYPTION_KEY perdida | Crítico | Baixo | Documentar processo de backup; alertar no startup se não configurada em produção |
| SMTP não configurado (F8 indisponível) | Médio | Alto | Feature degradável: admin pode fazer reset manual; SMTP opcional |
| Migração de usuários existentes sem `email` | Médio | Alto | Campo email nullable; reset por email só disponível se email cadastrado |
| Performance de validação de histórico de senha | Baixo | Baixo | Máximo 5 hashes; Argon2 com custo ajustado para batch |
| CSV import com dados inválidos | Médio | Médio | Validação linha por linha; retornar relatório de erros sem falha total |

---

## 6. Non-Goals (Fora de Escopo deste PRD)

- **SSO/SAML/OIDC** (ex: integração com Azure AD, Okta) — PRD separado
- **FIDO2/WebAuthn** (hardware keys como YubiKey) — versão futura
- **SMS OTP** — inseguro por design, não será implementado
- **SCIM provisioning** — automação avançada de provisionamento
- **IP allowlisting** por usuário — pode ser adicionado via extra_permissions
- **Data masking** em audit logs — LGPD avançado, versão futura

---

## 7. Internacionalização

Todas as novas strings de UI devem ser adicionadas aos arquivos de tradução existentes para **pt**, **en** e **es** antes do merge. Mensagens de erro da API retornam chaves (ex: `"mfa_setup_required"`) que o frontend traduz via i18n.

---

## Apêndice A — Esquema MongoDB Atualizado (diff)

```javascript
// users collection — campos adicionados
{
  // ... campos existentes ...
  "email": "user@example.com",              // nullable
  "mfa_enabled": false,
  "mfa_secret_enc": null,                   // AES-256 Fernet encrypted
  "mfa_backup_codes": [],                   // lista de hashes Argon2
  "password_history": [],                   // últimas 5 hashes Argon2
  "password_changed_at": ISODate(),
  "force_password_reset": false,
  "failed_login_count": 0,
  "locked_until": null,                     // ISODate ou null
  "last_failed_at": null,
  "extra_permissions": []                   // ["audit_logs:read", ...]
}

// sessions collection (nova)
{
  "session_id": "uuid-v4",
  "username": "admin",
  "ip": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "created_at": ISODate(),                  // TTL index
  "last_active": ISODate(),
  "is_active": true
}

// api_keys collection (nova)
{
  "_id": ObjectId(),
  "name": "CI/CD Pipeline",
  "key_hash": "sha256:...",
  "key_prefix": "iti_abc1",                // primeiros 8 chars para exibição
  "owner": "admin",
  "scopes": ["analyze:read"],
  "created_at": ISODate(),
  "expires_at": null,
  "last_used_at": null,
  "is_active": true
}

// password_policy collection (singleton)
{
  "_id": "policy",
  "min_length": 8,
  "require_uppercase": true,
  "require_numbers": true,
  "require_symbols": false,
  "history_count": 5,
  "expiry_days": 90,
  "expiry_warning_days": 14,
  "updated_at": ISODate(),
  "updated_by": "admin"
}

// lockout_policy collection (singleton)
{
  "_id": "policy",
  "max_attempts": 5,
  "lockout_duration_minutes": 15,
  "reset_attempts_after_minutes": 30,
  "updated_at": ISODate(),
  "updated_by": "admin"
}
```

---

*Documento gerado em 2026-03-03 — Threat Intelligence Tool SOC Platform*
