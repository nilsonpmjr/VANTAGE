---
name: vercel-react-best-practices
description: Padrões de otimização para React e Next.js baseados no guia oficial da Vercel.
source: https://github.com/vercel/vercel-react-best-practices
---

# Vercel React Best Practices

## Objetivo

Otimizar a performance e a manutenibilidade de aplicações React/Next.js focando nos maiores gargalos primeiro.

## Como Usar

Ao revisar ou escrever código React:

### 1. Performance Crítica

- **Parallelize Fetches**: Evite "waterfalls" de `await`. Use `Promise.all()` para buscas independentes.
- **Bundle Size**: Evite "barrel imports" (`import { x } from 'big-library'`). Use imports diretos ou dynamic imports.
- **Server Actions**: Valide a autenticação e o esquema (zod) em todas as Server Actions.

### 2. Otimização de Renderização

- **Derived State**: Calcule valores durante a renderização em vez de usar `useEffect` para sincronizar estados.
- **State Colocation**: Mantenha o estado o mais próximo possível de onde ele é usado.
- **Transition API**: Use `useTransition` para atualizações de estado não urgentes que podem bloquear a UI.

## Impacto

Focar em mudanças estruturais (data fetching, bundle size) antes de micro-otimizações de JavaScript.
