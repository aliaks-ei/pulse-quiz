<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch,
} from "vue"
import { AnimatePresence, motion } from "motion-v"
import { useI18n } from "vue-i18n"

import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    confirmTone?: "primary" | "danger"
    isConfirming?: boolean
  }>(),
  {
    confirmTone: "primary",
    isConfirming: false,
    confirmLabel: undefined,
    cancelLabel: undefined,
  },
)

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialogRef = useTemplateRef<HTMLDivElement>("dialogPanel")
const previouslyFocused = ref<HTMLElement | null>(null)
const titleId = "confirm-dialog-title"
const descId = "confirm-dialog-desc"
const resolvedConfirmLabel = computed(
  () => props.confirmLabel ?? t("common.confirm"),
)
const resolvedCancelLabel = computed(
  () => props.cancelLabel ?? t("common.cancel"),
)

function trapFocus(event: KeyboardEvent) {
  if (event.key !== "Tab" || !dialogRef.value) return

  const focusable = dialogRef.value.querySelectorAll<HTMLElement>(
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
    emit("cancel")
    return
  }
  trapFocus(event)
}

watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      previouslyFocused.value = document.activeElement as HTMLElement | null
      await nextTick()
      dialogRef.value?.focus()
    } else if (previouslyFocused.value) {
      previouslyFocused.value.focus()
      previouslyFocused.value = null
    }
  },
)

onBeforeUnmount(() => {
  if (previouslyFocused.value) {
    previouslyFocused.value.focus()
    previouslyFocused.value = null
  }
})
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="isOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(46,35,27,0.28)] px-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descId"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        @click.self="emit('cancel')"
        @keydown="onKeydown"
      >
        <motion.div
          class="w-full max-w-lg rounded-[calc(var(--radius)+10px)] border border-warm-border bg-[linear-gradient(180deg,rgba(255,252,248,0.96),rgba(252,246,239,0.92))] p-[var(--space-surface-tablet)] text-card-foreground shadow-[var(--paper-shadow)] outline-none backdrop-blur-[10px] md:p-[var(--space-surface-large)]"
          :initial="{ opacity: 0, y: 24, scale: 0.98 }"
          :animate="{ opacity: 1, y: 0, scale: 1 }"
          :exit="{ opacity: 0, y: 16, scale: 0.98 }"
          :transition="{ duration: 0.2, ease: 'easeOut' }"
        >
          <div ref="dialogPanel" tabindex="-1" class="outline-none">
            <Kicker>{{ t("confirmDialog.kicker") }}</Kicker>
            <h2
              :id="titleId"
              class="mt-3 font-display text-[1.9rem] font-semibold tracking-[-0.05em]"
            >
              {{ title }}
            </h2>
            <p
              :id="descId"
              class="mt-3 text-sm leading-6 text-[color:var(--text-muted)]"
            >
              {{ description }}
            </p>

            <div class="mt-6 flex flex-wrap gap-3">
              <Button variant="secondary" @click="emit('cancel')">
                {{ resolvedCancelLabel }}
              </Button>
              <Button
                :variant="confirmTone === 'danger' ? 'danger' : 'primary'"
                :disabled="isConfirming"
                @click="emit('confirm')"
              >
                {{ isConfirming ? t("common.working") : resolvedConfirmLabel }}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>
