# List Quality Assessment Summary

Generated: 2026-01-20T04:16:11.259Z

Total lists assessed: 78
- PASS: 13
- WARN: 22
- FAIL: 43

## Model Quality Ranking

Models ranked by quality score (0-100). Higher is better.

| Rank | Model | Score | Lists | Avg Duplicates | Avg Max Sequence | Anchor Coverage |
|------|-------|-------|-------|----------------|------------------|-----------------|
| 1 | Claude Opus 4.5 | 🟡 54 | 10 | 27.2 | 15.4 | 99% |
| 2 | GPT-5.2 Thinking | 🔴 45 | 11 | 71.6 | 9.3 | 99% |
| 3 | Claude Sonnet 4.5 | 🔴 32 | 8 | 52.4 | 35.3 | 99% |
| 4 | Grok 4 | 🔴 20 | 7 | 74.7 | 70.1 | 97% |
| 5 | Qwen3 235B A22B | 🔴 19 | 7 | 504.0 | 15.4 | 90% |
| 6 | Grok 4.1 Fast | 🔴 18 | 7 | 280.7 | 36.1 | 98% |
| 7 | DeepSeek V3.2 | 🔴 18 | 5 | 540.8 | 159.8 | 98% |
| 8 | Gemini Pro 3 | 🔴 18 | 7 | 114.7 | 48.0 | 98% |
| 9 | Gemini Flash 3 Preview | 🔴 16 | 7 | 158.1 | 25.7 | 96% |
| 10 | GLM 4.7 | 🔴 14 | 4 | 240.0 | 143.5 | 94% |
| 11 | Mistral Large 3 | 🔴 5 | 5 | 275.4 | 328.4 | 85% |

## Failing Lists

### Claude Opus 4.5 LIST 4 (January 13, 2025).txt
- **Model:** Claude Opus 4.5
- **Issues:** Issues: 71 exact duplicates; 1132 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "charles darwin" at ranks 8, 705
  - Exact duplicate: "euclid" at ranks 16, 929
  - Exact duplicate: "james watt" at ranks 18, 887
  - Exact duplicate: "laozi" at ranks 29, 650
  - Exact duplicate: "james clerk maxwell" at ranks 36, 510

### Claude Sonnet 4.5 LIST 1 (January 12, 2025).txt
- **Model:** Claude Sonnet 4.5
- **Issues:** Issues: 8 exact duplicates; pattern collapse (max 20); non-sequential ranks
- **Details:**
  - Exact duplicate: "sigmund freud" at ranks 30, 902
  - Exact duplicate: "mao zedong" at ranks 37, 293
  - Exact duplicate: "niels bohr" at ranks 54, 918
  - Exact duplicate: "voltaire" at ranks 57, 468
  - Exact duplicate: "francis bacon" at ranks 75, 725

### Claude Sonnet 4.5 LIST 3 (January 12, 2025).txt
- **Model:** Claude Sonnet 4.5
- **Issues:** Issues: 222 exact duplicates; pattern collapse (max 24); non-sequential ranks
- **Details:**
  - Exact duplicate: "charles darwin" at ranks 8, 745
  - Exact duplicate: "genghis khan" at ranks 9, 592
  - Exact duplicate: "karl marx" at ranks 11, 787
  - Exact duplicate: "moses" at ranks 13, 850
  - Exact duplicate: "thomas edison" at ranks 23, 823

### DeepSeek V3.2 LIST 1 (January 13, 2026).txt
- **Model:** DeepSeek V3.2
- **Issues:** Issues: 428 exact duplicates; pattern collapse (max 25)
- **Details:**
  - Exact duplicate: "jesus christ" at ranks 1, 279, 551
  - Exact duplicate: "muhammad" at ranks 2, 280, 552, 806
  - Exact duplicate: "isaac newton" at ranks 3, 349, 570, 807
  - Exact duplicate: "aristotle" at ranks 5, 275, 554, 804
  - Exact duplicate: "confucius" at ranks 6, 277, 539, 800

### DeepSeek V3.2 LIST 2 (January 14, 2026).txt
- **Model:** DeepSeek V3.2
- **Issues:** Issues: 625 exact duplicates; pattern collapse (max 14)
- **Details:**
  - Exact duplicate: "jesus of nazareth" at ranks 1, 741
  - Exact duplicate: "muhammad" at ranks 2, 356, 742, 941
  - Exact duplicate: "isaac newton" at ranks 3, 354, 739, 937
  - Exact duplicate: "siddhartha gautama the buddha" at ranks 4, 550
  - Exact duplicate: "confucius" at ranks 5, 134, 252, 347, 744, 943

