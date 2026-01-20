# HistoryRank: Using Large Language Model Consensus to Probe Historical Knowledge Encoding and Model Behavior

**Draft for interdisciplinary submission (Nature / Science / PNAS)**

---

## Abstract

How do large language models (LLMs) encode and reason about historical importance? We introduce HistoryRank, a methodology that uses the task of ranking the 1,000 most influential figures in world history as a probe into LLM behavior. By collecting 60 independent rankings from 10 frontier models across 6 organizations, we generate a consensus ranking and analyze patterns of agreement and disagreement. We find that: (1) the task itself serves as an effective discriminator of model capability, with only frontier-class models able to complete it without degenerate failure modes; (2) models show consistent biases—elevating scientists relative to conquerors, exhibiting high variance on 20th-century figures, and systematically underrepresenting women; (3) models from Chinese AI labs produce measurably different rankings for Chinese historical figures compared to Western-developed models. Rather than claiming to identify history's "most important" people, we treat the consensus and its disagreements as data about how AI systems have absorbed and weighted the historical record. This methodology offers a new approach to AI interpretability, bias detection, and the computational study of historiography.

**Keywords:** large language models, historical bias, AI interpretability, historiometry, consensus ranking, model evaluation

---

## Introduction

Large language models have absorbed vast quantities of human text, including much of the digitized historical record. When asked to reason about the past, they do not access history directly—they reflect patterns in what humans have written about history. This makes LLMs unusual mirrors: they compress centuries of historiographical debate, cultural memory, and educational emphasis into statistical weights.

We propose using this property as a research tool. By asking multiple LLMs to perform the same historically-weighted task and comparing their outputs, we can expose implicit assumptions, reveal cross-cultural differences in training data, and identify systematic biases that might otherwise remain invisible.

Our probe task is deceptively simple: rank the 1,000 most influential people in world history. This task is impossible to complete "correctly"—influence is contested, culturally contingent, and irreducibly value-laden. That is precisely why it is useful. Models must make their implicit criteria visible through their choices and justifications. Where models agree, we see robust patterns in the historical record. Where they disagree, we see genuine tensions in how different training approaches weight different sources.

We find that this task also serves as an unexpectedly effective test of model capability. Generating 1,000 coherent, non-repetitive entries while maintaining a global ranking criterion across the entire output requires sustained reasoning that many models cannot achieve. Smaller and less capable models exhibit characteristic failure modes—falling into "local minima" where they generate sequences of thematically similar but historically insignificant figures, or simply repeating entries. Only frontier-class models from leading AI labs can complete the task reliably.

This paper presents our methodology, documents the failure modes that necessitated quality-based model exclusion, and reports initial findings from 10 models that successfully completed the task. We treat these findings as preliminary evidence about LLM behavior rather than claims about historical truth.

---

## Methods

### Task Design

Each model received an identical prompt requesting a ranked JSON array of 1,000 figures with three fields: rank (integer), name (string), and primary_contribution (string). The prompt specified three ranking criteria—breadth of influence (geographic extent), depth (degree of transformation), and longevity (duration of impact)—and included explicit constraints against categorical grouping and duplicate entries.

The prompt requested raw JSON output with no conversational text, enabling automated parsing. Full prompt text is available in supplementary materials.

### Model Selection and Quality Control

We tested models from Anthropic (Claude Opus 4.5, Claude Sonnet 4.5), OpenAI (GPT-5.2-Thinking), Google (Gemini Pro 3, Gemini Flash 3), xAI (Grok 4, Grok 4.1 Fast), Mistral AI (Mistral Large 3), DeepSeek (DeepSeek V3.2), and Moonshot AI (Kimi K2).

**Inclusion criterion:** A model was included if it could generate 1,000 unique entries without repetition or categorical collapse in at least two of three test runs.

**Excluded models and failure modes:**

- *GLM 4.7 (Zhipu AI):* Exhibited "autoregressive pattern collapse"—around rank 600, the model fell into local minima generating sequences of thematically related but insignificant figures. One list contained 20+ consecutive entries for obscure Lithuanian basketball players, cycling through positions (point guard, center, small forward) rather than maintaining the historical importance criterion.

- *Qwen 3 (Alibaba):* Exhibited repetition failure—the same figures (e.g., Socrates) appeared 6-7 times within a single list, indicating the model failed to track its own output over long generations.

- *Claude Haiku 4.5 (Anthropic):* Exhibited mechanical category-cycling, producing lists organized by profession rather than integrated rankings.

- *GPT-5.2 Mini (OpenAI):* Exhibited duplicate-padding, explicitly listing the same figures multiple times to reach the 1,000 entry target.

These failure modes suggest the task requires a minimum threshold of reasoning capability and context management that only frontier-class models currently meet. The task may therefore serve as a capability benchmark independent of its historical content.

