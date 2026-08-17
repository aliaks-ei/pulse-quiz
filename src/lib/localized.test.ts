import { describe, expect, it } from "vitest"

import { computeSourceHash, pickLocalized } from "@/lib/localized"
import type { I18nMap } from "@/types/domain"

describe("pickLocalized", () => {
  it("returns primary text when viewer locale equals primary", () => {
    const result = pickLocalized("Hello", {}, "en", "en")
    expect(result).toEqual({ text: "Hello", isFallback: false })
  })

  it("returns translated text when viewer has a non-empty translation", () => {
    const i18n: I18nMap = {
      ru: { text: "Привет", sourceHash: "abc" },
    }
    const result = pickLocalized("Hello", i18n, "ru", "en")
    expect(result).toEqual({ text: "Привет", isFallback: false })
  })

  it("falls back to primary when viewer locale has no entry", () => {
    const result = pickLocalized("Hello", {}, "ru", "en")
    expect(result).toEqual({ text: "Hello", isFallback: true })
  })

  it("falls back to primary when translation entry is null", () => {
    const i18n: I18nMap = { ru: null }
    const result = pickLocalized("Hello", i18n, "ru", "en")
    expect(result).toEqual({ text: "Hello", isFallback: true })
  })

  it("falls back to primary when translation text is empty string", () => {
    const i18n: I18nMap = { ru: { text: "", sourceHash: "abc" } }
    const result = pickLocalized("Hello", i18n, "ru", "en")
    expect(result).toEqual({ text: "Hello", isFallback: true })
  })

  it("returns stale translations as-is", () => {
    const i18n: I18nMap = {
      ru: { text: "Привет", sourceHash: "old-hash" },
    }
    const result = pickLocalized("Hello WORLD", i18n, "ru", "en")
    expect(result).toEqual({ text: "Привет", isFallback: false })
  })
})

describe("computeSourceHash", () => {
  it("returns a deterministic hex string for the same input", () => {
    const a = computeSourceHash("Hello")
    const b = computeSourceHash("Hello")
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}$/)
  })

  it("treats whitespace edits as different inputs", () => {
    expect(computeSourceHash("Hello")).not.toBe(computeSourceHash("Hello "))
  })

  it("returns different hashes for different content", () => {
    expect(computeSourceHash("Hello")).not.toBe(computeSourceHash("World"))
  })
})
