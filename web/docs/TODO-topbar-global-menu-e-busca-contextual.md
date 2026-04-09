# TODO — Topbar como Global Menu e Busca Contextual

**PRD base:** [`PRD-topbar-global-menu-e-busca-contextual.md`](PRD-topbar-global-menu-e-busca-contextual.md)

## Bloco A — Canon e proposta visual

- [ ] **A1** Atualizar `Operational Patterns` com a nova regra da topbar
- [ ] **A2** Documentar a hierarquia:
  - [ ] topbar = navegação global, busca e utilidades
  - [ ] page header = contexto editorial
  - [ ] page toolbar = ações globais da página
- [ ] **A3** Definir comportamento do label de workspace por contexto:
  - [ ] Analyst
  - [ ] Admin
  - [ ] Observability
  - [ ] Profile

## Bloco B — Componentização

- [ ] **B1** Criar `WorkspaceSwitcher`
- [ ] **B2** Criar `TopbarSearch`
- [ ] **B3** Criar seletor de escopo:
  - [ ] `This page`
  - [ ] `Global`
- [ ] **B4** Criar `TopbarContextLabel` se necessário
- [ ] **B5** Reorganizar utilidades existentes (`notifications`, `history`, `help`, `profile`) sem regressão visual

## Bloco C — Navegação global

- [ ] **C1** Estruturar o menu global por domínio:
  - [ ] Analyst
  - [ ] Observability
  - [ ] Admin
  - [ ] Profile
- [ ] **C2** Adicionar atalhos para páginas principais em cada domínio
- [ ] **C3** Garantir que o menu complemente a sidebar, sem substituí-la

## Bloco D — Busca

- [ ] **D1** Implementar campo de busca na topbar
- [ ] **D2** Implementar modo `Global`
- [ ] **D3** Implementar modo `This page`
- [ ] **D4** Definir placeholders contextuais por superfície:
  - [ ] Home
  - [ ] Feed
  - [ ] Recon
  - [ ] Watchlist
  - [ ] Hunting
  - [ ] Exposure
  - [ ] Dashboard
  - [ ] Notifications
  - [ ] System Health
  - [ ] Extensions Catalog
  - [ ] Threat Ingestion
  - [ ] Users & Roles
  - [ ] Security Policies
  - [ ] Profile
- [ ] **D5** Definir fallback de comportamento quando a página não suportar busca contextual real

## Bloco E — Redução de redundância nas páginas

- [ ] **E1** Revisar `Profile` para remover ou absorver `Runtime Actions`
- [ ] **E2** Revisar `Operational Patterns` para reduzir redundância com a topbar
- [ ] **E3** Revisar páginas de `Settings` que hoje possam repetir ações globais já absorvidas pela topbar
- [ ] **E4** Revisar `Dashboard`, `Notifications` e `System Health` após entrada do switcher

## Bloco F — UX e responsividade

- [ ] **F1** Garantir comportamento com sidebar expandida
- [ ] **F2** Garantir comportamento com sidebar colapsada
- [ ] **F3** Definir tratamento de tablet
- [ ] **F4** Definir tratamento mobile:
  - [ ] busca em overlay ou compactada
  - [ ] switcher acessível

## Bloco G — Integração técnica

- [ ] **G1** Integrar o `WorkspaceSwitcher` com `react-router`
- [ ] **G2** Derivar contexto do workspace pela rota atual
- [ ] **G3** Integrar o histórico de última busca ao modelo novo quando fizer sentido
- [ ] **G4** Garantir que o help center e atalhos continuem acessíveis pela topbar

## Bloco H — Verificação final

- [ ] **H1** Validar que `Analyst Workspace` deixou de ser texto decorativo
- [ ] **H2** Validar que a topbar ganhou função real sem competir com a sidebar
- [ ] **H3** Validar que `Profile` ganhou densidade útil
- [ ] **H4** Validar que a busca de topbar não conflita com a busca própria da `Home`
- [ ] **H5** Validar `build` e `lint` após a implementação
