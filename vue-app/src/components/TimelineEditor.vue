<template>
  <div class="timeline-editor">
    <!-- コントロールパネル（左側） -->
    <div class="control-panel">

      <!-- ズーム -->
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

      <!-- 編集対象 -->
      <div class="edit-type-toggle">
        <h3>編集対象</h3>
        <div class="toggle-buttons">
          <button 
            @click="setEditType('timing')" 
            :class="{ active: editType === 'timing' }">
            タイミング
          </button>
          <button 
            @click="setEditType('notes')" 
            :class="{ active: editType === 'notes' }">
            ノーツ
          </button>
        </div>
      </div>

      <!-- 操作モード -->
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

      <!-- グリッド間隔 -->
      <div class="grid-division-controls">
        <h3>グリッド間隔</h3>
        <div class="division-buttons">
          <button 
            v-for="division in availableDivisions"
            :key="division"
            @click="setGridDivision(division)"
            :class="{ active: gridDivision === division }"
            class="division-btn"
          >
            {{ division }}
          </button>
        </div>
        <div class="division-info">{{ getDivisionDescription() }}</div>
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

        <!-- 再生位置ライン（赤い線） -->
        <div
          v-if="playbackPosition"
          class="playback-line"
          :style="{ top: `${getPlaybackLineY(playbackPosition.measure, playbackPosition.beat)}px` }"
        >
        </div>

        <!-- 現在再生中の位置ライン（黄色い線） -->
        <div
          v-if="isPlaying && currentPlaybackPosition"
          class="current-playback-line"
          :style="{ top: `${getPlaybackLineY(currentPlaybackPosition.measure, currentPlaybackPosition.beat)}px` }"
        >
        </div>

        <!-- ノート表示 -->
        <div class="notes">
          <!-- 実際のノート -->
          <div
            v-for="(note, index) in visibleNotes"
            :key="`note-${index}`"
            class="note"
            :class="[
              `note-${note.type}`, 
              { 
                selected: isNoteSelected(index),
                overlapping: !isNoteSelected(index) && isNoteOverlapping(getActualNoteIndex(index))
              }
            ]"
            :style="getNoteStyle(note)"
            @click="handleNoteClick($event, index)"
            @contextmenu="handleNoteRightClick($event, index)"
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

          <!-- ホバープレビューノート -->
          <div
            v-if="hoverPreviewNote"
            class="note note-hover-preview"
            :style="getHoverPreviewNoteStyle(hoverPreviewNote)"
          ></div>
        </div>
      </div>
    </div>

    <!-- コントロールパネル（右側） -->
    <div class="control-panel control-panel-right">
      <!-- 譜面ファイル読み込み -->
      <div class="info-section">
        <h3>譜面ファイル</h3>
        <button @click="triggerChartFileInput" class="chart-import-btn">
          譜面データ読み込み
        </button>
        <button @click="exportChartData" class="chart-export-btn">
          譜面データ書き出し
        </button>
        <input 
          ref="chartFileInput"
          type="file" 
          accept=".json" 
          @change="importChartData"
          class="hidden-file-input"
        />
      </div>

      <!-- 楽曲情報 -->
      <div class="info-section">
        <h3>楽曲情報</h3>
        <button @click="openSongInfoDialog" class="song-info-btn">
          基本情報設定
        </button>
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
      </div>
      
      <!-- 音声 -->
      <div class="audio-controls">
        <h3>音声</h3>
        <div v-if="chartStore.songInfo.audioFile" class="audio-info">
          <div class="current-audio">
            {{ chartStore.songInfo.audioFile }}
          </div>
          <div v-if="chartStore.songInfo.title !== '新しい楽曲'" class="song-title">
            {{ chartStore.songInfo.title }} - {{ chartStore.songInfo.artist }}
          </div>
        </div>
        <div class="playback-controls">
          <button @click="playAudio" :disabled="!audioElement" class="play-btn">
            {{ isPlaying ? '⏸️' : '▶️' }}
          </button>
          <button @click="stopAudio" :disabled="!audioElement" class="stop-btn">
            ⏹️
          </button>
          <span v-if="audioElement" class="time-display">
            {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
          </span>
        </div>
        <div v-if="audioElement" class="volume-controls">
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
      
      <!-- 情報 -->
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
    <div v-if="showTimingDialog" class="dialog-overlay" @click="closeTimingDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h2>タイミング設定</h2>
          <button @click="closeTimingDialog" class="close-btn">×</button>
        </div>
        
        <div class="dialog-body">
          <div class="position-info">
            <span>位置: {{ timingDialogPosition?.measure }}小節 {{ (timingDialogPosition?.beat || 0).toFixed(3) }}拍目</span>
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
            <div class="time-signature-input">
              <input 
                type="number" 
                v-model.number="dialogTimeSignatureNumerator" 
                min="1" 
                max="16" 
                class="timing-input timing-input-small"
                :disabled="(timingDialogPosition?.beat || 0) !== 0"
              />
              <span class="slash">/</span>
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
          </div>
          
          <div v-if="(timingDialogPosition?.beat || 0) !== 0" class="beat-restriction-info">
            ※ 拍子変更は0拍目でのみ可能です
          </div>
        </div>
        
        <div class="dialog-footer">
          <button @click="applyTimingPoint" class="apply-btn">適用</button>
          <button @click="closeTimingDialog" class="cancel-btn">キャンセル</button>
        </div>
      </div>  
    </div>
  </div>

  <!-- 楽曲設定ダイアログ -->
  <div v-if="showSongInfoDialog" class="dialog-overlay">
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>楽曲基本情報設定</h2>
        <button @click="closeSongInfoDialog" class="close-btn">×</button>
      </div>
      <div class="dialog-body">
        <div class="form-group">
          <label>タイトル:</label>
          <input v-model="tempSongInfo.title" type="text" />
        </div>
        <div class="form-group">
          <label>アーティスト:</label>
          <input v-model="tempSongInfo.artist" type="text" />
        </div>
        <div class="form-group">
          <label>音声ファイル:</label>
          <div class="file-input-group">
            <input v-model="tempSongInfo.audioFile" type="text" placeholder="例: test.mp3" readonly class="file-path-input" />
            <button @click="selectAudioFile" type="button" class="file-select-btn">選択</button>
          </div>
          <input 
            ref="audioFileInputDialog"
            type="file" 
            accept="audio/*" 
            @change="handleDialogAudioFileChange"
            class="hidden-file-input"
          />
        </div>
        <div class="form-group">
          <label>音声オフセット:</label>
          <input v-model.number="tempSongInfo.audioOffset" type="number" step="0.01" />
          <span class="unit">秒</span>
        </div>
        <div class="form-group">
          <label>総小節数:</label>
          <input v-model.number="tempSongInfo.totalMeasures" type="number" min="1" />
        </div>
        <div class="form-group">
          <label>音量:</label>
          <input v-model.number="tempSongInfo.volume" type="number" step="0.1" min="0" max="1" />
        </div>
        <div class="form-group">
          <label>難易度:</label>
          <select v-model="tempSongInfo.difficulty">
            <option>Easy</option>
            <option>Normal</option>
            <option>Hard</option>
            <option>Expert</option>
          </select>
        </div>
        <div class="form-group">
          <label>レベル:</label>
          <input v-model.number="tempSongInfo.level" type="number" min="1" max="20" />
        </div>
      </div>
      <div class="dialog-footer">
        <button @click="saveSongInfo" class="save-btn">保存</button>
        <button @click="closeSongInfoDialog" class="cancel-btn">キャンセル</button>
      </div>
    </div>
  </div>

  <!-- 音声ファイル再選択ダイアログ -->
  <div v-if="showAudioFilePrompt" class="dialog-overlay">
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>音声ファイルの選択</h2>
        <button @click="closeAudioFilePrompt" class="close-btn">×</button>
      </div>
      
      <div class="dialog-body">
        <p v-if="chartStore.songInfo.audioFile">読み込んだ譜面データには音声ファイル「{{ chartStore.songInfo.audioFile }}」が指定されています。</p>
        <p v-else>音声ファイルが設定されていません。</p>
        <p>JSONファイルには音声ファイルの実体が含まれていないため、音声ファイルを選択する必要があります。</p>
        
        <div class="form-group">
          <label>音声ファイル:</label>
          <div class="file-input-group">
            <input v-model="chartStore.songInfo.audioFile" type="text" readonly class="file-path-input" placeholder="音声ファイルを選択してください" />
            <button @click="selectAudioFileForImport" type="button" class="file-select-btn">選択</button>
          </div>
          <input 
            ref="audioFileInputImport"
            type="file" 
            accept="audio/*" 
            @change="handleImportAudioFileChange"
            class="hidden-file-input"
          />
        </div>
      </div>
      
      <div class="dialog-footer">
        <button @click="skipAudioFile" class="cancel-btn">スキップ</button>
        <button @click="closeAudioFilePrompt" class="save-btn">完了</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useChartStore, type Note, type SongInfo } from '../stores/chart'

