"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sparkles,
  Search,
  X,
  Loader2,
  AlertCircle,
  ExternalLink,
  Plus,
  ChevronLeft,
  GitBranch,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { GenerateContentResponse } from "@google/genai"
import { GEMINI_KEY_STORAGE } from "./SettingsDialog"
import type { SubTheme } from "@/lib/types"

const DRILL_LABEL_MAX = 40
const SEARCH_QUERY_MAX = 80
const MAX_AI_SUGGESTIONS = 5
const MAX_SOURCES_PER_SUGGESTION = 3
const CITATION_SNIPPET_MAX = 220

type Suggestion = {
  text: string
  /** この提案に紐づく参照（Web検索時） */
  sources: Citation[]
}

type Citation = {
  url: string
  /** サイト名・ページタイトル（表示用） */
  title: string
  domain: string
  /** AIの回答のうち、このソースに紐づく抜粋 */
  snippet: string
}

type AiResult = {
  suggestions: Suggestion[]
  /** Web検索ツールを有効にして取得したか */
  searchUsed: boolean
}

type ParsedSuggestionLine = {
  text: string
  start: number
  end: number
}

type GroundingSupportRef = {
  startIndex: number
  endIndex: number
  segmentText: string
  chunkIndices: number[]
}

type GroundingContext = {
  chunksByIndex: Map<number, Citation>
  supports: GroundingSupportRef[]
}

export type AiContextScope =
  | { kind: "all" }
  | { kind: "fine"; fineId: string }
  | { kind: "memo"; fineId: string; blockId: string }

type Props = {
  subTheme: SubTheme
  onInsertMemo: (text: string, fineThemeId: string) => void
  onAddSource: (url: string, title: string) => void
  defaultFineThemeId: string | null
  initialScope?: AiContextScope | null
  onClose: () => void
}

const MEMO_PREVIEW_LEN = 28

function memoPreview(content: string): string {
  const line = content.trim().split("\n")[0] ?? ""
  if (line.length <= MEMO_PREVIEW_LEN) return line
  return `${line.slice(0, MEMO_PREVIEW_LEN)}…`
}

function scopeToSelectValue(scope: AiContextScope): string {
  if (scope.kind === "all") return "all"
  if (scope.kind === "fine") return `fine:${scope.fineId}`
  return `memo:${scope.fineId}:${scope.blockId}`
}

function selectValueToScope(value: string): AiContextScope {
  if (value === "all") return { kind: "all" }
  if (value.startsWith("fine:")) return { kind: "fine", fineId: value.slice(5) }
  const [, fineId, blockId] = value.split(":")
  return { kind: "memo", fineId, blockId }
}

function listScopeOptions(subTheme: SubTheme): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: "all", label: "全体" }]
  for (const ft of subTheme.fineThemes) {
    if (subTheme.fineThemes.length > 1) {
      options.push({ value: `fine:${ft.id}`, label: ft.name })
    }
    for (const block of ft.blocks) {
      if (block.type === "memo" && block.content.trim()) {
        options.push({
          value: `memo:${ft.id}:${block.id}`,
          label: `メモ: ${memoPreview(block.content)}`,
        })
      }
    }
  }
  return options
}

function scopeLabel(scope: AiContextScope, subTheme: SubTheme): string {
  if (scope.kind === "all") return "全体"
  const ft = subTheme.fineThemes.find(f => f.id === scope.fineId)
  if (scope.kind === "fine") return ft?.name ?? "考えごと"
  const block = ft?.blocks.find(b => b.id === scope.blockId && b.type === "memo")
  if (block?.type === "memo") return `メモ: ${memoPreview(block.content)}`
  return "メモ"
}

