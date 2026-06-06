"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Plus, Trash2, X } from "lucide-react"
import { useDispatch } from "@/lib/store"
import { cn, uid } from "@/lib/utils"
import MicButton from "@/components/ui/MicButton"
import type {
  ActionEntry,
  DecisionEntry,
  ScheduleEntry,
  TaskEntry,
  MemoEntry,
  CostEntry,
} from "@/lib/types"

type Props = {
  entry: ActionEntry | null
  themeId: string
  subId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MAN_YEN_PRESETS = [1, 5, 10, 50, 100] as const

/** 全角数字を半角にし、数字だけ残す（IME 確定後に使用） */
function normalizeAmountText(text: string): string {
  const half = text.replace(/[０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
  return half.replace(/\D/g, "").slice(0, 15)
}

function parseAmountDigits(text: string): number {
  const digits = normalizeAmountText(text)
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

function formatAmount(amount: number): string {
  return amount > 0 ? amount.toLocaleString("ja-JP") : ""
}

const amountInputClass = cn(
  "relative z-10 h-11 w-full min-w-0 rounded-lg border border-input bg-background pl-8 pr-3 py-1",
  "text-lg font-mono tabular-nums text-right text-foreground",
  "outline-none transition-colors placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "caret-foreground selection:bg-primary/20 selection:text-foreground",
)

/**
 * macOS Safari 向け: 入力欄は数字のみ（カンマなし）。
 * カンマ付きは下のプレビューに表示（入力欄の value を書き換えない）。
 */
function AmountInput({
  value,
  onChange,
  focusOnMount,
}: {
  value: number
  onChange: (amount: number) => void
  focusOnMount?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [digits, setDigits] = useState(() => (value > 0 ? String(value) : ""))
  const editingRef = useRef(false)
  const composingRef = useRef(false)

  const previewAmount = parseAmountDigits(digits)

  useEffect(() => {
    if (editingRef.current) return
    setDigits(value > 0 ? String(value) : "")
  }, [value])

  function commit() {
    editingRef.current = false
    composingRef.current = false
    const normalized = normalizeAmountText(digits)
    const amount = parseAmountDigits(normalized)
    setDigits(amount > 0 ? String(amount) : "")
    onChange(amount)
  }

  function applyInputValue(raw: string, composing: boolean) {
    editingRef.current = true
    setDigits(composing ? raw : normalizeAmountText(raw))
  }

  function addManYen(man: number) {
    const next = parseAmountDigits(digits) + man * 10_000
    setDigits(String(next))
    onChange(next)
    inputRef.current?.focus()
  }

  useEffect(() => {
    if (!focusOnMount) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 100)
    return () => window.clearTimeout(id)
  }, [focusOnMount])

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="text"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="金額を入力（半角・全角数字）"
        lang="ja"
        value={digits}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={e => {
          composingRef.current = false
          applyInputValue(e.currentTarget.value, false)
        }}
        onChange={e => {
          const native = e.nativeEvent as InputEvent
          applyInputValue(
            e.target.value,
            composingRef.current || native.isComposing === true,
          )
        }}
        onFocus={() => {
          editingRef.current = true
        }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter" && !composingRef.current && !e.nativeEvent.isComposing) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className={amountInputClass}
      />
      {previewAmount > 0 && (
        <p className="pr-1 text-right text-sm font-mono tabular-nums text-muted-foreground">
          ¥{previewAmount.toLocaleString("ja-JP")}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {MAN_YEN_PRESETS.map(man => (
          <Button
            key={man}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 min-w-[3.25rem] px-1 text-xs font-mono tabular-nums"
            onMouseDown={e => e.preventDefault()}
            onClick={() => addManYen(man)}
          >
            +{man}万
          </Button>
        ))}
      </div>
    </div>
  )
}

function CostRow({
  cost,
  focusAmount,
  onUpdate,
  onDelete,
}: {
  cost: CostEntry
  focusAmount?: boolean
  onUpdate: (patch: Partial<CostEntry>) => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-md border bg-muted/25 p-3 space-y-2.5 group">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">金額（手入力）</Label>
        <div className="relative isolate">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 z-0 -translate-y-1/2 text-base text-muted-foreground"
          >
            ¥
          </span>
          <AmountInput
            value={cost.amount}
            onChange={amount => onUpdate({ amount })}
            focusOnMount={focusAmount}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1 shrink-0">
          <Label className="text-[11px] text-muted-foreground">支払月</Label>
          <div className="flex items-center gap-1">
            <Input
              type="text"
              inputMode="numeric"
              value={cost.year}
              onChange={e => onUpdate({ year: parseAmountDigits(e.target.value) })}
              onFocus={e => e.target.select()}
              className="h-8 w-[4.5rem] text-sm text-center tabular-nums"
            />
            <span className="text-xs text-muted-foreground shrink-0">年</span>
            <Input
              type="text"
              inputMode="numeric"
              value={cost.month}
              onChange={e => {
                const m = parseAmountDigits(e.target.value)
                onUpdate({ month: m === 0 ? 1 : Math.min(12, m) })
              }}
              onFocus={e => e.target.select()}
              className="h-8 w-10 text-sm text-center tabular-nums"
            />
            <span className="text-xs text-muted-foreground shrink-0">月</span>
          </div>
        </div>
        <div className="min-w-[8rem] flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">メモ（任意）</Label>
          <Input
            value={cost.label}
            onChange={e => onUpdate({ label: e.target.value })}
            placeholder="内訳・備考"
            className="h-8 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive opacity-60 hover:opacity-100 group-hover:opacity-100"
          onClick={onDelete}
          type="button"
          title="この費用行を削除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function CostRows({
  costs,
  onChange,
}: {
  costs: CostEntry[]
  onChange: (costs: CostEntry[]) => void
}) {
  const [focusAmountId, setFocusAmountId] = useState<string | null>(null)

  function addCost() {
    const now = new Date()
    const id = uid()
    onChange([
      ...costs,
      { id, year: now.getFullYear(), month: now.getMonth() + 1, amount: 0, label: "" },
    ])
    setFocusAmountId(id)
  }

  function updateCost(id: string, patch: Partial<CostEntry>) {
    onChange(costs.map(c => (c.id === id ? { ...c, ...patch } : c)))
  }

  function deleteCost(id: string) {
    onChange(costs.filter(c => c.id !== id))
    if (focusAmountId === id) setFocusAmountId(null)
  }

  const total = costs.reduce((s, c) => s + c.amount, 0)

  if (costs.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-full text-xs text-muted-foreground"
        onClick={addCost}
        type="button"
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> 費用を追加
      </Button>
    )
  }

  return (
    <div className="w-full rounded-md border">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium">費用</span>
        {total > 0 && (
          <span className="ml-auto font-mono text-foreground">¥{total.toLocaleString()}</span>
        )}
      </div>
      <div className="space-y-2 border-t px-3 pb-3 pt-2">
        {costs.map(cost => (
          <CostRow
            key={cost.id}
            cost={cost}
            focusAmount={focusAmountId === cost.id}
            onUpdate={patch => {
              updateCost(cost.id, patch)
              if (focusAmountId === cost.id && !("amount" in patch)) {
                setFocusAmountId(null)
              }
            }}
            onDelete={() => deleteCost(cost.id)}
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-xs"
          onClick={addCost}
          type="button"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> 費用を追加
        </Button>
      </div>
    </div>
  )
}

export default function EntryModal({ entry, themeId, subId, open, onOpenChange }: Props) {
  const dispatch = useDispatch()
  const [draft, setDraft] = useState<ActionEntry | null>(null)

  useEffect(() => {
    if (open && entry) setDraft({ ...entry })
  }, [open, entry])

  if (!draft) return null

  function save() {
    if (!draft) return
    dispatch({ type: "UPDATE_ENTRY", themeId, subId, entry: draft })
    onOpenChange(false)
  }

  function updateDraft(patch: Partial<ActionEntry>) {
    setDraft(prev => prev ? { ...prev, ...patch } as ActionEntry : prev)
  }

  const title = {
    decision: "決定事項",
    schedule: "日程",
    task: "タスク",
    memo_entry: "メモ",
  }[draft.type]

  const isTask = draft.type === "task"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={false}
        className={cn(
          "max-w-lg max-h-[90vh] overflow-y-auto",
          isTask && "p-4",
        )}
      >
        <div className={cn("flex items-center justify-between gap-3", isTask ? "mb-2.5" : "mb-4")}>
          <DialogTitle>{title}を編集</DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            {isTask && (
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={(draft as TaskEntry).done}
                  onCheckedChange={done => updateDraft({ done } as Partial<TaskEntry>)}
                  id="done-switch"
                />
                <Label htmlFor="done-switch" className="text-sm cursor-pointer whitespace-nowrap">
                  {(draft as TaskEntry).done ? "完了" : "未完了"}
                </Label>
              </div>
            )}
            <DialogClose className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
        </div>

        <div className={cn(isTask ? "space-y-3" : "space-y-4")}>
          {/* タイトル */}
          <div className="space-y-1.5">
            <Label className="text-xs">タイトル</Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={draft.title}
                onChange={e => updateDraft({ title: e.target.value })}
                placeholder="タイトルを入力"
                className="text-sm flex-1"
              />
              <MicButton
                onResult={text =>
                  setDraft(prev =>
                    prev
                      ? { ...prev, title: prev.title ? `${prev.title} ${text}` : text }
                      : prev,
                  )
                }
              />
            </div>
          </div>

          {/* 決定済みトグル（決定事項のみ） */}
          {draft.type === "decision" && (
            <div className="flex items-center gap-2">
              <Switch
                checked={(draft as DecisionEntry).decided}
                onCheckedChange={decided => updateDraft({ decided } as Partial<DecisionEntry>)}
                id="decided-switch"
              />
              <Label htmlFor="decided-switch" className="text-sm cursor-pointer">
                {(draft as DecisionEntry).decided ? "決定済み" : "未決定"}
              </Label>
            </div>
          )}

          {/* 日付（日程・タスク） */}
          {draft.type === "schedule" && (
            <div className="space-y-1.5">
              <Label className="text-xs">日付</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={(draft as ScheduleEntry).dateStart}
                  onChange={e => updateDraft({ dateStart: e.target.value } as Partial<ScheduleEntry>)}
                  className="h-8 text-sm flex-1"
                />
                <span className="text-sm text-muted-foreground shrink-0">〜</span>
                <Input
                  type="date"
                  value={(draft as ScheduleEntry).dateEnd}
                  onChange={e => updateDraft({ dateEnd: e.target.value } as Partial<ScheduleEntry>)}
                  className="h-8 text-sm flex-1"
                />
              </div>
            </div>
          )}

          {draft.type === "task" && (
            <div className="space-y-1.5">
              <Label className="text-xs">期日</Label>
              <Input
                type="date"
                value={(draft as TaskEntry).dueDate}
                onChange={e => updateDraft({ dueDate: e.target.value } as Partial<TaskEntry>)}
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* 詳細メモ */}
          <div className="space-y-1.5">
            <Label className="text-xs">詳細メモ（任意）</Label>
            <div className="relative">
              <Textarea
                value={draft.memo}
                onChange={e => updateDraft({ memo: e.target.value })}
                placeholder="詳細を入力..."
                className={cn(
                  "text-sm resize-none pr-7",
                  isTask ? "min-h-[64px]" : "min-h-[80px]",
                )}
              />
              <div className="absolute top-1.5 right-1.5">
                <MicButton
                  size="xs"
                  onResult={text =>
                    setDraft(prev =>
                      prev
                        ? { ...prev, memo: prev.memo ? `${prev.memo}\n${text}` : text }
                        : prev,
                    )
                  }
                />
              </div>
            </div>
          </div>

          {/* 費用アコーディオン */}
          <CostRows
            costs={draft.costs}
            onChange={costs => updateDraft({ costs } as Partial<ActionEntry>)}
          />
        </div>

        <div className={cn("flex justify-end gap-2", isTask ? "mt-4" : "mt-6")}>
          <DialogClose className="inline-flex items-center justify-center h-8 px-3 rounded-md border text-sm font-medium hover:bg-muted transition-colors">
            キャンセル
          </DialogClose>
          <Button size="sm" onClick={save}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
