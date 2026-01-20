'use client';

import { Instrument_Sans } from 'next/font/google';
import { useSettings } from '@/hooks/useSettings';
import { AppHeader } from '@/components/layout/AppHeader';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export default function CaveatsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="caveats"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <section className={`${instrument.className} max-w-6xl mx-auto px-6 py-12`}>
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl border border-stone-200/70 bg-white/70 p-4 text-sm text-stone-600 shadow-sm backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                Caveats
              </div>
              <nav className="mt-4 space-y-2">
                {[
                  ['problem', 'The problem'],
                  ['influence', 'Defining influence'],
                  ['sunstein', 'Sunstein\'s critique'],
                  ['counterpoint', 'A counterpoint'],
                  ['foreign', 'Foreign intelligences'],
                  ['alignment', 'Alignment & bias'],
                  ['known-biases', 'Known biases'],
                  ['essay', 'An essay'],
                  ['invitation', 'An invitation'],
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
              <h1 className="text-3xl font-serif font-semibold text-stone-900">Caveats</h1>
              <p className="mt-3 text-base text-stone-600">
                On the inherent absurdity of ranking historical figures&mdash;and why it might be worth doing anyway.
              </p>
            </header>

            <section id="problem" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">The Problem with Ranking History</h2>
              <p className="mt-3">
                Can we really rank the "most important" people in history? The idea seems almost absurd on its face.
                How do you compare a religious founder to a scientist, a conqueror to a poet, a philosopher to an
                inventor? By what measure? Toward what end?
              </p>
              <p className="mt-3">
                These are not merely rhetorical questions. They cut to the heart of what we mean by "importance"
                and whether such a concept can be meaningfully quantified at all.
              </p>
            </section>

            <section id="influence" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">What Do We Mean by "Influence"?</h2>
              <p className="mt-3">
                The prompt we give to models asks for "historical influence," but this term conceals profound
                ambiguity. Consider how differently these dimensions might rank the same figures:
              </p>
              <ul className="mt-4 space-y-3 text-stone-700 dark:text-slate-300">
                <li>
                  <strong>Causal influence:</strong> Did this person's actions directly change the course of events?
                  By this measure, Genghis Khan ranks highly&mdash;his conquests reshaped the demographics and
                  politics of Eurasia for centuries.
                </li>
                <li>
                  <strong>Ideological influence:</strong> Did this person's ideas spread and persist? Confucius,
                  Jesus, and Marx score well here, though they commanded no armies.
                </li>
                <li>
                  <strong>Scientific influence:</strong> Did this person advance human knowledge or capability?
                  Newton and Darwin are obvious examples&mdash;but how do we weigh discovery against application?
                </li>
                <li>
                  <strong>Cultural influence:</strong> Did this person shape how we see and represent the world?
                  Shakespeare, Homer, the Buddha&mdash;their influence is pervasive but diffuse.
                </li>
                <li>
                  <strong>Negative influence:</strong> How do we weigh those whose influence was primarily
                  destructive? Hitler "influenced" history enormously. Should that count? How?
                </li>
              </ul>
              <p className="mt-4">
                Different models appear to weight these dimensions differently. Some lean toward "ideas that
                persisted"; others toward "actions that changed events." Neither is wrong. Both are incomplete.
              </p>
              <p className="mt-3">
                We have not attempted to resolve this ambiguity. Instead, we let models interpret "influence"
                as they will, and we make their different interpretations visible through comparison. The
                disagreements are often more illuminating than the consensus.
              </p>
            </section>

            <section id="sunstein" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">Sunstein's Critique</h2>
              <p className="mt-3">
                In 2013, the legal scholar Cass Sunstein published a devastating critique of attempts to quantify
                historical significance. Writing about Skiena and Ward's book <em>Who's Bigger?</em>, which used
                Wikipedia metrics to rank historical figures, Sunstein raised fundamental objections that apply
                equally to any such project&mdash;including this one.
              </p>

              <blockquote className="my-6 border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-900/20 dark:border-amber-600 pl-6 pr-4 py-4 rounded-r-xl">
                <p className="italic text-stone-600 dark:text-slate-300">
                  "We lack standards and tools to measure social contributions, certainly across time and across
                  diverse fields and enterprises."
                </p>
                <cite className="mt-2 block text-sm text-stone-500 dark:text-slate-400">
                  &mdash; Cass Sunstein, "Statistically, Who's the Greatest Person in History?" (2013)
                </cite>
              </blockquote>

              <p className="mt-3">
                Sunstein's critique begins with a useful analogy: baseball. In baseball, we can at least agree on
                what we're measuring&mdash;a player's contribution to winning games. Statisticians have developed
                sophisticated metrics like "Wins Above Replacement" (WAR) that attempt to isolate each player's
                contribution. But even here, disagreements persist.
              </p>

              <blockquote className="my-6 border-l-4 border-stone-300 dark:border-slate-600 pl-6 pr-4 py-4 rounded-r-xl bg-stone-50/50 dark:bg-slate-800/50">
                <p className="italic text-stone-600 dark:text-slate-300">
                  "Who was the greatest baseball player of all time? Some people say Willie Mays. They emphasize
                  that he had all of baseball's 'five tools': he could run, hit, field, throw, and hit with power.
                  Other people insist on Ty Cobb, who had the highest career batting average in baseball history...
                  People vigorously disagree about the relationship among those particular rankings and overall
                  'greatness.'"
                </p>
              </blockquote>

              <p className="mt-3">
                If we cannot even agree on how to rank baseball players&mdash;where the goal (winning) is clear and
                the data is abundant&mdash;how much harder is it to rank historical figures, where the very
                definition of "importance" is contested?
              </p>

              <blockquote className="my-6 border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-900/20 dark:border-amber-600 pl-6 pr-4 py-4 rounded-r-xl">
                <p className="italic text-stone-600 dark:text-slate-300">
                  "And what about religious leaders, scientists, philosophers, artists, and novelists? Can they
                  be ranked as well&mdash;in terms of greatness or importance? Might we be able to play some
                  kind of Moneyball with Joyce Carol Oates, Stephen King, James Joyce, Charles Dickens, and
                  Thomas Hardy? Can cultural figures from diverse fields be ranked against each other? How might
                  we compare Einstein, Plato, Descartes, Hume, Michelangelo, Suzanne Farrell, and Bob Dylan?
                  True, it might be ridiculous, or even a bit crazy, to try."
                </p>
              </blockquote>

              <p className="mt-3">
                Sunstein identifies a fundamental problem with Wikipedia-based metrics: they measure interest,
                not importance.
              </p>

              <blockquote className="my-6 border-l-4 border-stone-300 dark:border-slate-600 pl-6 pr-4 py-4 rounded-r-xl bg-stone-50/50 dark:bg-slate-800/50">
                <p className="italic text-stone-600 dark:text-slate-300">
                  "It would make no sense to measure significance only by reference to the number of hits, page
                  length, and number of edits; such an approach would denominate today's popular entertainers,
                  and other celebrities, as history's most significant figures. Measures of that kind tell us
                  about the interests of Wikipedia readers and editors, and knowing about those interests tells
                  us something about popular tastes. But it does not inform us about significance."
                </p>
              </blockquote>

              <p className="mt-3">
                He also notes the cultural bias inherent in using English-language Wikipedia:
              </p>

              <blockquote className="my-6 border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-900/20 dark:border-amber-600 pl-6 pr-4 py-4 rounded-r-xl">
                <p className="italic text-stone-600 dark:text-slate-300">
                  "If the goal is to learn about worldwide fame or significance, it is more than a bit strange
                  to rely exclusively on the English-language version of Wikipedia. At most, the resulting
                  rankings reflect only the preoccupations of the English-speaking world, and mainly the
                  United States. Surely Jesus would not have done so well in China, to say nothing of all
                  those American presidents."
                </p>
              </blockquote>

              <p className="mt-3">
                Sunstein concludes with a warning that applies to any attempt at quantification:
              </p>

              <blockquote className="my-6 border-l-4 border-stone-300 dark:border-slate-600 pl-6 pr-4 py-4 rounded-r-xl bg-stone-50/50 dark:bg-slate-800/50">
                <p className="italic text-stone-600 dark:text-slate-300">
                  "Human beings can measure countless things... Our ability to measure is growing exponentially.
                  It can be fun to rank people in terms of what we are measuring. But before doing that, we
                  should be clear on what we have measured, and we should avoid nutty extrapolations. Bishop
                  Butler, the eighteenth-century theologian, famously cautioned that 'every thing is what it
                  is, and not another thing.'"
                </p>
              </blockquote>

              <p className="mt-3">
                These criticisms are valid, and we take them seriously. HistoryRank does not claim to have solved
                the problem of measuring historical importance. But we believe there are reasons to attempt this
                project nonetheless&mdash;reasons that emerge precisely from the peculiar nature of the tools we
                are using.
              </p>
            </section>

            <section id="counterpoint" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">A Counterpoint</h2>
              <p className="mt-3">
                Sunstein's critique was directed at human attempts to quantify history using Wikipedia metrics.
                But HistoryRank does something different: it asks large language models to make these judgments,
                then compares their answers to human-generated rankings. This changes the nature of the exercise
                in important ways.
              </p>
              <p className="mt-3">
                We are not claiming to have found the "true" ranking of historical importance. Instead, we are
                creating an experimental platform that reveals how different forms of intelligence&mdash;human
                and artificial&mdash;make judgments about the past.
              </p>
            </section>

            <section id="foreign" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">LLMs as Foreign Intelligences</h2>
              <p className="mt-3">
                Large language models are, in a sense, foreign intelligences. They are not human. They engage
                with human history at a remove, processing it through training on an enormous corpus of text
                spanning many languages, cultures, and perspectives. This gives them a peculiar vantage point.
              </p>
              <p className="mt-3">
                When a human scholar compiles a list of "the most important people in history," their judgment
                is inevitably shaped by their native language, nationality, education, and cultural assumptions.
                An American historian will tend to overweight American figures. A Chinese historian will have
                different blind spots and different emphases. This is not a flaw&mdash;it is simply the nature
                of human perspective.
              </p>
              <p className="mt-3">
                LLMs, by contrast, have been trained on text from across the world. They are inherently
                multilingual. They have "read" millions of books, articles, and documents in dozens of languages.
                While they certainly have biases&mdash;reflecting the biases of their training data and the
                choices of their creators&mdash;these biases are different in kind from human biases.
              </p>
              <p className="mt-3">
                This makes LLM rankings an interesting counterpoint to human rankings. Where do they agree?
                Where do they diverge? When an LLM consistently ranks a figure higher or lower than human
                sources, what does that tell us about the assumptions embedded in each?
              </p>
              <div className="mt-4 rounded-2xl border border-amber-200/60 bg-amber-50/70 p-4 text-sm text-amber-900 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-200">
                <strong>An early finding:</strong> Across multiple models, there is a notable shift toward
                elevating scientists and cultural figures relative to conquerors and political leaders, compared
                to traditional human rankings. Whether this represents a more "objective" assessment or a
                systematic bias in training data is itself a fascinating question.
              </div>
            </section>

            <section id="alignment" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">A Test of Alignment and Reasoning</h2>
              <p className="mt-3">
                Asking an LLM to rank historical figures by importance is, it turns out, a remarkably good way
                to probe how these models reason about issues of deep significance. The task requires the model
                to weigh competing values, to make judgments about what "matters," and to articulate its
                reasoning.
              </p>
              <p className="mt-3">
                When you click on a figure in HistoryRank, you can see the explanation each model provided for
                why it ranked that person where it did. These explanations are a window into model reasoning:
              </p>
              <ul className="mt-3 space-y-2 list-disc list-inside text-stone-700 dark:text-slate-300">
                <li>How do models understand "influence" versus "fame"?</li>
                <li>Do they weight moral judgments? (Is Hitler "important" because of the magnitude of his crimes?)</li>
                <li>How do they handle figures from non-Western traditions?</li>
                <li>Do different models systematically favor different domains (science vs. religion vs. politics)?</li>
                <li>What hidden assumptions emerge in their justifications?</li>
              </ul>
              <p className="mt-3">
                This makes HistoryRank a potential resource for researchers working on AI interpretability and
                alignment. The rankings themselves are less important than the patterns they reveal: how models
                reason, where they converge, and where they surprisingly diverge from human intuitions.
              </p>
              <p className="mt-3">
                Future directions might include: Do Chinese-developed models differ notably from American ones
                in their assessments? What if you ask the same model the same prompt, but in French? German?
                Turkish? Mandarin? Each variation becomes a probe into how language and training shape judgment.
              </p>
            </section>

            <section id="known-biases" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">The Biases We Know About</h2>
              <p className="mt-3">
                Through our Compare tool, several systematic biases have become visible. We name them here not
                to excuse them, but to make them explicit:
              </p>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <h3 className="font-semibold text-stone-800 dark:text-slate-200">Language and Geography</h3>
                  <p className="mt-2 text-sm">
                    Models trained primarily on English text systematically underrank figures from non-Western
                    traditions. Chinese philosophers, Indian mathematicians, and African leaders appear lower
                    than their actual historical influence might warrant. This is not the models' "fault"&mdash;it
                    reflects the composition of their training data.
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <h3 className="font-semibold text-stone-800 dark:text-slate-200">Recency Bias</h3>
                  <p className="mt-2 text-sm">
                    More text exists about recent figures. A 20th-century scientist has thousands of papers,
                    biographies, and Wikipedia edits documenting their work. An ancient philosopher has a handful
                    of surviving fragments. This creates a structural tilt toward the modern era that no amount
                    of prompt engineering can fully correct.
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <h3 className="font-semibold text-stone-800 dark:text-slate-200">The "Great Man" Problem</h3>
                  <p className="mt-2 text-sm">
                    Historical texts disproportionately focus on rulers, generals, and named individuals. The
                    contributions of movements, collectives, and anonymous innovators are harder to capture.
                    Who invented agriculture? Who first domesticated horses? These transformative developments
                    have no single author, and LLMs inherit this documentary bias.
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <h3 className="font-semibold text-stone-800 dark:text-slate-200">Gender</h3>
                  <p className="mt-2 text-sm">
                    The historical record itself is male-dominated. Women were systematically excluded from
                    public life for most of recorded history, and their contributions were less often documented.
                    LLMs cannot correct for sources that don't exist. Despite prompts encouraging diversity,
                    female figures rarely break the top 50 in any model's ranking.
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <h3 className="font-semibold text-stone-800 dark:text-slate-200">Domain Preferences</h3>
                  <p className="mt-2 text-sm">
                    Different models show measurably different affinities. Some favor scientists over artists;
                    others weight religious figures more heavily. Models developed in China show different
                    rankings for Chinese historical figures compared to Western-developed models. These
                    differences may reflect training data composition, fine-tuning choices, or alignment
                    decisions&mdash;but they are real and measurable.
                  </p>
                </div>
              </div>

              <p className="mt-4">
                We surface these biases through the Compare page, which visualizes how models diverge. The goal
                is not to eliminate bias&mdash;that may be impossible&mdash;but to make it visible and therefore
                available for critical examination.
              </p>
            </section>

            <section id="essay" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">An Essay, in the Original Sense</h2>
              <p className="mt-3">
                The word "essay" comes from the French <em>essai</em>, meaning "trial" or "attempt." When
                Montaigne invented the form in the sixteenth century, he meant his essays to be experiments in
                thought&mdash;provisional, exploratory, open to revision.
              </p>
              <p className="mt-3">
                HistoryRank is an essay in this original sense. It is not an effort to definitively answer the
                question "who were the most important people in history." Such a question may not have a
                meaningful answer. Instead, it is an experimental platform for exploring how different
                intelligences&mdash;human and artificial&mdash;approach this unanswerable question.
              </p>
              <p className="mt-3">
                The value lies not in the rankings themselves but in what the exercise reveals: about model
                behavior, about cultural bias, about the hidden assumptions that shape how we think about the
                past.
              </p>
            </section>

            <section id="invitation" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-stone-900">An Invitation</h2>
              <p className="mt-3">
                We offer HistoryRank in two spirits. First, as an unconventional but hopefully useful benchmark
                for researchers thinking about AI interpretability, alignment, and cross-cultural bias. The
                dataset of model explanations, the patterns of agreement and disagreement, and the comparisons
                across models may prove valuable for understanding how LLMs reason about complex value-laden
                questions.
              </p>
              <p className="mt-3">
                Second, as a starting point for students of history interested in the grand sweep of the human
                past. Who were the people who shaped the world we live in? What did they do? How do different
                sources&mdash;academic historians, Wikipedia readers, artificial intelligences&mdash;weigh their
                contributions? These are questions worth exploring, even if they have no final answers.
              </p>
              <p className="mt-3">
                We make no claim to have produced "the" list of history's most important figures. We have
                produced <em>several</em> such lists, from different sources, using different methods, and we
                have made the patterns of agreement and disagreement visible. What you do with that is up to you.
              </p>
              <div className="mt-6 p-6 rounded-2xl bg-stone-100/70 dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700">
                <p className="text-stone-600 dark:text-slate-300 italic">
                  "This is a good and potentially devastating question, but if we want to understand the arc of
                  history and the nature of social influence, the endeavor might turn out to be interesting and
                  perhaps even worthwhile. (And besides, many people find it fun.)"
                </p>
                <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">
                  &mdash; Cass Sunstein
                </p>
              </div>
            </section>

            <section className="scroll-mt-24 pt-6 border-t border-stone-200 dark:border-slate-700">
              <p className="text-sm text-stone-500 dark:text-slate-400">
                The Sunstein quotations are from "Statistically, Who's the Greatest Person in History?"
                published in <em>The New Republic</em>, December 3, 2013.
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