### DeepSeek V3.2 LIST 3 (January 14, 2026).txt
- **Model:** DeepSeek V3.2
- **Issues:** Issues: 689 exact duplicates; pattern collapse (max 10)
- **Details:**
  - Exact duplicate: "jesus of nazareth" at ranks 1, 643, 752, 938
  - Exact duplicate: "muhammad" at ranks 2, 490, 644, 753, 854, 939
  - Exact duplicate: "isaac newton" at ranks 3, 143, 489, 532, 640, 754, 852, 936
  - Exact duplicate: "buddha siddhartha gautama" at ranks 4, 856, 940
  - Exact duplicate: "confucius" at ranks 5, 129, 223, 466, 531, 635, 751, 845, 927

### DeepSeek V3.2 LIST 4 (January 14, 2026).txt
- **Model:** DeepSeek V3.2
- **Issues:** Issues: 317 exact duplicates; pattern collapse (max 39)
- **Details:**
  - Exact duplicate: "muhammad" at ranks 2, 915
  - Exact duplicate: "isaac newton" at ranks 3, 904, 999
  - Exact duplicate: "confucius" at ranks 5, 598, 911
  - Exact duplicate: "johannes gutenberg" at ranks 8, 592
  - Exact duplicate: "albert einstein" at ranks 10, 903, 998

### DeepSeek V3.2 LIST 5 (January 18, 2026).txt
- **Model:** DeepSeek V3.2
- **Issues:** Issues: 645 exact duplicates; pattern collapse (max 711)
- **Details:**
  - Exact duplicate: "plato" at ranks 15, 78
  - Exact duplicate: "adam smith" at ranks 28, 86
  - Exact duplicate: "stephen hawking" at ranks 90, 164
  - Exact duplicate: "jrr tolkien" at ranks 109, 216
  - Exact duplicate: "jk rowling" at ranks 143, 218

### GLM 4.7 LIST 1 (January 14, 2026).txt
- **Model:** GLM 4.7
- **Issues:** Issues: 508 exact duplicates
- **Details:**
  - Exact duplicate: "louis pasteur" at ranks 11, 202, 307, 605, 802
  - Exact duplicate: "francis bacon" at ranks 12, 213, 323, 403, 512
  - Exact duplicate: "galileo galilei" at ranks 13, 345
  - Exact duplicate: "karl marx" at ranks 17, 363
  - Exact duplicate: "nicolaus copernicus" at ranks 18, 205, 342

### GLM 4.7 LIST 4 (January 18, 2026).txt
- **Model:** GLM 4.7
- **Issues:** Issues: 285 exact duplicates; pattern collapse (max 512)
- **Details:**
  - Exact duplicate: "nelson mandela" at ranks 58, 117
  - Exact duplicate: "stephen curry" at ranks 235, 719
  - Exact duplicate: "erling haaland" at ranks 248, 282
  - Exact duplicate: "zlatan ibrahimovi" at ranks 250, 284
  - Exact duplicate: "federico valverde" at ranks 311, 347

### GPT-5.2 Thinking LIST 2 (January 12, 2025).txt
- **Model:** GPT-5.2 Thinking
- **Issues:** Issues: 6 exact duplicates; pattern collapse (max 10); 500 entries (expected 1000)
- **Details:**
  - Exact duplicate: "zheng he" at ranks 47, 317
  - Exact duplicate: "suleiman the magnificent" at ranks 56, 360
  - Exact duplicate: "deng xiaoping" at ranks 115, 299
  - Exact duplicate: "hernn corts" at ranks 132, 445
  - Exact duplicate: "bartolom de las casas" at ranks 134, 446

### GPT-5.2 Thinking LIST 3 (January 12, 2025).txt
- **Model:** GPT-5.2 Thinking
- **Issues:** Issues: 1 exact duplicates; 777 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "deng xiaoping" at ranks 99, 340

