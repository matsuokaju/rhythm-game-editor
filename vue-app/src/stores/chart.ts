import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface SongInfo {
  title: string
  artist: string
  audioFile: string
  audioOffset: number
  totalMeasures: number // 総小節数を追加
  volume: number
  difficulty: string
  level: number
}

export interface TimingPoint {
  measure: number
  beat: number
  bpm: number
  timeSignature: [number, number]
}

export interface Note {
  measure: number
  beat: number
  lane: number
  type: 'tap' | 'hold'
  duration?: number
}

export interface ChartData {
  songInfo: SongInfo
  timingPoints: TimingPoint[]
  notes: Note[]
}

export const useChartStore = defineStore('chart', () => {
  // 状態
  const songInfo = ref<SongInfo>({
    title: '',
    artist: '',
    audioFile: '',
    audioOffset: 0,
    totalMeasures: 100, // デフォルト100小節
    volume: 0.5,
    difficulty: 'Normal',
    level: 1,
  })

  const timingPoints = ref<TimingPoint[]>([
    { measure: 1, beat: 0, bpm: 120, timeSignature: [4, 4] },
  ])

  const notes = ref<Note[]>([
  ])

  // アンドゥ・リドゥ履歴管理
  interface HistoryState {
    songInfo: SongInfo
    timingPoints: TimingPoint[]
    notes: Note[]
  }

  const history = ref<HistoryState[]>([])
  const historyIndex = ref(-1)
  const maxHistorySize = 50 // 最大履歴数
  const skipHistorySaving = ref(false) // 履歴保存を一時的に無効化するフラグ

  // 現在の状態を履歴に保存
  const saveToHistory = () => {
    if (skipHistorySaving.value) return
    const currentState: HistoryState = {
      songInfo: JSON.parse(JSON.stringify(songInfo.value)),
      timingPoints: JSON.parse(JSON.stringify(timingPoints.value)),
      notes: JSON.parse(JSON.stringify(notes.value))
    }

    // 現在のインデックス以降の履歴を削除（新しい操作時）
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }

    // 新しい状態を追加
    history.value.push(currentState)
    historyIndex.value = history.value.length - 1

    // 履歴サイズ制限
    if (history.value.length > maxHistorySize) {
      history.value = history.value.slice(-maxHistorySize)
      historyIndex.value = history.value.length - 1
    }
  }

  // 初期状態を履歴に保存
  saveToHistory()

  // ゲッター
  const chartData = computed<ChartData>(() => ({
    songInfo: songInfo.value,
    timingPoints: timingPoints.value,
    notes: notes.value,
  }))

  // BPMを取得（指定した小節・拍における）
  const getBpmAt = (measure: number, beat: number) => {
    const relevantPoints = timingPoints.value
      .filter((tp) => tp.measure < measure || (tp.measure === measure && tp.beat <= beat))
      .sort((a, b) => {
        if (a.measure !== b.measure) return a.measure - b.measure
        return a.beat - b.beat
      })

    return relevantPoints.length > 0 ? relevantPoints[relevantPoints.length - 1].bpm : 120
  }

  // 拍子を取得（指定した小節・拍における）
  const getTimeSignatureAt = (measure: number, beat: number): [number, number] => {
    const relevantPoints = timingPoints.value
      .filter((tp) => tp.measure < measure || (tp.measure === measure && tp.beat <= beat))
      .sort((a, b) => {
        if (a.measure !== b.measure) return a.measure - b.measure
        return a.beat - b.beat
      })

    return relevantPoints.length > 0
      ? relevantPoints[relevantPoints.length - 1].timeSignature
      : [4, 4]
  }

  // アクション
  const setSongInfo = (info: Partial<SongInfo>) => {
    songInfo.value = { ...songInfo.value, ...info }
  }

  const addTimingPoint = (timingPoint: TimingPoint) => {
    console.log('Adding/updating timing point:', timingPoint)

    // 同じ位置（小節・拍）に既存のタイミングポイントがあるかチェック
    const existingIndex = timingPoints.value.findIndex(
      tp => tp.measure === timingPoint.measure && tp.beat === timingPoint.beat
    )

    if (existingIndex !== -1) {
      // 既存のタイミングポイントを更新
      console.log('Updating existing timing point at index:', existingIndex)
      timingPoints.value[existingIndex] = timingPoint
    } else {
      // 新しいタイミングポイントを追加
      console.log('Adding new timing point')
      timingPoints.value.push(timingPoint)
    }

    // ソート
    timingPoints.value.sort((a, b) => {
      if (a.measure !== b.measure) return a.measure - b.measure
      return a.beat - b.beat
    })

    console.log('Result timing points:', timingPoints.value)
    saveToHistory()
  }

  const addNote = (note: Note) => {
    notes.value.push(note)
    notes.value.sort((a, b) => {
      if (a.measure !== b.measure) return a.measure - b.measure
      if (a.beat !== b.beat) return a.beat - b.beat
      return a.lane - b.lane
    })
    saveToHistory()
  }

  const removeNote = (index: number) => {
    notes.value.splice(index, 1)
    saveToHistory()
  }

  const removeTimingPoint = (index: number) => {
    timingPoints.value.splice(index, 1)
    saveToHistory()
  }

  // 指定した位置のタイミングポイントを取得
  const getTimingPointAt = (measure: number, beat: number): TimingPoint | null => {
    return timingPoints.value.find(
      tp => tp.measure === measure && tp.beat === beat
    ) || null
  }

  // 指定した位置にタイミングポイントが存在するかチェック
  const hasTimingPointAt = (measure: number, beat: number): boolean => {
    return timingPoints.value.some(
      tp => tp.measure === measure && tp.beat === beat
    )
  }

  const clearNotes = () => {
    notes.value = []
    saveToHistory()
  }

  const loadChartData = (data: ChartData) => {
    songInfo.value = data.songInfo
    timingPoints.value = data.timingPoints
    notes.value = data.notes
    saveToHistory()
  }

  const exportChartData = (): string => {
    return JSON.stringify(chartData.value, null, 2)
  }

  // アンドゥ機能
  const undo = (): boolean => {
    if (historyIndex.value > 0) {
      historyIndex.value--
      const prevState = history.value[historyIndex.value]
      
      // 状態を復元（履歴に保存しない）
      songInfo.value = JSON.parse(JSON.stringify(prevState.songInfo))
      timingPoints.value = JSON.parse(JSON.stringify(prevState.timingPoints))
      notes.value = JSON.parse(JSON.stringify(prevState.notes))
      
      return true
    }
    return false
  }

  // リドゥ機能
  const redo = (): boolean => {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      const nextState = history.value[historyIndex.value]
      
      // 状態を復元（履歴に保存しない）
      songInfo.value = JSON.parse(JSON.stringify(nextState.songInfo))
      timingPoints.value = JSON.parse(JSON.stringify(nextState.timingPoints))
      notes.value = JSON.parse(JSON.stringify(nextState.notes))
      
      return true
    }
    return false
  }

  // アンドゥ・リドゥ可否チェック
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  // 複数操作を1つの履歴として扱うためのヘルパー関数
  const performBatchOperation = (operation: () => void) => {
    skipHistorySaving.value = true
    try {
      operation()
    } finally {
      skipHistorySaving.value = false
      saveToHistory()
    }
  }

  return {
    // 状態
    songInfo,
    timingPoints,
    notes,
    // ゲッター
    chartData,
    // メソッド
    getBpmAt,
    getTimeSignatureAt,
    setSongInfo,
    addTimingPoint,
    addNote,
    removeNote,
    removeTimingPoint,
    getTimingPointAt,
    hasTimingPointAt,
    clearNotes,
    loadChartData,
    exportChartData,
    // アンドゥ・リドゥ
    undo,
    redo,
    canUndo,
    canRedo,
    saveToHistory,
    performBatchOperation,
  }
})
