<script setup lang="ts">
import { computed } from 'vue'
import { NModal } from 'naive-ui'
import { comboKeys, type Shortcut } from './shortcuts'

/** Keyboard shortcut cheat sheet (`?`), generated from the registered shortcuts. */
const props = defineProps<{ shortcuts: Shortcut[] }>()
const show = defineModel<boolean>('show', { required: true })

const GROUPS = ['Selection', 'Edit', 'Arrange', 'View', 'Help'] as const

const MOUSE = [
  ['Pan', 'Drag empty canvas · Space + drag · two-finger scroll'],
  ['Zoom', 'Ctrl/⌘ + wheel · pinch'],
  ['Box select', 'Shift + drag on empty canvas'],
  ['Use a chart or table', 'Click it first; then wheel and drag go to it'],
  ['Move without snapping', 'Hold Alt while dragging'],
  ['Rename a group', 'Double-click its title'],
]

const sections = computed(() =>
  GROUPS.map((group) => ({
    group,
    items: props.shortcuts
      .filter((s) => (s.group ?? 'Edit') === group)
      .map((s) => ({
        description: s.description,
        combos: (Array.isArray(s.combo) ? s.combo : [s.combo])
          // Shift variants of nudges and alternative zoom keys add noise here.
          .filter((c, i) => i === 0 || !c.startsWith('shift+arrow'))
          .slice(0, 2)
          .map(comboKeys),
      })),
  })).filter((s) => s.items.length),
)
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    title="Keyboard shortcuts"
    style="width: 720px; max-width: calc(100vw - 32px)"
    data-testid="shortcuts-dialog"
  >
    <div class="sheet">
      <section v-for="section in sections" :key="section.group" class="sheet__section">
        <h3>{{ section.group }}</h3>
        <dl>
          <template v-for="item in section.items" :key="item.description">
            <dt>{{ item.description }}</dt>
            <dd>
              <span v-for="(keys, i) in item.combos" :key="i" class="sheet__combo">
                <kbd v-for="key in keys" :key="key">{{ key }}</kbd>
              </span>
            </dd>
          </template>
        </dl>
      </section>
      <section class="sheet__section">
        <h3>Mouse</h3>
        <dl>
          <template v-for="[action, how] in MOUSE" :key="action">
            <dt>{{ action }}</dt>
            <dd class="sheet__how">{{ how }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </NModal>
</template>

<style scoped>
.sheet {
  columns: 2 300px;
  column-gap: 32px;
}

.sheet__section {
  break-inside: avoid;
  margin-bottom: 16px;
}

h3 {
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;
}

dd {
  margin: 0;
  text-align: right;
}

.sheet__combo + .sheet__combo::before {
  content: ' or ';
  color: var(--app-text-muted);
}

.sheet__how {
  max-width: 220px;
  font-size: 12px;
}

kbd {
  display: inline-block;
  min-width: 20px;
  margin-left: 3px;
  padding: 0 5px;
  border: 1px solid var(--app-border);
  border-bottom-width: 2px;
  border-radius: 4px;
  font: 12px/18px inherit;
  text-align: center;
}
</style>
