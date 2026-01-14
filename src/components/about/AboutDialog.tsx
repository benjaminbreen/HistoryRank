'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#faf9f7]">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-stone-900">About HistoryRank</DialogTitle>
          <DialogDescription className="text-stone-600">
            Comparing historical importance across human and machine ranking systems
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-stone-700 leading-relaxed">
          <p>
            HistoryRank is an experimental tool for comparing how different sources evaluate historical significance.
            We combine data from academic rankings, Wikipedia metrics, and AI assessments to reveal interesting
            patterns in how we collectively remember the past.
          </p>
          <div className="p-4 bg-white rounded-lg border border-stone-200">
            <h4 className="font-medium text-stone-900 mb-2">Data Sources</h4>
            <ul className="space-y-1.5 text-stone-600">
              <li className="flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">•</span>
                <span><strong>MIT Pantheon</strong> — Academic historical importance index</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">•</span>
                <span><strong>Wikipedia</strong> — Pageviews and article metrics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">•</span>
                <span><strong>Claude & Gemini</strong> — AI model assessments</span>
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
