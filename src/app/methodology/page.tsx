import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

export default function MethodologyPage() {
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
              <Link href="/about" className="text-sm text-stone-600 hover:text-stone-900 px-2 py-1">
                About
              </Link>
              <span className="px-3 py-1.5 text-sm rounded-full bg-stone-900 text-white">
                Methodology
              </span>
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
        <h1 className="text-3xl font-serif font-semibold text-stone-900">Methodology</h1>
        <div className="mt-4 space-y-6 text-stone-700">
          <p>
            HistoryRank combines LLM-generated top-1000 lists with academic and public attention signals
            (MIT Pantheon HPI and Wikipedia pageviews). The goal is not a single definitive list, but a
            transparent benchmark for how different models weigh historical importance.
          </p>
          <div>
            <h2 className="text-lg font-semibold text-stone-900">LLM consensus ranking</h2>
            <p className="mt-2">
              Each model provides a ranked list of 1,000 figures. For each figure, we compute that model&apos;s
              average rank across its samples. If a model omits a figure, we treat that omission as rank 1001
              (i.e., below the top-1000 cutoff). The consensus rank is the mean across all models, with
              missing entries explicitly penalized. This prevents two-model outliers from dominating the
              combined list and reflects the implicit judgment of omission.
            </p>
            <p className="mt-2">
              Variance is calculated as the coefficient of variation across the padded model ranks,
              highlighting disagreement when models diverge or omit a figure entirely.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Name reconciliation</h2>
            <p className="mt-2">
              Names from LLM outputs are normalized and mapped to canonical figure IDs via alias tables
              (for example: &quot;Siddhartha Gautama&quot; → &quot;Gautama Buddha&quot;). When duplicates slip through,
              manual merges consolidate records so a figure is represented once.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Geography and metadata</h2>
            <p className="mt-2">
              Birthplaces, regions, and page metadata are sourced from Wikipedia/Wikidata when available,
              supplemented by manual fixes for edge cases. Regions are stable across eras to support
              cross-temporal comparisons and mapping.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
