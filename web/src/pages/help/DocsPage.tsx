import { useState } from "react";
import { BookOpen, Terminal, Rss, Radar, Eye, LayoutDashboard, Shield, Play } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../../context/LanguageContext";

interface DocSection {
  id: string;
  label: string;
  icon: typeof BookOpen;
  content: DocArticle[];
}

interface DocArticle {
  title: string;
  body: string;
}

const sections: DocSection[] = [
  {
    id: "quick-start",
    label: "Quick Start",
    icon: Play,
    content: [
      {
        title: "What is VANTAGE",
        body: "VANTAGE is an external threat intelligence and digital risk platform designed for small-to-mid security teams. It aggregates data from 9+ intelligence sources (VirusTotal, Shodan, AbuseIPDB, AlienVault OTX, GreyNoise, UrlScan.io, Abuse.ch, Pulsedive, and more) into a single analyst environment for IOC analysis, reconnaissance, feed monitoring, and operational coordination.",
      },
      {
        title: "First Login & Guided Tour",
        body: "After your first login, VANTAGE launches an interactive guided tour that walks you through every major feature: the search bar, report language selector, sidebar navigation, and each module. You can restart the tour at any time from this documentation page or from your profile settings.",
      },
      {
        title: "Setting Up Intelligence API Keys",
        body: "Navigate to Profile > Third-Party API Keys to configure your credentials for each intelligence provider. VANTAGE will only query services for which you have configured valid keys. The Analysis Status indicator on the Home page shows which services are currently available.",
      },
      {
        title: "Your First Analysis",
        body: "Enter any IP address, domain, or file hash into the search bar on the Home page and click Execute. VANTAGE queries all configured intelligence sources in parallel and returns a consolidated verdict with detailed findings from each provider. Results can be exported as PDF reports in Portuguese, English, or Spanish.",
      },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: Terminal,
    content: [
      {
        title: "Individual Search (IP, Domain, Hash)",
        body: "The query engine on the Home page accepts IPv4/IPv6 addresses, domain names, and MD5/SHA1/SHA256 file hashes. Type or paste the indicator and press Execute. VANTAGE automatically detects the indicator type and routes it to the appropriate intelligence sources.",
      },
      {
        title: "Integrated Services",
        body: "Each configured service returns specific data: VirusTotal provides multi-engine scan results and community votes. Shodan reveals open ports, services, and banners. AbuseIPDB shows abuse confidence scores and report history. OTX delivers pulse-based threat correlation. GreyNoise classifies noise vs. targeted activity. UrlScan.io captures page screenshots and DOM analysis. Abuse.ch checks against known malware/botnet databases. Pulsedive provides risk scoring and enrichment.",
      },
      {
        title: "Understanding the Verdict Panel",
        body: "The verdict panel aggregates findings into a risk classification: SAFE (no indicators of compromise), SUSPICIOUS (some flags but inconclusive), HIGH RISK (multiple sources confirm malicious activity), or CRITICAL (active, confirmed threat requiring immediate action). The panel also shows a confidence score based on source agreement.",
      },
      {
        title: "PDF Reports",
        body: "After an analysis completes, use the Export button to generate a detailed PDF report. Reports are available in Portuguese (PT-BR), English (EN), and Spanish (ES). The report includes all source findings, the verdict rationale, and recommended actions.",
      },
      {
        title: "Batch Analysis",
        body: "For bulk analysis, navigate to the Batch section from the Home page. Upload a CSV or TXT file with one indicator per line, or paste indicators directly. VANTAGE processes them in parallel with a daily quota system. Track progress via the live SSE stream and download results when complete.",
      },
    ],
  },
  {
    id: "feed",
    label: "Threat Feed",
    icon: Rss,
    content: [
      {
        title: "Navigating the Feed",
        body: "The Feed page displays threat intelligence articles ingested from configured sources. Articles are shown in a 2-column editorial grid with a featured item section highlighting the most critical or recent high-severity entry. Each card shows the source name, TLP classification, severity badge, publication date, and a summary.",
      },
      {
        title: "Filters: Source, TLP, Sector, Severity",
        body: "Use the filter bar to narrow results by severity level (Critical, High, Medium, Low, Info), source type (RSS, MISP), TLP classification (White, Green, Amber, Red), or sector tags (Finance, Healthcare, Government, etc.). Filters are combinable and reset pagination to page 1.",
      },
      {
        title: "Built-in vs. Custom Sources",
        body: "VANTAGE ships with built-in feeds from NVD (CVE database) and FortiGuard (outbreak alerts and threat signals). Administrators can add custom RSS feeds through Settings > Threat Ingestion & SMTP, specifying a name, URL, family, polling interval, and default TLP classification.",
      },
      {
        title: "MISP Integration",
        body: "For organizations running MISP, VANTAGE can ingest events directly. Configure the MISP server URL and API key in Settings > Threat Ingestion & SMTP. Events are normalized into the standard feed format with automatic TLP extraction from MISP tags and sector inference from event content.",
      },
    ],
  },
  {
    id: "recon",
    label: "Recon Engine",
    icon: Radar,
    content: [
      {
        title: "Available Modules",
        body: "The Recon Engine offers multiple reconnaissance modules: DNS (A, AAAA, MX, NS, TXT, CNAME records), WHOIS (registrant, registrar, dates), SSL/TLS (certificate chain, expiration, SANs), Port Scanning (top ports, services, banners), Subdomain Enumeration (passive discovery), Passive DNS (historical resolution data), Web Analysis (headers, technologies, screenshots), and Traceroute (network path analysis).",
      },
      {
        title: "Starting a Scan",
        body: "Enter a target domain or IP on the Recon page, select the modules you want to run, and click Start Scan. VANTAGE validates the target against security policies (no internal IPs, no command injection patterns) before launching the scan. Each module runs independently and streams results as they complete.",
      },
      {
        title: "Live Results (SSE Streaming)",
        body: "Scan results stream in real-time via Server-Sent Events. As each module completes, its findings appear immediately in the results panel without requiring a page refresh. The progress indicator shows which modules are still running.",
      },
      {
        title: "History & Scheduled Scans",
        body: "View historical scans for any target from the Recon History section. You can also create scheduled scans that run at defined intervals, useful for ongoing monitoring of critical infrastructure. Administrators can view all jobs across analysts from the Admin Jobs view.",
      },
    ],
  },
  {
    id: "watchlist",
    label: "Watchlist",
    icon: Eye,
    content: [
      {
        title: "Adding Assets for Monitoring",
        body: "The Watchlist lets you register indicators (IPs, domains, hashes) for ongoing monitoring. When an indicator is added, VANTAGE periodically re-analyzes it across all configured intelligence sources and tracks changes in risk status over time.",
      },
      {
        title: "Automatic Re-scan",
        body: "A background worker runs daily re-scans on all watchlist items. If an indicator's verdict changes (e.g., from SAFE to SUSPICIOUS), the change is recorded and available in the item's history timeline.",
      },
      {
        title: "Email Notifications",
        body: "When SMTP is configured (Settings > Threat Ingestion & SMTP), VANTAGE can send email alerts when a watchlist item's risk status changes. Notifications include the old and new verdicts, the triggering source, and a direct link to the analysis.",
      },
      {
        title: "Managing Items",
        body: "Edit watchlist items to update notes or priority. Remove items you no longer need to track. The SMTP Status indicator shows whether email notifications are currently operational.",
      },
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    content: [
      {
        title: "Metrics & Time Windows",
        body: "The Dashboard provides an operational overview with three time windows: Day, Week, and Month. Key metrics include total scans, threats detected, and active recon modules. The 7-day trend chart visualizes scan volume and malicious findings over time.",
      },
      {
        title: "Case Verdict Distribution",
        body: "The donut chart shows the breakdown of analysis verdicts (Safe, Suspicious, High Risk, Critical) across all scans in the selected time window. Use this to gauge the overall threat posture of analyzed indicators.",
      },
      {
        title: "Top Threat Typologies & Artifacts",
        body: "The typologies section ranks the most common threat categories by event count. The dangerous artifacts table lists the most frequently analyzed high-risk indicators with their type, search count, and current risk status.",
      },
    ],
  },
  {
    id: "account",
    label: "Account & Security",
    icon: Shield,
    content: [
      {
        title: "Changing Your Password",
        body: "Navigate to Profile to change your password. The platform enforces configurable password policies (minimum length, complexity, history). If your administrator has set a password expiration policy, you'll see a warning banner when your password is nearing expiration.",
      },
      {
        title: "MFA (TOTP)",
        body: "Multi-factor authentication adds a second layer of security using time-based one-time passwords (TOTP). Enroll from Profile > MFA section using any authenticator app (Google Authenticator, Authy, etc.). During enrollment, save your 8 backup codes in a secure location — each code can only be used once.",
      },
      {
        title: "Managing Active Sessions",
        body: "View all your active sessions from Profile > Sessions. Each entry shows the device, IP address, and last activity time. You can revoke individual sessions or terminate all other sessions at once.",
      },
      {
        title: "Personal API Keys",
        body: "Create API keys from Profile > API Keys for programmatic access to the VANTAGE API. Keys use a secure prefix format (iti_xxx) and only the SHA-256 hash is stored on the server. Copy the full key immediately after creation — it cannot be retrieved later.",
      },
      {
        title: "Personal Audit Log",
        body: "Your personal audit log shows all actions performed under your account: logins, analysis requests, password changes, MFA events, and more. Use it to verify your activity or detect unauthorized access.",
      },
    ],
  },
];

export default function DocsPage() {
  const { t, language } = useLanguage();
  const [activeSection, setActiveSection] = useState("quick-start");
  const sectionLabels: Record<string, string> = {
    "quick-start": t("help.docsSectionQuickStart", "Quick Start"),
    analysis: t("help.docsSectionAnalysis", "Analysis"),
    feed: t("help.docsSectionFeed", "Threat Feed"),
    recon: t("help.docsSectionRecon", "Recon Engine"),
    watchlist: t("help.docsSectionWatchlist", "Watchlist"),
    dashboard: t("help.docsSectionDashboard", "Dashboard"),
    account: t("help.docsSectionAccount", "Account & Security"),
  };
  const localizedArticleOverrides: Record<string, Partial<Record<string, DocArticle[]>>> = {
    pt: {
      "quick-start": [
        {
          title: "O que é o VANTAGE",
          body: "VANTAGE é uma plataforma de threat intelligence externa e risco digital pensada para equipes de segurança pequenas e médias. Ela agrega dados de mais de 9 fontes de inteligência, como VirusTotal, Shodan, AbuseIPDB, AlienVault OTX, GreyNoise, UrlScan.io, Abuse.ch e Pulsedive, em um único ambiente operacional para análise de IOCs, reconhecimento, monitoramento de feed e acompanhamento de exposição.",
        },
        {
          title: "Primeiro login e tour guiado",
          body: "Após o primeiro login, o VANTAGE inicia um tour guiado interativo que apresenta os principais recursos da plataforma: a busca principal, o seletor de idioma do relatório, a navegação lateral e cada módulo. Você pode reiniciar esse tour a qualquer momento nesta página de documentação ou nas configurações do seu perfil.",
        },
        {
          title: "Configurando chaves de API de inteligência",
          body: "Acesse Perfil > Chaves de API de terceiros para configurar suas credenciais por provedor de inteligência. O VANTAGE só consulta serviços para os quais você tenha chaves válidas configuradas. O indicador de status de análise na Home mostra quais serviços estão disponíveis naquele momento.",
        },
        {
          title: "Sua primeira análise",
          body: "Digite qualquer endereço IP, domínio ou hash de arquivo na barra de busca da Home e clique em Executar. O VANTAGE consulta em paralelo todas as fontes configuradas e retorna um veredito consolidado com achados detalhados por provedor. Os resultados podem ser exportados em PDF em português, inglês ou espanhol.",
        },
      ],
      analysis: [
        {
          title: "Busca individual (IP, domínio, hash)",
          body: "O mecanismo de consulta da Home aceita endereços IPv4 e IPv6, nomes de domínio e hashes MD5, SHA1 e SHA256. Digite ou cole o indicador e pressione Executar. O VANTAGE detecta automaticamente o tipo do indicador e o encaminha para as fontes de inteligência apropriadas.",
        },
        {
          title: "Serviços integrados",
          body: "Cada serviço configurado retorna um conjunto específico de dados: VirusTotal entrega resultados multi-engine e votos da comunidade. Shodan revela portas, serviços e banners. AbuseIPDB mostra score de abuso e histórico de reports. OTX entrega correlação por pulses. GreyNoise diferencia ruído de atividade direcionada. UrlScan.io captura screenshot e análise de DOM. Abuse.ch verifica bases conhecidas de malware e botnets. Pulsedive adiciona score de risco e enrichment.",
        },
        {
          title: "Entendendo o painel de veredito",
          body: "O painel de veredito agrega os achados em uma classificação de risco: SAFE, SUSPICIOUS, HIGH RISK ou CRITICAL. Além da classificação, ele mostra uma pontuação de confiança baseada no grau de concordância entre as fontes consultadas.",
        },
        {
          title: "Relatórios em PDF",
          body: "Depois que uma análise termina, use o botão Export para gerar um PDF detalhado. Os relatórios estão disponíveis em português, inglês e espanhol e incluem achados por fonte, racional do veredito e ações recomendadas.",
        },
        {
          title: "Análise em lote",
          body: "Para análises em massa, acesse Batch a partir da Home. Você pode enviar um CSV ou TXT com um indicador por linha, ou colar a lista diretamente. O VANTAGE processa tudo em paralelo com sistema de cota diária, stream ao vivo via SSE e exportação dos resultados ao final.",
        },
      ],
      feed: [
        {
          title: "Navegando pelo feed",
          body: "A página Feed exibe artigos de inteligência ingeridos a partir das fontes configuradas. Os itens aparecem em uma grade editorial de duas colunas, com destaque para a entrada mais crítica ou recente. Cada card mostra nome da fonte, classificação TLP, severidade, data de publicação e resumo.",
        },
        {
          title: "Filtros: fonte, TLP, setor e severidade",
          body: "Use a barra de filtros para refinar os resultados por severidade, tipo de fonte, classificação TLP ou setor. Os filtros podem ser combinados e a paginação volta para a primeira página quando um novo conjunto é aplicado.",
        },
        {
          title: "Fontes nativas e fontes customizadas",
          body: "O VANTAGE já vem com feeds nativos como NVD e FortiGuard. Administradores também podem adicionar feeds RSS customizados em Settings > Threat Ingestion & SMTP, definindo nome, URL, família, intervalo de coleta e TLP padrão.",
        },
        {
          title: "Integração com MISP",
          body: "Organizações que usam MISP podem ingerir eventos diretamente. Configure a URL e a chave de API em Settings > Threat Ingestion & SMTP. Os eventos são normalizados para o formato padrão do feed, com extração automática de TLP e inferência de setor a partir do conteúdo.",
        },
      ],
      recon: [
        {
          title: "Módulos disponíveis",
          body: "O Recon Engine oferece módulos como DNS, WHOIS, SSL/TLS, port scanning, enumeração de subdomínios, passive DNS, web analysis e traceroute. Cada módulo pode ser executado de forma independente conforme o objetivo da investigação.",
        },
        {
          title: "Iniciando um scan",
          body: "Informe um domínio ou IP na página Recon, selecione os módulos desejados e clique em Start Scan. O VANTAGE valida o alvo contra as políticas de segurança antes de iniciar a varredura, bloqueando casos como IPs internos ou padrões de command injection.",
        },
        {
          title: "Resultados em tempo real",
          body: "Os resultados chegam em tempo real por Server-Sent Events. À medida que cada módulo termina, seus achados aparecem no painel sem precisar recarregar a página. O indicador de progresso mostra quais módulos ainda estão em execução.",
        },
        {
          title: "Histórico e scans agendados",
          body: "Você pode consultar o histórico de scans por alvo e também criar execuções recorrentes em intervalos definidos. Isso é útil para monitoramento contínuo de infraestrutura crítica. Administradores ainda conseguem ver todos os jobs a partir da visão administrativa.",
        },
      ],
      watchlist: [
        {
          title: "Adicionando ativos para monitoramento",
          body: "A Watchlist permite registrar indicadores como IPs, domínios e hashes para acompanhamento contínuo. Depois de adicionados, o VANTAGE reanalisa periodicamente esses itens nas fontes configuradas e acompanha as mudanças de risco ao longo do tempo.",
        },
        {
          title: "Reanálise automática",
          body: "Um worker em segundo plano executa re-scans diários em todos os itens da Watchlist. Quando o veredito de um indicador muda, essa alteração é registrada e fica disponível no histórico do item.",
        },
        {
          title: "Notificações por email",
          body: "Quando o SMTP está configurado, o VANTAGE pode enviar alertas por email sempre que o status de risco de um item monitorado mudar. As notificações incluem o veredito anterior, o novo veredito, a fonte que disparou o alerta e um link direto para a análise.",
        },
        {
          title: "Gestão dos itens",
          body: "Você pode editar itens da Watchlist para ajustar notas e prioridade, além de remover o que não precisa mais acompanhar. O indicador de status do SMTP mostra se o envio de notificações está operacional.",
        },
      ],
      dashboard: [
        {
          title: "Métricas e janelas de tempo",
          body: "O Dashboard oferece uma visão operacional com três janelas: Day, Week e Month. Entre as principais métricas estão total de scans, ameaças detectadas e módulos de recon ativos. O gráfico de tendência ajuda a visualizar volume e achados maliciosos ao longo do tempo.",
        },
        {
          title: "Distribuição de veredictos",
          body: "O gráfico de distribuição mostra a quebra dos veredictos de análise entre Safe, Suspicious, High Risk e Critical dentro da janela selecionada. Ele ajuda a medir rapidamente a postura geral dos indicadores analisados.",
        },
        {
          title: "Tipologias e artefatos mais perigosos",
          body: "A seção de tipologias ranqueia as categorias de ameaça mais frequentes. Já a tabela de artefatos perigosos lista os indicadores de alto risco mais recorrentes, com tipo, número de buscas e status atual.",
        },
      ],
      account: [
        {
          title: "Alterando sua senha",
          body: "Acesse Perfil para alterar sua senha. A plataforma aplica políticas configuráveis de senha, incluindo comprimento mínimo, complexidade e histórico. Se o administrador tiver definido uma política de expiração, você verá um aviso quando sua senha estiver próxima do vencimento.",
        },
        {
          title: "MFA (TOTP)",
          body: "A autenticação multifator adiciona uma segunda camada de segurança com códigos temporários baseados em tempo. Faça a ativação em Perfil > MFA usando qualquer aplicativo autenticador, como Google Authenticator ou Authy. Durante o cadastro, salve seus 8 códigos de recuperação em um local seguro, pois cada um só pode ser usado uma vez.",
        },
        {
          title: "Gerenciando sessões ativas",
          body: "Veja todas as suas sessões ativas em Perfil > Sessões. Cada entrada mostra o dispositivo, o endereço IP e o horário da última atividade. Você pode revogar sessões específicas ou encerrar todas as outras sessões de uma vez.",
        },
        {
          title: "Chaves de API pessoais",
          body: "Crie chaves de API em Perfil > API Keys para acesso programático à API do VANTAGE. As chaves usam o prefixo seguro iti_xxx e apenas o hash SHA-256 é armazenado no servidor. Copie a chave completa logo após a criação, pois ela não pode ser recuperada depois.",
        },
        {
          title: "Audit log pessoal",
          body: "Seu audit log pessoal mostra todas as ações executadas com a sua conta, como logins, requisições de análise, mudanças de senha, eventos de MFA e mais. Use esse histórico para verificar sua atividade ou detectar acessos indevidos.",
        },
      ],
    },
    es: {
      "quick-start": [
        {
          title: "Qué es VANTAGE",
          body: "VANTAGE es una plataforma de threat intelligence externa y riesgo digital diseñada para equipos de seguridad pequeños y medianos. Reúne datos de más de 9 fuentes de inteligencia, como VirusTotal, Shodan, AbuseIPDB, AlienVault OTX, GreyNoise, UrlScan.io, Abuse.ch y Pulsedive, en un único entorno operativo para análisis de IOCs, reconocimiento, monitoreo del feed y seguimiento de exposición.",
        },
        {
          title: "Primer inicio de sesión y guía guiada",
          body: "Después del primer inicio de sesión, VANTAGE lanza una guía interactiva que presenta las funciones principales de la plataforma: la búsqueda principal, el selector de idioma del informe, la navegación lateral y cada módulo. Puedes reiniciar esta guía en cualquier momento desde esta página de documentación o desde la configuración del perfil.",
        },
        {
          title: "Configuración de claves API de inteligencia",
          body: "Ve a Perfil > Claves API de terceros para configurar tus credenciales por proveedor de inteligencia. VANTAGE solo consulta los servicios para los que tengas claves válidas. El indicador de estado del análisis en Home muestra qué servicios están disponibles en ese momento.",
        },
        {
          title: "Tu primer análisis",
          body: "Introduce cualquier dirección IP, dominio o hash de archivo en la barra de búsqueda de Home y haz clic en Ejecutar. VANTAGE consulta en paralelo todas las fuentes configuradas y devuelve un veredicto consolidado con hallazgos detallados por proveedor. Los resultados pueden exportarse en PDF en portugués, inglés o español.",
        },
      ],
      analysis: [
        {
          title: "Búsqueda individual (IP, dominio, hash)",
          body: "El motor de consulta de Home acepta direcciones IPv4 e IPv6, nombres de dominio y hashes MD5, SHA1 y SHA256. Escribe o pega el indicador y pulsa Ejecutar. VANTAGE detecta automáticamente el tipo de indicador y lo envía a las fuentes de inteligencia adecuadas.",
        },
        {
          title: "Servicios integrados",
          body: "Cada servicio configurado devuelve un tipo específico de dato: VirusTotal entrega resultados multi-engine y votos de la comunidad. Shodan revela puertos, servicios y banners. AbuseIPDB muestra score de abuso e historial de reportes. OTX aporta correlación por pulses. GreyNoise diferencia ruido de actividad dirigida. UrlScan.io agrega screenshot y análisis de DOM. Abuse.ch consulta bases conocidas de malware y botnets. Pulsedive suma score de riesgo y enrichment.",
        },
        {
          title: "Entender el panel de veredicto",
          body: "El panel de veredicto agrega los hallazgos en una clasificación de riesgo: SAFE, SUSPICIOUS, HIGH RISK o CRITICAL. Además del veredicto, muestra una puntuación de confianza basada en el grado de acuerdo entre las fuentes consultadas.",
        },
        {
          title: "Informes PDF",
          body: "Cuando finaliza un análisis, usa el botón Export para generar un PDF detallado. Los informes están disponibles en portugués, inglés y español e incluyen hallazgos por fuente, racional del veredicto y acciones recomendadas.",
        },
        {
          title: "Análisis por lote",
          body: "Para análisis masivos, entra en Batch desde Home. Puedes subir un CSV o TXT con un indicador por línea, o pegar la lista directamente. VANTAGE procesa todo en paralelo con cuota diaria, stream en vivo vía SSE y exportación al final.",
        },
      ],
      feed: [
        {
          title: "Navegar por el feed",
          body: "La página Feed muestra artículos de inteligencia ingeridos desde las fuentes configuradas. Los elementos aparecen en una cuadrícula editorial de dos columnas, con destaque para la entrada más crítica o más reciente. Cada tarjeta muestra nombre de la fuente, clasificación TLP, severidad, fecha de publicación y resumen.",
        },
        {
          title: "Filtros: fuente, TLP, sector y severidad",
          body: "Usa la barra de filtros para limitar los resultados por severidad, tipo de fuente, clasificación TLP o sector. Los filtros pueden combinarse y la paginación vuelve a la primera página cuando aplicas un nuevo conjunto.",
        },
        {
          title: "Fuentes nativas y fuentes personalizadas",
          body: "VANTAGE ya incluye feeds nativos como NVD y FortiGuard. Los administradores también pueden añadir feeds RSS personalizados en Settings > Threat Ingestion & SMTP, definiendo nombre, URL, familia, intervalo de recolección y TLP por defecto.",
        },
        {
          title: "Integración con MISP",
          body: "Las organizaciones que usan MISP pueden ingerir eventos directamente. Configura la URL y la clave API en Settings > Threat Ingestion & SMTP. Los eventos se normalizan al formato estándar del feed, con extracción automática de TLP e inferencia de sector a partir del contenido.",
        },
      ],
      recon: [
        {
          title: "Módulos disponibles",
          body: "El Recon Engine ofrece módulos como DNS, WHOIS, SSL/TLS, port scanning, enumeración de subdominios, passive DNS, web analysis y traceroute. Cada módulo puede ejecutarse de forma independiente según el objetivo de la investigación.",
        },
        {
          title: "Iniciar un escaneo",
          body: "Introduce un dominio o IP en la página Recon, selecciona los módulos deseados y haz clic en Start Scan. VANTAGE valida el objetivo contra las políticas de seguridad antes de iniciar el proceso, bloqueando casos como IPs internas o patrones de command injection.",
        },
        {
          title: "Resultados en tiempo real",
          body: "Los resultados llegan en tiempo real mediante Server-Sent Events. A medida que cada módulo termina, sus hallazgos aparecen en el panel sin necesidad de recargar la página. El indicador de progreso muestra qué módulos siguen ejecutándose.",
        },
        {
          title: "Historial y escaneos programados",
          body: "Puedes consultar el historial de escaneos por objetivo y también crear ejecuciones recurrentes en intervalos definidos. Esto es útil para la monitorización continua de infraestructura crítica. Los administradores además pueden ver todos los jobs desde la vista administrativa.",
        },
      ],
      watchlist: [
        {
          title: "Añadir activos para monitorización",
          body: "Watchlist permite registrar indicadores como IPs, dominios y hashes para seguimiento continuo. Una vez añadidos, VANTAGE los reanaliza de forma periódica en las fuentes configuradas y registra los cambios de riesgo con el tiempo.",
        },
        {
          title: "Reanálisis automático",
          body: "Un worker en segundo plano ejecuta reescaneos diarios sobre todos los elementos de la Watchlist. Cuando cambia el veredicto de un indicador, ese cambio queda registrado y disponible en el historial del elemento.",
        },
        {
          title: "Notificaciones por correo",
          body: "Cuando SMTP está configurado, VANTAGE puede enviar alertas por correo cada vez que cambie el nivel de riesgo de un activo monitorizado. Las notificaciones incluyen el veredicto anterior, el nuevo, la fuente que disparó el cambio y un enlace directo al análisis.",
        },
        {
          title: "Gestión de elementos",
          body: "Puedes editar los elementos de la Watchlist para ajustar notas y prioridad, además de eliminar los que ya no deban seguirse. El indicador de estado de SMTP muestra si el envío de notificaciones está operativo.",
        },
      ],
      dashboard: [
        {
          title: "Métricas y ventanas de tiempo",
          body: "El Dashboard ofrece una visión operativa con tres ventanas: Day, Week y Month. Entre las métricas clave están el total de escaneos, las amenazas detectadas y los módulos de recon activos. El gráfico de tendencia ayuda a visualizar volumen y hallazgos maliciosos a lo largo del tiempo.",
        },
        {
          title: "Distribución de veredictos",
          body: "El gráfico de distribución muestra el reparto de veredictos entre Safe, Suspicious, High Risk y Critical dentro de la ventana seleccionada. Ayuda a medir rápidamente la postura general de los indicadores analizados.",
        },
        {
          title: "Tipologías y artefactos más peligrosos",
          body: "La sección de tipologías clasifica las categorías de amenaza más frecuentes. La tabla de artefactos peligrosos lista los indicadores de alto riesgo más recurrentes, con tipo, número de búsquedas y estado actual.",
        },
      ],
      account: [
        {
          title: "Cambiar tu contraseña",
          body: "Ve a Perfil para cambiar tu contraseña. La plataforma aplica políticas configurables de contraseña, como longitud mínima, complejidad e historial. Si el administrador definió una política de expiración, verás una advertencia cuando tu contraseña esté próxima a vencer.",
        },
        {
          title: "MFA (TOTP)",
          body: "La autenticación multifactor añade una segunda capa de seguridad con códigos temporales basados en tiempo. Actívala en Perfil > MFA usando cualquier aplicación autenticadora, como Google Authenticator o Authy. Durante el proceso, guarda tus 8 códigos de respaldo en un lugar seguro, ya que cada uno solo puede usarse una vez.",
        },
        {
          title: "Gestionar sesiones activas",
          body: "Consulta todas tus sesiones activas en Perfil > Sesiones. Cada entrada muestra el dispositivo, la dirección IP y la hora de la última actividad. Puedes revocar sesiones individuales o cerrar todas las demás de una sola vez.",
        },
        {
          title: "Claves API personales",
          body: "Crea claves API en Perfil > API Keys para acceso programático a la API de VANTAGE. Las claves usan el prefijo seguro iti_xxx y solo el hash SHA-256 se guarda en el servidor. Copia la clave completa justo después de crearla, porque no podrá recuperarse más tarde.",
        },
        {
          title: "Registro de auditoría personal",
          body: "Tu registro de auditoría personal muestra todas las acciones ejecutadas con tu cuenta, como inicios de sesión, solicitudes de análisis, cambios de contraseña, eventos de MFA y más. Úsalo para verificar tu actividad o detectar accesos no autorizados.",
        },
      ],
    },
  };

  function restartGuidedTour() {
    setActiveSection("quick-start");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const current = sections.find((s) => s.id === activeSection) || sections[0];
  const currentArticles = localizedArticleOverrides[language]?.[current.id] || current.content;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start mt-6">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="surface-section">
          <div className="surface-section-header">
            <h3 className="surface-section-title">{t("help.sections", "Sections")}</h3>
          </div>
          <nav className="p-2">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-sm transition-colors text-left",
                    activeSection === section.id
                      ? "bg-primary/10 text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {sectionLabels[section.id] || section.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="card p-4 space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {t("help.quickActions", "Quick Actions")}
          </h4>
          <button className="btn btn-outline w-full text-left justify-start" onClick={restartGuidedTour}>
            <Play className="w-3.5 h-3.5" />
            {t("help.restartGuidedTour", "Restart guided tour")}
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <current.icon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-extrabold tracking-tight text-on-surface">
            {sectionLabels[current.id] || current.label}
          </h2>
        </div>

        {currentArticles.map((article, idx) => (
          <article key={idx} className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">{article.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {article.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
