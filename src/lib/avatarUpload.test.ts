import { describe, expect, it } from "vitest"

import { validateAvatarSourceFile } from "@/lib/avatarUpload"

describe("validateAvatarSourceFile", () => {
  it("accepts supported images within the source limit", () => {
    const file = new File(["image"], "avatar.png", { type: "image/png" })
    expect(() => validateAvatarSourceFile(file)).not.toThrow()
  })

  it("rejects unsupported image formats", () => {
    const file = new File(["image"], "avatar.gif", { type: "image/gif" })
    expect(() => validateAvatarSourceFile(file)).toThrow(
      "Choose a PNG, JPEG, or WebP image.",
    )
  })

  it("rejects an oversized source image", () => {
    const file = new File([], "avatar.webp", { type: "image/webp" })
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 })
    expect(() => validateAvatarSourceFile(file)).toThrow(
      "Avatar images must be 10 MB or smaller.",
    )
  })
})
