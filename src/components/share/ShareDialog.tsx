"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
};

type ShareOption = {
  label: string;
  href: string;
  hint?: string;
  badge?: string;
};

export function ShareDialog({ open, onOpenChange, url, title }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const shareTitle = title || "HistoryRank";

  const options = useMemo<ShareOption[]>(() => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(shareTitle);
    const encodedText = encodeURIComponent(`${shareTitle} ${url}`);

    return [
      {
        label: "Email",
        href: `mailto:?subject=${encodedTitle}&body=${encodedText}`,
        hint: "Draft an email",
      },
      {
        label: "Reddit",
        href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
        badge: "R",
      },
      {
        label: "X",
        href: `https://x.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
        badge: "X",
      },
      {
        label: "Bluesky",
        href: `https://bsky.app/intent/compose?text=${encodedText}`,
        badge: "B",
      },
      {
        label: "WhatsApp",
        href: `https://wa.me/?text=${encodedText}`,
        badge: "WA",
      },
      {
        label: "iMessage",
        href: `sms:?&body=${encodedText}`,
        badge: "SMS",
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/",
        hint: "Paste the link",
        badge: "IG",
      },
    ];
  }, [shareTitle, url]);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy share URL:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl border-stone-200/70 bg-white/95 p-6 shadow-xl backdrop-blur dark:border-amber-900/30 dark:bg-slate-950/95">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif text-stone-900 dark:text-amber-100">
            Share
          </DialogTitle>
          <DialogDescription className="text-sm text-stone-600 dark:text-slate-400">
            Share this link using your preferred channel.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 rounded-2xl border border-stone-200/70 bg-white/80 px-4 py-3 text-xs text-stone-600 shadow-sm dark:border-amber-900/30 dark:bg-slate-900/50 dark:text-slate-300">
          <div className="truncate">{url || "No share link available."}</div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {options.map((option) => (
            <a
              key={option.label}
              href={option.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-stone-200/70 bg-white/80 px-4 py-3 text-sm text-stone-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:text-stone-900 hover:shadow-md dark:border-amber-900/30 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-amber-700/60 dark:hover:text-amber-100"
            >
              <div>
                <div className="font-medium">{option.label}</div>
                {option.hint && (
                  <div className="text-xs text-stone-500 dark:text-slate-500">{option.hint}</div>
                )}
              </div>
              {option.badge && (
                <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-500 transition-colors group-hover:border-stone-300 group-hover:text-stone-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:group-hover:text-amber-200">
                  {option.badge}
                </span>
              )}
            </a>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:text-stone-900 hover:shadow-md dark:border-amber-900/30 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-700/60 dark:hover:text-amber-100"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <span className="text-xs text-stone-500 dark:text-slate-500">
            Link opens the exact filtered view or figure detail.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
