<script setup lang="ts">
import { NRadioButton, NRadioGroup } from 'naive-ui'
import { useRange } from './useRange'

const range = useRange()
</script>

<template>
  <NRadioGroup v-model:value="range" size="small" data-testid="range-select">
    <NRadioButton value="24h" label="24 hours" />
    <NRadioButton value="7d" label="7 days" />
    <NRadioButton value="30d" label="30 days" />
  </NRadioGroup>
</template>
