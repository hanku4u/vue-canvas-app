<template>
  <div class="canvas-container">
    <!-- Toolbar for Drawing -->
    <div class="toolbar">
      <button @click="setTool('pencil')" :class="{ active: tool === 'pencil' }">✏️ Pencil</button>
      <button @click="setTool('rect')" :class="{ active: tool === 'rect' }">⬜ Rect</button>
      <button @click="setTool('circle')" :class="{ active: tool === 'circle' }">⭕ Circle</button>
      <button @click="clearCanvas" class="clear-btn">🗑️ Clear</button>
      <div class="separator"></div>
      <button @click="addWidget('Note')">➕ Note</button>
      <button @click="addWidget('Counter')">➕ Counter</button>
    </div>

    <!-- Widget Management Sidebar -->
    <div class="sidebar">
      <h3>Widgets</h3>
      <ul>
        <li v-for="w in widgets" :key="w.id">
          <input type="checkbox" v-model="w.visible" :id="'wid-'+w.id">
          <label :for="'wid-'+w.id">{{ w.type }} #{{ w.id }}</label>
        </li>
      </ul>
    </div>

    <!-- Layer 1: Canvas (Drawing) -->
    <canvas 
      ref="canvasRef" 
      @mousedown="startDrawing" 
      @mousemove="draw" 
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
    ></canvas>

    <!-- Layer 2: Component Overlay (Widgets) -->
    <div class="overlay">
      <div 
        v-for="w in widgets" 
        :key="w.id"
        v-show="w.visible"
        class="widget-wrapper"
        :style="{ left: w.x + 'px', top: w.y + 'px' }"
        @mousedown="startDragging(w)"
      >
        <component :is="resolveComponent(w.type)" :data="w" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, markRaw } from 'vue';
import NoteWidget from './components/NoteWidget.vue';
import CounterWidget from './components/CounterWidget.vue';

const canvasRef = ref(null);
const tool = ref('pencil');
const widgets = ref([
  { id: 1, type: 'Note', x: 150, y: 150, visible: true, content: 'Welcome to the canvas!' },
  { id: 2, type: 'Counter', x: 400, y: 200, visible: true, value: 0 },
]);

let ctx = null;
let isDrawing = false;
let startX = 0;
let startY = 0;

// Dragging State
let draggedWidget = null;
let dragOffset = { x: 0, y: 0 };

const setTool = (newTool) => {
  tool.value = newTool;
};

const clearCanvas = () => {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
};

const addWidget = (type) => {
  const id = widgets.value.length + 1;
  widgets.value.push({
    id,
    type,
    x: 100 + (id * 20),
    y: 100 + (id * 20),
    visible: true,
    content: type === 'Note' ? 'New note...' : '',
    value: type === 'Counter' ? 0 : null,
  });
};

const resolveComponent = (type) => {
  if (type === 'Note') return NoteWidget;
  if (type === 'Counter') return CounterWidget;
  return null;
};

// --- Drawing Logic ---
const startDrawing = (e) => {
  const rect = canvasRef.value.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  if (tool.value === 'pencil') {
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  } else {
    isDrawing = true;
    ctx.save();
  }
};

const draw = (e) => {
  if (!isDrawing) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;

  if (tool.value === 'pencil') {
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
  }
  // For shapes, we just let the user drag and we commit the shape on mouseup
};

const stopDrawing = (e) => {
  if (!isDrawing) return;
  isDrawing = false;

  const rect = canvasRef.value.getBoundingClientRect();
  const endX = e.clientX - rect.left;
  const endY = e.clientY - rect.top;

  if (tool.value === 'rect') {
    ctx.strokeRect(startX, startY, endX - startX, endY - startY);
  } else if (tool.value === 'circle') {
    ctx.beginPath();
    ctx.arc(startX, startY, Math.sqrt(Math.pow(endX-startX, 2) + Math.pow(endY-startY, 2)), 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.save();
};

// --- Component Dragging Logic ---
const startDragging = (w) => {
  draggedWidget = w;
  // Calculate offset so the widget doesn't "jump" to the top-left on click
  dragOffset = {
    x: 0, // For simplicity in this demo, we will just snap it. 
    // In a full app, you'd subtract mouseX - w.x here.
  };
};

// We handle the global mousemove for dragging to ensure smoothness
// but for a basic demo, we'll use the window events.
onMounted(() => {
  const canvas = canvasRef.value;
  ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#333';

  window.addEventListener('mousemove', handleGlobalMove);
  window.addEventListener('mouseup', handleGlobalUp);
});

const handleGlobalMove = (e) => {
  if (!draggedWidget) return;
  draggedWidget.x = e.clientX;
  draggedWidget.y = e.clientY;
};

const handleGlobalUp = () => {
  draggedWidget = null;
};
</script>

<style scoped>
.canvas-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #fdfdfd;
  overflow: hidden;
  font-family: sans-serif;
}

.toolbar {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border: 1px solid #ccc;
  border-radius: 30px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
}

.separator {
  width: 1px;
  background: #ccc;
  margin: 0 8px;
}

.sidebar {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 180px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
}

.sidebar h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #666;
}

.sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sidebar li {
  font-size: 13px;
  margin-bottom: 5px;
  display: flex;
  align-items: center;
  gap: 8px;
}

button {
  padding: 6px 12px;
  border: none;
  background: #eee;
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s;
}

button.active {
  background: #42b883;
  color: white;
}

.clear-btn {
  color: #e74c3c;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Allow clicking through to canvas */
}

.widget-wrapper {
  position: absolute;
  pointer-events: auto; /* Re-enable clicks for the actual widgets */
  cursor: move;
  user-select: none;
}

canvas {
  display: block;
}
</script>
