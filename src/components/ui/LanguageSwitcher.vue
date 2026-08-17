<script setup lang="ts">
import { onClickOutside, useEventListener } from "@vueuse/core"
import { ChevronDown } from "lucide-vue-next"
import { computed, nextTick, ref, watch } from "vue"

import { currentAppLocale, setAppLocale } from "@/i18n"
import {
  getAppLocaleOption,
  appLocaleOptions,
  type AppLocale,
} from "@/i18n/locale"

withDefaults(
  defineProps<{
    inverted?: boolean
  }>(),
  {
    inverted: false,
  },
)

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

const activeLocale = computed(() => currentAppLocale.value)
const activeOption = computed(() => getAppLocaleOption(activeLocale.value))

function toggleOpen() {
  isOpen.value = !isOpen.value
}

function closeMenu() {
  isOpen.value = false
}

function selectLocale(locale: AppLocale) {
  setAppLocale(locale)
  closeMenu()
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeMenu()
}

function syncMenuPosition() {
  if (!rootRef.value) return

  const rect = rootRef.value.getBoundingClientRect()
  const menuWidth = Math.max(rect.width, 168)
  const menuHeight = menuRef.value?.offsetHeight ?? 0
  const gap = 10
  const viewportPadding = 12
  let top = rect.bottom + gap

  if (menuHeight && top + menuHeight > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, rect.top - menuHeight - gap)
  }

  const left = Math.max(
    viewportPadding,
    Math.min(
      rect.right - menuWidth,
      window.innerWidth - menuWidth - viewportPadding,
    ),
  )

  menuStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    minWidth: `${menuWidth}px`,
  }
}

function handleViewportChange() {
  if (!isOpen.value) return
  syncMenuPosition()
}

onClickOutside(rootRef, closeMenu, { ignore: [menuRef] })
useEventListener("keydown", handleWindowKeydown)
useEventListener("resize", handleViewportChange)
useEventListener("scroll", handleViewportChange, true)

watch(isOpen, async (open) => {
  if (!open) return
  await nextTick()
  syncMenuPosition()
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="inline-flex min-w-20 items-center justify-between gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition"
      :class="
        inverted
          ? 'border-white/10 bg-white/8 text-white/84 hover:bg-white/12'
          : 'border-warm-border bg-white/86 text-foreground shadow-[0_10px_24px_rgba(58,38,28,0.08)] hover:bg-white'
      "
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      :aria-label="$t('locale.switcher.ariaLabel')"
      @click="toggleOpen"
    >
      <span>{{ activeOption.shortLabel }}</span>
      <ChevronDown
        class="size-3 transition"
        :class="isOpen ? 'rotate-180' : ''"
      />
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="fixed z-[130] rounded-[1.2rem] border p-2 shadow-[0_18px_38px_rgba(36,24,18,0.18)] backdrop-blur-md"
        :class="
          inverted
            ? 'border-white/10 bg-[rgba(50,36,30,0.95)] text-white'
            : 'border-warm-border bg-[rgba(255,251,246,0.96)] text-foreground'
        "
        :style="menuStyle"
        role="menu"
      >
        <button
          v-for="option in appLocaleOptions"
          :key="option.code"
          type="button"
          class="flex w-full items-center justify-between rounded-[0.95rem] px-3 py-2 text-left text-sm transition"
          :class="
            option.code === activeLocale
              ? inverted
                ? 'bg-white/10 text-white'
                : 'bg-primary/10 text-primary'
              : inverted
                ? 'text-white/76 hover:bg-white/8 hover:text-white'
                : 'text-foreground/72 hover:bg-white hover:text-foreground'
          "
          role="menuitemradio"
          :aria-checked="option.code === activeLocale"
          @click="selectLocale(option.code)"
        >
          <span>{{ option.nativeLabel }}</span>
          <span
            class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] opacity-56"
            >{{ option.shortLabel }}</span
          >
        </button>
      </div>
    </Teleport>
  </div>
</template>
