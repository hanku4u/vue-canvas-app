<script setup lang="ts">
import { computed, ref } from 'vue'
import { NSelect, type SelectOption } from 'naive-ui'
import { useUserSearch } from '@/api/sharing'
import type { UserRef } from '@/api/types'

/** Search known users by name or knox id. Users in `exclude` aren't offered. */
const props = defineProps<{ exclude: string[]; placeholder?: string }>()
const emit = defineEmits<{ pick: [user: UserRef] }>()

const search = ref('')
const users = useUserSearch(search)
const options = computed<SelectOption[]>(() =>
  (users.data.value ?? [])
    .filter((u) => !props.exclude.includes(u.knoxId))
    .map((u) => ({ label: `${u.displayName} (${u.knoxId})`, value: u.knoxId })),
)

function pick(knoxId: string | null): void {
  const user = users.data.value?.find((u) => u.knoxId === knoxId)
  if (user) emit('pick', user)
}
</script>

<template>
  <NSelect
    size="small"
    filterable
    remote
    clearable
    :value="null"
    :options="options"
    :loading="users.isFetching.value"
    :placeholder="placeholder ?? 'Add a person…'"
    :input-props="{ 'aria-label': placeholder ?? 'Add a person' }"
    data-testid="user-picker"
    @search="(q: string) => (search = q)"
    @update:value="pick"
  />
</template>
