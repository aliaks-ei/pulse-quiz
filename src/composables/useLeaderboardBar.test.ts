import { describe, expect, it } from "vitest"
import { ref } from "vue"

import { useLeaderboardBar } from "@/composables/useLeaderboardBar"
import { withSetup } from "@/test/pinia"

type Entry = { score: number }

describe("useLeaderboardBar", () => {
  it("computes a score ceiling of at least 1", () => {
    const { result } = withSetup(() =>
      useLeaderboardBar(ref<Entry[]>([]), (e) => e.score),
    )
    expect(result.scoreCeiling.value).toBe(1)
  })

  it("fills relative to the top score with a minimum width", () => {
    const entries = ref<Entry[]>([{ score: 100 }, { score: 25 }, { score: 0 }])
    const { result } = withSetup(() =>
      useLeaderboardBar(entries, (e) => e.score, { minWidthPct: 24 }),
    )

    expect(result.scoreCeiling.value).toBe(100)
    expect(result.scoreFill(100)).toBe("100%")
    expect(result.scoreFill(50)).toBe("50%")
    // below the minimum width threshold, clamps up
    expect(result.scoreFill(0)).toBe("24%")
  })

  it("cycles accent colors by index", () => {
    const { result } = withSetup(() =>
      useLeaderboardBar(ref<Entry[]>([]), (e) => e.score),
    )
    expect(result.accent(0)).toBe(result.accent(5))
    expect(result.accent(1)).not.toBe(result.accent(0))
  })

  it("accepts a getter for entries", () => {
    const { result } = withSetup(() =>
      useLeaderboardBar(
        () => [{ score: 10 }, { score: 40 }],
        (e) => e.score,
      ),
    )
    expect(result.scoreCeiling.value).toBe(40)
  })
})