function truncateForLabel(text: string, max = DRILL_LABEL_MAX): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** 検索ワード未入力時に使うデフォルト（小テーマ名・対象・深掘り論点から組み立て） */
function deriveSearchQuery(
  subTheme: SubTheme,
  scope: AiContextScope,
  drillFocus?: string | null,
): string {
  if (drillFocus?.trim()) {
    return truncateForLabel(drillFocus.trim(), SEARCH_QUERY_MAX)
  }
  if (scope.kind === "memo") {
    const ft = subTheme.fineThemes.find(f => f.id === scope.fineId)
    const block = ft?.blocks.find(b => b.id === scope.blockId && b.type === "memo")
    if (block?.type === "memo" && block.content.trim()) {
      const first = block.content.trim().split("\n")[0] ?? ""
      if (first) return truncateForLabel(first, SEARCH_QUERY_MAX)
    }
  }
  if (scope.kind === "fine") {
    const ft = subTheme.fineThemes.find(f => f.id === scope.fineId)
    if (ft?.name) return `${subTheme.name} ${ft.name}`.trim()
  }
  return subTheme.name.trim() || "調べる"
}

function resolveSearchQuery(
  manual: string,
  subTheme: SubTheme,
  scope: AiContextScope,
  drillFocus?: string | null,
): string {
  const trimmed = manual.trim()
  if (trimmed) return trimmed
  return deriveSearchQuery(subTheme, scope, drillFocus)
}

function formatDrillMemo(parentText: string, suggestionText: string): string {
  return `【深掘り: ${truncateForLabel(parentText)}】\n${suggestionText}`
}

function buildFineThemeContent(ft: SubTheme["fineThemes"][number]): string[] {
  const lines: string[] = []
  for (const block of ft.blocks) {
    if (block.type === "memo") {
      if (block.content.trim()) lines.push(`メモ: ${block.content.trim()}`)
    } else if (block.type === "table") {
      for (const col of block.columns) {
        const values = block.rows
          .map(r => r.cells[col.id])
          .filter(v => v !== "" && v !== false && v !== undefined)
          .map(v => (typeof v === "boolean" ? (v ? "✓" : "") : v))
          .filter(Boolean)
        if (values.length) lines.push(`${col.name}: ${values.join(", ")}`)
      }
    } else if (block.type === "tree") {
      lines.push(`ツリー: ${block.rootLabel ?? ft.name}`)
    }
  }
  return lines
}

function buildContextBlock(subTheme: SubTheme, scope: AiContextScope): string {
  if (scope.kind === "memo") {
    const ft = subTheme.fineThemes.find(f => f.id === scope.fineId)
    const block = ft?.blocks.find(b => b.id === scope.blockId && b.type === "memo")
    if (block?.type === "memo" && block.content.trim()) {
      return `# テーマ: ${subTheme.name} › ${ft?.name ?? ""}\n\n【対象メモ（この内容のみを材料にする）】\n${block.content.trim()}`
    }
    return `# テーマ: ${subTheme.name}\n\n（対象メモが空です）`
  }

  const lines: string[] = []

  if (scope.kind === "fine") {
    const ft = subTheme.fineThemes.find(f => f.id === scope.fineId)
    if (ft) {
      lines.push(`# テーマ: ${subTheme.name} › ${ft.name}`)
      lines.push(...buildFineThemeContent(ft))
    }
  } else {
    lines.push(`# テーマ: ${subTheme.name}`)
    for (const ft of subTheme.fineThemes) {
      lines.push(`\n## ${ft.name}`)
      lines.push(...buildFineThemeContent(ft))
    }
  }

  return lines.join("\n")
}

function buildRootPrompt(
  subTheme: SubTheme,
  searchQuery: string | null,
  scope: AiContextScope,
): string {
  const context = buildContextBlock(subTheme, scope)
  const memoOnly = scope.kind === "memo"
    ? "対象メモの内容のみを材料にし、他のブロックや考えごとは参照しないでください。"
    : ""

  if (searchQuery) {
    return `以下は思考整理ツールに書かれた内容です。「${searchQuery}」を手がかりにWeb検索し、最新の事実・情報に基づいてこのテーマに役立つ内容を最大${MAX_AI_SUGGESTIONS}個（${MAX_AI_SUGGESTIONS}個以内）箇条書きで提案してください。各項目は1〜2文で簡潔に。検索結果を根拠にしてください。${memoOnly}

${context}

出力形式: 番号なし箇条書き（「・」始まり）。日本語で回答。`
  }

  return `以下は思考整理ツールに書かれた内容です。このテーマをより深く考えるために役立つ関連アイデア・論点・調査すべきポイントを最大${MAX_AI_SUGGESTIONS}個（${MAX_AI_SUGGESTIONS}個以内）提案してください。各項目は1〜2文で簡潔に。${memoOnly}

${context}

出力形式: 番号なし箇条書き（「・」始まり）。日本語で回答。`
}

