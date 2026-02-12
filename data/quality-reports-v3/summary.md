# List Quality Assessment Summary

Generated: 2026-02-10T23:47:25.601Z

Total lists assessed: 9
- PASS: 7
- WARN: 1
- FAIL: 1

## Model Quality Ranking

Models ranked by quality score (0-100). Higher is better.

| Rank | Model | Score | Lists | Avg Duplicates | Avg Max Sequence | Anchor Coverage |
|------|-------|-------|-------|----------------|------------------|-----------------|
| 1 | grok-4 V3 | 🟢 96 | 1 | 1.0 | 0.0 | 97% |
| 2 | gpt-5.2 V3 | 🟢 92 | 1 | 0.0 | 0.0 | 92% |
| 3 | claude-sonnet-4.5 V3 | 🟢 92 | 1 | 10.0 | 0.0 | 97% |
| 4 | gemini-3-flash-preview V3 | 🟡 79 | 2 | 7.5 | 6.0 | 94% |
| 5 | qwen3-235b-a22b V3 | 🟡 78 | 1 | 34.0 | 0.0 | 95% |
| 6 | claude-opus-4.5 V3 | 🟡 74 | 1 | 4.0 | 11.0 | 98% |
| 7 | qwen3-235b-a22b-2507 V3 | 🔴 31 | 1 | 138.0 | 11.0 | 93% |
| 8 | deepseek-v3.2 V3 | 🔴 10 | 1 | 252.0 | 25.0 | 90% |

## Failing Lists

### deepseek-v3.2 V3 LIST 1 (February 4, 2026).txt
- **Model:** deepseek-v3.2 V3
- **Issues:** Issues: 252 exact duplicates; pattern collapse (max 25)
- **Details:**
  - Exact duplicate: "mao zedong" at ranks 19, 112
  - Exact duplicate: "benjamin netanyahu" at ranks 212, 215
  - Exact duplicate: "king salman of saudi arabia" at ranks 237, 251, 265, 279, 293, 307, 321, 335, 349, 363, 377, 391, 405, 419, 433, 447, 461, 475, 489
  - Exact duplicate: "mohammed bin salman" at ranks 238, 252, 266, 280, 294, 308, 322, 336, 350, 364, 378, 392, 406, 420, 434, 448, 462, 476, 490
  - Exact duplicate: "sheikh zayed bin sultan al nahyan" at ranks 239, 253, 267, 281, 295, 309, 323, 337, 351, 365, 379, 393, 407, 421, 435, 449, 463, 477, 491


## Warning Lists

- **qwen3-235b-a22b-2507 V3 LIST 1 (February 4, 2026).txt** (qwen3-235b-a22b-2507 V3): Issues: 138 exact duplicates; pattern collapse (max 11)

## Worst Lists (Advanced Metrics)

| Rank | File | Model | Advanced Score | Paren % | Multi % | Short % | Long % |
|------|------|-------|----------------|---------|---------|---------|--------|
| 1 | grok-4 V3 LIST 1 (February 4, 2026).txt | grok-4 V3 | 98.4 | 0.0% | 0.2% | 0.0% | 0.0% |
| 2 | gemini-3-flash-preview V3 LIST 1 (February 4, 2026).txt | gemini-3-flash-preview V3 | 99.6 | 0.4% | 0.2% | 0.0% | 0.0% |
| 3 | deepseek-v3.2 V3 LIST 1 (February 4, 2026).txt | deepseek-v3.2 V3 | 99.7 | 0.4% | 0.0% | 0.0% | 0.0% |
| 4 | claude-opus-4.5 V3 LIST 1 (February 4, 2026).txt | claude-opus-4.5 V3 | 99.9 | 0.2% | 0.0% | 0.0% | 0.0% |
| 5 | gemini-3-flash-preview V3 LIST 2 (February 4, 2026).txt | gemini-3-flash-preview V3 | 99.9 | 0.2% | 0.0% | 0.0% | 0.0% |
| 6 | gpt-5.2 V3 LIST 3 (February 4, 2026).txt | gpt-5.2 V3 | 100.0 | 0.0% | 0.0% | 0.0% | 0.0% |
| 7 | claude-sonnet-4.5 V3 LIST 1 (February 4, 2026).txt | claude-sonnet-4.5 V3 | 100.0 | 0.0% | 0.0% | 0.0% | 0.0% |
| 8 | qwen3-235b-a22b V3 LIST 1 (February 4, 2026).txt | qwen3-235b-a22b V3 | 100.0 | 0.0% | 0.0% | 0.0% | 0.0% |
| 9 | qwen3-235b-a22b-2507 V3 LIST 1 (February 4, 2026).txt | qwen3-235b-a22b-2507 V3 | 100.0 | 0.0% | 0.0% | 0.0% | 0.0% |