### GPT-5.2 Thinking LIST 4 (January 12, 2025).txt
- **Model:** GPT-5.2 Thinking
- **Issues:** Issues: 3 exact duplicates; pattern collapse (max 10); 1026 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "deng xiaoping" at ranks 99, 340
  - Exact duplicate: "charles darwin dup avoided earlier list" at ranks 844, 985
  - Exact duplicate: "tim bernerslee dup avoided earlier list" at ranks 906, 999

### GPT-5.2 Thinking LIST 5 (January 13, 2025).txt
- **Model:** GPT-5.2 Thinking
- **Issues:** Issues: 255 exact duplicates
- **Details:**
  - Exact duplicate: "muhammad" at ranks 1, 360, 796
  - Exact duplicate: "jesus of nazareth" at ranks 2, 359, 795
  - Exact duplicate: "siddhartha gautama the buddha" at ranks 3, 794
  - Exact duplicate: "confucius" at ranks 4, 357, 391, 793
  - Exact duplicate: "qin shi huang" at ranks 5, 361

### GPT-5.2 Thinking LIST 6 (January 13, 2025).txt
- **Model:** GPT-5.2 Thinking
- **Issues:** Issues: 255 exact duplicates
- **Details:**
  - Exact duplicate: "muhammad" at ranks 1, 360, 796
  - Exact duplicate: "jesus of nazareth" at ranks 2, 359, 795
  - Exact duplicate: "siddhartha gautama the buddha" at ranks 3, 794
  - Exact duplicate: "confucius" at ranks 4, 357, 391, 793
  - Exact duplicate: "qin shi huang" at ranks 5, 361

### GPT-5.2 Thinking LIST 7 (January 13, 2025).txt
- **Model:** GPT-5.2 Thinking
- **Issues:** Issues: 3 exact duplicates; pattern collapse (max 10); 1027 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "deng xiaoping" at ranks 99, 340
  - Exact duplicate: "charles darwin dup avoided earlier list" at ranks 844, 985
  - Exact duplicate: "tim bernerslee dup avoided earlier list" at ranks 906, 999

### Gemini Flash 3 Preview LIST 1 (January 12, 2025).txt
- **Model:** Gemini Flash 3 Preview
- **Issues:** Issues: 204 exact duplicates; 1026 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "christopher columbus" at ranks 9, 759
  - Exact duplicate: "louis pasteur" at ranks 11, 737
  - Exact duplicate: "euclid" at ranks 14, 931
  - Exact duplicate: "charles darwin" at ranks 16, 728
  - Exact duplicate: "qin shi huang" at ranks 17, 862

### Gemini Flash 3 Preview LIST 2 (January 12, 2025).txt
- **Model:** Gemini Flash 3 Preview
- **Issues:** Issues: 267 exact duplicates; pattern collapse (max 11)
- **Details:**
  - Exact duplicate: "louis pasteur" at ranks 11, 886
  - Exact duplicate: "aristotle" at ranks 13, 853
  - Exact duplicate: "euclid" at ranks 14, 721
  - Exact duplicate: "constantine the great" at ranks 21, 568
  - Exact duplicate: "martin luther" at ranks 25, 658

### Gemini Flash 3 Preview LIST 3 (January 12, 2025).txt
- **Model:** Gemini Flash 3 Preview
- **Issues:** Issues: 303 exact duplicates; pattern collapse (max 22)
- **Details:**
  - Exact duplicate: "muhammad" at ranks 1, 916
  - Exact duplicate: "isaac newton" at ranks 2, 964
  - Exact duplicate: "jesus christ" at ranks 3, 915
  - Exact duplicate: "gautama buddha" at ranks 4, 914
  - Exact duplicate: "confucius" at ranks 5, 912

### Gemini Pro 3 LIST 1 (January 12, 2025).txt
- **Model:** Gemini Pro 3
- **Issues:** Issues: 21 exact duplicates; pattern collapse (max 14); 1028 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "johannes gutenberg" at ranks 8, 848
  - Exact duplicate: "louis pasteur" at ranks 11, 716, 853
  - Exact duplicate: "martin luther" at ranks 25, 729
  - Exact duplicate: "guglielmo marconi" at ranks 38, 708
  - Exact duplicate: "william harvey" at ranks 55, 903

### Gemini Pro 3 LIST 3 (January 13, 2025).txt
- **Model:** Gemini Pro 3
- **Issues:** Issues: 14 exact duplicates; pattern collapse (max 23); 1017 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "confucius" at ranks 5, 295
  - Exact duplicate: "martin luther" at ranks 25, 536
  - Exact duplicate: "alexander fleming" at ranks 43, 195
  - Exact duplicate: "gregor mendel" at ranks 58, 609
  - Exact duplicate: "joseph lister" at ranks 60, 601

