'use client';

import { Instrument_Sans } from 'next/font/google';
import { AppHeader } from '@/components/layout/AppHeader';
import { useSettings } from '@/hooks/useSettings';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export default function AboutPage() {
  const { settings, updateSettings, resetSettings } = useSettings();

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
            <div className="sticky top-28 rounded-2xl border border-stone-200/70 bg-white/70 p-4 text-sm text-stone-600 shadow-sm backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                About
              </div>
              <nav className="mt-4 space-y-2">
                {[
                  ['overview', 'Overview'],
                  ['aims', 'Aims'],
                  ['how', 'How to read the list'],
                  ['prompts', 'Prompt variants'],
                  ['team', 'Project team'],
                  ['future', 'Future work'],
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
              <h1 className="text-3xl font-serif font-semibold text-stone-900">About</h1>
              <p className="mt-3 text-base text-stone-600">
                HistoryRank is a research project that uses large language models (LLMs) to create ranked lists
                of historically influential figures. The point is not to declare a definitive canon, but to
                surface the assumptions and biases that different models bring to a shared, explicit rubric.
              </p>
            </header>

            <section id="overview" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Overview</h2>
              <p className="mt-3">
                The dataset blends academic historiometry (MIT Pantheon), public attention (Wikipedia pageviews),
                and model-generated rankings. The consensus list is a model-conditioned view of historical
                importance, not a final verdict. The research value lies in the disagreements, omissions, and
                contrasts between models.
              </p>
            </section>

            <section id="aims" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Aims</h2>
              <p className="mt-3">
                The project has two intertwined goals. First, to build a public-facing resource for exploring
                global history at scale. Second, to use the “top 1,000” task as a benchmark for AI interpretability:
                how models express values, weight evidence, and explain their choices when faced with a complex,
                contested question.
              </p>
            </section>

            <section id="how" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">How to read the list</h2>
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
              <h2 className="text-xl font-semibold text-stone-900">Prompt variants</h2>
              <p className="mt-3">
                The baseline prompt is intentionally strict to keep outputs comparable. Experimental variants
                remove or adjust certain instructions to probe how models change their lists and reasoning.
              </p>
              <div className="mt-6 space-y-6">
                <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-stone-900">Current prompt (baseline)</h3>
                  <pre className="mt-3 whitespace-pre-wrap text-sm text-stone-700">{`Role: You are a senior historian and data scientist specializing in "Historiometry"-the statistical analysis of historical data.
Task: Generate a ranked list of the 1,000 most influential figures in world history.
Ranking Criteria: "Importance" must be calculated based on the following three metrics:
Breadth: The geographic extent of their influence (Global vs. Regional).
Depth: The degree to which they fundamentally altered human behavior, thought, or the state of the world.
Longevity: The duration of their impact across centuries.
Strict Constraints to Prevent Clustering:
No Categorical Grouping: Do not group figures by profession, era, or nationality. This is a singular, linear competition of impact. For example, if rank #450 is a scientist and #451 is a poet, it must be because the scientist's total score marginally exceeds the poet's, not because you are listing "famous scientists" and then "famous poets."
Linear Degradation: The list must represent a true descending order of influence. Rank #1 must be demonstrably more influential than #100, and #500 more than #1000.
Global Balance: Ensure the list reflects major figures based on what you determine to be their objective historical weight, not just fame in one culture or region.
Output Format: Provide the data in a raw JSON array of objects. Each object must contain: {"rank": integer, "name": "string", "primary_contribution": "string"}
Technical Instruction: Do not include introductory or concluding conversational text-output the JSON block only. output the FULL list with no duplicates.`}
                  </pre>
                </div>

                <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-stone-900">Variant A (no global balance)</h3>
                  <pre className="mt-3 whitespace-pre-wrap text-sm text-stone-700">{`Role: You are a senior historian and data scientist specializing in "Historiometry"-the statistical analysis of historical data.
Task: Generate a ranked list of the 1,000 most influential figures in world history.
Ranking Criteria: "Importance" must be calculated based on the following three metrics:
Breadth: The geographic extent of their influence (Global vs. Regional).
Depth: The degree to which they fundamentally altered human behavior, thought, or the state of the world.
Longevity: The duration of their impact across centuries.
Strict Constraints to Prevent Clustering:
No Categorical Grouping: Do not group figures by profession, era, or nationality. This is a singular, linear competition of impact. For example, if rank #450 is a scientist and #451 is a poet, it must be because the scientist's total score marginally exceeds the poet's, not because you are listing "famous scientists" and then "famous poets."
Linear Degradation: The list must represent a true descending order of influence. Rank #1 must be demonstrably more influential than #100, and #500 more than #1000.
Output Format: Provide the data in a raw JSON array of objects. Each object must contain: {"rank": integer, "name": "string", "primary_contribution": "string"}
Technical Instruction: Do not include introductory or concluding conversational text-output the JSON block only. output the FULL list with no duplicates.`}
                  </pre>
                </div>

                <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-stone-900">Variant B (add per-entry reasoning)</h3>
                  <pre className="mt-3 whitespace-pre-wrap text-sm text-stone-700">{`Role: You are a senior historian and data scientist specializing in "Historiometry"-the statistical analysis of historical data.
Task: Generate a ranked list of the 1,000 most influential figures in world history.
Ranking Criteria: "Importance" must be calculated based on the following three metrics:
Breadth: The geographic extent of their influence (Global vs. Regional).
Depth: The degree to which they fundamentally altered human behavior, thought, or the state of the world.
Longevity: The duration of their impact across centuries.
Strict Constraints to Prevent Clustering:
No Categorical Grouping: Do not group figures by profession, era, or nationality. This is a singular, linear competition of impact. For example, if rank #450 is a scientist and #451 is a poet, it must be because the scientist's total score marginally exceeds the poet's, not because you are listing "famous scientists" and then "famous poets."
Linear Degradation: The list must represent a true descending order of influence. Rank #1 must be demonstrably more influential than #100, and #500 more than #1000.
Global Balance: Ensure the list reflects major figures based on what you determine to be their objective historical weight, not just fame in one culture or region.
Output Format: Provide the data in a raw JSON array of objects. Each object must contain: {"rank": integer, "name": "string", "primary_contribution": "string", "historical_reasoning": "string"}
Technical Instruction: Do not include introductory or concluding conversational text-output the JSON block only. output the FULL list with no duplicates.`}
                  </pre>
                </div>
              </div>
            </section>

            <section id="team" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Project team</h2>
              <p className="mt-3 text-stone-700">
                Currently just Benjamin Breen, associate professor of history at UC Santa Cruz - but looking
                to collaborate with other historians, data scientists, etc! Please contact me
                {' '}<a className="text-amber-700 underline underline-offset-2 hover:text-amber-900" href="mailto:bebreen@ucsc.edu">bebreen@ucsc.edu</a> to discuss more.
              </p>
              <div className="mt-4 rounded-2xl border border-stone-200/70 bg-white/80 p-4 text-sm text-stone-600 shadow-sm">
                Interested in contributing? Reach out with ideas for multilingual sampling, historiometric
                datasets, or visualization experiments.
              </div>
            </section>

            <section id="future" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Future work</h2>
              <p className="mt-3 text-stone-600">
                We plan to run controlled prompt variants to test how specific instructions shape the lists.
                We also plan to extend the benchmark across languages (Arabic, Farsi, Mandarin, Russian, French,
                Spanish, and Hindi) to study how language context shifts model output and temporal coverage.
              </p>
              <p className="mt-3 text-stone-600">
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
