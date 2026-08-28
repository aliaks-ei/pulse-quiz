import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

function setSiteKey(value: string | undefined) {
  if (value === undefined) {
    delete import.meta.env.VITE_TURNSTILE_SITE_KEY
    return
  }
  import.meta.env.VITE_TURNSTILE_SITE_KEY = value
}

async function importFresh() {
  vi.resetModules()
  return import("@/lib/turnstile")
}

describe("turnstile", () => {
  beforeEach(() => {
    delete window.turnstile
    document.head.innerHTML = ""
    document.body.innerHTML = ""
  })

  afterEach(() => {
    setSiteKey(originalSiteKey)
    delete window.turnstile
  })

  it("reports no sitekey when the variable is unset", async () => {
    setSiteKey(undefined)
    const { getTurnstileSiteKey } = await importFresh()

    expect(getTurnstileSiteKey()).toBeNull()
  })

  it("treats a blank sitekey as unset", async () => {
    setSiteKey("   ")
    const { getTurnstileSiteKey } = await importFresh()

    expect(getTurnstileSiteKey()).toBeNull()
  })

  it("skips the challenge entirely when no sitekey is configured", async () => {
    setSiteKey(undefined)
    const { getCaptchaToken } = await importFresh()

    await expect(getCaptchaToken()).resolves.toBeUndefined()
    expect(document.head.querySelector("script")).toBeNull()
  })

  it("resolves the token the widget produces and cleans up after itself", async () => {
    setSiteKey("test-sitekey")
    window.turnstile = {
      render: (_container, options) => {
        options.callback("solved-token")
        return "widget-1"
      },
      remove: vi.fn(),
    }
    const { getCaptchaToken } = await importFresh()

    await expect(getCaptchaToken()).resolves.toBe("solved-token")
    expect(window.turnstile.remove).toHaveBeenCalledWith("widget-1")
    expect(document.querySelector("[data-turnstile]")).toBeNull()
  })

  it("resolves undefined when the widget errors so the server decides", async () => {
    setSiteKey("test-sitekey")
    window.turnstile = {
      render: (_container, options) => {
        options["error-callback"]("network")
        return "widget-1"
      },
      remove: vi.fn(),
    }
    const { getCaptchaToken } = await importFresh()

    await expect(getCaptchaToken()).resolves.toBeUndefined()
  })

  it("resolves undefined when the script fails to load", async () => {
    setSiteKey("test-sitekey")
    const { getCaptchaToken } = await importFresh()

    const pending = getCaptchaToken()
    await vi.waitFor(() => {
      const script = document.head.querySelector("script")
      expect(script).not.toBeNull()
      script?.dispatchEvent(new Event("error"))
    })

    await expect(pending).resolves.toBeUndefined()
  })
})
