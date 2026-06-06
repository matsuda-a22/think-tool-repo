"use client"

import { Mic, MicOff } from "lucide-react"
import { useSpeechInput } from "@/lib/useSpeechInput"
import { cn } from "@/lib/utils"

type Props = {
  /** 認識結果を受け取るコールバック */
  onResult: (text: string) => void
  className?: string
  /** ボタンサイズ（デフォルト: sm） */
  size?: "xs" | "sm"
}

export default function MicButton({ onResult, className, size = "sm" }: Props) {
  const { listening, start, stop, supported } = useSpeechInput(onResult)

  if (!supported) return null

  const sizeClass = size === "xs"
    ? "h-4 w-4"
    : "h-5 w-5"

  const iconClass = size === "xs"
    ? "h-2.5 w-2.5"
    : "h-3 w-3"

  return (
    <button
      type="button"
      title={listening ? "停止" : "音声入力"}
      onClick={listening ? stop : start}
      className={cn(
        "inline-flex items-center justify-center rounded shrink-0 transition-colors",
        sizeClass,
        listening
          ? "text-red-500 animate-pulse bg-red-50 dark:bg-red-950"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
        className,
      )}
    >
      {listening ? <MicOff className={iconClass} /> : <Mic className={iconClass} />}
    </button>
  )
}
