"use client"

import { useState, useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Trash2,
  Type,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react"
import { arrayMove } from "@dnd-kit/sortable"
import { useDispatch } from "@/lib/store"
import type { TableBlock as TTableBlock, TableColumn, TableRow } from "@/lib/types"
import { uid } from "@/lib/utils"

type Props = {
  block: TTableBlock
  themeId: string
  subId: string
  fineId: string
}

const DEFAULT_TEXT_COL_WIDTH = 120
const DEFAULT_CHECKBOX_COL_WIDTH = 56
const MIN_COL_WIDTH = 20
const MAX_COL_WIDTH = 480
const MIN_ROW_HEIGHT = 28
const MAX_ROW_HEIGHT = 320
const TABLE_BORDER = "border-neutral-300 dark:border-neutral-600"
const CELL_BORDER = `border ${TABLE_BORDER}`

function defaultColWidth(col: TableColumn): number {
  return col.width ?? (col.colType === "checkbox" ? DEFAULT_CHECKBOX_COL_WIDTH : DEFAULT_TEXT_COL_WIDTH)
}

function minColWidth(col: TableColumn): number {
  return col.colType === "checkbox" ? 28 : MIN_COL_WIDTH
}

function tableTotalWidth(columns: TableColumn[]): number {
  return columns.reduce((sum, col) => sum + defaultColWidth(col), 0)
}

function startPointerResize(
  e: ReactMouseEvent,
  axis: "x" | "y",
  startSize: number,
  onResize: (size: number) => void,
  min: number,
  max: number,
) {
  e.preventDefault()
  e.stopPropagation()
  const startPos = axis === "x" ? e.clientX : e.clientY

  function onMove(ev: MouseEvent) {
    const delta = (axis === "x" ? ev.clientX : ev.clientY) - startPos
    onResize(Math.min(max, Math.max(min, startSize + delta)))
  }

  function onUp() {
    window.removeEventListener("mousemove", onMove)
    window.removeEventListener("mouseup", onUp)
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize"
  document.body.style.userSelect = "none"
  window.addEventListener("mousemove", onMove)
  window.addEventListener("mouseup", onUp)
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------
type ColHeaderProps = {
  col: TableColumn
  isFirst: boolean
  isLast: boolean
  effectiveWidth: number
  onRename: (name: string) => void
  onToggleType: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onDelete: () => void
  onResizeWidth: (width: number) => void
}

function ColumnHeader({
  col, isFirst, isLast, effectiveWidth, onRename, onToggleType, onMoveLeft, onMoveRight, onDelete, onResizeWidth,
}: ColHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(col.name)

  useEffect(() => {
    if (!editing) setDraft(col.name)
  }, [col.name, editing])

  function startEdit() {
    setDraft(col.name)
    setEditing(true)
  }

  function saveEdit() {
    onRename(draft.trim())
    setEditing(false)
  }

  const headerBg = col.colType === "checkbox"
    ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
    : "bg-muted/60 text-foreground"

  return (
    <th
      className={`relative ${CELL_BORDER} px-1 py-0.5 font-medium text-left align-top ${headerBg}`}
      style={{ width: effectiveWidth, maxWidth: effectiveWidth, minWidth: effectiveWidth }}
    >
      <div className="flex items-start gap-0.5 min-h-5 pr-0.5">
        {editing ? (
          <Input
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e => {
              if (e.key === "Enter") saveEdit()
              if (e.key === "Escape") { setDraft(col.name); setEditing(false) }
            }}
            className="h-5 flex-1 min-w-0 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-primary/40 text-xs px-1 font-medium bg-background/80"
          />
        ) : (
          <>
            <button
              type="button"
              className="flex flex-1 min-w-0 items-center gap-1 text-left text-xs font-medium break-words whitespace-pre-wrap rounded px-0.5 py-0 hover:bg-background/50 cursor-text"
              onDoubleClick={startEdit}
              title="ダブルクリックで列名を編集"
            >
              {col.colType === "checkbox" && <CheckSquare className="h-3 w-3 shrink-0" />}
              {col.colType === "text" ? (
                <span>{col.name || "（列名なし）"}</span>
              ) : col.name && col.name !== "完了" ? (
                <span>{col.name}</span>
              ) : null}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex shrink-0 items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
                title="列の操作"
              >
                <MoreHorizontal className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="text-xs">
                <DropdownMenuItem onClick={startEdit}>
                  <Type className="h-3.5 w-3.5 mr-2" />
                  列名を変更
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleType}>
                  <CheckSquare className="h-3.5 w-3.5 mr-2" />
                  {col.colType === "text" ? "チェックボックスに変更" : "テキストに変更"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onMoveLeft} disabled={isFirst}>
                  <ChevronLeft className="h-3.5 w-3.5 mr-2" />
                  左へ移動
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveRight} disabled={isLast}>
                  <ChevronRight className="h-3.5 w-3.5 mr-2" />
                  右へ移動
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  列を削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        title="列幅を調整"
        className="absolute top-0 -right-px bottom-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/25 active:bg-primary/40"
        onMouseDown={e => startPointerResize(
          e,
          "x",
          effectiveWidth,
          onResizeWidth,
          minColWidth(col),
          MAX_COL_WIDTH,
        )}
      />
    </th>
  )
}

// ---------------------------------------------------------------------------
// Text cell
// ---------------------------------------------------------------------------
function TextCell({
  value,
  rowHeight,
  onChange,
}: {
  value: string
  rowHeight?: number
  onChange: (value: string) => void
}) {
  return (
    <Textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={1}
      style={rowHeight ? { minHeight: Math.max(MIN_ROW_HEIGHT - 4, rowHeight - 4) } : undefined}
      className="min-h-[1.75rem] w-full resize-none border-0 shadow-none focus-visible:ring-0 text-xs px-1.5 py-1 rounded-none whitespace-pre-wrap break-words field-sizing-content overflow-y-auto bg-transparent"
      placeholder=""
    />
  )
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------
type RowProps = {
  row: TableRow
  rowIndex: number
  rowCount: number
  columns: TableColumn[]
  effectiveWidths: Record<string, number>
  onCellChange: (colId: string, value: string | boolean) => void
  onMove: (direction: "up" | "down") => void
  onDelete: () => void
  onResizeHeight: (height: number) => void
}

function TableRowView({
  row, rowIndex, rowCount, columns, effectiveWidths, onCellChange, onMove, onDelete, onResizeHeight,
}: RowProps) {
  const rowMinHeight = row.height ?? undefined
  const lastColId = columns[columns.length - 1]?.id

  return (
    <tr style={{ height: row.height }} className="group/row">
      {columns.map(col => {
        const isLastCol = col.id === lastColId
        const colWidth = effectiveWidths[col.id] ?? defaultColWidth(col)
        return (
          <td
            key={col.id}
            className={`relative ${CELL_BORDER} p-0 align-top bg-background overflow-hidden ${isLastCol ? "pr-7" : ""}`}
            style={{ width: colWidth, maxWidth: colWidth, minWidth: colWidth, minHeight: rowMinHeight }}
          >
            {col.colType === "checkbox" ? (
              <div
                className="flex items-center justify-center px-1"
                style={{ minHeight: rowMinHeight ?? MIN_ROW_HEIGHT }}
              >
                <Checkbox
                  checked={!!row.cells[col.id]}
                  onCheckedChange={checked => onCellChange(col.id, !!checked)}
                  className="h-3.5 w-3.5"
                />
              </div>
            ) : (
              <TextCell
                value={String(row.cells[col.id] ?? "")}
                rowHeight={row.height}
                onChange={value => onCellChange(col.id, value)}
              />
            )}

            {isLastCol && (
              <>
                <div className="absolute top-0.5 right-0.5 z-10 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="行の操作"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-xs">
                      <DropdownMenuItem onClick={() => onMove("up")} disabled={rowIndex === 0}>
                        <ChevronUp className="h-3.5 w-3.5 mr-2" />
                        上へ移動
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMove("down")} disabled={rowIndex >= rowCount - 1}>
                        <ChevronDown className="h-3.5 w-3.5 mr-2" />
                        下へ移動
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        行を削除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  title="行の高さを調整"
                  className="absolute bottom-0 left-0 right-0 z-10 h-1.5 cursor-row-resize opacity-0 group-hover/row:opacity-100 hover:bg-primary/25 active:bg-primary/40"
                  onMouseDown={e => startPointerResize(
                    e,
                    "y",
                    row.height ?? (e.currentTarget.closest("tr")?.getBoundingClientRect().height ?? MIN_ROW_HEIGHT),
                    onResizeHeight,
                    MIN_ROW_HEIGHT,
                    MAX_ROW_HEIGHT,
                  )}
                />
              </>
            )}
          </td>
        )
      })}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// TableBlock
// ---------------------------------------------------------------------------
export default function TableBlock({ block, themeId, subId, fineId }: Props) {
  const dispatch = useDispatch()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.getBoundingClientRect().width)
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const totalColWidth = tableTotalWidth(block.columns)
  const scale = containerWidth > 0 && totalColWidth > containerWidth
    ? containerWidth / totalColWidth
    : 1

  function effectiveColWidth(col: TableColumn): number {
    return Math.max(minColWidth(col), Math.floor(defaultColWidth(col) * scale))
  }

  const effectiveWidthMap: Record<string, number> = Object.fromEntries(
    block.columns.map(col => [col.id, effectiveColWidth(col)])
  )

  const tableRenderWidth = scale < 1 && containerWidth > 0
    ? containerWidth
    : totalColWidth

  function addColumn() {
    const col: TableColumn = {
      id: uid(),
      name: `列${block.columns.length + 1}`,
      colType: "text",
      width: DEFAULT_TEXT_COL_WIDTH,
    }
    dispatch({ type: "ADD_TABLE_COLUMN", themeId, subId, fineId, blockId: block.id, col })
  }

  function moveColumn(colId: string, direction: "left" | "right") {
    const idx = block.columns.findIndex(c => c.id === colId)
    if (idx === -1) return
    const swapIdx = direction === "left" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= block.columns.length) return
    const newCols = [...block.columns]
    ;[newCols[idx], newCols[swapIdx]] = [newCols[swapIdx], newCols[idx]]
    dispatch({ type: "REORDER_TABLE_COLUMNS", themeId, subId, fineId, blockId: block.id, columns: newCols })
  }

  function moveRow(rowId: string, direction: "up" | "down") {
    const idx = block.rows.findIndex(r => r.id === rowId)
    if (idx === -1) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= block.rows.length) return
    dispatch({
      type: "REORDER_TABLE_ROWS",
      themeId, subId, fineId, blockId: block.id,
      rows: arrayMove(block.rows, idx, swapIdx),
    })
  }

  function updateRowHeight(row: TableRow, height: number) {
    dispatch({
      type: "UPDATE_TABLE_ROW",
      themeId, subId, fineId, blockId: block.id,
      row: { ...row, height },
    })
  }

  return (
    <div className="text-xs">
      {block.columns.length === 0 && block.rows.length === 0 ? (
        <div className="flex items-center gap-2 py-3 px-2 border border-dashed border-border rounded text-muted-foreground">
          <span className="flex-1 text-xs">列がありません</span>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={addColumn}>
            <Plus className="h-3 w-3 mr-1" /> 列を追加
          </Button>
        </div>
      ) : (
        <div ref={containerRef} className="w-full overflow-x-auto">
          <table
            className={`border-collapse border ${TABLE_BORDER} bg-background`}
            style={{
              tableLayout: "fixed",
              width: tableRenderWidth,
            }}
          >
            <colgroup>
              {block.columns.map(col => {
                const w = effectiveWidthMap[col.id]
                return (
                  <col key={col.id} style={{ width: w, minWidth: w, maxWidth: w }} />
                )
              })}
            </colgroup>
            <thead>
              <tr>
                {block.columns.map((col, idx) => (
                  <ColumnHeader
                    key={col.id}
                    col={col}
                    isFirst={idx === 0}
                    isLast={idx === block.columns.length - 1}
                    effectiveWidth={effectiveWidthMap[col.id]}
                    onRename={name =>
                      dispatch({ type: "UPDATE_TABLE_COLUMN", themeId, subId, fineId, blockId: block.id, col: { ...col, name } })
                    }
                    onToggleType={() =>
                      dispatch({
                        type: "UPDATE_TABLE_COLUMN", themeId, subId, fineId, blockId: block.id,
                        col: {
                          ...col,
                          colType: col.colType === "text" ? "checkbox" : "text",
                          width: col.width ?? (col.colType === "text" ? DEFAULT_CHECKBOX_COL_WIDTH : DEFAULT_TEXT_COL_WIDTH),
                        },
                      })
                    }
                    onMoveLeft={() => moveColumn(col.id, "left")}
                    onMoveRight={() => moveColumn(col.id, "right")}
                    onDelete={() =>
                      dispatch({ type: "DELETE_TABLE_COLUMN", themeId, subId, fineId, blockId: block.id, colId: col.id })
                    }
                    onResizeWidth={displayWidth =>
                      dispatch({
                        type: "UPDATE_TABLE_COLUMN", themeId, subId, fineId, blockId: block.id,
                        col: { ...col, width: Math.round(displayWidth / scale) },
                      })
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <TableRowView
                  key={row.id}
                  row={row}
                  rowIndex={rowIndex}
                  rowCount={block.rows.length}
                  columns={block.columns}
                  effectiveWidths={effectiveWidthMap}
                  onCellChange={(colId, value) =>
                    dispatch({ type: "UPDATE_TABLE_CELL", themeId, subId, fineId, blockId: block.id, rowId: row.id, colId, value })
                  }
                  onMove={direction => moveRow(row.id, direction)}
                  onDelete={() =>
                    dispatch({ type: "DELETE_TABLE_ROW", themeId, subId, fineId, blockId: block.id, rowId: row.id })
                  }
                  onResizeHeight={height => updateRowHeight(row, height)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-1 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={() => dispatch({ type: "ADD_TABLE_ROW", themeId, subId, fineId, blockId: block.id })}
        >
          <Plus className="h-3 w-3 mr-1" /> 行を追加
        </Button>
        {block.columns.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={addColumn}
          >
            <Plus className="h-3 w-3 mr-1" /> 列を追加
          </Button>
        )}
      </div>
    </div>
  )
}
