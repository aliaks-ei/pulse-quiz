import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/supabase", async () => {
  const mod = await import("@/test/mock-supabase")
  return { supabase: mod.supabaseMock, isSupabaseConfigured: true }
})

import { useAuthStore } from "@/stores/auth"
import {
  emitAuthStateChange,
  resetMockSupabase,
  setAuthSession,
  setSignInAnonymously,
  setSignOutError,
} from "@/test/mock-supabase"
import { withTestPinia } from "@/test/pinia"

const anonUser = { id: "anon-1", is_anonymous: true }
const hostUser = {
  id: "host-1",
  email: "host@example.com",
  is_anonymous: false,
}

describe("auth store", () => {
  beforeEach(() => {
    withTestPinia()
    resetMockSupabase()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("bootstrap", () => {
    it("adopts an existing anonymous session and becomes ready", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()

      await store.bootstrap()

      expect(store.isReady).toBe(true)
      expect(store.userId).toBe("anon-1")
      expect(store.isAnonymous).toBe(true)
      expect(store.isHostAuthenticated).toBe(false)
    })

    it("signs in anonymously when no session exists", async () => {
      setAuthSession(null)
      setSignInAnonymously({
        data: { session: { user: anonUser }, user: anonUser },
      })
      const store = useAuthStore()

      await store.bootstrap()

      expect(store.userId).toBe("anon-1")
      expect(store.isReady).toBe(true)
    })

    it("exposes host identity for a non-anonymous session", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()

      await store.bootstrap()

      expect(store.isHostAuthenticated).toBe(true)
      expect(store.userEmail).toBe("host@example.com")
    })

    it("is idempotent once ready", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()
      await store.bootstrap()
      await expect(store.bootstrap()).resolves.toBeUndefined()
    })
  })

  describe("waitForHostSession", () => {
    it("resolves immediately when already host-authenticated", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()
      await store.bootstrap()

      await expect(store.waitForHostSession()).resolves.toBeUndefined()
    })

    it("resolves when an auth state change upgrades to a host user", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()
      await store.bootstrap()

      const waiter = store.waitForHostSession(10_000)
      emitAuthStateChange("SIGNED_IN", { user: hostUser })

      await expect(waiter).resolves.toBeUndefined()
    })

    it("rejects after the timeout elapses", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()
      await store.bootstrap()

      vi.useFakeTimers()
      const waiter = store.waitForHostSession(5000)
      const assertion = expect(waiter).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(5000)
      await assertion
    })
  })

  describe("signOutToAnonymous", () => {
    it("signs out then re-establishes an anonymous session", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()
      await store.bootstrap()
      expect(store.isHostAuthenticated).toBe(true)

      setAuthSession({ user: anonUser })
      await store.signOutToAnonymous()

      expect(store.isAnonymous).toBe(true)
      expect(store.isHostAuthenticated).toBe(false)
    })

    it("throws when sign-out fails", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()
      await store.bootstrap()

      setSignOutError(new Error("sign-out failed"))
      await expect(store.signOutToAnonymous()).rejects.toThrow(
        "sign-out failed",
      )
    })
  })
})