function buildDrillPrompt(
  subTheme: SubTheme,
  focusLine: string,
  scope: AiContextScope,
  searchQuery: string | null,
  includeRisk: boolean,
): string {
  const context = buildContextBlock(subTheme, scope)
  const toneHint = includeRisk
    ? "派生する切り口・具体例を中心にしつつ、1〜2件は前提の疑問・リスク・見落としになりそうな点も含めてください。"
    : "派生する別の切り口・具体例・「もし〜なら」など、枝を増やす論点を中心にしてください。"

  if (searchQuery) {
    return `以下は思考整理ツールに書かれた内容です。次の論点を深掘りしてください。「${searchQuery}」というキーワードで検索・調査しつつ、この論点から広がる内容を最大${MAX_AI_SUGGESTIONS}個（${MAX_AI_SUGGESTIONS}個以内）箇条書きで提案してください。各項目は1〜2文で簡潔に。${toneHint}

【深掘り対象の論点】
${focusLine}

${context}

出力形式: 番号なし箇条書き（「・」始まり）。日本語で回答。`
  }

  return `以下は思考整理ツールに書かれた内容です。次の論点をさらに深く広げるために役立つ内容を最大${MAX_AI_SUGGESTIONS}個（${MAX_AI_SUGGESTIONS}個以内）箇条書きで提案してください。各項目は1〜2文で簡潔に。${toneHint}

【深掘り対象の論点】
${focusLine}

${context}

出力形式: 番号なし箇条書き（「・」始まり）。日本語で回答。`
}

function cleanSuggestionLine(line: string): string {
  return line.replace(/^[\d]+[.)]\s*|^[・\-•*]\s*|\*\*/g, "").trim()
}

function parseSuggestionsWithRanges(text: string): ParsedSuggestionLine[] {
  const out: ParsedSuggestionLine[] = []
  let offset = 0

  for (const rawLine of text.split("\n")) {
    const lineStart = offset
    const lineEnd = offset + rawLine.length
    offset = lineEnd + 1

    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const cleaned = cleanSuggestionLine(trimmed)
    if (!cleaned) continue

    out.push({ text: cleaned, start: lineStart, end: lineEnd })
    if (out.length >= MAX_AI_SUGGESTIONS) break
  }

  return out
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function textsRelate(a: string, b: string): boolean {
  const na = a.replace(/\s+/g, "").slice(0, 48)
  const nb = b.replace(/\s+/g, "").slice(0, 48)
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na)
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "")
  } catch {
    return ""
  }
}

function truncateSnippet(text: string, max = CITATION_SNIPPET_MAX): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function citationDisplayTitle(title: string, domain: string, url: string): string {
  const t = title.trim()
  if (t && !/vertexaisearch\.cloud\.google\.com/i.test(t) && t.length > 3) return t
  if (domain) return domain
  return hostnameFromUrl(url) || url
}

