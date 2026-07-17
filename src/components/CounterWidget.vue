<template>
  <div class="counter-widget">
    <div class="counter-header">🔢 Counter</div>
    <div class="counter-body">
      <span>{{ count }}</span>
      <div class="controls">
        <button @click.stop="count--">-</button>
        <button @click.stop="count++">+</button>
      </div}
    </div}
  </div}
</template>

<script setup>
import { ref } from 'vue';
const props = defineProps(['data']);
const count = ref(props.data.value || 0);
</script>

<style scoped>
.counter-widget {
  width: 120px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  overflow: hidden;
  cursor: move;
}
.counter-header {
  background: #eee;
  font-size: 12px;
  padding: 4px 8px;
  border-bottom: 1px solid #ddd;
}
.counter-body {
  display: flex;
  align-items: center;
  justify Content: space-between;
  padding: 10px;
}
.counter-body span {
  font-size: 18px;
  font-weight: bold;
}
.controls button {
  padding: 2px 8px;
  margin-left: 4px;
  cursor: pointer;
}
</style>
