import { describe, expect, it } from "vitest"

import LanguageTabStrip from "@/components/gameBuilder/LanguageTabStrip.vue"
import { appLocaleOptions, type AppLocale } from "@/i18n/locale"
import { translate } from "@/i18n"
import { mountWithApp } from "@/test/pinia"

type Counts = Record<AppLocale, number>
type Flags = Record<AppLocale, boolean>

const zeroCounts = (): Counts => ({ en: 0, ru: 0, be: 0, pl: 0 })
const noFlags = (): Flags => ({ en: false, ru: false, be: false, pl: false })

function mount(
  overrides: Partial<{
    activeLocale: AppLocale
    primaryLocale: AppLocale
    staleByLocale: Flags
    emptyByLocale: Counts
    pendingItemByLocale: Counts
    staleCountByLocale: Counts
  }> = {},
) {
  return mountWithApp(LanguageTabStrip, {
    props: {
      activeLocale: "ru",
      primaryLocale: "en",
      staleByLocale: noFlags(),
      emptyByLocale: zeroCounts(),
      pendingItemByLocale: zeroCounts(),
      staleCountByLocale: zeroCounts(),
      ...overrides,
    },
  })
}

describe("LanguageTabStrip", () => {
  it("renders a tab per locale and emits select on click", async () => {
    const wrapper = mount()
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(appLocaleOptions.length)

    await tabs[2].trigger("click")
    expect(wrapper.emitted("select")?.[0]).toEqual([appLocaleOptions[2].code])
  })

  it("labels the bulk action for stale items", () => {
    const wrapper = mount({
      staleCountByLocale: { ...zeroCounts(), ru: 3 },
      pendingItemByLocale: { ...zeroCounts(), ru: 3 },
    })
    const label = translate("builder.translations.bulkRetranslate", {
      count: 3,
    })
    expect(wrapper.text()).toContain(label)
  })

  it("labels the bulk action for empty items when none are stale", () => {
    const wrapper = mount({
      emptyByLocale: { ...zeroCounts(), ru: 2 },
      pendingItemByLocale: { ...zeroCounts(), ru: 2 },
    })
    expect(wrapper.text()).toContain(
      translate("builder.translations.bulkEmpty", { count: 2 }),
    )
  })

  it("disables the bulk action when nothing is pending", () => {
    const wrapper = mount()
    const bulk = wrapper
      .findAll("button")
      .find((b) => b.text() === translate("builder.translations.bulkAllDone"))
    expect(bulk?.attributes("disabled")).toBeDefined()
  })

  it("emits translate and clear from the action buttons", async () => {
    const wrapper = mount({
      staleCountByLocale: { ...zeroCounts(), ru: 1 },
      pendingItemByLocale: { ...zeroCounts(), ru: 1 },
    })
    const buttons = wrapper.findAll("button")
    const translateBtn = buttons.find(
      (b) =>
        b.text() ===
        translate("builder.translations.bulkRetranslate", { count: 1 }),
    )
    const clearBtn = buttons.find(
      (b) => b.text() === translate("builder.translations.clearLocale"),
    )

    await translateBtn?.trigger("click")
    await clearBtn?.trigger("click")
    expect(wrapper.emitted("translate")).toHaveLength(1)
    expect(wrapper.emitted("clear")).toHaveLength(1)
  })

  it("hides bulk actions while viewing the primary locale", () => {
    const wrapper = mount({ activeLocale: "en", primaryLocale: "en" })
    const clearBtn = wrapper
      .findAll("button")
      .find((b) => b.text() === translate("builder.translations.clearLocale"))
    expect(clearBtn).toBeUndefined()
  })
})
