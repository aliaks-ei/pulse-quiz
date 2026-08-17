<script setup lang="ts">
import { useTimeoutFn } from "@vueuse/core"
import { AnimatePresence, motion } from "motion-v"
import { Menu, X } from "lucide-vue-next"
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useRoute } from "vue-router"

const props = withDefaults(
  defineProps<{
    openLabel: string
    closeLabel: string
    titleLabel: string
    inverted?: boolean
  }>(),
  {
    inverted: false,
  },
)

const route = useRoute()
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLDivElement | null>(null)
const isOpen = ref(false)
const panelId = `mobile-nav-menu-${Math.random().toString(36).slice(2, 10)}`
const previousOverflow = ref("")
const previouslyFocused = ref<HTMLElement | null>(null)

const backdropTransition = {
  duration: 0.22,
  ease: [0, 0, 0.2, 1] as const,
}

const panelEnterTransition = {
  duration: 0.24,
  ease: [0, 0, 0.2, 1] as const,
}

const panelExitTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.6, 1] as const,
}

const closeCleanupDelayMs = 220

function restoreCloseState() {
  document.body.style.overflow = previousOverflow.value

  if (previouslyFocused.value) {
    previouslyFocused.value.focus()
    previouslyFocused.value = null
  }
}

const { start: scheduleCloseCleanup, stop: stopCloseCleanup } = useTimeoutFn(
  restoreCloseState,
  closeCleanupDelayMs,
  { immediate: false },
)

const buttonClasses = computed(() =>
  props.inverted
    ? "inline-flex size-11 items-center justify-center rounded-[1.1rem] border border-white/12 bg-white/10 text-white transition hover:bg-white/14"
    : "inline-flex size-11 items-center justify-center rounded-[1.1rem] border border-warm-border-strong bg-white/92 text-primary shadow-[0_8px_18px_rgba(58,38,28,0.06)] transition hover:-translate-y-0.5 hover:border-primary/28 hover:bg-white",
)

const panelClasses = computed(() =>
  props.inverted
    ? "ml-auto flex h-full w-[min(24rem,calc(100vw-3.5rem))] flex-col border-l border-white/10 bg-[rgba(47,34,29,0.98)] text-white shadow-[-18px_0_45px_rgba(18,12,10,0.28)] backdrop-blur-xl"
    : "ml-auto flex h-full w-[min(24rem,calc(100vw-3.5rem))] flex-col border-l border-warm-border-strong bg-[rgba(255,251,246,0.98)] text-foreground shadow-[-18px_0_45px_rgba(58,38,28,0.12)] backdrop-blur-xl",
)

function toggleMenu() {
  isOpen.value = !isOpen.value
}

function closeMenu() {
  isOpen.value = false
}

function focusFirstInteractive() {
  if (!panelRef.value) return

  const firstFocusable = panelRef.value.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )

  if (firstFocusable) {
    firstFocusable.focus()
    return
  }

  panelRef.value.focus()
}

function trapFocus(event: KeyboardEvent) {
  if (event.key !== "Tab" || !panelRef.value) return

  const focusable = panelRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )

  if (!focusable.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation()
    closeMenu()
    return
  }

  trapFocus(event)
}

onBeforeUnmount(() => {
  stopCloseCleanup()
  restoreCloseState()
})

watch(
  () => route.fullPath,
  () => {
    closeMenu()
  },
)

watch(isOpen, async (open) => {
  if (open) {
    stopCloseCleanup()
    previouslyFocused.value = document.activeElement as HTMLElement | null
    previousOverflow.value = document.body.style.overflow
    document.body.style.overflow = "hidden"
    await nextTick()
    focusFirstInteractive()
    return
  }

  scheduleCloseCleanup()
})
</script>

<template>
  <div class="md:hidden">
    <button
      ref="triggerRef"
      type="button"
      :class="buttonClasses"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      :aria-expanded="isOpen"
      :aria-label="isOpen ? closeLabel : openLabel"
      @click="toggleMenu"
    >
      <X v-if="isOpen" class="size-5" />
      <Menu v-else class="size-5" />
      <span class="sr-only">{{ isOpen ? closeLabel : openLabel }}</span>
    </button>

    <Teleport to="body">
      <AnimatePresence>
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[110]"
          role="dialog"
          aria-modal="true"
          :aria-label="titleLabel"
          @keydown="onKeydown"
        >
          <motion.div
            class="absolute inset-0 bg-[rgba(32,22,17,0.22)] backdrop-blur-sm"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
            :transition="backdropTransition"
            @click="closeMenu"
          />

          <div class="absolute inset-0 flex justify-end">
            <motion.div
              :class="panelClasses"
              style="will-change: transform"
              :initial="{ x: '100%' }"
              :animate="{ x: 0 }"
              :exit="{ x: '100%' }"
              :transition="isOpen ? panelEnterTransition : panelExitTransition"
            >
              <div
                :id="panelId"
                ref="panelRef"
                tabindex="-1"
                class="flex h-full flex-col outline-none"
              >
                <div
                  class="flex items-center justify-between gap-3 border-b px-4 py-4"
                  :class="inverted ? 'border-white/10' : 'border-warm-border'"
                >
                  <p
                    class="text-[0.7rem] font-semibold uppercase tracking-[0.22em]"
                    :class="
                      props.inverted
                        ? 'text-[color:var(--text-inverse-muted)]'
                        : 'text-[color:var(--text-subtle)]'
                    "
                  >
                    {{ titleLabel }}
                  </p>
                  <button
                    type="button"
                    class="inline-flex size-10 items-center justify-center rounded-full border transition"
                    :class="
                      props.inverted
                        ? 'border-white/12 bg-white/8 text-white hover:bg-white/12'
                        : 'border-warm-border-strong bg-white/86 text-primary hover:bg-white'
                    "
                    :aria-label="closeLabel"
                    @click="closeMenu"
                  >
                    <X class="size-4" />
                  </button>
                </div>

                <div class="flex-1 overflow-y-auto px-4 py-4">
                  <slot :close="closeMenu" />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </AnimatePresence>
    </Teleport>
  </div>
</template>
