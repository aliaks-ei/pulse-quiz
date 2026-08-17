<script setup lang="ts">
import { computed, useId } from "vue"

import { cn } from "@/lib/utils"

const model = defineModel<string | null>({ required: true })

const props = withDefaults(
  defineProps<{
    id?: string
    placeholder?: string
    rows?: number
    tone?: "default" | "warm"
  }>(),
  {
    id: undefined,
    placeholder: "",
    rows: 4,
    tone: "default",
  },
)

const textareaId = computed(() => props.id ?? useId())

const classes = computed(() =>
  cn(
    "flex w-full rounded-[1.1rem] border px-4 py-3.5 text-[0.96rem] outline-none transition focus:ring-2 focus:ring-primary/12",
    props.tone === "warm"
      ? "border-warm-border-strong bg-white/96 text-foreground placeholder:text-[color:var(--text-subtle)] focus:border-primary focus:bg-white"
      : "border-warm-border-strong bg-white/94 text-foreground placeholder:text-[color:var(--text-subtle)] focus:border-primary/45 focus:bg-white",
  ),
)
</script>

<template>
  <textarea
    :id="textareaId"
    v-model="model"
    :rows="rows"
    :placeholder="placeholder"
    :class="classes"
  />
</template>
