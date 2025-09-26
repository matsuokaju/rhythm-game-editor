<template>
  <div class="timeline-editor">
    <div class="timeline-container" ref="timelineContainer">
      <div class="timeline-grid" :style="{ height: `${totalHeight}px` }">
        <!-- レーン背景 -->
        <div
          v-for="lane in 6"
          :key="`lane-${lane - 1}`"
          class="lane"
          :class="{ 'lane-odd': lane % 2 === 1 }"
          :style="{ left: `${(lane - 1) * laneWidth}px`, width: `${laneWidth}px` }"
        ></div>

        <!-- 小節線とビート線 -->
        <div class="timing-lines">
          <div
            v-for="line in timingLines"
            :key="`line-${line.measure}-${line.beat}`"
            class="timing-line"
            :class="{ 'measure-line': line.beat === 0, 'beat-line': line.beat !== 0 }"
            :style="{ top: `${line.y}px` }"
          >
            <span v-if="line.beat === 0" class="measure-number">{{ line.measure }}</span>
          </div>
        </div>

        <!-- ノート表示 -->
        <div class="notes">
          <div
            v-for="(note, index) in visibleNotes"
            :key="`note-${index}`"
            class="note"
            :class="`note-${note.type}`"
            :style="getNoteStyle(note)"
            @click="selectNote(index)"
          >
            <div v-if="note.type === 'hold'" class="hold-tail" :style="getHoldTailStyle(note)"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- コントロールパネル -->
    <div class="control-panel">
      <div class="zoom-controls">
        <button @click="zoomIn">拡大</button>
        <button @click="zoomOut">縮小</button>
        <span>{{ Math.round(zoom * 100) }}%</span>
      </div>
      <div class="measure-info">
        <span>表示範囲: {{ visibleMeasureRange.start }} - {{ visibleMeasureRange.end }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useChartStore, type Note } from '../stores/chart'

const chartStore = useChartStore()

// 参照
const timelineContainer = ref<HTMLElement>()

// 表示設定
const laneWidth = 80
const beatHeight = ref(60)
const zoom = ref(1)
const scrollTop = ref(0)

// 表示される小節の高さを計算
const getMeasureHeight = (measure: number) => {
  const timeSignature = chartStore.getTimeSignatureAt(measure, 0)
  return timeSignature[0] * beatHeight.value * zoom.value
}

// 全体の高さを計算
const totalHeight = computed(() => {
  let height = 0
  const maxMeasure = Math.max(
    10, // 最低10小節表示
    ...chartStore.timingPoints.map(tp => tp.measure),
    ...chartStore.notes.map(note => note.measure)
  )
  
  for (let measure = 1; measure <= maxMeasure; measure++) {
    height += getMeasureHeight(measure)
  }
  return height
})

// 小節・ビート線のデータを生成
const timingLines = computed(() => {
  const lines: Array<{ measure: number; beat: number; y: number }> = []
  let currentY = 0
  
  const maxMeasure = Math.max(
    10,
    ...chartStore.timingPoints.map(tp => tp.measure),
    ...chartStore.notes.map(note => note.measure)
  )
  
  for (let measure = 1; measure <= maxMeasure; measure++) {
    const timeSignature = chartStore.getTimeSignatureAt(measure, 0)
    const measureHeight = getMeasureHeight(measure)
    const beatHeightInMeasure = measureHeight / timeSignature[0]
    
    // 小節線
    lines.push({ measure, beat: 0, y: currentY })
    
    // ビート線
    for (let beat = 1; beat < timeSignature[0]; beat++) {
      lines.push({ 
        measure, 
        beat, 
        y: currentY + beat * beatHeightInMeasure 
      })
    }
    
    currentY += measureHeight
  }
  
  return lines
})

// 表示範囲の小節を計算
const visibleMeasureRange = computed(() => {
  const containerHeight = timelineContainer.value?.clientHeight || 600
  let currentY = 0
  let start = 1
  let end = 1
  
  const maxMeasure = Math.max(
    10,
    ...chartStore.timingPoints.map(tp => tp.measure),
    ...chartStore.notes.map(note => note.measure)
  )
  
  for (let measure = 1; measure <= maxMeasure; measure++) {
    const measureHeight = getMeasureHeight(measure)
    
    if (currentY + measureHeight >= scrollTop.value && start === 1) {
      start = measure
    }
    
    if (currentY <= scrollTop.value + containerHeight) {
      end = measure
    }
    
    currentY += measureHeight
  }
  
  return { start: Math.max(1, start - 1), end: Math.min(maxMeasure, end + 1) }
})

