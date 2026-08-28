import { describe, expect, it, vi } from "vitest"

import { restoreAuthSession, signInAnonymously } from "@/lib/authBootstrap"

describe("restoreAuthSession", () => {
  it("adopts an existing session", async () => {
    const result = await restoreAuthSession({
      getSession: async () => ({
        data: {
          session: {
            user: {
              id: "existing-user",
              email: "host@example.com",
              is_anonymous: false,
            },
          },
        },
      }),
    })

    expect(result).toEqual({
      session: {
        user: {
          id: "existing-user",
          email: "host@example.com",
          is_anonymous: false,
        },
      },
      userId: "existing-user",
    })
  })

  it("reports no user when the browser holds no session", async () => {
    const result = await restoreAuthSession({
      getSession: async () => ({ data: { session: null } }),
    })

    expect(result).toEqual({ session: null, userId: null })
  })
})

describe("signInAnonymously", () => {
  it("returns the session the sign-in created", async () => {
    const result = await signInAnonymously({
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => ({
        data: {
          session: { user: { id: "new-user", is_anonymous: true } },
          user: { id: "new-user", is_anonymous: true },
        },
        error: null,
      }),
    })

    expect(result).toEqual({
      session: { user: { id: "new-user", is_anonymous: true } },
      userId: "new-user",
    })
  })

  it("forwards a captcha token when one is supplied", async () => {
    const signIn = vi.fn(async () => ({
      data: {
        session: { user: { id: "new-user", is_anonymous: true } },
        user: { id: "new-user", is_anonymous: true },
      },
      error: null,
    }))

    await signInAnonymously(
      {
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: signIn,
      },
      "captcha-token",
    )

    expect(signIn).toHaveBeenCalledWith({
      options: { captchaToken: "captcha-token" },
    })
  })

  it("omits the options object when no captcha token is available", async () => {
    const signIn = vi.fn(async () => ({
      data: {
        session: { user: { id: "new-user", is_anonymous: true } },
        user: { id: "new-user", is_anonymous: true },
      },
      error: null,
    }))

    await signInAnonymously({
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: signIn,
    })

    expect(signIn).toHaveBeenCalledWith(undefined)
  })

  it("falls back to a re-read session when the sign-in omits one", async () => {
    const result = await signInAnonymously({
      getSession: async () => ({
        data: { session: { user: { id: "re-read", is_anonymous: true } } },
      }),
      signInAnonymously: async () => ({
        data: { session: null, user: { id: "re-read", is_anonymous: true } },
        error: null,
      }),
    })

    expect(result.userId).toBe("re-read")
  })

  it("throws when the sign-in fails", async () => {
    await expect(
      signInAnonymously({
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: async () => ({
          data: { session: null, user: null },
          error: new Error("captcha required"),
        }),
      }),
    ).rejects.toThrow("captcha required")
  })
})