function citationFromChunkParts(
  url: string,
  title: string,
  domain: string,
  snippetPart: string,
): Citation | null {
  const u = url.trim()
  if (!u || !/^https?:\/\//i.test(u)) return null
  const host = domain || hostnameFromUrl(u)
  return {
    url: u,
    title: citationDisplayTitle(title, host, u),
    domain: host,
    snippet: truncateSnippet(snippetPart),
  }
}

function buildGroundingContext(response: GenerateContentResponse): GroundingContext {
  const chunksByIndex = new Map<number, Citation>()
  const supports: GroundingSupportRef[] = []

  for (const candidate of response.candidates ?? []) {
    const meta = candidate.groundingMetadata
    const chunks = meta?.groundingChunks ?? []

    const indexSnippets = new Map<number, string[]>()
    for (const support of meta?.groundingSupports ?? []) {
      const seg = support.segment
      const segText = seg?.text?.trim() ?? ""
      const chunkIndices = support.groundingChunkIndices ?? []
      if (segText) {
        for (const idx of chunkIndices) {
          const list = indexSnippets.get(idx) ?? []
          if (!list.includes(segText)) list.push(segText)
          indexSnippets.set(idx, list)
        }
      }
      if (seg && (seg.startIndex != null || seg.endIndex != null || segText)) {
        supports.push({
          startIndex: seg.startIndex ?? 0,
          endIndex: seg.endIndex ?? 0,
          segmentText: segText,
          chunkIndices,
        })
      }
    }

    chunks.forEach((chunk, idx) => {
      const snippetPart = (indexSnippets.get(idx) ?? []).join(" ")
      if (chunk.web?.uri) {
        const c = citationFromChunkParts(
          chunk.web.uri,
          chunk.web.title ?? "",
          chunk.web.domain ?? hostnameFromUrl(chunk.web.uri),
          snippetPart,
        )
        if (c) chunksByIndex.set(idx, c)
      }
      if (chunk.retrievedContext?.uri) {
        const c = citationFromChunkParts(
          chunk.retrievedContext.uri,
          chunk.retrievedContext.title ?? "",
          hostnameFromUrl(chunk.retrievedContext.uri),
          snippetPart || (chunk.retrievedContext.text ?? ""),
        )
        if (c) chunksByIndex.set(idx, c)
      }
    })
  }

  return { chunksByIndex, supports }
}

function sourcesForSuggestion(
  line: ParsedSuggestionLine,
  ctx: GroundingContext,
): Citation[] {
  const chunkIndices = new Set<number>()

  for (const support of ctx.supports) {
    const byRange =
      support.endIndex > support.startIndex &&
      rangesOverlap(line.start, line.end, support.startIndex, support.endIndex)
    const byText =
      support.segmentText &&
      (textsRelate(line.text, support.segmentText) ||
        textsRelate(line.text, support.segmentText.replace(/^[\d]+[.)]\s*|^[・\-•*]\s*/g, "")))
    if (byRange || byText) {
      for (const idx of support.chunkIndices) chunkIndices.add(idx)
    }
  }

  const byUrl = new Map<string, Citation>()
  for (const idx of chunkIndices) {
    const c = ctx.chunksByIndex.get(idx)
    if (c && !byUrl.has(c.url)) byUrl.set(c.url, c)
  }
  return [...byUrl.values()].slice(0, MAX_SOURCES_PER_SUGGESTION)
}

function buildSuggestionsFromResponse(
  response: GenerateContentResponse,
  text: string,
  searchUsed: boolean,
): Suggestion[] {
  const lines = parseSuggestionsWithRanges(text)
  if (!searchUsed) {
    return lines.map(l => ({ text: l.text, sources: [] }))
  }

  const ctx = buildGroundingContext(response)
  const suggestions = lines.map(l => ({
    text: l.text,
    sources: sourcesForSuggestion(l, ctx),
  }))

  if (suggestions.every(s => s.sources.length === 0) && ctx.chunksByIndex.size > 0) {
    const ordered = [...ctx.chunksByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, c]) => c)
    return suggestions.map((s, i) => ({
      ...s,
      sources: ordered[i] ? [ordered[i]] : [],
    }))
  }

  return suggestions
}

function citationSourceComment(c: Citation): string {
  const lines = [c.title]
  if (c.domain && c.domain !== c.title) lines.push(`（${c.domain}）`)
  if (c.snippet) lines.push(c.snippet)
  return lines.join("\n")
}

async function callGemini(
  prompt: string,
  searchQuery: string | null,
  apiKey: string,
): Promise<AiResult> {
  const { GoogleGenAI } = await import("@google/genai")
  const ai = new GoogleGenAI({ apiKey })
  const useSearch = !!searchQuery

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    ...(useSearch ? { config: { tools: [{ googleSearch: {} }] } } : {}),
  })

  const text = response.text ?? ""
  const suggestions = buildSuggestionsFromResponse(response, text, useSearch)

  return { suggestions, searchUsed: useSearch }
}

