import { describe, expect, it } from "vitest"

import {
  etagMatches,
  planMigration,
  referencedMedia,
} from "./migrate-media-to-r2"

const TARGET = "pulse-quiz-question-media"

describe("referencedMedia", () => {
  it("maps every referenced path to the owner of its quiz", () => {
    const referenced = referencedMedia(
      [
        {
          game_id: "game-1",
          media: { path: "question.webp" },
          reveal_media: { path: "reveal.mp3" },
        },
        { game_id: "game-2", media: null, reveal_media: { path: "" } },
      ],
      new Map([["game-1", "owner-1"]]),
    )

    expect(referenced).toEqual(
      new Map([
        ["question.webp", "owner-1"],
        ["reveal.mp3", "owner-1"],
      ]),
    )
  })

  it("records a null owner when the quiz has none", () => {
    const referenced = referencedMedia(
      [{ game_id: "ghost", media: { path: "a.webp" }, reveal_media: null }],
      new Map(),
    )

    expect(referenced.get("a.webp")).toBeNull()
  })
})

describe("planMigration", () => {
  it("skips paths that already have an R2 asset row", () => {
    const plan = planMigration(
      new Map([["a.webp", "owner-1"]]),
      [
        {
          id: "asset-1",
          owner_id: "owner-1",
          bucket_id: TARGET,
          object_path: "a.webp",
        },
      ],
      TARGET,
    )

    expect(plan.migrated).toEqual(["a.webp"])
    expect(plan.pending).toEqual([])
  })

  it("carries the existing asset id so the row is repointed, not duplicated", () => {
    const plan = planMigration(
      new Map([["a.webp", "owner-2"]]),
      [
        {
          id: "asset-1",
          owner_id: "owner-1",
          bucket_id: "question-media",
          object_path: "a.webp",
        },
      ],
      TARGET,
    )

    expect(plan.pending).toEqual([
      { path: "a.webp", assetId: "asset-1", ownerId: "owner-1" },
    ])
  })

  it("falls back to the quiz owner when no asset row exists", () => {
    const plan = planMigration(new Map([["a.webp", "owner-1"]]), [], TARGET)

    expect(plan.pending).toEqual([
      { path: "a.webp", assetId: null, ownerId: "owner-1" },
    ])
  })

  it("reports paths with no asset row and no owning quiz", () => {
    const plan = planMigration(new Map([["a.webp", null]]), [], TARGET)

    expect(plan.unowned).toEqual(["a.webp"])
    expect(plan.pending).toEqual([])
  })
})

describe("etagMatches", () => {
  it("accepts a quoted etag in either case", () => {
    expect(
      etagMatches(
        '"D41D8CD98F00B204E9800998ECF8427E"',
        "d41d8cd98f00b204e9800998ecf8427e",
      ),
    ).toBe(true)
  })

  it("rejects a different digest or a missing header", () => {
    expect(etagMatches('"abc"', "def")).toBe(false)
    expect(etagMatches(null, "def")).toBe(false)
  })
})
