import { describe, expect, it } from "vitest"

import LeaderboardRow from "@/components/play/LeaderboardRow.vue"
import { mountWithApp } from "@/test/pinia"

function mount(props: Record<string, unknown> = {}) {
  return mountWithApp(LeaderboardRow, {
    props: {
      name: "Ada",
      primary: 120,
      fillWidth: "60%",
      accent: "#cf7b52",
      ...props,
    },
    global: { stubs: { AvatarPortrait: true } },
  })
}

describe("LeaderboardRow", () => {
  it("renders the name and primary score", () => {
    const wrapper = mount()
    expect(wrapper.text()).toContain("Ada")
    expect(wrapper.text()).toContain("120")
  })

  it("shows the rank when provided", () => {
    const wrapper = mount({ rank: 3 })
    expect(wrapper.text()).toContain("#3")
  })

  it("omits the rank marker when rank is null", () => {
    const wrapper = mount({ rank: null })
    expect(wrapper.text()).not.toContain("#")
  })

  it("applies the fill width on the score bar", () => {
    const wrapper = mount({ fillWidth: "42%" })
    const filled = wrapper
      .findAll("div")
      .find((d) => d.attributes("style")?.includes("width"))
    expect(filled?.attributes("style")).toContain("42%")
  })

  it("renders the current-player label only when current", () => {
    const without = mount({ currentLabel: "You", isCurrent: false })
    expect(without.text()).not.toContain("You")

    const withLabel = mount({ currentLabel: "You", isCurrent: true })
    expect(withLabel.text()).toContain("You")
  })

  it("renders a secondary line when supplied", () => {
    const wrapper = mount({ secondary: "Last round" })
    expect(wrapper.text()).toContain("Last round")
  })
})
