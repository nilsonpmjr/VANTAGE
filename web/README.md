# VANTAGE Web

Frontend oficial do VANTAGE.

## Runtime local

```bash
npm install
npm run dev
```

Por padrão, a interface sobe em `http://127.0.0.1:4177` e faz proxy de `/api` para `http://localhost:8000`.

## Variáveis de ambiente

- `VITE_PORT`: porta local opcional para `dev` e `preview`
- `VITE_API_PROXY_TARGET`: alvo do proxy local `/api`
- `VITE_API_URL`: base opcional para chamadas sem proxy, quando necessário

## Validação

```bash
npm run lint
npm run build
```

`web/src/` continua sendo a fonte de verdade do frontend. `dist/` é apenas a saída gerada pelo build local.
