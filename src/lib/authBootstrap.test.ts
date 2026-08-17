import { describe, expect, it, vi } from "vitest"

import { bootstrapAuthSession } from "@/lib/authBootstrap"

describe("bootstrapAuthSession", () => {
  it("reuses an existing permanent session without signing in again", async () => {
    const signInAnonymously = vi.fn()

    const result = await bootstrapAuthSession({
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
      signInAnonymously,
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
      didSignInAnonymously: false,
    })
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  it("signs in anonymously when no session is present", async () => {
    const result = await bootstrapAuthSession({
      getSession: async () => ({
        data: {
          session: null,
        },
      }),
      signInAnonymously: async () => ({
        data: {
          session: {
            user: {
              id: "new-user",
              is_anonymous: true,
            },
          },
          user: {
            id: "new-user",
            is_anonymous: true,
          },
        },
        error: null,
      }),
    })

    expect(result).toEqual({
      session: {
        user: {
          id: "new-user",
          is_anonymous: true,
        },
      },
      userId: "new-user",
      didSignInAnonymously: true,
    })
  })
})