// 表示されるノートを計算
const visibleNotes = computed(() => {
  return chartStore.notes.filter(note => 
    note.measure >= visibleMeasureRange.value.start && 
    note.measure <= visibleMeasureRange.value.end
  )
})

// ノートの位置とスタイルを計算
const getNoteStyle = (note: Note) => {
  const y = getNoteY(note.measure, note.beat)
  const x = note.lane * laneWidth + 5
  
  return {
    position: 'absolute' as const,
    left: `${x}px`,
    top: `${y}px`,
    width: `${laneWidth - 10}px`,
    height: '20px',
    zIndex: 10
  }
}

// ホールドノートの尻尾のスタイル
const getHoldTailStyle = (note: Note) => {
  if (note.type !== 'hold' || !note.duration) return {}
  
  const startY = getNoteY(note.measure, note.beat)
  const endY = getNoteY(note.measure, note.beat + note.duration)
  const height = endY - startY
  
  return {
    position: 'absolute' as const,
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '4px',
    height: `${height - 20}px`,
    backgroundColor: '#4CAF50',
    zIndex: 5
  }
}

// 小節・拍からY座標を計算
const getNoteY = (measure: number, beat: number) => {
  let y = 0
  
  // 指定された小節までの累積高さ
  for (let m = 1; m < measure; m++) {
    y += getMeasureHeight(m)
  }
  
  // 小節内での位置
  const timeSignature = chartStore.getTimeSignatureAt(measure, 0)
  const measureHeight = getMeasureHeight(measure)
  const beatHeightInMeasure = measureHeight / timeSignature[0]
  y += beat * beatHeightInMeasure
  
  return y
}

// ズーム機能
const zoomIn = () => {
  zoom.value = Math.min(3, zoom.value * 1.2)
}

const zoomOut = () => {
  zoom.value = Math.max(0.3, zoom.value * 0.8)
}

// ノート選択
const selectNote = (index: number) => {
  console.log('Selected note:', chartStore.notes[index])
}

// スクロール監視
const handleScroll = () => {
  if (timelineContainer.value) {
    scrollTop.value = timelineContainer.value.scrollTop
  }
}

onMounted(() => {
  if (timelineContainer.value) {
    timelineContainer.value.addEventListener('scroll', handleScroll)
  }
})

onUnmounted(() => {
  if (timelineContainer.value) {
    timelineContainer.value.removeEventListener('scroll', handleScroll)
  }
})
</script>

<style scoped>
.timeline-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1a1a1a;
  color: #fff;
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  background: #2a2a2a;
}

.timeline-grid {
  position: relative;
  width: 480px; /* 6レーン × 80px */
  margin: 0 auto;
}

/* レーン背景 */
.lane {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.05);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.lane-odd {
  background: rgba(255, 255, 255, 0.02);
}

/* タイミング線 */
.timing-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
}

.timing-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  z-index: 2;
}

.measure-line {
  background: rgba(255, 255, 255, 0.8);
  height: 2px;
}

.beat-line {
  background: rgba(255, 255, 255, 0.3);
}

.measure-number {
  position: absolute;
  left: -30px;
  top: -10px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 6px;
  border-radius: 3px;
}

/* ノート */
.notes {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
}

.note {
  border-radius: 3px;
  cursor: pointer;
  transition: transform 0.1s;
}

.note:hover {
  transform: scale(1.05);
}

.note-tap {
  background: linear-gradient(45deg, #FF6B6B, #FF8E8E);
  border: 2px solid #FF4757;
}

.note-hold {
  background: linear-gradient(45deg, #4ECDC4, #26D0CE);
  border: 2px solid #00CEC9;
}

.hold-tail {
  background: linear-gradient(to bottom, #4ECDC4, #26D0CE);
  border-radius: 2px;
}

/* コントロールパネル */
.control-panel {
  background: #333;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #555;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.zoom-controls button {
  background: #555;
  color: #fff;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
}

.zoom-controls button:hover {
  background: #666;
}

.measure-info {
  font-size: 12px;
  color: #ccc;
}
</style>