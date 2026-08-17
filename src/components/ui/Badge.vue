<script setup lang="ts">
import { computed } from "vue"

import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    tone?: "default" | "accent" | "success"
  }>(),
  {
    tone: "default",
  },
)

const classes = computed(() =>
  cn(
    "inline-flex items-center rounded-full border px-3.5 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em]",
    props.tone === "default" &&
      "border-warm-border-strong bg-white/84 text-[color:var(--text-muted)]",
    props.tone === "accent" &&
      "border-[rgba(207,123,82,0.24)] bg-[rgba(207,123,82,0.16)] text-[color:var(--color-primary)]",
    props.tone === "success" &&
      "border-[rgba(255,255,255,0.18)] bg-[#51624f] text-white shadow-[0_10px_22px_rgba(37,52,35,0.22)]",
  ),
)
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
