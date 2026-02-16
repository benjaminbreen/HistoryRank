'use client';

import { useState, useEffect } from 'react';
import { Instrument_Sans } from 'next/font/google';
import { AppHeader } from '@/components/layout/AppHeader';
import { useSettings } from '@/hooks/useSettings';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const ABOUT_SECTIONS = [
  ['overview', 'Overview'],
  ['aims', 'Aims'],
  ['how', 'How to read the list'],
  ['prompts', 'Prompt'],
  ['cite', 'How to cite'],
  ['team', 'Project team'],
  ['future', 'Future work'],
];

export default function AboutPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );
    for (const [id] of ABOUT_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="about"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <section className={`${instrument.className} max-w-6xl mx-auto px-6 py-12`}>
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl border border-stone-200/70 dark:border-amber-900/30 bg-white/70 dark:bg-slate-800/70 p-4 text-sm text-stone-600 dark:text-slate-300 shadow-sm backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-amber-500/80">
                About
              </div>
              <nav className="mt-4 space-y-1">
                {ABOUT_SECTIONS.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className={`block rounded-lg px-2 py-1 transition-colors ${
                      activeSection === id
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 font-medium'
                        : 'text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-700/50 hover:text-stone-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="space-y-12 text-base leading-7 text-stone-700 dark:text-slate-300">
            <header>
              <h1 className="text-3xl font-serif font-semibold text-stone-900 dark:text-amber-100">About</h1>
              <p className="mt-3 text-base text-stone-600 dark:text-slate-400">
                HistoryRank is a research project that uses large language models (LLMs) to create ranked lists
                of historically influential figures. The point is not to declare a definitive canon, but to
                surface the assumptions and biases that different models bring to a shared, explicit rubric.
              </p>
            </header>

            <section id="overview" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-amber-100">Overview</h2>
              <p className="mt-3">
                The dataset blends academic historiometry (MIT Pantheon), public attention (Wikipedia pageviews),
                and model-generated rankings. The consensus list is a model-conditioned view of historical
                importance, not a final verdict. The research value lies in the disagreements, omissions, and
                contrasts between models.
              </p>
            </section>

            <section id="aims" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-amber-100">Aims</h2>
              <p className="mt-3">
                The project has two intertwined goals. First, to build a public-facing resource for exploring
                global history at scale. Second, to use the “top 1,000” task as a benchmark for AI interpretability:
                how models express values, weight evidence, and explain their choices when faced with a complex,
                contested question.
              </p>
            </section>

            <section id="how" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-amber-100">How to read the list</h2>
              <p className="mt-3">
                Each model is asked to follow the same instructions. Rankings are averaged within a model,
                then combined across models. If a model omits a figure, that omission is treated as rank 1001,
                which keeps coverage explicit and discourages two-model outliers from dominating the consensus.
              </p>
              <p className="mt-3">
                The detail panel reveals the model’s own explanation for a figure’s significance. These
                explanations are the core interpretive layer: they show what the model thinks matters, and
                how it summarizes historical influence.
              </p>
            </section>

            <section id="prompts" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-amber-100">Prompt</h2>
              <p className="mt-3">
                Each model receives the same prompt. It is intentionally minimal — no numeric scoring rubric,
                no sub-metrics to optimize — so models must rely on their own internalized sense of historical weight.
              </p>
              <div className="mt-6">
                <div className="rounded-2xl border border-stone-200/70 dark:border-amber-900/30 bg-white dark:bg-slate-800/60 p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-stone-900 dark:text-amber-200">Current prompt</h3>
                  <pre className="mt-3 whitespace-pre-wrap text-sm text-stone-700 dark:text-slate-300">{`Role: You are a senior historian and data scientist specializing in historiometry.
Task: Generate a ranked list of the 500 most influential historical individuals in world history.

Judgment criteria (open-ended, no numeric scoring):
- Breadth: scope of influence (local → global)
- Depth: degree of structural change to institutions, knowledge systems, or mass behavior
- Longevity: persistence or projected endurance of impact

Admissibility rules (strict):
- Individuals only (no groups, movements, dynasties, corporations, bands, collectives).
- Historically attested persons only; exclude purely legendary/uncertain figures.
- Use standard, widely recognized name forms.
- No duplicates.

Clustering guidance: Avoid long consecutive runs of the same profession/domain/role (6+ in a row).

Output format (JSON only):
{"rank": integer, "name": "string", "primary_contribution": "string"}`}
                  </pre>
                </div>
              </div>
            </section>

            <section id="cite" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-amber-100">How to cite</h2>
              <p className="mt-3 dark:text-slate-300">
                If you use HistoryRank data or findings in your work, please cite it as follows:
              </p>
              <div className="mt-4 rounded-2xl border border-stone-200/70 dark:border-amber-900/30 bg-white dark:bg-slate-800/60 p-5 shadow-sm">
                <div className="text-sm text-stone-700 dark:text-slate-300 font-mono leading-relaxed">
                  Breen, Benjamin. &ldquo;HistoryRank: Comparing Historical Importance across Academic Rankings, Wikipedia Attention, and AI Assessments.&rdquo; UC Santa Cruz, 2025&ndash;2026. https://historyrank.org.
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      'Breen, Benjamin. "HistoryRank: Comparing Historical Importance across Academic Rankings, Wikipedia Attention, and AI Assessments." UC Santa Cruz, 2025–2026. https://historyrank.org.'
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 underline underline-offset-2 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy citation'}
                </button>
              </div>
              <p className="mt-3 text-sm text-stone-500 dark:text-slate-400">
                For BibTeX users:
              </p>
              <pre className="mt-2 rounded-xl border border-stone-200/70 dark:border-amber-900/30 bg-stone-50 dark:bg-slate-800/80 p-4 text-xs text-stone-700 dark:text-slate-300 overflow-x-auto">{`@misc{breen2025historyrank,
  author = {Breen, Benjamin},
  title  = {HistoryRank: Comparing Historical Importance across
            Academic Rankings, Wikipedia Attention, and AI Assessments},
  year   = {2025--2026},
  url    = {https://historyrank.org},
  note   = {UC Santa Cruz}
}`}</pre>
            </section>

            <section id="team" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-amber-100">Project team</h2>
              <p className="mt-3 text-stone-700 dark:text-slate-300">
                Currently just Benjamin Breen, associate professor of history at UC Santa Cruz - but looking
                to collaborate with other historians, data scientists, etc! Please contact me
                {' '}<a className="text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300" href="mailto:bebreen@ucsc.edu">bebreen@ucsc.edu</a> to discuss more.
              </p>
              <div className="mt-4 rounded-2xl border border-stone-200/70 dark:border-amber-900/30 bg-white/80 dark:bg-slate-800/50 p-4 text-sm text-stone-600 dark:text-slate-400 shadow-sm">
                Interested in contributing? Reach out with ideas for multilingual sampling, historiometric
                datasets, or visualization experiments.
              </div>
            </section>

            <section id="future" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900 dark:text-amber-100">Future work</h2>
              <p className="mt-3 text-stone-600 dark:text-slate-400">
                We plan to run controlled prompt variants to test how specific instructions shape the lists.
                We also plan to extend the benchmark across languages (Arabic, Farsi, Mandarin, Russian, French,
                Spanish, and Hindi) to study how language context shifts model output and temporal coverage.
              </p>
              <p className="mt-3 text-stone-600 dark:text-slate-400">
                Diagnostic metrics will include within-model stability across samples, rank-correlation
                comparisons across models and languages, and direct comparisons with external reference
                datasets such as Pantheon HPI and Wikipedia pageviews.
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
