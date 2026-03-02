---
name: threat-modeling
description: Apoio na identificação de ameaças durante a fase de design de novas funcionalidades.
---

# Threat Modeling (STRIDE)

## Objetivo

Antecipar vetores de ataque em novas funcionalidades através de um framework estruturado.

## Como Usar

Quando o usuário propõe uma nova arquitetura ou componente:

1. **Análise STRIDE**: O agente deve avaliar o componente sob 6 categorias:
    - **S**poofing (Falsificação)
    - **T**ampering (Adulteração)
    - **R**epudiation (Repúdio)
    - **I**nformation Disclosure (Vazamento de Informação)
    - **D**enial of Service (DoS)
    - **E**levation of Privilege (Elevação de Privilégio)
2. **Sugestão de Mitigação**: Proponha controles compensatórios para cada risco alto.

## Resultado Esperado

Um relatório conciso com "Ameaça -> Impacto -> Mitigação".
