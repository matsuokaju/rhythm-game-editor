<template>
  <div class="timeline-editor">
    <div class="timeline-container" 
         ref="timelineContainer"
         @mousedown="handleMouseDown"
         @mousemove="handleMouseMove"
         @mouseup="handleMouseUp"
         @mouseleave="handleMouseUp">
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
          <!-- 実際のノート -->
          <div
            v-for="(note, index) in visibleNotes"
            :key="`note-${index}`"
            class="note"
            :class="`note-${note.type}`"
            :style="getNoteStyle(note)"
            @click="selectNote(index)"
            @contextmenu.prevent="deleteNote(index)"
          >
            <div v-if="note.type === 'hold'" class="hold-tail" :style="getHoldTailStyle()"></div>
          </div>
          
          <!-- プレビューノート -->
          <div
            v-if="previewNote"
            class="note note-preview"
            :class="`note-${previewNote.type}`"
            :style="getNoteStyle(previewNote)"
          >
            <div v-if="previewNote.type === 'hold'" class="hold-tail" :style="getHoldTailStyle()"></div>
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
const beatHeight = ref(120) // 60から120に変更（2倍）
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

// 小節・ビート線のデータを生成（下から上に流れるように反転）
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
    lines.push({ measure, beat: 0, y: totalHeight.value - currentY })
    
    // ビート線
    for (let beat = 1; beat < timeSignature[0]; beat++) {
      lines.push({ 
        measure, 
        beat, 
        y: totalHeight.value - (currentY + beat * beatHeightInMeasure)
      })
    }
    
    currentY += measureHeight
  }
  
  return lines
})

