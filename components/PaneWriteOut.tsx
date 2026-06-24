"use client"

import { useState, useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, Trash2, ChevronDown, Table2, FileText, Network, Sparkles, GripVertical, CheckSquare, Columns3, LayoutList } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { useDispatch, useSelectedSubTheme } from "@/lib/store"
import type { Block, FineTheme, TableColumn, TreeNode } from "@/lib/types"
import { uid } from "@/lib/utils"
import TableBlock from "./blocks/TableBlock"
import MemoBlock from "./blocks/MemoBlock"
import TreeBlock from "./blocks/TreeBlock"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import AiPanel, { type AiContextScope } from "./AiPanel"
import MicButton from "@/components/ui/MicButton"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

// ---------------------------------------------------------------------------
// Table preset definitions
// ---------------------------------------------------------------------------
type TablePreset = {
  id: string
  label: string
  icon: React.ReactNode
  makeColumns: () => TableColumn[]
}

const TABLE_PRESETS: TablePreset[] = [
  {
    id: "blank",
    label: "空白",
    icon: <Table2 className="h-4 w-4" />,
    makeColumns: () => [],
  },
  {
    id: "checklist",
    label: "チェックリスト",
    icon: <CheckSquare className="h-4 w-4" />,
    makeColumns: () => [
      { id: uid(), name: "項目", colType: "text" as const },
      { id: uid(), name: "", colType: "checkbox" as const },
    ],
  },
  {
    id: "comparison",
    label: "比較表",
    icon: <Columns3 className="h-4 w-4" />,
    makeColumns: () => [
      { id: uid(), name: "A", colType: "text" as const },
      { id: uid(), name: "B", colType: "text" as const },
      { id: uid(), name: "C", colType: "text" as const },
    ],
  },
  {
    id: "merideme",
    label: "メリット / デメリット",
    icon: <LayoutList className="h-4 w-4" />,
    makeColumns: () => [
      { id: uid(), name: "メリット", colType: "text" as const },
      { id: uid(), name: "デメリット", colType: "text" as const },
    ],
  },
]

