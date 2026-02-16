# HistoryBench v1.0 — Judge Evaluation Criteria

## Task

You are evaluating descriptions of historical figures' contributions to human history. Each entry contains a figure's name, their rank in a list of the most historically influential people, and a short description of why they are significant.

Your job is to score each description on 5 dimensions using a 1-5 scale. You are NOT scoring the ranking itself — you are scoring the quality of the written description as a demonstration of historical reasoning.

## Input Format

The input file (`data/derived/historybench-samples-blinded.json`) contains an array of entries:

```json
{
  "blindId": "XXXX-01",
  "figureId": "figure-id",
  "figureName": "Name of Figure",
  "rank": 42,
  "tier": "11-50",
  "contribution": "The description text to evaluate..."
}
```

The `blindId` is an anonymized identifier. Do not attempt to guess which model produced each entry.

## Scoring Dimensions

Score each dimension from 1 (worst) to 5 (best):

### 1. Factual Precision (1-5)
Does the description contain accurate historical claims?

- **1**: Contains a clear factual error or attributes the wrong accomplishment to the figure
- **2**: Vague or generic enough that accuracy can't be assessed ("important leader")
- **3**: Factually correct but surface-level (states commonly known facts only)
- **4**: Factually correct with some specific, non-obvious details
- **5**: Factually precise with specific claims that demonstrate deep knowledge

### 2. Causal Specificity (1-5)
Does the description explain *why* the figure mattered — the mechanism of their influence?

- **1**: No causal claim at all (just a label like "Impressionism" or "Founder of Islam")
- **2**: States what they did but not why it mattered ("wrote The Republic")
- **3**: Basic causal connection ("revolutionized physics" — says impact happened but not how)
- **4**: Identifies a specific mechanism of influence ("his synthesis of experiment and mathematics established...")
- **5**: Traces downstream consequences through a causal chain ("enabling X, which led to Y")

### 3. Proportionality (1-5)
Is the description appropriately calibrated to the figure's actual historical significance?

- **1**: Wildly overclaims or underclaims (e.g., calling a minor figure "the most important person in history")
- **2**: Noticeable mismatch between the claim and the figure's actual impact
- **3**: Roughly proportional but uses generic superlatives ("transformed the world")
- **4**: Well-calibrated claims that match the figure's actual scope of influence
- **5**: Precisely calibrated — distinguishes between local, regional, and civilizational impact

### 4. Nuance (1-5)
Does the description show awareness of complexity, debate, or context?

- **1**: Purely hagiographic or one-dimensional ("greatest leader ever")
- **2**: Single-perspective description with no acknowledgment of complexity
- **3**: Mentions multiple aspects of the figure's legacy
- **4**: Shows awareness of historiographic debate or multiple interpretations
- **5**: Balances multiple perspectives, acknowledges limitations, or contextualizes within broader forces

### 5. Knowledge Depth (1-5)
Does the description demonstrate knowledge beyond what a typical educated person would know?

- **1**: Could be generated from the figure's name alone (zero knowledge demonstrated)
- **2**: Wikipedia-first-paragraph level ("Newton discovered gravity")
- **3**: Correct and specific but not surprising (standard historical knowledge)
- **4**: Includes non-obvious details or connections
- **5**: Demonstrates specialist-level historical knowledge

## Anchor Examples

### Score ~1 (across dimensions)
> **Figure:** Claude Monet (rank 450)
> **Description:** "Impressionism"

This scores 1 on every dimension. It's a single keyword, not a description. No factual claims, no causal reasoning, no sense of proportion, no nuance, no demonstrated knowledge.

### Score ~2 (across dimensions)
> **Figure:** Muhammad (rank 1)
> **Description:** "Founder of Islam"

Factually correct (2-3), but provides zero causal reasoning (1), no proportionality (it's three words for the #1 ranked figure) (1-2), no nuance (1), and demonstrates no knowledge beyond the figure's name (1-2).

### Score ~3-4 (across dimensions)
> **Figure:** Gutenberg (rank 12)
> **Description:** "Invented the movable-type printing press, enabling mass production of books and catalyzing the spread of literacy, the Reformation, and the Scientific Revolution across Europe."

Factually precise (4), strong causal specificity with downstream consequences (4), well-proportioned (4), some nuance in listing multiple consequences (3), good knowledge depth (3-4).

### Score ~5 (across dimensions)
> **Figure:** Galileo Galilei (rank 8)
> **Description:** "He combined experiment and mathematics to advance heliocentrism and establish modern physical methodology."

Factually precise (5), excellent causal specificity — identifies the *method* as the key contribution rather than the conclusions (5), perfectly proportioned (5), nuanced in distinguishing method from conclusion (4-5), demonstrates historiographic sophistication about what made Galileo important (5).

## Output Format

Write your scores as a JSON array to the specified output file. **Important:** Each judge will be run 3 times to measure consistency. Name your output files with a run number suffix:

- Run 1: `data/derived/judge-scores-{judge}-run1.json`
- Run 2: `data/derived/judge-scores-{judge}-run2.json`
- Run 3: `data/derived/judge-scores-{judge}-run3.json`

Where `{judge}` is either `codex` or `claude`.

```json
[
  {
    "blindId": "XXXX-01",
    "figureName": "Name of Figure",
    "scores": {
      "factualPrecision": 4,
      "causalSpecificity": 3,
      "proportionality": 4,
      "nuance": 3,
      "knowledgeDepth": 4
    },
    "notes": "3-5 words max"
  }
]
```

## Important Instructions

- Score EVERY entry in the input file. Do not skip any.
- All scores must be integers from 1 to 5.
- Do NOT penalize unconventional or surprising rankings. A figure ranked at position 4 who "deserves" position 15 is not your concern — you are scoring the description, not the ranking choice.
- Do NOT apply demographic quotas or diversity expectations. Judge each description purely on its historical reasoning quality.
- Do NOT assume shorter descriptions are worse. A concise, precise description can score 5/5; a long, vague description can score 1/5.
- Provide very brief notes (3-5 words max) for each entry, e.g. "vague, no causal claim" or "precise causal chain".
- Be consistent: if two descriptions make similar claims at similar quality levels, they should receive similar scores regardless of the figure being described.
- Output compact/minified JSON (no indentation or newlines) to minimize output size.
