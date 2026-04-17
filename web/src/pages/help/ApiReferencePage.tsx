import { useState } from "react";
import { Copy, Check, Lock, ShieldCheck, Zap } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../../context/LanguageContext";
import type { SupportedLanguage } from "../../lib/language";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  auth: "none" | "jwt" | "jwt+rbac" | "jwt+admin" | "jwt+extension";
  params?: string;
  body?: string;
  response?: string;
}

interface EndpointGroup {
  tag: string;
  description: string;
  endpoints: Endpoint[];
}

const METHOD_STYLE: Record<HttpMethod, string> = {
  GET: "badge-primary",
  POST: "bg-emerald-500/10 text-emerald-600",
  PUT: "badge-warning",
  PATCH: "badge-warning",
  DELETE: "badge-error",
};

const groups: EndpointGroup[] = [
  {
    tag: "Authentication",
    description: "Login, token refresh, logout, and password recovery flows.",
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/login",
        summary: "Authenticate with username and password. Returns access token and sets HttpOnly refresh cookie.",
        auth: "none",
        body: '{ "username": "string", "password": "string" }',
        response: '{ "access_token": "string", "token_type": "bearer" }',
      },
      {
        method: "POST",
        path: "/api/auth/refresh",
        summary: "Rotate access and refresh tokens using the HttpOnly cookie.",
        auth: "none",
        response: '{ "access_token": "string" }',
      },
      {
        method: "POST",
        path: "/api/auth/logout",
        summary: "Clear session cookies and invalidate the current refresh token.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/auth/me",
        summary: "Return the authenticated user's profile information.",
        auth: "jwt",
        response: '{ "username": "string", "role": "string", "email": "string|null", ... }',
      },
      {
        method: "POST",
        path: "/api/auth/forgot-password",
        summary: "Send a password reset email to the user's registered address.",
        auth: "none",
        body: '{ "email": "string" }',
      },
      {
        method: "POST",
        path: "/api/auth/reset-password",
        summary: "Reset password using a valid reset token.",
        auth: "none",
        body: '{ "token": "string", "new_password": "string" }',
      },
    ],
  },
  {
    tag: "MFA",
    description: "TOTP enrollment, verification, and management.",
    endpoints: [
      {
        method: "POST",
        path: "/api/mfa/enroll",
        summary: "Start TOTP enrollment. Returns a QR code URI and 8 backup codes.",
        auth: "jwt",
        response: '{ "provisioning_uri": "string", "backup_codes": ["string"] }',
      },
      {
        method: "POST",
        path: "/api/mfa/confirm",
        summary: "Confirm TOTP enrollment with a valid 6-digit code.",
        auth: "jwt",
        body: '{ "code": "string" }',
      },
      {
        method: "POST",
        path: "/api/mfa/verify",
        summary: "Verify TOTP code during login (requires pre-auth token).",
        auth: "none",
        body: '{ "pre_auth_token": "string", "code": "string" }',
        response: '{ "access_token": "string" }',
      },
      {
        method: "DELETE",
        path: "/api/mfa/me",
        summary: "Disable MFA on your own account (not allowed for admin/manager roles).",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/mfa/{username}",
        summary: "Admin: revoke MFA for another user.",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "Users",
    description: "User management, profiles, and third-party API key configuration.",
    endpoints: [
      {
        method: "GET",
        path: "/api/users/",
        summary: "List all users (admin only).",
        auth: "jwt+admin",
      },
      {
        method: "POST",
        path: "/api/users/",
        summary: "Create a new user (admin only).",
        auth: "jwt+admin",
        body: '{ "username": "string", "password": "string", "role": "admin|manager|tech", "email": "string|null" }',
      },
      {
        method: "PUT",
        path: "/api/users/me",
        summary: "Update your own profile (display name, email, language).",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/users/me/audit-logs",
        summary: "View your personal audit log with pagination.",
        auth: "jwt",
        params: "page, limit (query)",
      },
      {
        method: "GET",
        path: "/api/users/me/third-party-keys",
        summary: "Retrieve configured intelligence API keys (masked).",
        auth: "jwt",
      },
      {
        method: "PATCH",
        path: "/api/users/me/third-party-keys",
        summary: "Update intelligence API keys for external services.",
        auth: "jwt",
        body: '{ "virustotal": "string", "shodan": "string", ... }',
      },
      {
        method: "DELETE",
        path: "/api/users/{username}",
        summary: "Delete a user account (admin only).",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "Sessions",
    description: "Active session management and revocation.",
    endpoints: [
      {
        method: "GET",
        path: "/api/auth/sessions/",
        summary: "List your active sessions with device and IP info.",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/auth/sessions/others",
        summary: "Revoke all sessions except the current one.",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/auth/sessions/{session_id}",
        summary: "Revoke a specific session by ID.",
        auth: "jwt",
        params: "session_id (path)",
      },
      {
        method: "GET",
        path: "/api/auth/sessions/admin/{username}",
        summary: "Admin: list a specific user's sessions.",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "API Keys",
    description: "Programmatic access keys with prefix iti_xxx.",
    endpoints: [
      {
        method: "POST",
        path: "/api/api-keys/",
        summary: "Create a new API key. The full key is returned only once.",
        auth: "jwt",
        body: '{ "name": "string", "expires_in_days": "number|null" }',
        response: '{ "key": "iti_xxx...", "key_id": "string" }',
      },
      {
        method: "GET",
        path: "/api/api-keys/me",
        summary: "List your API keys (prefix and metadata only).",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/api-keys/{key_id}",
        summary: "Revoke an API key.",
        auth: "jwt",
        params: "key_id (path)",
      },
      {
        method: "GET",
        path: "/api/api-keys/admin/{username}",
        summary: "Admin: list a user's API keys.",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "Analysis",
    description: "IOC analysis across configured intelligence sources.",
    endpoints: [
      {
        method: "GET",
        path: "/api/analyze/status",
        summary: "Check which intelligence services have valid API keys configured.",
        auth: "jwt",
        response: '{ "services": { "virustotal": true, "shodan": false, ... } }',
      },
      {
        method: "GET",
        path: "/api/analyze/analyze",
        summary: "Analyze an IP, domain, or hash across all configured sources.",
        auth: "jwt",
        params: "target, lang (query)",
        response: '{ "verdict": "string", "findings": [...], "scores": {...} }',
      },
    ],
  },
  {
    tag: "Batch",
    description: "Bulk indicator analysis with daily quota.",
    endpoints: [
      {
        method: "POST",
        path: "/api/batch/estimate",
        summary: "Estimate targets count before submitting a batch job.",
        auth: "jwt",
        body: '{ "targets": ["string"] }',
      },
      {
        method: "POST",
        path: "/api/batch/",
        summary: "Submit a batch analysis job (returns 202 Accepted).",
        auth: "jwt",
        body: '{ "targets": ["string"], "lang": "pt|en|es" }',
      },
      {
        method: "GET",
        path: "/api/batch/history",
        summary: "List your batch job history.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/batch/quota/today",
        summary: "Check your remaining daily batch quota.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/batch/{job_id}",
        summary: "Get status and results of a specific batch job.",
        auth: "jwt",
        params: "job_id (path)",
      },
      {
        method: "GET",
        path: "/api/batch/{job_id}/stream",
        summary: "SSE stream for real-time batch progress updates.",
        auth: "jwt",
        params: "job_id (path)",
      },
    ],
  },
  {
    tag: "Recon",
    description: "Reconnaissance engine with modular scanning.",
    endpoints: [
      {
        method: "GET",
        path: "/api/recon/modules",
        summary: "List available reconnaissance modules.",
        auth: "jwt",
      },
      {
        method: "POST",
        path: "/api/recon/scan",
        summary: "Start a recon scan (returns 202 Accepted).",
        auth: "jwt",
        body: '{ "target": "string", "modules": ["dns","whois","ssl","ports",...] }',
      },
      {
        method: "GET",
        path: "/api/recon/stream/{job_id}",
        summary: "SSE stream for real-time scan results.",
        auth: "jwt",
        params: "job_id (path)",
      },
      {
        method: "GET",
        path: "/api/recon/history/{target}",
        summary: "View recon history for a specific target.",
        auth: "jwt",
        params: "target (path)",
      },
      {
        method: "GET",
        path: "/api/recon/{job_id}",
        summary: "Get full details of a recon job.",
        auth: "jwt",
        params: "job_id (path)",
      },
      {
        method: "POST",
        path: "/api/recon/scheduled",
        summary: "Create a scheduled recurring scan.",
        auth: "jwt",
        body: '{ "target": "string", "modules": ["string"], "interval": "string" }',
      },
      {
        method: "GET",
        path: "/api/recon/scheduled/mine",
        summary: "List your scheduled scans.",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/recon/scheduled/{item_id}",
        summary: "Delete a scheduled scan.",
        auth: "jwt",
        params: "item_id (path)",
      },
    ],
  },
  {
    tag: "Feed",
    description: "Threat intelligence feed with filtering and pagination.",
    endpoints: [
      {
        method: "GET",
        path: "/api/feed/",
        summary: "List threat feed items with optional severity, source_type, and TLP filters.",
        auth: "jwt",
        params: "limit, offset, severity, source_type, tlp (query)",
        response: '{ "items": [...], "total": number }',
      },
    ],
  },
  {
    tag: "Watchlist",
    description: "Priority asset monitoring with notifications.",
    endpoints: [
      {
        method: "GET",
        path: "/api/watchlist/smtp-status",
        summary: "Check if SMTP is configured for watchlist notifications.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/watchlist/",
        summary: "List all watchlist items.",
        auth: "jwt",
      },
      {
        method: "POST",
        path: "/api/watchlist/",
        summary: "Add an indicator to the watchlist.",
        auth: "jwt",
        body: '{ "target": "string", "type": "ip|domain|hash", "notes": "string" }',
      },
      {
        method: "PATCH",
        path: "/api/watchlist/{item_id}",
        summary: "Update a watchlist item.",
        auth: "jwt",
        params: "item_id (path)",
      },
      {
        method: "DELETE",
        path: "/api/watchlist/{item_id}",
        summary: "Remove an item from the watchlist.",
        auth: "jwt",
        params: "item_id (path)",
      },
    ],
  },
  {
    tag: "Admin",
    description: "Platform administration: policies, users, extensions, ingestion, audit.",
    endpoints: [
      {
        method: "GET",
        path: "/api/admin/lockout-policy",
        summary: "Read account lockout policy settings.",
        auth: "jwt+admin",
      },
      {
        method: "PUT",
        path: "/api/admin/lockout-policy",
        summary: "Update account lockout policy.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/password-policy",
        summary: "Read password policy settings.",
        auth: "jwt+admin",
      },
      {
        method: "PUT",
        path: "/api/admin/password-policy",
        summary: "Update password policy.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/stats",
        summary: "Admin dashboard statistics.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/extensions",
        summary: "List all installed extensions/plugins.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/extensions/features",
        summary: "List active feature modules provided by installed extensions.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/admin/threat-sources",
        summary: "List configured threat feed sources.",
        auth: "jwt+admin",
      },
      {
        method: "POST",
        path: "/api/admin/threat-sources/custom",
        summary: "Add a custom RSS threat source.",
        auth: "jwt+admin",
        body: '{ "name": "string", "url": "string", "family": "string", "interval_minutes": number }',
      },
      {
        method: "GET",
        path: "/api/admin/audit-logs",
        summary: "Query platform-wide audit logs with filters.",
        auth: "jwt+admin",
        params: "user, action, result, date_from, date_to, page, limit (query)",
      },
      {
        method: "GET",
        path: "/api/admin/audit-logs/export",
        summary: "Export audit logs as CSV or JSON.",
        auth: "jwt+admin",
        params: "format (query: csv|json)",
      },
    ],
  },
];

function getAuthLabels(t: (key: string, fallback?: string) => string): Record<string, { label: string; icon: typeof Lock }> {
  return {
    none: { label: t("help.apiAuthPublic", "Public"), icon: Zap },
    jwt: { label: t("help.apiAuthJwt", "JWT Required"), icon: Lock },
    "jwt+rbac": { label: t("help.apiAuthRole", "JWT + Role"), icon: ShieldCheck },
    "jwt+admin": { label: t("help.apiAuthAdmin", "Admin Only"), icon: ShieldCheck },
    "jwt+extension": { label: t("help.apiAuthExtension", "Extension Enabled"), icon: ShieldCheck },
  };
}

function getGroupLabel(tag: string, t: (key: string, fallback?: string) => string) {
  const labels: Record<string, string> = {
    Authentication: t("help.apiGroupAuthentication", "Authentication"),
    MFA: t("help.apiGroupMfa", "MFA"),
    Users: t("help.apiGroupUsers", "Users"),
    Sessions: t("help.apiGroupSessions", "Sessions"),
    "API Keys": t("help.apiGroupApiKeys", "API Keys"),
    Analysis: t("help.apiGroupAnalysis", "Analysis"),
    Batch: t("help.apiGroupBatch", "Batch"),
    Recon: t("help.apiGroupRecon", "Recon"),
    Feed: t("help.apiGroupFeed", "Feed"),
    Watchlist: t("help.apiGroupWatchlist", "Watchlist"),
    Admin: t("help.apiGroupAdmin", "Admin"),
  };

  return labels[tag] || tag;
}

function getGroupDescription(tag: string, t: (key: string, fallback?: string) => string) {
  const descriptions: Record<string, string> = {
    Authentication: t("help.apiGroupAuthenticationBody", "Login, token refresh, logout, and password recovery flows."),
    MFA: t("help.apiGroupMfaBody", "TOTP enrollment, verification, and management."),
    Users: t("help.apiGroupUsersBody", "User management, profiles, and third-party API key configuration."),
    Sessions: t("help.apiGroupSessionsBody", "Active session management and revocation."),
    "API Keys": t("help.apiGroupApiKeysBody", "Programmatic access keys with the iti_xxx prefix."),
    Analysis: t("help.apiGroupAnalysisBody", "IOC analysis across configured intelligence sources."),
    Batch: t("help.apiGroupBatchBody", "Bulk indicator analysis with daily quota."),
    Recon: t("help.apiGroupReconBody", "Reconnaissance engine with modular scanning."),
    Feed: t("help.apiGroupFeedBody", "Threat intelligence feed with filtering and pagination."),
    Watchlist: t("help.apiGroupWatchlistBody", "Priority asset monitoring with notifications."),
    Admin: t("help.apiGroupAdminBody", "Platform administration: policies, users, extensions, ingestion, and audit."),
  };

  return descriptions[tag] || "";
}

function getEndpointSummary(ep: Endpoint, language: SupportedLanguage) {
  const key = `${ep.method} ${ep.path}`;

  const localized: Record<SupportedLanguage, Record<string, string>> = {
    pt: {
      "POST /api/auth/login": "Autentica com username e senha. Retorna o access token e define o cookie HttpOnly de refresh.",
      "POST /api/auth/refresh": "Rotaciona access e refresh token usando o cookie HttpOnly.",
      "POST /api/auth/logout": "Limpa os cookies da sessão e invalida o refresh token atual.",
      "GET /api/auth/me": "Retorna o perfil do usuário autenticado.",
      "POST /api/auth/forgot-password": "Envia um email de recuperação de senha para o endereço registrado.",
      "POST /api/auth/reset-password": "Redefine a senha usando um token de reset válido.",
      "POST /api/mfa/enroll": "Inicia a ativação de TOTP. Retorna a URI do QR code e 8 códigos de backup.",
      "POST /api/mfa/confirm": "Confirma a ativação do TOTP com um código válido de 6 dígitos.",
      "POST /api/mfa/verify": "Verifica o código TOTP durante o login usando o pre-auth token.",
      "DELETE /api/mfa/me": "Desativa o MFA na própria conta, quando permitido pela política.",
      "DELETE /api/mfa/{username}": "Admin: revoga o MFA de outro usuário.",
      "GET /api/users/": "Lista todos os usuários da plataforma (somente admin).",
      "POST /api/users/": "Cria um novo usuário (somente admin).",
      "PUT /api/users/me": "Atualiza o próprio perfil, incluindo nome de exibição, email e idioma.",
      "GET /api/users/me/audit-logs": "Consulta o audit log pessoal com paginação.",
      "GET /api/users/me/third-party-keys": "Recupera as chaves de API de inteligência já configuradas, com mascaramento.",
      "PATCH /api/users/me/third-party-keys": "Atualiza as chaves de API dos serviços externos de inteligência.",
      "DELETE /api/users/{username}": "Remove uma conta de usuário (somente admin).",
      "GET /api/auth/sessions/": "Lista as sessões ativas do operador com dispositivo e IP.",
      "DELETE /api/auth/sessions/others": "Revoga todas as sessões, exceto a atual.",
      "DELETE /api/auth/sessions/{session_id}": "Revoga uma sessão específica pelo ID.",
      "GET /api/auth/sessions/admin/{username}": "Admin: lista as sessões de um usuário específico.",
      "POST /api/api-keys/": "Cria uma nova chave de API. A chave completa é retornada apenas uma vez.",
      "GET /api/api-keys/me": "Lista as chaves de API do usuário com prefixo e metadata.",
      "DELETE /api/api-keys/{key_id}": "Revoga uma chave de API.",
      "GET /api/api-keys/admin/{username}": "Admin: lista as chaves de API de um usuário.",
      "GET /api/analyze/status": "Verifica quais serviços de inteligência têm chaves válidas configuradas.",
      "GET /api/analyze/analyze": "Analisa um IP, domínio ou hash em todas as fontes configuradas.",
      "POST /api/batch/estimate": "Estima a quantidade de alvos antes de enviar um job em lote.",
      "POST /api/batch/": "Envia um job de análise em lote e retorna 202 Accepted.",
      "GET /api/batch/history": "Lista o histórico de jobs em lote do usuário.",
      "GET /api/batch/quota/today": "Consulta a cota diária restante para processamento em lote.",
      "GET /api/batch/{job_id}": "Retorna status e resultados de um job em lote específico.",
      "GET /api/batch/{job_id}/stream": "Abre um stream SSE para acompanhar o progresso do lote em tempo real.",
      "GET /api/recon/modules": "Lista os módulos de reconhecimento disponíveis.",
      "POST /api/recon/scan": "Inicia um scan de recon e retorna 202 Accepted.",
      "GET /api/recon/stream/{job_id}": "Abre um stream SSE para resultados de recon em tempo real.",
      "GET /api/recon/history/{target}": "Exibe o histórico de recon de um alvo específico.",
      "GET /api/recon/{job_id}": "Retorna os detalhes completos de um job de recon.",
      "POST /api/recon/scheduled": "Cria um scan recorrente agendado.",
      "GET /api/recon/scheduled/mine": "Lista os scans agendados do operador.",
      "DELETE /api/recon/scheduled/{item_id}": "Remove um scan agendado.",
      "GET /api/feed/": "Lista itens do feed com filtros opcionais por severidade, tipo de fonte e TLP.",
      "GET /api/watchlist/smtp-status": "Verifica se o SMTP está configurado para notificações da Watchlist.",
      "GET /api/watchlist/": "Lista todos os itens monitorados na Watchlist.",
      "POST /api/watchlist/": "Adiciona um indicador à Watchlist.",
      "PATCH /api/watchlist/{item_id}": "Atualiza um item da Watchlist.",
      "DELETE /api/watchlist/{item_id}": "Remove um item da Watchlist.",
      "GET /api/admin/lockout-policy": "Lê a configuração da política de bloqueio de conta.",
      "PUT /api/admin/lockout-policy": "Atualiza a política de bloqueio de conta.",
      "GET /api/admin/password-policy": "Lê a configuração da política de senha.",
      "PUT /api/admin/password-policy": "Atualiza a política de senha.",
      "GET /api/admin/stats": "Retorna estatísticas do dashboard administrativo.",
      "GET /api/admin/extensions": "Lista todas as extensões e plugins instalados.",
      "GET /api/admin/extensions/features": "Lista os módulos de recurso ativos fornecidos pelas extensões instaladas.",
      "GET /api/admin/threat-sources": "Lista as fontes de feed de ameaça configuradas.",
      "POST /api/admin/threat-sources/custom": "Adiciona uma fonte RSS customizada.",
      "GET /api/admin/audit-logs": "Consulta o audit log global da plataforma com filtros.",
      "GET /api/admin/audit-logs/export": "Exporta o audit log em CSV ou JSON.",
    },
    es: {
      "POST /api/auth/login": "Autentica con username y contraseña. Devuelve el access token y define la cookie HttpOnly de refresh.",
      "POST /api/auth/refresh": "Rota access y refresh token usando la cookie HttpOnly.",
      "POST /api/auth/logout": "Limpia las cookies de sesión e invalida el refresh token actual.",
      "GET /api/auth/me": "Devuelve el perfil del usuario autenticado.",
      "POST /api/auth/forgot-password": "Envía un correo de recuperación de contraseña a la dirección registrada.",
      "POST /api/auth/reset-password": "Restablece la contraseña usando un token de reset válido.",
      "POST /api/mfa/enroll": "Inicia la activación de TOTP. Devuelve la URI del QR y 8 códigos de respaldo.",
      "POST /api/mfa/confirm": "Confirma la activación de TOTP con un código válido de 6 dígitos.",
      "POST /api/mfa/verify": "Verifica el código TOTP durante el login usando el pre-auth token.",
      "DELETE /api/mfa/me": "Desactiva el MFA en la propia cuenta cuando la política lo permite.",
      "DELETE /api/mfa/{username}": "Admin: revoca el MFA de otro usuario.",
      "GET /api/users/": "Lista todos los usuarios de la plataforma (solo admin).",
      "POST /api/users/": "Crea un nuevo usuario (solo admin).",
      "PUT /api/users/me": "Actualiza el propio perfil, incluido nombre para mostrar, email e idioma.",
      "GET /api/users/me/audit-logs": "Consulta el registro de auditoría personal con paginación.",
      "GET /api/users/me/third-party-keys": "Recupera las claves API de inteligencia ya configuradas, con enmascaramiento.",
      "PATCH /api/users/me/third-party-keys": "Actualiza las claves API de los servicios externos de inteligencia.",
      "DELETE /api/users/{username}": "Elimina una cuenta de usuario (solo admin).",
      "GET /api/auth/sessions/": "Lista las sesiones activas del operador con dispositivo e IP.",
      "DELETE /api/auth/sessions/others": "Revoca todas las sesiones excepto la actual.",
      "DELETE /api/auth/sessions/{session_id}": "Revoca una sesión específica por ID.",
      "GET /api/auth/sessions/admin/{username}": "Admin: lista las sesiones de un usuario específico.",
      "POST /api/api-keys/": "Crea una nueva clave API. La clave completa se devuelve solo una vez.",
      "GET /api/api-keys/me": "Lista las claves API del usuario con prefijo y metadata.",
      "DELETE /api/api-keys/{key_id}": "Revoca una clave API.",
      "GET /api/api-keys/admin/{username}": "Admin: lista las claves API de un usuario.",
      "GET /api/analyze/status": "Verifica qué servicios de inteligencia tienen claves válidas configuradas.",
      "GET /api/analyze/analyze": "Analiza una IP, dominio o hash en todas las fuentes configuradas.",
      "POST /api/batch/estimate": "Estima la cantidad de objetivos antes de enviar un job por lote.",
      "POST /api/batch/": "Envía un job de análisis por lote y devuelve 202 Accepted.",
      "GET /api/batch/history": "Lista el historial de jobs por lote del usuario.",
      "GET /api/batch/quota/today": "Consulta la cuota diaria restante para procesamiento por lote.",
      "GET /api/batch/{job_id}": "Devuelve el estado y los resultados de un job por lote específico.",
      "GET /api/batch/{job_id}/stream": "Abre un stream SSE para seguir el progreso del lote en tiempo real.",
      "GET /api/recon/modules": "Lista los módulos de reconocimiento disponibles.",
      "POST /api/recon/scan": "Inicia un scan de recon y devuelve 202 Accepted.",
      "GET /api/recon/stream/{job_id}": "Abre un stream SSE para resultados de recon en tiempo real.",
      "GET /api/recon/history/{target}": "Muestra el historial de recon de un objetivo específico.",
      "GET /api/recon/{job_id}": "Devuelve los detalles completos de un job de recon.",
      "POST /api/recon/scheduled": "Crea un scan recurrente programado.",
      "GET /api/recon/scheduled/mine": "Lista los scans programados del operador.",
      "DELETE /api/recon/scheduled/{item_id}": "Elimina un scan programado.",
      "GET /api/feed/": "Lista elementos del feed con filtros opcionales por severidad, tipo de fuente y TLP.",
      "GET /api/watchlist/smtp-status": "Verifica si SMTP está configurado para notificaciones de Watchlist.",
      "GET /api/watchlist/": "Lista todos los elementos monitorizados en Watchlist.",
      "POST /api/watchlist/": "Añade un indicador a Watchlist.",
      "PATCH /api/watchlist/{item_id}": "Actualiza un elemento de Watchlist.",
      "DELETE /api/watchlist/{item_id}": "Elimina un elemento de Watchlist.",
      "GET /api/admin/lockout-policy": "Lee la configuración de la política de bloqueo de cuenta.",
      "PUT /api/admin/lockout-policy": "Actualiza la política de bloqueo de cuenta.",
      "GET /api/admin/password-policy": "Lee la configuración de la política de contraseña.",
      "PUT /api/admin/password-policy": "Actualiza la política de contraseña.",
      "GET /api/admin/stats": "Devuelve estadísticas del dashboard administrativo.",
      "GET /api/admin/extensions": "Lista todas las extensiones y plugins instalados.",
      "GET /api/admin/extensions/features": "Lista los módulos de funcionalidad activos proporcionados por las extensiones instaladas.",
      "GET /api/admin/threat-sources": "Lista las fuentes de feed de amenazas configuradas.",
      "POST /api/admin/threat-sources/custom": "Añade una fuente RSS personalizada.",
      "GET /api/admin/audit-logs": "Consulta el registro global de auditoría con filtros.",
      "GET /api/admin/audit-logs/export": "Exporta el registro de auditoría en CSV o JSON.",
    },
    en: {},
  };

  return localized[language]?.[key] || ep.summary;
}

function CurlBlock({ method, path }: { method: string; path: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const curl = `curl -X ${method} \\
  '${window.location.origin}${path}' \\
  -H 'Authorization: Bearer <token>' \\
  -H 'Content-Type: application/json'`;

  const handleCopy = () => {
    navigator.clipboard.writeText(curl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative mt-3">
      <pre className="bg-inverse-surface text-on-primary text-[11px] font-mono p-4 rounded-sm overflow-x-auto leading-relaxed">
        {curl}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-sm bg-white/10 hover:bg-white/20 transition-colors"
        title={t("help.copyCurl", "Copy curl command")}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-white/60" />
        )}
      </button>
    </div>
  );
}

export default function ApiReferencePage() {
  const { t, language } = useLanguage();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const authLabels = getAuthLabels(t);

  const filtered = activeTag
    ? groups.filter((g) => g.tag === activeTag)
    : groups;

  const totalEndpoints = groups.reduce(
    (sum, g) => sum + g.endpoints.length,
    0,
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="summary-strip">
        <div className="summary-pill">
          <Zap className="w-3.5 h-3.5 text-primary" />
          {totalEndpoints} {t("help.endpoints", "endpoints")}
        </div>
        <div className="summary-pill-muted">{groups.length} {t("help.groups", "groups")}</div>
        <div className="summary-pill-muted">{t("help.baseUrl", "Base URL")}: /api</div>
      </div>

      <div className="surface-section">
        <div className="surface-section-header">
          <h3 className="surface-section-title">{t("help.apiAuthentication", "Authentication")}</h3>
        </div>
        <div className="p-6 space-y-3 text-sm text-on-surface-variant">
          <p>
            {t("help.apiAuthBodyOne", "Most endpoints require a valid JWT access token. Include it as a Bearer token in the Authorization header or rely on the HttpOnly session cookie set after login.").split("Bearer")[0]}{" "}
            <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface font-mono text-xs">
              Bearer
            </code>{" "}
            {t("help.apiAuthBodyOne", "Most endpoints require a valid JWT access token. Include it as a Bearer token in the Authorization header or rely on the HttpOnly session cookie set after login.").split("Bearer")[1]?.trimStart() || ""}
          </p>
          <p>
            {t("help.apiAuthBodyTwo", "API keys with the iti_ prefix are accepted as Bearer tokens for programmatic access.").split("iti_")[0]}{" "}
            <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface font-mono text-xs">
              iti_
            </code>
            {t("help.apiAuthBodyTwo", "API keys with the iti_ prefix are accepted as Bearer tokens for programmatic access.").split("iti_")[1] || ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActiveTag(null)}
          className={cn(
            "nav-pill-item",
            !activeTag ? "nav-pill-item-active" : "nav-pill-item-inactive",
          )}
        >
          {t("help.all", "All")}
        </button>
        {groups.map((g) => (
          <button
            key={g.tag}
            onClick={() => setActiveTag(activeTag === g.tag ? null : g.tag)}
            className={cn(
              "nav-pill-item",
              activeTag === g.tag
                ? "nav-pill-item-active"
                : "nav-pill-item-inactive",
            )}
          >
            {getGroupLabel(g.tag, t)}
          </button>
        ))}
      </div>

      {filtered.map((group) => (
        <div key={group.tag} className="surface-section">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">{getGroupLabel(group.tag, t)}</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                {getGroupDescription(group.tag, t) || group.description}
              </p>
            </div>
            <span className="badge badge-neutral">
              {group.endpoints.length}
            </span>
          </div>
          <div className="divide-y divide-surface-container">
            {group.endpoints.map((ep) => {
              const key = `${ep.method}-${ep.path}`;
              const isExpanded = expandedEndpoint === key;
              const authMeta = authLabels[ep.auth];

              return (
                <div key={key}>
                  <button
                    onClick={() =>
                      setExpandedEndpoint(isExpanded ? null : key)
                    }
                    className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface-container-low transition-colors text-left"
                  >
                    <span
                      className={cn(
                        "badge min-w-[4rem] text-center",
                        METHOD_STYLE[ep.method],
                      )}
                    >
                      {ep.method}
                    </span>
                    <code className="text-sm font-mono font-medium text-on-surface flex-1">
                      {ep.path}
                    </code>
                    <div className="flex items-center gap-2">
                      <authMeta.icon className="w-3.5 h-3.5 text-on-surface-variant" />
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider hidden sm:inline">
                        {authMeta.label}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-5 space-y-3 bg-surface-container-low/50">
                      <p className="text-sm text-on-surface-variant">
                        {getEndpointSummary(ep, language)}
                      </p>

                      {ep.params && (
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            {t("help.parameters", "Parameters")}
                          </span>
                          <code className="block mt-1 text-xs font-mono text-on-surface bg-surface-container-high px-3 py-2 rounded-sm">
                            {ep.params}
                          </code>
                        </div>
                      )}

                      {ep.body && (
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            {t("help.requestBody", "Request Body")}
                          </span>
                          <pre className="mt-1 text-xs font-mono text-on-surface bg-surface-container-high px-3 py-2 rounded-sm overflow-x-auto">
                            {ep.body}
                          </pre>
                        </div>
                      )}

                      {ep.response && (
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            {t("help.response200", "Response (200)")}
                          </span>
                          <pre className="mt-1 text-xs font-mono text-on-surface bg-surface-container-high px-3 py-2 rounded-sm overflow-x-auto">
                            {ep.response}
                          </pre>
                        </div>
                      )}

                      <CurlBlock method={ep.method} path={ep.path} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