const chartStore = useChartStore()

// 楽曲設定ダイアログの状態
const showSongInfoDialog = ref(false)
const audioFileInputDialog = ref<HTMLInputElement | null>(null)

// 譜面ファイル読み込み関連
const chartFileInput = ref<HTMLInputElement | null>(null)
const showAudioFilePrompt = ref(false)
const audioFileInputImport = ref<HTMLInputElement | null>(null)
const tempSongInfo = ref<SongInfo>({
  title: '',
  artist: '',
  audioFile: '',
  audioOffset: 0,
  totalMeasures: 100,
  volume: 0.5,
  difficulty: 'Normal',
  level: 1
})

// 参照
const timelineContainer = ref<HTMLElement>()

// 表示設定
const laneWidth = 40 // 80から40に変更（半分）
const beatHeight = ref(60) // 120から60に変更（半分）
const zoom = ref(1) // 100%（50%～200%の範囲）
const scrollTop = ref(0)

// 音声関連
const audioElement = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.5) // 音量（0.0 - 1.0）

// タイムライン再生制御用
const playbackStartTime = ref(0) // 再生開始時のタイムスタンプ
const playbackStartPosition = ref({ measure: 1, beat: 0 }) // 再生開始時の楽譜位置

// SE関連
const tickSoundElement = ref<HTMLAudioElement | null>(null)
const playedNotes = ref<Set<string>>(new Set()) // 再生済みノートを追跡



// 編集モード
const editType = ref<'notes' | 'timing'>('timing')
const actionMode = ref<'select' | 'edit' | 'delete'>('select')

// ノート選択機能
const selectedNotes = ref<Set<number>>(new Set()) // 選択されたノートのインデックス

