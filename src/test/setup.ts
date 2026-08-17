import { afterEach, vi } from "vitest"

// jsdom doesn't implement matchMedia; useMotionPreferences and motion-v read it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

// jsdom lacks ResizeObserver; some motion-aware components instantiate it.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom doesn't implement scrollTo; the leaderboard/scroll helpers call it.
if (!window.scrollTo) {
  window.scrollTo = (() => {}) as typeof window.scrollTo
}

// requestAnimationFrame in jsdom is flaky under fake timers; route it through
// a timeout so useFrameTimer behaves deterministically when not faked.
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(
      () => cb(performance.now?.() ?? 0),
      16,
    ) as unknown as number) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as typeof cancelAnimationFrame
}

afterEach(() => {
  // Each test owns its own mocks/timers; never leak between tests.
  vi.clearAllMocks()
  localStorage.clear()
})
