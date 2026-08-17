import { describe, expect, it } from "vitest"

import { cn, formatSeconds, normalizeNextPath } from "@/lib/utils"

describe("cn", () => {
  it("joins truthy class values", () => {
    expect(cn("a", "b")).toBe("a b")
  })

  it("drops falsy values and dedupes conflicting tailwind classes", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b")
    // tailwind-merge: later wins for conflicting utilities
    expect(cn("px-2", "px-4")).toBe("px-4")
  })
})

describe("formatSeconds", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatSeconds(0)).toBe("0:00")
    expect(formatSeconds(5)).toBe("0:05")
    expect(formatSeconds(65)).toBe("1:05")
    expect(formatSeconds(600)).toBe("10:00")
  })

  it("floors fractional input and clamps negatives to zero", () => {
    expect(formatSeconds(9.9)).toBe("0:09")
    expect(formatSeconds(-10)).toBe("0:00")
  })
})

describe("normalizeNextPath", () => {
  it("returns valid absolute single-segment paths", () => {
    expect(normalizeNextPath("/play")).toBe("/play")
  })

  it("uses the first entry when given an array", () => {
    expect(normalizeNextPath(["/library", "/play"])).toBe("/library")
  })

  it("falls back for missing, relative, or protocol-relative paths", () => {
    expect(normalizeNextPath(null)).toBe("/library")
    expect(normalizeNextPath(undefined)).toBe("/library")
    expect(normalizeNextPath("relative")).toBe("/library")
    expect(normalizeNextPath("//evil.com")).toBe("/library")
  })

  it("honours a custom fallback", () => {
    expect(normalizeNextPath(null, "/auth")).toBe("/auth")
  })
})