// グリッド間隔設定
const gridDivision = ref(16) // デフォルトは16分音符（0.25拍間隔）
const availableDivisions = [4, 6, 8, 12, 16, 24, 32] // 利用可能な分割数

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

// ホバープレビューノーツのスタイル
const getHoverPreviewNoteStyle = (position: { measure: number; beat: number; lane: number }) => {
  const y = getNoteY(position.measure, position.beat)
  const x = position.lane * laneWidth + 2.5 // レーン中央に配置（0ベース）
  
  return {
    position: 'absolute' as const,
    left: `${x}px`,
    top: `${y}px`,
    width: `${laneWidth - 5}px`,
    height: '8px',
    zIndex: 5 // 通常ノーツより低く、背景より高く
  }
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

// visibleNotesのインデックスから実際のノートインデックスを取得
const getActualNoteIndex = (visibleIndex: number) => {
  const visibleNote = visibleNotes.value[visibleIndex]
  if (!visibleNote) return -1
  
  return chartStore.notes.findIndex(note => 
    note.measure === visibleNote.measure &&
    note.beat === visibleNote.beat &&
    note.lane === visibleNote.lane &&
    note.type === visibleNote.type &&
    note.duration === visibleNote.duration
  )
}

// ノートの重なり検出
const isNoteOverlapping = (noteIndex: number) => {
  const currentNote = chartStore.notes[noteIndex]
  if (!currentNote) return false
  
  // 同じノートとの比較は除外
  for (let i = 0; i < chartStore.notes.length; i++) {
    if (i === noteIndex) continue
    
    const otherNote = chartStore.notes[i]
    
    // 同じレーンでない場合はスキップ
    if (currentNote.lane !== otherNote.lane) continue
    
    // 現在のノートとチェック対象ノートの絶対的な拍位置を計算
    const currentAbsoluteBeat = (currentNote.measure - 1) * 4 + currentNote.beat
    const otherAbsoluteBeat = (otherNote.measure - 1) * 4 + otherNote.beat
    
    // タップノーツ同士の場合：位置が完全に重なった場合
    if (currentNote.type === 'tap' && otherNote.type === 'tap') {
      if (Math.abs(currentAbsoluteBeat - otherAbsoluteBeat) < 0.01) {
        return true
      }
    }
    
    // ホールドノーツ同士の場合：少しでも重なっている部分があれば
    else if (currentNote.type === 'hold' && otherNote.type === 'hold') {
      const currentEndBeat = currentAbsoluteBeat + (currentNote.duration || 0)
      const otherEndBeat = otherAbsoluteBeat + (otherNote.duration || 0)
      
      // 重なり判定：一方の開始が他方の終了より前で、一方の終了が他方の開始より後
      if (currentAbsoluteBeat < otherEndBeat && currentEndBeat > otherAbsoluteBeat) {
        return true
      }
    }
    
    // タップノーツとホールドノーツの場合
    else if (currentNote.type === 'tap' && otherNote.type === 'hold') {
      const otherEndBeat = otherAbsoluteBeat + (otherNote.duration || 0)
      
      // タップノーツがホールドノーツの範囲内にある場合
      if (currentAbsoluteBeat >= otherAbsoluteBeat && currentAbsoluteBeat <= otherEndBeat) {
        return true
      }
    }
    
    // ホールドノーツとタップノーツの場合（タップノーツを赤くするため、ホールド側は赤くしない）
    else if (currentNote.type === 'hold' && otherNote.type === 'tap') {
      // このケースでは現在のホールドノーツは赤くしない
      // （タップノーツ側で判定される）
    }
  }
  
  return false
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

// ズーム機能（表示中央を基準に）
const handleZoomChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const newZoom = parseInt(target.value) / 100
  
  if (!timelineContainer.value) {
    zoom.value = newZoom
    return
  }
  
  // 現在のスクロール位置を取得
  const container = timelineContainer.value
  const currentScrollTop = container.scrollTop
  const containerHeight = container.clientHeight
  
  // 現在表示されている中央位置（楽譜座標）を計算
  const centerY = currentScrollTop + containerHeight / 2
  
  // 現在のズーム値を保存
  const oldZoom = zoom.value
  
  // 新しいズーム値を適用
  zoom.value = newZoom
  
  // nextTickで新しいズーム後の座標計算を確実にする
  nextTick(() => {
    if (!timelineContainer.value) return
    
    // ズーム比率を計算
    const zoomRatio = newZoom / oldZoom
    
    // 中央位置がズーム後も同じ場所に見えるように新しいスクロール位置を計算
    const newCenterY = centerY * zoomRatio
    const newScrollTop = newCenterY - containerHeight / 2
    
    // スクロール位置を調整
    timelineContainer.value.scrollTop = Math.max(0, newScrollTop)
  })
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

// より頻繁な位置更新のためのrequestAnimationFrameループ
const startSmoothUpdate = () => {
  if (isPlaying.value) {
    updatePlaybackPosition()
    requestAnimationFrame(startSmoothUpdate)
  }
}

// 音声再生/一時停止
const playAudio = () => {
  if (!audioElement.value) return
  
  if (isPlaying.value) {
    audioElement.value.pause()
    isPlaying.value = false
  } else {
    // 再生開始時は常に全てリセット（シンプルで確実）
    console.log('Starting playback - resetting all played notes')
    resetPlayedNotes()
    
    // 再生開始情報を記録
    playbackStartTime.value = Date.now()
    if (playbackPosition.value) {
      playbackStartPosition.value = { ...playbackPosition.value }
      const timeAtPosition = getTimeFromPosition(playbackPosition.value.measure, playbackPosition.value.beat)
      const offsetTime = timeAtPosition - chartStore.songInfo.audioOffset
      
      // 音声が開始されるべき時間帯かどうかを判定
      if (offsetTime >= 0) {
        // 音声が開始されるべき時間帯：即座に再生開始
        audioElement.value.currentTime = offsetTime
        audioElement.value.play()
      } else {
        // 音声がまだ開始されない時間帯：音声は再生せず、タイマーで遅延開始
        audioElement.value.currentTime = 0
        setTimeout(() => {
          if (isPlaying.value && audioElement.value) {
            audioElement.value.play()
          }
        }, Math.abs(offsetTime) * 1000)
      }
    } else {
      playbackStartPosition.value = { measure: 1, beat: 0 }
      // 再生位置が設定されていない場合は、オフセットのみ適用
      const offsetTime = -chartStore.songInfo.audioOffset
      if (offsetTime >= 0) {
        audioElement.value.currentTime = offsetTime
        audioElement.value.play()
      } else {
        audioElement.value.currentTime = 0
        setTimeout(() => {
          if (isPlaying.value && audioElement.value) {
            audioElement.value.play()
          }
        }, Math.abs(offsetTime) * 1000)
      }
    }
    
    isPlaying.value = true
    
    // タイムライン更新を開始（音声再生前でも動作）
    startSmoothUpdate()
  }
}

// 音声停止
const stopAudio = () => {
  if (!audioElement.value) return
  
  console.log('Stopping audio - resetting played notes')
  audioElement.value.pause()
  // 停止時は楽譜の開始位置（1小節0拍）に対応する音声位置にセット
  audioElement.value.currentTime = Math.max(0, -chartStore.songInfo.audioOffset)
  isPlaying.value = false
  
  // 再生開始情報をリセット
  playbackStartTime.value = 0
  playbackStartPosition.value = { measure: 1, beat: 0 }
  
  // 現在の再生位置をリセット（黄色い線を消す）
  currentPlaybackPosition.value = null
  
  resetPlayedNotes() // 再生済みノートをリセット
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

// ノートのユニークキーを生成
const getNoteKey = (measure: number, beat: number, lane: number) => {
  return `${measure}-${beat.toFixed(3)}-${lane}`
}

// ノートヒット検出とSE再生
const checkAndPlayNoteSE = (currentPos: { measure: number; beat: number }) => {
  if (!tickSoundElement.value) return

  // 現在位置付近のノートを検索（±0.05拍の範囲）
  const tolerance = 0.05
  
  chartStore.notes.forEach(note => {
    // タップノートまたはロングノートの始点をチェック
    const noteBeat = note.beat
    const beatDiff = Math.abs(currentPos.beat - noteBeat)
    const measureMatch = currentPos.measure === note.measure
    
    if (measureMatch && beatDiff <= tolerance) {
      const noteKey = getNoteKey(note.measure, note.beat, note.lane)
      
      // まだ再生していないノートの場合のみSEを再生
      if (!playedNotes.value.has(noteKey)) {
        playedNotes.value.add(noteKey)
        console.log(`Playing SE for note: ${noteKey} at position ${currentPos.measure}-${currentPos.beat.toFixed(3)}`)
        
        // SEを再生（複数同時再生対応）
        if (tickSoundElement.value) {
          const tickSound = tickSoundElement.value.cloneNode() as HTMLAudioElement
          tickSound.volume = 0.3
          tickSound.play().catch(error => {
            console.warn('SE再生エラー:', error)
          })
        }
      } else {
        console.log(`Skipping already played note: ${noteKey}`)
      }
    }
  })
}

// 再生停止時に再生済みノートをリセット
const resetPlayedNotes = () => {
  const prevSize = playedNotes.value.size
  playedNotes.value.clear()
  console.log(`Reset played notes (cleared ${prevSize} notes)`)
}



// 再生中の位置更新（BPM変化対応版）
const updatePlaybackPosition = () => {
  if (!isPlaying.value || !audioElement.value) return
  
  // 実際の経過時間を計算
  const elapsedRealTime = (Date.now() - playbackStartTime.value) / 1000
  // 開始位置からの経過時間を楽譜時間に変換
  const startTime = getTimeFromPosition(playbackStartPosition.value.measure, playbackStartPosition.value.beat)
  const currentScoreTime = startTime + elapsedRealTime
  
  // 楽譜時間から位置を計算（オフセット適用なし、純粋な楽譜時間）
  const position = getPositionFromScoreTime(currentScoreTime)
  
  if (!position) return
  
  const newPosition = {
    measure: position.measure,
    beat: position.beat
  }
  
  // 現在の再生位置を更新（黄色い線用、毎フレーム更新）
  const oldCurrentPosition = currentPlaybackPosition.value
  if (!oldCurrentPosition || 
      Math.abs(newPosition.measure - oldCurrentPosition.measure) > 0 ||
      Math.abs(newPosition.beat - oldCurrentPosition.beat) > 0.01) { // 閾値を0.1から0.01に縮小
    
    // 現在の再生位置のみ更新（黄色い線用）
    // playbackPosition（赤い線）は再生開始位置として固定
    currentPlaybackPosition.value = { ...newPosition }
    
    // ノートヒット検出とSE再生
    checkAndPlayNoteSE(newPosition)
    
    // 毎フレーム滑らかにスクロール更新
    requestAnimationFrame(() => {
      scrollToPlaybackPositionSmooth()
    })
  }
}

// 楽譜時間から小節・拍を逆算する関数（オフセット適用なし）
const getPositionFromScoreTime = (targetTime: number) => {
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
  
  // 最後の位置を返す
  return {
    measure: currentMeasure,
    beat: currentBeat
  }
}

// 再生位置への完全滑らかスクロール（黄色い線を追尾）
const scrollToPlaybackPositionSmooth = () => {
  if (!timelineContainer.value || !currentPlaybackPosition.value) return
  
  const lineY = getPlaybackLineY(currentPlaybackPosition.value.measure, currentPlaybackPosition.value.beat)
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

// グリッド間隔の設定
const setGridDivision = (division: number) => {
  gridDivision.value = division
}

// グリッド間隔の説明を取得
const getDivisionDescription = () => {
  const noteNames: { [key: number]: string } = {
    4: '4分音符',
    6: '4分3連符', 
    8: '8分音符',
    12: '8分3連符',
    16: '16分音符',
    24: '16分3連符',
    32: '32分音符'
  }
  const beatInterval = 4 / gridDivision.value
  return `${noteNames[gridDivision.value]} (${beatInterval.toFixed(3)}拍間隔)`
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

// ノートが選択されているかチェック
const isNoteSelected = (index: number) => {
  const noteToCheck = visibleNotes.value[index]
  const actualIndex = chartStore.notes.findIndex(note => 
    note.measure === noteToCheck.measure &&
    note.beat === noteToCheck.beat &&
    note.lane === noteToCheck.lane &&
    note.type === noteToCheck.type
  )
  return actualIndex !== -1 && selectedNotes.value.has(actualIndex)
}

// ノートクリック処理（新しいモードシステム対応）
const handleNoteClick = (event: MouseEvent, index: number) => {
  event.stopPropagation() // バブリングを防ぐ
  
  if (editType.value !== 'notes') return
  
  if (actionMode.value === 'select') {
    // ノート選択
    const noteToSelect = visibleNotes.value[index]
    const actualIndex = chartStore.notes.findIndex(note => 
      note.measure === noteToSelect.measure &&
      note.beat === noteToSelect.beat &&
      note.lane === noteToSelect.lane &&
      note.type === noteToSelect.type
    )
    
    if (actualIndex !== -1) {
      // Ctrlキーが押されている場合は複数選択
      if (event.ctrlKey || event.metaKey) {
        if (selectedNotes.value.has(actualIndex)) {
          selectedNotes.value.delete(actualIndex)
        } else {
          selectedNotes.value.add(actualIndex)
        }
      } else {
        // 単一選択
        selectedNotes.value.clear()
        selectedNotes.value.add(actualIndex)
      }
      console.log('Selected notes:', Array.from(selectedNotes.value))
    }
  } else if (actionMode.value === 'delete') {
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
      // 削除時は選択状態を完全にクリア
      selectedNotes.value.clear()
      console.log('Note deleted in delete mode, cleared all selections')
    }
  }
}

// ノート右クリック処理（削除）
const handleNoteRightClick = (event: MouseEvent, index: number) => {
  event.preventDefault() // コンテキストメニューを表示しない
  event.stopPropagation() // バブリングを防ぐ
  
  // 配置モードでのみ右クリック削除を有効にする
  if (editType.value !== 'notes' || actionMode.value !== 'edit') return
  
  const noteToDelete = visibleNotes.value[index]
  const actualIndex = chartStore.notes.findIndex(note => 
    note.measure === noteToDelete.measure &&
    note.beat === noteToDelete.beat &&
    note.lane === noteToDelete.lane &&
    note.type === noteToDelete.type
  )
  
  if (actualIndex !== -1) {
    chartStore.removeNote(actualIndex)
    // 右クリック削除時は選択状態を完全にクリア
    selectedNotes.value.clear()
    console.log('Note deleted by right-click:', noteToDelete)
    console.log('Cleared all note selections')
  }
}

// 削除されたモード管理（新しいeditType/actionModeシステムに置き換え）

// 再生位置ライン（初期位置は1小節目の1拍目）
const playbackPosition = ref<{ measure: number; beat: number } | null>({
  measure: 1,
  beat: 0
})

// 現在の再生位置（再生中のみ表示される黄色い線）
const currentPlaybackPosition = ref<{ measure: number; beat: number } | null>(null)



// ドラッグ状態管理
const isDragging = ref(false)
const dragStartTime = ref(0)
const dragStartPosition = ref<{ measure: number; beat: number; lane: number } | null>(null)
const previewNote = ref<Note | null>(null)

// ホバープレビューノーツ
const hoverPreviewNote = ref<{ measure: number; beat: number; lane: number } | null>(null)

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
      
      // グリッド間隔に基づいてスナップ
      const snapInterval = 4 / gridDivision.value // 拍単位での間隔
      let snappedBeat = Math.round(beat / snapInterval) * snapInterval
      
      // 小節の頭付近（間隔の半分以内）は0拍目に強制スナップ
      if (snappedBeat < snapInterval / 2) {
        snappedBeat = 0
      }
      // 小節の最後付近は次の小節の0拍目として扱う
      if (snappedBeat >= timeSignature[0] - snapInterval / 2) {
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
      // 配置モードでも空白クリック時は選択をクリア
      if (!event.ctrlKey && !event.metaKey) {
        selectedNotes.value.clear()
        console.log('Cleared note selection (edit mode)')
      }
      
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
      // ノート選択モードの場合、空いている場所をクリックしたら選択をクリア
      if (!event.ctrlKey && !event.metaKey) {
        selectedNotes.value.clear()
        console.log('Cleared note selection')
      }
    }
  }
}

const handleMouseMove = (event: MouseEvent) => {
  const currentPosition = getPositionFromMouseEvent(event)
  
  // ホバープレビューノーツの更新（配置モードでドラッグしていない場合）
  if (!isDragging.value && editType.value === 'notes' && actionMode.value === 'edit' && currentPosition) {
    hoverPreviewNote.value = currentPosition
  } else {
    hoverPreviewNote.value = null
  }
  
  if (!isDragging.value || !dragStartPosition.value || editType.value !== 'notes' || actionMode.value !== 'edit') return
  
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
  
  // 追加されたノートを選択状態にする（ソート後の正確なインデックスを取得）
  const noteIndex = chartStore.notes.findIndex(note => 
    note.measure === addedNote.measure &&
    note.beat === addedNote.beat &&
    note.lane === addedNote.lane &&
    note.type === addedNote.type &&
    note.duration === addedNote.duration
  )
  selectedNotes.value.clear()
  if (noteIndex !== -1) {
    selectedNotes.value.add(noteIndex)
  }
  
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
  hoverPreviewNote.value = null
}

// スクロール監視
const handleScroll = () => {
  if (timelineContainer.value) {
    scrollTop.value = timelineContainer.value.scrollTop
  }
}

// キーボードイベントハンドラー
const handleKeyDown = (event: KeyboardEvent) => {
  // 入力フィールドがフォーカスされている場合は何もしない
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  
  // タブキーでの操作切り替え
  if (event.key === 'Tab') {
    event.preventDefault()
    
    if (event.shiftKey) {
      // Shift + Tab: 編集対象を切り替え
      if (editType.value === 'timing') {
        setEditType('notes')
      } else {
        setEditType('timing')
      }
      console.log('Switched edit type to:', editType.value)
    } else {
      // Tab: 操作モードの切り替え
      if (editType.value === 'notes') {
        // ノーツ操作の切り替え（選択→配置/設定→削除→選択...）
        if (actionMode.value === 'select') {
          setActionMode('edit')
        } else if (actionMode.value === 'edit') {
          setActionMode('delete')
        } else if (actionMode.value === 'delete') {
          setActionMode('select')
        }
        console.log('Switched notes action mode to:', actionMode.value)
      } else if (editType.value === 'timing') {
        // タイミング操作の切り替え（選択→配置/設定→削除→選択...）
        if (actionMode.value === 'select') {
          setActionMode('edit')
        } else if (actionMode.value === 'edit') {
          setActionMode('delete')
        } else if (actionMode.value === 'delete') {
          setActionMode('select')
        }
        console.log('Switched timing action mode to:', actionMode.value)
      }
    }
    return
  }
  
  // 選択されたノートがない場合、矢印キーとデリートキー以外は何もしない
  if (selectedNotes.value.size === 0 && !['ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) return
  
  if (event.key === 'Delete' || event.key === 'Backspace') {
    // 選択されたノートがない場合は何もしない
    if (selectedNotes.value.size === 0) return
    
    event.preventDefault()
    
    // 選択されたノートを削除（インデックスの大きい順に削除）
    const sortedIndices = Array.from(selectedNotes.value).sort((a, b) => b - a)
    sortedIndices.forEach(index => {
      chartStore.removeNote(index)
    })
    
    // 選択状態をクリア
    selectedNotes.value.clear()
    return
  }
  
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    // 選択されたノートがない場合は何もしない
    if (selectedNotes.value.size === 0) return
    
    event.preventDefault()
    
    const gridStep = 4 / gridDivision.value // グリッド分割に基づく移動単位
    
    // 上矢印は時間的に後（下方向）、下矢印は時間的に前（上方向）
    const direction = event.key === 'ArrowUp' ? 1 : -1
    const moveAmount = gridStep * direction
    
    // 選択されたノートを移動
    const notesToMove = Array.from(selectedNotes.value).map(index => chartStore.notes[index])
    
    notesToMove.forEach((note) => {
      if (note) {
        const newBeat = note.beat + moveAmount
        
        // 新しい小節と拍を計算
        let newMeasure = note.measure
        let adjustedBeat = newBeat
        
        // 拍が負数になった場合の処理
        while (adjustedBeat < 0) {
          newMeasure--
          adjustedBeat += 4
        }
        
        // 拍が4以上になった場合の処理
        while (adjustedBeat >= 4) {
          newMeasure++
          adjustedBeat -= 4
        }
        
        // 小節が1未満にならないように制限
        if (newMeasure < 1) {
          newMeasure = 1
          adjustedBeat = 0
        }
        
        // ノートを更新
        note.measure = newMeasure
        note.beat = adjustedBeat
        
        // 必要に応じて総小節数を自動拡張
        autoExpandMeasures(newMeasure)
      }
    })
    
    // ノートの順序を正しく保つためにソート
    chartStore.notes.sort((a, b) => {
      if (a.measure !== b.measure) return a.measure - b.measure
      if (a.beat !== b.beat) return a.beat - b.beat
      return a.lane - b.lane
    })
    
    // 移動後のノートを再選択（移動したノートを直接参照で選択）
    selectedNotes.value.clear()
    notesToMove.forEach(movedNote => {
      const newIndex = chartStore.notes.findIndex(note => note === movedNote)
      if (newIndex !== -1) {
        selectedNotes.value.add(newIndex)
      }
    })
  }
}

// グローバルクリックハンドラー（選択解除用）
const handleGlobalClick = (event: MouseEvent) => {
  // 選択されたノートがない場合は何もしない
  if (selectedNotes.value.size === 0) return
  
  const target = event.target as HTMLElement
  
  // タイムラインコンテナ内のクリックかチェック
  const timelineElement = timelineContainer.value
  if (timelineElement && timelineElement.contains(target)) {
    // タイムライン内のクリックの場合、ノートクリックかチェック
    if (target.classList.contains('note') || target.closest('.note')) {
      // ノートクリックの場合は何もしない（handleNoteClickで処理される）
      return
    }
    // タイムライン内の空白クリックの場合は何もしない（handleMouseDownで処理される）
    return
  }
  
  // タイムライン外のクリック（コントロールパネル、余白など）の場合は選択解除
  selectedNotes.value.clear()
  console.log('Cleared note selection (global click outside timeline)')
}

// 楽曲設定ダイアログ関数
const openSongInfoDialog = () => {
  // 現在の楽曲情報をコピー
  tempSongInfo.value = { ...chartStore.songInfo }
  
  // 現在の音量設定を反映
  tempSongInfo.value.volume = volume.value
  
  showSongInfoDialog.value = true
}

const closeSongInfoDialog = () => {
  showSongInfoDialog.value = false
}

const saveSongInfo = () => {
  // 楽曲情報を保存
  chartStore.setSongInfo(tempSongInfo.value)
  
  // 音量設定を音声再生機能に反映
  volume.value = tempSongInfo.value.volume
  if (audioElement.value) {
    audioElement.value.volume = tempSongInfo.value.volume
  }
  
  showSongInfoDialog.value = false
  console.log('Saved song info:', tempSongInfo.value)
}

// 譜面ファイル読み込み関連
const triggerChartFileInput = () => {
  chartFileInput.value?.click()
}

const importChartData = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const jsonString = e.target?.result as string
        const chartData = JSON.parse(jsonString)
        
        // 譜面データを読み込み
        chartStore.loadChartData(chartData)
        
        // 音声ファイル名がある場合は必ず音声ファイル選択ダイアログを表示
        // JSONからは音声ファイルの実体を読み込めないため
        if (chartData.songInfo.audioFile) {
          showAudioFilePrompt.value = true
        } else {
          // 音声ファイル名がない場合でも、音声ファイル選択を促す
          if (confirm('音声ファイルが設定されていません。音声ファイルを選択しますか？')) {
            showAudioFilePrompt.value = true
          }
        }
        
        console.log('Chart data imported successfully')
      } catch (error) {
        console.error('譜面データの読み込みに失敗しました:', error)
        alert('譜面データの読み込みに失敗しました。ファイル形式を確認してください。')
      }
    }
    reader.readAsText(file)
  }
  
  // inputをリセット（同じファイルを再度選択できるように）
  input.value = ''
}

