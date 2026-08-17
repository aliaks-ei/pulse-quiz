import { describe, expect, it } from "vitest"

import { buildInviteUrl, resolveAppOrigin } from "@/lib/invite"

describe("resolveAppOrigin", () => {
  it("prefers the current browser origin over an environment override", () => {
    expect(
      resolveAppOrigin({
        appUrl: "https://deployed.example.com/",
        browserOrigin: "http://localhost:4173",
      }),
    ).toBe("http://localhost:4173")
  })

  it("falls back to the configured app url when no browser origin exists", () => {
    expect(
      resolveAppOrigin({
        appUrl: "https://pulse.example.com/",
        browserOrigin: "",
      }),
    ).toBe("https://pulse.example.com")
  })
})

describe("buildInviteUrl", () => {
  it("builds invite paths from the resolved origin", () => {
    expect(
      buildInviteUrl("ABC123", {
        appUrl: "https://pulse.example.com/",
        browserOrigin: "http://localhost:5173",
      }),
    ).toBe("http://localhost:5173/join/ABC123")
  })
})
