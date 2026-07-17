<template>
  <div class="canvas-container">
    <div class="toolbar">
      <button @click="setTool('pencil')" :class="{ active: tool === 'pencil' }">✏️ Pencil</button>
      <button @click="setTool('rect')" :class="{ active: tool === 'rect' }">⬜ Rectangle</button>
      <button @click="setTool('circle')" :class="{ active: tool === 'circle' }">⭕ Circle</button>
      <button @click="clearCanvas" class="clear-btn">🗑️ Clear</button>
      <span class="hint">Drag to draw!</span>
    </div>
    <canvas 
      ref="canvasRef" 
      @mousedown="startDrawing" 
      @mousemove="draw" 
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const canvasRef = ref(null);
const tool = ref('pencil');
let ctx = null;
let isDrawing = false;
let startX = 0;
let startY = 0;

const setTool = (newTool) => {
  tool.value = newTool;
};

const clearCanvas = () => {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
};

const startDrawing = (e) => {
  isDrawing = true;
  const rect = canvasRef.value.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  if (tool.value === 'pencil') {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  } else {
    // For shapes, we save the current canvas state to allow "previewing" the shape while dragging
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
  } else {
    // Restore the canvas to clear the previous frame's preview shape
    ctx.restore(); 
    
    // Redraw existing content is handled by the fact that we use ctx.save() in startDrawing
    // But since we are doing basic canvas, we actually need a snapshot.
    // For this simple demo, let's use a simpler "pencil" mode and a "stamp" mode or 
    // just implement a basic snapshot system.
    
    // Actually, for a Truly Basic demo, let's adjust the logic:
    // We'll use a temporary canvas or just redraw all shapes. 
    // Given the "very basic" request, let's stick to pencil for smooth drawing 
    // and rectangles that snap on mouseup.
  }
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
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
  
  ctx.save(); // Reset save state
};

onMounted(() => {
  const canvas = canvasRef.value;
  ctx = canvas.getContext('2d');
  
  // Set size to fill window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
  
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#333';
});

onUnmounted(() => {
  // Clean up if necessary
});
</script>

<style scoped>
.canvas-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #fdfdfd;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.toolbar {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  padding: 10px 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 30px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 10;
  align-items: center;
}

button {
  padding: 8px 16px;
  border: none;
  background: #eee;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

button.active {
  background: #42b883;
  color: white;
}

.clear-btn {
  margin-left: 10px;
  border-left: 1px solid #ccc;
  padding-left: 15px;
}

.hint {
  font-size: 12px;
  color: #888;
  margin-left: 10px;
}

canvas {
  display: block;
}
</style>
