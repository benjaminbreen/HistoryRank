import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-transparent">
      <header className="hr-header sticky top-0 z-50 border-b border-stone-200 py-4">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full border border-stone-300 bg-stone-50 text-stone-800 flex items-center justify-center font-serif text-xs tracking-wide">
                HR
              </div>
              <div className="font-serif font-semibold text-stone-900 text-xl">
                HistoryRank
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" className="text-sm text-stone-600 hover:text-stone-900 px-2 py-1">
                Table
              </Link>
              <Link href="/scatter" className="text-sm text-stone-600 hover:text-stone-900 px-2 py-1">
                Scatter
              </Link>
              <span className="px-3 py-1.5 text-sm rounded-full bg-stone-900 text-white">
                About
              </span>
              <Link
                href="/methodology"
                className="text-sm text-stone-600 hover:text-stone-900 px-2 py-1"
              >
                Methodology
              </Link>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Open settings">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[320px] bg-stone-50">
                  <SheetHeader>
                    <SheetTitle className="font-serif text-stone-900">Settings</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 rounded-md border border-stone-200 bg-white p-3 text-sm text-stone-600">
                    Settings will live here (display, data filters, exports).
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
      <section className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-serif font-semibold text-stone-900">About</h1>
        <p className="mt-3 text-stone-600">
          This page will explain the goals of HistoryRank, the datasets we compare,
          and how to interpret the results.
        </p>
      </section>
    </main>
  );
}
