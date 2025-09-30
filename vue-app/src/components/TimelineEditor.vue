<template>
  <div class="timeline-editor">
    <!-- コントロールパネル（左側） -->
    <div class="control-panel">

      
      <div class="zoom-controls">
        <h3>ズーム</h3>
        <div class="zoom-slider-container">
          <span class="zoom-value">{{ Math.round(zoom * 100) }}%</span>
          <input 
            type="range" 
            min="50" 
            max="200" 
            step="10" 
            :value="Math.round(zoom * 100)" 
            @input="handleZoomChange"
            class="zoom-slider"
          />
          <div class="zoom-labels">
            <span>50%</span>
            <span>200%</span>
          </div>
        </div>
      </div>
      
      <div class="audio-controls">
        <h3>音声</h3>
        <input 
          type="file" 
          accept="audio/*" 
          @change="handleAudioFileChange"
          ref="audioFileInput"
          class="audio-file-input"
        />
        <div v-if="audioFile" class="audio-info">
          {{ audioFile.name }}
        </div>
        <div class="playback-controls">
          <button @click="playAudio" :disabled="!audioFile" class="play-btn">
            {{ isPlaying ? '⏸️' : '▶️' }}
          </button>
          <button @click="stopAudio" :disabled="!audioFile" class="stop-btn">
            ⏹️
          </button>
          <span v-if="audioFile" class="time-display">
            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
          </span>
        </div>
        <div v-if="audioFile" class="volume-controls">
          <label>音量: {{ Math.round(volume * 100) }}%</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            step="5" 
            :value="Math.round(volume * 100)" 
            @input="handleVolumeChange"
            class="volume-slider"
          />
        </div>
      </div>

      <div class="edit-type-toggle">
        <h3>編集対象</h3>
        <div class="toggle-buttons">
          <button 
            @click="setEditType('notes')" 
            :class="{ active: editType === 'notes' }">
            ノーツ
          </button>
          <button 
            @click="setEditType('timing')" 
            :class="{ active: editType === 'timing' }">
            タイミング
          </button>
        </div>
      </div>

      <div class="action-mode-controls">
        <h3>{{ editType === 'notes' ? 'ノーツ' : 'タイミング' }}操作</h3>
        <div class="action-buttons">
          <button 
            @click="setActionMode('select')" 
            :class="{ active: actionMode === 'select' }">
            選択
          </button>
          <button 
            @click="setActionMode('edit')" 
            :class="{ active: actionMode === 'edit' }">
            {{ editType === 'notes' ? '配置' : '設定' }}
          </button>
          <button 
            @click="setActionMode('delete')" 
            :class="{ active: actionMode === 'delete' }">
            削除
          </button>
        </div>
        <div class="mode-info">{{ getActionModeDescription() }}</div>
      </div>
    </div>

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
          </div>
        </div>

        <!-- BPM・拍子変更の青色横線 -->
        <div class="timing-change-lines">
          <div
            v-for="info in timingChangeLabels"
            :key="`timing-line-${info.measure}-${info.beat}`"
            class="timing-change-line"
            :style="{ top: `${info.y}px` }"
          >
          </div>
        </div>

        <!-- 小節番号ラベル（左側） -->
        <div class="measure-number-labels">
          <div
            v-for="info in measureNumberLabels"
            :key="`measure-${info.measure}`"
            class="measure-number-label"
            :style="{ top: `${info.y}px` }"
          >
            {{ info.measure }}
          </div>
        </div>

        <!-- BPM・拍子変更表示（右側） -->
        <div class="timing-change-labels timing-change-labels-right">
          <div
            v-for="info in timingChangeLabels"
            :key="`timing-change-${info.measure}-${info.beat}`"
            class="timing-change-label timing-change-label-right"
            :class="{ 
              'clickable': editType === 'timing',
              'delete-mode': editType === 'timing' && actionMode === 'delete'
            }"
            :style="{ top: `${info.y}px` }"
            @click="handleTimingLabelClick(info.measure, info.beat)"
          >
            <div class="timing-change-content">
              <div class="bpm-label">{{ info.bpm }}</div>
              <div class="time-signature-label">{{ info.timeSignature[0] }}/{{ info.timeSignature[1] }}</div>
            </div>
          </div>
        </div>

        <!-- 再生位置ライン -->
        <div
          v-if="playbackPosition"
          class="playback-line"
          :style="{ top: `${getPlaybackLineY(playbackPosition.measure, playbackPosition.beat)}px` }"
        >
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
            @click="handleNoteClick($event, index)"
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

    <!-- コントロールパネル（右側） -->
    <div class="control-panel control-panel-right">
      <div class="info-section">
        <h3>楽曲設定</h3>
        <div class="song-setting">
          <label>総小節数:</label>
          <input 
            type="number" 
            v-model.number="chartStore.songInfo.totalMeasures" 
            min="10" 
            max="1000" 
            class="setting-input"
          />
        </div>
        <div class="song-setting">
          <label>空白小節:</label>
          <input 
            type="number" 
            v-model.number="chartStore.songInfo.emptyMeasures" 
            min="0" 
            max="10" 
            class="setting-input"
          />
        </div>
      </div>
      
      <div class="info-section">
        <h3>情報</h3>
        <div class="measure-info">
          <div>表示範囲:</div>
          <div>{{ visibleMeasureRange.start }} - {{ visibleMeasureRange.end }}</div>
        </div>
        <div class="measure-info">
          <div>総小節数:</div>
          <div>{{ Math.max(50, chartStore.songInfo.totalMeasures, ...chartStore.timingPoints.map(tp => tp.measure), ...chartStore.notes.map(note => note.measure)) }}</div>
        </div>
        <div v-if="playbackPosition" class="playback-info">
          <div>再生位置:</div>
          <div>{{ playbackPosition.measure }}小節 {{ Math.round(playbackPosition.beat * 4) / 4 }}拍</div>
        </div>

      </div>
    </div>

    <!-- タイミング設定ダイアログ -->
    <div v-if="showTimingDialog" class="timing-dialog-overlay" @click="closeTimingDialog">
      <div class="timing-dialog" @click.stop>
        <h3>タイミング設定</h3>
        <div class="dialog-content">
          <div class="position-info">
            <span>位置: {{ timingDialogPosition?.measure }}小節 {{ (timingDialogPosition?.beat || 0).toFixed(2) }}拍目</span>
          </div>
          
          <div class="timing-input-group">
            <label>BPM:</label>
            <input 
              type="number" 
              v-model.number="dialogBPM" 
              min="60" 
              max="300" 
              class="timing-input"
            />
          </div>
          
          <div class="timing-input-group">
            <label>拍子:</label>
            <input 
              type="number" 
              v-model.number="dialogTimeSignatureNumerator" 
              min="1" 
              max="16" 
              class="timing-input timing-input-small"
              :disabled="(timingDialogPosition?.beat || 0) !== 0"
            />
            <span>/</span>
            <select 
              v-model.number="dialogTimeSignatureDenominator" 
              class="timing-select"
              :disabled="(timingDialogPosition?.beat || 0) !== 0"
            >
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="8">8</option>
              <option value="16">16</option>
            </select>
          </div>
          
          <div v-if="(timingDialogPosition?.beat || 0) !== 0" class="beat-restriction-info">
            ※ 拍子変更は0拍目でのみ可能です
          </div>
          
          <div class="dialog-buttons">
            <button @click="applyTimingPoint" class="apply-btn">適用</button>
            <button @click="closeTimingDialog" class="cancel-btn">キャンセル</button>
          </div>
        </div>
      </div>  
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useChartStore, type Note } from '../stores/chart'

