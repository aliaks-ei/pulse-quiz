import { describe, expect, it } from "vitest"

import Button from "@/components/ui/Button.vue"
import { mountWithApp } from "@/test/pinia"

describe("Button", () => {
  it("renders a button element by default with slot content", () => {
    const wrapper = mountWithApp(Button, { slots: { default: "Go" } })
    expect(wrapper.find("button").exists()).toBe(true)
    expect(wrapper.text()).toBe("Go")
  })

  it("applies the type and disabled attributes", () => {
    const wrapper = mountWithApp(Button, {
      props: { type: "submit", disabled: true },
    })
    const button = wrapper.get("button")
    expect(button.attributes("type")).toBe("submit")
    expect(button.attributes("disabled")).toBeDefined()
  })

  it("emits click events through forwarded attrs", async () => {
    const wrapper = mountWithApp(Button)
    await wrapper.get("button").trigger("click")
    expect(wrapper.emitted("click")).toHaveLength(1)
  })

  it("renders a RouterLink (stubbed anchor) when given a `to` target", () => {
    const wrapper = mountWithApp(Button, {
      props: { to: "/library" },
      slots: { default: "Home" },
    })
    expect(wrapper.find("button").exists()).toBe(false)
    expect(wrapper.find("a").exists()).toBe(true)
  })

  it("includes variant- and size-specific utility classes", () => {
    const wrapper = mountWithApp(Button, {
      props: { variant: "danger", size: "lg" },
    })
    const cls = wrapper.get("button").classes().join(" ")
    expect(cls).toContain("bg-destructive")
    expect(cls).toContain("h-12.5")
  })
})
