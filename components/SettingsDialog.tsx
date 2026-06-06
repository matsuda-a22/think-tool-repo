"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, Eye, EyeOff } from "lucide-react"

export const GEMINI_KEY_STORAGE = "think-tool-gemini-key"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function SettingsDialog({ open, onOpenChange }: Props) {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    if (open) {
      setKey(localStorage.getItem(GEMINI_KEY_STORAGE) ?? "")
    }
  }, [open])

  function save() {
    const trimmed = key.trim()
    if (trimmed) {
      localStorage.setItem(GEMINI_KEY_STORAGE, trimmed)
    } else {
      localStorage.removeItem(GEMINI_KEY_STORAGE)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-center justify-between mb-4">
          <DialogTitle>設定</DialogTitle>
          <DialogClose className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        <DialogDescription className="mb-4">
          AI提案機能に使用する Gemini API キーを設定します。
          キーはこのブラウザの localStorage に保存されます。
        </DialogDescription>

        <div className="space-y-3">
          <Label htmlFor="gemini-key" className="text-sm font-medium">
            Gemini API キー
          </Label>
          <div className="flex gap-2">
            <Input
              id="gemini-key"
              type={showKey ? "text" : "password"}
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="AIza..."
              className="flex-1 font-mono text-xs"
              onKeyDown={e => e.key === "Enter" && save()}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setShowKey(v => !v)}
              type="button"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Google AI Studio
            </a>{" "}
            で無料取得できます
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <DialogClose className="inline-flex items-center justify-center h-8 px-3 rounded-md border text-sm font-medium hover:bg-muted transition-colors">
            キャンセル
          </DialogClose>
          <Button size="sm" onClick={save}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
