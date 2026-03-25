import {
  Activity,
  ArrowRight,
  Bell,
  CircleAlert,
  Crosshair,
  Eye,
  Home,
  Filter,
  Gauge,
  LayoutPanelTop,
  Menu,
  Radar,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  ShieldCheck,
  TableProperties,
  User,
} from "lucide-react";

const analystRows = [
  {
    target: "acme-login-support.net",
    signal: "Brand abuse cluster",
    confidence: "High",
    updated: "7m ago",
  },
  {
    target: "185.199.22.14",
    signal: "Infrastructure overlap",
    confidence: "Medium",
    updated: "12m ago",
  },
  {
    target: "f4e14a2...9b2c",
    signal: "Hash enrichment pending",
    confidence: "Low",
    updated: "19m ago",
  },
];

const adminRows = [
  {
    item: "Surface Monitor",
    owner: "Exposure Module",
    status: "Active",
    version: "2.4.1",
  },
  {
    item: "MISP Events",
    owner: "Threat Ingestion",
    status: "Review",
    version: "1.9.0",
  },
  {
    item: "Password Policy",
    owner: "Governance",
    status: "Stable",
    version: "v1",
  },
];

const observabilityRows = [
  {
    service: "worker-runtime",
    state: "Healthy",
    latency: "132 ms",
    last: "2m ago",
  },
  {
    service: "smtp-gateway",
    state: "Degraded",
    latency: "412 ms",
    last: "4m ago",
  },
  {
    service: "feed-sync",
    state: "Healthy",
    latency: "208 ms",
    last: "1m ago",
  },
];

