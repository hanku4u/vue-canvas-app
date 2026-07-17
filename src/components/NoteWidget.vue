<template>
  <div class="note-widget">
    <div class="note-header">📌 Note</div>
    <textarea v-model="content" placeholder="Type something..."></textarea>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const props = defineProps(['data']);
const content = ref(props.data.content || '');
</script>

<style scoped>
.note-widget {
  width: 150px;
  height: 150px;
  background: #fff9c4;
  border: 1px solid #fbc02d;
  box-shadow: 2px 2px 5px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  cursor: move;
}
.note-header {
  background: #fbc02d;
  color: #444;
  font-size: 12px;
  font-weight: bold;
  padding: 4px 8px;
  user-select: none;
}
textarea {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  padding: 10px;
  resize: none;
  font-family: inherit;
  box-sizing: border-box;
}
</style>
