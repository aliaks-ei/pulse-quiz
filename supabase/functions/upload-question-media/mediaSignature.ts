export type MediaKind = "image" | "audio" | "video"

export type MediaSignature = {
  kind: MediaKind
  extension: string
}

const decoder = new TextDecoder()

function text(bytes: Uint8Array, start: number, end: number) {
  return decoder.decode(bytes.slice(start, end))
}

function startsWith(bytes: Uint8Array, prefix: number[]) {
  return (
    bytes.length >= prefix.length &&
    prefix.every((byte, index) => bytes[index] === byte)
  )
}

// ISO base media brands. The brand decides whether an `ftyp` container holds a
// video track, an audio-only track, or a still image.
const ISO_BRANDS: Record<string, MediaSignature> = {
  avif: { kind: "image", extension: "avif" },
  avis: { kind: "image", extension: "avif" },
  heic: { kind: "image", extension: "heic" },
  heix: { kind: "image", extension: "heic" },
  mif1: { kind: "image", extension: "heic" },
  "M4A ": { kind: "audio", extension: "m4a" },
  "M4B ": { kind: "audio", extension: "m4a" },
  isom: { kind: "video", extension: "mp4" },
  iso2: { kind: "video", extension: "mp4" },
  mp41: { kind: "video", extension: "mp4" },
  mp42: { kind: "video", extension: "mp4" },
  avc1: { kind: "video", extension: "mp4" },
  dash: { kind: "video", extension: "mp4" },
  "M4V ": { kind: "video", extension: "m4v" },
  "qt  ": { kind: "video", extension: "mov" },
}

function isoSignature(bytes: Uint8Array): MediaSignature | null {
  if (bytes.length < 12 || text(bytes, 4, 8) !== "ftyp") return null
  return ISO_BRANDS[text(bytes, 8, 12)] ?? null
}

function riffSignature(bytes: Uint8Array): MediaSignature | null {
  if (bytes.length < 12 || text(bytes, 0, 4) !== "RIFF") return null

  const form = text(bytes, 8, 12)
  if (form === "WEBP") return { kind: "image", extension: "webp" }
  if (form === "WAVE") return { kind: "audio", extension: "wav" }
  if (form === "AVI ") return { kind: "video", extension: "avi" }
  return null
}

function isMpegAudioFrame(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

/**
 * Identify a media file by its leading bytes. Returns null when the content
 * does not match any format the quiz builder accepts, whatever the browser
 * declared its type to be.
 */
export function detectMediaSignature(bytes: Uint8Array): MediaSignature | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "image", extension: "png" }
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { kind: "image", extension: "jpg" }
  }

  if (text(bytes, 0, 6) === "GIF87a" || text(bytes, 0, 6) === "GIF89a") {
    return { kind: "image", extension: "gif" }
  }

  const riff = riffSignature(bytes)
  if (riff) return riff

  const iso = isoSignature(bytes)
  if (iso) return iso

  if (text(bytes, 0, 4) === "OggS") {
    return { kind: "audio", extension: "ogg" }
  }

  if (text(bytes, 0, 4) === "fLaC") {
    return { kind: "audio", extension: "flac" }
  }

  if (text(bytes, 0, 3) === "ID3" || isMpegAudioFrame(bytes)) {
    return { kind: "audio", extension: "mp3" }
  }

  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { kind: "video", extension: "webm" }
  }

  return null
}