### Consensus Calculation

For each model, we collected 3-8 independent list generations using temperature sampling. We computed each model's average rank for each figure across its lists, then computed a cross-model consensus rank by averaging across models.

When a model omitted a figure entirely, we assigned a rank of 1,001 (just below the 1,000 cutoff). This treats omission as an implicit judgment that the figure is less important than any included entry, preventing outlier models from dominating the consensus through selective inclusion.

### Variance and Disagreement Metrics

We computed variance scores for each figure based on standard deviation of ranks across models. High variance indicates contested importance—figures where models (and implicitly, their training data) disagree about relative significance.

We also computed pairwise model agreement using Spearman rank correlation, enabling identification of model clusters that share similar historical weightings.

### Supplementary Data Sources

To contextualize LLM rankings, we incorporated:
- MIT Pantheon Historical Popularity Index (HPI), a historiometric ranking based on Wikipedia biography data
- Wikipedia pageviews (2024-2025) as a proxy for current public attention
- Wikidata for birth/death dates, geographic origins, and domain classification

---

## Results

### Consensus Patterns

Across 60 independent lists from 10 models comprising approximately 41,000 individual rankings, several robust patterns emerged:

**Religious founders dominate the top tier.** Jesus, Muhammad, Buddha, and Confucius appear in every model's top 20, typically in the top 10. This cross-model agreement suggests these figures' importance is robustly encoded across diverse training corpora.

**Scientists rise relative to traditional "great man" historiography.** Compared to 20th-century popular history lists, LLMs consistently rank Newton, Darwin, Einstein, and Galileo higher relative to military conquerors like Alexander, Napoleon, and Genghis Khan. This may reflect the composition of training data (more scientific and technical text) or a genuine shift in how contemporary sources weight different forms of influence.

**Modern figures show highest variance.** 20th-century figures exhibit the greatest cross-model disagreement. Models diverge sharply on the relative positions of Mao Zedong, Winston Churchill, Mahatma Gandhi, and Adolf Hitler. This likely reflects genuine historiographical disagreement in source materials rather than model idiosyncrasy.

**Women remain systematically underrepresented.** Despite prompt language encouraging global balance, female figures rarely appear in any model's top 50. The highest-ranked women are typically Cleopatra, Queen Victoria, Marie Curie, and Elizabeth I. This pattern persists across all models and likely reflects the historical record itself—the systematic exclusion of women from domains traditionally recognized as "influential"—rather than model-specific bias.

### Cross-Cultural Differences

Models developed by Chinese AI labs (DeepSeek, Kimi K2) produce measurably different rankings for Chinese historical figures compared to Western-developed models.

Preliminary analysis shows Chinese-developed models rank figures like Qin Shi Huang, Sun Yat-sen, and Deng Xiaoping higher than Western models, while showing less emphasis on figures from European antiquity. This finding requires further investigation but suggests training data composition meaningfully affects historical knowledge encoding.

### The Circularity Problem

An obvious methodological concern is circularity: LLMs are trained on human texts, so their rankings may simply reproduce existing historiographical consensus. In one sense, this is exactly what they do—an LLM has no independent access to the past.

However, the circularity is less problematic than it first appears, for three reasons:

1. Training corpora include texts from many cultures, time periods, and perspectives—far more than any individual historian could synthesize. The consensus represents a compression of this diversity.

2. Different models weight their training data differently. When Claude and GPT disagree about a figure's importance, that disagreement reflects genuine tensions in the historical record, filtered through different architectural and training choices.

3. The *patterns* of agreement and disagreement are themselves the data. We are not claiming to identify history's "truly" most important figures; we are documenting how AI systems have encoded historical importance, which is intrinsically interesting for AI interpretability and digital humanities.

---

## Discussion

### The Task as Capability Benchmark

An unexpected finding is that "rank 1,000 historical figures" serves as an effective discriminator of model capability. The task requires:

- Maintaining a global constraint (rank by importance) across 100,000+ tokens of output
- Tracking previously generated entries to avoid repetition
- Resisting the autoregressive tendency to pattern-match locally rather than reason globally
- Balancing competing criteria (breadth, depth, longevity) without explicit calculation

Models below a certain capability threshold fail in characteristic ways—falling into local minima, repeating entries, or cycling through categories mechanically. This suggests the task could be developed into a benchmark for evaluating sustained reasoning and output coherence in LLMs.

### Implications for AI Bias Research

The systematic patterns we observe—underrepresentation of women, elevation of scientists, variance on politically contested figures—provide concrete examples of how training data composition manifests in model outputs. Unlike synthetic bias benchmarks, these patterns emerge from a naturalistic task with face validity.

