import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/supabase", async () => {
  const mod = await import("@/test/mock-supabase")
  return { supabase: mod.supabaseMock, isSupabaseConfigured: true }
})

import {
  clearMediaUrlCache,
  getCachedMediaUrl,
  resolveMediaUrl,
  resolveMediaUrls,
} from "@/lib/mediaUrl"
import {
  mockCalls,
  resetMockSupabase,
  setFunctionResult,
  setStoragePublicUrl,
} from "@/test/mock-supabase"

function functionCalls() {
  return mockCalls.storage.filter((call) => call.name === "function")
}

const TWO_HOURS_S = 2 * 60 * 60

function issued(paths: string[], legacy: string[] = []) {
  const expiresAt = Math.floor(Date.now() / 1000) + TWO_HOURS_S
  return {
    data: {
      urls: Object.fromEntries(
        paths.map((path) => [
          path,
          { url: `https://r2.example/${path}?signed`, expiresAt },
        ]),
      ),
      legacy,
    },
    error: null,
  }
}

describe("resolveMediaUrls", () => {
  beforeEach(() => {
    resetMockSupabase()
    clearMediaUrlCache()
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("returns presigned URLs for a batch", async () => {
    setFunctionResult("media-url", issued(["assets/a.webp", "assets/b.mp4"]))

    const resolved = await resolveMediaUrls(["assets/a.webp", "assets/b.mp4"])

    expect(resolved.get("assets/a.webp")).toBe(
      "https://r2.example/assets/a.webp?signed",
    )
    expect(resolved.get("assets/b.mp4")).toBe(
      "https://r2.example/assets/b.mp4?signed",
    )
  })

  it("passes the session id through to the function", async () => {
    setFunctionResult("media-url", issued(["assets/a.webp"]))

    await resolveMediaUrls(["assets/a.webp"], { sessionId: "session-1" })

    expect(functionCalls()).toEqual([
      {
        name: "function",
        params: {
          name: "media-url",
          options: {
            body: { paths: ["assets/a.webp"], sessionId: "session-1" },
          },
        },
      },
    ])
  })

  it("serves a cached URL without calling the function again", async () => {
    setFunctionResult("media-url", issued(["assets/a.webp"]))

    await resolveMediaUrls(["assets/a.webp"])
    await resolveMediaUrls(["assets/a.webp"])

    expect(functionCalls()).toHaveLength(1)
    expect(getCachedMediaUrl("assets/a.webp")).toBe(
      "https://r2.example/assets/a.webp?signed",
    )
  })

  it("shares one request between concurrent callers", async () => {
    setFunctionResult("media-url", issued(["assets/a.webp"]))

    const [first, second] = await Promise.all([
      resolveMediaUrl("assets/a.webp"),
      resolveMediaUrl("assets/a.webp"),
    ])

    expect(first).toBe(second)
    expect(functionCalls()).toHaveLength(1)
  })

  it("evicts a URL five minutes before it expires", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-27T10:00:00Z"))
    setFunctionResult("media-url", issued(["assets/a.webp"]))

    await resolveMediaUrls(["assets/a.webp"])
    vi.setSystemTime(new Date("2026-08-27T11:56:00Z"))
    expect(getCachedMediaUrl("assets/a.webp")).toBeNull()

    await resolveMediaUrls(["assets/a.webp"])
    expect(functionCalls()).toHaveLength(2)
  })

  it("falls back to the legacy public URL for an unmigrated asset", async () => {
    setStoragePublicUrl("https://supabase.example/legacy.webp")
    setFunctionResult("media-url", {
      data: { urls: {}, legacy: ["legacy.webp"] },
      error: null,
    })

    const resolved = await resolveMediaUrls(["legacy.webp"])

    expect(resolved.get("legacy.webp")).toBe(
      "https://supabase.example/legacy.webp",
    )
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("asset not migrated"),
    )
  })

  it("falls back without caching when the function fails", async () => {
    setStoragePublicUrl("https://supabase.example/legacy.webp")
    setFunctionResult("media-url", {
      data: null,
      error: new Error("function is down"),
    })

    const resolved = await resolveMediaUrls(["legacy.webp"])

    expect(resolved.get("legacy.webp")).toBe(
      "https://supabase.example/legacy.webp",
    )
    expect(getCachedMediaUrl("legacy.webp")).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("function is down"),
    )
  })
})
