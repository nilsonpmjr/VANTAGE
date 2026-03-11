# Contributing to iT.eam Threat Intelligence Tool

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and constructive. Harassment or discrimination of any kind will not be tolerated.

## Getting Started

1. Fork the repository
2. Clone your fork and create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```
3. Set up the development environment:
   ```bash
   # Backend
   cd backend && python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt

   # Frontend
   cd web && npm install
   ```
4. Copy `.env.example` to `.env` and configure your API keys

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<scope>` | `feat/batch-export` |
| Bug fix | `fix/<scope>` | `fix/dashboard-overflow` |
| Refactor | `refactor/<scope>` | `refactor/auth-middleware` |
| Docs | `docs/<scope>` | `docs/api-reference` |
| Chore | `chore/<scope>` | `chore/update-deps` |

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

**Examples:**
```
feat(recon): add subdomain enumeration module
fix(auth): prevent token reuse after MFA verification
docs(api): add OpenAPI examples for /analyze endpoint
```

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Run tests before submitting:
   ```bash
   cd backend && python -m pytest tests/ -v
   ```
3. Verify frontend builds without errors:
   ```bash
   cd web && npm run build
   ```
4. Create a PR against `main` with:
   - Clear title following Conventional Commits
   - Description of **what** changed and **why**
   - Screenshots for UI changes
   - Link to related issue (if any)
5. Wait for at least one maintainer review before merging

## Development Guidelines

### Backend (Python / FastAPI)
- Follow PEP 8 style conventions
- Add type hints to function signatures
- Use `async/await` for I/O operations
- All new routes must enforce RBAC via `require_role()` or `require_api_scope()`
- Never log sensitive data (passwords, API keys, tokens)

### Frontend (React / Vite)
- Use functional components with hooks
- All user-visible strings must use `react-i18next` (`t('key')`) with entries in `pt.json`, `en.json`, and `es.json`
- Follow the existing component structure under `web/src/components/`
- Use CSS variables from `index.css` for theming (no hardcoded colors)

### Security
- Never commit secrets (`.env`, credentials, private keys)
- Encrypt sensitive data at rest using the existing `crypto.py` helpers
- Validate all user input at the API boundary
- Follow OWASP Top 10 guidelines

## Reporting Bugs

Open a GitHub Issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS version (for frontend bugs)
- Backend logs (if applicable, with sensitive data redacted)

## Reporting Vulnerabilities

**Do not open a public issue for security vulnerabilities.** See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## License

By contributing, you agree that your contributions will be licensed under the [AGPLv3](LICENSE).
