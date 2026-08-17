import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSessionTimer } from "@/composables/useSessionTimer"
import { withSetup } from "@/test/pinia"

const iso = (ms: number) => new Date(ms).toISOString()

describe("useSessionTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 0 for a null target", () => {
    const { result } = withSetup(() => useSessionTimer(() => null))
    expect(result.remainingMs.value).toBe(0)
    expect(result.remainingSeconds.value).toBe(0)
  })

  it("derives remaining ms and ceil-rounded seconds from the server clock", () => {
    const { result } = withSetup(() => useSessionTimer(() => iso(6000)))
    expect(result.remainingMs.value).toBe(5000)
    expect(result.remainingSeconds.value).toBe(5)
  })

  it("never reports negative remaining time", () => {
    const { result } = withSetup(() => useSessionTimer(() => iso(500)))
    expect(result.remainingMs.value).toBe(0)
  })
})
