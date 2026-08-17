import { describe, expect, it } from "vitest"

import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { withSetup } from "@/test/pinia"

// jsdom's stubbed matchMedia reports matches:false, so reduced-motion and the
// compact viewport are both off — the "full motion" branch.

describe("useMotionPreferences", () => {
  it("allows ambient motion when nothing requests gentle motion", () => {
    const { result } = withSetup(() => useMotionPreferences())
    expect(result.useGentleMotion.value).toBe(false)
    expect(result.allowAmbientMotion.value).toBe(true)
    expect(result.isCompactViewport.value).toBe(false)
  })

  it("builds a full-motion enter transition with the requested delay", () => {
    const { result } = withSetup(() => useMotionPreferences())
    const transition = result.enter(0.1, 30)

    expect(transition.initial.y).toBe(30)
    expect(transition.animate.y).toBe(0)
    expect(transition.exit.y).toBe(-14)
    expect(transition.transition.delay).toBe(0.1)
    expect(transition.transition.duration).toBe(0.42)
  })

  it("uses the default offset when none is supplied", () => {
    const { result } = withSetup(() => useMotionPreferences())
    expect(result.enter().initial.y).toBe(22)
  })
})
