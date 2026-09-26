"""Visual smoke check for the development-only OM3 Markdown harness."""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:4177/__dev/markdown")
    parser.add_argument("--output", default="/tmp/vantage-markdown-visual")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(args.url, wait_until="networkidle")
        page.get_by_text("Núcleo Markdown compartilhado", exact=True).wait_for()
        for label, filename in (
            ("Editar", "edit.png"),
            ("Prévia", "preview.png"),
            ("Lado a lado", "split.png"),
        ):
            button = page.get_by_role("button", name=label)
            button.click()
            expect(button).to_have_attribute("aria-pressed", "true")
            page.screenshot(path=str(output / filename), full_page=True)
        page.evaluate("document.documentElement.dataset.theme = 'dark'")
        page.wait_for_timeout(250)
        page.screenshot(path=str(output / "split-dark.png"), full_page=True)
        overflow = page.evaluate(
            "document.documentElement.scrollWidth > document.documentElement.clientWidth"
        )
        if overflow:
            raise RuntimeError("markdown_harness_horizontal_overflow")
        browser.close()

    print(f"Markdown visual smoke passed (edit, preview, split, dark): {output}")


if __name__ == "__main__":
    main()
