"use client"

import { useState, useRef, useCallback } from "react"

// Web Speech API の型定義（ブラウザ標準だが TypeScript の型に含まれないものを補完）
type SpeechRecognitionConstructor = new () => SpeechRecognition

interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult
  length: number
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition ??
    null
  )
}

export function useSpeechInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const supported = typeof window !== "undefined" && !!getSpeechRecognition()

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) return

    if (recRef.current) {
      recRef.current.abort()
      recRef.current = null
    }

    const rec = new SR()
    rec.lang = "ja-JP"
    rec.continuous = true
    rec.interimResults = false

    // 同一セッション内で処理済みの result インデックス
    let lastProcessedIndex = -1

    rec.onresult = (e: SpeechRecognitionEvent) => {
      // isFinal な結果だけを都度コールバックに渡す（未処理分のみ）
      for (let i = lastProcessedIndex + 1; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim()
          if (text) onResultRef.current(text)
          lastProcessedIndex = i
        }
      }
    }

    rec.onerror = () => {
      setListening(false)
      recRef.current = null
    }

    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }

    recRef.current = rec
    rec.start()
    setListening(true)
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  return { listening, start, stop, supported }
}
