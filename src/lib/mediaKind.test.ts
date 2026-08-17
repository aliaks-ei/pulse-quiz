import { describe, expect, it } from "vitest"

import { detectMediaKind } from "@/lib/mediaKind"

function file(name: string, type = ""): File {
  return new File(["x"], name, { type })
}

describe("detectMediaKind — string sources", () => {
  it("detects audio extensions", () => {
    expect(detectMediaKind("song.mp3")).toBe("audio")
    expect(detectMediaKind("clip.FLAC")).toBe("audio")
  })

  it("detects video extensions", () => {
    expect(detectMediaKind("movie.mp4")).toBe("video")
    expect(detectMediaKind("clip.WEBM")).toBe("video")
  })

  it("treats other known extensions as image", () => {
    expect(detectMediaKind("photo.png")).toBe("image")
    expect(detectMediaKind("photo.jpeg")).toBe("image")
  })

  it("strips query strings and hashes before reading the extension", () => {
    expect(detectMediaKind("song.mp3?token=abc")).toBe("audio")
    expect(detectMediaKind("movie.mp4#t=10")).toBe("video")
  })

  it("returns the fallback when there is no extension", () => {
    expect(detectMediaKind("noextension")).toBe("image")
    expect(detectMediaKind("noextension", "video")).toBe("video")
  })
})

describe("detectMediaKind — File sources", () => {
  it("detects by MIME type prefix", () => {
    expect(detectMediaKind(file("a", "audio/mpeg"))).toBe("audio")
    expect(detectMediaKind(file("a", "video/mp4"))).toBe("video")
    expect(detectMediaKind(file("a", "image/png"))).toBe("image")
  })

  it("falls back to the file name when the MIME type is unhelpful", () => {
    expect(detectMediaKind(file("song.mp3", ""))).toBe("audio")
    expect(detectMediaKind(file("clip.mp4", "application/octet-stream"))).toBe(
      "video",
    )
  })
})