const exportChartData = () => {
  try {
    // 譜面データをJSONとして出力
    const jsonData = chartStore.exportChartData()
    
    // ファイル名を生成（楽曲タイトルがあればそれを使用、なければデフォルト）
    const fileName = chartStore.songInfo.title && chartStore.songInfo.title !== '新しい楽曲' 
      ? `${chartStore.songInfo.title}_chart.json`
      : 'chart_data.json'
    
    // Blobを作成してダウンロード
    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    // ダウンロードリンクを作成して実行
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // メモリリークを防ぐためにURLを解放
    URL.revokeObjectURL(url)
    
    console.log('Chart data exported successfully as:', fileName)
  } catch (error) {
    console.error('譜面データの書き出しに失敗しました:', error)
    alert('譜面データの書き出しに失敗しました。')
  }
}

// 音声ファイル再選択ダイアログ関連
const closeAudioFilePrompt = () => {
  showAudioFilePrompt.value = false
}

const selectAudioFileForImport = () => {
  audioFileInputImport.value?.click()
}

const handleImportAudioFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  
  if (file) {
    setupAudioElement(file)
    chartStore.setSongInfo({ audioFile: file.name })
    closeAudioFilePrompt()
  }
}

const skipAudioFile = () => {
  chartStore.setSongInfo({ audioFile: '' })
  closeAudioFilePrompt()
}

