import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { backoffDelay, withBackoff } from "@/lib/retry"

describe("backoffDelay", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("doubles the base delay each attempt", () => {
    expect(backoffDelay(0, { baseMs: 100, jitter: false })).toBe(100)
    expect(backoffDelay(1, { baseMs: 100, jitter: false })).toBe(200)
    expect(backoffDelay(2, { baseMs: 100, jitter: false })).toBe(400)
  })

  it("clamps to the configured maximum", () => {
    expect(backoffDelay(8, { baseMs: 100, maxMs: 1000, jitter: false })).toBe(
      1000,
    )
  })

  it("applies jitter in the 50-100% band", () => {
    const value = backoffDelay(2, { baseMs: 100 })
    expect(value).toBeGreaterThanOrEqual(200)
    expect(value).toBeLessThanOrEqual(400)
  })
})

describe("withBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    await expect(withBackoff(fn)).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries failing attempts up to the limit", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValueOnce("done")

    const promise = withBackoff(fn, { retries: 3, baseMs: 1, jitter: false })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBe("done")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("rethrows when retries are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"))
    const promise = withBackoff(fn, { retries: 2, baseMs: 1, jitter: false })
    const assertion = expect(promise).rejects.toThrow("boom")
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("stops retrying when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"))
    const promise = withBackoff(fn, {
      retries: 5,
      baseMs: 1,
      jitter: false,
      shouldRetry: () => false,
    })
    const assertion = expect(promise).rejects.toThrow("permanent")
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
