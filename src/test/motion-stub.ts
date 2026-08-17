/* eslint-disable vue/one-component-per-file -- intentional: one stub component per motion tag */
// Lightweight stand-in for motion-v in component tests: renders the underlying
// HTML element for any `motion.<tag>` access, passes through AnimatePresence,
// and reports "no reduced motion". Use via:
//   vi.mock("motion-v", () => import("@/test/motion-stub"))

import { defineComponent, h, ref } from "vue"

const cache = new Map<string, ReturnType<typeof defineComponent>>()

function tagComponent(tag: string) {
  const existing = cache.get(tag)
  if (existing) return existing

  const component = defineComponent({
    name: `MotionStub_${tag}`,
    inheritAttrs: true,
    setup(_props, { slots, attrs }) {
      return () => h(tag, attrs, slots.default ? slots.default() : [])
    },
  })
  cache.set(tag, component)
  return component
}

export const motion = new Proxy(
  {},
  {
    get: (_target, tag: string) => tagComponent(tag),
  },
)

export const AnimatePresence = defineComponent({
  name: "AnimatePresenceStub",
  setup(_props, { slots }) {
    return () => (slots.default ? slots.default() : [])
  },
})

export function useReducedMotion() {
  return ref(false)
}
