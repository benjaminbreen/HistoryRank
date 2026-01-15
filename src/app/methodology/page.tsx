'use client';

import { Instrument_Sans } from 'next/font/google';
import { useSettings } from '@/hooks/useSettings';
import { AppHeader } from '@/components/layout/AppHeader';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export default function MethodologyPage() {
  const { settings, updateSettings, resetSettings } = useSettings();

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="methodology"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <section className={`${instrument.className} max-w-6xl mx-auto px-6 py-12`}>
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl border border-stone-200/70 bg-white/70 p-4 text-sm text-stone-600 shadow-sm backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                Methodology
              </div>
              <nav className="mt-4 space-y-2">
                {[
                  ['overview', 'Overview'],
                  ['goals', 'Goals'],
                  ['sources', 'Data sources'],
                  ['prompt', 'Core prompt'],
                  ['ranking', 'Ranking method'],
                  ['variance', 'Variance + disagreement'],
                  ['reconciliation', 'Name reconciliation'],
                  ['metadata', 'Geography + metadata'],
                  ['interpretation', 'Interpretation'],
                  ['limitations', 'Limitations'],
                  ['roadmap', 'Roadmap'],
                  ['future-work', 'Future work'],
                ].map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="block rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="space-y-10 text-[15.5px] leading-relaxed text-stone-700">
            <header>
              <h1 className="text-3xl font-serif font-semibold text-stone-900">Methodology</h1>
              <p className="mt-3 text-base text-stone-600">
                HistoryRank is both a historical resource and a living experiment in how large language models
                (LLMs) reason about historical importance. The project blends academic, public attention, and
                model-generated signals to make the assumptions behind “importance” visible and debatable.
              </p>
            </header>

            <section id="overview" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Overview</h2>
              <p className="mt-3">
                The dataset combines three perspectives: academic historiometry (MIT Pantheon), public attention
                (Wikipedia pageviews), and model judgments (LLM rankings and explanations). The resulting list is
                not a claim to a final truth. It is a benchmark that shows how different sources agree or disagree,
                where omissions occur, and which figures are contested.
              </p>
            </section>

            <section id="goals" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Goals</h2>
              <p className="mt-3">
                This project has two intertwined aims. First, to offer a public, readable reference for learning
                about history at scale. Second, to use the “top 1,000” task as a probe into model behavior: what
                do LLMs remember, overlook, or exaggerate when asked to weigh human impact across centuries?
              </p>
              <p className="mt-3">
                Choosing the 1,000 most influential people is inherently value-laden and historically contingent.
                That is precisely why it is a useful test: the models must reveal (and justify) their implicit
                criteria in the descriptions shown in each figure’s detail panel.
              </p>
            </section>

            <section id="sources" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Data sources</h2>
              <div className="mt-3 space-y-3">
                <p>
                  <strong>MIT Pantheon (HPI).</strong> A historiometric ranking built from Wikipedia biography
                  data (language coverage, article length, and other factors).
                </p>
                <p>
                  <strong>Wikipedia pageviews.</strong> 2025 annual pageviews act as a proxy for public attention.
                </p>
                <p>
                  <strong>LLM rankings.</strong> Multiple models each produce ranked lists of 1,000 figures using
                  a shared prompt and format. Each entry includes a brief explanation of the figure’s importance.
                </p>
              </div>
            </section>

            <section id="prompt" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Core prompt (current)</h2>
              <p className="mt-3">
                Every list is generated with the same prompt to maintain comparability. This prompt is reused
                verbatim across models.
              </p>
              <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-stone-200/70 bg-white p-4 text-[13px] text-stone-700 shadow-sm">
{`Role: You are a senior historian and data scientist specializing in "Historiometry"—the statistical analysis of historical data. Task: Generate a ranked list of the 1,000 most influential figures in world history. Ranking Criteria: "Importance" must be calculated based on the following three metrics: Breadth: The geographic extent of their influence (Global vs. Regional). Depth: The degree to which they fundamentally altered human behavior, thought, or the state of the world. Longevity: The duration of their impact across centuries. Strict Constraints to Prevent Clustering: No Categorical Grouping: Do not group figures by profession, era, or nationality. This is a singular, linear competition of impact. For example, if rank #450 is a scientist and #451 is a poet, it must be because the scientist’s total score marginally exceeds the poet’s, not because you are listing "famous scientists" and then "famous poets." Linear Degradation: The list must represent a true descending order of influence. Rank #1 must be demonstrably more influential than #100, and #500 more than #1000. Global Balance: Ensure the list reflects major figures based on what you determine to be their objective historical weight, not just fame in one culture or region. Output Format: Provide the data in a raw JSON array of objects. Each object must contain: {"rank": integer, "name": "string", "primary_contribution": "string"} Technical Instruction: Do not include introductory or concluding conversational text—output the JSON block only. output the FULL list with no duplicates.`}
              </pre>
            </section>

            <section id="ranking" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Ranking method</h2>
              <p className="mt-3">
                Each model contributes multiple lists. We average ranks within a model, then compute a consensus
                rank across models. If a model omits a figure, that omission is treated as rank 1001 (just below
                the top 1,000 cutoff). This prevents two-model outliers from dominating and captures the implicit
                judgment that a missing figure is less important than any ranked entry.
              </p>
              <div className="mt-4 rounded-2xl border border-amber-200/60 bg-amber-50/70 p-4 text-sm text-amber-900">
                <strong>Current sampling:</strong> 5 lists per model. This is the baseline. The near-term goal
                is 10 lists per model to reduce variance and prompt sensitivity.
              </div>
            </section>

            <section id="variance" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Variance and disagreement</h2>
              <p className="mt-3">
                Variance is calculated across the padded model ranks (including 1001 for omissions). High variance
                indicates contested figures, sparse agreement, or strong model disagreement. These are often the
                most interesting cases, revealing how differently models weigh ideology, scientific innovation,
                or cultural legacy.
              </p>
            </section>

            <section id="reconciliation" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Name reconciliation</h2>
              <p className="mt-3">
                Model outputs vary in spelling, honorifics, and transliteration. Names are normalized and mapped
                to canonical figure IDs via alias tables (for example: “Siddhartha Gautama” → “Gautama Buddha”).
                Manual merges remove duplicates so each historical figure appears once.
              </p>
            </section>

            <section id="metadata" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Geography + metadata</h2>
              <p className="mt-3">
                Birthplaces, regions, and descriptions are drawn from Wikipedia and Wikidata. Regions are
                intentionally stable across eras to support cross-temporal comparisons and map-based views.
                Each figure has a birthplace coordinate for future globe visualizations.
              </p>
            </section>

            <section id="interpretation" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Interpretation: history + model behavior</h2>
              <p className="mt-3">
                The list is not just a ranking; it is a lens on model reasoning. LLMs struggle with this task
                because “importance” is not a stable, objective quantity. By making the model explanations visible
                in the detail panel, HistoryRank treats the list as an interpretive argument rather than a
                scoreboard.
              </p>
              <p className="mt-3">
                Over time, this allows comparative analysis: how do models diverge on religious figures, colonial
                leaders, or scientific innovators? Which traditions or regions are consistently underweighted?
              </p>
            </section>

            <section id="limitations" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Limitations and bias</h2>
              <p className="mt-3">
                Every source here is partial. Wikipedia reflects modern attention. Pantheon reflects an academic
                framing. LLMs inherit their training data and may amplify dominant narratives. The project treats
                these biases as data: where they align, where they diverge, and where they are silent.
              </p>
            </section>

            <section id="roadmap" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Roadmap</h2>
              <ul className="mt-3 space-y-2 text-stone-700">
                <li><strong>More samples:</strong> Expand to 10 lists per model to stabilize averages.</li>
                <li><strong>Multilingual prompts:</strong> Run the same prompt in other languages (French, Mandarin,
                Spanish, Arabic) to measure how language shifts historical memory.</li>
                <li><strong>Transparent comparison:</strong> Build tools to compare models side by side and trace
                why ranks diverge.</li>
                <li><strong>Map + timeline views:</strong> Plot figures by birthplace and era for spatial insight.</li>
              </ul>
            </section>

            <section id="future-work" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Future work</h2>
              <p className="mt-3">
                Our next phase extends the current benchmark in two directions: prompt sensitivity and
                cross-lingual comparison. We will run two prompt variants in parallel: the current prompt
                and a matched version that removes the global balance instruction. Each model will produce
                10 independent lists under each prompt, letting us compare stability within a prompt and
                shifts between prompts.
              </p>
              <p className="mt-3">
                We will also translate the prompt into multiple languages (Arabic, Farsi, Mandarin, Russian,
                French, Spanish, Hindi) while keeping the JSON keys in English. Each language will be sampled
                with the same number of lists per model to enable clean comparisons.
              </p>
              <p className="mt-3">
                Planned analyses include rank correlations across prompts and languages, top-k overlap,
                and distribution shifts by era, region, and domain. These results will be reported alongside
                within-model stability metrics to clarify which differences reflect model priors versus
                prompt framing.
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