export default function OperationalPatterns() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-sm bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Interface Canon
        </div>
        <div className="flex flex-col gap-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
              Operational Interface Canon
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              Esta página define a gramática visual obrigatória para superfícies de
              analista, administração e observabilidade. Ela substitui breadcrumbs
              fictícios, reduz deriva tipográfica e vira a régua de criação das
              próximas páginas.
            </p>
          </div>
          <div className="page-toolbar">
            <div className="page-toolbar-copy">
              Action hierarchy outranks literal placement
            </div>
            <div className="page-toolbar-actions">
            <button className="btn btn-outline flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Review Existing Pages
            </button>
            <button className="btn btn-primary flex items-center gap-2">
              <LayoutPanelTop className="w-4 h-4" />
              Adopt This Pattern
            </button>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <CanonRule
          icon={LayoutPanelTop}
          title="Canonical Header"
          text="Todas as páginas operacionais usam `text-2xl font-extrabold tracking-tight`, subtítulo curto e ações à direita."
        />
        <CanonRule
          icon={ShieldCheck}
          title="No Fake Breadcrumbs"
          text="Textos como `Admin / Services / ...` saem do padrão. Só entra contexto real, e de forma editorial, não simulando navegação."
        />
        <CanonRule
          icon={TableProperties}
          title="Reusable Structures"
          text="Tabela, toolbar, formulário, badges, paginação, row actions e empty states passam a seguir blocos replicáveis entre páginas."
        />
        <CanonRule
          icon={ArrowRight}
          title="Structural Side Rails"
          text="Quando houver navegação contextual persistente, ela ganha uma rail estrutural própria à esquerda. A rail direita continua reservada para métricas, detalhes e informação complementar."
        />
      </section>

      <section className="space-y-5">
        <SectionTitle
          label="Immutable Shell"
          title="Sidebar & Topbar Are Not Reimagined Per Page"
          description="Sidebar, topbar, main canvas and structural spacing are fixed parts of the product. Pages may vary in content, not in frame."
        />
        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] min-h-[18rem]">
            <aside className="bg-inverse-surface px-4 py-5 text-white">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-outline">
                Canonical Rail
              </div>
              <div className="mt-5 space-y-2">
                <ShellNavItem icon={Home} label="Home" />
                <ShellNavItem icon={Rss} label="Feed" />
                <ShellNavItem icon={Radar} label="Recon" active />
                <ShellNavItem icon={Eye} label="Watchlist" />
                <ShellNavItem icon={Settings2} label="Settings" />
              </div>
            </aside>
            <div className="bg-background">
              <div className="flex items-center justify-between border-b border-outline-variant/15 bg-surface-container-high px-6 py-3">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">
                  <Menu className="w-4 h-4" />
                  <span>Analyst</span>
                </div>
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-on-surface-variant" />
                  <User className="w-4 h-4 text-on-surface-variant" />
                </div>
              </div>
              <div className="px-6 py-6">
                <div className="rounded-sm bg-surface-container-low p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                    Immutable shell rule
                  </div>
                  <p className="mt-3 max-w-2xl text-sm text-on-surface-variant">
                    A nova página herda a mesma rail, o mesmo topbar, o mesmo
                    container e o mesmo espaçamento-base. O design varia nos
                    módulos internos, não no frame do produto.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionTitle
          label="User Interface"
          title="Analyst Workbench Pattern"
          description="Para Recon, Watchlist, Hunting e Exposure, com foco em investigação, leitura contínua e qualificação de sinais."
        />
        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6">
          <article className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  Canonical Header
                </div>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface">
                  Hunting
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Search, qualify and escalate identities, domains and digital
                  traces without losing analyst rhythm.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-outline flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filters
                </button>
                <button className="btn btn-primary flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Execute
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                <div className="bg-surface-container-low rounded-sm px-4 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                    Toolbar pattern
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-[16rem] border-b-2 border-outline bg-surface-container-highest px-0 py-2 text-sm text-on-surface">
                      search target, domain or identity
                    </div>
                    <span className="badge badge-neutral">All sources</span>
                    <span className="badge badge-primary">Live mode</span>
                    <span className="badge badge-warning">Watchlist only</span>
                  </div>
                </div>
                <div className="bg-inverse-surface rounded-sm px-4 py-4 text-white">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    Context chip
                  </div>
                  <div className="mt-2 text-sm font-bold">Analyst focus</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-sm border border-outline-variant/15">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-container-high">
                    <tr>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                        Target
                      </th>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                        Signal
                      </th>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant text-right">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-low">
                    {analystRows.map((row) => (
                      <tr key={row.target} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-on-surface">{row.target}</td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">{row.signal}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`badge ${
                              row.confidence === "High"
                                ? "badge-error"
                                : row.confidence === "Medium"
                                  ? "badge-warning"
                                  : "badge-neutral"
                            }`}
                          >
                            {row.confidence}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-[11px] font-mono text-on-surface-variant">
                          {row.updated}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationFooter
                  showing="1-3"
                  total="24"
                  page="1"
                  pages="8"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AccentCard
                  title="Use accent-left when severity is the first cue"
                  text="Brand abuse, phishing, degraded runtime or critical incident cards may use the vertical accent because urgency is the first scanning job."
                  accent="card-accent-error"
                  badge="Severity-led"
                  badgeClass="badge badge-error"
                />
                <AccentCard
                  title="Do not use accent-left for neutral information"
                  text="Generic summaries, support content, explanatory notes and stable metadata cards stay visually clean to avoid noise."
                  accent=""
                  badge="Neutral"
                  badgeClass="badge badge-neutral"
                />
              </div>
            </div>
          </article>

          <aside className="space-y-6">
            <InfoPanel
              icon={Crosshair}
              title="Applies to"
              items={["Recon", "Watchlist", "Hunting", "Exposure"]}
            />
            <InfoPanel
              icon={Bell}
              title="Rules"
              items={[
                "Header sempre alinhado à esquerda com subtítulo curto.",
                "Toolbar com filtros e CTA principal no mesmo eixo.",
                "Tabela ou lista com paginação sempre explícita.",
                "Accent-left só entra quando criticidade ou urgência é o primeiro sinal semântico.",
              ]}
            />
          </aside>
        </div>
      </section>

      <section className="space-y-5">
        <SectionTitle
          label="Administration Interface"
          title="Management Console Pattern"
          description="Para Extensions Catalog, Threat Ingestion, Users & Roles, Security Policies e demais superfícies de gestão."
        />
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
          <article className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  Canonical Header
                </div>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface">
                  Extensions Catalog
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Govern extensions, policies and platform dependencies with
                  explicit ownership and action hierarchy.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-outline">Export</button>
                <button className="btn btn-primary">Primary Action</button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard label="Managed Items" value="24" tone="primary" />
                <MetricCard label="Attention Required" value="04" tone="warning" />
                <MetricCard label="Disabled" value="03" tone="neutral" />
              </div>

              <div className="overflow-hidden rounded-sm border border-outline-variant/15">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-container-high">
                    <tr>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                        Item
                      </th>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                        Owner
                      </th>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                        Status
                      </th>
                      <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant text-right">
                        Version
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-low">
                    {adminRows.map((row) => (
                      <tr key={row.item} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-on-surface">{row.item}</td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">{row.owner}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`badge ${
                              row.status === "Active"
                                ? "badge-primary"
                                : row.status === "Review"
                                  ? "badge-warning"
                                  : "badge-neutral"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-[11px] font-mono text-on-surface-variant">
                          {row.version}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationFooter
                  showing="1-3"
                  total="18"
                  page="1"
                  pages="6"
                />
              </div>
            </div>
          </article>

          <article className="card overflow-hidden">
            <div className="card-header">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                Canonical Form
              </div>
              <h3 className="mt-2 text-lg font-extrabold tracking-tight text-on-surface">
                Policy Editor Pattern
              </h3>
            </div>
            <div className="p-6 space-y-5">
              <FormField
                label="Minimum Password Length"
                help="Numeric field with helper text and bottom-border input style."
                placeholder="12"
              />
              <FormField
                label="Expiry Warning Days"
                help="Compact numeric field grouped under the same policy section."
                placeholder="7"
              />
              <FormField
                label="Operational Description"
                help="Multiline input for policy rationale or admin notes."
                placeholder="Explain the purpose of this governance rule..."
                multiline
              />
              <div className="rounded-sm bg-surface-container-low p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant">
                  Action row pattern
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button className="btn btn-ghost">Discard</button>
                  <button className="btn btn-outline">Test</button>
                  <button className="btn btn-primary">Save Changes</button>
                </div>
              </div>
            </div>
          </article>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InfoPanel
            icon={Settings2}
            title="Admin rail rule"
            items={[
              "Quando uma seção precisa de navegação persistente, ela ganha uma structural left rail separada do canvas principal.",
              "A navegação não deve empurrar a área útil nem comprimir detalhes importantes do item selecionado.",
              "O conteúdo central mantém prioridade de largura; a rail existe para orientação planejada, não para competir com a página.",
            ]}
          />
          <InfoPanel
            icon={TableProperties}
            title="Management card rule"
            items={[
              "Cards de gestão usam fundos mais claros e menos cinza opaco.",
              "Primary/warning/error tint pode entrar com parcimônia para resumir estado.",
              "Accent-left só aparece quando urgência é leitura primária do card.",
            ]}
          />
        </div>
      </section>

      <section className="space-y-5">
        <SectionTitle
          label="Observability Interface"
          title="Runtime & Event Monitoring Pattern"
          description="Para System Health, Dashboard, Notifications operacionais, logs e painéis que tratam status, incidentes e throughput."
        />
        <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
          <article className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  Canonical Header
                </div>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface">
                  System Health
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Surface service state, event severity and runtime observations
                  without inventing breadcrumb context.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-outline flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard label="Global Uptime" value="99.4%" tone="neutral" />
                <MetricCard label="Active Alerts" value="03" tone="neutral" />
                <MetricCard label="Error States" value="01" tone="neutral" />
              </div>

              <div className="rounded-sm bg-inverse-surface px-5 py-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-outline">
                      Event stream
                    </div>
                    <div className="mt-2 text-lg font-extrabold tracking-tight">
                      Runtime Snapshot
                    </div>
                  </div>
                  <Gauge className="w-5 h-5 text-primary" />
                </div>
                <div className="mt-5 flex items-end gap-1 h-24">
                  {[34, 48, 42, 60, 74, 55, 51, 88, 63, 47, 58, 69].map((value, index) => (
                    <div
                      key={index}
                      className={`flex-1 rounded-t-sm ${
                        value > 80 ? "bg-amber-500/70" : "bg-primary/50"
                      }`}
                      style={{ height: `${value}%` }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-on-surface">
                Event Table Canon
              </h3>
              <span className="badge badge-neutral">Observability</span>
            </div>
            <div className="overflow-hidden rounded-sm border-t border-outline-variant/10">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-container-high">
                  <tr>
                    <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                      Service
                    </th>
                    <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                      State
                    </th>
                    <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                      Latency
                    </th>
                    <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant text-right">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low">
                  {observabilityRows.map((row) => (
                    <tr key={row.service} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-on-surface">{row.service}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`badge ${
                            row.state === "Healthy"
                              ? "badge-primary"
                              : row.state === "Degraded"
                                ? "badge-warning"
                                : "badge-error"
                          }`}
                        >
                          {row.state}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">{row.latency}</td>
                      <td className="px-6 py-4 text-right text-[11px] font-mono text-on-surface-variant">
                        {row.last}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationFooter
                showing="1-3"
                total="32"
                page="1"
                pages="11"
              />
            </div>
          </article>
        </div>
        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="border-r border-outline-variant/10 bg-surface-container-lowest">
              <div className="surface-section-header">
                <h3 className="surface-section-title">Main Pane</h3>
                <span className="badge badge-neutral">Fluid</span>
              </div>
              <div className="p-6">
                <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant">
                    Primary surface
                  </div>
                  <p className="mt-3 text-sm text-on-surface-variant">
                    Tables, event streams, forms and result lists keep priority in the
                    main pane.
                  </p>
                </div>
              </div>
            </div>
            <aside className="bg-background p-6">
              <div className="rounded-sm border border-outline-variant/15 bg-surface-container-lowest p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Structural rails
                </div>
                <p className="mt-3 text-sm text-on-surface-variant">
                  Left rail serves contextual navigation and orientation as a
                  dedicated structural lane, separate from the main canvas.
                  Right rail serves metrics, selected-source details, service
                  summaries and secondary runtime context.
                </p>
              </div>
            </aside>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InfoPanel
            icon={Gauge}
            title="Applies to"
            items={["Dashboard", "Notifications", "System Health", "Threat Ingestion side context"]}
          />
          <InfoPanel
            icon={CircleAlert}
            title="Rules"
            items={[
              "Primary and secondary global actions prefer the page toolbar, not literal stacking in the header corner.",
              "Observability info cards stay neutral; status color belongs in badges, dots and alert-only surfaces.",
              "Use accent-left only for true incident summaries or escalation modules, not for routine service cards.",
              "Left rail = dedicated structural navigation/context; right rail = metrics, details and secondary information.",
              "When present, the right rail keeps a fixed desktop width and stacks below the main pane on smaller screens.",
              "Dense event tables outrank decorative cards.",
              "Headers remain canonical even when telemetry widgets gain more emphasis.",
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function SectionTitle({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
        {label}
      </div>
      <h2 className="text-xl font-extrabold tracking-tight text-on-surface">{title}</h2>
      <p className="max-w-3xl text-sm text-on-surface-variant">{description}</p>
    </div>
  );
}

function CanonRule({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof LayoutPanelTop;
  title: string;
  text: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        <div className="rounded-sm bg-primary/10 p-3 text-primary">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-on-surface">{title}</h3>
          <p className="mt-2 text-sm text-on-surface-variant">{text}</p>
        </div>
      </div>
    </div>
  );
}

function InfoPanel({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Eye;
  title: string;
  items: string[];
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-sm bg-surface-container-high p-2 text-primary">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-on-surface-variant">
            <ArrowRight className="mt-0.5 w-4 h-4 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "warning" | "neutral" | "error";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary bg-primary/5 text-primary"
      : tone === "warning"
        ? "border-amber-500 bg-amber-50 text-amber-700"
        : tone === "error"
          ? "border-error bg-error/5 text-error"
          : "border-outline-variant/20 bg-surface-container-lowest text-on-surface";

  return (
    <div className={`rounded-sm border-l-2 px-4 py-4 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant">
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

function ShellNavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-sm px-3 py-2 text-sm ${
        active ? "bg-primary/10 text-white border-l-4 border-primary" : "text-outline"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </div>
  );
}

function AccentCard({
  title,
  text,
  accent,
  badge,
  badgeClass,
}: {
  title: string;
  text: string;
  accent: string;
  badge: string;
  badgeClass: string;
}) {
  return (
    <div className={`card p-5 ${accent ? `card-accent-left ${accent}` : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-bold text-on-surface">{title}</h4>
        <span className={badgeClass}>{badge}</span>
      </div>
      <p className="mt-3 text-sm text-on-surface-variant">{text}</p>
    </div>
  );
}

function FormField({
  label,
  help,
  placeholder,
  multiline = false,
}: {
  label: string;
  help: string;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.18em] text-outline">
        {label}
      </label>
      {multiline ? (
        <textarea
          rows={4}
          className="w-full resize-none border-0 border-b-2 border-outline bg-surface-container-highest px-0 py-3 text-sm text-on-surface outline-none focus:border-primary"
          placeholder={placeholder}
          defaultValue=""
        />
      ) : (
        <input
          className="w-full border-0 border-b-2 border-outline bg-surface-container-highest px-0 py-3 text-sm text-on-surface outline-none focus:border-primary"
          placeholder={placeholder}
          defaultValue=""
        />
      )}
      <p className="text-[11px] text-on-surface-variant">{help}</p>
    </div>
  );
}

function PaginationFooter({
  showing,
  total,
  page,
  pages,
}: {
  showing: string;
  total: string;
  page: string;
  pages: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-outline-variant/15 bg-surface-container-low px-6 py-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
        Showing {showing} of {total}
      </div>
      <div className="flex items-center gap-3 text-[11px] font-bold text-on-surface">
        <button className="text-on-surface-variant hover:text-primary transition-colors" disabled>
          Prev
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button className="text-primary hover:underline transition-colors">Next</button>
      </div>
    </div>
  );
}
