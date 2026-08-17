// Test helpers for Pinia + component mounting.

import { createPinia, setActivePinia, type Pinia } from "pinia"
import { mount, type ComponentMountingOptions } from "@vue/test-utils"
import { defineComponent, h, type Component } from "vue"

import { i18n } from "@/i18n"

// Fresh Pinia per test; call in beforeEach (or use the return value).
export function withTestPinia(): Pinia {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

// Mount a component with Pinia + i18n installed, plus sensible global stubs for
// the heavy presentational deps (motion-v, router-link) that carry no logic.
export function mountWithApp<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> = {},
): ReturnType<typeof mount<C>> {
  const pinia = withTestPinia()

  const plugins = [pinia, i18n, ...(options.global?.plugins ?? [])]

  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins,
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
        ...options.global?.stubs,
      },
    },
  }) as ReturnType<typeof mount<C>>
}

// Run a composable inside a real component setup so lifecycle hooks and effect
// scopes behave. Returns the composable result plus the mounted wrapper.
export function withSetup<T>(
  composable: () => T,
  options: { plugins?: unknown[]; withPinia?: boolean } = {},
): { result: T; unmount: () => void } {
  let result!: T
  const component = defineComponent({
    setup() {
      result = composable()
      return () => h("div")
    },
  })

  const plugins = [
    ...(options.withPinia === false ? [] : [withTestPinia()]),
    ...(options.plugins ?? []),
  ]

  const wrapper = mount(component, {
    global: { plugins: plugins as never[] },
  })

  return { result, unmount: () => wrapper.unmount() }
}
