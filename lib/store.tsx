"use client"

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type Dispatch,
} from "react"
import type {
  Store,
  Theme,
  SubTheme,
  FineTheme,
  Block,
  TableBlock,
  TableColumn,
  TableRow,
  TreeBlock,
  ActionEntry,
  DecisionEntry,
  ScheduleEntry,
  TaskEntry,
  MemoEntry,
  CostEntry,
  Source,
  Stakeholder,
} from "./types"
import { uid } from "./utils"

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  // Theme
  | { type: "ADD_THEME" }
  | { type: "UPDATE_THEME"; themeId: string; name: string }
  | { type: "DELETE_THEME"; themeId: string }
  | { type: "REORDER_THEMES"; themes: Theme[] }
  // SubTheme
  | { type: "ADD_SUB_THEME"; themeId: string }
  | { type: "REORDER_SUB_THEMES"; themeId: string; subThemes: SubTheme[] }
  | { type: "UPDATE_SUB_THEME"; themeId: string; subId: string; name: string }
  | { type: "DELETE_SUB_THEME"; themeId: string; subId: string }
  | { type: "SELECT_SUB_THEME"; subId: string | null }
  | { type: "RESOLVE_SUB_THEME"; themeId: string; subId: string }
  | { type: "RESTORE_SUB_THEME"; themeId: string; subId: string }
  | { type: "DELETE_RESOLVED_SUB_THEME"; themeId: string; subId: string }
  // Stakeholder
  | { type: "ADD_STAKEHOLDER"; themeId: string; subId: string; name: string; color: string }
  | { type: "UPDATE_STAKEHOLDER"; themeId: string; subId: string; stakeholderId: string; name: string; color: string }
  | { type: "DELETE_STAKEHOLDER"; themeId: string; subId: string; stakeholderId: string }
  // Global Stakeholder
  | { type: "ADD_GLOBAL_STAKEHOLDER"; name: string; color: string }
  | { type: "UPDATE_GLOBAL_STAKEHOLDER"; id: string; name: string; color: string }
  | { type: "DELETE_GLOBAL_STAKEHOLDER"; id: string }
  // FineTheme
  | { type: "ADD_FINE_THEME"; themeId: string; subId: string }
  | { type: "UPDATE_FINE_THEME"; themeId: string; subId: string; fineId: string; name: string }
  | { type: "DELETE_FINE_THEME"; themeId: string; subId: string; fineId: string }
  | { type: "REORDER_FINE_THEME"; themeId: string; subId: string; fineId: string; direction: "up" | "down" }
  | { type: "REORDER_FINE_THEMES"; themeId: string; subId: string; fineThemes: FineTheme[] }
  // Block (pane②)
  | { type: "ADD_BLOCK"; themeId: string; subId: string; fineId: string; blockType: "memo" | "tree" }
  | { type: "ADD_TABLE_BLOCK"; themeId: string; subId: string; fineId: string; columns: TableColumn[] }
  | { type: "ADD_MEMO_WITH_CONTENT"; themeId: string; subId: string; fineId: string; content: string }
  | { type: "UPDATE_BLOCK"; themeId: string; subId: string; fineId: string; block: Block }
  | { type: "DELETE_BLOCK"; themeId: string; subId: string; fineId: string; blockId: string }
  | { type: "REORDER_BLOCK"; themeId: string; subId: string; fineId: string; blockId: string; direction: "up" | "down" }
  | { type: "REORDER_BLOCKS"; themeId: string; subId: string; fineId: string; blocks: Block[] }
  // TableBlock
  | { type: "ADD_TABLE_COLUMN"; themeId: string; subId: string; fineId: string; blockId: string; col: TableColumn }
  | { type: "UPDATE_TABLE_COLUMN"; themeId: string; subId: string; fineId: string; blockId: string; col: TableColumn }
  | { type: "DELETE_TABLE_COLUMN"; themeId: string; subId: string; fineId: string; blockId: string; colId: string }
  | { type: "REORDER_TABLE_COLUMNS"; themeId: string; subId: string; fineId: string; blockId: string; columns: TableColumn[] }
  | { type: "ADD_TABLE_ROW"; themeId: string; subId: string; fineId: string; blockId: string }
  | { type: "UPDATE_TABLE_CELL"; themeId: string; subId: string; fineId: string; blockId: string; rowId: string; colId: string; value: string | boolean }
  | { type: "UPDATE_TABLE_ROW"; themeId: string; subId: string; fineId: string; blockId: string; row: TableRow }
  | { type: "DELETE_TABLE_ROW"; themeId: string; subId: string; fineId: string; blockId: string; rowId: string }
  | { type: "REORDER_TABLE_ROWS"; themeId: string; subId: string; fineId: string; blockId: string; rows: TableRow[] }
  // ActionEntry (pane③)
  | { type: "ADD_ENTRY"; themeId: string; subId: string; entryType: "decision" | "schedule" | "task" | "memo_entry" }
  | { type: "UPDATE_ENTRY"; themeId: string; subId: string; entry: ActionEntry }
  | { type: "DELETE_ENTRY"; themeId: string; subId: string; entryId: string }
  | { type: "REORDER_ENTRIES"; themeId: string; subId: string; entries: ActionEntry[] }
  // Entry costs
  | { type: "ADD_ENTRY_COST"; themeId: string; subId: string; entryId: string }
  | { type: "UPDATE_ENTRY_COST"; themeId: string; subId: string; entryId: string; cost: CostEntry }
  | { type: "DELETE_ENTRY_COST"; themeId: string; subId: string; entryId: string; costId: string }
  // Source
  | { type: "ADD_SOURCE"; themeId: string; subId: string; source: Omit<Source, "id"> }
  | { type: "UPDATE_SOURCE"; themeId: string; subId: string; source: Source }
  | { type: "DELETE_SOURCE"; themeId: string; subId: string; sourceId: string }
  | { type: "REORDER_SOURCES"; themeId: string; subId: string; sources: Source[] }
  // Import
  | { type: "IMPORT"; store: Store }

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function makeInitialState(): Store {
  return { themes: [], selectedSubThemeId: null, globalStakeholders: [] }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapTheme(state: Store, themeId: string, fn: (t: Theme) => Theme): Store {
  return { ...state, themes: state.themes.map(t => t.id === themeId ? fn(t) : t) }
}

function mapSubTheme(state: Store, themeId: string, subId: string, fn: (s: SubTheme) => SubTheme): Store {
  return mapTheme(state, themeId, t => ({
    ...t,
    subThemes: t.subThemes.map(s => s.id === subId ? fn(s) : s),
  }))
}

function mapFineTheme(state: Store, themeId: string, subId: string, fineId: string, fn: (f: FineTheme) => FineTheme): Store {
  return mapSubTheme(state, themeId, subId, s => ({
    ...s,
    fineThemes: s.fineThemes.map(f => f.id === fineId ? fn(f) : f),
  }))
}

function mapBlock(state: Store, themeId: string, subId: string, fineId: string, blockId: string, fn: (b: Block) => Block): Store {
  return mapFineTheme(state, themeId, subId, fineId, f => ({
    ...f,
    blocks: f.blocks.map(b => b.id === blockId ? fn(b) : b),
  }))
}

function mapEntry(state: Store, themeId: string, subId: string, entryId: string, fn: (e: ActionEntry) => ActionEntry): Store {
  return mapSubTheme(state, themeId, subId, s => ({
    ...s,
    entries: s.entries.map(e => e.id === entryId ? fn(e) : e),
  }))
}

function makeEntry(entryType: "decision" | "schedule" | "task" | "memo_entry"): ActionEntry {
  const now = new Date()
  const id = uid()
  if (entryType === "decision") {
    return { id, type: "decision", title: "", memo: "", decided: false, costs: [] } as DecisionEntry
  } else if (entryType === "schedule") {
    return { id, type: "schedule", title: "", memo: "", dateStart: "", dateEnd: "", costs: [] } as ScheduleEntry
  } else if (entryType === "task") {
    return { id, type: "task", title: "", memo: "", done: false, dueDate: "", costs: [] } as TaskEntry
  } else {
    return { id, type: "memo_entry", title: "", memo: "", costs: [] } as MemoEntry
  }
  void now
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: Store, action: Action): Store {
  switch (action.type) {
    // --- Theme ---
    case "ADD_THEME":
      return { ...state, themes: [...state.themes, { id: uid(), name: "新しいテーマ", subThemes: [], resolvedSubThemes: [] }] }
    case "UPDATE_THEME":
      return mapTheme(state, action.themeId, t => ({ ...t, name: action.name }))
    case "DELETE_THEME":
      return { ...state, themes: state.themes.filter(t => t.id !== action.themeId) }
    case "REORDER_THEMES":
      return { ...state, themes: action.themes }

    // --- SubTheme ---
    case "ADD_SUB_THEME":
      return mapTheme(state, action.themeId, t => ({
        ...t,
        subThemes: [...t.subThemes, {
          id: uid(), name: "新しい小テーマ",
          stakeholders: [], fineThemes: [], entries: [], sources: [],
        }],
      }))
    case "REORDER_SUB_THEMES":
      return mapTheme(state, action.themeId, t => ({ ...t, subThemes: action.subThemes }))
    case "UPDATE_SUB_THEME":
      return mapSubTheme(state, action.themeId, action.subId, s => ({ ...s, name: action.name }))
    case "DELETE_SUB_THEME":
      return mapTheme(state, action.themeId, t => ({
        ...t,
        subThemes: t.subThemes.filter(s => s.id !== action.subId),
      }))
    case "SELECT_SUB_THEME":
      return { ...state, selectedSubThemeId: action.subId }
    case "RESOLVE_SUB_THEME":
      return mapTheme(state, action.themeId, t => {
        const sub = t.subThemes.find(s => s.id === action.subId)
        if (!sub) return t
        return {
          ...t,
          subThemes: t.subThemes.filter(s => s.id !== action.subId),
          resolvedSubThemes: [...t.resolvedSubThemes, sub],
        }
      })
    case "RESTORE_SUB_THEME":
      return mapTheme(state, action.themeId, t => {
        const sub = t.resolvedSubThemes.find(s => s.id === action.subId)
        if (!sub) return t
        return {
          ...t,
          resolvedSubThemes: t.resolvedSubThemes.filter(s => s.id !== action.subId),
          subThemes: [...t.subThemes, sub],
        }
      })
    case "DELETE_RESOLVED_SUB_THEME":
      return mapTheme(state, action.themeId, t => ({
        ...t,
        resolvedSubThemes: t.resolvedSubThemes.filter(s => s.id !== action.subId),
      }))

    // --- Stakeholder ---
    case "ADD_STAKEHOLDER":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        stakeholders: [...s.stakeholders, { id: uid(), name: action.name, color: action.color }],
      }))
    case "UPDATE_STAKEHOLDER":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        stakeholders: s.stakeholders.map(st =>
          st.id === action.stakeholderId ? { ...st, name: action.name, color: action.color } : st
        ),
      }))
    case "DELETE_STAKEHOLDER":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        stakeholders: s.stakeholders.filter(st => st.id !== action.stakeholderId),
      }))

    // --- Global Stakeholder ---
    case "ADD_GLOBAL_STAKEHOLDER":
      return { ...state, globalStakeholders: [...(state.globalStakeholders ?? []), { id: uid(), name: action.name, color: action.color }] }
    case "UPDATE_GLOBAL_STAKEHOLDER":
      return {
        ...state,
        globalStakeholders: (state.globalStakeholders ?? []).map(st =>
          st.id === action.id ? { ...st, name: action.name, color: action.color } : st
        ),
      }
    case "DELETE_GLOBAL_STAKEHOLDER":
      return { ...state, globalStakeholders: (state.globalStakeholders ?? []).filter(st => st.id !== action.id) }

    // --- FineTheme ---
    case "ADD_FINE_THEME":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        fineThemes: [...s.fineThemes, { id: uid(), name: "考えごと", blocks: [] }],
      }))
    case "UPDATE_FINE_THEME":
      return mapFineTheme(state, action.themeId, action.subId, action.fineId, f => ({ ...f, name: action.name }))
    case "DELETE_FINE_THEME":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        fineThemes: s.fineThemes.filter(f => f.id !== action.fineId),
      }))
    case "REORDER_FINE_THEME":
      return mapSubTheme(state, action.themeId, action.subId, s => {
        const idx = s.fineThemes.findIndex(f => f.id === action.fineId)
        if (idx === -1) return s
        const swapIdx = action.direction === "up" ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= s.fineThemes.length) return s
        const fineThemes = [...s.fineThemes]
        ;[fineThemes[idx], fineThemes[swapIdx]] = [fineThemes[swapIdx], fineThemes[idx]]
        return { ...s, fineThemes }
      })
    case "REORDER_FINE_THEMES":
      return mapSubTheme(state, action.themeId, action.subId, s => ({ ...s, fineThemes: action.fineThemes }))

    // --- Block ---
    case "ADD_BLOCK": {
      let newBlock: Block
      if (action.blockType === "tree") {
        newBlock = { id: uid(), type: "tree", rootLabel: null, nodes: [], viewMode: "logictree" } as TreeBlock
      } else {
        newBlock = { id: uid(), type: "memo", content: "" }
      }
      return mapFineTheme(state, action.themeId, action.subId, action.fineId, f => ({
        ...f, blocks: [...f.blocks, newBlock],
      }))
    }
    case "ADD_TABLE_BLOCK": {
      const initialCells: Record<string, string | boolean> = {}
      action.columns.forEach(col => { initialCells[col.id] = col.colType === "checkbox" ? false : "" })
      const newBlock: TableBlock = {
        id: uid(),
        type: "table",
        columns: action.columns,
        rows: action.columns.length > 0 ? [{ id: uid(), cells: initialCells }] : [],
      }
      return mapFineTheme(state, action.themeId, action.subId, action.fineId, f => ({
        ...f, blocks: [...f.blocks, newBlock],
      }))
    }
    case "ADD_MEMO_WITH_CONTENT":
      return mapFineTheme(state, action.themeId, action.subId, action.fineId, f => ({
        ...f, blocks: [...f.blocks, { id: uid(), type: "memo", content: action.content }],
      }))
    case "UPDATE_BLOCK":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.block.id, () => action.block)
    case "DELETE_BLOCK":
      return mapFineTheme(state, action.themeId, action.subId, action.fineId, f => ({
        ...f, blocks: f.blocks.filter(b => b.id !== action.blockId),
      }))
    case "REORDER_BLOCK":
      return mapFineTheme(state, action.themeId, action.subId, action.fineId, f => {
        const idx = f.blocks.findIndex(b => b.id === action.blockId)
        if (idx === -1) return f
        const swapIdx = action.direction === "up" ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= f.blocks.length) return f
        const blocks = [...f.blocks]
        ;[blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]]
        return { ...f, blocks }
      })
    case "REORDER_BLOCKS":
      return mapFineTheme(state, action.themeId, action.subId, action.fineId, f => ({ ...f, blocks: action.blocks }))

    // --- TableBlock ---
    case "ADD_TABLE_COLUMN":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        const def = action.col.colType === "checkbox" ? false : ""
        return {
          ...b,
          columns: [...b.columns, action.col],
          rows: b.rows.map(r => ({ ...r, cells: { ...r.cells, [action.col.id]: def } })),
        }
      })
    case "UPDATE_TABLE_COLUMN":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        return { ...b, columns: b.columns.map(c => c.id === action.col.id ? action.col : c) }
      })
    case "DELETE_TABLE_COLUMN":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        return {
          ...b,
          columns: b.columns.filter(c => c.id !== action.colId),
          rows: b.rows.map(r => {
            const cells = { ...r.cells }
            delete cells[action.colId]
            return { ...r, cells }
          }),
        }
      })
    case "REORDER_TABLE_COLUMNS":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        return { ...b, columns: action.columns }
      })
    case "ADD_TABLE_ROW":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        const cells: Record<string, string | boolean> = {}
        b.columns.forEach(col => { cells[col.id] = col.colType === "checkbox" ? false : "" })
        return { ...b, rows: [...b.rows, { id: uid(), cells }] }
      })
    case "UPDATE_TABLE_CELL":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        return {
          ...b,
          rows: b.rows.map(r => r.id === action.rowId
            ? { ...r, cells: { ...r.cells, [action.colId]: action.value } }
            : r
          ),
        }
      })
    case "UPDATE_TABLE_ROW":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        return {
          ...b,
          rows: b.rows.map(r => r.id === action.row.id ? action.row : r),
        }
      })
    case "DELETE_TABLE_ROW":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        return { ...b, rows: b.rows.filter(r => r.id !== action.rowId) }
      })
    case "REORDER_TABLE_ROWS":
      return mapBlock(state, action.themeId, action.subId, action.fineId, action.blockId, b => {
        if (b.type !== "table") return b
        return { ...b, rows: action.rows }
      })

    // --- ActionEntry ---
    case "ADD_ENTRY":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        entries: [...s.entries, makeEntry(action.entryType)],
      }))
    case "UPDATE_ENTRY":
      return mapEntry(state, action.themeId, action.subId, action.entry.id, () => action.entry)
    case "DELETE_ENTRY":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        entries: s.entries.filter(e => e.id !== action.entryId),
      }))
    case "REORDER_ENTRIES":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        entries: action.entries,
      }))

    // --- Entry costs ---
    case "ADD_ENTRY_COST": {
      const now = new Date()
      return mapEntry(state, action.themeId, action.subId, action.entryId, e => ({
        ...e,
        costs: [...e.costs, { id: uid(), year: now.getFullYear(), month: now.getMonth() + 1, amount: 0, label: "" }],
      }))
    }
    case "UPDATE_ENTRY_COST":
      return mapEntry(state, action.themeId, action.subId, action.entryId, e => ({
        ...e,
        costs: e.costs.map(c => c.id === action.cost.id ? action.cost : c),
      }))
    case "DELETE_ENTRY_COST":
      return mapEntry(state, action.themeId, action.subId, action.entryId, e => ({
        ...e,
        costs: e.costs.filter(c => c.id !== action.costId),
      }))

    // --- Source ---
    case "ADD_SOURCE":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        sources: [...s.sources, { id: uid(), ...action.source }],
      }))
    case "UPDATE_SOURCE":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        sources: s.sources.map(src => src.id === action.source.id ? action.source : src),
      }))
    case "DELETE_SOURCE":
      return mapSubTheme(state, action.themeId, action.subId, s => ({
        ...s,
        sources: s.sources.filter(src => src.id !== action.sourceId),
      }))
    case "REORDER_SOURCES":
      return mapSubTheme(state, action.themeId, action.subId, s => ({ ...s, sources: action.sources }))

    // --- Import ---
    case "IMPORT":
      return action.store

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const StoreContext = createContext<Store>(makeInitialState())
const DispatchContext = createContext<Dispatch<Action>>(() => {})

