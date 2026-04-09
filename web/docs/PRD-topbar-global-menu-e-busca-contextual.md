# PRD — Topbar como Global Menu e Busca Contextual

**Projeto:** VANTAGE Operational Architect  
**Data:** 2026-03-24  
**Status:** Proposto

---

## 1. Executive Summary

- **Problem Statement**: A topbar atual já concentra notificações, ajuda, histórico e perfil, mas ainda não tem uma função estrutural forte. O elemento `Analyst Workspace` ocupa espaço sem operar como navegação real, enquanto algumas páginas carregam `Runtime Actions` e contexto redundante, empurrando conteúdo importante para baixo.
- **Proposed Solution**: Transformar a topbar em uma camada global de navegação e comando. O bloco hoje exibido como `Analyst Workspace` passa a funcionar como `Global Menu / Workspace Switcher`, acompanhado de uma busca com escopo `page/global`. Isso reduz redundância nas páginas, melhora densidade útil e dá função real ao chrome superior.
- **Success Criteria**:
  - O texto `Analyst Workspace` deixa de ser puramente decorativo e vira ponto funcional de navegação global.
  - Páginas como `Profile`, `Settings` e `Operational Patterns` reduzem blocos redundantes de `Runtime Actions` quando apropriado.
  - A topbar passa a suportar busca `global` e `in-page`.
  - O chrome superior passa a ser a fonte oficial de acesso rápido às áreas `Analyst`, `Admin`, `Observability` e `Profile`.
  - O padrão é documentado e reutilizável para toda a interface nova.

---

## 2. Contexto

Hoje a topbar já possui:

- notificações
- histórico/última pesquisa
- ajuda
- perfil

Mas ainda não possui:

- um papel claro de navegação global
- busca contextual/global
- comando rápido entre superfícies
- responsabilidade formal dentro da gramática do produto

Problemas observados:

1. Em páginas como `Profile`, o conteúdo principal começa tarde demais.
2. Algumas páginas carregam `Runtime Actions` em uma faixa separada que ocupa altura sem agregar valor real.
3. O header da página repete contexto que poderia morar no chrome superior.
4. `Analyst Workspace` aparece em todas as páginas, mas hoje não navega, não troca contexto e não abre nada.

---

## 3. Objetivos

1. Dar função real ao bloco superior hoje representado por `Analyst Workspace`
2. Criar um `Global Menu / Workspace Switcher`
3. Adicionar busca com escopo de página e escopo global
4. Reduzir redundância entre topbar, page header e page toolbar
5. Melhorar densidade útil de páginas como `Profile`, `Settings` e `Notifications`

---

## 4. Não-objetivos

- Remover a sidebar principal
- Transformar a topbar em navegação única do produto
- Reescrever rotas do sistema nesta fase
- Implementar command palette full-power com atalhos avançados já na primeira entrega
- Substituir ações locais de seção pela topbar

---

## 5. User Experience & Functionality

### 5.1 Personas

- **Analista**: precisa trocar rapidamente entre superfícies e acionar busca sem perder contexto.
- **Administrador**: precisa saltar entre áreas de gestão e observabilidade sem atravessar múltiplas páginas.
- **Operador**: precisa usar o chrome superior como ponto de acesso transversal do produto.

### 5.2 User Stories

- **Story 1**: Como usuário, quero abrir um menu global na topbar para trocar rapidamente de área do produto.
- **Story 2**: Como usuário, quero pesquisar no contexto da página atual ou no produto inteiro sem adivinhar onde cada função está.
- **Story 3**: Como usuário, quero que a topbar assuma parte da navegação utilitária para que o conteúdo das páginas ganhe mais espaço.
- **Story 4**: Como designer/dev, quero uma regra clara do que pertence à topbar, ao header da página e à toolbar da página.

### 5.3 Acceptance Criteria

#### Story 1 — Global Menu

- O bloco atualmente rotulado como `Analyst Workspace` deve virar um botão/menu funcional.
- O menu deve permitir acessar:
  - superfícies `Analyst`
  - superfícies `Admin`
  - superfícies `Observability`
  - `Profile`
- O menu não deve substituir a sidebar, apenas complementar navegação e troca rápida.

#### Story 2 — Busca contextual/global

- A topbar deve conter um campo de busca.
- A busca deve aceitar dois escopos:
  - `This page`
  - `Global`
- O placeholder deve variar conforme a superfície:
  - `Recon`: target, IOC, job id
  - `Users & Roles`: user, role, permission
  - `Threat Ingestion`: source, family, protocol
  - `Feed`: title, tag, source

#### Story 3 — Redução de redundância

- `Runtime Actions` não devem aparecer como faixa separada em páginas onde a topbar já absorver a ação global principal.
- `Profile` deve subir o conteúdo principal após a adoção do novo padrão.
- `Operational Patterns` deve continuar sendo página canônica, mas não deve competir com o chrome superior.

#### Story 4 — Hierarquia clara

- `Topbar` = acesso global, busca e utilidades
- `Page Header` = título, subtítulo, contexto editorial
- `Page Toolbar` = ações globais da página, quando necessárias
- `Section Header` = ações locais da seção

