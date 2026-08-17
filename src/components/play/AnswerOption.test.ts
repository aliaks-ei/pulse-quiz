import { describe, expect, it, vi } from "vitest"

vi.mock("motion-v", () => import("@/test/motion-stub"))

import AnswerOption from "@/components/play/AnswerOption.vue"
import { mountWithApp } from "@/test/pinia"

describe("AnswerOption", () => {
  it("renders slot content inside a button", () => {
    const wrapper = mountWithApp(AnswerOption, {
      slots: { default: "Answer A" },
    })
    expect(wrapper.get("button").text()).toBe("Answer A")
  })

  it("is disabled unless interactive", () => {
    const idle = mountWithApp(AnswerOption)
    expect(idle.get("button").attributes("disabled")).toBeDefined()

    const interactive = mountWithApp(AnswerOption, {
      props: { interactive: true },
    })
    expect(interactive.get("button").attributes("disabled")).toBeUndefined()
  })

  it("stays disabled when interactive but explicitly disabled", () => {
    const wrapper = mountWithApp(AnswerOption, {
      props: { interactive: true, disabled: true },
    })
    expect(wrapper.get("button").attributes("disabled")).toBeDefined()
  })

  it("reflects the selected state in its classes", () => {
    const wrapper = mountWithApp(AnswerOption, { props: { state: "selected" } })
    expect(wrapper.get("button").classes().join(" ")).toContain(
      "ring-primary/32",
    )
  })

  it("reflects success and danger states", () => {
    const success = mountWithApp(AnswerOption, { props: { state: "success" } })
    expect(success.get("button").classes().join(" ")).toContain("#455643")

    const danger = mountWithApp(AnswerOption, { props: { state: "danger" } })
    expect(danger.get("button").classes().join(" ")).toContain("#7d4242")
  })
})
