import { describe, expect, it } from "vitest"
import { getQuestionType } from "@/lib/gameTypes"

describe("question type registry", () => {
  it("uses the supported type for unknown persisted values", () => {
    expect(getQuestionType("future_type").type).toBe("single_choice")
  })

  it("creates a valid single-choice shape", () => {
    const type = getQuestionType("single_choice")
    const draft = type.createDefault()
    expect(draft.options).toHaveLength(4)
    expect(draft.correctOptionId).toBe(draft.options[0].id)
  })
})
