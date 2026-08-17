import { describe, expect, it } from "vitest"

import {
  asBoolean,
  asNullableString,
  asNumber,
  asString,
  assertPlainObject,
  isPlainObject,
} from "@/lib/typeGuards"
import { isAvatarKey, isSessionPhase } from "@/types/domain"

describe("asString", () => {
  it("returns the value for strings (including empty)", () => {
    expect(asString("hi")).toBe("hi")
    expect(asString("")).toBe("")
  })

  it("returns undefined for non-strings", () => {
    expect(asString(1)).toBeUndefined()
    expect(asString(null)).toBeUndefined()
    expect(asString(undefined)).toBeUndefined()
    expect(asString({})).toBeUndefined()
  })
})

describe("asNumber", () => {
  it("returns finite numbers, including zero and negatives", () => {
    expect(asNumber(0)).toBe(0)
    expect(asNumber(-3.5)).toBe(-3.5)
  })

  it("rejects non-finite numbers and non-numbers", () => {
    expect(asNumber(NaN)).toBeUndefined()
    expect(asNumber(Infinity)).toBeUndefined()
    expect(asNumber("5")).toBeUndefined()
    expect(asNumber(null)).toBeUndefined()
  })
})

describe("asBoolean", () => {
  it("returns booleans", () => {
    expect(asBoolean(true)).toBe(true)
    expect(asBoolean(false)).toBe(false)
  })

  it("returns undefined for non-booleans", () => {
    expect(asBoolean(0)).toBeUndefined()
    expect(asBoolean("true")).toBeUndefined()
    expect(asBoolean(null)).toBeUndefined()
  })
})

describe("asNullableString", () => {
  it("preserves explicit null", () => {
    expect(asNullableString(null, "fallback")).toBeNull()
  })

  it("returns strings as-is", () => {
    expect(asNullableString("value", "fallback")).toBe("value")
  })

  it("uses the fallback for other types", () => {
    expect(asNullableString(42, "fallback")).toBe("fallback")
    expect(asNullableString(undefined, null)).toBeNull()
  })
})

describe("isPlainObject", () => {
  it("accepts plain objects", () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
  })

  it("rejects null, arrays, and primitives", () => {
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject("x")).toBe(false)
    expect(isPlainObject(3)).toBe(false)
  })
})

describe("assertPlainObject", () => {
  it("passes silently for plain objects", () => {
    expect(() => assertPlainObject({}, "payload")).not.toThrow()
  })

  it("throws a labelled error for non-objects", () => {
    expect(() => assertPlainObject([], "payload")).toThrow(
      "Expected payload to be an object, got object",
    )
    expect(() => assertPlainObject(7, "count")).toThrow(
      "Expected count to be an object, got number",
    )
  })
})

describe("isAvatarKey", () => {
  it("accepts known avatar keys", () => {
    expect(isAvatarKey("avatar-01")).toBe(true)
    expect(isAvatarKey("avatar-06")).toBe(true)
  })

  it("rejects unknown values", () => {
    expect(isAvatarKey("avatar-99")).toBe(false)
    expect(isAvatarKey(1)).toBe(false)
    expect(isAvatarKey(null)).toBe(false)
  })
})

describe("isSessionPhase", () => {
  it("accepts known phases", () => {
    expect(isSessionPhase("lobby")).toBe(true)
    expect(isSessionPhase("finished")).toBe(true)
  })

  it("rejects unknown values", () => {
    expect(isSessionPhase("paused")).toBe(false)
    expect(isSessionPhase(null)).toBe(false)
  })
})