### Gemini Pro 3 LIST 4 (January 13, 2025).txt
- **Model:** Gemini Pro 3
- **Issues:** Issues: 6 exact duplicates; 1004 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "gregor mendel" at ranks 58, 385
  - Exact duplicate: "sigmund freud" at ranks 69, 399
  - Exact duplicate: "pol pot" at ranks 111, 631
  - Exact duplicate: "akbar the great" at ranks 115, 341
  - Exact duplicate: "ada lovelace" at ranks 461, 707

### Gemini Pro 3 LIST 5 (January 13, 2025).txt
- **Model:** Gemini Pro 3
- **Issues:** Issues: 8 exact duplicates; pattern collapse (max 220); 1003 entries (expected 1000); non-sequential ranks
- **Details:**
  - Exact duplicate: "tim bernerslee" at ranks 102, 864
  - Exact duplicate: "suleiman the magnificent" at ranks 104, 197
  - Exact duplicate: "florence nightingale" at ranks 120, 571
  - Exact duplicate: "j robert oppenheimer" at ranks 134, 620
  - Exact duplicate: "socrates" at ranks 190, 412

### Gemini Pro 3 LIST 6 (January 14, 2026).txt
- **Model:** Gemini Pro 3
- **Issues:** Issues: 474 exact duplicates
- **Details:**
  - Exact duplicate: "louis pasteur" at ranks 11, 692
  - Exact duplicate: "antoine lavoisier" at ranks 20, 151, 228, 758
  - Exact duplicate: "james watt" at ranks 22, 658
  - Exact duplicate: "michael faraday" at ranks 23, 172
  - Exact duplicate: "james clerk maxwell" at ranks 24, 171, 201

### Gemini Pro 3 LIST 7 (January 14, 2026).txt
- **Model:** Gemini Pro 3
- **Issues:** Issues: 225 exact duplicates; pattern collapse (max 18)
- **Details:**
  - Exact duplicate: "isaac newton" at ranks 2, 788
  - Exact duplicate: "confucius" at ranks 5, 608
  - Exact duplicate: "johannes gutenberg" at ranks 8, 650
  - Exact duplicate: "albert einstein" at ranks 10, 796
  - Exact duplicate: "louis pasteur" at ranks 11, 555

### Grok 4 LIST 1 (January 14, 2026).txt
- **Model:** Grok 4
- **Issues:** Issues: 86 exact duplicates; pattern collapse (max 107)
- **Details:**
  - Exact duplicate: "genghis khan" at ranks 8, 204
  - Exact duplicate: "isaac newton" at ranks 9, 890
  - Exact duplicate: "vladimir lenin" at ranks 28, 458
  - Exact duplicate: "friedrich nietzsche" at ranks 34, 547
  - Exact duplicate: "ren descartes" at ranks 37, 880

### Grok 4 LIST 2 (January 14, 2026).txt
- **Model:** Grok 4
- **Issues:** Issues: 93 exact duplicates; pattern collapse (max 246)
- **Details:**
  - Exact duplicate: "albert einstein" at ranks 5, 868
  - Exact duplicate: "sigmund freud" at ranks 24, 299, 518
  - Exact duplicate: "nelson mandela" at ranks 36, 815
  - Exact duplicate: "martin luther king jr" at ranks 37, 834
  - Exact duplicate: "marie curie" at ranks 46, 775, 915

### Grok 4.1 Fast LIST 1 (January 14, 2026).txt
- **Model:** Grok 4.1 Fast
- **Issues:** Issues: 480 exact duplicates; pattern collapse (max 97)
- **Details:**
  - Exact duplicate: "jesus christ" at ranks 1, 936
  - Exact duplicate: "muhammad" at ranks 2, 937
  - Exact duplicate: "aristotle" at ranks 4, 938
  - Exact duplicate: "confucius" at ranks 5, 293, 579, 934
  - Exact duplicate: "plato" at ranks 6, 939

