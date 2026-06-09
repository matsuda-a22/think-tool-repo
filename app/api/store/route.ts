import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { asc, eq, inArray } from "drizzle-orm"
import type { Store, Theme, SubTheme, FineTheme, Block, ActionEntry, Source, Stakeholder } from "@/lib/types"

// ---------------------------------------------------------------------------
// GET /api/store
// 全テーブルを読み込んで Store 型に組み立てて返す
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const [
      allThemes,
      allSubThemes,
      allStakeholders,
      allFineThemes,
      allBlocks,
      allEntries,
      allSources,
      allGlobalStakeholders,
    ] = await Promise.all([
      db.select().from(t.themes).orderBy(asc(t.themes.position)),
      db.select().from(t.subThemes).orderBy(asc(t.subThemes.position)),
      db.select().from(t.stakeholders).orderBy(asc(t.stakeholders.position)),
      db.select().from(t.fineThemes).orderBy(asc(t.fineThemes.position)),
      db.select().from(t.blocks).orderBy(asc(t.blocks.position)),
      db.select().from(t.entries).orderBy(asc(t.entries.position)),
      db.select().from(t.sources).orderBy(asc(t.sources.position)),
      db.select().from(t.globalStakeholders).orderBy(asc(t.globalStakeholders.position)),
    ])

    // blocks → FineTheme ごとに Block[] に変換
    const blocksByFineTheme = new Map<string, Block[]>()
    for (const b of allBlocks) {
      const block = dbRowToBlock(b)
      const list = blocksByFineTheme.get(b.fineThemeId) ?? []
      list.push(block)
      blocksByFineTheme.set(b.fineThemeId, list)
    }

    // fineThemes → SubTheme ごとに FineTheme[] に変換
    const fineThemesBySubTheme = new Map<string, FineTheme[]>()
    for (const f of allFineThemes) {
      const fine: FineTheme = {
        id: f.id,
        name: f.name,
        blocks: blocksByFineTheme.get(f.id) ?? [],
      }
      const list = fineThemesBySubTheme.get(f.subThemeId) ?? []
      list.push(fine)
      fineThemesBySubTheme.set(f.subThemeId, list)
    }

    // stakeholders → SubTheme ごとに Stakeholder[] に変換
    const stakeholdersBySubTheme = new Map<string, Stakeholder[]>()
    for (const s of allStakeholders) {
      const list = stakeholdersBySubTheme.get(s.subThemeId) ?? []
      list.push({ id: s.id, name: s.name, color: s.color })
      stakeholdersBySubTheme.set(s.subThemeId, list)
    }

    // entries → SubTheme ごとに ActionEntry[] に変換
    const entriesBySubTheme = new Map<string, ActionEntry[]>()
    for (const e of allEntries) {
      const entry = dbRowToEntry(e)
      const list = entriesBySubTheme.get(e.subThemeId) ?? []
      list.push(entry)
      entriesBySubTheme.set(e.subThemeId, list)
    }

    // sources → SubTheme ごとに Source[] に変換
    const sourcesBySubTheme = new Map<string, Source[]>()
    for (const s of allSources) {
      const list = sourcesBySubTheme.get(s.subThemeId) ?? []
      list.push({ id: s.id, kind: s.kind as Source["kind"], url: s.url, base64: s.base64Data, comment: s.comment })
      sourcesBySubTheme.set(s.subThemeId, list)
    }

    // subThemes → Theme ごとに SubTheme[] に変換
    const subThemesByTheme = new Map<string, { active: SubTheme[]; resolved: SubTheme[] }>()
    for (const s of allSubThemes) {
      const sub: SubTheme = {
        id: s.id,
        name: s.name,
        stakeholders: stakeholdersBySubTheme.get(s.id) ?? [],
        fineThemes: fineThemesBySubTheme.get(s.id) ?? [],
        entries: entriesBySubTheme.get(s.id) ?? [],
        sources: sourcesBySubTheme.get(s.id) ?? [],
      }
      const group = subThemesByTheme.get(s.themeId) ?? { active: [], resolved: [] }
      if (s.isResolved) {
        group.resolved.push(sub)
      } else {
        group.active.push(sub)
      }
      subThemesByTheme.set(s.themeId, group)
    }

    // themes → Theme[] に変換
    const themes: Theme[] = allThemes.map(theme => {
      const group = subThemesByTheme.get(theme.id) ?? { active: [], resolved: [] }
      return {
        id: theme.id,
        name: theme.name,
        subThemes: group.active,
        resolvedSubThemes: group.resolved,
      }
    })

    const store: Store = {
      themes,
      selectedSubThemeId: null,
      globalStakeholders: allGlobalStakeholders.map(g => ({ id: g.id, name: g.name, color: g.color })),
    }

    return NextResponse.json(store)
  } catch (error) {
    console.error("[GET /api/store]", error)
    return NextResponse.json({ error: "Failed to fetch store" }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/store
// Store 全体を受け取り、全テーブルを洗い替えする
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const store = (await request.json()) as Store

    await db.transaction(async (tx) => {
      // 既存データを全削除（cascade で子テーブルも連鎖削除）
      await tx.delete(t.themes)
      await tx.delete(t.globalStakeholders)

      // globalStakeholders を INSERT
      if (store.globalStakeholders.length > 0) {
        await tx.insert(t.globalStakeholders).values(
          store.globalStakeholders.map((g, i) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            position: i,
          }))
        )
      }

      // themes を INSERT
      for (const [themePos, theme] of store.themes.entries()) {
        await tx.insert(t.themes).values({ id: theme.id, name: theme.name, position: themePos })

        // subThemes（active + resolved）を INSERT
        const allSubs = [
          ...theme.subThemes.map(s => ({ ...s, isResolved: false })),
          ...theme.resolvedSubThemes.map(s => ({ ...s, isResolved: true })),
        ]

        for (const [subPos, sub] of allSubs.entries()) {
          await tx.insert(t.subThemes).values({
            id: sub.id,
            themeId: theme.id,
            name: sub.name,
            position: subPos,
            isResolved: sub.isResolved,
          })

          // stakeholders
          if (sub.stakeholders.length > 0) {
            await tx.insert(t.stakeholders).values(
              sub.stakeholders.map((s, i) => ({
                id: s.id,
                subThemeId: sub.id,
                name: s.name,
                color: s.color,
                position: i,
              }))
            )
          }

          // fineThemes
          for (const [finePos, fine] of sub.fineThemes.entries()) {
            await tx.insert(t.fineThemes).values({
              id: fine.id,
              subThemeId: sub.id,
              name: fine.name,
              position: finePos,
            })

            // blocks
            if (fine.blocks.length > 0) {
              await tx.insert(t.blocks).values(
                fine.blocks.map((b, i) => blockToDbRow(b, fine.id, i))
              )
            }
          }

          // entries
          if (sub.entries.length > 0) {
            await tx.insert(t.entries).values(
              sub.entries.map((e, i) => entryToDbRow(e, sub.id, i))
            )
          }

          // sources
          if (sub.sources.length > 0) {
            await tx.insert(t.sources).values(
              sub.sources.map((s, i) => ({
                id: s.id,
                subThemeId: sub.id,
                position: i,
                kind: s.kind,
                url: s.url,
                base64Data: s.base64,
                comment: s.comment,
              }))
            )
          }
        }
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[POST /api/store]", error)
    return NextResponse.json({ error: "Failed to save store" }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// ヘルパー：DBの行 → Block 型
// ---------------------------------------------------------------------------

function dbRowToBlock(row: typeof t.blocks.$inferSelect): Block {
  if (row.type === "memo") {
    return {
      id: row.id,
      type: "memo",
      content: row.content ?? "",
      aiPrompt: row.aiPrompt as Block extends { aiPrompt?: infer P } ? P : never ?? undefined,
    }
  }
  if (row.type === "tree") {
    return {
      id: row.id,
      type: "tree",
      rootLabel: row.rootLabel ?? null,
      viewMode: (row.viewMode as "mindmap" | "logictree") ?? "logictree",
      nodes: (row.nodes as never[]) ?? [],
    }
  }
  // table
  return {
    id: row.id,
    type: "table",
    columns: (row.columns as never[]) ?? [],
    rows: (row.rows as never[]) ?? [],
  }
}

// ---------------------------------------------------------------------------
// ヘルパー：Block 型 → DBの行
// ---------------------------------------------------------------------------

function blockToDbRow(block: Block, fineThemeId: string, position: number) {
  const base = { id: block.id, fineThemeId, type: block.type, position }
  if (block.type === "memo") {
    return { ...base, content: block.content, aiPrompt: block.aiPrompt ?? null }
  }
  if (block.type === "tree") {
    return { ...base, rootLabel: block.rootLabel, viewMode: block.viewMode, nodes: block.nodes }
  }
  return { ...base, columns: block.columns, rows: block.rows }
}

// ---------------------------------------------------------------------------
// ヘルパー：DBの行 → ActionEntry 型
// ---------------------------------------------------------------------------

function dbRowToEntry(row: typeof t.entries.$inferSelect): ActionEntry {
  const costs = (row.costs as never[]) ?? []
  if (row.type === "decision") {
    return { id: row.id, type: "decision", title: row.title, memo: row.memo, decided: row.decided ?? false, costs }
  }
  if (row.type === "schedule") {
    return { id: row.id, type: "schedule", title: row.title, memo: row.memo, dateStart: row.dateStart ?? "", dateEnd: row.dateEnd ?? "", costs }
  }
  if (row.type === "task") {
    return { id: row.id, type: "task", title: row.title, memo: row.memo, done: row.done ?? false, dueDate: row.dueDate ?? "", costs }
  }
  return { id: row.id, type: "memo_entry", title: row.title, memo: row.memo, costs }
}

// ---------------------------------------------------------------------------
// ヘルパー：ActionEntry 型 → DBの行
// ---------------------------------------------------------------------------

function entryToDbRow(entry: ActionEntry, subThemeId: string, position: number) {
  const base = { id: entry.id, subThemeId, type: entry.type, position, title: entry.title, memo: entry.memo, costs: entry.costs }
  if (entry.type === "decision") return { ...base, decided: entry.decided }
  if (entry.type === "schedule") return { ...base, dateStart: entry.dateStart, dateEnd: entry.dateEnd }
  if (entry.type === "task") return { ...base, done: entry.done, dueDate: entry.dueDate }
  return base
}