function SuggestionSourceRow({
  source,
  onAddSource,
}: {
  source: Citation
  onAddSource: (url: string, title: string) => void
}) {
  return (
    <div className="flex items-start gap-1.5 rounded border border-dashed bg-muted/30 px-2 py-1">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-[10px] font-medium text-muted-foreground">{source.domain}</p>
        <p className="text-[11px] font-medium leading-snug">{source.title}</p>
        {source.snippet && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
            {source.snippet}
          </p>
        )}
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          開く
        </a>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[10px] px-1.5 shrink-0"
        title="ペイン④ 情報ソースに追加"
        onClick={() => onAddSource(source.url, citationSourceComment(source))}
      >
        <Plus className="h-3 w-3 mr-0.5" />
        ④へ
      </Button>
    </div>
  )
}

function SuggestionRow({
  text,
  sources,
  searchUsed,
  onDrill,
  onAdd,
  onAddSource,
  showDrill,
  added,
}: {
  text: string
  sources: Citation[]
  searchUsed: boolean
  onDrill?: () => void
  onAdd: () => void
  onAddSource: (url: string, title: string) => void
  showDrill: boolean
  added: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 transition-colors space-y-1.5",
        added
          ? "bg-primary/10 border-primary/40"
          : "bg-background hover:border-primary/20",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span
          className={cn(
            "flex-1 text-xs leading-relaxed min-w-0",
            added && "text-foreground/80",
          )}
        >
          {text}
        </span>
        <div className="flex shrink-0 gap-0.5">
          {showDrill && onDrill && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-1.5 gap-0.5"
              onClick={onDrill}
              title="この論点を深掘り"
            >
              <GitBranch className="h-3 w-3" />
              深掘り
            </Button>
          )}
          <Button
            variant={added ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "h-6 text-[10px] px-1.5 gap-0.5",
              added && "text-primary",
            )}
            onClick={onAdd}
            disabled={added}
            title={added ? "メモに追加済み" : "ペイン②のメモブロックに追加"}
          >
            {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {added ? "追加済" : "メモへ"}
          </Button>
        </div>
      </div>

      {searchUsed && sources.length > 0 && (
        <div className="space-y-1 pl-2 border-l-2 border-primary/25">
          <p className="text-[10px] text-muted-foreground font-medium">根拠</p>
          {sources.map(s => (
            <SuggestionSourceRow
              key={s.url}
              source={s}
              onAddSource={onAddSource}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function AiPanel({
  subTheme,
  onInsertMemo,
  onAddSource,
  defaultFineThemeId,
  initialScope,
  onClose,
}: Props) {
  const [view, setView] = useState<"root" | "drill">("root")
  const [drillParent, setDrillParent] = useState<string | null>(null)

  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [drillSearchMode, setDrillSearchMode] = useState(false)
  const [drillSearchQuery, setDrillSearchQuery] = useState("")
  const [drillRiskMode, setDrillRiskMode] = useState(false)

  const [loading, setLoading] = useState(false)
  const [rootResult, setRootResult] = useState<AiResult | null>(null)
  const [drillResult, setDrillResult] = useState<AiResult | null>(null)
  const [rootAddedIndices, setRootAddedIndices] = useState<Set<number>>(() => new Set())
  const [drillAddedIndices, setDrillAddedIndices] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const [insertedFineThemeId, setInsertedFineThemeId] = useState<string | null>(
    defaultFineThemeId,
  )
  const [contextScope, setContextScope] = useState<AiContextScope>(
    initialScope ?? { kind: "all" },
  )

  const scopeOptions = listScopeOptions(subTheme)
  const showScopeSelect = scopeOptions.length > 1

  const activeFineThemeId = insertedFineThemeId ?? subTheme.fineThemes[0]?.id ?? null
  const activeResult = view === "root" ? rootResult : drillResult
  const activeAddedIndices = view === "root" ? rootAddedIndices : drillAddedIndices

  function handleScopeChange(value: string) {
    const scope = selectValueToScope(value)
    setContextScope(scope)
    if (scope.kind === "memo" || scope.kind === "fine") {
      setInsertedFineThemeId(scope.fineId)
    }
  }

  function openDrill(parentText: string) {
    setDrillParent(parentText)
    setView("drill")
    setDrillResult(null)
    setDrillSearchMode(false)
    setDrillSearchQuery("")
    setDrillRiskMode(false)
    setError(null)
  }

  function backToRoot() {
    setView("root")
    setDrillParent(null)
    setDrillResult(null)
    setError(null)
  }

  async function runRoot() {
    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)
    if (!apiKey) {
      setError("Gemini API キーが設定されていません。ツールバーの「設定」から入力してください。")
      return
    }
    setLoading(true)
    setError(null)

    try {
      const q = searchMode
        ? resolveSearchQuery(searchQuery, subTheme, contextScope)
        : null
      const prompt = buildRootPrompt(subTheme, q, contextScope)
      const res = await callGemini(prompt, q, apiKey)
      setRootResult(res)
      setRootAddedIndices(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  async function runDrill() {
    if (!drillParent) return

    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)
    if (!apiKey) {
      setError("Gemini API キーが設定されていません。ツールバーの「設定」から入力してください。")
      return
    }
    setLoading(true)
    setError(null)

    try {
      const q = drillSearchMode
        ? resolveSearchQuery(drillSearchQuery, subTheme, contextScope, drillParent)
        : null
      const prompt = buildDrillPrompt(
        subTheme,
        drillParent,
        contextScope,
        q,
        drillRiskMode,
      )
      const res = await callGemini(prompt, q, apiKey)
      setDrillResult(res)
      setDrillAddedIndices(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  function handleAdd(index: number, text: string, fromDrill: boolean) {
    if (!activeFineThemeId) return
    const content = fromDrill && drillParent
      ? formatDrillMemo(drillParent, text)
      : text
    onInsertMemo(content, activeFineThemeId)
    if (fromDrill) {
      setDrillAddedIndices(prev => new Set(prev).add(index))
    } else {
      setRootAddedIndices(prev => new Set(prev).add(index))
    }
  }

  return (
    <div className="border-t bg-muted/30 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold flex-1">
          {view === "drill" ? "AI 提案 — 深掘り" : "AI 提案"}
        </span>

        {view === "root" && (
          <button
            type="button"
            onClick={() => {
              setSearchMode(v => {
                const next = !v
                if (next && !searchQuery.trim()) {
                  setSearchQuery(deriveSearchQuery(subTheme, contextScope))
                }
                return next
              })
            }}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors",
              searchMode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
            title={
              searchMode
                ? "Web検索 ON（参照URLを④に追加できます）"
                : "Web検索 OFF（書き出し内容だけから提案）"
            }
          >
            <Search className="h-3 w-3" />
            Web検索
          </button>
        )}

        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {view === "root" ? (
        <div className="px-3 py-2 flex flex-col gap-1.5 shrink-0">
        <div className="flex flex-wrap gap-2 items-center">
          {searchMode && (
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={deriveSearchQuery(subTheme, contextScope)}
              className="h-7 text-xs flex-1 min-w-[120px]"
              onKeyDown={e => e.key === "Enter" && runRoot()}
            />
          )}
          <Button
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={runRoot}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            {loading ? "生成中..." : "提案を取得"}
          </Button>

          {showScopeSelect && (
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="text-[10px] text-muted-foreground shrink-0">対象:</span>
              <select
                value={scopeToSelectValue(contextScope)}
                onChange={e => handleScopeChange(e.target.value)}
                className="h-7 text-xs border rounded px-1.5 bg-background text-foreground min-w-0 flex-1 max-w-[200px]"
              >
                {scopeOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {subTheme.fineThemes.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground shrink-0">挿入先:</span>
              <select
                value={activeFineThemeId ?? ""}
                onChange={e => setInsertedFineThemeId(e.target.value || null)}
                className="h-7 text-xs border rounded px-1.5 bg-background text-foreground"
              >
                {subTheme.fineThemes.map(ft => (
                  <option key={ft.id} value={ft.id}>{ft.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {searchMode && (
          <p className="text-[10px] text-muted-foreground leading-snug">
            空欄のまま「提案を取得」でも、小テーマ名などから検索します。絞りたいときだけ上の欄を編集してください。
          </p>
        )}
        </div>
      ) : (
        <div className="shrink-0 border-b">
          <button
            type="button"
            onClick={backToRoot}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            元の一覧に戻る
          </button>
          {drillParent && (
            <p className="px-3 pb-2 text-xs text-foreground/90 line-clamp-2 border-t bg-muted/20">
              <span className="text-[10px] text-muted-foreground font-medium">深掘り中: </span>
              {drillParent}
            </p>
          )}
          <div className="px-3 py-2 flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => {
                setDrillSearchMode(v => {
                  const next = !v
                  if (next && !drillSearchQuery.trim() && drillParent) {
                    setDrillSearchQuery(
                      deriveSearchQuery(subTheme, contextScope, drillParent),
                    )
                  }
                  return next
                })
              }}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors",
                drillSearchMode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
              title="深掘り論点をもとにWeb検索"
            >
              <Search className="h-3 w-3" />
              Web検索
            </button>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <Checkbox
                checked={drillRiskMode}
                onCheckedChange={v => setDrillRiskMode(!!v)}
                className="h-3.5 w-3.5"
              />
              リスク・前提も見る
            </label>
            {drillSearchMode && (
              <Input
                value={drillSearchQuery}
                onChange={e => setDrillSearchQuery(e.target.value)}
                placeholder={
                  drillParent
                    ? deriveSearchQuery(subTheme, contextScope, drillParent)
                    : "深掘り論点"
                }
                className="h-7 text-xs flex-1 min-w-[100px]"
                onKeyDown={e => e.key === "Enter" && runDrill()}
              />
            )}
            <Button
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={runDrill}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitBranch className="h-3.5 w-3.5 mr-1" />
              )}
              {loading ? "生成中..." : "深掘りを取得"}
            </Button>
            {subTheme.fineThemes.length > 1 && (
              <div className="flex items-center gap-1 w-full">
                <span className="text-[10px] text-muted-foreground shrink-0">挿入先:</span>
                <select
                  value={activeFineThemeId ?? ""}
                  onChange={e => setInsertedFineThemeId(e.target.value || null)}
                  className="h-7 text-xs border rounded px-1.5 bg-background text-foreground flex-1"
                >
                  {subTheme.fineThemes.map(ft => (
                    <option key={ft.id} value={ft.id}>{ft.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {view === "root" && (showScopeSelect || subTheme.fineThemes.length > 1) && <Separator />}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 py-2 space-y-1.5">
          {error && (
            <div className="flex items-start gap-2 text-destructive text-xs rounded-md bg-destructive/10 p-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {view === "root" && !rootResult && !loading && !error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              対象: {scopeLabel(contextScope, subTheme)}
              <br />
              {searchMode
                ? "「提案を取得」すると、各提案の下に根拠URLが付きます"
                : "「提案を取得」で書き出し内容からアイデアを提案します（根拠URLは Web検索 ON のときのみ）"}
            </p>
          )}

          {view === "drill" && !drillResult && !loading && !error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              検索の有無を決めて「深掘りを取得」を押してください
            </p>
          )}

          {activeResult && (
            <>
              {activeResult.suggestions.length === 0 && (
                <p className="text-xs text-muted-foreground italic">提案が生成されませんでした。</p>
              )}
              {activeResult.suggestions.map((s, i) => (
                <SuggestionRow
                  key={i}
                  text={s.text}
                  sources={s.sources}
                  searchUsed={activeResult.searchUsed}
                  added={activeAddedIndices.has(i)}
                  showDrill={view === "root"}
                  onDrill={view === "root" ? () => openDrill(s.text) : undefined}
                  onAdd={() => handleAdd(i, s.text, view === "drill")}
                  onAddSource={onAddSource}
                />
              ))}
              {activeResult.searchUsed &&
                activeResult.suggestions.length > 0 &&
                activeResult.suggestions.every(s => s.sources.length === 0) && (
                  <p className="text-[10px] text-muted-foreground italic mt-1">
                    参照URLを提案ごとに紐づけられませんでした。検索ワードを変えて再取得してください。
                  </p>
                )}
              {!activeResult.searchUsed && (
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  各提案にURLを付けるには Web検索 をONにしてください。
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