### Grok 4.1 Fast LIST 2 (January 14, 2026).txt
- **Model:** Grok 4.1 Fast
- **Issues:** Issues: 449 exact duplicates; pattern collapse (max 10)
- **Details:**
  - Exact duplicate: "albert einstein" at ranks 17, 899
  - Exact duplicate: "johannes gutenberg" at ranks 20, 101, 951
  - Exact duplicate: "martin luther" at ranks 21, 102
  - Exact duplicate: "ashoka the great" at ranks 23, 110
  - Exact duplicate: "mahatma gandhi" at ranks 25, 900

### Grok 4.1 Fast LIST 3 (January 14, 2026).txt
- **Model:** Grok 4.1 Fast
- **Issues:** Issues: 501 exact duplicates; pattern collapse (max 10)
- **Details:**
  - Exact duplicate: "confucius" at ranks 5, 553, 773
  - Exact duplicate: "laozi" at ranks 8, 554, 775
  - Exact duplicate: "charlemagne" at ranks 19, 295
  - Exact duplicate: "isaac newton" at ranks 20, 979
  - Exact duplicate: "charles darwin" at ranks 21, 172, 962

### Grok 4.1 Fast LIST 4 (January 14, 2026).txt
- **Model:** Grok 4.1 Fast
- **Issues:** Issues: 419 exact duplicates
- **Details:**
  - Exact duplicate: "confucius" at ranks 4, 850
  - Exact duplicate: "albert einstein" at ranks 8, 553
  - Exact duplicate: "charles darwin" at ranks 9, 104, 218
  - Exact duplicate: "karl marx" at ranks 10, 105, 675
  - Exact duplicate: "laozi" at ranks 11, 851

### Mistral Large 3 LIST 1 (January 15, 2026).txt
- **Model:** Mistral Large 3
- **Issues:** Issues: 266 exact duplicates; pattern collapse (max 86); 6 missing anchors
- **Details:**
  - Exact duplicate: "karl marx" at ranks 6, 239, 634, 640, 874
  - Exact duplicate: "leonardo da vinci" at ranks 9, 107
  - Exact duplicate: "martin luther" at ranks 15, 377
  - Exact duplicate: "adam smith" at ranks 16, 233, 632, 872
  - Exact duplicate: "thomas edison" at ranks 17, 86

### Mistral Large 3 LIST 2 (January 15, 2026).txt
- **Model:** Mistral Large 3
- **Issues:** Issues: 175 exact duplicates; pattern collapse (max 334)
- **Details:**
  - Exact duplicate: "leonardo da vinci" at ranks 8, 651
  - Exact duplicate: "william shakespeare" at ranks 9, 585
  - Exact duplicate: "thomas edison" at ranks 15, 78
  - Exact duplicate: "adam smith" at ranks 18, 67
  - Exact duplicate: "thomas jefferson" at ranks 29, 300

### Mistral Large 3 LIST 3 (January 16, 2026).txt
- **Model:** Mistral Large 3
- **Issues:** Issues: 467 exact duplicates; pattern collapse (max 571)
- **Details:**
  - Exact duplicate: "isaac newton" at ranks 3, 370
  - Exact duplicate: "karl marx" at ranks 6, 467
  - Exact duplicate: "charles darwin" at ranks 10, 401
  - Exact duplicate: "sigmund freud" at ranks 19, 426
  - Exact duplicate: "louis pasteur" at ranks 24, 403

### Mistral Large 3 LIST 4 (January 17, 2026).txt
- **Model:** Mistral Large 3
- **Issues:** Issues: 362 exact duplicates; pattern collapse (max 81); 7 missing anchors
- **Details:**
  - Exact duplicate: "adam smith" at ranks 12, 48
  - Exact duplicate: "thomas edison" at ranks 15, 395
  - Exact duplicate: "genghis khan" at ranks 17, 666, 947
  - Exact duplicate: "mahatma gandhi" at ranks 19, 673, 953
  - Exact duplicate: "henry ford" at ranks 32, 416, 806

### Mistral Large 3 LIST 5 (January 18, 2026).txt
- **Model:** Mistral Large 3
- **Issues:** Issues: 107 exact duplicates; pattern collapse (max 570); 10 missing anchors
- **Details:**
  - Exact duplicate: "isaac newton" at ranks 2, 28
  - Exact duplicate: "karl marx" at ranks 6, 161
  - Exact duplicate: "leonardo da vinci" at ranks 8, 251
  - Exact duplicate: "thomas edison" at ranks 15, 115
  - Exact duplicate: "adam smith" at ranks 17, 159

