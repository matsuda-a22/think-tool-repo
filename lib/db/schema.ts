import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// グローバルステークホルダー
// ---------------------------------------------------------------------------

export const globalStakeholders = pgTable("global_stakeholders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// テーマ
// ---------------------------------------------------------------------------

export const themes = pgTable("themes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// 小テーマ
// ---------------------------------------------------------------------------

export const subThemes = pgTable("sub_themes", {
  id: text("id").primaryKey(),
  themeId: text("theme_id")
    .notNull()
    .references(() => themes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  /** true = resolvedSubThemes に移動済み */
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// ステークホルダー（小テーマ単位）
// ---------------------------------------------------------------------------

export const stakeholders = pgTable("stakeholders", {
  id: text("id").primaryKey(),
  subThemeId: text("sub_theme_id")
    .notNull()
    .references(() => subThemes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// 考えごと（FineTheme）
// ---------------------------------------------------------------------------

export const fineThemes = pgTable("fine_themes", {
  id: text("id").primaryKey(),
  subThemeId: text("sub_theme_id")
    .notNull()
    .references(() => subThemes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// ブロック（FineTheme の中のコンテンツ）
//   type = "memo" | "tree" | "table"
//   タイプ固有の複雑な構造（TreeNode[], TableColumn[], TableRow[]）は jsonb で保持
// ---------------------------------------------------------------------------

export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  fineThemeId: text("fine_theme_id")
    .notNull()
    .references(() => fineThemes.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "memo" | "tree" | "table"
  position: integer("position").notNull().default(0),

  // memo
  content: text("content"),
  aiPrompt: jsonb("ai_prompt"), // { label: string, description: string } | null

  // tree
  rootLabel: text("root_label"),
  viewMode: text("view_mode"), // "mindmap" | "logictree"
  nodes: jsonb("nodes"), // TreeNode[]

  // table
  columns: jsonb("columns"), // TableColumn[]
  rows: jsonb("rows"), // TableRow[]

  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// エントリー（決定・スケジュール・タスク・メモ）
//   共通カラムを正規化し、タイプ固有フィールドを nullable カラムで管理
//   CostEntry[] は jsonb で保持
// ---------------------------------------------------------------------------

export const entries = pgTable("entries", {
  id: text("id").primaryKey(),
  subThemeId: text("sub_theme_id")
    .notNull()
    .references(() => subThemes.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "decision" | "schedule" | "task" | "memo_entry"
  position: integer("position").notNull().default(0),

  // 共通
  title: text("title").notNull().default(""),
  memo: text("memo").notNull().default(""),
  costs: jsonb("costs").notNull().default([]), // CostEntry[]

  // decision
  decided: boolean("decided"),

  // schedule
  dateStart: text("date_start"),
  dateEnd: text("date_end"),

  // task
  done: boolean("done"),
  dueDate: text("due_date"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// 情報ソース
// ---------------------------------------------------------------------------

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  subThemeId: text("sub_theme_id")
    .notNull()
    .references(() => subThemes.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  kind: text("kind").notNull(), // "url" | "image"
  url: text("url").notNull().default(""),
  base64Data: text("base64_data"),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
