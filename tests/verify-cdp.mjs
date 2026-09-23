import fs from "node:fs/promises";
import path from "node:path";

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";
const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173";
const outputDir = path.resolve("test-results");

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const targets = await fetch(`${CDP_URL}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === "page");
  assert(target, "Chrome page target was not found");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CdpClient(socket);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "Browser evaluation failed");
  }
  return result.result.value;
}

async function emulate(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
}

async function screenshot(client, filename) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(result.data, "base64"));
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const client = await connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await emulate(client, 1366, 1024);
  await client.send("Page.navigate", { url: APP_URL });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(client, "Boolean(window.__storybookApp && document.querySelector('.page-art')?.complete)")) break;
    await sleep(100);
  }

  const layout = await evaluate(client, `(() => {
    const stage = document.querySelector('#page-stage').getBoundingClientRect();
    const art = document.querySelector('.page-art-frame').getBoundingClientRect();
    const controls = [...document.querySelectorAll('button')].map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    const viewport = document.querySelector('meta[name="viewport"]').content;
    const font = getComputedStyle(document.querySelector('.page-text')).fontFamily;
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('#page-stage').dispatchEvent(contextMenu);
    const touchStart = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, 'touches', { value: [{}, {}] });
    document.querySelector('#page-stage').dispatchEvent(touchStart);
    const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.querySelector('#page-stage').dispatchEvent(gesture);
    return {
      pages: window.__storybookApp.totalPages,
      current: window.__storybookApp.currentPage,
      stage: { width: stage.width, height: stage.height },
      artRatio: art.height / stage.height,
      controls,
      viewport,
      font,
      contextBlocked: contextMenu.defaultPrevented,
      pinchBlocked: touchStart.defaultPrevented,
      gestureBlocked: gesture.defaultPrevented,
      touchAction: getComputedStyle(document.querySelector('#page-stage')).touchAction,
      selectable: getComputedStyle(document.body).userSelect,
    };
  })()`);

  assert(layout.pages === 26, `Expected 26 pages, received ${layout.pages}`);
  assert(layout.current === 1, `Expected page 1, received ${layout.current}`);
  assert(Math.abs(layout.stage.width - layout.stage.height) < 2, "Book stage is not square");
  assert(Math.abs(layout.artRatio - 2 / 3) < 0.03, `Artwork ratio is ${layout.artRatio}`);
  assert(layout.controls.every(({ width, height }) => width >= 44 && height >= 44), "A control is smaller than 44px");
  assert(layout.viewport.includes("user-scalable=no") && layout.viewport.includes("maximum-scale=1"), "Viewport is not locked");
  assert(layout.font.includes("Pretendard"), "Pretendard font is not active");
  assert(layout.contextBlocked && layout.pinchBlocked && layout.gestureBlocked, "Kid-safe gesture guardrails are incomplete");
  assert(layout.touchAction === "pan-y", `Unexpected touch-action: ${layout.touchAction}`);
  assert(layout.selectable === "none", "Text selection is enabled");

  const box = await evaluate(client, `(() => {
    const b = document.querySelector('#page-stage').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  })()`);
  const y = box.top + box.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.left + box.width * 0.78, y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: box.left + box.width * 0.22, y }],
  });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(850);
  assert((await evaluate(client, "window.__storybookApp.currentPage")) === 2, "Swipe did not advance the page");

  await evaluate(client, "window.__storybookApp.goTo(26)");
  await sleep(100);
  assert((await evaluate(client, "window.__storybookApp.currentPage")) === 26, "Could not open the last page");
  await screenshot(client, "ipad-landscape.png");

  await evaluate(client, "window.__storybookApp.goTo(1)");
  await emulate(client, 1024, 1366);
  await sleep(250);
  const portraitSquare = await evaluate(client, `(() => {
    const b = document.querySelector('#page-stage').getBoundingClientRect();
    return Math.abs(b.width - b.height);
  })()`);
  assert(portraitSquare < 2, "Portrait book stage is not square");
  await screenshot(client, "ipad-portrait.png");

  console.log(JSON.stringify({ status: "passed", layout, screenshots: ["ipad-landscape.png", "ipad-portrait.png"] }, null, 2));
  client.socket.close();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
