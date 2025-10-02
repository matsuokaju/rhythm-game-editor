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
    title: '新しい楽曲',
    artist: 'Unknown Artist',
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
    // テスト用のサンプルノート
    { measure: 1, beat: 0.0, lane: 0, type: 'hold', duration: 4.0 },
    { measure: 1, beat: 1.0, lane: 1, type: 'tap' },
    { measure: 1, beat: 2.0, lane: 2, type: 'tap' },
    { measure: 1, beat: 3.0, lane: 3, type: 'tap' },
    { measure: 2, beat: 0.0, lane: 5, type: 'hold', duration: 4.0 },
    { measure: 2, beat: 1.0, lane: 4, type: 'tap' },
    { measure: 2, beat: 2.0, lane: 3, type: 'tap' },
    { measure: 2, beat: 3.0, lane: 2, type: 'tap' },
    { measure: 3, beat: 0.0, lane: 0, type: 'hold', duration: 4.0 },
    { measure: 3, beat: 1.0, lane: 1, type: 'tap' },
    { measure: 3, beat: 2.0, lane: 2, type: 'tap' },
    { measure: 3, beat: 3.0, lane: 3, type: 'tap' },
    { measure: 4, beat: 0.0, lane: 5, type: 'hold', duration: 4.0 },
    { measure: 4, beat: 1.0, lane: 4, type: 'tap' },
    { measure: 4, beat: 2.0, lane: 3, type: 'tap' },
    { measure: 4, beat: 3.0, lane: 2, type: 'tap' },
  ])

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
    console.log('Adding timing point:', timingPoint)

    timingPoints.value.push(timingPoint)
    timingPoints.value.sort((a, b) => {
      if (a.measure !== b.measure) return a.measure - b.measure
      return a.beat - b.beat
    })

    console.log('Result timing points:', timingPoints.value)
  }

  const addNote = (note: Note) => {
    notes.value.push(note)
    notes.value.sort((a, b) => {
      if (a.measure !== b.measure) return a.measure - b.measure
      if (a.beat !== b.beat) return a.beat - b.beat
      return a.lane - b.lane
    })
  }

  const removeNote = (index: number) => {
    notes.value.splice(index, 1)
  }

  const removeTimingPoint = (index: number) => {
    timingPoints.value.splice(index, 1)
  }

  const clearNotes = () => {
    notes.value = []
  }

  const loadChartData = (data: ChartData) => {
    songInfo.value = data.songInfo
    timingPoints.value = data.timingPoints
    notes.value = data.notes
  }

  const exportChartData = (): string => {
    return JSON.stringify(chartData.value, null, 2)
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
    clearNotes,
    loadChartData,
    exportChartData,
  }
})
