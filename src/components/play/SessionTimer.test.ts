import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import SessionTimer from "@/components/play/SessionTimer.vue"
import { translate } from "@/i18n"
import { mountWithApp } from "@/test/pinia"

const iso = (ms: number) => new Date(ms).toISOString()

describe("SessionTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the remaining seconds in ring mode", () => {
    const wrapper = mountWithApp(SessionTimer, {
      props: { startIso: iso(1000), endIso: iso(6000), isPaused: false },
    })
    expect(wrapper.get('[role="timer"]').text()).toBe("0:05")
  })

  it("shows the paused label when paused", () => {
    const wrapper = mountWithApp(SessionTimer, {
      props: { startIso: iso(1000), endIso: iso(6000), isPaused: true },
    })
    expect(wrapper.get('[role="timer"]').text()).toBe(translate("timer.paused"))
  })

  it("renders a progress bar in bar mode", () => {
    const wrapper = mountWithApp(SessionTimer, {
      props: {
        startIso: iso(1000),
        endIso: iso(6000),
        isPaused: false,
        mode: "bar",
      },
    })
    expect(wrapper.find('[role="timer"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("0:05")
  })
})
