import { describe, expect, it } from "vitest"

import StaleBadge from "@/components/gameBuilder/StaleBadge.vue"
import { translate } from "@/i18n"
import { mountWithApp } from "@/test/pinia"

describe("StaleBadge", () => {
  it("renders the localized stale label with a status role", () => {
    const wrapper = mountWithApp(StaleBadge)
    const label = translate("builder.translations.staleBadge")

    expect(wrapper.get('[role="status"]').text()).toContain(label)
    expect(wrapper.get('[role="status"]').attributes("title")).toBe(label)
  })
})
