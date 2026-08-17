import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ConnectionIndicator from "@/components/play/ConnectionIndicator.vue"
import { mountWithApp } from "@/test/pinia"

describe("ConnectionIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stays hidden while connected", () => {
    const wrapper = mountWithApp(ConnectionIndicator, {
      props: { status: "connecting" },
    })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it("reveals the offline banner 1.5s after going disconnected", async () => {
    const wrapper = mountWithApp(ConnectionIndicator, {
      props: { status: "connecting" },
    })

    await wrapper.setProps({ status: "disconnected" })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it("hides immediately when the connection recovers", async () => {
    const wrapper = mountWithApp(ConnectionIndicator, {
      props: { status: "disconnected" },
    })
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)

    await wrapper.setProps({ status: "connected" })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it("cancels the pending reveal if reconnected within the delay", async () => {
    const wrapper = mountWithApp(ConnectionIndicator, {
      props: { status: "disconnected" },
    })
    await vi.advanceTimersByTimeAsync(500)
    await wrapper.setProps({ status: "connected" })
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
