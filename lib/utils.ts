import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Store, SubTheme, MonthlyCost, SubThemeCostSummary } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STAKEHOLDER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
]

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function accumulateCosts(subTheme: SubTheme): MonthlyCost[] {
  const map = new Map<string, number>()

  for (const entry of subTheme.entries) {
    for (const c of entry.costs) {
      const key = `${c.year}-${c.month}`
      map.set(key, (map.get(key) ?? 0) + c.amount)
    }
  }

  return Array.from(map.entries())
    .map(([key, amount]) => {
      const [y, m] = key.split("-").map(Number)
      return { year: y, month: m, amount }
    })
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
}

export function computeCostSummary(store: Store): {
  bySubTheme: SubThemeCostSummary[]
  overall: MonthlyCost[]
} {
  const bySubTheme: SubThemeCostSummary[] = []
  const overallMap = new Map<string, number>()

  for (const theme of store.themes) {
    for (const sub of theme.subThemes) {
      const monthly = accumulateCosts(sub)
      if (monthly.length > 0) {
        bySubTheme.push({ subThemeName: sub.name, monthly })
      }
      for (const mc of monthly) {
        const key = `${mc.year}-${mc.month}`
        overallMap.set(key, (overallMap.get(key) ?? 0) + mc.amount)
      }
    }
  }

  const overall: MonthlyCost[] = Array.from(overallMap.entries())
    .map(([key, amount]) => {
      const [y, m] = key.split("-").map(Number)
      return { year: y, month: m, amount }
    })
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  return { bySubTheme, overall }
}
