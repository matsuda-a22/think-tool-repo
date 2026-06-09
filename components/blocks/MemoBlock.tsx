"use client"

import { useEffect, useRef } from "react"
import { Sparkles } from "lucide-react"
import { useDispatch } from "@/lib/store"
import type { MemoBlock as TMemoBlock } from "@/lib/types"

type Props = {
  block: TMemoBlock
  themeId: string
  subId: string
  fineId: string
}

export default function MemoBlock({ block, themeId, subId, fineId }: Props) {
  const dispatch = useDispatch()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function update(content: string) {
    dispatch({ type: "UPDATE_BLOCK", themeId, subId, fineId, block: { ...block, content } })
  }

  // 自動拡張：内容が増えるたびに高さを再計算
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [block.content])

  // aiPrompt 付きブロックが新規生成されたときにフォーカス
  useEffect(() => {
    if (block.aiPrompt && block.content === "" && textareaRef.current) {
      textareaRef.current.focus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="rounded-md border overflow-hidden">
      {/* 上段: AI切り口（読み取り専用） */}
      {block.aiPrompt && (
        <div className="bg-primary/5 border-b px-3 py-2 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary shrink-0" />
            <span className="text-xs font-semibold text-primary leading-snug">
              {block.aiPrompt.label}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed pl-[18px]">
            {block.aiPrompt.description}
          </p>
        </div>
      )}

      {/* 下段: 自由入力エリア（自動拡張） */}
      <textarea
        ref={textareaRef}
        value={block.content}
        onChange={e => update(e.target.value)}
        placeholder={block.aiPrompt ? "ここに自分の考えを書く..." : "メモを入力..."}
        rows={block.aiPrompt ? 3 : 3}
        className="w-full resize-none bg-background px-3 py-2 text-xs leading-relaxed placeholder:text-muted-foreground focus:outline-none block"
        style={{ minHeight: block.aiPrompt ? "64px" : "72px" }}
      />
    </div>
  )
}
