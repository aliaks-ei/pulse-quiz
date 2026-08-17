import { describe, expect, it, vi } from "vitest"

vi.mock("motion-v", () => import("@/test/motion-stub"))

import HostControls from "@/components/play/HostControls.vue"
import { translate } from "@/i18n"
import { mountWithApp } from "@/test/pinia"

const baseProps = {
  advanceLabel: "Next",
  isQuestionActive: false,
  canPause: true,
  actionError: null as string | null,
  isAdvancing: false,
  isPausing: false,
  isResuming: false,
  timerStartIso: null as string | null,
  timerEndIso: null as string | null,
  isPaused: false,
}

const buttonByText = (wrapper: ReturnType<typeof mountWithApp>, text: string) =>
  wrapper.findAll("button").find((b) => b.text().includes(text))

describe("HostControls", () => {
  it("emits advance when the advance button is clicked", async () => {
    const wrapper = mountWithApp(HostControls, { props: { ...baseProps } })
    await buttonByText(wrapper, "Next")?.trigger("click")
    expect(wrapper.emitted("advance")).toHaveLength(1)
  })

  it("shows the moving label and disables advance while advancing", () => {
    const wrapper = mountWithApp(HostControls, {
      props: { ...baseProps, isAdvancing: true },
    })
    const advance = buttonByText(wrapper, translate("hostControls.moving"))
    expect(advance).toBeDefined()
    expect(advance?.attributes("disabled")).toBeDefined()
  })

  it("emits pause when not in a question and not paused", async () => {
    const wrapper = mountWithApp(HostControls, { props: { ...baseProps } })
    await buttonByText(wrapper, translate("hostControls.pause"))?.trigger(
      "click",
    )
    expect(wrapper.emitted("pause")).toHaveLength(1)
  })

  it("emits resume when paused", async () => {
    const wrapper = mountWithApp(HostControls, {
      props: { ...baseProps, isPaused: true },
    })
    await buttonByText(wrapper, translate("hostControls.resume"))?.trigger(
      "click",
    )
    expect(wrapper.emitted("resume")).toHaveLength(1)
  })

  it("hides pause/resume controls during an active question", () => {
    const wrapper = mountWithApp(HostControls, {
      props: { ...baseProps, isQuestionActive: true },
    })
    expect(
      buttonByText(wrapper, translate("hostControls.pause")),
    ).toBeUndefined()
    expect(
      buttonByText(wrapper, translate("hostControls.resume")),
    ).toBeUndefined()
  })

  it("renders an action error alert", () => {
    const wrapper = mountWithApp(HostControls, {
      props: { ...baseProps, actionError: "Something broke" },
    })
    expect(wrapper.get('[role="alert"]').text()).toBe("Something broke")
  })
})
