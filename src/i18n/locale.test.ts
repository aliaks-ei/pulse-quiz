import { beforeEach, describe, expect, it } from "vitest"

import { getAppLocale, setAppLocale } from "@/i18n"
import {
  APP_LOCALE_STORAGE_KEY,
  normalizeAppLocale,
  persistAppLocale,
  readStoredAppLocale,
  resolveInitialAppLocale,
} from "@/i18n/locale"

describe("app locale helpers", () => {
  beforeEach(() => {
    localStorage.clear()
    setAppLocale("en")
  })

  it("normalizes supported locale values and rejects unsupported ones", () => {
    expect(normalizeAppLocale("EN-US")).toBe("en")
    expect(normalizeAppLocale("ru")).toBe("ru")
    expect(normalizeAppLocale("pl-PL")).toBe("pl")
    expect(normalizeAppLocale("de-DE")).toBeNull()
  })

  it("reads and persists the stored locale", () => {
    persistAppLocale("be")

    expect(readStoredAppLocale()).toBe("be")
    expect(localStorage.getItem(APP_LOCALE_STORAGE_KEY)).toBe("be")
  })

  it("prefers the stored locale, then the browser locale, then english", () => {
    localStorage.setItem(APP_LOCALE_STORAGE_KEY, "ru")
    expect(resolveInitialAppLocale({ browserLanguage: "pl-PL" })).toBe("ru")

    localStorage.clear()
    expect(resolveInitialAppLocale({ browserLanguage: "be-BY" })).toBe("be")
    expect(resolveInitialAppLocale({ browserLanguage: "de-DE" })).toBe("en")
  })

  it("updates the active locale and document language", () => {
    setAppLocale("pl")

    expect(getAppLocale()).toBe("pl")
    expect(document.documentElement.lang).toBe("pl")
    expect(localStorage.getItem(APP_LOCALE_STORAGE_KEY)).toBe("pl")
  })
})
