import { describe, expect, it } from "vitest"

import { getPastRoomLabel, getPhaseLabel, pageTitleKeys } from "@/lib/uiCopy"

describe("getPhaseLabel", () => {
  it("resolves a known phase to its localized label", () => {
    expect(getPhaseLabel("lobby")).toBe("Lobby")
    expect(getPhaseLabel("finished")).toBe("Results")
  })
})

describe("getPastRoomLabel", () => {
  it("resolves a past-room phase label", () => {
    expect(getPastRoomLabel("lobby")).toBe("Lobby Ended Early")
  })
})

describe("pageTitleKeys", () => {
  it("maps route keys to titles.* translation keys", () => {
    expect(pageTitleKeys.library).toBe("titles.library")
    expect(pageTitleKeys.play).toBe("titles.play")
    expect(
      Object.values(pageTitleKeys).every((k) => k.startsWith("titles.")),
    ).toBe(true)
  })
})