---

## 6. Proposta de Arquitetura de Topbar

### 6.1 Zonas da topbar

#### Zona A — Shell Controls

- botão de colapsar/expandir sidebar
- branding mínimo quando necessário

#### Zona B — Global Menu / Workspace Switcher

- substitui o papel vazio de `Analyst Workspace`
- abre um painel/menu com:
  - `Analyst`
    - Home
    - Feed
    - Recon
    - Watchlist
    - Hunting
    - Exposure
  - `Observability`
    - Dashboard
    - Notifications
    - System Health
  - `Admin`
    - Extensions Catalog
    - Threat Ingestion
    - Users & Roles
    - Security Policies
  - `Profile`

#### Zona C — Search / Command Access

- campo de busca da topbar
- seletor de escopo:
  - `This page`
  - `Global`
- comportamento:
  - busca simples na página quando existir suporte
  - jump global/launcher quando em modo `Global`

#### Zona D — Global Utilities

- notificações
- histórico
- ajuda
- perfil

### 6.2 Regras de comportamento

- `Topbar` não substitui a sidebar principal
- `Global Menu` serve para trocar de domínio operacional e pular etapas
- `Search` serve tanto para contexto de página quanto para acesso global
- `Utilities` continuam agrupadas à direita

---

## 7. Regras de Gramática

### 7.1 Topbar

- deve ter função real, nunca apenas rótulo decorativo
- deve manter baixa altura e alta densidade
- não deve carregar botões grandes ou CTAs promocionais

### 7.2 Workspace label

- `Analyst Workspace` deve evoluir para um componente funcional
- o label pode refletir o contexto atual:
  - `Analyst Workspace`
  - `Admin Workspace`
  - `Observability Workspace`
  - `Profile Workspace`

### 7.3 Busca

- busca da topbar deve ser compacta e discreta
- não deve competir com título da página
- escopo precisa estar visível ou inferível

### 7.4 Page header

- título e subtítulo continuam existindo
- não devem repetir a navegação global
- devem perder blocos redundantes quando a topbar assumir a função

### 7.5 Page toolbar

- continua existindo apenas quando a página realmente precisar de ação global própria
- não deve duplicar algo que já foi movido para a topbar

---

## 8. Impacto por Superfície

### 8.1 Profile

- remover ou reavaliar `Runtime Actions`
- subir o conteúdo principal
- deixar o refresh de runtime como ação utilitária global ou ação contextual mais leve

### 8.2 Settings

- pode se beneficiar do `Global Menu` para saltar entre áreas sem depender só da sidebar e da rail interna

### 8.3 Dashboard / Notifications / System Health

- reforçar a topbar como ponto de entrada da camada de observabilidade

### 8.4 Operational Patterns

- virar referência explícita dessa nova regra
- documentar que a topbar é camada global, não adorno

---

## 9. Technical Specifications

### 9.1 Componentes candidatos

- `WorkspaceSwitcher`
- `TopbarSearch`
- `GlobalSearchScopeSwitch`
- `TopbarUtilities`
- `TopbarContextLabel`

### 9.2 Estados

- `workspace menu open/closed`
- `search scope = page/global`
- `search query`
- `page supports contextual search = true/false`

### 9.3 Integrações

- roteamento com `react-router`
- leitura de contexto atual da rota
- integração com endpoints existentes onde busca contextual fizer sentido
- fallback para navegação global/launcher quando não houver endpoint de busca específico

### 9.4 Compatibilidade

- deve funcionar com sidebar expandida e colapsada
- deve funcionar em desktop e tablet
- em telas menores, busca pode colapsar em ícone/overlay

---

## 10. Riscos

- **Sobrecarga da topbar**: tentar colocar tudo no chrome superior e perder clareza.
- **Conflito com sidebar**: se o menu global competir com a navegação persistente.
- **Busca sem semântica**: adicionar campo global sem definir o que cada página suporta.
- **Duplicação de ações**: manter `Runtime Actions` nas páginas e também na topbar.

### Mitigações

- manter a regra: `topbar = global`, `header = editorial`, `toolbar = page-level`
- lançar primeiro como navegação/launcher + busca simples
- reduzir redundâncias página a página após o novo padrão entrar

---

## 11. Rollout Proposto

### 11.1 MVP

- `Analyst Workspace` vira `WorkspaceSwitcher`
- busca aparece na topbar com escopo `Global` e `This page`
- páginas ainda mantêm toolbars atuais

### 11.2 V1

- `Profile` e outras páginas redundantes perdem `Runtime Actions` desnecessárias
- placeholders/contextos por página são refinados
- `Operational Patterns` recebe a nova regra

### 11.3 V2

- busca global evolui para launcher/command palette mais completo
- shortcuts e ajuda podem abrir fluxos diretamente pelo chrome superior

---

## 12. Definition of Done

- topbar tem função real de navegação e busca
- `Analyst Workspace` deixa de ser texto decorativo
- `Profile` e páginas equivalentes reduzem redundância de chrome interno
- a regra é documentada no canon
- a nova estrutura não quebra a sidebar nem a gramática operacional do produto
