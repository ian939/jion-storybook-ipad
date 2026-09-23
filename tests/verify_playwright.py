from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-results"
URL = "http://127.0.0.1:4173"
VIEWPORTS = {
    "ipad-9-landscape": {"width": 1024, "height": 768},
    "ipad-pro-landscape": {"width": 1194, "height": 834},
    "ipad-pro-portrait": {"width": 1024, "height": 1366},
}


def inspect_page(page, number: int) -> dict[str, object]:
    page.evaluate("pageNumber => window.__storybookApp.goTo(pageNumber)", number)
    page.wait_for_timeout(40)
    return page.evaluate(
        """() => {
          const copy = document.querySelector('.page-copy').getBoundingClientRect();
          const text = document.querySelector('.page-text').getBoundingClientRect();
          const art = document.querySelector('.page-art-frame').getBoundingClientRect();
          const style = getComputedStyle(document.querySelector('.page-text'));
          return {
            page: window.__storybookApp.currentPage,
            copyTop: copy.top,
            copyBottom: copy.bottom,
            textTop: text.top,
            textBottom: text.bottom,
            artBottom: art.bottom,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            overflow: getComputedStyle(document.querySelector('.page-copy')).overflow,
          };
        }"""
    )


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)
    report: dict[str, list[dict[str, object]]] = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for name, viewport in VIEWPORTS.items():
            context = browser.new_context(
                viewport=viewport,
                device_scale_factor=2,
                is_mobile=True,
                has_touch=True,
            )
            page = context.new_page()
            page.goto(URL, wait_until="networkidle")
            page.evaluate("localStorage.clear()")
            page.reload(wait_until="networkidle")
            page.evaluate("document.fonts.ready")

            results = [inspect_page(page, number) for number in range(1, 27)]
            for result in results:
                assert result["fontSize"] == "20px", result
                assert "Pretendard" in str(result["fontFamily"]), result
                assert result["overflow"] == "hidden", result
                assert float(result["textTop"]) >= float(result["copyTop"]) - 0.5, result
                assert float(result["textBottom"]) <= float(result["copyBottom"]) + 0.5, result
                assert float(result["artBottom"]) <= float(result["copyTop"]) + 0.5, result

            longest = max(results, key=lambda item: float(item["textBottom"]) - float(item["textTop"]))
            page.evaluate("pageNumber => window.__storybookApp.goTo(pageNumber)", longest["page"])
            page.locator("#page-stage").screenshot(path=OUTPUT / f"{name}-longest.png")
            report[name] = results
            context.close()

        browser.close()

    (OUTPUT / "playwright-layout-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Playwright verified all 26 pages at three iPad viewports.")


if __name__ == "__main__":
    main()
