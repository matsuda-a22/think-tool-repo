"use client"

import { useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Plus, Trash2, ChevronDown, CheckSquare, Calendar, FileText, ClipboardList,
  GripVertical, ChevronRight, TrendingUp,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useStore, useDispatch, useSelectedSubTheme } from "@/lib/store"
import { computeCostSummary } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { ActionEntry, DecisionEntry, ScheduleEntry, TaskEntry } from "@/lib/types"
import EntryModal from "./EntryModal"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// ---------------------------------------------------------------------------
// Cost summary
// ---------------------------------------------------------------------------
function CostSummarySection() {
  const store = useStore()
  const { sub } = useSelectedSubTheme()
  const { bySubTheme, overall } = computeCostSummary(store)
  const [expanded, setExpanded] = useState<string[]>([])

  const subThemeSummary = sub
    ? bySubTheme.find(s => s.subThemeName === sub.name)
    : null

  if (!subThemeSummary && overall.length === 0) {
    return <p className="text-xs text-muted-foreground italic">費用データなし</p>
  }

  const subTotal = subThemeSummary?.monthly.reduce((s, m) => s + m.amount, 0) ?? 0
  const overallTotal = overall.reduce((s, m) => s + m.amount, 0)

  return (
    <div className="space-y-1 text-xs">
      {/* 2行常時表示 */}
      <div
        className="flex items-center justify-between px-1 py-1 rounded hover:bg-muted cursor-pointer"
        onClick={() => setExpanded(v => v.includes("sub") ? v.filter(x => x !== "sub") : [...v, "sub"])}
      >
        <span className="flex items-center gap-1 text-muted-foreground">
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded.includes("sub") && "rotate-90")} />
          {sub?.name ?? "選択中テーマ"}
        </span>
        <span className="font-mono font-semibold">¥{subTotal.toLocaleString()}</span>
      </div>
      {expanded.includes("sub") && subThemeSummary && (
        <div className="pl-5 space-y-0.5">
          {subThemeSummary.monthly.map(mc => (
            <div key={`${mc.year}-${mc.month}`} className="flex justify-between text-muted-foreground">
              <span>{mc.year}年{mc.month}月</span>
              <span className="font-mono">¥{mc.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-between px-1 py-1 rounded hover:bg-muted cursor-pointer"
        onClick={() => setExpanded(v => v.includes("all") ? v.filter(x => x !== "all") : [...v, "all"])}
      >
        <span className="flex items-center gap-1 font-medium">
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded.includes("all") && "rotate-90")} />
          <TrendingUp className="h-3 w-3" />
          全体合計
        </span>
        <span className="font-mono font-semibold">¥{overallTotal.toLocaleString()}</span>
      </div>
      {expanded.includes("all") && (
        <div className="pl-5 space-y-0.5">
          {overall.map(mc => (
            <div key={`${mc.year}-${mc.month}`} className="flex justify-between text-muted-foreground">
              <span>{mc.year}年{mc.month}月</span>
              <span className="font-mono">¥{mc.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry type icon + label
// ---------------------------------------------------------------------------
function entryIcon(type: ActionEntry["type"]) {
  switch (type) {
    case "decision": return <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
    case "schedule": return <Calendar className="h-3.5 w-3.5 text-purple-500" />
    case "task": return <CheckSquare className="h-3.5 w-3.5 text-green-500" />
    case "memo_entry": return <FileText className="h-3.5 w-3.5 text-orange-400" />
  }
}

function entryLabel(type: ActionEntry["type"]) {
  switch (type) {
    case "decision": return "決定事項"
    case "schedule": return "日程"
    case "task": return "タスク"
    case "memo_entry": return "メモ"
  }
}

function entrySubline(entry: ActionEntry) {
  if (entry.type === "schedule") {
    const s = entry as ScheduleEntry
    if (s.dateStart) return `${s.dateStart}${s.dateEnd ? ` 〜 ${s.dateEnd}` : ""}`
  }
  if (entry.type === "task") {
    const t = entry as TaskEntry
    if (t.dueDate) return `期日: ${t.dueDate}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Sortable entry row
// ---------------------------------------------------------------------------
function EntryRow({
  entry, themeId, subId, onEdit,
}: { entry: ActionEntry; themeId: string; subId: string; onEdit: () => void }) {
  const dispatch = useDispatch()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const costTotal = entry.costs.reduce((s, c) => s + c.amount, 0)
  const sub = entrySubline(entry)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-1.5 group rounded-md px-1 py-1.5 hover:bg-muted/50 cursor-default"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Task checkbox */}
      {entry.type === "task" && (
        <Checkbox
          checked={(entry as TaskEntry).done}
          onCheckedChange={() =>
            dispatch({
              type: "UPDATE_ENTRY",
              themeId,
              subId,
              entry: { ...entry, done: !(entry as TaskEntry).done } as ActionEntry,
            })
          }
          className="mt-0.5 shrink-0"
        />
      )}

      {/* Decision toggle */}
      {entry.type === "decision" && (
        <button
          className="mt-0.5 shrink-0"
          onClick={() =>
            dispatch({
              type: "UPDATE_ENTRY",
              themeId,
              subId,
              entry: { ...entry, decided: !(entry as DecisionEntry).decided } as ActionEntry,
            })
          }
          title={(entry as DecisionEntry).decided ? "決定済み → 未決定に変更" : "未決定 → 決定済みに変更"}
        >
          <Switch
            checked={(entry as DecisionEntry).decided}
            className="pointer-events-none h-4 w-7 scale-75"
          />
        </button>
      )}

      {/* Icon (for non-decision/task) */}
      {entry.type !== "task" && entry.type !== "decision" && (
        <span className="mt-0.5 shrink-0">{entryIcon(entry.type)}</span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[10px] text-muted-foreground shrink-0",
          )}>
            {entryLabel(entry.type)}
          </span>
          {entry.type === "decision" && (
            <span className={cn(
              "text-[10px] px-1 rounded",
              (entry as DecisionEntry).decided
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
            )}>
              {(entry as DecisionEntry).decided ? "決定済み" : "未決定"}
            </span>
          )}
        </div>
        <p className={cn(
          "text-sm mt-0.5 truncate",
          entry.type === "task" && (entry as TaskEntry).done && "line-through text-muted-foreground",
        )}>
          {entry.title || <span className="text-muted-foreground italic text-xs">（タイトルなし）</span>}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        {entry.memo.trim() && (
          <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-words leading-relaxed">
            {entry.memo}
          </p>
        )}
        {costTotal > 0 && (
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">¥{costTotal.toLocaleString()}</p>
        )}
      </div>

      {/* Delete */}
      <Button
        variant="ghost" size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
        onClick={() => setDeleteOpen(true)}
        aria-label={`${entry.title || entryLabel(entry.type)} を削除`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="text-sm">削除しますか？</DialogTitle>
            <DialogClose className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted transition-colors text-muted-foreground">
              ✕
            </DialogClose>
          </div>
          <DialogDescription className="text-xs">
            「{entry.title?.trim() || entryLabel(entry.type)}」を削除します。この操作は取り消せません。
          </DialogDescription>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                dispatch({ type: "DELETE_ENTRY", themeId, subId, entryId: entry.id })
                setDeleteOpen(false)
              }}
            >
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function PaneActions() {
  const dispatch = useDispatch()
  const { sub, themeId } = useSelectedSubTheme()
  const [editingEntry, setEditingEntry] = useState<ActionEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    if (!sub || !themeId) return
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = sub.entries.findIndex(e => e.id === active.id)
      const newIndex = sub.entries.findIndex(e => e.id === over.id)
      dispatch({
        type: "REORDER_ENTRIES",
        themeId,
        subId: sub.id,
        entries: arrayMove(sub.entries, oldIndex, newIndex),
      })
    }
  }

  function openEdit(entry: ActionEntry) {
    setEditingEntry(entry)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-r">
      <div className="px-3 py-2 border-b shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">③ 決定・アクション</span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-4">
          {/* 費用集計（常時表示） */}
          <div>
            <p className="text-xs font-semibold mb-2">費用集計</p>
            <CostSummarySection />
          </div>

          <Separator />

          {/* エントリー一覧 */}
          <div>
            {!sub && (
              <p className="text-xs text-muted-foreground italic">小テーマを選択するとエントリーを追加できます</p>
            )}

            {sub && themeId && (
              <>
                {sub.entries.length === 0 && (
                  <p className="text-xs text-muted-foreground italic mb-2">エントリーなし</p>
                )}

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sub.entries.map(e => e.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-0.5">
                      {sub.entries.map(entry => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          themeId={themeId}
                          subId={sub.id}
                          onEdit={() => openEdit(entry)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Add entry dropdown */}
                <div className="mt-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="w-full h-8 text-xs border border-dashed rounded-md text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                      追加
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-40">
                      <DropdownMenuItem onClick={() =>
                        dispatch({ type: "ADD_ENTRY", themeId, subId: sub.id, entryType: "decision" })
                      }>
                        <ClipboardList className="h-3.5 w-3.5 mr-2 text-blue-500" /> 決定事項
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => dispatch({ type: "ADD_ENTRY", themeId, subId: sub.id, entryType: "schedule" })}>
                        <Calendar className="h-3.5 w-3.5 mr-2 text-purple-500" /> 日程
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => dispatch({ type: "ADD_ENTRY", themeId, subId: sub.id, entryType: "task" })}>
                        <CheckSquare className="h-3.5 w-3.5 mr-2 text-green-500" /> タスク
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => dispatch({ type: "ADD_ENTRY", themeId, subId: sub.id, entryType: "memo_entry" })}>
                        <FileText className="h-3.5 w-3.5 mr-2 text-orange-400" /> メモ
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Edit modal */}
      {editingEntry && themeId && sub && (
        <EntryModal
          entry={editingEntry}
          themeId={themeId}
          subId={sub.id}
          open={modalOpen}
          onOpenChange={open => {
            setModalOpen(open)
            if (!open) setEditingEntry(null)
          }}
        />
      )}
    </div>
  )
}
