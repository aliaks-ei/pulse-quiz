<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"

import { translate } from "@/i18n"
import { getAppLocaleOption, type AppLocale } from "@/i18n/locale"
import { translateQuizStream } from "@/services/translationService"
import { useGameBuilderStore } from "@/stores/gameBuilder"

const props = defineProps<{
  open: boolean
  gameId: string
  sourceLocale: AppLocale
  targetLocale: AppLocale
  items: Array<{ id: string; text: string }>
  displayTotal: number
}>()

const emit = defineEmits<{ close: [] }>()

const store = useGameBuilderStore()
const completed = ref(0)
const total = ref(0)
const errorMessage = ref<string | null>(null)
const inFlight = ref(false)
let activeController: AbortController | null = null

const labelFor = (locale: AppLocale) => getAppLocaleOption(locale).shortLabel
const progressTotal = computed(() => props.displayTotal || total.value)
const progressCompleted = computed(() => {
  if (!total.value || !progressTotal.value) return 0

  return Math.min(
    progressTotal.value,
    Math.floor((completed.value / total.value) * progressTotal.value),
  )
})

function abortInFlight() {
  if (!activeController) return
  activeController.abort()
  activeController = null
}

async function run() {
  abortInFlight()
  const controller = new AbortController()
  activeController = controller

  inFlight.value = true
  errorMessage.value = null
  completed.value = 0
  total.value = props.items.length

  try {
    for await (const event of translateQuizStream(
      props.gameId,
      props.sourceLocale,
      props.targetLocale,
      props.items,
      controller.signal,
    )) {
      if (controller.signal.aborted) return
      if (event.type === "progress") {
        completed.value = event.payload.completed
        total.value = event.payload.total
      } else if (event.type === "done") {
        store.applyTranslations(props.targetLocale, event.payload.translations)
        emit("close")
      } else if (event.type === "error") {
        if (event.payload.partial.length > 0) {
          store.applyTranslations(props.targetLocale, event.payload.partial)
        }
        errorMessage.value =
          event.payload.code === "rate_limited"
            ? translate("builder.translations.modalErrorRateLimit")
            : translate("builder.translations.modalErrorOpenai")
      }
    }
  } catch (error) {
    if (controller.signal.aborted) return
    errorMessage.value = (error as Error).message
  } finally {
    if (activeController === controller) activeController = null
    inFlight.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void run()
    else abortInFlight()
  },
)

onBeforeUnmount(abortInFlight)
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,18,12,0.56)] px-4"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="w-full max-w-[28rem] rounded-[1.8rem] border border-warm-border bg-[rgba(255,250,244,0.98)] p-6 shadow-[0_24px_70px_rgba(55,37,26,0.22)]"
    >
      <h2 class="text-xl font-semibold text-foreground">
        {{
          translate("builder.translations.modalTitle", {
            label: labelFor(targetLocale),
          })
        }}
      </h2>

      <div v-if="!errorMessage" class="mt-5">
        <p class="text-sm text-[color:var(--warm-ink-soft)]">
          {{
            translate("builder.translations.modalProgress", {
              completed: progressCompleted,
              total: progressTotal,
            })
          }}
        </p>
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-white">
          <div
            class="h-full rounded-full bg-primary transition-all"
            :style="{
              width: progressTotal
                ? `${(progressCompleted / progressTotal) * 100}%`
                : '0%',
            }"
          />
        </div>
      </div>

      <div v-else class="mt-5 space-y-4">
        <p class="text-sm leading-6 text-error">{{ errorMessage }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-full border border-warm-border bg-white/80 px-4 py-2 text-sm font-semibold"
            @click="emit('close')"
          >
            {{ translate("builder.translations.modalClose") }}
          </button>
          <button
            type="button"
            class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            :disabled="inFlight"
            @click="run"
          >
            {{ translate("builder.translations.modalRetry") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
