"""Visual smoke check for the development-only OM3 draft notebook harness."""

from __future__ import annotations

import argparse
from pathlib import Path
from time import sleep

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def wait_for_text(driver: webdriver.Chrome, text: str) -> None:
    WebDriverWait(driver, 10).until(
        lambda current: text in current.find_element(By.TAG_NAME, "body").text
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:4177/__dev/evidence-notebook")
    parser.add_argument("--output", default="/tmp/vantage-evidence-notebook-visual")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    options = webdriver.ChromeOptions()
    options.binary_location = "/usr/bin/chromium"
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--hide-scrollbars")
    driver = webdriver.Chrome(options=options)
    try:
        driver.set_window_size(1536, 1050)
        driver.get(f"{args.url}?note=note-long")
        wait_for_text(driver, "Validação completa do portal administrativo")
        textarea = WebDriverWait(driver, 10).until(
            lambda current: current.find_element(By.CSS_SELECTOR, "textarea.markdown-editor-textarea")
        )
        if "portal administrativo" not in textarea.get_attribute("value"):
            raise RuntimeError("evidence_notebook_document_not_loaded")
        driver.execute_script("document.documentElement.dataset.theme = 'light'")
        sleep(0.3)
        driver.save_screenshot(str(output / "desktop-light.png"))

        driver.execute_script("document.documentElement.dataset.theme = 'dark'")
        sleep(0.3)
        driver.save_screenshot(str(output / "desktop-dark.png"))

        revision_button = driver.find_element(
            By.XPATH,
            "//button[contains(normalize-space(), 'Revisão 2')]",
        )
        driver.execute_script(
            "arguments[0].scrollIntoView({block: 'center'})",
            revision_button,
        )
        revision_button.click()
        wait_for_text(driver, "Revisão imutável 2")
        driver.save_screenshot(str(output / "desktop-history.png"))
        driver.find_element(By.XPATH, "//button[contains(normalize-space(), 'Voltar ao rascunho')]").click()

        driver.set_window_size(390, 844)
        for label, filename in (
            ("1. Notas", "mobile-notes.png"),
            ("2. Documento", "mobile-document.png"),
            ("3. Propriedades", "mobile-properties.png"),
        ):
            driver.find_element(By.XPATH, f"//button[@role='tab' and normalize-space()='{label}']").click()
            driver.save_screenshot(str(output / filename))

        driver.set_window_size(1536, 1050)
        driver.get(f"{args.url}?note=note-long&scenario=conflict")
        conflict = WebDriverWait(driver, 10).until(
            lambda current: current.find_element(
                By.CSS_SELECTOR,
                "section[aria-label='Comparação do conflito']",
            )
        )
        driver.execute_script(
            "arguments[0].scrollIntoView({block: 'center'})",
            conflict,
        )
        sleep(0.3)
        driver.save_screenshot(str(output / "desktop-conflict.png"))

        driver.get(f"{args.url}?note=missing")
        wait_for_text(driver, "Não foi possível abrir esta nota.")
        driver.save_screenshot(str(output / "network-error.png"))

        overflow = driver.execute_script(
            "return document.documentElement.scrollWidth > document.documentElement.clientWidth"
        )
        if overflow:
            raise RuntimeError("evidence_notebook_horizontal_overflow")
    finally:
        driver.quit()

    print(f"Evidence notebook visual smoke passed: {output}")


if __name__ == "__main__":
    main()
