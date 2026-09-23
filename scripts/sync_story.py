from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
SOURCE_DIR = WORKSPACE_ROOT / "storybook_pdf" / "opening_scenes_v1"
SOURCE_MD = SOURCE_DIR / "jion_storybook_text.md"
SOURCE_FONT = WORKSPACE_ROOT / "assets" / "fonts" / "PretendardVariable.ttf"
IMAGE_DIR = REPO_ROOT / "public" / "images"
FONT_DIR = REPO_ROOT / "public" / "fonts"
DATA_FILE = REPO_ROOT / "story-data.js"
DEDICATION_TEXT = """사랑하는 지온이의 6번째 생일을 너무 축하해.

지온이와 포켓몬 친구들이 함께하는 ‘생일별’ 이야기도
즐겁게 읽고 재밌었으면 좋겠다!

멋지고 훌륭하게 자라줘서 고마워
사랑해 아들 :)"""


def read_pages() -> list[dict[str, object]]:
    source = SOURCE_MD.read_text(encoding="utf-8")
    pattern = re.compile(
        r"^## (\d+)쪽\s*$\s*"
        r"\*\*그림:\*\* \[[^\]]+\]\(\./([^\)]+)\)\s*"
        r"(.+?)(?=\n\n---|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    pages = []
    for match in pattern.finditer(source):
        number = int(match.group(1))
        image_name = match.group(2).strip()
        text = " ".join(match.group(3).strip().split())
        pages.append({"number": number, "source": image_name, "text": text})

    expected = list(range(1, len(pages) + 1))
    numbers = [int(page["number"]) for page in pages]
    if not pages or numbers != expected:
        raise RuntimeError(f"Story pages are missing or out of order: {numbers}")
    return pages


def export_image(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        rgb = image.convert("RGB")
        target_size = (1536, 1024)
        if rgb.size != target_size:
            # Keep the complete illustration visible. A soft extension fills the
            # 3:2 book frame so non-standard source art is never hard-cropped.
            background = ImageOps.fit(rgb, target_size, method=Image.Resampling.LANCZOS)
            background = background.filter(ImageFilter.GaussianBlur(radius=36))
            foreground = ImageOps.contain(rgb, target_size, method=Image.Resampling.LANCZOS)
            position = (
                (target_size[0] - foreground.width) // 2,
                (target_size[1] - foreground.height) // 2,
            )
            background.paste(foreground, position)
            rgb = background

        rgb.save(
            destination,
            format="JPEG",
            quality=92,
            subsampling=0,
            optimize=True,
            progressive=True,
        )


def main() -> None:
    pages = read_pages()
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    FONT_DIR.mkdir(parents=True, exist_ok=True)

    exported = [
        {
            "number": 1,
            "kind": "dedication",
            "text": DEDICATION_TEXT,
        }
    ]
    for page in pages:
        number = int(page["number"])
        source_image = SOURCE_DIR / str(page["source"])
        if not source_image.is_file():
            raise FileNotFoundError(source_image)
        output_name = f"page-{number:02d}.jpg"
        export_image(source_image, IMAGE_DIR / output_name)
        exported.append(
            {
                "number": number + 1,
                "image": f"public/images/{output_name}",
                "text": str(page["text"]),
            }
        )

    if not SOURCE_FONT.is_file():
        raise FileNotFoundError(SOURCE_FONT)
    shutil.copy2(SOURCE_FONT, FONT_DIR / SOURCE_FONT.name)

    payload = {
        "title": "지온과 사라진 생일별",
        "pages": exported,
    }
    DATA_FILE.write_text(
        "window.STORYBOOK = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Synced {len(exported)} pages to {REPO_ROOT}")


if __name__ == "__main__":
    main()
