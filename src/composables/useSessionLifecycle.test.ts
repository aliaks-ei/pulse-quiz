import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vue-router", () => {
  const route = {
    params: { sessionId: "s-1" },
    path: "/session/s-1/play",
    meta: {} as Record<string, unknown>,
  }
  const router = {
    currentRoute: { value: route },
    push: vi.fn(() => Promise.resolve()),
  }
  return { useRoute: () => route, useRouter: () => router }
})

vi.mock("@/stores/player", () => {
  const store = { hydrateForSession: vi.fn() }
  return { usePlayerStore: () => store }
})

vi.mock("@/stores/session", async () => {
  const { reactive } = await import("vue")
  const store = reactive({
    session: null as { id: string; phase: string } | null,
    loadSession: vi.fn(() => Promise.resolve()),
    teardown: vi.fn(),
  })
  return { useSessionStore: () => store }
})

import { useRoute, useRouter } from "vue-router"

import { useSessionLifecycle } from "@/composables/useSessionLifecycle"
import { usePlayerStore } from "@/stores/player"
import { useSessionStore } from "@/stores/session"
import { withSetup } from "@/test/pinia"

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
// The mock store assigns to `session` directly; the real store types it as a
// readonly computed, so expose a writable view for the test.
const sessionStore = useSessionStore() as unknown as {
  session: { id: string; phase: string } | null
  loadSession: ReturnType<typeof vi.fn>
  teardown: ReturnType<typeof vi.fn>
}

describe("useSessionLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStore.session = null
    route.meta = {}
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("hydrates the player and loads the session on mount", async () => {
    withSetup(() => useSessionLifecycle(), { withPinia: false })
    await flushPromises()

    expect(playerStore.hydrateForSession).toHaveBeenCalledWith("s-1")
    expect(sessionStore.loadSession).toHaveBeenCalledWith("s-1")
  })

  it("tears down the session after unmount when the route has moved on", async () => {
    vi.useFakeTimers()
    const { unmount } = withSetup(() => useSessionLifecycle(), {
      withPinia: false,
    })
    await vi.runOnlyPendingTimersAsync()

    unmount()
    await vi.advanceTimersByTimeAsync(0)

    expect(sessionStore.teardown).toHaveBeenCalledWith("s-1")
  })

  it("pushes to the canonical route when the phase changes", async () => {
    withSetup(() => useSessionLifecycle(), { withPinia: false })
    await flushPromises()

    sessionStore.session = { id: "s-1", phase: "lobby" }
    await flushPromises()

    expect(router.push).toHaveBeenCalledWith("/session/s-1/lobby")
  })
})
