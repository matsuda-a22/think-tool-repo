"use client"

import { useRef, useState } from "react"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, Upload, BrainCircuit, Settings } from "lucide-react"
import { useExportImport, useSelectedSubTheme } from "@/lib/store"
import PaneTheme from "./PaneTheme"
import PaneWriteOut from "./PaneWriteOut"
import PaneActions from "./PaneActions"
import PaneSources from "./PaneSources"
import SettingsDialog from "./SettingsDialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

function SubThemeBar() {
  const { sub, themeName } = useSelectedSubTheme()
  if (!sub) return null
  return (
    <div className="px-4 py-1.5 bg-primary/5 border-b shrink-0 flex items-center gap-2 min-w-0">
      <span className="text-sm font-semibold text-foreground shrink-0">{themeName}</span>
      <span className="text-sm text-muted-foreground shrink-0">›</span>
      <span className="text-sm font-semibold text-foreground truncate">{sub.name}</span>
      {sub.stakeholders.map(st => (
        <Badge
          key={st.id}
          style={{ backgroundColor: st.color, color: "#fff" }}
          className="text-[10px] py-0 px-1.5 shrink-0"
        >
          {st.name}
        </Badge>
      ))}
    </div>
  )
}

export default function ThinkTool() {
  const { exportJson, importJson } = useExportImport()
  const fileRef = useRef<HTMLInputElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const pendingFileRef = useRef<File | null>(null)

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <header className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0">
        <BrainCircuit className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm mr-auto">思考整理ツール</span>
        <Button variant="outline" size="sm" onClick={exportJson}>
          <Download className="h-3.5 w-3.5 mr-1" />
          エクスポート
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" />
          インポート
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-3.5 w-3.5 mr-1" />
          設定
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) {
              pendingFileRef.current = f
              setImportConfirmOpen(true)
            }
            e.target.value = ""
          }}
        />
        <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogTitle className="text-sm">データをインポート</DialogTitle>
            <DialogDescription>
              「{pendingFileRef.current?.name}」を読み込むと、現在のデータがすべて置き換えられます。この操作は取り消せません。
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => { setImportConfirmOpen(false); pendingFileRef.current = null }}>
                キャンセル
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (pendingFileRef.current) importJson(pendingFileRef.current)
                  pendingFileRef.current = null
                  setImportConfirmOpen(false)
                }}
              >
                インポート
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {/* 共有ブレッドクラムバー（ペイン②③④共通） */}
      <SubThemeBar />

      {/* 4-pane layout */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* ① テーマ */}
        <ResizablePanel defaultSize="18%" minSize="12%">
          <PaneTheme />
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* ② 書き出し */}
        <ResizablePanel defaultSize="34%" minSize="20%">
          <PaneWriteOut />
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* ③ 決定・アクション */}
        <ResizablePanel defaultSize="24%" minSize="16%">
          <PaneActions />
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* ④ 情報ソース */}
        <ResizablePanel defaultSize="24%" minSize="16%">
          <PaneSources />
        </ResizablePanel>
      </ResizablePanelGroup>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