const chartStore = useChartStore()

// 参照
const timelineContainer = ref<HTMLElement>()
const audioFileInput = ref<HTMLInputElement>()

// 表示設定
const laneWidth = 40 // 80から40に変更（半分）
const beatHeight = ref(60) // 120から60に変更（半分）
const zoom = ref(1) // 100%（50%～200%の範囲）
const scrollTop = ref(0)

// 音声関連
const audioFile = ref<File | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.5) // 音量（0.0 - 1.0）



// 編集モード
const editType = ref<'notes' | 'timing'>('notes')
const actionMode = ref<'select' | 'edit' | 'delete'>('edit')

// タイミングダイアログ
const showTimingDialog = ref(false)
const timingDialogPosition = ref<{ measure: number; beat: number } | null>(null)
const dialogBPM = ref(120)
const dialogTimeSignatureNumerator = ref(4)
const dialogTimeSignatureDenominator = ref(4)

// 表示される小節の高さを計算
const getMeasureHeight = (measure: number) => {
  const timeSignature = chartStore.getTimeSignatureAt(measure, 0)
  return timeSignature[0] * beatHeight.value * zoom.value
}

// 全体の高さを計算
const totalHeight = computed(() => {
  let height = 0
  const maxMeasure = Math.max(
    50, // 最低50小節表示
    chartStore.songInfo.totalMeasures, // ユーザー設定の総小節数
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
  
  // totalHeightと同じ計算ロジックを使用
  const maxMeasure = Math.max(
    50, // 最低50小節表示
    chartStore.songInfo.totalMeasures, // ユーザー設定の総小節数
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

// BPM・拍子変更情報ラベルのデータを生成（変更時のみ表示）
const timingChangeLabels = computed(() => {
  const labels: Array<{
    measure: number
    beat: number
    y: number
    bpm: number
    timeSignature: [number, number]
  }> = []
  
  // totalHeightと同じ計算ロジックを使用
  const maxMeasure = Math.max(
    50, // 最低50小節表示
    chartStore.songInfo.totalMeasures, // ユーザー設定の総小節数
    ...chartStore.timingPoints.map(tp => tp.measure),
    ...chartStore.notes.map(note => note.measure)
  )
  
  // 下から上の座標系：1小節目が下、maxMeasureが上
  let accumulatedHeight = 0
  
  // 全ての小節をチェック（1小節目から順に）
  for (let measure = 1; measure <= maxMeasure; measure++) {
    const measureHeight = getMeasureHeight(measure)
    const timeSignature = chartStore.getTimeSignatureAt(measure, 0)
    const beatHeightInMeasure = measureHeight / timeSignature[0]
    
    // この小節内のタイミング変更点をチェック
    const timingChangesInMeasure = chartStore.timingPoints.filter(tp => tp.measure === measure)
    
    for (const timingPoint of timingChangesInMeasure) {
      const bpm = timingPoint.bpm
      const timeSignatureAtPoint = timingPoint.timeSignature
      
      // Y座標を計算（下からの座標系）
      // accumulatedHeight: この小節の開始位置（下からの距離）
      // timingPoint.beat * beatHeightInMeasure: 小節内での拍位置
      const yFromBottom = accumulatedHeight + timingPoint.beat * beatHeightInMeasure
      const yPosition = totalHeight.value - yFromBottom
      
      // デバッグ情報（必要時のみ）
      // console.log('Timing label position:', { measure, beat: timingPoint.beat, yPosition })
      
      labels.push({
        measure,
        beat: timingPoint.beat,
        y: yPosition,
        bpm,
        timeSignature: timeSignatureAtPoint
      })
    }
    
    accumulatedHeight += measureHeight
  }
  
  return labels
})

// 小節番号ラベルのデータを生成
const measureNumberLabels = computed(() => {
  const labels: Array<{ measure: number; y: number }> = []
  
  // totalHeightと同じ計算ロジックを使用
  const maxMeasure = Math.max(
    50, // 最低50小節表示
    chartStore.songInfo.totalMeasures, // ユーザー設定の総小節数
    ...chartStore.timingPoints.map(tp => tp.measure),
    ...chartStore.notes.map(note => note.measure)
  )
  
  // 下から上の座標系：1小節目が下、maxMeasureが上
  let accumulatedHeight = 0
  
  for (let measure = 1; measure <= maxMeasure; measure++) {
    const measureHeight = getMeasureHeight(measure)
    
    // 小節の下端（小節開始線の位置）にラベルを配置
    const yFromBottom = accumulatedHeight
    const yPosition = totalHeight.value - yFromBottom - 5 // 少し上にオフセット
    
    labels.push({
      measure,
      y: yPosition
    })
    
    accumulatedHeight += measureHeight
  }
  
  return labels
})

// 表示範囲の小節を計算（下から上に流れる表示に対応）
const visibleMeasureRange = computed(() => {
  const containerHeight = timelineContainer.value?.clientHeight || 600
  let currentY = 0
  let start = 1
  let end = 1
  
  // totalHeightと同じ計算ロジックを使用
  const maxMeasure = Math.max(
    50, // 最低50小節表示
    chartStore.songInfo.totalMeasures, // ユーザー設定の総小節数
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
  const x = note.lane * laneWidth + 2.5 // レーン中央に配置（0ベース）
  
  // ホールドノートの場合は高さを変更
  if (note.type === 'hold' && note.duration) {
    const endY = getNoteY(note.measure, note.beat + note.duration)
    
    // 開始位置と終了位置の上の方をtopとし、下の方までの距離を高さとする
    const topY = Math.min(y, endY)
    const bottomY = Math.max(y, endY)
    const height = bottomY - topY + 8 // ノートの厚み分を追加（新しいノート高さに合わせる）
    
    return {
      position: 'absolute' as const,
      left: `${x}px`,
      top: `${topY}px`, // より上の位置から開始
      width: `${laneWidth - 5}px`, // タップノートと同じ幅に統一
      height: `${height}px`,
      zIndex: 10
    }
  }
  
  // タップノートの場合はそのまま
  return {
    position: 'absolute' as const,
    left: `${x}px`,
    top: `${y}px`,
    width: `${laneWidth - 5}px`, // 幅も調整（10から5に）
    height: '8px', // 高さを半分（15pxから8px）
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
  // ノートの中央が拍位置に来るように、ノートの高さの半分（4px）を引く
  return totalHeight.value - y - 4
}

// 再生位置ライン用のY座標計算（正確な拍位置）
const getPlaybackLineY = (measure: number, beat: number) => {
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
  // ラインは正確に拍位置に配置（オフセットなし）
  return totalHeight.value - y
}

// 古いモード管理は削除済み（新しいeditType/actionModeシステムに置き換え）

// ズーム機能
const handleZoomChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  zoom.value = parseInt(target.value) / 100
}

// 音量調整
const handleVolumeChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  volume.value = parseInt(target.value) / 100
  
  // 音声要素の音量を更新
  if (audioElement.value) {
    audioElement.value.volume = volume.value
  }
}

// 音声ファイル読み込み
const handleAudioFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file) {
    audioFile.value = file
    
    // HTMLAudioElementを作成
    audioElement.value = new Audio()
    audioElement.value.src = URL.createObjectURL(file)
    audioElement.value.volume = volume.value // 初期音量を設定
    
    // イベントリスナーを設定
    audioElement.value.addEventListener('loadedmetadata', () => {
      if (audioElement.value) {
        duration.value = audioElement.value.duration
      }
    })
    
    audioElement.value.addEventListener('timeupdate', () => {
      if (audioElement.value) {
        currentTime.value = audioElement.value.currentTime
        updatePlaybackPosition()
      }
    })
    
    // より頻繁な位置更新のためのrequestAnimationFrameループ
    const startSmoothUpdate = () => {
      if (isPlaying.value && audioElement.value) {
        currentTime.value = audioElement.value.currentTime
        updatePlaybackPosition()
      }
      if (isPlaying.value) {
        requestAnimationFrame(startSmoothUpdate)
      }
    }
    
    audioElement.value.addEventListener('play', startSmoothUpdate)
    audioElement.value.addEventListener('pause', () => {
      // 一時停止時は何もしない（requestAnimationFrameループが自動的に停止）
    })
    
    audioElement.value.addEventListener('ended', () => {
      isPlaying.value = false
    })
  }
}

// 音声再生/一時停止
const playAudio = () => {
  if (!audioElement.value) return
  
  if (isPlaying.value) {
    audioElement.value.pause()
    isPlaying.value = false
  } else {
    // 再生位置から開始
    if (playbackPosition.value) {
      const timeAtPosition = getTimeFromPosition(playbackPosition.value.measure, playbackPosition.value.beat)
      audioElement.value.currentTime = timeAtPosition
    }
    audioElement.value.play()
    isPlaying.value = true
  }
}

// 音声停止
const stopAudio = () => {
  if (!audioElement.value) return
  
  audioElement.value.pause()
  audioElement.value.currentTime = 0
  isPlaying.value = false
}

// 時間フォーマット
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 小節・拍から時間を計算（BPM変化対応版）
const getTimeFromPosition = (measure: number, beat: number) => {
  let totalTime = 0
  let currentMeasure = 1
  let currentBeat = 0
  
  while (currentMeasure < measure || (currentMeasure === measure && currentBeat < beat)) {
    const bpmAtPosition = chartStore.getBpmAt(currentMeasure, currentBeat)
    const timeSignature = chartStore.getTimeSignatureAt(currentMeasure, currentBeat)
    
    let nextMeasure = currentMeasure
    let nextBeat = currentBeat + 0.25 // 1/16拍ずつ進む（精度向上）
    
    // 小節の境界を越える場合
    if (nextBeat >= timeSignature[0]) {
      nextMeasure++
      nextBeat = 0
    }
    
    // 目標位置を越えないように調整
    if (nextMeasure > measure || (nextMeasure === measure && nextBeat > beat)) {
      nextMeasure = measure
      nextBeat = beat
    }
    
    // この区間の時間を計算
    const beatDifference = (nextMeasure - currentMeasure) * timeSignature[0] + (nextBeat - currentBeat)
    const timePerBeat = 60 / bpmAtPosition // 1拍あたりの秒数
    totalTime += beatDifference * timePerBeat
    
    currentMeasure = nextMeasure
    currentBeat = nextBeat
  }
  
  return totalTime
}

// 再生中の位置更新（BPM変化対応版）
const updatePlaybackPosition = () => {
  if (!isPlaying.value || !audioElement.value) return
  
  // 現在の時間から小節・拍を逆算（BPM変化を考慮）
  const currentSeconds = audioElement.value.currentTime
  const position = getPositionFromTime(currentSeconds)
  
  if (!position) return
  
  const newPosition = {
    measure: position.measure,
    beat: position.beat
  }
  
  // 毎フレーム位置を更新（閾値を非常に小さくして、ほぼ常に更新）
  const oldPosition = playbackPosition.value
  if (!oldPosition || 
      Math.abs(newPosition.measure - oldPosition.measure) > 0 ||
      Math.abs(newPosition.beat - oldPosition.beat) > 0.01) { // 閾値を0.1から0.01に縮小
    
    playbackPosition.value = newPosition
    
    // 毎フレーム滑らかにスクロール更新
    requestAnimationFrame(() => {
      scrollToPlaybackPositionSmooth()
    })
  }
}

// 時間から小節・拍を逆算する関数
const getPositionFromTime = (targetTime: number) => {
  let currentTime = 0
  let currentMeasure = 1
  let currentBeat = 0
  
  // 最大100小節まで検索（無限ループ防止）
  const maxMeasure = Math.max(100, ...chartStore.notes.map(note => note.measure))
  
  while (currentMeasure <= maxMeasure && currentTime < targetTime) {
    const bpmAtPosition = chartStore.getBpmAt(currentMeasure, currentBeat)
    const timeSignature = chartStore.getTimeSignatureAt(currentMeasure, currentBeat)
    
    // 次の1/16拍の位置を計算
    let nextMeasure = currentMeasure
    let nextBeat = currentBeat + 0.0625 // 1/16拍ずつ進む（より細かく）
    
    // 小節の境界を越える場合
    if (nextBeat >= timeSignature[0]) {
      nextMeasure++
      nextBeat = 0
    }
    
    // この区間の時間を計算
    const beatDifference = (nextMeasure - currentMeasure) * timeSignature[0] + (nextBeat - currentBeat)
    const timePerBeat = 60 / bpmAtPosition // 1拍あたりの秒数
    const deltaTime = beatDifference * timePerBeat
    
    // 目標時間を越える場合は補間して正確な位置を求める
    if (currentTime + deltaTime > targetTime) {
      const remainingTime = targetTime - currentTime
      const remainingBeats = remainingTime / timePerBeat
      
      return {
        measure: currentMeasure,
        beat: Math.max(0, currentBeat + remainingBeats)
      }
    }
    
    currentTime += deltaTime
    currentMeasure = nextMeasure
    currentBeat = nextBeat
  }
  
  return {
    measure: currentMeasure,
    beat: Math.max(0, currentBeat)
  }
}

// 再生位置への完全滑らかスクロール
const scrollToPlaybackPositionSmooth = () => {
  if (!timelineContainer.value || !playbackPosition.value) return
  
  const lineY = getPlaybackLineY(playbackPosition.value.measure, playbackPosition.value.beat)
  const containerHeight = timelineContainer.value.clientHeight
  
  // 下から上への座標系に合わせて修正
  const targetScroll = lineY - containerHeight / 2
  const clampedTarget = Math.max(0, Math.min(targetScroll, totalHeight.value - containerHeight))
  
  // 現在のスクロール位置
  const currentScroll = timelineContainer.value.scrollTop
  
  // 差が小さい場合は直接スクロール（アニメーションなし）
  const scrollDiff = Math.abs(clampedTarget - currentScroll)
  if (scrollDiff < 2) {
    timelineContainer.value.scrollTop = clampedTarget
    return
  }
  
  // 大きな差がある場合は補間を使って滑らかにスクロール
  const interpolationFactor = 0.1 // 補間の強さ（0.1 = 10%ずつ近づく）
  const newScrollPosition = currentScroll + (clampedTarget - currentScroll) * interpolationFactor
  
  timelineContainer.value.scrollTop = newScrollPosition
}



// 編集タイプの設定
const setEditType = (type: 'notes' | 'timing') => {
  editType.value = type
}

// アクションモードの設定
const setActionMode = (mode: 'select' | 'edit' | 'delete') => {
  actionMode.value = mode
}

// アクションモードの説明を取得
const getActionModeDescription = () => {
  if (editType.value === 'notes') {
    switch (actionMode.value) {
      case 'select':
        return 'ノートを選択します'
      case 'edit':
        return 'クリックでノートを配置します'
      case 'delete':
        return 'クリックでノートを削除します'
    }
  } else {
    switch (actionMode.value) {
      case 'select':
        return 'タイミングポイントを選択します'
      case 'edit':
        return 'クリックでタイミングポイントを設定します'
      case 'delete':
        return 'タイミングポイントを削除します'
    }
  }
  return ''
}

// タイミングダイアログを開く
const openTimingDialog = (measure: number, beat: number) => {
  console.log('Opening timing dialog at:', { measure, beat })
  timingDialogPosition.value = { measure, beat }
  
  // 現在のBPMと拍子を取得して初期値に設定
  const currentBPM = chartStore.getBpmAt(measure, beat)
  const currentTimeSignature = chartStore.getTimeSignatureAt(measure, beat)
  
  dialogBPM.value = currentBPM
  dialogTimeSignatureNumerator.value = currentTimeSignature[0]
  dialogTimeSignatureDenominator.value = currentTimeSignature[1]
  
  showTimingDialog.value = true
}

// タイミングダイアログを閉じる
const closeTimingDialog = () => {
  showTimingDialog.value = false
  timingDialogPosition.value = null
}

// タイミングポイントを適用
const applyTimingPoint = () => {
  if (!timingDialogPosition.value) return
  
  const timingPoint = {
    measure: timingDialogPosition.value.measure,
    beat: timingDialogPosition.value.beat,
    bpm: dialogBPM.value,
    timeSignature: [dialogTimeSignatureNumerator.value, dialogTimeSignatureDenominator.value] as [number, number]
  }
  
  console.log('Applying timing point:', timingPoint)
  
  // 配置前の総高さを記録
  const heightBefore = totalHeight.value
  
  chartStore.addTimingPoint(timingPoint)
  
  // 自動拡張：必要に応じて総小節数を増加
  autoExpandMeasures(timingPoint.measure)
  
  // 高さが変更された場合、スクロール位置を調整
  nextTick(() => {
    const heightAfter = totalHeight.value
    const heightDifference = heightAfter - heightBefore
    
    if (heightDifference > 0 && timelineContainer.value) {
      // 高さが増加した分だけスクロール位置を下方向に調整
      timelineContainer.value.scrollTop += heightDifference
      console.log(`Adjusted scroll by ${heightDifference}px due to timing point`)
    }
  })
  
  closeTimingDialog()
}

// 小節数の自動拡張
const autoExpandMeasures = (requiredMeasure: number) => {
  const currentTotal = chartStore.songInfo.totalMeasures
  
  // 必要な小節数より少し多めに設定（大きな拡張を避ける）
  const expandMargin = Math.min(10, Math.max(2, Math.ceil(requiredMeasure * 0.1))) // 必要小節数の10%、最低2、最大10
  const expandedTotal = Math.max(currentTotal, requiredMeasure + expandMargin)
  
  if (expandedTotal > currentTotal) {
    chartStore.setSongInfo({ totalMeasures: expandedTotal })
    console.log(`Auto-expanded from ${currentTotal} to ${expandedTotal} measures (added ${expandMargin} margin)`)
  }
}

// タイミングポイントを削除
const deleteTimingPoint = (measure: number, beat: number) => {
  console.log('Deleting timing point at:', { measure, beat })
  
  // 該当するタイミングポイントを探して削除
  const timingPointIndex = chartStore.timingPoints.findIndex(tp => 
    tp.measure === measure && Math.abs(tp.beat - beat) < 0.1 // 0.1拍の範囲で検索
  )
  
  if (timingPointIndex !== -1) {
    chartStore.removeTimingPoint(timingPointIndex)
    console.log('Deleted timing point at index:', timingPointIndex)
  } else {
    console.log('No timing point found to delete')
    
    // より広い範囲で検索してみる
    const nearbyTimingPoint = chartStore.timingPoints.findIndex(tp => 
      tp.measure === measure && Math.abs(tp.beat - beat) < 0.5 // 0.5拍の範囲で検索
    )
    
    if (nearbyTimingPoint !== -1) {
      chartStore.removeTimingPoint(nearbyTimingPoint)
      console.log('Deleted nearby timing point at index:', nearbyTimingPoint)
    }
  }
}

// タイミングラベルクリック処理
const handleTimingLabelClick = (measure: number, beat: number) => {
  if (editType.value !== 'timing') return
  
  if (actionMode.value === 'edit') {
    // タイミングダイアログを開く
    openTimingDialog(measure, beat)
  } else if (actionMode.value === 'delete') {
    // タイミングポイント削除
    deleteTimingPoint(measure, beat)
  }
}

// ノートクリック処理（新しいモードシステム対応）
const handleNoteClick = (event: MouseEvent, index: number) => {
  event.stopPropagation() // バブリングを防ぐ
  
  if (editType.value !== 'notes') return
  
  if (actionMode.value === 'delete') {
    // ノート削除
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
  // selectモードとeditモードは今回は簡略化（必要に応じて後で実装）
}

// 削除されたモード管理（新しいeditType/actionModeシステムに置き換え）

// 再生位置ライン（初期位置は1小節目の1拍目）
const playbackPosition = ref<{ measure: number; beat: number } | null>({
  measure: 1,
  beat: 0
})



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
  
  // デバッグ情報（必要時のみ）
  // console.log('Position input:', { y, adjustedY, totalHeight: totalHeight.value })
  
  // totalHeightと同じ計算ロジックを使用
  const maxMeasure = Math.max(
    50, // 最低50小節表示
    chartStore.songInfo.totalMeasures, // ユーザー設定の総小節数
    ...chartStore.timingPoints.map(tp => tp.measure),
    ...chartStore.notes.map(note => note.measure)
  )
  
  // 下から上の座標系：1小節目が下、最大小節が上
  // adjustedYは下からの距離なので、1小節目から順に検索
  let accumulatedHeight = 0
  for (let measure = 1; measure <= maxMeasure; measure++) {
    const measureHeight = getMeasureHeight(measure)
    
    if (adjustedY >= accumulatedHeight && adjustedY < accumulatedHeight + measureHeight) {
      const timeSignature = chartStore.getTimeSignatureAt(measure, 0)
      const positionInMeasure = adjustedY - accumulatedHeight
      const beat = (positionInMeasure / measureHeight) * timeSignature[0]
      
      // 1/4拍単位にスナップ
      let snappedBeat = Math.round(beat * 4) / 4
      
      // 小節の頭付近（0.125拍以内）は0拍目に強制スナップ
      if (snappedBeat < 0.125) {
        snappedBeat = 0
      }
      // 小節の最後付近は次の小節の0拍目として扱う
      if (snappedBeat >= timeSignature[0] - 0.125) {
        snappedBeat = 0
        measure = measure + 1
      }
      
      // デバッグ情報（必要時のみ）
      // console.log('Found position:', { measure, beat: Math.max(0, snappedBeat) })
      
      return { measure, beat: Math.max(0, snappedBeat), lane }
    }
    
    accumulatedHeight += measureHeight
  }
  
  // console.log('No position found')
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
  if (!position) return
  
  // タイミングモードの場合
  if (editType.value === 'timing') {
    if (actionMode.value === 'edit') {
      // タイミングダイアログを開く
      openTimingDialog(position.measure, position.beat)
    } else if (actionMode.value === 'delete') {
      // タイミングポイント削除
      deleteTimingPoint(position.measure, position.beat)
    } else if (actionMode.value === 'select') {
      // 再生位置を設定
      playbackPosition.value = {
        measure: position.measure,
        beat: position.beat
      }
      console.log('Set playback position:', playbackPosition.value)
    }
    return
  }
  
  // ノートモードの場合
  if (editType.value === 'notes') {
    if (actionMode.value === 'edit') {
      // ノート配置（従来の処理）
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
    } else if (actionMode.value === 'select') {
      // 再生位置を設定
      playbackPosition.value = {
        measure: position.measure,
        beat: position.beat
      }
      console.log('Set playback position:', playbackPosition.value)
    }
  }
}

const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value || !dragStartPosition.value || editType.value !== 'notes' || actionMode.value !== 'edit') return
  
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
  
  if (!isDragging.value || !previewNote.value || editType.value !== 'notes' || actionMode.value !== 'edit') {
    isDragging.value = false
    dragStartPosition.value = null
    previewNote.value = null
    return
  }
  
  const addedNote = previewNote.value
  
  // 配置前の総高さを記録
  const heightBefore = totalHeight.value
  
  // ノートを追加
  chartStore.addNote(addedNote)
  console.log('Added note:', addedNote)
  
  // 自動拡張：必要に応じて総小節数を増加
  autoExpandMeasures(addedNote.measure)
  
  // 高さが変更された場合、スクロール位置を調整
  nextTick(() => {
    const heightAfter = totalHeight.value
    const heightDifference = heightAfter - heightBefore
    
    if (heightDifference > 0 && timelineContainer.value) {
      // 高さが増加した分だけスクロール位置を下方向に調整
      timelineContainer.value.scrollTop += heightDifference
      console.log(`Adjusted scroll by ${heightDifference}px due to height change`)
    }
  })
  
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
  flex-direction: row;
  height: calc(100vh - 60px); /* Vue DevToolsやその他の要素のためのスペースを確保 */
  background: #1a1a1a;
  color: #fff;
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  background: #2a2a2a;
  padding-bottom: 40px; /* 最下部のノートが確実に表示されるためのパディング */
  padding-left: 120px;
  padding-right: 120px;
}

.timeline-grid {
  position: relative;
  width: 240px; /* 6レーン × 40px */
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

/* BPM・拍子変更の青色横線 */
.timing-change-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
}

.timing-change-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(to right, #4488ff, #66aaff);
  box-shadow: 0 0 8px rgba(68, 136, 255, 0.6);
  z-index: 3;
}

/* 小節番号ラベル（左側） */
.measure-number-labels {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
}

.measure-number-label {
  position: absolute;
  left: -30px; /* 左側に配置 */
  z-index: 4;
  color: #aaa;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  width: 20px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 2px;
  padding: 2px 0;
}

/* BPM・拍子変更ラベル（右側） */
.timing-change-labels {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
}



.timing-change-label {
  position: absolute;
  left: -100px; /* デフォルト（左側） */
  z-index: 5;
}

.timing-change-label-right {
  left: auto;
  right: -50px; /* 右側に配置 */
}

.timing-change-content {
  background: rgba(40, 0, 0, 0.9);
  border-radius: 4px;
  padding: 4px 8px;
  border-left: 3px solid #ff6666;
  min-width: 40px;
  box-shadow: 0 2px 6px rgba(255, 102, 102, 0.3);
}

.bpm-label {
  font-size: 10px;
  color: #ff8888;
  font-weight: 600;
  line-height: 1.2;
}

.time-signature-label {
  font-size: 10px;
  color: #88ccff;
  font-weight: 600;
  line-height: 1.2;
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
  border-radius: 2px; /* 小さくなったノートに合わせて調整 */
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
  background: #ffffff;
  border: 1px solid #cccccc; /* ボーダーも細く */
}

.note:hover {
  background: #ffeb3b;
  border-color: #ffc107;
}

.note-hold {
  border-radius: 3px; /* 小さくなったノートに合わせて調整 */
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

/* 選択されたノート */
.note.selected {
  background: #ffeb3b !important;
  border-color: #ff9800 !important;
  box-shadow: 0 0 8px rgba(255, 235, 59, 0.8);
}

/* 再生位置ライン */
.playback-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(to right, #ff4444, #ff6666);
  z-index: 15;
  pointer-events: none;
  box-shadow: 0 0 6px rgba(255, 68, 68, 0.6);
}

/* コントロールパネル（左側・右側共通） */
.control-panel {
  background: #333;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 30px;
  border-right: 1px solid #555;
  flex-shrink: 0;
  width: 280px;
  overflow-y: auto;
}

/* 右側パネル専用スタイル */
.control-panel-right {
  border-right: none;
  border-left: 1px solid #555;
}

.control-panel h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #fff;
  border-bottom: 1px solid #555;
  padding-bottom: 5px;
}

.mode-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-controls button {
  background: #555;
  color: #fff;
  border: none;
  padding: 12px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  width: 100%;
}

/* 編集タイプ切り替えボタン */
.edit-type-toggle {
  margin-bottom: 20px;
}

.toggle-buttons {
  display: flex;
  gap: 4px;
  background: #2a2a2a;
  border-radius: 6px;
  padding: 4px;
}

.toggle-buttons button {
  background: transparent;
  color: #ccc;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  font-weight: 500;
  flex: 1;
  text-align: center;
}

.toggle-buttons button:hover {
  background: #3a3a3a;
  color: #fff;
}

.toggle-buttons button.active {
  background: #007acc;
  color: #fff;
  box-shadow: 0 2px 4px rgba(0, 122, 204, 0.3);
}

/* アクションモードボタン */
.action-mode-controls {
  margin-bottom: 20px;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.action-mode-controls button {
  background: #444;
  color: #ccc;
  border: none;
  padding: 10px 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  flex: 1;
  min-width: 70px;
}

.action-mode-controls button:hover {
  background: #555;
  color: #fff;
}

.action-mode-controls button.active {
  background: #28a745;
  color: #fff;
  box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);
}

.mode-info {
  background: #1a1a1a;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: #aaa;
  border-left: 3px solid #007acc;
  margin-top: 10px;
}

/* 楽曲設定 */
.song-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 10px;
}

