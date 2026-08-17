import { describe, expect, it } from "vitest"
import { ref } from "vue"

import { useFrameTimer } from "@/composables/useFrameTimer"
import { withSetup } from "@/test/pinia"

const iso = (ms: number) => new Date(ms).toISOString()

describe("useFrameTimer", () => {
  it("returns 0 remaining when there is no target", () => {
    const { result } = withSetup(() =>
      useFrameTimer(ref<string | null>(null), ref(false), () => 1000),
    )
    expect(result.remainingMs.value).toBe(0)
  })

  it("computes remaining time from the target and injected clock", () => {
    const { result } = withSetup(() =>
      useFrameTimer(ref(iso(6000)), ref(false), () => 1000),
    )
    expect(result.remainingMs.value).toBe(5000)
  })

  it("clamps to 0 once the target has passed", () => {
    const { result } = withSetup(() =>
      useFrameTimer(ref(iso(6000)), ref(false), () => 10_000),
    )
    expect(result.remainingMs.value).toBe(0)
  })
})
