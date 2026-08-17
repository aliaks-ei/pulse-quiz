import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { withTimeout } from "@/lib/withTimeout"

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves with the value when the promise settles before the timeout", async () => {
    const result = withTimeout(Promise.resolve("ok"), 1000, "load")
    await expect(result).resolves.toBe("ok")
  })

  it("rejects with a labelled timeout error when the promise is too slow", async () => {
    const never = new Promise<string>(() => {})
    const result = withTimeout(never, 1000, "load")
    const assertion = expect(result).rejects.toThrow("load timed out")

    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it("propagates the original rejection before the timeout fires", async () => {
    const result = withTimeout(Promise.reject(new Error("boom")), 1000, "load")
    await expect(result).rejects.toThrow("boom")
  })

  it("clears the timeout timer once settled", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout")
    await withTimeout(Promise.resolve("ok"), 1000, "load")
    expect(clearSpy).toHaveBeenCalled()
  })
})
