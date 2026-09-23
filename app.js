(() => {
  "use strict";

  const story = window.STORYBOOK;
  if (!story || !Array.isArray(story.pages) || story.pages.length === 0) {
    document.body.textContent = "그림책 데이터를 불러오지 못했습니다.";
    return;
  }

  const app = document.querySelector("#app");
  const stage = document.querySelector("#page-stage");
  const currentPage = document.querySelector("#book-page");
  const previousButton = document.querySelector("#previous-button");
  const nextButton = document.querySelector("#next-button");
  const focusButton = document.querySelector("#focus-button");
  const pageStatus = document.querySelector("#page-status");
  const pageSlider = document.querySelector("#page-slider");
  const gestureHint = document.querySelector("#gesture-hint");
  const bookTitle = document.querySelector("#book-title");

  const totalPages = story.pages.length;
  const storageKey = "jion-storybook-page-v2";
  const storedPage = Number.parseInt(localStorage.getItem(storageKey) || "1", 10);
  let pageIndex = Number.isFinite(storedPage)
    ? Math.min(Math.max(storedPage - 1, 0), totalPages - 1)
    : 0;
  let isTurning = false;
  let pointerStart = null;
  let hintTimer = null;

  bookTitle.textContent = story.title;
  document.title = story.title;
  pageSlider.max = String(totalPages);

  function fillPage(pageElement, page) {
    const image = pageElement.querySelector(".page-art");
    const text = pageElement.querySelector(".page-text");
    const isDedication = page.kind === "dedication";
    pageElement.classList.toggle("is-dedication", isDedication);
    if (page.image) {
      image.src = page.image;
      image.alt = `${page.number}쪽 삽화`;
    } else {
      image.removeAttribute("src");
      image.alt = "";
    }
    image.draggable = false;
    text.textContent = page.text;
    pageElement.setAttribute("aria-label", isDedication ? "생일 축하 메시지" : `${page.number}쪽`);
  }

  function preloadAround(index) {
    [index - 1, index + 1, index + 2]
      .filter((candidate) => candidate >= 0 && candidate < totalPages)
      .forEach((candidate) => {
        if (!story.pages[candidate].image) return;
        const image = new Image();
        image.src = story.pages[candidate].image;
      });
  }

  function updateControls() {
    const pageNumber = pageIndex + 1;
    app.dataset.page = String(pageNumber);
    pageStatus.textContent = `${pageNumber} / ${totalPages}`;
    pageSlider.value = String(pageNumber);
    previousButton.disabled = pageIndex === 0;
    nextButton.disabled = pageIndex === totalPages - 1;
    localStorage.setItem(storageKey, String(pageNumber));
    preloadAround(pageIndex);
  }

  function bumpBoundary(button) {
    button.classList.remove("boundary-bump");
    void button.offsetWidth;
    button.classList.add("boundary-bump");
  }

  function goToPage(targetIndex, direction = "next", animate = true) {
    if (isTurning) return;
    if (targetIndex < 0) {
      bumpBoundary(previousButton);
      return;
    }
    if (targetIndex >= totalPages) {
      bumpBoundary(nextButton);
      return;
    }
    if (targetIndex === pageIndex) return;

    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pageIndex = targetIndex;
      fillPage(currentPage, story.pages[pageIndex]);
      updateControls();
      return;
    }

    isTurning = true;
    const leavingPage = currentPage.cloneNode(true);
    leavingPage.removeAttribute("id");
    leavingPage.setAttribute("aria-hidden", "true");
    leavingPage.classList.add("turning-layer", direction === "previous" ? "flip-previous" : "flip-next");
    stage.appendChild(leavingPage);

    pageIndex = targetIndex;
    fillPage(currentPage, story.pages[pageIndex]);
    updateControls();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => leavingPage.classList.add("is-flipping"));
    });

    window.setTimeout(() => {
      leavingPage.remove();
      isTurning = false;
    }, 680);
  }

  function showHint() {
    window.clearTimeout(hintTimer);
    gestureHint.classList.add("is-visible");
    hintTimer = window.setTimeout(() => gestureHint.classList.remove("is-visible"), 2800);
  }

  previousButton.addEventListener("click", () => goToPage(pageIndex - 1, "previous"));
  nextButton.addEventListener("click", () => goToPage(pageIndex + 1, "next"));

  pageSlider.addEventListener("change", (event) => {
    const target = Number.parseInt(event.currentTarget.value, 10) - 1;
    goToPage(target, target < pageIndex ? "previous" : "next");
  });

  focusButton.addEventListener("click", async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      document.body.classList.remove("focus-mode");
      focusButton.setAttribute("aria-label", "책 화면 크게 보기");
      return;
    }

    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        focusButton.setAttribute("aria-label", "큰 화면 닫기");
        return;
      } catch {
        // iPad Safari may reject element fullscreen; use the in-app focus mode below.
      }
    }

    const enabled = document.body.classList.toggle("focus-mode");
    focusButton.setAttribute("aria-label", enabled ? "큰 화면 닫기" : "책 화면 크게 보기");
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      focusButton.setAttribute("aria-label", "책 화면 크게 보기");
    }
  });

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
    stage.setPointerCapture?.(event.pointerId);
  });

  stage.addEventListener("pointerup", (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    const elapsed = performance.now() - pointerStart.time;
    const start = pointerStart;
    pointerStart = null;

    if (Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      goToPage(deltaX < 0 ? pageIndex + 1 : pageIndex - 1, deltaX < 0 ? "next" : "previous");
      return;
    }

    if (elapsed < 420 && Math.abs(deltaX) < 14 && Math.abs(deltaY) < 14) {
      const bounds = stage.getBoundingClientRect();
      const relativeX = start.x - bounds.left;
      if (relativeX < bounds.width * 0.4) {
        goToPage(pageIndex - 1, "previous");
      } else if (relativeX > bounds.width * 0.6) {
        goToPage(pageIndex + 1, "next");
      }
    }
  });

  stage.addEventListener("pointercancel", () => {
    pointerStart = null;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      goToPage(pageIndex + 1, "next");
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToPage(pageIndex - 1, "previous");
    } else if (event.key === "Home") {
      event.preventDefault();
      goToPage(0, "previous");
    } else if (event.key === "End") {
      event.preventDefault();
      goToPage(totalPages - 1, "next");
    }
  });

  function isAdultControl(target) {
    return target instanceof Element && Boolean(target.closest("[data-adult-control]"));
  }

  ["contextmenu", "dragstart", "selectstart", "copy", "cut", "paste"].forEach((eventName) => {
    document.addEventListener(
      eventName,
      (event) => {
        if (!isAdultControl(event.target)) event.preventDefault();
      },
      { capture: true }
    );
  });

  document.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length > 1 && !isAdultControl(event.target)) event.preventDefault();
    },
    { passive: false, capture: true }
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1 && !isAdultControl(event.target)) event.preventDefault();
    },
    { passive: false, capture: true }
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      if (isAdultControl(event.target)) return;
      const now = performance.now();
      if (now - lastTouchEnd < 320) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false, capture: true }
  );

  ["gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), {
      passive: false,
      capture: true,
    });
  });

  fillPage(currentPage, story.pages[pageIndex]);
  updateControls();
  window.setTimeout(showHint, 500);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  window.__storybookApp = {
    get currentPage() {
      return pageIndex + 1;
    },
    get totalPages() {
      return totalPages;
    },
    goTo(pageNumber) {
      const target = Math.min(Math.max(Number(pageNumber) - 1, 0), totalPages - 1);
      goToPage(target, target < pageIndex ? "previous" : "next", false);
    },
  };
})();
