# VANTAGE Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in VANTAGE, please report it responsibly:

1. **Email:** Send a detailed report to the project maintainers via the email listed in the repository's GitHub profile
2. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment** within 48 hours of your report
- **Initial assessment** within 5 business days
- **Fix timeline** communicated after assessment (typically within 30 days for critical issues)
- **Credit** in the release notes (unless you prefer to remain anonymous)

## Security Measures in Place

VANTAGE implements the following security controls:

- **Authentication:** JWT + HttpOnly cookies with SameSite=Strict, refresh token rotation
- **MFA:** TOTP-based two-factor authentication with AES-256 encrypted secrets
- **RBAC:** Role-based access control (admin / manager / tech) with API key scopes
- **Password Security:** Argon2id hashing, configurable policy (complexity, history, expiry, lockout)
- **Encryption at Rest:** Fernet (AES-256) for TOTP secrets and third-party API keys
- **Audit Trail:** Comprehensive logging of all user actions
- **Rate Limiting:** Per-endpoint rate limiting to prevent abuse
- **Input Validation:** Server-side validation of all user inputs (IP, domain, hash formats)
- **Session Management:** Per-session tokens with inactivity timeout and revocation

## Scope

The following are **in scope** for security reports:

- Authentication/authorization bypass
- Injection vulnerabilities (SQL, NoSQL, command, XSS)
- Sensitive data exposure (API keys, credentials, PII)
- Cryptographic weaknesses
- CSRF/SSRF vulnerabilities
- Privilege escalation

The following are **out of scope:**

- Vulnerabilities in third-party dependencies (report upstream)
- Denial of service via rate limiting exhaustion
- Social engineering attacks
- Issues requiring physical access to the server