function TablePresetDialog({
  open,
  onSelect,
  onClose,
}: {
  open: boolean
  onSelect: (columns: TableColumn[]) => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <DialogTitle className="text-sm font-semibold">テーブルのテンプレートを選択</DialogTitle>
          <DialogClose className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted transition-colors text-muted-foreground">
            ✕
          </DialogClose>
        </div>
        <div className="flex flex-col gap-2">
          {TABLE_PRESETS.map(preset => (
            <button
              key={preset.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-muted/60 transition-colors text-left"
              onClick={() => onSelect(preset.makeColumns())}
            >
              <span className="text-muted-foreground">{preset.icon}</span>
              <span className="text-sm">{preset.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InlineEdit({
  value, onSave, placeholder, className, autoEdit = false,
}: { value: string; onSave: (v: string) => void; placeholder?: string; className?: string; autoEdit?: boolean }) {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [editing])

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-1">
        <Input
          ref={ref}
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onSave(draft); setEditing(false) }}
          onKeyDown={e => {
            if (e.key === "Enter") { onSave(draft); setEditing(false) }
            if (e.key === "Escape") { setDraft(value); setEditing(false) }
          }}
          className={`h-7 px-1 text-sm font-semibold flex-1 ${className ?? ""}`}
        />
        <MicButton
          size="xs"
          onResult={text => setDraft(prev => prev ? `${prev} ${text}` : text)}
        />
      </div>
    )
  }

  return (
    <span
      className={`cursor-pointer hover:underline decoration-dotted font-semibold text-sm ${className ?? ""}`}
      onDoubleClick={() => { setDraft(value); setEditing(true) }}
      title="ダブルクリックで編集"
    >
      {value || <span className="text-muted-foreground font-normal italic">{placeholder}</span>}
    </span>
  )
}

function countTreeNodes(nodes: TreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countTreeNodes(n.children), 0)
}

// ---------------------------------------------------------------------------
// Sortable block row
// ---------------------------------------------------------------------------
function SortableBlockRow({
  block, themeId, subId, fineId, fineName, onRequestAiMemo,
}: {
  block: Block
  themeId: string
  subId: string
  fineId: string
  fineName: string
  onRequestAiMemo?: (fineId: string, blockId: string) => void
}) {
  const dispatch = useDispatch()
  const [deleteTreeOpen, setDeleteTreeOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const treeNodeCount = block.type === "tree" ? countTreeNodes(block.nodes) : 0

  return (
    <div ref={setNodeRef} style={style} className="group/block">
      {block.type === "memo" ? (
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-1 min-h-5">
            {onRequestAiMemo && block.content.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-primary"
                title="このメモだけを題材に AI 提案"
                onClick={() => onRequestAiMemo(fineId, block.id)}
              >
                <Sparkles className="h-3 w-3" />
              </Button>
            )}
            <MicButton
              size="sm"
              onResult={text => {
                const content = block.content
                dispatch({
                  type: "UPDATE_BLOCK",
                  themeId,
                  subId,
                  fineId,
                  block: {
                    ...block,
                    content: content ? `${content}\n${text}` : text,
                  },
                })
              }}
            />
            <button
              {...attributes}
              {...listeners}
              className="inline-flex items-center justify-center h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover/block:opacity-100 transition-opacity"
              title="ドラッグして並び替え"
              type="button"
            >
              <GripVertical className="h-3 w-3" />
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive opacity-0 group-hover/block:opacity-100 transition-opacity"
              onClick={() => dispatch({ type: "DELETE_BLOCK", themeId, subId, fineId, blockId: block.id })}
              title="削除"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <MemoBlock block={block} themeId={themeId} subId={subId} fineId={fineId} />
        </div>
      ) : block.type === "table" ? (
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-1 min-h-5">
            <button
              {...attributes}
              {...listeners}
              className="inline-flex items-center justify-center h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover/block:opacity-100 transition-opacity"
              title="ドラッグして並び替え"
              type="button"
            >
              <GripVertical className="h-3 w-3" />
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive opacity-0 group-hover/block:opacity-100 transition-opacity"
              onClick={() => dispatch({ type: "DELETE_BLOCK", themeId, subId, fineId, blockId: block.id })}
              title="ブロックを削除"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <TableBlock block={block} themeId={themeId} subId={subId} fineId={fineId} />
        </div>
      ) : block.type === "tree" ? (
        <div className="relative">
          <div className="absolute top-1 right-0 flex items-center gap-1 opacity-0 group-hover/block:opacity-100 z-10">
            <button
              {...attributes}
              {...listeners}
              className="inline-flex items-center justify-center h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing"
              title="ドラッグして並び替え"
              type="button"
            >
              <GripVertical className="h-3 w-3" />
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive"
              onClick={() => setDeleteTreeOpen(true)}
              title="ブロックを削除"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <TreeBlock block={block} themeId={themeId} subId={subId} fineId={fineId} fineName={fineName} />
          <Dialog open={deleteTreeOpen} onOpenChange={setDeleteTreeOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogTitle className="text-sm">ツリーブロックを削除</DialogTitle>
              <DialogDescription>
                「{block.rootLabel?.trim() || fineName}」のロジックツリー／マインドマップを削除しますか？
              </DialogDescription>
              {treeNodeCount > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  ノード {treeNodeCount} 件が含まれています。この操作は取り消せません。
                </p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setDeleteTreeOpen(false)}>
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    dispatch({ type: "DELETE_BLOCK", themeId, subId, fineId, blockId: block.id })
                    setDeleteTreeOpen(false)
                  }}
                >
                  削除
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FineThemeSection
// ---------------------------------------------------------------------------
function FineThemeSection({
  fine, themeId, subId, autoEdit, dragHandleProps, onRequestAiMemo,
}: {
  fine: FineTheme
  themeId: string
  subId: string
  autoEdit?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
  onRequestAiMemo?: (fineId: string, blockId: string) => void
}) {
  const dispatch = useDispatch()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [tablePresetOpen, setTablePresetOpen] = useState(false)

  function handleBlockDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fine.blocks.findIndex(b => b.id === active.id)
    const newIndex = fine.blocks.findIndex(b => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    dispatch({
      type: "REORDER_BLOCKS",
      themeId, subId, fineId: fine.id,
      blocks: arrayMove(fine.blocks, oldIndex, newIndex),
    })
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-1 group/fine">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            className="text-muted-foreground opacity-0 group-hover/fine:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
            type="button"
            title="ドラッグして並び替え"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <InlineEdit
          value={fine.name}
          placeholder="困りごと・悩みごと・考えごと"
          onSave={name => dispatch({ type: "UPDATE_FINE_THEME", themeId, subId, fineId: fine.id, name })}
          className="flex-1"
          autoEdit={autoEdit}
        />
        <div className="flex items-center gap-0.5 opacity-0 group-hover/fine:opacity-100 shrink-0">
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-destructive"
            onClick={() => dispatch({ type: "DELETE_FINE_THEME", themeId, subId, fineId: fine.id })}
          ><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
        <SortableContext items={fine.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {fine.blocks.map(block => (
              <SortableBlockRow
                key={block.id}
                block={block}
                themeId={themeId}
                subId={subId}
                fineId={fine.id}
                fineName={fine.name}
                onRequestAiMemo={onRequestAiMemo}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <DropdownMenu>
        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 text-xs gap-1")}>
          <Plus className="h-3.5 w-3.5" />
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => dispatch({ type: "ADD_BLOCK", themeId, subId, fineId: fine.id, blockType: "memo" })}>
            <FileText className="h-3.5 w-3.5 mr-2" /> メモ
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTablePresetOpen(true)}>
            <Table2 className="h-3.5 w-3.5 mr-2" /> テーブル
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch({ type: "ADD_BLOCK", themeId, subId, fineId: fine.id, blockType: "tree" })}>
            <Network className="h-3.5 w-3.5 mr-2" /> ツリー
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TablePresetDialog
        open={tablePresetOpen}
        onSelect={columns => {
          dispatch({ type: "ADD_TABLE_BLOCK", themeId, subId, fineId: fine.id, columns })
          setTablePresetOpen(false)
        }}
        onClose={() => setTablePresetOpen(false)}
      />
    </div>
  )
}

function SortableFineThemeSection(props: {
  fine: FineTheme
  themeId: string
  subId: string
  autoEdit?: boolean
  onRequestAiMemo?: (fineId: string, blockId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.fine.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style}>
      <FineThemeSection
        {...props}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  )
}

export default function PaneWriteOut() {
  const dispatch = useDispatch()
  const { sub, themeId } = useSelectedSubTheme()
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInitialScope, setAiInitialScope] = useState<AiContextScope | null>(null)

  function openAiForMemo(fineId: string, blockId: string) {
    setAiInitialScope({ kind: "memo", fineId, blockId })
    setActiveFineId(fineId)
    setAiOpen(true)
  }

  function toggleAiPanel() {
    setAiOpen(v => {
      if (!v) setAiInitialScope(null)
      return !v
    })
  }
  const [activeFineId, setActiveFineId] = useState<string | null>(null)
  const [newlyAddedFineId, setNewlyAddedFineId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (sub?.fineThemes[0]) setActiveFineId(sub.fineThemes[0].id)
  }, [sub?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fineIds = sub?.fineThemes.map(f => f.id).join(",") ?? ""
  const prevFineIdsRef = useRef<string>("")
  useEffect(() => {
    if (!sub) return
    if (prevFineIdsRef.current === "") { prevFineIdsRef.current = fineIds; return }
    const prev = prevFineIdsRef.current.split(",").filter(Boolean)
    const curr = fineIds.split(",").filter(Boolean)
    const added = curr.filter(id => !prev.includes(id))
    if (added.length > 0) setNewlyAddedFineId(added[added.length - 1])
    prevFineIdsRef.current = fineIds
  }, [fineIds]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFineDragEnd(event: DragEndEvent) {
    if (!sub || !themeId) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sub.fineThemes.findIndex(f => f.id === active.id)
    const newIndex = sub.fineThemes.findIndex(f => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    dispatch({
      type: "REORDER_FINE_THEMES",
      themeId, subId: sub.id,
      fineThemes: arrayMove(sub.fineThemes, oldIndex, newIndex),
    })
  }

  function handleAddSource(url: string, _title: string) {
    if (!sub || !themeId) return
    dispatch({
      type: "ADD_SOURCE",
      themeId,
      subId: sub.id,
      source: { kind: "url", url, base64: null, comment: _title || "" },
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-r">
      {/* Header */}
      <div className="px-3 py-2 border-b shrink-0 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">② 書き出し</span>
        {sub && (
          <Button
            variant={aiOpen ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs shrink-0 gap-1 ml-auto"
            onClick={toggleAiPanel}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI 提案
          </Button>
        )}
      </div>

      {!sub && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
          ← ペイン①で小テーマを選択してください
        </div>
      )}

      {sub && themeId && (
        <div className="flex flex-col flex-1 min-h-0">
          {(() => {
            const writeScroll = (
              <ScrollArea className={aiOpen ? "h-full" : "flex-1 min-h-0"}>
                <div className="p-3 space-y-4">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFineDragEnd}>
                    <SortableContext items={sub.fineThemes.map(f => f.id)} strategy={verticalListSortingStrategy}>
                      {sub.fineThemes.map((fine, i) => (
                        <div key={fine.id} onClick={() => setActiveFineId(fine.id)}>
                          {i > 0 && <Separator className="mb-4" />}
                          <SortableFineThemeSection
                            fine={fine}
                            themeId={themeId}
                            subId={sub.id}
                            autoEdit={newlyAddedFineId === fine.id}
                            onRequestAiMemo={openAiForMemo}
                          />
                        </div>
                      ))}
                    </SortableContext>
                  </DndContext>

                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs border-dashed text-muted-foreground hover:text-foreground"
                    onClick={() => dispatch({ type: "ADD_FINE_THEME", themeId, subId: sub.id })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    考えごとを追加
                  </Button>
                </div>
              </ScrollArea>
            )

            const aiPanel = (
              <AiPanel
                key={
                  aiInitialScope?.kind === "memo"
                    ? `memo-${aiInitialScope.blockId}`
                    : aiInitialScope?.kind === "fine"
                      ? `fine-${aiInitialScope.fineId}`
                      : "all"
                }
                subTheme={sub}
                onInsertMemo={(text, fineId) => {
                  dispatch({ type: "ADD_MEMO_WITH_CONTENT", themeId, subId: sub.id, fineId, content: text })
                }}
                onAddSource={handleAddSource}
                defaultFineThemeId={activeFineId}
                initialScope={aiInitialScope}
                onClose={() => {
                  setAiOpen(false)
                  setAiInitialScope(null)
                }}
              />
            )

            if (!aiOpen) return writeScroll

            return (
              <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
                <ResizablePanel id="pane2-write" defaultSize={62} minSize={22}>
                  {writeScroll}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="pane2-ai" defaultSize={38} minSize={24}>
                  {aiPanel}
                </ResizablePanel>
              </ResizablePanelGroup>
            )
          })()}
        </div>
      )}
    </div>
  )
}
