"use client"

import { useState, useRef, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Link2, ImageIcon, Upload, GripVertical } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useDispatch, useSelectedSubTheme } from "@/lib/store"
import type { Source } from "@/lib/types"
import { cn } from "@/lib/utils"
import MicButton from "@/components/ui/MicButton"

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp)(\?.*)?$/i.test(url)
}

// ---------------------------------------------------------------------------
// Source card
// ---------------------------------------------------------------------------
function SourceCard({
  source, themeId, subId, dragHandleProps,
}: {
  source: Source; themeId: string; subId: string
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
}) {
  const dispatch = useDispatch()
  const [commentOpen, setCommentOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const commentRef = useRef(source.comment)
  commentRef.current = source.comment

  function update(patch: Partial<Source>) {
    dispatch({ type: "UPDATE_SOURCE", themeId, subId, source: { ...source, ...patch } })
  }

  const imgSrc = source.base64 ?? (isImageUrl(source.url) ? source.url : null)

  return (
    <div className="border rounded-md p-2 space-y-1.5 group">
      <div className="flex items-start gap-2">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            className="mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
            type="button"
            title="ドラッグして並び替え"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        {source.kind === "url" ? (
          <Link2 className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5 mt-0.5 text-purple-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {source.kind === "url" ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline break-all line-clamp-2"
            >
              {source.url}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground break-all line-clamp-1">{source.url}</span>
          )}
        </div>
        <Button
          variant="ghost" size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
          onClick={() => setDeleteOpen(true)}
          aria-label="ソースを削除"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="text-sm">削除しますか？</DialogTitle>
            <DialogClose className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted transition-colors text-muted-foreground">
              ✕
            </DialogClose>
          </div>
          <DialogDescription className="text-xs">
            この情報ソースを削除します。この操作は取り消せません。
          </DialogDescription>
          <p className="mt-2 text-xs text-muted-foreground break-all">
            {source.kind === "url" ? source.url : source.url}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                dispatch({ type: "DELETE_SOURCE", themeId, subId, sourceId: source.id })
                setDeleteOpen(false)
              }}
            >
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {imgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt=""
          className="rounded max-h-40 w-full object-contain bg-muted"
          onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
        />
      )}

      <div>
        {commentOpen ? (
          <div className="relative">
            <Textarea
              value={source.comment}
              onChange={e => update({ comment: e.target.value })}
              placeholder="コメントを入力..."
              className="text-xs min-h-[60px] resize-none pr-7"
              onBlur={() => !source.comment && setCommentOpen(false)}
              autoFocus
            />
            <div className="absolute top-1.5 right-1.5">
              <MicButton
                size="xs"
                onResult={text => {
                  const current = commentRef.current
                  update({ comment: current ? `${current}\n${text}` : text })
                }}
              />
            </div>
          </div>
        ) : (
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setCommentOpen(true)}
          >
            {source.comment || "+ コメントを追加"}
          </button>
        )}
      </div>
    </div>
  )
}

function SortableSourceCard(props: { source: Source; themeId: string; subId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.source.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style}>
      <SourceCard
        {...props}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function PaneSources() {
  const dispatch = useDispatch()
  const { sub, themeId } = useSelectedSubTheme()
  const [urlInput, setUrlInput] = useState("")
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleSourceDragEnd(event: DragEndEvent) {
    if (!sub || !themeId) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sub.sources.findIndex(s => s.id === active.id)
    const newIndex = sub.sources.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    dispatch({
      type: "REORDER_SOURCES",
      themeId, subId: sub.id,
      sources: arrayMove(sub.sources, oldIndex, newIndex),
    })
  }

  function addUrl() {
    if (!urlInput.trim() || !sub || !themeId) return
    dispatch({
      type: "ADD_SOURCE",
      themeId,
      subId: sub.id,
      source: { kind: "url", url: urlInput.trim(), base64: null, comment: "" },
    })
    setUrlInput("")
  }

  function addImageFile(file: File) {
    if (!sub || !themeId) return
    const reader = new FileReader()
    reader.onload = e => {
      const base64 = e.target?.result as string
      dispatch({
        type: "ADD_SOURCE",
        themeId,
        subId: sub.id,
        source: { kind: "image", url: file.name, base64, comment: "" },
      })
    }
    reader.readAsDataURL(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"))
    files.forEach(addImageFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, themeId])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">④ 情報ソース</span>
      </div>

      {!sub && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
          ← 小テーマを選択してください
        </div>
      )}

      {sub && themeId && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* URL input */}
          <div className="px-3 pt-2 pb-1 shrink-0 flex gap-1">
            <Input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="URL を入力して追加"
              className="h-7 text-xs flex-1"
              onKeyDown={e => e.key === "Enter" && addUrl()}
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={addUrl}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Image upload / drop zone */}
          <div
            className={cn(
              "mx-3 mb-2 border-2 border-dashed rounded-md p-2 text-center text-xs text-muted-foreground cursor-pointer transition-colors shrink-0",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground",
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mx-auto mb-1" />
            画像をドロップ or クリックしてアップロード
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => {
              Array.from(e.target.files ?? []).forEach(addImageFile)
              e.target.value = ""
            }}
          />

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-3 pb-3 space-y-2">
              {sub.sources.length === 0 && (
                <p className="text-xs text-muted-foreground italic">情報ソースなし</p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSourceDragEnd}>
                <SortableContext items={sub.sources.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {sub.sources.map(source => (
                    <SortableSourceCard key={source.id} source={source} themeId={themeId} subId={sub.id} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
