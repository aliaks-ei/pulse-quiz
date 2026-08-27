import { describe, expect, it } from "vitest"

import { batch, planReap } from "./index"

describe("media-reaper", () => {
  it("reaps only the bucket this Worker is bound to", () => {
    const plan = planReap(
      [
        {
          id: "1",
          bucket_id: "pulse-quiz-question-media",
          object_path: "assets/a.webp",
        },
        { id: "2", bucket_id: "question-media", object_path: "assets/b.webp" },
      ],
      "pulse-quiz-question-media",
    )

    expect(plan.reapable.map((asset) => asset.id)).toEqual(["1"])
    expect(plan.foreign.map((asset) => asset.id)).toEqual(["2"])
  })

  it("never asks R2 to delete an empty key", () => {
    const plan = planReap(
      [{ id: "1", bucket_id: "pulse-quiz-question-media", object_path: "" }],
      "pulse-quiz-question-media",
    )

    expect(plan.reapable).toEqual([])
    expect(plan.foreign).toHaveLength(1)
  })

  it("splits deletions into batches", () => {
    expect(batch([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(batch([], 2)).toEqual([])
  })
})