The cross-cultural differences between Chinese and Western models are particularly significant for AI governance discussions. If models encode different historical narratives based on their training data origins, this has implications for deploying AI systems in educational and informational contexts globally.

### Limitations

**Model selection was constrained by availability and capability.** We tested models accessible via API that could complete the task. This is a convenience sample of frontier models circa January 2026, not a comprehensive survey.

**The definition of "influence" is contested.** Our prompt specifies breadth, depth, and longevity as criteria, but models may interpret these differently. Future work should vary prompt definitions to assess sensitivity.

**We cannot fully disentangle model architecture from training data effects.** When Chinese and Western models diverge, we cannot determine whether this reflects training data, architectural choices, or post-training alignment procedures.

**The task is English-centric.** All prompts were in English. Future work should explore multilingual prompts to assess whether language affects historical knowledge retrieval.

---

## Future Directions

We plan three extensions:

1. **Prompt sensitivity analysis:** Running matched prompts with and without the "global balance" instruction to measure how prompt framing affects output distributions.

2. **Multilingual comparison:** Translating prompts into Arabic, Mandarin, Russian, French, Spanish, and Hindi to assess whether query language affects which figures are retrieved and how they are ranked.

3. **Temporal tracking:** Re-running the methodology as new models are released to track whether historical knowledge encoding changes over time or converges toward a stable consensus.

---

## Conclusion

We have introduced a methodology for using LLM consensus on a historically-weighted task to probe model behavior, detect bias, and study how AI systems encode contested cultural knowledge. The task of ranking history's most influential figures serves dual purposes: as a lens into historiographical assumptions embedded in training data, and as a capability benchmark that discriminates between frontier and sub-frontier models.

Our findings—robust agreement on religious founders, elevation of scientists, high variance on modern political figures, systematic underrepresentation of women, and measurable cross-cultural differences—provide concrete evidence about how LLMs have absorbed the historical record. We offer these not as claims about history but as data about AI systems and, indirectly, about the texts on which they were trained.

The consensus ranking itself is publicly available at [URL], along with tools for exploring model-level disagreements, geographic distributions, and temporal patterns. We invite researchers in AI interpretability, digital humanities, and historiography to build on this methodology.

---

## Methods Summary (for main text)

We collected 60 ranked lists of 1,000 historical figures from 10 frontier LLMs (Claude Opus 4.5, Claude Sonnet 4.5, GPT-5.2-Thinking, Gemini Pro 3, Gemini Flash 3, Grok 4, Grok 4.1 Fast, Mistral Large 3, DeepSeek V3.2, Kimi K2) using a standardized prompt. Models that could not complete the task without repetition or categorical collapse were excluded. Consensus ranks were computed by averaging across models, with omissions scored as rank 1,001. Variance scores quantify cross-model disagreement. Full methodology, prompt text, and data are available at [URL] and in supplementary materials.

---

## References

[To be added - would include:]
- MIT Pantheon methodology papers
- Relevant AI bias literature
- Historiometry foundational works (e.g., Charles Murray's Human Accomplishment, though controversial)
- LLM interpretability literature
- Relevant work on cultural bias in AI systems

---

## Supplementary Materials

- Full prompt text
- Complete model roster with list counts
- Failure mode examples (GLM basketball sequence, Qwen repetition)
- Pairwise model correlation matrix
- Top 100 consensus ranking with variance scores
- Geographic and temporal distribution analyses

---

## Author Contributions

[To be completed]

---

## Competing Interests

The authors declare no competing interests.

---

## Data Availability

All data, including individual model rankings, consensus calculations, and analysis code, are available at [repository URL]. The interactive visualization is available at [HistoryRank URL].

---

*Draft word count: ~2,200 (main text, excluding methods summary and supplementary)*

*Target journals: Nature, Science, PNAS, Nature Human Behaviour, or similar interdisciplinary venues*

---

## Notes for Revision

1. **Figures needed:**
   - Fig 1: Schematic of methodology (prompt → models → consensus)
   - Fig 2: Top 50 consensus ranking with variance bars
   - Fig 3: Heatmap of pairwise model correlations
   - Fig 4: Example of failure mode (GLM basketball sequence)
   - Fig 5: Geographic distribution of ranked figures

2. **Strengthen with statistics:** Add Spearman correlations, significance tests for Chinese vs Western model differences, confidence intervals on consensus ranks

3. **Sharpen the contribution:** The dual finding (task as capability benchmark + task as bias probe) is the novel contribution. Make this clearer in abstract/intro.

4. **Address reviewer concerns preemptively:** The "why these models" question is anticipated in Methods. May need more defense of exclusion criteria.

5. **Consider framing for specific journal:** Nature wants broad impact and novelty. PNAS may be more receptive to methodological contributions. Nature Human Behaviour is a natural fit for the cultural/historical angle.