// 表示範囲の小節を計算（下から上に流れる表示に対応）
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
  
  // スクロール位置を下から上の座標系に変換
  const scrollFromBottom = totalHeight.value - scrollTop.value - containerHeight
  const scrollTopFromBottom = totalHeight.value - scrollTop.value
  
  for (let measure = 1; measure <= maxMeasure; measure++) {
    const measureHeight = getMeasureHeight(measure)
    
    if (currentY + measureHeight >= scrollFromBottom && start === 1) {
      start = measure
    }
    
    if (currentY <= scrollTopFromBottom) {
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
  
  // ホールドノートの場合は高さを変更
  if (note.type === 'hold' && note.duration) {
    const endY = getNoteY(note.measure, note.beat + note.duration)
    
    // 開始位置と終了位置の上の方をtopとし、下の方までの距離を高さとする
    const topY = Math.min(y, endY)
    const bottomY = Math.max(y, endY)
    const height = bottomY - topY + 15 // ノートの厚み分を追加
    
    return {
      position: 'absolute' as const,
      left: `${x}px`,
      top: `${topY}px`, // より上の位置から開始
      width: `${laneWidth - 10}px`,
      height: `${height}px`,
      zIndex: 10
    }
  }
  
  // タップノートの場合はそのまま
  return {
    position: 'absolute' as const,
    left: `${x}px`,
    top: `${y}px`,
    width: `${laneWidth - 10}px`,
    height: '15px',
    zIndex: 10
  }
}

// ホールドノートの尻尾のスタイル（新しいデザインでは使用しない）
const getHoldTailStyle = () => {
  // 新しいデザインでは尻尾は表示しない
  return { display: 'none' }
}

// 小節・拍からY座標を計算（下から上に流れるように反転、ノート中央が拍位置に来るよう調整）
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
  
  // 下から上に流れるように反転（総高さから引く）
  // ノートの中央が拍位置に来るように、ノートの高さの半分（7.5px）を引く
  return totalHeight.value - y - 7.5
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

// ノート削除
const deleteNote = (index: number) => {
  // visibleNotesのインデックスから実際のnotesの中のインデックスを見つける
  const noteToDelete = visibleNotes.value[index]
  const actualIndex = chartStore.notes.findIndex(note => 
    note.measure === noteToDelete.measure &&
    note.beat === noteToDelete.beat &&
    note.lane === noteToDelete.lane &&
    note.type === noteToDelete.type
  )
  
  if (actualIndex !== -1) {
    chartStore.removeNote(actualIndex)
  }
}

// ドラッグ状態管理
const isDragging = ref(false)
const dragStartTime = ref(0)
const dragStartPosition = ref<{ measure: number; beat: number; lane: number } | null>(null)
const previewNote = ref<Note | null>(null)

// マウス座標から小節・拍・レーンを計算（改良版）
const getPositionFromMouseEvent = (event: MouseEvent) => {
  if (!timelineContainer.value) return null
  
  const rect = timelineContainer.value.getBoundingClientRect()
  const y = event.clientY - rect.top + scrollTop.value
  
  // レーンを計算（タイムライングリッドは中央寄せ）
  const gridRect = timelineContainer.value.querySelector('.timeline-grid')?.getBoundingClientRect()
  if (!gridRect) return null
  
  const relativeX = event.clientX - gridRect.left
  const lane = Math.floor(relativeX / laneWidth)
  
  // レーン範囲外の場合は無視
  if (lane < 0 || lane >= 6) return null
  
  // 下から上の座標系に変換
  const adjustedY = totalHeight.value - y // 単純に反転するだけ
  
  let currentY = 0
  const maxMeasure = Math.max(
    10,
    ...chartStore.timingPoints.map(tp => tp.measure),
    ...chartStore.notes.map(note => note.measure)
  )
  
  for (let measure = 1; measure <= maxMeasure; measure++) {
    const measureHeight = getMeasureHeight(measure)
    
    if (adjustedY >= currentY && adjustedY < currentY + measureHeight) {
      const timeSignature = chartStore.getTimeSignatureAt(measure, 0)
      const positionInMeasure = adjustedY - currentY
      const beat = (positionInMeasure / measureHeight) * timeSignature[0]
      
      // 1/4拍単位にスナップ
      const snappedBeat = Math.round(beat * 4) / 4
      
      return { measure, beat: Math.max(0, snappedBeat), lane }
    }
    
    currentY += measureHeight
  }
  
  return null
}

// 新しいイベントハンドラー
const handleMouseDown = (event: MouseEvent) => {
  console.log('Mouse down detected')
  
  // ノートクリックの場合は処理しない
  if ((event.target as HTMLElement).classList.contains('note')) {
    return
  }
  
  const position = getPositionFromMouseEvent(event)
  console.log('Position from mouse:', position)
  
  if (!position) return
  
  isDragging.value = true
  dragStartTime.value = Date.now()
  dragStartPosition.value = position
  previewNote.value = {
    measure: position.measure,
    beat: position.beat,
    lane: position.lane,
    type: 'tap'
  }
  
  console.log('Started drag at:', position)
}

const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value || !dragStartPosition.value) return
  
  const currentPosition = getPositionFromMouseEvent(event)
  if (!currentPosition) return
  
  console.log('Mouse move:', currentPosition)
  
  // ドラッグ時間が200ms以上の場合はホールドノート
  const dragDuration = Date.now() - dragStartTime.value
  if (dragDuration > 200) {
    const startPos = dragStartPosition.value
    
    // 開始位置と終了位置を計算（絶対的な拍位置で計算）
    const startAbsoluteBeat = (startPos.measure - 1) * 4 + startPos.beat
    const endAbsoluteBeat = (currentPosition.measure - 1) * 4 + currentPosition.beat
    
    // 上向きにドラッグした場合（終了位置の方が小さい場合）
    if (endAbsoluteBeat < startAbsoluteBeat) {
      // 終了位置を開始位置として使用
      previewNote.value = {
        measure: currentPosition.measure,
        beat: currentPosition.beat,
        lane: currentPosition.lane,
        type: 'hold',
        duration: Math.max(0.25, startAbsoluteBeat - endAbsoluteBeat)
      }
    } else {
      // 下向きにドラッグした場合（通常通り）
      previewNote.value = {
        measure: startPos.measure,
        beat: startPos.beat,
        lane: startPos.lane,
        type: 'hold',
        duration: Math.max(0.25, endAbsoluteBeat - startAbsoluteBeat)
      }
    }
  }
}

const handleMouseUp = () => {
  console.log('Mouse up detected')
  
  if (!isDragging.value || !previewNote.value) {
    isDragging.value = false
    dragStartPosition.value = null
    previewNote.value = null
    return
  }
  
  // ノートを追加
  chartStore.addNote(previewNote.value)
  console.log('Added note:', previewNote.value)
  
  // 状態をリセット
  isDragging.value = false
  dragStartPosition.value = null
  previewNote.value = null
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
    // 初期位置を最下部（小節1が見える位置）に設定
    setTimeout(() => {
      if (timelineContainer.value) {
        timelineContainer.value.scrollTop = timelineContainer.value.scrollHeight - timelineContainer.value.clientHeight
      }
    }, 100)
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
  cursor: crosshair;
  user-select: none;
  z-index: 1;
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
  transition: background-color 0.2s, border-color 0.2s;
  background: #ffffff;
  border: 2px solid #cccccc;
}

.note:hover {
  background: #ffeb3b;
  border-color: #ffc107;
}

.note-hold {
  border-radius: 6px;
  opacity: 0.9;
  /* 基本の白色スタイルを継承 */
}

.note-hold:hover {
  background: linear-gradient(to bottom, #ffeb3b, #ffc107, #ffeb3b);
  border-color: #ff9800;
}

.note-preview {
  opacity: 0.6;
  border-style: dashed !important;
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