import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/supabase", async () => {
  const mod = await import("@/test/mock-supabase")
  return { supabase: mod.supabaseMock, isSupabaseConfigured: true }
})

const getCaptchaToken = vi.fn(
  async (): Promise<string | undefined> => undefined,
)

vi.mock("@/lib/turnstile", () => ({
  getCaptchaToken: () => getCaptchaToken(),
  getTurnstileSiteKey: () => null,
}))

import { useAuthStore } from "@/stores/auth"
import {
  emitAuthStateChange,
  mockCalls,
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
    getCaptchaToken.mockReset()
    getCaptchaToken.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("restoreSession", () => {
    it("adopts an existing anonymous session and becomes ready", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()

      await store.restoreSession()

      expect(store.isReady).toBe(true)
      expect(store.userId).toBe("anon-1")
      expect(store.isAnonymous).toBe(true)
      expect(store.isHostAuthenticated).toBe(false)
    })

    it("never mints a user when no session exists", async () => {
      setAuthSession(null)
      const store = useAuthStore()

      await store.restoreSession()

      expect(store.isReady).toBe(true)
      expect(store.userId).toBeNull()
      expect(mockCalls.auth).toEqual([])
    })

    it("exposes host identity for a non-anonymous session", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()

      await store.restoreSession()

      expect(store.isHostAuthenticated).toBe(true)
      expect(store.userEmail).toBe("host@example.com")
    })

    it("is idempotent once ready", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()
      await store.restoreSession()
      await expect(store.restoreSession()).resolves.toBeUndefined()
    })
  })

  describe("ensureIdentity", () => {
    it("signs in anonymously when no session exists", async () => {
      setAuthSession(null)
      setSignInAnonymously({
        data: { session: { user: anonUser }, user: anonUser },
      })
      const store = useAuthStore()

      await store.ensureIdentity()

      expect(store.userId).toBe("anon-1")
      expect(store.isReady).toBe(true)
    })

    it("keeps an existing session instead of minting a second user", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()

      await store.ensureIdentity()

      expect(store.userId).toBe("host-1")
      expect(mockCalls.auth).toEqual([])
    })

    it("passes a captcha token to the anonymous sign-in", async () => {
      setAuthSession(null)
      setSignInAnonymously({
        data: { session: { user: anonUser }, user: anonUser },
      })
      getCaptchaToken.mockResolvedValue("captcha-token")
      const store = useAuthStore()

      await store.ensureIdentity()

      expect(mockCalls.auth).toEqual([
        {
          name: "signInAnonymously",
          params: { options: { captchaToken: "captcha-token" } },
        },
      ])
    })
  })

  describe("waitForHostSession", () => {
    it("resolves immediately when already host-authenticated", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()
      await store.restoreSession()

      await expect(store.waitForHostSession()).resolves.toBeUndefined()
    })

    it("resolves when an auth state change upgrades to a host user", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()
      await store.restoreSession()

      const waiter = store.waitForHostSession(10_000)
      emitAuthStateChange("SIGNED_IN", { user: hostUser })

      await expect(waiter).resolves.toBeUndefined()
    })

    it("rejects after the timeout elapses", async () => {
      setAuthSession({ user: anonUser })
      const store = useAuthStore()
      await store.restoreSession()

      vi.useFakeTimers()
      const waiter = store.waitForHostSession(5000)
      const assertion = expect(waiter).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(5000)
      await assertion
    })
  })

  describe("signInWithMagicLink", () => {
    it("sends the captcha token alongside the redirect", async () => {
      getCaptchaToken.mockResolvedValue("captcha-token")
      const store = useAuthStore()

      await store.signInWithMagicLink("Host@Example.com ", "/library")

      expect(mockCalls.auth).toEqual([
        {
          name: "signInWithOtp",
          params: {
            email: "host@example.com",
            options: {
              emailRedirectTo: expect.stringContaining("/auth/callback"),
              captchaToken: "captcha-token",
            },
          },
        },
      ])
    })
  })

  describe("signOut", () => {
    it("clears the session without minting a replacement", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()
      await store.restoreSession()
      expect(store.isHostAuthenticated).toBe(true)

      await store.signOut()

      expect(store.userId).toBeNull()
      expect(store.isHostAuthenticated).toBe(false)
      expect(mockCalls.auth).toEqual([])
    })

    it("throws when sign-out fails", async () => {
      setAuthSession({ user: hostUser })
      const store = useAuthStore()
      await store.restoreSession()

      setSignOutError(new Error("sign-out failed"))
      await expect(store.signOut()).rejects.toThrow("sign-out failed")
    })
  })
})
