---
name: find-skills
description: Descoberta e instalação de novas habilidades para o agente de SOC a partir do diretório skills.sh.
source: https://skills.sh/vercel-labs/skills/find-skills
---

# Find Skills para SOC

## Objetivo

**Expandir continuamente as capacidades do agente através da busca e integração de skills especializadas.**

## Como Usar

Quando identificar uma necessidade técnica que não é coberta pelas skills atuais (ex: análise de dumping de memória, forense de rede específica):

1. **Identificar a Necessidade:** Determine o domínio e a tarefa (ex: "análise de pcap", "extração de metadados de PDF").
2. **Buscar no Diretório:** Utilize o navegador ou ferramentas de busca para encontrar skills em `https://skills.sh/`.
   - Query exemplo: `site:skills.sh forensic network`
3. **Avaliar a Skill:** Verifique se a skill possui instruções claras, scripts úteis e se passou em auditorias de segurança.
4. **Instalação Local:**
   - Crie uma pasta em `.agents/skills/[nome-da-skill]`.
   - Crie o arquivo `SKILL.md` com as instruções adaptadas para o contexto de SOC da iT.eam.
5. **Notificar o Analista:** Informe ao usuário sobre a nova capacidade integrada.

## Dica de Busca

Sempre prefira skills que ofereçam **frameworks de raciocínio** ou **ferramentas de automação** que possam ser executadas via terminal.
