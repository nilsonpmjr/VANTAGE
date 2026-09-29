"""Visual smoke check for the development-only OM3 draft notebook harness."""

from __future__ import annotations

import argparse
from pathlib import Path
from time import sleep

from selenium import webdriver
from selenium.webdriver import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
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

        driver.find_element(By.XPATH, "//button[@role='tab' and normalize-space()='Buscar']").click()
        search_input = WebDriverWait(driver, 5).until(
            lambda current: current.find_element(
                By.CSS_SELECTOR,
                "input[placeholder='Buscar notas, findings, fontes e alvos']",
            )
        )
        search_input.send_keys("portal")
        wait_for_text(driver, "3 resultados no engagement")
        driver.save_screenshot(str(output / "desktop-search.png"))

        driver.find_element(By.XPATH, "//button[@role='tab' and normalize-space()='Explorar']").click()
        driver.find_element(By.CSS_SELECTOR, "button[aria-label='Fixar nota']").click()
        wait_for_text(driver, "FIXADAS · 1")
        driver.save_screenshot(str(output / "desktop-pinned.png"))

        ActionChains(driver).key_down(Keys.CONTROL).send_keys("o").key_up(Keys.CONTROL).perform()
        quick_switcher = WebDriverWait(driver, 5).until(
            lambda current: current.find_element(
                By.CSS_SELECTOR,
                "input[placeholder='Abrir nota por título, fase ou tag']",
            )
        )
        quick_switcher.send_keys("Cabeçalhos")
        wait_for_text(driver, "Cabeçalhos observados")
        driver.save_screenshot(str(output / "desktop-quick-switcher.png"))
        quick_switcher.send_keys(Keys.ENTER)
        WebDriverWait(driver, 5).until(
            lambda current: len(current.find_elements(By.CSS_SELECTOR, "[role='tablist'][aria-label='Documentos abertos'] [role='tab']")) == 2
        )
        driver.save_screenshot(str(output / "desktop-tabs.png"))
        driver.find_element(
            By.XPATH,
            "//div[@role='tablist' and @aria-label='Documentos abertos']//button[@role='tab' and contains(normalize-space(), 'Validação completa do portal administrativo')]",
        ).click()
        wait_for_text(driver, "Validação completa do portal administrativo — rascunho")

        driver.execute_script("document.documentElement.dataset.theme = 'dark'")
        sleep(0.3)
        driver.save_screenshot(str(output / "desktop-dark.png"))

        explorer_separator = driver.find_element(
            By.CSS_SELECTOR,
            "[role='separator'][aria-label='Redimensionar explorador']",
        )
        explorer_width = int(explorer_separator.get_attribute("aria-valuenow"))
        ActionChains(driver).click_and_hold(explorer_separator).move_by_offset(48, 0).release().perform()
        WebDriverWait(driver, 5).until(
            lambda current: int(current.find_element(
                By.CSS_SELECTOR,
                "[role='separator'][aria-label='Redimensionar explorador']",
            ).get_attribute("aria-valuenow")) > explorer_width
        )
        driver.save_screenshot(str(output / "desktop-resized.png"))

        driver.find_element(By.XPATH, "//button[@role='tab' and normalize-space()='Anexos']").click()
        wait_for_text(driver, "captura-privada.png")
        driver.save_screenshot(str(output / "desktop-attachments.png"))
        driver.find_element(By.XPATH, "//button[@role='tab' and normalize-space()='Histórico']").click()
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
        driver.find_element(By.XPATH, "//button[@role='tab' and normalize-space()='Dados']").click()

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
