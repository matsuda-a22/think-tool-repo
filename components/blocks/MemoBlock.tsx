"use client"

import { Textarea } from "@/components/ui/textarea"
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

  function update(content: string) {
    dispatch({ type: "UPDATE_BLOCK", themeId, subId, fineId, block: { ...block, content } })
  }

  return (
    <Textarea
      value={block.content}
      onChange={e => update(e.target.value)}
      placeholder="メモを入力..."
      className="text-xs min-h-[80px] resize-none"
    />
  )
}
