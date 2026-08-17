import { describe, expect, it } from "vitest"

import PrimaryLocalePicker from "@/components/gameBuilder/PrimaryLocalePicker.vue"
import { appLocaleOptions } from "@/i18n/locale"
import { translate } from "@/i18n"
import { mountWithApp } from "@/test/pinia"

describe("PrimaryLocalePicker", () => {
  it("renders an option per supported locale and selects the primary", () => {
    const wrapper = mountWithApp(PrimaryLocalePicker, {
      props: { primaryLocale: "ru", locked: false },
    })
    const select = wrapper.get("select")
    expect(select.findAll("option")).toHaveLength(appLocaleOptions.length)
    expect((select.element as HTMLSelectElement).value).toBe("ru")
  })

  it("emits change with the chosen locale", async () => {
    const wrapper = mountWithApp(PrimaryLocalePicker, {
      props: { primaryLocale: "en", locked: false },
    })
    await wrapper.get("select").setValue("pl")
    expect(wrapper.emitted("change")?.[0]).toEqual(["pl"])
  })

  it("disables the select and shows a tooltip when locked", () => {
    const wrapper = mountWithApp(PrimaryLocalePicker, {
      props: { primaryLocale: "en", locked: true },
    })
    expect(wrapper.get("select").attributes("disabled")).toBeDefined()
    expect(wrapper.get("label").attributes("title")).toBe(
      translate("builder.translations.primaryPickerLockedTooltip"),
    )
  })
})