const STORAGE_KEY = "think-tool-v2"

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, makeInitialState())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Store
        // サブテーマに entries が無い場合のマイグレーション
        const migrated: Store = {
          ...parsed,
          globalStakeholders: (parsed as Store).globalStakeholders ?? [],
          themes: parsed.themes.map(t => ({
            ...t,
            subThemes: t.subThemes.map(s => ({
              ...s,
              entries: (s as SubTheme & { tasks?: unknown[] }).entries ?? [],
              sources: s.sources ?? [],
            })),
            resolvedSubThemes: (t.resolvedSubThemes ?? []).map(s => ({
              ...s,
              entries: (s as SubTheme & { tasks?: unknown[] }).entries ?? [],
              sources: s.sources ?? [],
            })),
          })),
        }
        dispatch({ type: "IMPORT", store: migrated })
      }
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  return (
    <StoreContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StoreContext.Provider>
  )
}

export function useStore() {
  return useContext(StoreContext)
}

export function useDispatch() {
  return useContext(DispatchContext)
}

export function useSelectedSubTheme() {
  const store = useStore()
  if (!store.selectedSubThemeId) return { sub: null, themeId: null, themeName: null }
  for (const theme of store.themes) {
    const sub = theme.subThemes.find(s => s.id === store.selectedSubThemeId)
    if (sub) return { sub, themeId: theme.id, themeName: theme.name }
  }
  return { sub: null, themeId: null, themeName: null }
}

export function useExportImport() {
  const store = useStore()
  const dispatch = useDispatch()

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `think-tool-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [store])

  const importJson = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as Store
        dispatch({ type: "IMPORT", store: parsed })
      } catch {
        alert("JSONの読み込みに失敗しました")
      }
    }
    reader.readAsText(file)
  }, [dispatch])

  return { exportJson, importJson }
}
