import { describe, expect, it } from "vitest"
import { detectMediaSignature } from "./mediaSignature.ts"

function bytes(...values: Array<number | string>) {
  const parts: number[] = []
  for (const value of values) {
    if (typeof value === "number") parts.push(value)
    else for (const character of value) parts.push(character.charCodeAt(0))
  }
  return new Uint8Array(parts)
}

function padded(source: Uint8Array, length = 32) {
  const result = new Uint8Array(length)
  result.set(source.slice(0, length))
  return result
}

describe("detectMediaSignature", () => {
  it("identifies images by their leading bytes", () => {
    expect(
      detectMediaSignature(padded(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))),
    ).toEqual({ kind: "image", extension: "png" })
    expect(detectMediaSignature(padded(bytes(0xff, 0xd8, 0xff, 0xe0)))).toEqual(
      { kind: "image", extension: "jpg" },
    )
    expect(detectMediaSignature(padded(bytes("GIF89a")))).toEqual({
      kind: "image",
      extension: "gif",
    })
    expect(
      detectMediaSignature(padded(bytes("RIFF", 0, 0, 0, 0, "WEBP"))),
    ).toEqual({ kind: "image", extension: "webp" })
  })

  it("identifies audio containers", () => {
    expect(
      detectMediaSignature(padded(bytes("RIFF", 0, 0, 0, 0, "WAVE"))),
    ).toEqual({ kind: "audio", extension: "wav" })
    expect(detectMediaSignature(padded(bytes("OggS")))).toEqual({
      kind: "audio",
      extension: "ogg",
    })
    expect(detectMediaSignature(padded(bytes("fLaC")))).toEqual({
      kind: "audio",
      extension: "flac",
    })
    expect(detectMediaSignature(padded(bytes("ID3")))).toEqual({
      kind: "audio",
      extension: "mp3",
    })
    expect(detectMediaSignature(padded(bytes(0xff, 0xfb)))).toEqual({
      kind: "audio",
      extension: "mp3",
    })
  })

  it("identifies video containers", () => {
    expect(
      detectMediaSignature(padded(bytes(0, 0, 0, 0x20, "ftypisom"))),
    ).toEqual({ kind: "video", extension: "mp4" })
    expect(detectMediaSignature(padded(bytes(0x1a, 0x45, 0xdf, 0xa3)))).toEqual(
      { kind: "video", extension: "webm" },
    )
  })

  it("separates audio-only and image ISO brands from video", () => {
    expect(
      detectMediaSignature(padded(bytes(0, 0, 0, 0x20, "ftypM4A "))),
    ).toEqual({ kind: "audio", extension: "m4a" })
    expect(
      detectMediaSignature(padded(bytes(0, 0, 0, 0x20, "ftypavif"))),
    ).toEqual({ kind: "image", extension: "avif" })
  })

  it("rejects content that matches no accepted format", () => {
    expect(detectMediaSignature(padded(bytes("MZ", 0x90, 0x00)))).toBeNull()
    expect(detectMediaSignature(padded(bytes("<html>")))).toBeNull()
    expect(detectMediaSignature(new Uint8Array())).toBeNull()
    expect(
      detectMediaSignature(padded(bytes("RIFF", 0, 0, 0, 0, "XXXX"))),
    ).toBeNull()
    expect(
      detectMediaSignature(padded(bytes(0, 0, 0, 0x20, "ftypzzzz"))),
    ).toBeNull()
  })
})
