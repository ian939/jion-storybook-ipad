import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const readText = (relativePath) => read(relativePath).toString("utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jpegSize(buffer) {
  assert(buffer[0] === 0xff && buffer[1] === 0xd8, "Invalid JPEG header");
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("JPEG size marker was not found");
}

const context = { window: {} };
vm.runInNewContext(readText("story-data.js"), context);
const story = context.window.STORYBOOK;
assert(story?.title === "지온과 사라진 생일별", "Story title is missing");
assert(story.pages.length === 26, `Expected 26 pages, received ${story.pages.length}`);

for (const [index, page] of story.pages.entries()) {
  assert(page.number === index + 1, `Page number mismatch at ${index + 1}`);
  assert(page.text.trim().length > 0, `Page ${page.number} has no story text`);
  const imagePath = path.join(root, page.image);
  assert(fs.existsSync(imagePath), `Page ${page.number} image is missing`);
  const size = jpegSize(fs.readFileSync(imagePath));
  assert(Math.abs(size.width / size.height - 1.5) < 0.01, `Page ${page.number} image is not 3:2`);
}

const html = readText("index.html");
const css = readText("styles.css");
const app = readText("app.js");
assert(html.includes("user-scalable=no") && html.includes("maximum-scale=1"), "Viewport lock is incomplete");
assert(html.includes("PretendardVariable.ttf") || css.includes("PretendardVariable.ttf"), "Pretendard font is missing");
assert(css.includes("aspect-ratio: 1 / 1"), "Square book layout is missing");
assert(css.includes('font-family: "Pretendard"') && css.includes("font-size: 20px"), "Unified Pretendard typography is missing");
assert(css.includes(".page-copy") && css.includes("overflow: hidden"), "Text-area overflow protection is missing");
assert(css.includes("touch-action: pan-y"), "Single-finger vertical touch policy is missing");
assert(css.includes("-webkit-touch-callout: none"), "Long-press protection is missing");
assert(css.includes("user-select: none"), "Text-selection protection is missing");
assert(app.includes('"gesturestart"') && app.includes("passive: false"), "Safari pinch protection is missing");
assert(app.includes('"contextmenu"'), "Context-menu protection is missing");
assert(app.includes('"dragstart"'), "Image-drag protection is missing");
assert(app.includes('"copy"') && app.includes('"paste"'), "Clipboard protection is missing");
assert(app.includes('addEventListener("pointerup"'), "Page swipe/tap handling is missing");

const endpoints = ["/", "/styles.css", "/story-data.js", "/public/images/page-01.jpg", "/public/images/page-26.jpg"];
for (const endpoint of endpoints) {
  const response = await fetch(`http://127.0.0.1:4173${endpoint}`);
  assert(response.ok, `${endpoint} returned HTTP ${response.status}`);
  await response.arrayBuffer();
}

console.log("✓ 26-page story data");
console.log("✓ 26 artwork files at 3:2 ratio");
console.log("✓ Square iPad layout and Pretendard font");
console.log("✓ Page-turn controls and kid-safe touch guardrails");
console.log("✓ Local server endpoints");
