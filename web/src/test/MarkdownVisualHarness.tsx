import { useState } from "react";
import { MarkdownContent, MarkdownEditor } from "../components/markdown";

const SAMPLE_MARKDOWN = `# Registro de exploração

> Execução documentada para revisão do responsável.

## Evidências

- [x] Requisição reproduzida
- [ ] Validar correção

| Campo | Valor |
| --- | --- |
| Alvo | \`portal.example.test\` |
| Impacto | Acesso administrativo |

\`\`\`http
GET /admin HTTP/1.1
Host: portal.example.test
\`\`\`

[Abrir engagement](/redmode/engagements/cliente-demo)
`;

export default function MarkdownVisualHarness() {
  const [value, setValue] = useState(SAMPLE_MARKDOWN);
  const [persisted, setPersisted] = useState(SAMPLE_MARKDOWN);

  return (
    <main data-workspace="redmode" className="min-h-screen bg-background p-6 text-on-surface">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Roteiro visual OM3-01</p>
          <h1 className="mt-2 text-2xl font-bold">Núcleo Markdown compartilhado</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Valide edição, prévia e divisão lado a lado nos temas claro e escuro.
          </p>
        </header>
        <MarkdownEditor
          value={value}
          persistedValue={persisted}
          onChange={setValue}
          onPersist={(nextValue) => setPersisted(nextValue)}
        />
        <section className="card p-5">
          <h2 className="card-title mb-4">Conteúdo publicado</h2>
          <MarkdownContent markdown={persisted} />
        </section>
      </div>
    </main>
  );
}
