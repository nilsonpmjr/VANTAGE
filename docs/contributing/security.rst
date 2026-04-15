Security Policy
================

Reporting a vulnerability
--------------------------

Do **not** open a public GitHub issue for security vulnerabilities.

Report security issues via the GitHub Security Advisory:

   https://github.com/nilsonpmjr/Vantage/security/advisories/new

Include:

* A description of the vulnerability
* Steps to reproduce
* Potential impact
* (Optional) Suggested fix

We aim to acknowledge reports within 48 hours and resolve critical issues within 7 days.

Scope
-----

In scope:

* Authentication and session management flaws
* RBAC bypass or privilege escalation
* Injection vulnerabilities (query injection, XSS, SSTI, etc.)
* Credential exposure in code or default configurations
* Container escape or insecure Docker configurations

Out of scope:

* Issues requiring physical access to the host
* Social engineering or phishing against the VANTAGE team
* Vulnerabilities in third-party services (VirusTotal, AbuseIPDB, etc.)

Disclosure policy
-----------------

VANTAGE follows **coordinated disclosure**. We ask that you give us reasonable time to
fix a reported issue before any public disclosure.
