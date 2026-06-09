// ---------------------------------------------------------------------------
// Pane ② ブロック（書き出しペイン）
// ---------------------------------------------------------------------------

export type Stakeholder = {
  id: string
  name: string
  color: string
}

export type TableColumnType = "text" | "checkbox"

export type TableColumn = {
  id: string
  name: string
  colType: TableColumnType
  /** 列幅（px）。未設定時は colType に応じたデフォルト */
  width?: number
}

export type TableRow = {
  id: string
  cells: Record<string, string | boolean>
  /** 行の最小高さ（px）。未設定時は内容に応じて自動 */
  height?: number
}

export type TableBlock = {
  id: string
  type: "table"
  columns: TableColumn[]
  rows: TableRow[]
}

export type AiPrompt = {
  label: string
  description: string
}

export type MemoBlock = {
  id: string
  type: "memo"
  content: string
  /** AI提案の切り口から生成されたメモブロック。上段に読み取り専用で表示する */
  aiPrompt?: AiPrompt
}

export type TreeNode = {
  id: string
  label: string
  children: TreeNode[]
  /** 完了・確認済み（取り消し線＋薄く表示） */
  checked?: boolean
  /** 重要・要確認など目立たせる */
  highlighted?: boolean
}

export type TreeBlock = {
  id: string
  type: "tree"
  rootLabel: string | null
  nodes: TreeNode[]
  viewMode: "mindmap" | "logictree"
}

// DecisionBlock は廃止済み（DESIGN.md: ②の構造から削除）

export type Block = TableBlock | MemoBlock | TreeBlock

export type FineTheme = {
  id: string
  name: string
  blocks: Block[]
}

// ---------------------------------------------------------------------------
// 費用（ペイン③ エントリー共通）
// ---------------------------------------------------------------------------

export type CostEntry = {
  id: string
  year: number
  month: number
  amount: number
  label: string
}

// ---------------------------------------------------------------------------
// ペイン③ アクション・エントリー
// ---------------------------------------------------------------------------

export type DecisionEntry = {
  id: string
  type: "decision"
  title: string
  memo: string
  decided: boolean
  costs: CostEntry[]
}

export type ScheduleEntry = {
  id: string
  type: "schedule"
  title: string
  memo: string
  dateStart: string
  dateEnd: string
  costs: CostEntry[]
}

export type TaskEntry = {
  id: string
  type: "task"
  title: string
  memo: string
  done: boolean
  dueDate: string
  costs: CostEntry[]
}

export type MemoEntry = {
  id: string
  type: "memo_entry"
  title: string
  memo: string
  costs: CostEntry[]
}

export type ActionEntry = DecisionEntry | ScheduleEntry | TaskEntry | MemoEntry

// ---------------------------------------------------------------------------
// 情報ソース
// ---------------------------------------------------------------------------

export type Source = {
  id: string
  kind: "url" | "image"
  url: string
  base64: string | null
  comment: string
}

// ---------------------------------------------------------------------------
// 小テーマ / テーマ
// ---------------------------------------------------------------------------

export type SubTheme = {
  id: string
  name: string
  stakeholders: Stakeholder[]
  fineThemes: FineTheme[]
  entries: ActionEntry[]
  sources: Source[]
}

export type Theme = {
  id: string
  name: string
  subThemes: SubTheme[]
  resolvedSubThemes: SubTheme[]
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type Store = {
  themes: Theme[]
  selectedSubThemeId: string | null
  globalStakeholders: Stakeholder[]
}

// ---------------------------------------------------------------------------
// 費用集計用
// ---------------------------------------------------------------------------

export type MonthlyCost = {
  year: number
  month: number
  amount: number
}

export type SubThemeCostSummary = {
  subThemeName: string
  monthly: MonthlyCost[]
}