// ダイアログの音声ファイル選択
const selectAudioFile = () => {
  audioFileInputDialog.value?.click()
}

// 音声要素のセットアップ
const setupAudioElement = (file: File) => {
  // 新しい音声ファイル読み込み時に再生済みノートをリセット
  resetPlayedNotes()
  
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
  

  
  audioElement.value.addEventListener('play', () => {
    // 再生開始時にリセット（確実にリセットするため）
    console.log('Audio play event - resetting played notes')
    resetPlayedNotes()
  })
  
  audioElement.value.addEventListener('pause', () => {
    // 一時停止時は何もしない（requestAnimationFrameループが自動的に停止）
  })
  
  audioElement.value.addEventListener('ended', () => {
    isPlaying.value = false
    // 再生終了時にもリセット
    console.log('Audio ended - resetting played notes')
    resetPlayedNotes()
  })
}

const handleDialogAudioFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  
  if (file) {
    // ファイル名を設定
    tempSongInfo.value.audioFile = file.name
    
    // 音声ファイルを即座に読み込み
    setupAudioElement(file)
    
    console.log('Selected audio file for dialog:', file.name)
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
  
  // SEファイルを読み込み
  tickSoundElement.value = new Audio('/resource/tick.wav')
  tickSoundElement.value.volume = 0.3 // SEの音量を調整
  
  // キーボードイベントリスナーを追加
  document.addEventListener('keydown', handleKeyDown)
  
  // グローバルクリックリスナーを追加（選択解除用）
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  if (timelineContainer.value) {
    timelineContainer.value.removeEventListener('scroll', handleScroll)
  }
  // キーボードイベントリスナーを削除
  document.removeEventListener('keydown', handleKeyDown)
  
  // グローバルクリックリスナーを削除
  document.removeEventListener('click', handleGlobalClick)
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

.note-hover-preview {
  background: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 2px;
  opacity: 0.7;
  pointer-events: none; /* マウスイベントを通す */
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

/* 重なったノート（選択状態でない場合のみ） */
.note.overlapping {
  background: #f44336 !important;
  border-color: #d32f2f !important;
  box-shadow: 0 0 6px rgba(244, 67, 54, 0.6);
}

/* 再生位置ライン（赤い線） */
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

/* 現在再生中の位置ライン（黄色い線） */
.current-playback-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(to right, #ffeb3b, #ffc107);
  z-index: 16;
  pointer-events: none;
  box-shadow: 0 0 6px rgba(255, 235, 59, 0.8);
  transition: top 0.1s ease-out;
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

/* グリッド間隔コントロール */
.grid-division-controls {
  margin-bottom: 20px;
}

.division-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.division-btn {
  background: #444;
  color: #ccc;
  border: none;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  min-width: 30px;
}

.division-btn:hover {
  background: #555;
  color: #fff;
}

.division-btn.active {
  background: #9c27b0;
  color: #fff;
  box-shadow: 0 2px 4px rgba(156, 39, 176, 0.3);
}

.division-info {
  background: #1a1a1a;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 11px;
  color: #aaa;
  border-left: 3px solid #9c27b0;
  text-align: center;
}

/* 楽曲設定 */
.song-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.current-audio {
  font-weight: bold;
  color: #fff;
}

.song-title {
  font-size: 10px;
  color: #999;
  margin-top: 2px;
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
  
  .division-btn {
    padding: 4px 6px;
    font-size: 10px;
    min-width: 24px;
  }
  
  .division-info {
    font-size: 9px;
    padding: 4px 6px;
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

/* タイミングダイアログ固有のスタイル */

.position-info {
  background-color: #1a1a1a;
  padding: 10px;
  border-radius: 4px;
  text-align: center;
  color: #cccccc;
  font-size: 14px;
  margin-bottom: 16px;
}

.timing-input-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.timing-input-group label {
  min-width: 60px;
  color: #cccccc;
}

.time-signature-input {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
}

.slash {
  color: #cccccc;
  font-size: 16px;
  font-weight: bold;
  padding: 0 5px;
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
  margin-bottom: 16px;
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

/* 楽曲設定セクション */
.song-settings {
  margin-bottom: 20px;
}

.song-info-btn {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  width: 100%;
}

.song-info-btn:hover {
  background: #45a049;
}

.chart-import-btn {
  background: #2196F3;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  width: 100%;
  margin-bottom: 10px;
}

.chart-import-btn:hover {
  background: #1976D2;
}

.chart-export-btn {
  background: #FF9800;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  width: 100%;
  margin-bottom: 10px;
}

.chart-export-btn:hover {
  background: #F57C00;
}

/* ダイアログスタイル */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog-content {
  background: #2a2a2a;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: auto;
  border: 1px solid #444;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #444;
}

.dialog-header h2 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #fff;
}

.dialog-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-group label {
  color: #ccc;
  min-width: 120px;
  font-size: 14px;
}

.form-group input,
.form-group select {
  flex: 1;
  padding: 8px;
  border: 1px solid #444;
  border-radius: 4px;
  background: #333;
  color: #fff;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007acc;
}

/* ファイル選択用スタイル */
.file-input-group {
  flex: 1;
  display: flex;
  gap: 8px;
}

.file-path-input {
  flex: 1;
  padding: 8px;
  border: 1px solid #444;
  border-radius: 4px;
  background: #333;
  color: #fff;
  font-size: 14px;
  cursor: default;
}

.file-select-btn {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}

.file-select-btn:hover {
  background: #005999;
}

.hidden-file-input {
  display: none;
}

.unit {
  color: #999;
  font-size: 12px;
  min-width: auto;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #444;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.save-btn {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.save-btn:hover {
  background: #005999;
}

.cancel-btn {
  background: #666;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.cancel-btn:hover {
  background: #555;
}

.apply-btn {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.apply-btn:hover {
  background: #005999;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .dialog-content {
    width: 95%;
    margin: 10px;
  }
  
  .form-group {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .form-group label {
    min-width: auto;
    margin-bottom: 4px;
  }
}
</style>