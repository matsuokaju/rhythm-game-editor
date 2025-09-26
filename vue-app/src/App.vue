<script setup lang="ts">
import TimelineEditor from './components/TimelineEditor.vue'
</script>

<template>
  <div class="app">
    <header>
      <h1>Rhythm Game Chart Editor</h1>
      <div class="header-info">
        <span>音ゲー譜面制作ツール</span>
      </div>
    </header>

    <main>
      <TimelineEditor />
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #1a1a1a;
  color: #fff;
}

#app {
  height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  background: #2d2d2d;
  padding: 10px 20px;
  border-bottom: 1px solid #555;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

header h1 {
  font-size: 24px;
  color: #fff;
  margin: 0;
}

.header-info {
  font-size: 14px;
  color: #ccc;
}

main {
  flex: 1;
  overflow: hidden;
}
</style>
