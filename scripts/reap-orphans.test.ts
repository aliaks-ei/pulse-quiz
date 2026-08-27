import { describe, expect, it } from "vitest"

import { findOrphans, referencedMediaPaths } from "./reap-orphans"

describe("reap-orphans", () => {
  it("collects paths from both question media fields", () => {
    expect(
      referencedMediaPaths([
        {
          media: { path: "question.webp" },
          reveal_media: { path: "reveal.mp3" },
        },
        { media: null, reveal_media: { path: "" } },
      ]),
    ).toEqual(new Set(["question.webp", "reveal.mp3"]))
  })

  it("returns only storage objects that no question references", () => {
    expect(
      findOrphans(
        [
          { name: "question.webp", size: 10 },
          { name: "orphan.mp4", size: 20 },
        ],
        new Set(["question.webp"]),
      ),
    ).toEqual([{ name: "orphan.mp4", size: 20 }])
  })
})
