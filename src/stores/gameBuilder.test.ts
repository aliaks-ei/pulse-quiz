import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it } from "vitest"

import { useGameBuilderStore } from "@/stores/gameBuilder"

describe("gameBuilder store - translations", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it("starts with empty i18n for every field", () => {
    const store = useGameBuilderStore()
    store.reset()

    expect(store.titleI18n).toEqual({})
    expect(store.questions[0].promptI18n).toEqual({})
    expect(store.questions[0].revealTextI18n).toEqual({})
    expect(store.questions[0].options[0].textI18n).toEqual({})
    expect(store.sections[0].titleI18n).toEqual({})
  })

  it("validates default answer reveal duration", () => {
    const store = useGameBuilderStore()
    store.reset()
    store.title = "Trivia"
    store.questions[0].prompt = "Question?"
    store.questions[0].options.forEach((option, index) => {
      option.text = `Answer ${index + 1}`
    })

    expect(store.isValid).toBe(true)

    store.setDefaultAnswerRevealSeconds(0)
    expect(store.validationErrors).toContain(
      "Set answer reveal time to 1-300 seconds.",
    )

    store.setDefaultAnswerRevealSeconds(301)
    expect(store.validationErrors).toContain(
      "Set answer reveal time to 1-300 seconds.",
    )
  })

  it("keeps manual question advance as an explicit quiz setting", () => {
    const store = useGameBuilderStore()
    store.reset()

    expect(store.manualQuestionAdvance).toBe(false)

    store.setManualQuestionAdvance(true)
    expect(store.manualQuestionAdvance).toBe(true)
  })

  it("applyTranslations populates a question prompt's i18n entry", () => {
    const store = useGameBuilderStore()
    store.reset()
    store.questions[0].prompt = "How many planets?"
    const questionId = store.questions[0].id

    store.applyTranslations("ru", [
      { id: `question:${questionId}:prompt`, text: "Сколько планет?" },
    ])

    const entry = store.questions[0].promptI18n.ru
    expect(entry?.text).toBe("Сколько планет?")
    expect(entry?.sourceHash).toMatch(/^[0-9a-f]{8}$/)
  })

  it("hasAnyTranslation toggles after applying a translation", () => {
    const store = useGameBuilderStore()
    store.reset()
    expect(store.hasAnyTranslation).toBe(false)

    store.questions[0].prompt = "X"
    store.applyTranslations("ru", [
      { id: `question:${store.questions[0].id}:prompt`, text: "Y" },
    ])

    expect(store.hasAnyTranslation).toBe(true)
  })

  it("setPrimaryLocale throws once translations exist", () => {
    const store = useGameBuilderStore()
    store.reset()
    store.questions[0].prompt = "X"
    store.applyTranslations("ru", [
      { id: `question:${store.questions[0].id}:prompt`, text: "Y" },
    ])

    expect(() => store.setPrimaryLocale("pl")).toThrow(/Clear all translations/)
  })

  it("clearTranslation removes only the targeted locale", () => {
    const store = useGameBuilderStore()
    store.reset()
    store.questions[0].prompt = "X"

    store.applyTranslations("ru", [
      { id: `question:${store.questions[0].id}:prompt`, text: "RU" },
    ])
    store.applyTranslations("pl", [
      { id: `question:${store.questions[0].id}:prompt`, text: "PL" },
    ])

    store.clearTranslation("ru")
    expect(store.questions[0].promptI18n.ru).toBeUndefined()
    expect(store.questions[0].promptI18n.pl?.text).toBe("PL")
  })
})
