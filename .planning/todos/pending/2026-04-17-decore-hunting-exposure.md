---
created: 2026-04-17T10:40:35-03:00
title: De-core hunting and exposure
area: general
files:
  - web/src/components/Layout.tsx
  - web/src/context/ExtensionsContext.tsx
  - web/src/lib/access.ts
  - web/src/App.tsx
  - web/src/pages/help/DocsPage.tsx
  - web/src/pages/help/ApiReferencePage.tsx
  - README.md
  - docs/index.rst
  - docs/configuration/rbac.rst
  - docs/contributing/index.rst
---

## Problem

Hunting and Exposure were moved out of the product core into independently developed extensions, but the core repository still exposes them in navigation, route guards, help content, API reference copy, and top-level documentation. This leaks old product boundaries and causes a brief sidebar flash where both items appear before extension state finishes loading.

## Solution

Make extension-backed surfaces opt-in everywhere in the core. Navigation should only materialize these entries after extension features are confirmed active, and route access should follow the same feature-based policy without role-based bypasses. Core docs and help pages should stop describing Hunting and Exposure as native modules and only mention them as optional extension surfaces where necessary.
