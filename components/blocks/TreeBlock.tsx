"use client"

import { useRef, useState, useEffect, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { GitBranch, Network, CircleHelp } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { uid } from "@/lib/utils"
import { useDispatch } from "@/lib/store"
import type { TreeBlock as TTreeBlock, TreeNode } from "@/lib/types"

// ---------------------------------------------------------------------------
// Flat node model for tree manipulation
// ---------------------------------------------------------------------------

type FlatNode = {
  id: string
  label: string
  depth: number
  checked?: boolean
  highlighted?: boolean
}

function treeToFlat(nodes: TreeNode[], depth = 0): FlatNode[] {
  const result: FlatNode[] = []
  for (const n of nodes) {
    result.push({
      id: n.id,
      label: n.label,
      depth,
      ...(n.checked ? { checked: true } : {}),
      ...(n.highlighted ? { highlighted: true } : {}),
    })
    result.push(...treeToFlat(n.children, depth + 1))
  }
  return result
}

function flatToTree(flat: FlatNode[]): TreeNode[] {
  const root: { children: TreeNode[] } = { children: [] }
  const stack: Array<{ children: TreeNode[] }> = [root]
  for (const item of flat) {
    while (stack.length > item.depth + 1) stack.pop()
    const node: TreeNode = { id: item.id, label: item.label, children: [] }
    if (item.checked) node.checked = true
    if (item.highlighted) node.highlighted = true
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return root.children
}

/** ノードを削除し、直下の子孫を1段昇格させる（孫以下を失わない） */
function deleteNodePromoteChildren(flat: FlatNode[], i: number): FlatNode[] {
  const item = flat[i]
  let j = i + 1
  while (j < flat.length && flat[j].depth > item.depth) j++
  const promoted = flat.slice(i + 1, j).map(n => ({ ...n, depth: n.depth - 1 }))
  return [...flat.slice(0, i), ...promoted, ...flat.slice(j)]
}

/** ノード（＋その子孫）を同階層の兄弟と入れ替えて上下移動 */
function moveNodeInFlat(flat: FlatNode[], i: number, dir: "up" | "down"): FlatNode[] {
  const item = flat[i]
  // このノードの部分木の終端インデックス
  let end = i + 1
  while (end < flat.length && flat[end].depth > item.depth) end++
  const subtree = flat.slice(i, end)

  if (dir === "up") {
    // 前の兄弟ノードの先頭を探す
    let prevStart = i - 1
    while (prevStart >= 0 && flat[prevStart].depth > item.depth) prevStart--
    if (prevStart < 0 || flat[prevStart].depth !== item.depth) return flat
    const prevSubtree = flat.slice(prevStart, i)
    return [...flat.slice(0, prevStart), ...subtree, ...prevSubtree, ...flat.slice(end)]
  } else {
    // 次の兄弟ノードの部分木を探す
    if (end >= flat.length || flat[end].depth !== item.depth) return flat
    let nextEnd = end + 1
    while (nextEnd < flat.length && flat[nextEnd].depth > item.depth) nextEnd++
    const nextSubtree = flat.slice(end, nextEnd)
    return [...flat.slice(0, i), ...nextSubtree, ...subtree, ...flat.slice(nextEnd)]
  }
}

/** ノード直下の子孫数（削除時に繰り上がる件数） */
function countDescendants(flat: FlatNode[], i: number): number {
  const item = flat[i]
  let j = i + 1
  while (j < flat.length && flat[j].depth > item.depth) j++
  return j - i - 1
}

// ---------------------------------------------------------------------------
// SVG Layout
// ---------------------------------------------------------------------------

// Node has center (x,y), fixed width, variable height, and wrapped lines
type LP = { id: string; label: string; x: number; y: number; w: number; h: number; lines: string[]; children: LP[] }

const NODE_W = 88   // fixed width for non-root nodes
const ROOT_W = 80   // fixed width for root node（テーマ）
const ROOT_FONT = 10
const ROOT_MIN_H = 22
const LINE_H = 13   // px per line
const NODE_PAD_V = 10  // total top+bottom padding
const NODE_RX = 5   // border-radius
const H_GAP = 10    // horizontal gap between right-edge of parent and left-edge of child
const V_GAP = 14    // vertical gap between sibling nodes
const PAD = 20      // outer padding

/** 全角（日本語等）は fontSize 幅、半角は 0.6 倍で計算 */
function charW(ch: string, fontSize: number): number {
  const code = ch.charCodeAt(0)
  const isWide =
    (code >= 0x1100 && code <= 0x11FF) ||  // ハングル
    (code >= 0x2E80 && code <= 0x9FFF) ||  // CJK・ひらがな・カタカナ
    (code >= 0xAC00 && code <= 0xD7AF) ||  // ハングル音節
    (code >= 0xF900 && code <= 0xFAFF) ||  // CJK互換
    (code >= 0xFE10 && code <= 0xFE6F) ||  // 縦書き・小形
    (code >= 0xFF00 && code <= 0xFF60) ||  // 全角英数
    (code >= 0xFFE0 && code <= 0xFFE6)     // 全角記号
  return isWide ? fontSize : fontSize * 0.6
}

function wrapLabel(text: string, w: number, fontSize: number): string[] {
  const label = text || "…"
  const maxW = w - 14  // 左右パディング
  const lines: string[] = []
  let line = ""
  let lineW = 0
  for (const ch of label) {
    const cw = charW(ch, fontSize)
    if (lineW + cw > maxW && line.length > 0) {
      lines.push(line)
      line = ch
      lineW = cw
    } else {
      line += ch
      lineW += cw
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ["…"]
}

function calcSize(label: string, isRoot: boolean): { w: number; h: number; lines: string[] } {
  const w = isRoot ? ROOT_W : NODE_W
  const fontSize = isRoot ? ROOT_FONT : 11
  const lines = wrapLabel(label, w, fontSize)
  const h = Math.max(lines.length * LINE_H + NODE_PAD_V, isRoot ? ROOT_MIN_H : 22)
  return { w, h, lines }
}

/** 編集中は内容に合わせて幅を広げ、折り返し行数分の高さを確保する */
const MAX_EDIT_W = 220

function calcEditSize(label: string, isRoot: boolean): { w: number; h: number; lines: string[] } {
  const fontSize = isRoot ? ROOT_FONT : 11
  const minW = isRoot ? ROOT_W : NODE_W
  const text = label
  let contentW = minW
  let lineW = 0
  for (const ch of text) {
    lineW += charW(ch, fontSize)
    contentW = Math.max(contentW, lineW + 14)
  }
  const w = Math.min(Math.max(minW, contentW), MAX_EDIT_W)
  const lines = wrapLabel(label, w, fontSize)
  const h = Math.max(lines.length * LINE_H + NODE_PAD_V, isRoot ? ROOT_MIN_H : 22)
  return { w, h, lines }
}

// Allocated vertical span for a subtree (used instead of countLeaves * V_SPACING)
function allocH(node: TreeNode, isRoot: boolean): number {
  const ownH = calcSize(node.label, isRoot).h + V_GAP
  if (node.children.length === 0) return ownH
  const childrenH = node.children.reduce((s, c) => s + allocH(c, false), 0)
  // 子孫の合計高さがノード自身の高さより小さい場合はノード自身を基準にする
  return Math.max(childrenH, ownH)
}

function layoutNode(node: TreeNode, depth: number, yStart: number, yEnd: number, isRoot: boolean): LP {
  const { w, h, lines } = calcSize(node.label, isRoot)
  // x is the CENTER of the node; all nodes at same depth share same x → same left edge
  // depth=1 は root 右端 + H_GAP に配置し、以降も H_GAP ずつ均等に広げる
  const x = PAD + (isRoot ? ROOT_W / 2 : ROOT_W + H_GAP + (depth - 1) * (NODE_W + H_GAP) + NODE_W / 2)
  const y = (yStart + yEnd) / 2

  if (node.children.length === 0) {
    return { id: node.id, label: node.label, x, y, w, h, lines, children: [] }
  }
  const childrenTotalH = node.children.reduce((s, c) => s + allocH(c, false), 0)
  const range = yEnd - yStart
  // 子ノード群を親の範囲の中央に揃える（子合計 < 親 allocH の場合は余白を上下均等に）
  const childBlockH = Math.min(range, childrenTotalH)
  let cur = (yStart + yEnd) / 2 - childBlockH / 2
  const childLPs: LP[] = node.children.map(child => {
    const ch = (allocH(child, false) / childrenTotalH) * childBlockH
    const lp = layoutNode(child, depth + 1, cur, cur + ch, false)
    cur += ch
    return lp
  })
  return { id: node.id, label: node.label, x, y, w, h, lines, children: childLPs }
}

function layoutLogicTree(nodes: TreeNode[], rootLabel: string): { root: LP; viewBox: string } {
  const virtual: TreeNode = { id: "__root__", label: rootLabel, children: nodes }
  const totalH = allocH(virtual, true)
  const root = layoutNode(virtual, 0, PAD, PAD + totalH, true)

  const all: LP[] = []
  function collect(n: LP) { all.push(n); n.children.forEach(collect) }
  collect(root)
  const minX = Math.min(...all.map(n => n.x - n.w / 2))
  const maxX = Math.max(...all.map(n => n.x + n.w / 2))
  const minY = Math.min(...all.map(n => n.y - n.h / 2))
  const maxY = Math.max(...all.map(n => n.y + n.h / 2))
  return {
    root,
    viewBox: `${minX - PAD} ${minY - PAD} ${maxX - minX + PAD * 2} ${maxY - minY + PAD * 2}`,
  }
}

function layoutMindmap(nodes: TreeNode[], rootLabel: string): { root: LP; viewBox: string } {
  const MIN_R = 28   // 最小半径
  const NODE_GAP = 14  // ノード間の最小隙間

  /**
   * spread（ラジアン）と子ノード数から、重ならない最小半径を計算する。
   * 弧の長さ ≥ n × (NODE_W + gap) を満たす r を返す。
   */
  function minRadius(n: number, spread: number): number {
    return Math.max(MIN_R, (n * (NODE_W + NODE_GAP)) / Math.max(spread, 0.3))
  }

  function radial(node: TreeNode, x: number, y: number, angle: number, spread: number): LP {
    const { w, h, lines } = calcSize(node.label, false)
    if (node.children.length === 0) {
      return { id: node.id, label: node.label, x, y, w, h, lines, children: [] }
    }
    const n = node.children.length
    const r = minRadius(n, spread)
    // 子ノードごとの扇形の広さ（均等分割、ただし広がりすぎない）
    const childSpread = Math.min(spread / n, (2 * Math.PI) / n * 0.92)
    const childLPs = node.children.map((child, i) => {
      const a = n === 1 ? angle : angle - spread / 2 + (i + 0.5) * (spread / n)
      return radial(child, x + r * Math.cos(a), y + r * Math.sin(a), a, childSpread * n * 0.8)
    })
    return { id: node.id, label: node.label, x, y, w, h, lines, children: childLPs }
  }

  const { w: rw, h: rh, lines: rlines } = calcSize(rootLabel, true)
  const n = nodes.length

  if (n === 0) {
    const root: LP = { id: "__root__", label: rootLabel, x: 0, y: 0, w: rw, h: rh, lines: rlines, children: [] }
    return { root, viewBox: `-${ROOT_W} -40 ${ROOT_W * 2} 80` }
  }

  // 第1階層の半径: 全ノードが円周上で重ならない大きさを確保
  const topSpread = 2 * Math.PI
  const topR = minRadius(n, topSpread)
  const topChildSpread = topSpread / n * 0.85

  const childLPs = nodes.map((node, i) => {
    const angle = n === 1 ? 0 : (2 * Math.PI * i) / n - Math.PI / 2
    return radial(node, topR * Math.cos(angle), topR * Math.sin(angle), angle, topChildSpread)
  })
  const root: LP = { id: "__root__", label: rootLabel, x: 0, y: 0, w: rw, h: rh, lines: rlines, children: childLPs }

  const all: LP[] = []
  function collect(nd: LP) { all.push(nd); nd.children.forEach(collect) }
  collect(root)
  const minX = Math.min(...all.map(nd => nd.x - nd.w / 2))
  const maxX = Math.max(...all.map(nd => nd.x + nd.w / 2))
  const minY = Math.min(...all.map(nd => nd.y - nd.h / 2))
  const maxY = Math.max(...all.map(nd => nd.y + nd.h / 2))
  return {
    root,
    viewBox: `${minX - PAD} ${minY - PAD} ${maxX - minX + PAD * 2} ${maxY - minY + PAD * 2}`,
  }
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

function SvgEdges({ parent, isLogicTree }: { parent: LP; isLogicTree: boolean }): ReactNode {
  const paths: ReactNode[] = []
  function traverse(p: LP) {
    for (const c of p.children) {
      // Logic tree: right-edge of parent → left-edge of child
      const px = isLogicTree ? p.x + p.w / 2 : p.x
      const cx = isLogicTree ? c.x - c.w / 2 : c.x
      const mx = (px + cx) / 2
      paths.push(
        <path
          key={`e-${p.id}-${c.id}`}
          d={`M${px},${p.y} C${mx},${p.y} ${mx},${c.y} ${cx},${c.y}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1.5}
        />
      )
      traverse(c)
    }
  }
  traverse(parent)
  return <>{paths}</>
}

type SvgNodesProps = {
  parent: LP
  svgEditId: string | null
  svgEditValue: string
  svgInputRef: React.RefObject<HTMLTextAreaElement | null>
  hoveredId: string | null
  onNodeClick: (id: string, label: string) => void
  onEditChange: (v: string) => void
  onEditBlur: () => void
  onEditKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCompositionEnd: () => void
  onHover: (id: string | null) => void
  onAddChild: (parentId: string) => void
  onDeleteNode: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onToggleChecked: (id: string) => void
  onToggleHighlighted: (id: string) => void
  flagsById: Record<string, { checked?: boolean; highlighted?: boolean }>
  hasNoChildren: boolean  // root has no child nodes at all
}

function MarkBtn({
  cx, cy, r, active, activeFill, title, onClick, children,
}: {
  cx: number; cy: number; r: number
  active: boolean
  activeFill: string
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <g style={{ cursor: "pointer" }} onClick={e => { e.stopPropagation(); onClick() }}>
      <title>{title}</title>
      <circle
        cx={cx} cy={cy} r={r}
        fill={active ? activeFill : "var(--background)"}
        fillOpacity={active ? 0.35 : 1}
        stroke={active ? activeFill : "var(--border)"}
        strokeWidth={1}
      />
      {children}
    </g>
  )
}

function SvgNodes({
  parent, svgEditId, svgEditValue, svgInputRef, hoveredId,
  onNodeClick, onEditChange, onEditBlur, onEditKeyDown, onCompositionEnd,
  onHover, onAddChild, onDeleteNode, onMoveUp, onMoveDown, onToggleChecked, onToggleHighlighted,
  flagsById, hasNoChildren,
}: SvgNodesProps): ReactNode {
  const els: ReactNode[] = []
  function traverse(n: LP, isRoot: boolean, siblingIdx: number, siblingCount: number) {
    const editing = svgEditId === n.id
    const hovered = hoveredId === n.id && !editing
    const flags = flagsById[n.id] ?? {}
    const checked = !!flags.checked
    const highlighted = !!flags.highlighted
    const { w, h, lines } = editing ? calcEditSize(svgEditValue, isRoot) : { w: n.w, h: n.h, lines: n.lines }
    const fontSize = isRoot ? ROOT_FONT : 11
    const textY = n.y - (lines.length - 1) * LINE_H / 2 + fontSize / 2 - 1
    const btnR = 7
    const markBtnR = 6
    // ボタンをノードに隙間なく接触させることで、ノード→ボタン移動時に onMouseLeave が誤発火しない
    const addBtnX = n.x + w / 2 + btnR
    const delBtnX = n.x - w / 2 - btnR
    const checkBtnY = n.y - h / 2 - markBtnR
    const starBtnY = checkBtnY
    const checkBtnX = n.x - 10
    const starBtnX = n.x + 10
    const canMark = !isRoot && n.id !== "__root__"
    const canMove = !isRoot && n.id !== "__root__"
    const canMoveUp = canMove && siblingIdx > 0
    const canMoveDown = canMove && siblingIdx < siblingCount - 1
    // ×ボタンと同じ x に重ねて上下に配置（隙間ゼロ → ホバーが途切れない）
    const moveBtnX = delBtnX
    const upBtnY = n.y - btnR * 2
    const downBtnY = n.y + btnR * 2

    let nodeFill = isRoot ? "var(--primary)" : "var(--background)"
    let nodeFillOpacity = isRoot ? 0.15 : 1
    let nodeStroke = editing ? "var(--primary)" : hovered ? "var(--primary)" : isRoot ? "var(--primary)" : "var(--border)"
    let nodeStrokeWidth = editing || hovered ? 2 : isRoot ? 1.5 : 1
    if (checked && !isRoot) {
      nodeFill = "var(--muted)"
      nodeFillOpacity = 0.35
      nodeStroke = "var(--muted-foreground)"
      nodeStrokeWidth = 1
    } else if (highlighted && !isRoot) {
      nodeFill = "#f59e0b"
      nodeFillOpacity = 0.22
      nodeStroke = "#d97706"
      nodeStrokeWidth = 2
    }
    const textFill = checked && !isRoot
      ? "var(--muted-foreground)"
      : isRoot ? "var(--primary)" : "var(--foreground)"

    els.push(
      // ホバーイベントを外側 g に集約することで、ノード↔ボタン間移動でも hover が維持される
      <g key={`n-${n.id}`}
        onMouseEnter={() => onHover(n.id)}
        onMouseLeave={() => onHover(null)}
      >
        {/* Node body */}
        <g
          style={{ cursor: editing ? "text" : "pointer" }}
          onClick={() => { if (!editing) onNodeClick(n.id, n.label) }}
        >
          <rect
            x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={NODE_RX}
            fill={nodeFill}
            fillOpacity={nodeFillOpacity}
            stroke={nodeStroke}
            strokeWidth={nodeStrokeWidth}
          />
          {canMark && checked && !editing && (
            <text
              x={n.x - w / 2 + 8} y={n.y - h / 2 + 11}
              fontSize={9} fill="var(--muted-foreground)" fontWeight="700"
              style={{ userSelect: "none", pointerEvents: "none" }}
            >✓</text>
          )}
          {canMark && highlighted && !checked && !editing && (
            <text
              x={n.x + w / 2 - 8} y={n.y - h / 2 + 11}
              textAnchor="end" fontSize={9} fill="#d97706" fontWeight="700"
              style={{ userSelect: "none", pointerEvents: "none" }}
            >★</text>
          )}
          {editing ? (
            <foreignObject x={n.x - w / 2} y={n.y - h / 2} width={w} height={h}>
              <textarea
                ref={svgInputRef}
                value={svgEditValue}
                rows={Math.max(lines.length, 1)}
                onChange={e => onEditChange(e.target.value)}
                onBlur={onEditBlur}
                onKeyDown={onEditKeyDown}
                onCompositionEnd={onCompositionEnd}
                style={{
                  width: "100%", height: "100%",
                  border: "none", background: "transparent",
                  textAlign: "left", fontSize,
                  fontWeight: isRoot ? 600 : 400,
                  outline: "none", padding: "4px 6px",
                  boxSizing: "border-box", color: "var(--foreground)",
                  lineHeight: `${LINE_H}px`,
                  resize: "none", overflow: "hidden",
                  wordBreak: "break-all", whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                }}
              />
            </foreignObject>
          ) : (
            <text
              x={n.x} y={textY} textAnchor="middle"
              fontSize={fontSize} fontWeight={isRoot ? "600" : highlighted ? "600" : "400"}
              fill={textFill}
              opacity={checked && !isRoot ? 0.75 : 1}
              style={{
                userSelect: "none",
                pointerEvents: "none",
                textDecoration: checked && !isRoot ? "line-through" : undefined,
              }}
            >
              {lines.map((line, li) => (
                <tspan key={li} x={n.x} dy={li === 0 ? 0 : LINE_H}>{line}</tspan>
              ))}
            </text>
          )}
        </g>

        {/* ✓ 完了 / ★ ハイライト（ホバー時） */}
        {canMark && hovered && !editing && (
          <>
            <MarkBtn
              cx={checkBtnX} cy={checkBtnY} r={markBtnR}
              active={checked}
              activeFill="var(--muted-foreground)"
              title={checked ? "チェックを外す" : "完了にチェック"}
              onClick={() => onToggleChecked(n.id)}
            >
              <text x={checkBtnX} y={checkBtnY + 3.5} textAnchor="middle"
                fontSize={9} fill={checked ? "var(--foreground)" : "var(--muted-foreground)"}
                style={{ userSelect: "none", pointerEvents: "none", fontWeight: 700 }}
              >✓</text>
            </MarkBtn>
            <MarkBtn
              cx={starBtnX} cy={starBtnY} r={markBtnR}
              active={highlighted}
              activeFill="#d97706"
              title={highlighted ? "ハイライトを外す" : "目立たせる"}
              onClick={() => onToggleHighlighted(n.id)}
            >
              <text x={starBtnX} y={starBtnY + 3.5} textAnchor="middle"
                fontSize={9} fill={highlighted ? "#b45309" : "var(--muted-foreground)"}
                style={{ userSelect: "none", pointerEvents: "none", fontWeight: 700 }}
              >★</text>
            </MarkBtn>
          </>
        )}

        {/* ＋子ノード追加ボタン（ホバー時 or 子ゼロ時に常時表示） */}
        {(hovered || (isRoot && hasNoChildren)) && !editing && (
          <g
            style={{ cursor: "pointer" }}
            onClick={e => { e.stopPropagation(); onAddChild(n.id) }}
          >
            <circle cx={addBtnX} cy={n.y} r={btnR}
              fill="var(--primary)" fillOpacity={0.12}
              stroke="var(--primary)" strokeWidth={1}
            />
            <text x={addBtnX} y={n.y + 4} textAnchor="middle"
              fontSize={11} fill="var(--primary)"
              style={{ userSelect: "none", pointerEvents: "none", fontWeight: 600 }}
            >+</text>
          </g>
        )}

        {/* × 削除ボタン（ホバー時・ルート以外） */}
        {hovered && !editing && !isRoot && (
          <g
            style={{ cursor: "pointer" }}
            onClick={e => { e.stopPropagation(); onDeleteNode(n.id) }}
          >
            <circle cx={delBtnX} cy={n.y} r={btnR}
              fill="var(--destructive, #ef4444)" fillOpacity={0.1}
              stroke="var(--destructive, #ef4444)" strokeWidth={1}
            />
            <text x={delBtnX} y={n.y + 4} textAnchor="middle"
              fontSize={11} fill="var(--destructive, #ef4444)"
              style={{ userSelect: "none", pointerEvents: "none", fontWeight: 600 }}
            >×</text>
          </g>
        )}

        {/* ↑↓ 並べ替えボタン（ホバー時・ルート以外・兄弟あり） */}
        {hovered && !editing && canMoveUp && (
          <g
            style={{ cursor: "pointer" }}
            onClick={e => { e.stopPropagation(); onMoveUp(n.id) }}
          >
            <circle cx={moveBtnX} cy={upBtnY} r={btnR}
              fill="var(--background)" stroke="var(--border)" strokeWidth={1}
            />
            <text x={moveBtnX} y={upBtnY + 3.5} textAnchor="middle"
              fontSize={9} fill="var(--muted-foreground)"
              style={{ userSelect: "none", pointerEvents: "none", fontWeight: 700 }}
            >▲</text>
          </g>
        )}
        {hovered && !editing && canMoveDown && (
          <g
            style={{ cursor: "pointer" }}
            onClick={e => { e.stopPropagation(); onMoveDown(n.id) }}
          >
            <circle cx={moveBtnX} cy={downBtnY} r={btnR}
              fill="var(--background)" stroke="var(--border)" strokeWidth={1}
            />
            <text x={moveBtnX} y={downBtnY + 3.5} textAnchor="middle"
              fontSize={9} fill="var(--muted-foreground)"
              style={{ userSelect: "none", pointerEvents: "none", fontWeight: 700 }}
            >▼</text>
          </g>
        )}
      </g>
    )
    n.children.forEach((child, i) => traverse(child, false, i, n.children.length))
  }
  traverse(parent, true, 0, 1)

  // 子ノードがゼロのとき、ルートの右に案内テキスト
  if (hasNoChildren) {
    const root = parent
    els.push(
      <text
        key="hint"
        x={root.x + root.w / 2 + 22}
        y={root.y + 4}
        fontSize={10}
        fill="var(--muted-foreground)"
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        ＋ で子を追加
      </text>
    )
  }

  return <>{els}</>
}

const TREE_SHORTCUTS: [string, string][] = [
  ["クリック", "ノードを編集"],
  ["Enter", "兄弟を追加"],
  ["Tab", "子を追加"],
  ["＋ / ×", "子追加・削除"],
  ["▲ / ▼", "兄弟間で並べ替え"],
  ["✓ / ★", "完了・目立たせ"],
  ["ドラッグ", "移動"],
  ["Ctrl+ホイール", "拡大・縮小"],
  ["全体", "全体表示"],
  ["2回クリック", "全体表示"],
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  block: TTreeBlock
  themeId: string
  subId: string
  fineId: string
  fineName: string
}

function parseVB(s: string): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = s.split(" ").map(Number)
  return { x, y, w, h }
}

/** コンテナに対する拡大率の上限（viewBox を広げてルートだけのときの巨大表示を防ぐ） */
const MAX_FIT_SCALE = 1.85

function clampViewBoxToMaxScale(
  vb: { x: number; y: number; w: number; h: number },
  containerW: number,
  containerH: number,
  maxScale: number,
): { x: number; y: number; w: number; h: number } {
  if (containerW <= 0 || containerH <= 0 || vb.w <= 0 || vb.h <= 0) return vb
  const scale = Math.min(containerW / vb.w, containerH / vb.h)
  if (scale <= maxScale) return vb
  const factor = scale / maxScale
  const cx = vb.x + vb.w / 2
  const cy = vb.y + vb.h / 2
  const nw = vb.w * factor
  const nh = vb.h * factor
  return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
}

export default function TreeBlock({ block, themeId, subId, fineId, fineName }: Props) {
  const dispatch = useDispatch()

  // SVG inline editing
  const [svgEditId, setSvgEditId] = useState<string | null>(null)
  const [svgEditValue, setSvgEditValue] = useState("")
  const svgInputRef = useRef<HTMLTextAreaElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  // IME制御: compositionend からの経過時間で判定（フラグ方式はイベント順不定で不安定）
  const imeLastEndRef = useRef(0) // compositionend が発火した時刻 (performance.now)

  // Pan / zoom
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [vbOverride, setVbOverride] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; vb: { x: number; y: number; w: number; h: number }; moved: boolean } | null>(null)
  const naturalVBRef = useRef("")
  const prevNodeCountRef = useRef(0)

  useEffect(() => {
    if (svgEditId) setTimeout(() => svgInputRef.current?.focus(), 0)
  }, [svgEditId])

  const rootLabel = block.rootLabel ?? fineName
  const flat = treeToFlat(block.nodes)

  function update(patch: Partial<TTreeBlock>) {
    dispatch({ type: "UPDATE_BLOCK", themeId, subId, fineId, block: { ...block, ...patch } })
  }

  function updateFlat(newFlat: FlatNode[]) {
    update({ nodes: flatToTree(newFlat) })
  }

  // --- SVG inline edit handlers ---
  function svgCommit(id = svgEditId, value = svgEditValue) {
    if (!id) return
    if (id === "__root__") {
      update({ rootLabel: value.trim() || null })
    } else {
      updateFlat(flat.map(n => n.id === id ? { ...n, label: value.trim() } : n))
    }
    setSvgEditId(null)
  }

  function requestDeleteNode(id: string) {
    setDeleteConfirmId(id)
    setHoveredId(null)
  }

  function confirmDeleteNode() {
    if (!deleteConfirmId) return
    const idx = flat.findIndex(n => n.id === deleteConfirmId)
    setDeleteConfirmId(null)
    if (idx === -1) return
    updateFlat(deleteNodePromoteChildren(flat, idx))
  }

  const deleteTargetIdx = deleteConfirmId
    ? flat.findIndex(n => n.id === deleteConfirmId)
    : -1
  const deleteTarget = deleteTargetIdx >= 0 ? flat[deleteTargetIdx] : null
  const deleteDescendantCount = deleteTargetIdx >= 0
    ? countDescendants(flat, deleteTargetIdx)
    : 0

  function handleMoveNode(id: string, dir: "up" | "down") {
    const idx = flat.findIndex(n => n.id === id)
    if (idx === -1) return
    updateFlat(moveNodeInFlat(flat, idx, dir))
  }

  function toggleNodeFlag(id: string, flag: "checked" | "highlighted") {
    updateFlat(flat.map(n => {
      if (n.id !== id) return n
      const next = { ...n, [flag]: !n[flag] }
      if (!next[flag]) delete next[flag]
      return next
    }))
  }

  const flagsById = Object.fromEntries(
    flat.map(n => [n.id, { checked: n.checked, highlighted: n.highlighted }]),
  )

  function handleAddChild(parentId: string) {
    if (parentId === "__root__") {
      // 子ノードをルートの直下に追加
      const newNode: FlatNode = { id: uid(), label: "", depth: 0 }
      updateFlat([...flat, newNode])
      setSvgEditId(newNode.id)
      setSvgEditValue("")
    } else {
      const idx = flat.findIndex(n => n.id === parentId)
      if (idx === -1) return
      const newNode: FlatNode = { id: uid(), label: "", depth: flat[idx].depth + 1 }
      let insertIdx = idx + 1
      while (insertIdx < flat.length && flat[insertIdx].depth > flat[idx].depth) insertIdx++
      const newFlat = [...flat.slice(0, insertIdx), newNode, ...flat.slice(insertIdx)]
      updateFlat(newFlat)
      setSvgEditId(newNode.id)
      setSvgEditValue("")
    }
  }

  function handleSvgNodeClick(id: string, label: string) {
    if (svgEditId) svgCommit()
    setSvgEditId(id)
    setSvgEditValue(id === "__root__" ? (block.rootLabel ?? "") : label)
  }

  function handleSvgKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setSvgEditId(null); return }
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing || performance.now() - imeLastEndRef.current < 100) return
      e.preventDefault()
      if (svgEditId === "__root__") { svgCommit(); return }
      const idx = flat.findIndex(n => n.id === svgEditId)
      if (idx === -1) { svgCommit(); return }
      const committed = flat.map((n, j) => j === idx ? { ...n, label: svgEditValue.trim() } : n)
      const newNode: FlatNode = { id: uid(), label: "", depth: flat[idx].depth }
      const newFlat = [...committed.slice(0, idx + 1), newNode, ...committed.slice(idx + 1)]
      updateFlat(newFlat)
      setSvgEditId(newNode.id)
      setSvgEditValue("")
    } else if (e.key === "Tab") {
      e.preventDefault()
      if (svgEditId === "__root__") return
      const idx = flat.findIndex(n => n.id === svgEditId)
      if (idx === -1) return
      const item = flat[idx]
      const committed = flat.map((n, j) => j === idx ? { ...n, label: svgEditValue.trim() } : n)
      const newNode: FlatNode = { id: uid(), label: "", depth: item.depth + 1 }
      let insertIdx = idx + 1
      while (insertIdx < flat.length && flat[insertIdx].depth > item.depth) insertIdx++
      const newFlat = [...committed.slice(0, insertIdx), newNode, ...committed.slice(insertIdx)]
      updateFlat(newFlat)
      setSvgEditId(newNode.id)
      setSvgEditValue("")
    }
  }

  const { root, viewBox: naturalVB } = block.viewMode === "logictree"
    ? layoutLogicTree(block.nodes, rootLabel)
    : layoutMindmap(block.nodes, rootLabel)

  naturalVBRef.current = naturalVB

  // ノード追加・削除時は全体が収まるよう自動フィット（パン・ズームで見失い防止）
  useEffect(() => {
    const count = flat.length
    if (count !== prevNodeCountRef.current) {
      prevNodeCountRef.current = count
      setVbOverride(null)
    }
  }, [flat.length])

  useEffect(() => {
    setVbOverride(null)
  }, [block.viewMode])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 }
      setContainerSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const naturalParsed = parseVB(naturalVB)

  // コンテンツの自然なアスペクト比に合わせてコンテナ高さを動的に決定
  const MIN_CONTAINER_H = 120
  const MAX_CONTAINER_H = 520
  const targetContainerH = containerSize.w > 0 && naturalParsed.w > 0
    ? Math.round(naturalParsed.h * (containerSize.w / naturalParsed.w))
    : naturalParsed.h > 0 ? naturalParsed.h + 40 : 160
  const containerH = Math.max(MIN_CONTAINER_H, Math.min(MAX_CONTAINER_H, targetContainerH + 32))

  const fittedVB = clampViewBoxToMaxScale(
    naturalParsed,
    containerSize.w,
    containerH,
    MAX_FIT_SCALE,
  )
  const fittedVBRef = useRef(fittedVB)
  fittedVBRef.current = fittedVB

  // Ctrl/Cmd+ホイールのみズーム（通常ホイールはペインのスクロールに任せる）
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      const rect = el.getBoundingClientRect()
      const factor = e.deltaY > 0 ? 1.12 : 0.88
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      setVbOverride(prev => {
        const vb = prev ?? fittedVBRef.current
        const ax = vb.x + (cx / rect.width) * vb.w
        const ay = vb.y + (cy / rect.height) * vb.h
        return {
          x: ax - (ax - vb.x) * factor,
          y: ay - (ay - vb.y) * factor,
          w: vb.w * factor,
          h: vb.h * factor,
        }
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  const currentVB = vbOverride ?? fittedVB
  const vbString = `${currentVB.x} ${currentVB.y} ${currentVB.w} ${currentVB.h}`

  function applyZoom(factor: number, cx?: number, cy?: number) {
    const vb = baseVB()
    const svgEl = svgRef.current
    const rect = svgEl?.getBoundingClientRect()
    // zoom anchor in SVG coordinates (default: center)
    const ax = cx !== undefined && rect ? vb.x + (cx / rect.width) * vb.w : vb.x + vb.w / 2
    const ay = cy !== undefined && rect ? vb.y + (cy / rect.height) * vb.h : vb.y + vb.h / 2
    const newW = vb.w * factor
    const newH = vb.h * factor
    setVbOverride({
      x: ax - (ax - vb.x) * factor,
      y: ay - (ay - vb.y) * factor,
      w: newW,
      h: newH,
    })
  }

  function fitAll() {
    setVbOverride(null) // fittedVB（最大拡大率込み）に戻す
  }

  function baseVB() {
    return vbOverride ?? fittedVB
  }

  function handleDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (svgEditId || dragRef.current?.moved) return
    e.stopPropagation()
    fitAll()
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (svgEditId || e.button !== 0) return
    const vb = baseVB()
    dragRef.current = { startX: e.clientX, startY: e.clientY, vb, moved: false }
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = (e.clientX - dragRef.current.startX) / rect.width * dragRef.current.vb.w
    const dy = (e.clientY - dragRef.current.startY) / rect.height * dragRef.current.vb.h
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true
    setVbOverride({ ...dragRef.current.vb, x: dragRef.current.vb.x - dx, y: dragRef.current.vb.y - dy })
  }

  function handleMouseUp() { dragRef.current = null }

  return (
    <div className="space-y-2">
      {/* Header: view toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline" size="sm"
          className="h-6 px-2 text-[10px] gap-1 shrink-0"
          onClick={() => update({ viewMode: block.viewMode === "logictree" ? "mindmap" : "logictree" })}
        >
          {block.viewMode === "logictree"
            ? <><GitBranch className="h-3 w-3" /> ロジックツリー</>
            : <><Network className="h-3 w-3" /> マインドマップ</>}
        </Button>
      </div>

      {/* SVG visualization — primary editing surface */}
      <div
        ref={containerRef}
        className={`rounded-md border bg-background relative${svgEditId ? "" : " overflow-hidden"}`}
        style={{ height: containerH }}
        onClick={() => { if (svgEditId) svgCommit() }}
      >
        <svg
          ref={svgRef}
          width="100%" height="100%"
          viewBox={vbString}
          preserveAspectRatio="xMidYMid meet"
          style={{ cursor: dragRef.current?.moved ? "grabbing" : "grab", overflow: svgEditId ? "visible" : "hidden" }}
          onClick={e => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <SvgEdges parent={root} isLogicTree={block.viewMode === "logictree"} />
          <SvgNodes
            parent={root}
            svgEditId={svgEditId}
            svgEditValue={svgEditValue}
            svgInputRef={svgInputRef}
            hoveredId={hoveredId}
            onNodeClick={(id, label) => { if (!dragRef.current?.moved) handleSvgNodeClick(id, label) }}
            onEditChange={setSvgEditValue}
            onEditBlur={() => svgCommit()}
            onEditKeyDown={handleSvgKeyDown}
            onCompositionEnd={() => { imeLastEndRef.current = performance.now() }}
            onHover={setHoveredId}
            onAddChild={handleAddChild}
            onDeleteNode={requestDeleteNode}
            onMoveUp={id => handleMoveNode(id, "up")}
            onMoveDown={id => handleMoveNode(id, "down")}
            onToggleChecked={id => toggleNodeFlag(id, "checked")}
            onToggleHighlighted={id => toggleNodeFlag(id, "highlighted")}
            flagsById={flagsById}
            hasNoChildren={flat.length === 0}
          />
        </svg>
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          <Popover>
            <PopoverTrigger
              className="pointer-events-auto h-6 w-6 rounded border bg-background/90 text-muted-foreground flex items-center justify-center hover:bg-muted hover:text-foreground shadow-sm"
              title="操作のヒント"
              onClick={e => e.stopPropagation()}
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2.5" align="start" side="top">
              <ul className="space-y-1">
                {TREE_SHORTCUTS.map(([key, label]) => (
                  <li key={key} className="text-[10px] text-muted-foreground flex gap-1.5 items-baseline">
                    <kbd className="bg-muted px-1 rounded text-[9px] font-mono shrink-0">{key}</kbd>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          <div className="pointer-events-auto flex gap-1">
            <button
              type="button"
              className="h-6 w-6 rounded border bg-background/90 text-xs flex items-center justify-center hover:bg-muted shadow-sm"
              onClick={() => applyZoom(0.75)}
              title="ズームイン"
            >+</button>
            <button
              type="button"
              className="h-6 w-6 rounded border bg-background/90 text-xs flex items-center justify-center hover:bg-muted shadow-sm"
              onClick={() => applyZoom(1.33)}
              title="ズームアウト"
            >−</button>
            <button
              type="button"
              className="h-6 px-1.5 rounded border bg-background/90 text-[10px] flex items-center justify-center hover:bg-muted shadow-sm font-medium"
              onClick={fitAll}
              title="全体表示"
            >全体</button>
          </div>
        </div>
      </div>

      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={open => { if (!open) setDeleteConfirmId(null) }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="text-sm">ノードを削除</DialogTitle>
          <DialogDescription>
            「{deleteTarget?.label.trim() || "（無題）"}」を削除しますか？
          </DialogDescription>
          {deleteDescendantCount > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              直下の子ノード {deleteDescendantCount} 件は1段上に繰り上がります（その下の孫以下は残ります）。
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteNode}>
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