### Qwen3 235B A22B LIST 1 (January 18, 2026).txt
- **Model:** Qwen3 235B A22B
- **Issues:** Issues: 733 exact duplicates; pattern collapse (max 12)
- **Details:**
  - Exact duplicate: "aristotle" at ranks 4, 156
  - Exact duplicate: "confucius" at ranks 8, 159
  - Exact duplicate: "napoleon bonaparte" at ranks 12, 278
  - Exact duplicate: "plato" at ranks 14, 157
  - Exact duplicate: "socrates" at ranks 15, 158

### Qwen3 235B A22B LIST 2 (January 18, 2026).txt
- **Model:** Qwen3 235B A22B
- **Issues:** Issues: 920 exact duplicates; 10 missing anchors
- **Details:**
  - Exact duplicate: "socrates" at ranks 12, 82, 118, 154, 190, 226, 262, 298, 334, 370, 406, 442, 478, 514, 550, 586, 622, 658, 694, 730, 766, 802, 838, 874, 910, 946, 982
  - Exact duplicate: "napoleon iii" at ranks 31, 80, 116, 152, 188, 224, 260, 296, 332, 368, 404, 440, 476, 512, 548, 584, 620, 656, 692, 728, 764, 800, 836, 872, 908, 944, 980
  - Exact duplicate: "gautama buddha" at ranks 37, 51, 87, 123, 159, 195, 231, 267, 303, 339, 375, 411, 447, 483, 519, 555, 591, 627, 663, 699, 735, 771, 807, 843, 879, 915, 951, 987
  - Exact duplicate: "homer" at ranks 48, 84, 120, 156, 192, 228, 264, 300, 336, 372, 408, 444, 480, 516, 552, 588, 624, 660, 696, 732, 768, 804, 840, 876, 912, 948, 984
  - Exact duplicate: "avicenna" at ranks 49, 85, 121, 157, 193, 229, 265, 301, 337, 373, 409, 445, 481, 517, 553, 589, 625, 661, 697, 733, 769, 805, 841, 877, 913, 949, 985

### Qwen3 235B A22B LIST 3 (January 18, 2026).txt
- **Model:** Qwen3 235B A22B
- **Issues:** Issues: 306 exact duplicates; pattern collapse (max 24)
- **Details:**
  - Exact duplicate: "albert einstein" at ranks 6, 197
  - Exact duplicate: "plato" at ranks 7, 115
  - Exact duplicate: "aristotle" at ranks 8, 116
  - Exact duplicate: "napoleon bonaparte" at ranks 12, 172, 282, 575
  - Exact duplicate: "martin luther" at ranks 16, 146

### Qwen3 235B A22B LIST 4 (January 19, 2026).txt
- **Model:** Qwen3 235B A22B
- **Issues:** Issues: 356 exact duplicates; pattern collapse (max 20)
- **Details:**
  - Exact duplicate: "isaac newton" at ranks 3, 565
  - Exact duplicate: "albert einstein" at ranks 6, 625
  - Exact duplicate: "alexander the great" at ranks 9, 439
  - Exact duplicate: "julius caesar" at ranks 10, 444
  - Exact duplicate: "augustus" at ranks 11, 445

### Qwen3 235B A22B LIST 5 (January 13, 2026).txt
- **Model:** Qwen3 235B A22B
- **Issues:** Issues: 502 exact duplicates; pattern collapse (max 17)
- **Details:**
  - Exact duplicate: "karl marx" at ranks 10, 535
  - Exact duplicate: "mao zedong" at ranks 14, 557
  - Exact duplicate: "winston churchill" at ranks 21, 644
  - Exact duplicate: "adolf hitler" at ranks 22, 646
  - Exact duplicate: "immanuel kant" at ranks 24, 515

### Qwen3 235B A22B LIST 6 (January 13, 2026).txt
- **Model:** Qwen3 235B A22B
- **Issues:** Issues: 259 exact duplicates; pattern collapse (max 11)
- **Details:**
  - Exact duplicate: "albert einstein" at ranks 6, 544
  - Exact duplicate: "julius caesar" at ranks 10, 102
  - Exact duplicate: "augustus" at ranks 11, 103
  - Exact duplicate: "genghis khan" at ranks 12, 97, 205
  - Exact duplicate: "karl marx" at ranks 15, 228, 533, 775