.song-setting label {
  color: #ccc;
  font-size: 13px;
  min-width: 70px;
}

.setting-input {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 8px;
  color: white;
  font-size: 13px;
  width: 70px;
  text-align: right;
}

.setting-input:focus {
  border-color: #007acc;
  outline: none;
}

.mode-controls button:hover {
  background: #666;
}

.mode-controls button.active {
  background: #4CAF50;
  box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
}

.mode-info {
  font-size: 12px;
  color: #aaa;
  margin-top: 10px;
  line-height: 1.4;
}

.zoom-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.zoom-slider-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zoom-value {
  font-size: 14px;
  color: #fff;
  text-align: center;
  font-weight: bold;
}

.zoom-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #555;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.zoom-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.zoom-slider::-webkit-slider-track {
  width: 100%;
  height: 6px;
  background: #555;
  border-radius: 3px;
}

.zoom-slider::-moz-range-track {
  width: 100%;
  height: 6px;
  background: #555;
  border-radius: 3px;
  border: none;
}

.zoom-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #aaa;
  margin-top: 2px;
}

/* 音声コントロール */
.audio-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.audio-file-input {
  width: 100%;
  padding: 8px;
  background: #555;
  color: #fff;
  border: 1px solid #666;
  border-radius: 4px;
  font-size: 12px;
}

