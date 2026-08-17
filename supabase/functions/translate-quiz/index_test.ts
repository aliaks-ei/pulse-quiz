import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

import { isValidTranslationItems } from "./limits.ts"

Deno.test("translation payload limits reject oversized inputs", () => {
  assertEquals(isValidTranslationItems([{ id: "one", text: "hello" }]), true)
  assertEquals(isValidTranslationItems([{ id: "one", text: "" }]), false)
  assertEquals(
    isValidTranslationItems([{ id: "one", text: "x".repeat(1_201) }]),
    false,
  )
  assertEquals(
    isValidTranslationItems(
      Array.from({ length: 601 }, (_, index) => ({
        id: String(index),
        text: "x",
      })),
    ),
    false,
  )
})
