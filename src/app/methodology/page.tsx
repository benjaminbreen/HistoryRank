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
                  ['circularity', 'Circularity problem'],
                  ['quality', 'Model quality'],
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
                  a shared prompt and format. Each entry includes a brief explanation of the figure's importance.
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-stone-800 dark:text-slate-200">Current Model Roster</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  As of January 2025, the consensus ranking draws from the following models:
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-slate-700">
                        <th className="text-left py-2 pr-4 font-medium text-stone-700 dark:text-slate-300">Model</th>
                        <th className="text-left py-2 pr-4 font-medium text-stone-700 dark:text-slate-300">Developer</th>
                        <th className="text-center py-2 pr-4 font-medium text-stone-700 dark:text-slate-300">Lists</th>
                        <th className="text-left py-2 font-medium text-stone-700 dark:text-slate-300">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="text-stone-600 dark:text-slate-400">
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">Claude Opus 4.5</td>
                        <td className="py-2 pr-4">Anthropic</td>
                        <td className="py-2 pr-4 text-center">8</td>
                        <td className="py-2">Flagship reasoning model</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">Claude Sonnet 4.5</td>
                        <td className="py-2 pr-4">Anthropic</td>
                        <td className="py-2 pr-4 text-center">8</td>
                        <td className="py-2">Balanced performance/cost</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">GPT-5.2-Thinking</td>
                        <td className="py-2 pr-4">OpenAI</td>
                        <td className="py-2 pr-4 text-center">8</td>
                        <td className="py-2">Extended reasoning variant</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">Gemini Pro 3</td>
                        <td className="py-2 pr-4">Google</td>
                        <td className="py-2 pr-4 text-center">7</td>
                        <td className="py-2">Multimodal flagship</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">Grok 4.1 Fast</td>
                        <td className="py-2 pr-4">xAI</td>
                        <td className="py-2 pr-4 text-center">7</td>
                        <td className="py-2">Speed-optimized</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">Gemini Flash 3</td>
                        <td className="py-2 pr-4">Google</td>
                        <td className="py-2 pr-4 text-center">5</td>
                        <td className="py-2">Efficiency variant</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">Mistral Large 3</td>
                        <td className="py-2 pr-4">Mistral AI</td>
                        <td className="py-2 pr-4 text-center">5</td>
                        <td className="py-2">European-developed</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">Grok 4</td>
                        <td className="py-2 pr-4">xAI</td>
                        <td className="py-2 pr-4 text-center">5</td>
                        <td className="py-2">Full capability variant</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 pr-4">DeepSeek v3.2</td>
                        <td className="py-2 pr-4">DeepSeek</td>
                        <td className="py-2 pr-4 text-center">4</td>
                        <td className="py-2">Chinese-developed</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">Qwen 3</td>
                        <td className="py-2 pr-4">Alibaba</td>
                        <td className="py-2 pr-4 text-center">3</td>
                        <td className="py-2">Chinese-developed</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">
                  Total: ~60 independent lists comprising ~41,000 individual figure rankings.
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
                because "importance" is not a stable, objective quantity. By making the model explanations visible
                in the detail panel, HistoryRank treats the list as an interpretive argument rather than a
                scoreboard.
              </p>
              <p className="mt-3">
                Over time, this allows comparative analysis: how do models diverge on religious figures, colonial
                leaders, or scientific innovators? Which traditions or regions are consistently underweighted?
              </p>
            </section>

            <section id="circularity" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">The circularity problem</h2>
              <p className="mt-3">
                There is an obvious methodological concern: LLMs are trained on human texts. When we ask them to
                rank historical figures, are they doing anything more than reflecting back the existing
                historiographical consensus?
              </p>
              <p className="mt-3">
                In one sense, yes&mdash;that's exactly what they're doing. An LLM has no independent access to
                the past. It cannot evaluate Caesar's military campaigns or Confucius's teachings except through
                the lens of what humans have written about them.
              </p>
              <p className="mt-3">
                But the circularity is less damning than it first appears. The training corpora for modern LLMs
                include texts from many cultures, time periods, and perspectives&mdash;far more than any individual
                human could synthesize. When Claude and GPT disagree about the relative importance of a figure,
                that disagreement reflects genuine tensions in the historical record, weighted differently by
                different training approaches.
              </p>
              <p className="mt-3">
                We treat this not as a bug but as a feature. The consensus ranking represents what the accumulated
                text of human civilization, filtered through multiple model architectures, collectively "believes"
                about historical importance. The <em>patterns</em> of agreement and disagreement are themselves the data.
              </p>
            </section>

            <section id="quality" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Model quality and exclusions</h2>
              <p className="mt-3">
                Not all models can complete this task reliably. The "rank 1,000 most influential people in history"
                challenge turns out to be a surprisingly effective test of frontier model capabilities. Only a handful
                of current models can maintain coherent global reasoning across 1,000 entries without falling into
                failure modes.
              </p>
              <p className="mt-3">
                The most common failure is what we call <strong>autoregressive pattern collapse</strong>: the model
                loses track of the task constraint ("rank by historical importance") and instead starts optimizing
                for local sequence prediction ("what comes next in this pattern"). By rank 500–700, weaker models
                often fall into "local minima" where they generate long sequences of thematically similar entries
                that have no business appearing on a list of history's most important figures.
              </p>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-stone-800 dark:text-slate-200">Case Study: GLM 4.7</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  Zhipu AI's GLM 4.7 produced lists that exemplify this failure mode. Around rank 615, the model
                  encountered a legitimate entry (possibly Arvydas Sabonis, a notable figure in basketball history)
                  and then generated over 20 consecutive entries of obscure Lithuanian basketball players:
                </p>
                <pre className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-stone-200/70 bg-white p-4 text-[12px] text-stone-700 shadow-sm font-mono">
{`{
  "rank": 615,
  "name": "Edgaras Ulanovas",
  "primary_contribution": "Lithuanian basketball player; small forward."
},
{
  "rank": 616,
  "name": "Rokas Jokubaitis",
  "primary_contribution": "Lithuanian basketball player; point guard."
},
{
  "rank": 617,
  "name": "Ignas Vaitiekūnas",
  "primary_contribution": "Lithuanian basketball player; power forward."
},
{
  "rank": 618,
  "name": "Karolis Lukošiūnas",
  "primary_contribution": "Lithuanian basketball player; center."
},
{
  "rank": 619,
  "name": "Paulius Sarpalis",
  "primary_contribution": "Lithuanian basketball player; center."
},
{
  "rank": 620,
  "name": "Dovydas Giedvila",
  "primary_contribution": "Lithuanian basketball player; shooting guard."
},
// ... continues for 15+ more entries, cycling through positions
{
  "rank": 633,
  "name": "Arvydas Sabonis",
  "primary_contribution": "Lithuanian basketball player; center; one of the best international players ever."
}`}
                </pre>
                <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
                  Notice that genuinely notable figures (Arvydas Sabonis, Šarūnas Marčiulionis) appear <em>after</em>
                  obscure current players—the model is no longer ranking by importance but playing "what comes next."
                  This represents a fundamental failure to maintain the task constraint across the generation window.
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-stone-800 dark:text-slate-200">Failure Taxonomy</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  We identified four distinct failure modes during testing:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-slate-400">
                  <li>
                    <strong>Pattern Collapse:</strong> The model falls into "local minima," generating long sequences
                    of thematically similar entries (e.g., 20+ consecutive basketball players) while losing track of
                    the ranking criterion.
                  </li>
                  <li>
                    <strong>Repetition:</strong> The same figures appear multiple times throughout the list. In severe
                    cases, a single figure like Socrates might appear 20+ times across different ranks.
                  </li>
                  <li>
                    <strong>Category Cycling:</strong> The model mechanically alternates through categories (scientist,
                    artist, ruler, scientist, artist, ruler...) rather than producing an integrated ranking.
                  </li>
                  <li>
                    <strong>Output Truncation:</strong> The model cannot generate 1,000 entries in a single pass due to
                    output token limits, producing incomplete or malformed JSON.
                  </li>
                </ul>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-stone-800 dark:text-slate-200">Excluded Models</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  The following table summarizes models that were tested but excluded from the consensus rankings.
                  Quality metrics are averages across all test lists for each model.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800">
                        <th className="text-left py-2 px-3 font-medium text-stone-700 dark:text-slate-300">Model</th>
                        <th className="text-left py-2 px-3 font-medium text-stone-700 dark:text-slate-300">Developer</th>
                        <th className="text-left py-2 px-3 font-medium text-stone-700 dark:text-slate-300">Failure Mode</th>
                        <th className="text-center py-2 px-3 font-medium text-stone-700 dark:text-slate-300">Avg Duplicates</th>
                        <th className="text-center py-2 px-3 font-medium text-stone-700 dark:text-slate-300">Max Pattern Seq</th>
                        <th className="text-center py-2 px-3 font-medium text-stone-700 dark:text-slate-300">Lists Tested</th>
                      </tr>
                    </thead>
                    <tbody className="text-stone-600 dark:text-slate-400">
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 px-3">Qwen 3</td>
                        <td className="py-2 px-3">Alibaba</td>
                        <td className="py-2 px-3">Repetition</td>
                        <td className="py-2 px-3 text-center">404–920</td>
                        <td className="py-2 px-3 text-center">12–17</td>
                        <td className="py-2 px-3 text-center">6</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 px-3">GLM 4.7</td>
                        <td className="py-2 px-3">Zhipu AI</td>
                        <td className="py-2 px-3">Pattern Collapse</td>
                        <td className="py-2 px-3 text-center">225</td>
                        <td className="py-2 px-3 text-center">20+</td>
                        <td className="py-2 px-3 text-center">3</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 px-3">Mistral Large 3</td>
                        <td className="py-2 px-3">Mistral AI</td>
                        <td className="py-2 px-3">Pattern Collapse</td>
                        <td className="py-2 px-3 text-center">275</td>
                        <td className="py-2 px-3 text-center">328</td>
                        <td className="py-2 px-3 text-center">5</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 px-3">Claude Haiku 4.5</td>
                        <td className="py-2 px-3">Anthropic</td>
                        <td className="py-2 px-3">Category Cycling</td>
                        <td className="py-2 px-3 text-center">268</td>
                        <td className="py-2 px-3 text-center">97</td>
                        <td className="py-2 px-3 text-center">1</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 px-3">GPT-5.2 Mini</td>
                        <td className="py-2 px-3">OpenAI</td>
                        <td className="py-2 px-3">Repetition (padding)</td>
                        <td className="py-2 px-3 text-center">N/A</td>
                        <td className="py-2 px-3 text-center">N/A</td>
                        <td className="py-2 px-3 text-center">1</td>
                      </tr>
                      <tr className="border-b border-stone-100 dark:border-slate-800">
                        <td className="py-2 px-3">Llama 4 Maverick</td>
                        <td className="py-2 px-3">Meta</td>
                        <td className="py-2 px-3">Output Truncation</td>
                        <td className="py-2 px-3 text-center">—</td>
                        <td className="py-2 px-3 text-center">—</td>
                        <td className="py-2 px-3 text-center">3 attempts</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3">Amazon Nova Pro</td>
                        <td className="py-2 px-3">AWS</td>
                        <td className="py-2 px-3">Output Truncation</td>
                        <td className="py-2 px-3 text-center">—</td>
                        <td className="py-2 px-3 text-center">—</td>
                        <td className="py-2 px-3 text-center">3 attempts</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-stone-800 dark:text-slate-200">Exclusion Criteria</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  A model was excluded from the consensus if it met any of the following criteria:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-slate-400">
                  <li>
                    <strong>Repetition threshold:</strong> More than 50 exact duplicate names per list on average
                    (representing a 5%+ error rate).
                  </li>
                  <li>
                    <strong>Pattern collapse threshold:</strong> More than 30 consecutive entries with similar
                    primary_contribution text (indicating loss of ranking criterion).
                  </li>
                  <li>
                    <strong>Structural failure:</strong> Inability to produce valid JSON with 1,000 sequential entries
                    in a single generation pass.
                  </li>
                </ul>
                <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
                  These thresholds were chosen to exclude only severe failures while tolerating minor imperfections.
                  Even well-performing models like Claude Opus 4.5 occasionally produce lists with 5–10 duplicates;
                  such minor errors do not warrant exclusion. The goal is to distinguish between models that can
                  meaningfully complete the task versus those that fundamentally cannot.
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-stone-800 dark:text-slate-200">Implications</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  The pattern of failures reveals something interesting: the ability to complete this task is not
                  uniformly distributed across model architectures or price points. Several observations stand out:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-slate-400">
                  <li>
                    <strong>Size alone is insufficient.</strong> Llama 4 Maverick (400B parameters) failed due to
                    output truncation, while DeepSeek V3 (671B) succeeds. The difference appears to be output token
                    limits and architecture rather than raw parameter count.
                  </li>
                  <li>
                    <strong>Smaller models from the same family fail.</strong> Claude Haiku fails where Opus succeeds;
                    GPT-5.2 Mini fails where GPT-5.2-Thinking succeeds. The task requires capabilities that don't
                    survive model compression.
                  </li>
                  <li>
                    <strong>Chinese models show mixed results.</strong> DeepSeek V3 performs adequately, but Qwen 3
                    and GLM 4.7 exhibit severe failures. This suggests the issues are model-specific rather than
                    related to training data geography.
                  </li>
                  <li>
                    <strong>European models struggled.</strong> Mistral Large 3 showed the worst pattern collapse
                    of any model tested (328 consecutive similar entries on average). This may reflect architectural
                    choices or training priorities that deprioritize sustained long-form generation.
                  </li>
                </ul>
                <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
                  We treat these failures not as defects to be worked around but as data about model capabilities.
                  The "rank 1,000 figures" task functions as an implicit capability filter, and documenting which
                  models pass or fail contributes to understanding the current landscape of frontier AI systems.
                </p>
              </div>
            </section>

            <section id="limitations" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Limitations and bias</h2>
              <p className="mt-3">
                Every source here is partial. Wikipedia reflects modern attention. Pantheon reflects an academic
                framing. LLMs inherit their training data and may amplify dominant narratives. The project treats
                these biases as data: where they align, where they diverge, and where they are silent.
              </p>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-stone-800 dark:text-slate-200">What We've Learned So Far</h3>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  After collecting rankings from 10 models across 60 independent samples, several patterns have emerged:
                </p>
                <ul className="mt-4 space-y-3 text-sm text-stone-700 dark:text-slate-300">
                  <li>
                    <strong>Scientists rise relative to conquerors.</strong> Compared to traditional "great figures"
                    lists, LLMs consistently elevate Newton, Darwin, and Einstein relative to Alexander, Napoleon,
                    and Genghis Khan.
                  </li>
                  <li>
                    <strong>Religious founders remain central.</strong> Jesus, Muhammad, Buddha, and Confucius appear
                    in every model's top tier, suggesting cross-cultural robustness in training data.
                  </li>
                  <li>
                    <strong>Modern figures are volatile.</strong> 20th-century figures show the highest variance.
                    Models disagree sharply about Mao, Churchill, Gandhi, and Einstein's relative positions.
                  </li>
                  <li>
                    <strong>Chinese models differ measurably.</strong> DeepSeek and Qwen show statistically
                    different rankings for Chinese historical figures compared to Western-developed models.
                  </li>
                  <li>
                    <strong>Women remain underrepresented.</strong> Despite prompt language encouraging global balance,
                    female figures rarely break the top 50 in any model's ranking. This likely reflects the historical
                    record itself rather than model bias.
                  </li>
                </ul>
              </div>
            </section>

            <section id="roadmap" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Roadmap</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Completed</h3>
                  <ul className="mt-2 space-y-1 text-sm text-stone-600 dark:text-slate-400">
                    <li>• Map and timeline views for geographic and temporal exploration</li>
                    <li>• Model comparison tools (radar charts, outlier detection, pairwise scatter)</li>
                    <li>• Domain and era bias visualization</li>
                    <li>• Figure detail panels with Wikipedia integration</li>
                    <li>• Media atlas linking figures to cultural artifacts</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">In Progress</h3>
                  <ul className="mt-2 space-y-1 text-sm text-stone-600 dark:text-slate-400">
                    <li>• Expanding to 10+ lists per model for statistical stability</li>
                    <li>• Adding more Chinese-developed models for cross-cultural comparison</li>
                    <li>• Refining domain and era classifications</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-stone-500 dark:text-slate-500 uppercase tracking-wide">Planned</h3>
                  <ul className="mt-2 space-y-1 text-sm text-stone-600 dark:text-slate-400">
                    <li>• Multilingual prompts (French, Mandarin, Arabic, Russian, Hindi)</li>
                    <li>• Prompt sensitivity analysis (varying definitions of "influence")</li>
                    <li>• Public API for researchers</li>
                    <li>• User voting layer to compare human vs. AI consensus</li>
                  </ul>
                </div>
              </div>
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
