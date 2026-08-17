<script setup lang="ts">
import { motion } from "motion-v"
import { computed } from "vue"

import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    state?: "default" | "muted" | "selected" | "success" | "danger"
    presentation?: "default" | "host"
    disabled?: boolean
    interactive?: boolean
    motionProps?: Record<string, unknown>
  }>(),
  {
    state: "default",
    presentation: "default",
    disabled: false,
    interactive: false,
    motionProps: undefined,
  },
)

const classes = computed(() =>
  cn(
    "relative min-h-0 rounded-[1.25rem] border px-4 py-4 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#49362f]",
    "border-white/12 bg-[rgba(255,251,246,0.94)] text-[color:var(--text-strong)] shadow-[0_10px_24px_rgba(28,19,15,0.08)]",
    props.presentation === "host" &&
      "flex min-h-[clamp(3rem,6.4vh,3.4rem)] items-center justify-center rounded-full border-white/16 bg-[rgba(255,252,247,0.97)] px-[clamp(1rem,2vw,1.6rem)] py-[clamp(0.6rem,1.1vh,0.75rem)] text-center shadow-[0_10px_22px_rgba(20,14,11,0.11)]",
    props.interactive &&
      "hover:-translate-y-px hover:border-primary/22 hover:bg-white/98",
    props.state === "muted" &&
      "border-warm-border-soft bg-[rgba(250,245,239,0.88)] text-[color:var(--text-muted)] shadow-none",
    props.state === "selected" &&
      "border-primary/70 bg-[linear-gradient(135deg,rgba(255,244,233,0.99)_0%,rgba(242,203,179,0.99)_100%)] text-[color:var(--text-strong)] shadow-[0_18px_38px_rgba(207,123,82,0.28),inset_0_1px_0_rgba(255,255,255,0.86)] ring-2 ring-primary/32",
    props.state === "success" &&
      "border-[rgba(94,122,88,0.34)] bg-[rgba(234,243,232,0.98)] text-[#455643]",
    props.state === "danger" &&
      "border-[rgba(163,78,78,0.28)] bg-[rgba(252,239,239,0.98)] text-[#7d4242]",
    props.disabled && "disabled:cursor-not-allowed",
  ),
)

const isDisabled = computed(() => props.disabled || !props.interactive)
</script>

<template>
  <motion.button
    type="button"
    :disabled="isDisabled"
    :class="classes"
    v-bind="motionProps"
  >
    <slot />
  </motion.button>
</template>
