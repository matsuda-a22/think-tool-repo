"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Plus, Trash2, CheckCircle2, RotateCcw, FolderOpen, UserPlus, X, GripVertical, AlertTriangle, MoreHorizontal,
} from "lucide-react"
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
import { useStore, useDispatch } from "@/lib/store"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  createHandle,
} from "@/components/ui/dialog"
import { cn, STAKEHOLDER_COLORS } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { SubTheme, Theme } from "@/lib/types"
import { buttonVariants } from "@/components/ui/button"
import MicButton from "@/components/ui/MicButton"

// ---------------------------------------------------------------------------
// Inline editable text
// ---------------------------------------------------------------------------
function InlineEdit({
  value, onSave, className, autoEdit = false,
}: { value: string; onSave: (v: string) => void; className?: string; autoEdit?: boolean }) {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [editing])

  if (editing) {
    return (
      <div className="flex items-start gap-1 flex-1">
        <textarea
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onSave(draft); setEditing(false) }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(draft); setEditing(false) }
            if (e.key === "Escape") { setDraft(value); setEditing(false) }
          }}
          rows={1}
          className={cn(
            "flex-1 resize-none [field-sizing:content] min-h-0 rounded border border-input bg-transparent px-1 py-0.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
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
      className={cn("cursor-pointer hover:underline decoration-dotted break-words min-w-0", className)}
      onDoubleClick={() => { setDraft(value); setEditing(true) }}
      title="ダブルクリックで編集"
    >
      {value}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Color palette shared UI
// ---------------------------------------------------------------------------
function ColorPalette({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {STAKEHOLDER_COLORS.map(c => (
        <button
          key={c}
          style={{ backgroundColor: c }}
          className={cn(
            "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
            value === c ? "border-foreground scale-110" : "border-transparent",
          )}
          onClick={() => onChange(c)}
          type="button"
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stakeholder badge strip + add / edit popovers
// ---------------------------------------------------------------------------
function StakeholderRow({ theme, sub }: { theme: Theme; sub: SubTheme }) {
  const store = useStore()
  const dispatch = useDispatch()

  const nextColor = () => STAKEHOLDER_COLORS[sub.stakeholders.length % STAKEHOLDER_COLORS.length]

  const [addName, setAddName] = useState("")
  const [addColor, setAddColor] = useState(STAKEHOLDER_COLORS[0])
  const [addOpen, setAddOpen] = useState(false)
  const [saveGlobal, setSaveGlobal] = useState(false)
  // manage mode: show edit UI for global stakeholders inside the popover
  const [managing, setManaging] = useState(false)
  const [editGlobalId, setEditGlobalId] = useState<string | null>(null)
  const [editGlobalName, setEditGlobalName] = useState("")
  const [editGlobalColor, setEditGlobalColor] = useState(STAKEHOLDER_COLORS[0])

  // edit state per badge
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState(STAKEHOLDER_COLORS[0])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingGlobalDelete, setConfirmingGlobalDelete] = useState(false)

  const alreadyIds = new Set(sub.stakeholders.map(s => s.name + s.color))

  function openAdd() {
    setAddColor(nextColor())
    setAddName("")
    setSaveGlobal(false)
    setManaging(false)
    setEditGlobalId(null)
    setAddOpen(true)
  }

  function add() {
    if (!addName.trim()) return
    dispatch({ type: "ADD_STAKEHOLDER", themeId: theme.id, subId: sub.id, name: addName.trim(), color: addColor })
    if (saveGlobal) {
      dispatch({ type: "ADD_GLOBAL_STAKEHOLDER", name: addName.trim(), color: addColor })
    }
    setAddName("")
    setAddColor(STAKEHOLDER_COLORS[(sub.stakeholders.length + 1) % STAKEHOLDER_COLORS.length])
    setSaveGlobal(false)
    setAddOpen(false)
  }

  function addFromGlobal(st: typeof store.globalStakeholders[number]) {
    dispatch({ type: "ADD_STAKEHOLDER", themeId: theme.id, subId: sub.id, name: st.name, color: st.color })
    setAddOpen(false)
  }

  function openEdit(st: SubTheme["stakeholders"][number]) {
    setEditId(st.id)
    setEditName(st.name)
    setEditColor(st.color)
    setConfirmingDelete(false)
  }

  function saveEdit() {
    if (!editId || !editName.trim()) return
    dispatch({ type: "UPDATE_STAKEHOLDER", themeId: theme.id, subId: sub.id, stakeholderId: editId, name: editName.trim(), color: editColor })
    setEditId(null)
    setConfirmingDelete(false)
  }

  function deleteEdit() {
    if (!editId) return
    dispatch({ type: "DELETE_STAKEHOLDER", themeId: theme.id, subId: sub.id, stakeholderId: editId })
    setEditId(null)
    setConfirmingDelete(false)
  }

  function openEditGlobal(st: typeof store.globalStakeholders[number]) {
    setEditGlobalId(st.id)
    setEditGlobalName(st.name)
    setEditGlobalColor(st.color)
    setConfirmingGlobalDelete(false)
  }

  function saveEditGlobal() {
    if (!editGlobalId || !editGlobalName.trim()) return
    dispatch({ type: "UPDATE_GLOBAL_STAKEHOLDER", id: editGlobalId, name: editGlobalName.trim(), color: editGlobalColor })
    setEditGlobalId(null)
  }

  const globals = store.globalStakeholders ?? []

  return (
    <div className="flex flex-wrap gap-1 items-center mt-1">
      {sub.stakeholders.map(st => (
        <Popover
          key={st.id}
          open={editId === st.id}
          onOpenChange={open => { if (!open) setEditId(null) }}
        >
          <PopoverTrigger
            style={{ backgroundColor: st.color, color: "#fff" }}
            className="text-[10px] py-0 px-1.5 cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center rounded-[9999px] border border-transparent font-medium h-5"
            onClick={e => { e.stopPropagation(); openEdit(st) }}
            title="クリックで編集"
          >
            {st.name}
          </PopoverTrigger>
          <PopoverContent className="w-60 p-3 space-y-2.5" align="start">
            <Input
              placeholder="関係者名"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null) }}
              className="h-7 text-xs"
              autoFocus
            />
            <ColorPalette value={editColor} onChange={setEditColor} />
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={saveEdit}>保存</Button>
              {confirmingDelete ? (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setConfirmingDelete(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={deleteEdit}>
                    削除する
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={() => setConfirmingDelete(true)} title="削除">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      ))}

      <Popover open={addOpen} onOpenChange={open => { if (!open) { setAddOpen(false); setManaging(false); setEditGlobalId(null) } }}>
        <PopoverTrigger
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-4 w-4 rounded-full")}
          onClick={e => { e.stopPropagation(); openAdd() }}
        >
          <UserPlus className="h-2.5 w-2.5" />
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2.5" align="start">
          {/* 固定人物セクション */}
          {globals.length > 0 && !managing && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">固定人物</span>
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setManaging(true)}
                  type="button"
                >
                  管理
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {globals.map(st => {
                  const already = alreadyIds.has(st.name + st.color)
                  return (
                    <button
                      key={st.id}
                      type="button"
                      disabled={already}
                      onClick={() => addFromGlobal(st)}
                      title={already ? "追加済み" : `${st.name} を追加`}
                    >
                      <Badge
                        style={{ backgroundColor: st.color, color: "#fff", opacity: already ? 0.4 : 1 }}
                        className="text-[10px] py-0 px-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        {st.name}
                      </Badge>
                    </button>
                  )
                })}
              </div>
              <div className="border-t pt-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">新しく追加</span>
              </div>
            </div>
          )}

          {/* 固定人物の管理モード */}
          {managing && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">固定人物を管理</span>
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => { setManaging(false); setEditGlobalId(null) }}
                  type="button"
                >
                  戻る
                </button>
              </div>
              {globals.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">固定人物なし</p>
              )}
              {globals.map(st => (
                <div key={st.id}>
                  {editGlobalId === st.id ? (
                    <div className="space-y-1.5 border rounded p-1.5">
                      <Input
                        value={editGlobalName}
                        onChange={e => setEditGlobalName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEditGlobal(); if (e.key === "Escape") setEditGlobalId(null) }}
                        className="h-6 text-xs"
                        autoFocus
                      />
                      <ColorPalette value={editGlobalColor} onChange={setEditGlobalColor} />
                      <div className="flex gap-1">
                        <Button size="sm" className="flex-1 h-6 text-[10px]" onClick={saveEditGlobal}>保存</Button>
                        {confirmingGlobalDelete ? (
                          <>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" onClick={() => setConfirmingGlobalDelete(false)}>
                              <X className="h-2.5 w-2.5" />
                            </Button>
                            <Button size="sm" variant="destructive" className="h-6 text-[10px]"
                              onClick={() => { dispatch({ type: "DELETE_GLOBAL_STAKEHOLDER", id: st.id }); setEditGlobalId(null); setConfirmingGlobalDelete(false) }}
                            >
                              削除する
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="destructive" className="h-6 text-[10px] px-1.5" title="削除"
                            onClick={() => setConfirmingGlobalDelete(true)}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between group/gst">
                      <Badge
                        style={{ backgroundColor: st.color, color: "#fff" }}
                        className="text-[10px] py-0 px-1.5"
                      >
                        {st.name}
                      </Badge>
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground opacity-0 group-hover/gst:opacity-100 hover:text-foreground transition-opacity"
                        onClick={() => openEditGlobal(st)}
                      >
                        編集
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="border-t pt-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">新しく登録</span>
              </div>
            </div>
          )}

          {/* 手動追加フォーム */}
          <Input
            placeholder="関係者名"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") setAddOpen(false) }}
            className="h-7 text-xs"
            autoFocus={globals.length === 0}
          />
          <ColorPalette value={addColor} onChange={setAddColor} />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer select-none flex-1">
              <input
                type="checkbox"
                className="w-3 h-3 accent-primary"
                checked={saveGlobal || managing}
                onChange={e => setSaveGlobal(e.target.checked)}
              />
              <span className="text-[10px] text-muted-foreground">固定人物に登録</span>
            </label>
            <Button size="sm" className="h-7 text-xs px-3" onClick={add}>追加</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SubTheme row
// ---------------------------------------------------------------------------
function SubThemeRow({ theme, sub, selected, dimmed, autoEdit, dragHandleProps }: {
  theme: Theme; sub: SubTheme; selected: boolean; dimmed?: boolean; autoEdit?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
}) {
  const dispatch = useDispatch()
  const [deleteHandle] = useState(() => createHandle())

  return (
    <div
      className={cn(
        "rounded-md px-2 py-1.5 cursor-pointer transition-all group",
        selected
          ? "bg-orange-100 border border-orange-300 shadow-sm ring-1 ring-orange-200 dark:bg-orange-900/30 dark:border-orange-700/60 dark:ring-orange-800/40"
          : dimmed
          ? "opacity-45 hover:opacity-80 hover:bg-muted"
          : "hover:bg-muted",
      )}
      onClick={() => dispatch({ type: "SELECT_SUB_THEME", subId: sub.id })}
    >
      <div className="flex items-center gap-1">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
            onClick={e => e.stopPropagation()}
            type="button"
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}
        <InlineEdit
          value={sub.name}
          onSave={name => dispatch({ type: "UPDATE_SUB_THEME", themeId: theme.id, subId: sub.id, name })}
          className={cn("flex-1 text-sm", selected && "font-semibold text-orange-700 dark:text-orange-300")}
          autoEdit={autoEdit}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: "ghost" }), "h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0")}
            title="操作"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuItem
              className="text-xs gap-2"
              onSelect={() => dispatch({ type: "RESOLVE_SUB_THEME", themeId: theme.id, subId: sub.id })}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              解決済みにする
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="text-xs gap-2"
              onSelect={() => deleteHandle.open(null)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <StakeholderRow theme={theme} sub={sub} />

      <Dialog handle={deleteHandle}>
        <DialogContent className="max-w-sm p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <DialogTitle>小テーマを削除しますか？</DialogTitle>
              <DialogDescription>
                「{sub.name}」のデータ（関係者・考えごと・メモ等）が完全に削除されます。この操作は取り消せません。
              </DialogDescription>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <DialogClose render={
              <Button variant="outline" size="sm">キャンセル</Button>
            } />
            <DialogClose render={
              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  dispatch({ type: "DELETE_SUB_THEME", themeId: theme.id, subId: sub.id })
                }}
              >
                削除する
              </Button>
            } />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableSubThemeRow(props: { theme: Theme; sub: SubTheme; selected: boolean; dimmed?: boolean; autoEdit?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.sub.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style}>
      <SubThemeRow {...props} dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resolved folder (全テーマまとめて表示)
// ---------------------------------------------------------------------------
function ResolvedFolder() {
  const store = useStore()
  const dispatch = useDispatch()
  const [open, setOpen] = useState<string[]>(["resolved"])
  const [deleteHandle] = useState(() => createHandle())
  const [pending, setPending] = useState<{ themeId: string; themeName: string; subId: string; subName: string } | null>(null)

  const multiTheme = store.themes.length > 1

  const allResolved = store.themes.flatMap(theme =>
    theme.resolvedSubThemes.map(sub => ({ theme, sub }))
  )

  if (allResolved.length === 0) return null

  return (
    <Accordion value={open} onValueChange={setOpen} className="mt-2">
      <AccordionItem value="resolved" className="border rounded-md px-2">
        <AccordionTrigger className="py-1.5 text-xs text-muted-foreground gap-1">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          解決フォルダ ({allResolved.length})
        </AccordionTrigger>
        <AccordionContent className="pb-1 space-y-1">
          {allResolved.map(({ theme, sub }) => (
            <div key={sub.id} className="flex items-center gap-1 text-xs text-muted-foreground group px-1 py-0.5 rounded hover:bg-muted">
              <span className="flex-1 truncate">
                {multiTheme && (
                  <span className="text-muted-foreground/60 mr-1">{theme.name} ›</span>
                )}
                {sub.name}
              </span>
              <Button
                variant="ghost" size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100"
                title="復元"
                onClick={() => dispatch({ type: "RESTORE_SUB_THEME", themeId: theme.id, subId: sub.id })}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive"
                title="削除"
                onClick={() => {
                  setPending({ themeId: theme.id, themeName: theme.name, subId: sub.id, subName: sub.name })
                  deleteHandle.open(null)
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>

      <Dialog
        handle={deleteHandle}
        onOpenChange={(v) => { if (!v) setPending(null) }}
      >
        <DialogContent className="max-w-sm p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <DialogTitle>解決フォルダから削除しますか？</DialogTitle>
              <DialogDescription>
                {pending
                  ? `「${pending.themeName} › ${pending.subName}」が完全に削除されます。この操作は取り消せません。`
                  : "この小テーマが完全に削除されます。この操作は取り消せません。"}
              </DialogDescription>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <DialogClose render={
              <Button variant="outline" size="sm">キャンセル</Button>
            } />
            <DialogClose render={
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (!pending) return
                  dispatch({ type: "DELETE_RESOLVED_SUB_THEME", themeId: pending.themeId, subId: pending.subId })
                  setPending(null)
                }}
              >
                削除する
              </Button>
            } />
          </div>
        </DialogContent>
      </Dialog>
    </Accordion>
  )
}

// ---------------------------------------------------------------------------
// Sortable theme accordion item
// ---------------------------------------------------------------------------
function SortableThemeItem({
  theme, newlyAddedId, selectedSubThemeId,
}: {
  theme: Theme
  newlyAddedId: string | null
  selectedSubThemeId: string | null
}) {
  const dispatch = useDispatch()
  const [deleteHandle] = useState(() => createHandle())
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: theme.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleSubDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = theme.subThemes.findIndex(s => s.id === active.id)
    const newIndex = theme.subThemes.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    dispatch({
      type: "REORDER_SUB_THEMES",
      themeId: theme.id,
      subThemes: arrayMove(theme.subThemes, oldIndex, newIndex),
    })
  }

  return (
    <div ref={setNodeRef} style={style}>
      <AccordionItem value={theme.id} className="border rounded-md px-2">
        <div className="flex items-center gap-1 group">
          <button
            {...attributes}
            {...listeners}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
            type="button"
            title="ドラッグして並び替え"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <AccordionTrigger className="py-2 flex-1 hover:no-underline">
            <InlineEdit
              value={theme.name}
              onSave={name => dispatch({ type: "UPDATE_THEME", themeId: theme.id, name })}
              className="font-medium text-sm"
              autoEdit={newlyAddedId === theme.id}
            />
          </AccordionTrigger>
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="大テーマを削除"
            onClick={e => { e.stopPropagation(); deleteHandle.open(null) }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <AccordionContent className="pb-2 space-y-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubDragEnd}>
            <SortableContext items={theme.subThemes.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {theme.subThemes.map(sub => (
                <SortableSubThemeRow
                  key={sub.id}
                  theme={theme}
                  sub={sub}
                  selected={selectedSubThemeId === sub.id}
                  dimmed={!!selectedSubThemeId && selectedSubThemeId !== sub.id}
                  autoEdit={newlyAddedId === sub.id}
                />
              ))}
            </SortableContext>
          </DndContext>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-xs text-muted-foreground justify-start"
            onClick={() => dispatch({ type: "ADD_SUB_THEME", themeId: theme.id })}
          >
            <Plus className="h-3 w-3 mr-1" /> 小テーマを追加
          </Button>
        </AccordionContent>
      </AccordionItem>

      <Dialog handle={deleteHandle}>
        <DialogContent className="max-w-sm p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <DialogTitle>大テーマを削除しますか？</DialogTitle>
              <DialogDescription>
                「{theme.name}」とその中のすべての小テーマ・データが完全に削除されます。この操作は取り消せません。
              </DialogDescription>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <DialogClose render={
              <Button variant="outline" size="sm">キャンセル</Button>
            } />
            <DialogClose render={
              <Button
                variant="destructive"
                size="sm"
                onClick={() => dispatch({ type: "DELETE_THEME", themeId: theme.id })}
              >
                削除する
              </Button>
            } />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function PaneTheme() {
  const store = useStore()
  const dispatch = useDispatch()
  const [openThemes, setOpenThemes] = useState<string[]>([])
  const prevIdsRef = useRef<string[]>([])
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    const ids = store.themes.map(t => t.id)
    const newIds = ids.filter(id => !prevIdsRef.current.includes(id))
    if (newIds.length > 0) {
      setOpenThemes(prev => [...new Set([...prev, ...newIds])])
      setNewlyAddedId(newIds[newIds.length - 1])
    }
    prevIdsRef.current = ids
  }, [store.themes])

  // 大テーマ以下の全サブテーマIDを監視して新規追加を検出
  const allSubIds = store.themes.flatMap(t => t.subThemes.map(s => s.id)).join(",")
  const prevSubIdsRef = useRef<string>("")
  useEffect(() => {
    if (prevSubIdsRef.current === "") { prevSubIdsRef.current = allSubIds; return }
    const prev = prevSubIdsRef.current.split(",").filter(Boolean)
    const curr = allSubIds.split(",").filter(Boolean)
    const added = curr.filter(id => !prev.includes(id))
    if (added.length > 0) setNewlyAddedId(added[added.length - 1])
    prevSubIdsRef.current = allSubIds
  }, [allSubIds])

  const handleOpenChange = useCallback((vals: string[]) => setOpenThemes(vals), [])

  function handleThemeDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = store.themes.findIndex(t => t.id === active.id)
    const newIndex = store.themes.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    dispatch({ type: "REORDER_THEMES", themes: arrayMove(store.themes, oldIndex, newIndex) })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-r">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">① テーマ</span>
        <Button
          variant="ghost" size="icon"
          className="h-6 w-6"
          onClick={() => dispatch({ type: "ADD_THEME" })}
          title="大テーマを追加"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 flex flex-col min-h-full">
          <div className="space-y-1">
          {store.themes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              「+」ボタンで大テーマを追加してください
            </p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleThemeDragEnd}>
            <SortableContext items={store.themes.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <Accordion multiple value={openThemes} onValueChange={handleOpenChange} className="space-y-1">
                {store.themes.map(theme => (
                  <SortableThemeItem
                    key={theme.id}
                    theme={theme}
                    newlyAddedId={newlyAddedId}
                    selectedSubThemeId={store.selectedSubThemeId}
                  />
                ))}
              </Accordion>
            </SortableContext>
          </DndContext>
          </div>
          <div className="mt-auto pt-8">
            <ResolvedFolder />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
