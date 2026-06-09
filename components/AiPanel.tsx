"use client"

import { useState } from "react"
import { Sparkles, Search, X, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GEMINI_KEY_STORAGE } from "./SettingsDialog"
import type { SubTheme, FineTheme, AiPrompt } from "@/lib/types"

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------
const MAX_SUGGESTIONS = 3

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------
type AiSuggestion = {
  label: string
  description: string
}

// ---------------------------------------------------------------------------
// LLMプロンプト構築
// ---------------------------------------------------------------------------
function buildContext(subTheme: SubTheme, fine: FineTheme, includeAll: boolean): string {
  const lines: string[] = []

  if (includeAll) {
    lines.push(`# テーマ: ${subTheme.name}`)
    for (const f of subTheme.fineThemes) {
      lines.push(`\n## ${f.name}`)
      lines.push(...buildFineContent(f))
    }
  } else {
    lines.push(`# テーマ: ${subTheme.name} › ${fine.name}`)
    lines.push(...buildFineContent(fine))
  }

  return lines.join("\n")
}

function buildFineContent(fine: FineTheme): string[] {
  const lines: string[] = []
  for (const block of fine.blocks) {
    if (block.type === "memo" && block.content.trim()) {
      lines.push(`メモ: ${block.content.trim()}`)
    } else if (block.type === "table") {
      for (const col of block.columns) {
        const vals = block.rows
          .map(r => r.cells[col.id])
          .filter(v => v !== "" && v !== false && v !== undefined)
          .map(v => (typeof v === "boolean" ? (v ? "✓" : "") : v))
          .filter(Boolean)
        if (vals.length) lines.push(`${col.name}: ${vals.join(", ")}`)
      }
    } else if (block.type === "tree" && block.rootLabel) {
      lines.push(`ツリー: ${block.rootLabel}`)
    }
  }
  return lines
}

function buildPrompt(subTheme: SubTheme, fine: FineTheme, includeAll: boolean, searchQuery: string | null): string {
  const context = buildContext(subTheme, fine, includeAll)
  const searchNote = searchQuery
    ? `「${searchQuery}」を手がかりにWeb検索し、最新情報を踏まえた切り口を提示してください。`
    : ""

  return `以下は思考整理ツールに書かれた内容です。このテーマを考えるにあたって重要な「思考の切り口」を${MAX_SUGGESTIONS}つ提示してください。${searchNote}

各切り口について、切り口名（10字以内）と、なぜその視点が重要かを1〜2文で説明してください。

出力形式（必ずこの形式で出力すること）:
## 切り口名
なぜその視点が重要かの説明（1〜2文）。

## 切り口名
説明。

## 切り口名
説明。

---

${context}

日本語で回答してください。`
}

// ---------------------------------------------------------------------------
// パーサー
// ---------------------------------------------------------------------------
function parseSuggestions(text: string): AiSuggestion[] {
  const parts = text.split(/^## /m).filter(s => s.trim())
  return parts.slice(0, MAX_SUGGESTIONS).flatMap(part => {
    const lines = part.trim().split("\n")
    const label = lines[0]?.trim().replace(/^#+\s*/, "")
    const description = lines.slice(1).join(" ").replace(/^[-—]\s*/, "").trim()
    if (!label) return []
    return [{ label, description }]
  })
}

// ---------------------------------------------------------------------------
// Gemini呼び出し
// ---------------------------------------------------------------------------
async function callGemini(prompt: string, searchQuery: string | null, apiKey: string): Promise<AiSuggestion[]> {
  const { GoogleGenAI } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
      ...(searchQuery ? { tools: [{ googleSearch: {} }] } : {}),
    },
  })

  const fromGetter = response.text
  let text = ""
  if (fromGetter != null && fromGetter.trim()) {
    text = fromGetter.trim()
  } else {
    const parts = response.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      if (typeof part.text === "string" && !part.thought) text += part.text
    }
    text = text.trim()
  }

  if (!text) throw new Error("AIから応答がありませんでした。APIキーとネットワーク接続を確認してください。")

  const suggestions = parseSuggestions(text)
  if (suggestions.length === 0) throw new Error("切り口の形式を読み取れませんでした。もう一度「取得」を押してください。")

  return suggestions
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type Props = {
  subTheme: SubTheme
  fine: FineTheme
  onAddBlock: (aiPrompt: AiPrompt) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------
export default function AiPanel({ subTheme, fine, onAddBlock, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<AiSuggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchOn, setSearchOn] = useState(false)
  const [includeAll, setIncludeAll] = useState(false)
  const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set())

  async function fetchSuggestions() {
    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)
    if (!apiKey) {
      setError("Gemini API キーが設定されていません。ツールバーの「設定」から入力してください。")
      return
    }
    setLoading(true)
    setError(null)
    setSuggestions(null)
    setUsedIndices(new Set())
    try {
      const q = searchOn ? (subTheme.name + " " + fine.name).trim() : null
      const prompt = buildPrompt(subTheme, fine, includeAll, q)
      const result = await callGemini(prompt, q, apiKey)
      setSuggestions(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  function handleAdd(index: number, suggestion: AiSuggestion) {
    onAddBlock({ label: suggestion.label, description: suggestion.description })
    setUsedIndices(prev => new Set(prev).add(index))
  }

  return (
    <div className="border-t bg-primary/5">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary/10">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-primary flex-1">AI 提案</span>

        {/* Web検索トグル */}
        <button
          type="button"
          onClick={() => setSearchOn(v => !v)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors",
            searchOn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
          title={searchOn ? "Web検索 ON" : "Web検索 OFF"}
        >
          <Search className="h-3 w-3" />
          Web検索
        </button>

        {/* 閉じる */}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* オプション行 */}
      <div className="flex items-center gap-3 px-3 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeAll}
            onChange={e => setIncludeAll(e.target.checked)}
            className="h-3 w-3"
          />
          全考えごとも含める
        </label>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={fetchSuggestions}
          disabled={loading}
        >
          {loading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中...</>
            : suggestions
              ? <><RefreshCw className="h-3.5 w-3.5" />再取得</>
              : <><Sparkles className="h-3.5 w-3.5" />取得</>
          }
        </Button>
      </div>

      {/* コンテンツ */}
      <div className="px-3 pb-3 space-y-2 max-h-[300px] overflow-y-auto">
        {error && (
          <div className="flex items-start gap-2 text-destructive text-xs rounded-md bg-destructive/10 p-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!suggestions && !loading && !error && (
          <p className="text-xs text-muted-foreground text-center py-3">
            「取得」を押すと、この考えごとの内容から思考の切り口を{MAX_SUGGESTIONS}件提案します
          </p>
        )}

        {suggestions && suggestions.map((s, i) => (
          <div
            key={i}
            className={cn(
              "rounded-md border p-2.5 space-y-1.5 transition-colors",
              usedIndices.has(i)
                ? "bg-primary/5 border-primary/30 opacity-60"
                : "bg-background hover:border-primary/20 cursor-pointer"
            )}
            onClick={() => !usedIndices.has(i) && handleAdd(i, s)}
            title={usedIndices.has(i) ? "追加済み" : "クリックでメモブロックを追加"}
          >
            <div className="flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <span className="text-xs font-semibold leading-snug">{s.label}</span>
              {usedIndices.has(i) && (
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">追加済</span>
              )}
            </div>
            {s.description && (
              <p className="text-[11px] text-muted-foreground leading-relaxed pl-[18px]">
                {s.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