### Qwen3 235B A22B LIST 7 (January 14, 2026).txt
- **Model:** Qwen3 235B A22B
- **Issues:** Issues: 452 exact duplicates; pattern collapse (max 24); 9 missing anchors
- **Details:**
  - Exact duplicate: "karl marx" at ranks 14, 171, 179
  - Exact duplicate: "genghis khan" at ranks 15, 467, 535
  - Exact duplicate: "adam smith" at ranks 17, 173, 181
  - Exact duplicate: "ashoka" at ranks 21, 83, 426, 541, 851, 869, 887, 914, 939, 989
  - Exact duplicate: "zoroaster" at ranks 22, 84


## Warning Lists

- **Claude Opus 4.5 LIST 1 (January 12, 2025).txt** (Claude Opus 4.5): Issues: 87 exact duplicates
- **Claude Opus 4.5 LIST 3 (January 12, 2025).txt** (Claude Opus 4.5): Issues: 2 exact duplicates; pattern collapse (max 65)
- **Claude Opus 4.5 LIST 5 (January 14, 2026).txt** (Claude Opus 4.5): Issues: 71 exact duplicates; pattern collapse (max 11)
- **Claude Sonnet 4.5 LIST 2 (January 12, 2025).txt** (Claude Sonnet 4.5): Issues: 72 exact duplicates
- **Claude Sonnet 4.5 LIST 4 (January 12, 2025).txt** (Claude Sonnet 4.5): Issues: 58 exact duplicates
- **Claude Sonnet 4.5 LIST 5 (January 13, 2025).txt** (Claude Sonnet 4.5): Issues: 36 exact duplicates; pattern collapse (max 36)
- **Claude Sonnet 4.5 LIST 6 (January 14, 2026).txt** (Claude Sonnet 4.5): Issues: 10 exact duplicates; pattern collapse (max 58)
- **Claude Sonnet 4.5 LIST 7 (January 14, 2026).txt** (Claude Sonnet 4.5): Issues: 6 exact duplicates; pattern collapse (max 59)
- **Claude Sonnet 4.5 LIST 8 (January 14, 2026).txt** (Claude Sonnet 4.5): Issues: 7 exact duplicates; pattern collapse (max 85)
- **GLM 4.7 LIST 2 (January 14, 2026).txt** (GLM 4.7): Issues: 91 exact duplicates; pattern collapse (max 40)
- **GLM 4.7 LIST 3 (January 14, 2026).txt** (GLM 4.7): Issues: 76 exact duplicates; pattern collapse (max 22)
- **GPT-5.2 Thinking LIST 11 (January 19, 2026).txt** (GPT-5.2 Thinking): Issues: 134 exact duplicates; pattern collapse (max 62)
- **GPT-5.2 Thinking LIST 9 (January 19, 2026).txt** (GPT-5.2 Thinking): Issues: 87 exact duplicates
- **Gemini Flash 3 Preview LIST 4 (January 12, 2025).txt** (Gemini Flash 3 Preview): Issues: 172 exact duplicates; pattern collapse (max 31)
- **Gemini Flash 3 Preview LIST 5 (January 12, 2025).txt** (Gemini Flash 3 Preview): Issues: 132 exact duplicates; pattern collapse (max 12)
- **Gemini Flash 3 Preview LIST 6 (January 19, 2026).txt** (Gemini Flash 3 Preview): Issues: 19 exact duplicates; pattern collapse (max 73)
- **Gemini Flash 3 Preview LIST 7 (January 19, 2026).txt** (Gemini Flash 3 Preview): Issues: 10 exact duplicates; pattern collapse (max 31); 5 missing anchors
- **Gemini Pro 3 LIST 2 (January 12, 2025).txt** (Gemini Pro 3): Issues: 55 exact duplicates; pattern collapse (max 56)
- **Grok 4 LIST 3 (January 14, 2026).txt** (Grok 4): Issues: 115 exact duplicates; pattern collapse (max 17)
- **Grok 4 LIST 4 (January 14, 2026).txt** (Grok 4): Issues: 162 exact duplicates; pattern collapse (max 29)
- **Grok 4 LIST 7 (January 19, 2026).txt** (Grok 4): Issues: 36 exact duplicates; pattern collapse (max 39)
- **Grok 4.1 Fast LIST 5 (January 15, 2026).txt** (Grok 4.1 Fast): Issues: 53 exact duplicates; pattern collapse (max 88)