.audio-info {
  font-size: 11px;
  color: #ccc;
  word-break: break-all;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.play-btn, .stop-btn {
  background: #555;
  color: #fff;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  min-width: 40px;
}

.play-btn:hover, .stop-btn:hover {
  background: #666;
}

.play-btn:disabled, .stop-btn:disabled {
  background: #444;
  cursor: not-allowed;
  opacity: 0.5;
}

.time-display {
  font-size: 11px;
  color: #ccc;
  font-family: monospace;
}

/* 音量コントロール */
.volume-controls {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.volume-controls label {
  font-size: 11px;
  color: #ccc;
  text-align: center;
}

.volume-slider {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #555;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ff6666;
  cursor: pointer;
  border: 1px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ff6666;
  cursor: pointer;
  border: 1px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.volume-slider::-webkit-slider-track {
  width: 100%;
  height: 4px;
  background: #555;
  border-radius: 2px;
}

.volume-slider::-moz-range-track {
  width: 100%;
  height: 4px;
  background: #555;
  border-radius: 2px;
  border: none;
}

/* タイミングコントロール */
.timing-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timing-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.timing-input-group label {
  font-size: 12px;
  color: #ccc;
  min-width: 40px;
}

.timing-input {
  background: #555;
  color: #fff;
  border: 1px solid #666;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  width: 60px;
}

.timing-input-small {
  width: 40px;
}

.timing-select {
  background: #555;
  color: #fff;
  border: 1px solid #666;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  width: 50px;
}

.set-timing-btn {
  background: #4CAF50;
  color: #fff;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}

.set-timing-btn:hover {
  background: #45a049;
}

.set-timing-btn:disabled {
  background: #444;
  cursor: not-allowed;
  opacity: 0.5;
}

.playback-info {
  font-size: 12px;
  color: #ff6666;
  display: flex;
  justify-content: space-between;
  font-weight: bold;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.measure-info {
  font-size: 12px;
  color: #ccc;
  display: flex;
  justify-content: space-between;
}

.selected-info {
  color: #ffeb3b;
  font-weight: bold;
}

/* レスポンシブ対応 */
@media (max-width: 1024px) {
  .control-panel {
    width: 200px;
    padding: 15px;
    gap: 20px;
  }
  
  .control-panel h3 {
    font-size: 13px;
  }
  
  .mode-controls button {
    padding: 10px 12px;
    font-size: 13px;
  }
  
  .toggle-buttons button {
    padding: 6px 12px;
    font-size: 13px;
  }
  
  .action-mode-controls button {
    padding: 8px 10px;
    font-size: 12px;
  }
}

@media (max-width: 768px) {
  .timeline-editor {
    flex-direction: column;
  }
  
  .control-panel {
    width: 100%;
    height: auto;
    max-height: 150px;
    flex-direction: row;
    padding: 10px 15px;
    gap: 20px;
    border-right: none;
    border-bottom: 1px solid #555;
    order: 1; /* 左側パネルを上に */
  }
  
  .control-panel-right {
    border-left: none;
    border-top: 1px solid #555;
    order: 3; /* 右側パネルを下に */
  }
  
  .toggle-buttons {
    flex-direction: row;
    gap: 2px;
  }
  
  .toggle-buttons button {
    padding: 6px 8px;
    font-size: 12px;
  }
  
  .action-mode-controls button {
    padding: 6px 8px;
    font-size: 11px;
    margin-bottom: 4px;
  }
  
  .mode-info {
    font-size: 11px;
    padding: 6px 8px;
  }
  
  .timeline-container {
    order: 2; /* タイムラインを中央に */
    padding-left: 20px;
    padding-right: 20px;
  }
  
  .mode-controls,
  .zoom-controls,
  .info-section {
    flex: 1;
  }
  
  .mode-controls {
    flex-direction: row;
    gap: 5px;
  }
  
  .mode-controls button {
    padding: 8px 12px;
    font-size: 12px;
  }
  
  .timeline-grid {
    width: 100%;
    max-width: 280px; /* 6レーン × 40px + 40px = 280px */
    margin-left: calc(50% - 140px - 60px); /* モバイル用調整 */
  }
  
  .measure-number-label {
    left: -25px;
    font-size: 11px;
    width: 18px;
  }
  
  .timing-change-label {
    left: -110px; /* 左側のデフォルト位置 */
  }
  
  .timing-change-label-right {
    left: auto;
    right: -90px; /* モバイルでは小さく */
  }
  
  .timing-change-content {
    min-width: 60px; /* モバイルでは小さく */
    padding: 3px 6px;
  }
  
  .bpm-label,
  .time-signature-label {
    font-size: 9px;
  }
}

/* タイミングダイアログのスタイル */
.timing-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.timing-dialog {
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 20px;
  min-width: 350px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.timing-dialog h3 {
  margin: 0 0 20px 0;
  color: #ffffff;
  text-align: center;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.position-info {
  background-color: #1a1a1a;
  padding: 10px;
  border-radius: 4px;
  text-align: center;
  color: #cccccc;
  font-size: 14px;
}

.timing-input-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.timing-input-group label {
  min-width: 60px;
  color: #cccccc;
}

.timing-input {
  background-color: #3a3a3a;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 8px;
  color: white;
  font-size: 14px;
  flex: 1;
}

.timing-input-small {
  width: 60px;
  flex: none;
}

.timing-select {
  background-color: #3a3a3a;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 8px;
  color: white;
  font-size: 14px;
  width: 60px;
}

.timing-input:disabled,
.timing-select:disabled {
  background-color: #2a2a2a;
  color: #666;
  cursor: not-allowed;
}

.beat-restriction-info {
  background-color: #1a1a1a;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #ffa500;
  text-align: center;
  border-left: 3px solid #ffa500;
}

.dialog-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 10px;
}

.apply-btn, .cancel-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.apply-btn {
  background-color: #007acc;
  color: white;
}

.apply-btn:hover {
  background-color: #005a9e;
}

.cancel-btn {
  background-color: #666;
  color: white;
}

.cancel-btn:hover {
  background-color: #555;
}

/* タイミングラベルのインタラクション */
.timing-change-label.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.timing-change-label.clickable:hover {
  transform: scale(1.05);
}

.timing-change-label.clickable:hover .timing-change-content {
  background-color: #007acc;
  border-color: #007acc;
}

.timing-change-label.delete-mode:hover .timing-change-content {
  background-color: #d73a49;
  border-color: #d73a49;
}
</style>