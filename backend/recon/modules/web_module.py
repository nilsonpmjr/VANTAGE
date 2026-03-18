"""
Web Recon module — uses httpx (already a project dependency).
Probes HTTP/HTTPS, follows redirects, extracts title, tech stack hints,
and audits security headers.
"""

import re
from urllib.parse import urljoin

import httpx

from network_security import validate_public_url
from .base import ReconModule

_TITLE_RE = re.compile(r"<title[^>]*>([^<]{1,200})</title>", re.IGNORECASE | re.DOTALL)

_SECURITY_HEADERS = [
    "strict-transport-security",
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "x-xss-protection",
]

_TECH_PATTERNS: list[tuple[str, str]] = [
    ("WordPress", r"wp-content|wp-json"),
    ("Drupal", r"drupal|sites/default"),
    ("Joomla", r"joomla|/components/com_"),
    ("Laravel", r"laravel|XSRF-TOKEN"),
    ("Django", r"csrftoken|django"),
    ("React", r"__REACT_|react\.js|react-dom"),
    ("Next.js", r"__NEXT_DATA__|next\.js"),
    ("Vue.js", r"__vue__|vue\.js"),
    ("Angular", r"ng-version|angular"),
    ("jQuery", r"jquery\.js|jquery\.min"),
    ("Bootstrap", r"bootstrap\.min\.css|bootstrap\.css"),
    ("Nginx", r"nginx"),
    ("Apache", r"Apache"),
    ("IIS", r"IIS|asp\.net"),
    ("Cloudflare", r"cloudflare|__cfduid|cf-ray"),
]


class WebModule(ReconModule):
    name = "web"
    display_name = "Web"
    requires = []
    target_types = ["domain"]
    timeout_seconds = 20
    max_redirect_hops = 5

    async def run(self, target: str, target_type: str) -> dict:
        results: dict = {}

        for scheme in ("https", "http"):
            url = f"{scheme}://{target}"
            try:
                validate_public_url(url)
                async with httpx.AsyncClient(
                    follow_redirects=False,
                    timeout=httpx.Timeout(10.0),
                    headers={"User-Agent": "Mozilla/5.0 (compatible; ReconBot/1.0)"},
                ) as client:
                    current_url = url
                    redirect_chain: list[str] = []

                    for _ in range(self.max_redirect_hops + 1):
                        validate_public_url(current_url)
                        resp = await client.get(current_url)

                        if resp.status_code in {301, 302, 303, 307, 308}:
                            location = resp.headers.get("location")
                            if not location:
                                raise ValueError("Redirect response missing Location header.")

                            next_url = urljoin(str(resp.url), location)
                            validate_public_url(next_url)
                            redirect_chain.append(next_url)
                            current_url = next_url
                            continue

                        body = resp.text[:50_000]  # cap body read for tech detection
                        results = {
                            "scheme": scheme,
                            "status_code": resp.status_code,
                            "final_url": str(resp.url),
                            "redirect_chain": redirect_chain,
                            "title": self._extract_title(body),
                            "server": resp.headers.get("server"),
                            "x_powered_by": resp.headers.get("x-powered-by"),
                            "content_type": resp.headers.get("content-type"),
                            "security_headers": self._audit_security_headers(resp.headers),
                            "technologies": self._detect_tech(resp.headers, body),
                        }
                        break
                    else:
                        raise ValueError("Too many redirects during web reconnaissance.")

                break  # stop after first successful scheme
            except Exception as exc:
                results[f"{scheme}_error"] = str(exc)

        return results

    def _extract_title(self, body: str) -> str | None:
        m = _TITLE_RE.search(body)
        if m:
            return m.group(1).strip()[:200]
        return None

    def _audit_security_headers(self, headers: httpx.Headers) -> dict:
        return {
            h: headers.get(h) is not None
            for h in _SECURITY_HEADERS
        }

    def _detect_tech(self, headers: httpx.Headers, body: str) -> list[str]:
        combined = " ".join(headers.values()) + " " + body
        found: list[str] = []
        for tech, pattern in _TECH_PATTERNS:
            if re.search(pattern, combined, re.IGNORECASE):
                found.append(tech)
        return found
