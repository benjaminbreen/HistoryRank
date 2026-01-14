"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type ListEntry = {
  file: string;
  label: string;
  size: number;
  downloadUrl: string;
};

type ListPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ListEntry | null;
};

export function ListPreviewDialog({ open, onOpenChange, entry }: ListPreviewDialogProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !entry) return;
    let active = true;
    const fetchContent = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(entry.downloadUrl);
        const text = await res.text();
        if (active) setContent(text);
      } catch (error) {
        if (active) setContent("Failed to load list.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchContent();
    return () => {
      active = false;
    };
  }, [entry, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-3xl border-stone-200/70 bg-white/95 p-6 shadow-xl backdrop-blur dark:border-amber-900/30 dark:bg-slate-950/95">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif text-stone-900 dark:text-amber-100">
            {entry?.file || "List preview"}
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-600 dark:text-slate-400">
            Full raw list output.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="text-xs text-stone-500 dark:text-slate-500">
            {entry?.label || "Unknown model"} · {entry ? (entry.size / 1024).toFixed(1) : "0.0"} KB
          </div>
          {entry && (
            <a
              href={entry.downloadUrl}
              className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:text-stone-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-600/60 dark:hover:text-amber-100"
            >
              Download
            </a>
          )}
        </div>

        <ScrollArea className="mt-4 h-[60vh] rounded-2xl border border-stone-200/70 bg-stone-50/60 p-4 text-xs text-stone-700 dark:border-amber-900/30 dark:bg-slate-900/60 dark:text-slate-200">
          {isLoading ? "Loading..." : content}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
