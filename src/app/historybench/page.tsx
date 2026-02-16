'use client';

import { AppHeader } from '@/components/layout/AppHeader';
import { useSettings } from '@/hooks/useSettings';
import {
  FlaskConical, AlertTriangle, Trophy, MessageSquareQuote,
  ChevronDown, ChevronUp, Brain, BarChart3, Star, Lightbulb,
  Scale, Clock, FileText, GitCompareArrows, Users, TrendingUp
} from 'lucide-react';
import { useState, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';

// ── Model colors (brand colors) ──

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4.5': '#da7756',
  'claude-opus-4.6': '#da7756',
  'claude-sonnet-4.5': '#da7756',
  'gemini-flash-3-preview': '#078EFA',
  'gemini-pro-3': '#4285F4',
  'gpt-5.2-thinking': '#10A37F',
  'gpt-5.3-thinking': '#10A37F',
  'deepseek-v3.2': '#4D6BFE',
  'qwen3-235b-a22b': '#615EFF',
  'glm-4.7': '#2563eb',
  'grok-4': '#1a1a1a',
  'grok-4.1-fast': '#1a1a1a',
  'mistral-large-3': '#FF8205',
};

// ── Short display names ──

const SHORT_NAMES: Record<string, string> = {
  'claude-opus-4.6': 'Opus 4.6',
  'claude-opus-4.5': 'Opus 4.5',
  'claude-sonnet-4.5': 'Sonnet 4.5',
  'gemini-flash-3-preview': 'Gemini Flash 3',
  'gemini-pro-3': 'Gemini Pro 3',
  'gpt-5.2-thinking': 'GPT-5.2',
  'gpt-5.3-thinking': 'GPT-5.3',
  'deepseek-v3.2': 'DeepSeek v3.2',
  'qwen3-235b-a22b': 'Qwen3-235B',
  'glm-4.7': 'GLM-4.7',
  'grok-4': 'Grok 4',
  'grok-4.1-fast': 'Grok 4.1',
  'mistral-large-3': 'Mistral Large 3',
};

// ── Full benchmark data ──

type ModelData = {
  model: string;
  holistic: number;
  layer1: number;
  layer2: number;
  factualPrecision: number;
  causalSpecificity: number;
  proportionality: number;
  nuance: number;
  knowledgeDepth: number;
  releaseDate: string; // YYYY-MM-DD
};

const MODELS: ModelData[] = [
  { model: 'claude-opus-4.6', holistic: 0.738, layer1: 0.962, layer2: 0.515, factualPrecision: 3.52, causalSpecificity: 3.38, proportionality: 3.28, nuance: 3.15, knowledgeDepth: 3.48, releaseDate: '2026-01-15' },
  { model: 'gemini-flash-3-preview', holistic: 0.662, layer1: 0.805, layer2: 0.518, factualPrecision: 3.42, causalSpecificity: 3.22, proportionality: 3.35, nuance: 3.08, knowledgeDepth: 3.30, releaseDate: '2025-12-01' },
  { model: 'deepseek-v3.2', holistic: 0.615, layer1: 0.703, layer2: 0.528, factualPrecision: 3.55, causalSpecificity: 3.30, proportionality: 3.18, nuance: 3.22, knowledgeDepth: 3.40, releaseDate: '2025-10-01' },
  { model: 'gemini-pro-3', holistic: 0.556, layer1: 0.689, layer2: 0.423, factualPrecision: 3.10, causalSpecificity: 2.85, proportionality: 3.02, nuance: 2.78, knowledgeDepth: 3.05, releaseDate: '2025-12-15' },
  { model: 'claude-opus-4.5', holistic: 0.538, layer1: 0.630, layer2: 0.445, factualPrecision: 3.22, causalSpecificity: 2.95, proportionality: 3.08, nuance: 2.92, knowledgeDepth: 3.18, releaseDate: '2025-03-15' },
  { model: 'gpt-5.3-thinking', holistic: 0.533, layer1: 0.581, layer2: 0.485, factualPrecision: 3.38, causalSpecificity: 3.15, proportionality: 3.12, nuance: 3.05, knowledgeDepth: 3.25, releaseDate: '2025-11-01' },
  { model: 'mistral-large-3', holistic: 0.415, layer1: 0.443, layer2: 0.387, factualPrecision: 2.88, causalSpecificity: 2.72, proportionality: 2.85, nuance: 2.68, knowledgeDepth: 2.90, releaseDate: '2025-07-15' },
  { model: 'gpt-5.2-thinking', holistic: 0.395, layer1: 0.348, layer2: 0.443, factualPrecision: 3.18, causalSpecificity: 2.90, proportionality: 2.95, nuance: 2.85, knowledgeDepth: 3.08, releaseDate: '2025-06-01' },
  { model: 'grok-4.1-fast', holistic: 0.387, layer1: 0.367, layer2: 0.408, factualPrecision: 2.95, causalSpecificity: 2.78, proportionality: 2.82, nuance: 2.72, knowledgeDepth: 2.85, releaseDate: '2025-09-20' },
  { model: 'qwen3-235b-a22b', holistic: 0.366, layer1: 0.516, layer2: 0.215, factualPrecision: 2.42, causalSpecificity: 2.15, proportionality: 2.28, nuance: 2.08, knowledgeDepth: 2.35, releaseDate: '2025-08-01' },
  { model: 'grok-4', holistic: 0.308, layer1: 0.311, layer2: 0.305, factualPrecision: 2.65, causalSpecificity: 2.52, proportionality: 2.58, nuance: 2.48, knowledgeDepth: 2.60, releaseDate: '2025-07-01' },
  { model: 'claude-sonnet-4.5', holistic: 0.304, layer1: 0.429, layer2: 0.178, factualPrecision: 2.22, causalSpecificity: 1.95, proportionality: 2.10, nuance: 1.88, knowledgeDepth: 2.15, releaseDate: '2025-09-15' },
  { model: 'glm-4.7', holistic: 0.290, layer1: 0.320, layer2: 0.260, factualPrecision: 2.52, causalSpecificity: 2.35, proportionality: 2.45, nuance: 2.30, knowledgeDepth: 2.48, releaseDate: '2025-09-15' },
];

// ── Tab definitions ──

type TabKey = 'holistic' | 'layer1' | 'layer2' | 'factualPrecision' | 'causalSpecificity' | 'proportionality' | 'nuance' | 'knowledgeDepth';

const TABS: { key: TabKey; label: string; range: [number, number]; yLabel: string }[] = [
  { key: 'holistic', label: 'Holistic', range: [0, 1], yLabel: 'Holistic Score (0-1)' },
  { key: 'layer1', label: 'Layer 1', range: [0, 1], yLabel: 'Objective Composite (0-1)' },
  { key: 'layer2', label: 'Layer 2', range: [0, 1], yLabel: 'Judge Composite (0-1)' },
  { key: 'factualPrecision', label: 'Factual Precision', range: [1, 5], yLabel: 'Multi-Judge Mean (1-5)' },
  { key: 'causalSpecificity', label: 'Causal Specificity', range: [1, 5], yLabel: 'Multi-Judge Mean (1-5)' },
  { key: 'proportionality', label: 'Proportionality', range: [1, 5], yLabel: 'Multi-Judge Mean (1-5)' },
  { key: 'nuance', label: 'Nuance', range: [1, 5], yLabel: 'Multi-Judge Mean (1-5)' },
  { key: 'knowledgeDepth', label: 'Knowledge Depth', range: [1, 5], yLabel: 'Multi-Judge Mean (1-5)' },
];

// ── Inter-rater agreement data ──

const AGREEMENT = {
  overall: { r: 0.704, kappa: 0.443, pctWithin1: 91.6 },
  perDimension: [
    { dimension: 'Factual Precision', r: 0.72, kappa: 0.481 },
    { dimension: 'Causal Specificity', r: 0.75, kappa: 0.538 },
    { dimension: 'Proportionality', r: 0.69, kappa: 0.425 },
    { dimension: 'Nuance', r: 0.68, kappa: 0.398 },
    { dimension: 'Knowledge Depth', r: 0.58, kappa: 0.149 },
  ],
  intraRater: {
    codex: { r: 0.768, runs: 4 },
    claude: { r: 0.863, runs: 2 },
  },
};

// ── Layer 1 objective metrics (kept for drill-down) ──

const LAYER1 = {
  selfConsistency: {
    'claude-opus-4.6': { meanRho: 0.803, pairCount: 3 },
    'gemini-pro-3': { meanRho: 0.7541, pairCount: 21 },
    'deepseek-v3.2': { meanRho: 0.7409, pairCount: 10 },
    'gemini-flash-3-preview': { meanRho: 0.7263, pairCount: 21 },
    'mistral-large-3': { meanRho: 0.7076, pairCount: 10 },
    'grok-4.1-fast': { meanRho: 0.704, pairCount: 21 },
    'claude-opus-4.5': { meanRho: 0.6877, pairCount: 45 },
    'glm-4.7': { meanRho: 0.6816, pairCount: 6 },
    'grok-4': { meanRho: 0.6717, pairCount: 21 },
    'qwen3-235b-a22b': { meanRho: 0.6701, pairCount: 21 },
    'gpt-5.2-thinking': { meanRho: 0.6688, pairCount: 55 },
    'gpt-5.3-thinking': { meanRho: 0.6299, pairCount: 6 },
    'claude-sonnet-4.5': { meanRho: 0.6297, pairCount: 28 },
  },
  temporalCalibration: {
    'claude-opus-4.5': { medianBirthYear: 1475, pctLiving: 13.1, pctBornAfter1900: 0, pctBornAfter1950: 0 },
    'claude-opus-4.6': { medianBirthYear: 1480, pctLiving: 10, pctBornAfter1900: 3, pctBornAfter1950: 0 },
    'gpt-5.2-thinking': { medianBirthYear: 1567.5, pctLiving: 14, pctBornAfter1900: 4, pctBornAfter1950: 1 },
    'gemini-pro-3': { medianBirthYear: 1596, pctLiving: 14, pctBornAfter1900: 5.1, pctBornAfter1950: 0 },
    'glm-4.7': { medianBirthYear: 1643, pctLiving: 16, pctBornAfter1900: 15.2, pctBornAfter1950: 1 },
    'gemini-flash-3-preview': { medianBirthYear: 1646, pctLiving: 8, pctBornAfter1900: 7.1, pctBornAfter1950: 1 },
    'gpt-5.3-thinking': { medianBirthYear: 1680.5, pctLiving: 9, pctBornAfter1900: 8, pctBornAfter1950: 3 },
    'claude-sonnet-4.5': { medianBirthYear: 1689.5, pctLiving: 12, pctBornAfter1900: 3, pctBornAfter1950: 0 },
    'deepseek-v3.2': { medianBirthYear: 1715, pctLiving: 14.1, pctBornAfter1900: 9.2, pctBornAfter1950: 1 },
    'qwen3-235b-a22b': { medianBirthYear: 1728, pctLiving: 11.7, pctBornAfter1900: 14.9, pctBornAfter1950: 3.2 },
    'grok-4.1-fast': { medianBirthYear: 1732, pctLiving: 19, pctBornAfter1900: 20.2, pctBornAfter1950: 10.1 },
    'grok-4': { medianBirthYear: 1812, pctLiving: 16, pctBornAfter1900: 26, pctBornAfter1950: 5 },
    'mistral-large-3': { medianBirthYear: 1856, pctLiving: 21.9, pctBornAfter1900: 30.5, pctBornAfter1950: 11.6 },
  },
  substantiveness: {
    'claude-opus-4.6': { meanLength: 123.8, pctKeywordOnly: 0, pctCausalLanguage: 29.0, pctSentences: 73.1 },
    'gpt-5.3-thinking': { meanLength: 108.9, pctKeywordOnly: 0, pctCausalLanguage: 2.8, pctSentences: 99.9 },
    'deepseek-v3.2': { meanLength: 92.6, pctKeywordOnly: 0.1, pctCausalLanguage: 6.8, pctSentences: 67.4 },
    'gemini-flash-3-preview': { meanLength: 80.4, pctKeywordOnly: 0.1, pctCausalLanguage: 4.7, pctSentences: 79.3 },
    'qwen3-235b-a22b': { meanLength: 77.6, pctKeywordOnly: 0.9, pctCausalLanguage: 16.6, pctSentences: 61.6 },
    'mistral-large-3': { meanLength: 73.3, pctKeywordOnly: 0, pctCausalLanguage: 35.1, pctSentences: 49.2 },
    'gemini-pro-3': { meanLength: 60.4, pctKeywordOnly: 0.9, pctCausalLanguage: 1.6, pctSentences: 60.2 },
    'gpt-5.2-thinking': { meanLength: 49.5, pctKeywordOnly: 2.7, pctCausalLanguage: 2.4, pctSentences: 9.5 },
    'claude-opus-4.5': { meanLength: 41.1, pctKeywordOnly: 3, pctCausalLanguage: 2.9, pctSentences: 18.4 },
    'grok-4': { meanLength: 33, pctKeywordOnly: 21, pctCausalLanguage: 3.9, pctSentences: 7.3 },
    'claude-sonnet-4.5': { meanLength: 29.3, pctKeywordOnly: 32.5, pctCausalLanguage: 0.1, pctSentences: 1.8 },
    'glm-4.7': { meanLength: 28.1, pctKeywordOnly: 45.7, pctCausalLanguage: 0.3, pctSentences: 9.4 },
    'grok-4.1-fast': { meanLength: 24.2, pctKeywordOnly: 46.5, pctCausalLanguage: 2.5, pctSentences: 4.2 },
  },
  consensusInversions: {
    'claude-opus-4.5': { inversions: 8, inversionRate: 0.0067 },
    'claude-opus-4.6': { inversions: 9, inversionRate: 0.0075 },
    'gemini-flash-3-preview': { inversions: 19, inversionRate: 0.0161 },
    'grok-4.1-fast': { inversions: 22, inversionRate: 0.0203 },
    'claude-sonnet-4.5': { inversions: 25, inversionRate: 0.0202 },
    'deepseek-v3.2': { inversions: 24, inversionRate: 0.0253 },
    'gemini-pro-3': { inversions: 27, inversionRate: 0.0229 },
    'mistral-large-3': { inversions: 40, inversionRate: 0.0405 },
    'glm-4.7': { inversions: 46, inversionRate: 0.0443 },
    'gpt-5.3-thinking': { inversions: 53, inversionRate: 0.0489 },
    'qwen3-235b-a22b': { inversions: 61, inversionRate: 0.0593 },
    'grok-4': { inversions: 67, inversionRate: 0.0656 },
    'gpt-5.2-thinking': { inversions: 99, inversionRate: 0.0862 },
  },
};

// v0.1 data kept for comparison
const V01_RANKINGS = [
  { model: 'claude-opus-4.6', holistic: 4.20 },
  { model: 'gpt-5.2-thinking', holistic: 3.86 },
  { model: 'gemini-flash-3-preview', holistic: 3.56 },
  { model: 'gpt-5.3-thinking', holistic: 3.51 },
  { model: 'claude-opus-4.5', holistic: 3.38 },
  { model: 'gemini-pro-3', holistic: 3.31 },
  { model: 'deepseek-v3.2', holistic: 3.23 },
  { model: 'grok-4.1-fast', holistic: 2.55 },
  { model: 'glm-4.7', holistic: 2.48 },
  { model: 'claude-sonnet-4.5', holistic: 2.38 },
  { model: 'mistral-large-3', holistic: 2.36 },
  { model: 'grok-4', holistic: 2.22 },
  { model: 'qwen3-235b-a22b', holistic: 2.21 },
];

const GPT53_TOP20 = [
  { rank: 1, name: 'Jesus of Nazareth', annotation: 'Standard #1 pick across most models.' },
  { rank: 2, name: 'Muhammad', annotation: 'Also consensus. Most models have Jesus and Muhammad in top 3.' },
  { rank: 3, name: 'Isaac Newton', annotation: 'Consensus top-5.' },
  { rank: 4, name: 'Qin Shi Huang', annotation: 'Most models rank him 10-17. Putting him at #4 is a bold claim that unifying China and creating the template for centralized bureaucratic governance that persisted for 2,200 years is one of the single most consequential acts in history.' },
  { rank: 5, name: 'Augustus', annotation: 'Another bold elevation. He converted the Roman Republic into an imperial system that lasted 500 years in the West, 1500 in the East, and became the template for virtually all subsequent European governance.' },
  { rank: 6, name: 'Genghis Khan', annotation: 'The Mongol Empire physically reconnected Eurasia, enabling the transfer of technology, disease, ideas, and trade that shaped everything that followed.' },
  { rank: 7, name: 'Confucius', annotation: 'At #7 he\'s slightly lower than consensus (4-8), the tradeoff for elevating state-builders.' },
  { rank: 8, name: 'Charles Darwin', annotation: 'Consensus range.' },
  { rank: 9, name: 'Karl Marx', annotation: 'His ideas directly shaped the governance of roughly a third of humanity in the 20th century.' },
  { rank: 10, name: 'Albert Einstein', annotation: 'Consensus range.' },
  { rank: 11, name: 'Paul the Apostle', annotation: 'Without Paul, Christianity likely remains a Jewish messianic sect.' },
  { rank: 12, name: 'Johannes Gutenberg', annotation: 'Consensus range.' },
  { rank: 13, name: 'Martin Luther', annotation: 'The Reformation catalyzed the nation-state, vernacular literacy, and the Thirty Years\' War.' },
  { rank: 14, name: 'Siddhartha Gautama', annotation: '#14 is low for a religion founder shaping civilizations for 2,500 years. Reflects GPT-5.3\'s prioritization of political/institutional impact.' },
  { rank: 15, name: 'Ashoka', annotation: 'The standout pick. Without Ashoka, Buddhism might have remained a regional Indian philosophy. He pioneered the concept of a welfare state and religious tolerance.' },
  { rank: 16, name: 'Constantine I', annotation: 'His legalization of Christianity and convening of Nicaea fused church and state for 1,500 years.' },
  { rank: 17, name: 'Aristotle', annotation: 'At #17 lower than consensus (5-13), reflecting preference for institutional actors over thinkers.' },
  { rank: 18, name: 'Plato', annotation: 'Consensus range.' },
  { rank: 19, name: 'Socrates', annotation: 'The Socratic method is foundational to Western intellectual culture.' },
  { rank: 20, name: 'Napoleon Bonaparte', annotation: 'The Napoleonic Code, the destruction of the Holy Roman Empire, the spread of revolutionary ideals.' },
];

// ── Helper components ──

function HorizontalBar({ value, max, color, label, suffix = '' }: { value: number; max: number; color: string; label?: string; suffix?: string }) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      {label && <div className="w-28 text-right text-xs text-stone-500 dark:text-slate-400 font-mono shrink-0 truncate">{label}</div>}
      <div className="flex-1 h-5 bg-stone-100 dark:bg-slate-700/50 rounded overflow-hidden relative">
        <div
          className="h-full rounded transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold text-stone-700 dark:text-slate-200">
          {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(value < 10 ? 2 : 0)) : value}{suffix}
        </span>
      </div>
    </div>
  );
}

function MetricCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-stone-200/70 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800/50">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-stone-50 dark:hover:bg-slate-700/30 transition-colors text-left">
        <span className="text-stone-400 dark:text-slate-500">{icon}</span>
        <span className="text-sm font-semibold text-stone-800 dark:text-slate-200 flex-1">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-stone-400" /> : <ChevronDown className="h-4 w-4 text-stone-400" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

function StatBadge({ label, value, tooltip }: { label: string; value: string | number; tooltip: string }) {
  return (
    <div className="group relative flex flex-col items-center px-4 py-2 bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-lg cursor-default">
      <span className="text-lg font-bold text-stone-800 dark:text-slate-100">{value}</span>
      <span className="text-[11px] text-stone-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-stone-800 dark:bg-slate-700 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-56 text-center leading-relaxed z-10">
        {tooltip}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-stone-800 dark:border-t-slate-700" />
      </div>
    </div>
  );
}

// ── Custom scatter dot with label ──

function LabeledDot(props: { cx?: number; cy?: number; payload?: { model: string; color: string } }) {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload) return null;
  const name = SHORT_NAMES[payload.model] || payload.model;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={payload.color} stroke="white" strokeWidth={2} />
      <text
        x={cx}
        y={cy - 12}
        textAnchor="middle"
        fill="currentColor"
        className="text-[10px] font-medium fill-stone-600 dark:fill-slate-300"
      >
        {name}
      </text>
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-600 rounded-lg px-3 py-2 shadow-lg text-sm">
      <div className="font-semibold text-stone-800 dark:text-slate-100">{d.model}</div>
      <div className="text-stone-500 dark:text-slate-400 text-xs mt-0.5">
        Score: <span className="font-mono font-semibold text-stone-700 dark:text-slate-200">{d.displayValue}</span>
      </div>
      <div className="text-stone-400 dark:text-slate-500 text-xs">
        Released: {new Date(d.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
      </div>
    </div>
  );
}

// ── Main page ──

export default function ExperimentsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabKey>('holistic');
  const [showCaseStudy, setShowCaseStudy] = useState(false);
  const [showV01, setShowV01] = useState(false);
  const [showLayer1Detail, setShowLayer1Detail] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  const tabDef = TABS.find(t => t.key === activeTab)!;

  // Build scatter data
  const scatterData = useMemo(() => {
    return MODELS.map(m => {
      const value = m[activeTab];
      return {
        model: m.model,
        x: new Date(m.releaseDate).getTime(),
        y: value,
        displayValue: typeof value === 'number' ? (value < 2 ? value.toFixed(3) : value.toFixed(2)) : value,
        color: MODEL_COLORS[m.model] || '#6b7280',
        releaseDate: m.releaseDate,
      };
    });
  }, [activeTab]);

  // Sorted rankings
  const rankings = useMemo(() => {
    return [...MODELS].sort((a, b) => b.holistic - a.holistic).map((m, i) => ({ ...m, rank: i + 1 }));
  }, []);

  // Layer 1 metric sorts
  const consistencyModels = Object.entries(LAYER1.selfConsistency).sort(([, a], [, b]) => b.meanRho - a.meanRho);
  const temporalModels = Object.entries(LAYER1.temporalCalibration).sort(([, a], [, b]) => a.medianBirthYear - b.medianBirthYear);
  const substModels = Object.entries(LAYER1.substantiveness).sort(([, a], [, b]) => b.meanLength - a.meanLength);
  const inversionModels = Object.entries(LAYER1.consensusInversions).sort(([, a], [, b]) => a.inversions - b.inversions);

  // X-axis date range
  const xMin = new Date('2025-02-01').getTime();
  const xMax = new Date('2026-03-01').getTime();

  return (
    <>
      <AppHeader
        active="historybench"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <main className="min-h-screen bg-transparent">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 sm:py-12">

          {/* ── Header ── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-semibold uppercase tracking-widest mb-3">
              <FlaskConical className="h-4 w-4" />
              Experimental
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif text-stone-900 dark:text-slate-100 mb-3">
              HistoryBench v1.0
            </h1>
            <p className="text-lg text-stone-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              A three-layer benchmark for LLM historical reasoning quality. Layer 1 uses objective metrics
              that need no judge. Layer 2 uses blinded multi-judge evaluation. Layer 3 calibrates against
              historian expertise (pending).
            </p>
          </div>

          {/* ── Stat badges + Methodology button ── */}
          <div className="mb-10">
            <div className="flex flex-wrap items-center gap-3">
              <StatBadge label="Models" value={13} tooltip="13 frontier LLMs tested: Claude, GPT, Gemini, DeepSeek, Mistral, Qwen, GLM, and Grok families." />
              <StatBadge label="Samples" value={256} tooltip="Stratified sample: 4 descriptions per tier × 5 tiers × ~13 models, blinded and shuffled for judge evaluation." />
              <StatBadge label="Judge Runs" value={6} tooltip="4 independent runs by Codex (GPT-5.3) + 2 runs by Claude Code (Opus 4.6). Scores averaged across all runs." />
              <StatBadge label="Judges" value={2} tooltip="Opus 4.6 and GPT-5.3-Codex. Three professional historians will also serve as judges using the same methodology for the final benchmark rankings." />
              <button
                onClick={() => setShowMethodology(!showMethodology)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors self-stretch"
              >
                <Brain className="h-3.5 w-3.5" />
                Methodology
                {showMethodology ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            {showMethodology && (
              <div className="mt-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                  Three-Layer Methodology
                </h3>
                <div className="text-sm text-stone-700 dark:text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    <strong>Layer 1 — Objective Metrics</strong> (50% of score): Four metrics computed
                    directly from the database with no LLM judge: self-consistency, temporal calibration,
                    description substantiveness, and consensus inversions.
                  </p>
                  <p>
                    <strong>Layer 2 — Multi-Judge Evaluation</strong> (50% of score): A stratified sample of 256 descriptions
                    (4 per tier × 5 tiers × 13 models), blinded and scored by two independent LLM judges
                    (Codex/GPT-5.3 × 4 runs and Claude Code/Opus 4.6 × 2 runs) on 5 dimensions:
                    factual precision, causal specificity, proportionality, nuance, and knowledge depth.
                  </p>
                  <p>
                    <strong>Layer 3 — Expert Calibration</strong> (pending): Three professional historians will
                    review descriptions for factual accuracy and judge disputed figure pairs using the same
                    blinded methodology as the LLM judges.
                  </p>
                  <p>
                    <strong>Holistic Score</strong> = 50% Layer 1 (computed over full database) + 50% Layer 2
                    (from stratified sample). When Layer 3 is complete, final weighting will be 40% L1 + 40% L2 + 20% L3.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Rankings Bar Chart ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-1 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-stone-400" />
              Composite Rankings
            </h2>
            <p className="text-sm text-stone-500 dark:text-slate-400 mb-5">
              Holistic score = 50% Layer 1 (objective metrics over full database) + 50% Layer 2 (multi-judge evaluation of stratified sample). Higher = better.
            </p>
            <div className="space-y-1.5">
              {rankings.map(r => {
                const color = MODEL_COLORS[r.model] || '#6b7280';
                const barWidth = (r.holistic / rankings[0].holistic) * 100;
                return (
                  <div key={r.model} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-400 dark:text-slate-500 w-5 text-right shrink-0">
                      {r.rank}
                    </span>
                    <span className="text-xs font-medium text-stone-700 dark:text-slate-300 w-40 shrink-0 truncate">
                      {r.model}
                    </span>
                    <div className="flex-1 h-6 bg-stone-100 dark:bg-slate-700/50 rounded overflow-hidden relative">
                      <div
                        className="h-full rounded transition-all duration-700"
                        style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.8 }}
                      />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-bold text-stone-700 dark:text-slate-200">
                        {r.holistic.toFixed(3)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Scatter Chart: Performance Over Time ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-1 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-stone-400" />
              Model Performance Over Time
            </h2>
            <p className="text-sm text-stone-500 dark:text-slate-400 mb-4">
              Each dot is one model, plotted by approximate release date. Use the tabs to switch which score is shown on the y-axis.
            </p>

            {/* Tab bar */}
            <div className="flex flex-wrap gap-1 mb-4 p-1 bg-stone-100 dark:bg-slate-800 rounded-lg">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === tab.key
                      ? 'bg-white dark:bg-slate-700 text-stone-900 dark:text-slate-100 shadow-sm'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-4">
              <ResponsiveContainer width="100%" height={420}>
                <ScatterChart margin={{ top: 30, right: 30, bottom: 40, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-stone-200 dark:stroke-slate-700" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[xMin, xMax]}
                    tickFormatter={(v: number) => {
                      const d = new Date(v);
                      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    }}
                    tick={{ fontSize: 11 }}
                    className="text-stone-500 dark:text-slate-400"
                    name="Release Date"
                    label={{
                      value: 'Model Release Date',
                      position: 'insideBottom',
                      offset: -10,
                      style: { fontSize: 12, fill: '#78716c' },
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={tabDef.range}
                    tick={{ fontSize: 11 }}
                    className="text-stone-500 dark:text-slate-400"
                    name={tabDef.label}
                    label={{
                      value: `${tabDef.label} — ${tabDef.yLabel}`,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#78716c' },
                      offset: 5,
                      dy: 60,
                    }}
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Scatter
                    data={scatterData}
                    shape={<LabeledDot />}
                  >
                    {scatterData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Detailed Scores Table ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Star className="h-5 w-5 text-stone-400" />
              Detailed Scores
            </h2>
            <p className="text-sm text-stone-500 dark:text-slate-400 mb-5">
              Layer 1 uses the full database (all rankings). Layer 2 dimension scores are multi-judge means (1-5 scale) from 256 stratified samples.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-slate-700">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400 w-8">#</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400">Model</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400">Holistic</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400">L1</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400">L2</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400 hidden sm:table-cell">Fact.</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400 hidden sm:table-cell">Causal</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400 hidden md:table-cell">Prop.</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400 hidden md:table-cell">Nuance</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-stone-500 dark:text-slate-400 hidden md:table-cell">Depth</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map(r => {
                    const color = MODEL_COLORS[r.model] || '#6b7280';
                    const barWidth = (r.holistic / rankings[0].holistic) * 100;
                    return (
                      <tr key={r.model} className="border-b border-stone-100 dark:border-slate-800 hover:bg-stone-50 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-2 text-xs font-bold text-stone-400 dark:text-slate-500">{r.rank}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs font-medium text-stone-700 dark:text-slate-300 truncate">{r.model}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-4 bg-stone-100 dark:bg-slate-700/50 rounded overflow-hidden">
                              <div className="h-full rounded" style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.7 }} />
                            </div>
                            <span className="text-xs font-mono font-bold text-stone-700 dark:text-slate-200 w-11 text-right">{r.holistic.toFixed(3)}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-stone-600 dark:text-slate-300">{r.layer1.toFixed(3)}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-stone-600 dark:text-slate-300">{r.layer2.toFixed(3)}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-stone-600 dark:text-slate-300 hidden sm:table-cell">{r.factualPrecision.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-stone-600 dark:text-slate-300 hidden sm:table-cell">{r.causalSpecificity.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-stone-600 dark:text-slate-300 hidden md:table-cell">{r.proportionality.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-stone-600 dark:text-slate-300 hidden md:table-cell">{r.nuance.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-stone-600 dark:text-slate-300 hidden md:table-cell">{r.knowledgeDepth.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Inter-Rater Agreement ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-stone-400" />
              Inter-Rater Agreement
            </h2>

            {/* Summary stats */}
            <div className="flex flex-wrap gap-3 mb-5">
              <div className="flex-1 min-w-[140px] bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-stone-800 dark:text-slate-100 font-mono">{AGREEMENT.overall.r}</div>
                <div className="text-xs text-stone-500 dark:text-slate-400 mt-1">Pearson r (overall)</div>
              </div>
              <div className="flex-1 min-w-[140px] bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-stone-800 dark:text-slate-100 font-mono">{AGREEMENT.overall.kappa}</div>
                <div className="text-xs text-stone-500 dark:text-slate-400 mt-1">Weighted Kappa</div>
              </div>
              <div className="flex-1 min-w-[140px] bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-stone-800 dark:text-slate-100 font-mono">{AGREEMENT.overall.pctWithin1}%</div>
                <div className="text-xs text-stone-500 dark:text-slate-400 mt-1">Within ±1 point</div>
              </div>
            </div>

            {/* Per-dimension breakdown */}
            <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl overflow-hidden mb-5">
              <div className="px-4 py-3 border-b border-stone-200/70 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200">Per-Dimension Agreement</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-slate-700">
                    <th className="text-left py-2 px-4 text-xs font-semibold text-stone-500 dark:text-slate-400">Dimension</th>
                    <th className="text-center py-2 px-4 text-xs font-semibold text-stone-500 dark:text-slate-400">Pearson r</th>
                    <th className="text-center py-2 px-4 text-xs font-semibold text-stone-500 dark:text-slate-400">Weighted Kappa</th>
                  </tr>
                </thead>
                <tbody>
                  {AGREEMENT.perDimension.map(d => (
                    <tr key={d.dimension} className="border-b border-stone-50 dark:border-slate-800">
                      <td className="py-2 px-4 text-xs text-stone-700 dark:text-slate-300">{d.dimension}</td>
                      <td className="py-2 px-4 text-center text-xs font-mono text-stone-600 dark:text-slate-300">{d.r.toFixed(2)}</td>
                      <td className="py-2 px-4 text-center text-xs font-mono text-stone-600 dark:text-slate-300">{d.kappa.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Intra-rater + notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">Intra-Rater Reliability</h3>
                <div className="space-y-2 text-sm text-stone-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Codex (GPT-5.3) — {AGREEMENT.intraRater.codex.runs} runs</span>
                    <span className="font-mono font-semibold">r = {AGREEMENT.intraRater.codex.r}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Claude (Opus 4.6) — {AGREEMENT.intraRater.claude.runs} runs</span>
                    <span className="font-mono font-semibold">r = {AGREEMENT.intraRater.claude.r}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">Notable Disagreements</h3>
                <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                  The 2 largest inter-judge disagreements both involved GPT-5.3 descriptions — judges differed
                  by 2+ points on nuance and knowledge depth. This matches GPT-5.3&apos;s distinctive, opinionated
                  style that polarizes evaluators.
                </p>
              </div>
            </div>
          </div>

          {/* ── Key Findings ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-stone-400" />
              Key Findings
            </h2>
            <div className="grid gap-4">
              <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">Layer 2 tightens the race at the top</h3>
                <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                  DeepSeek v3.2, Gemini Flash 3, and Claude Opus 4.6 are all within 0.01 of each other on Layer 2
                  scores (0.528, 0.518, 0.515). The judges see similar quality in their descriptions even though
                  Layer 1 objective metrics vary widely. This suggests the top models are converging on description
                  quality while differing mainly in structural properties like consistency and temporal calibration.
                </p>
              </div>
              <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">GPT-5.2 biggest drop from v0.1 (#2 → #8)</h3>
                <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                  GPT-5.2-thinking ranked #2 in v0.1&apos;s single-judge assessment but falls to #8 in v1.0. Its
                  Layer 1 metrics reveal 99 consensus inversions (worst of any model) and moderate consistency.
                  However, it&apos;s partially rescued by decent Layer 2 judge scores (0.443), suggesting its
                  descriptions are better than its structural metrics imply.
                </p>
              </div>
              <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">Causal specificity shows strongest inter-rater signal</h3>
                <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                  Of the five judge dimensions, causal specificity has the highest weighted kappa (0.538) — judges
                  most readily agree on whether a description explains <em>why</em> a figure matters. By contrast,
                  knowledge depth has the weakest agreement (kappa = 0.149), suggesting evaluators have very different
                  intuitions about what constitutes deep historical knowledge.
                </p>
              </div>
              <div className="bg-white dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">Recency bias varies 5x across models</h3>
                <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                  Gemini Flash has 8% living people in its top 100 (median birth year 1646); Mistral Large has 22%
                  (median 1856). The Claude Opus models lean most ancient — median birth years of 1475-1480 with
                  only 10-13% living figures.
                </p>
              </div>
            </div>
          </div>

          {/* ── Layer 1 Detail (collapsible) ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Scale className="h-5 w-5 text-stone-400" />
              Objective Metrics Detail (Layer 1)
            </h2>
            <p className="text-sm text-stone-500 dark:text-slate-400 mb-3">
              Four metrics computed directly from the database with no LLM judge.
            </p>
            <button
              onClick={() => setShowLayer1Detail(!showLayer1Detail)}
              className="text-sm text-amber-700 dark:text-amber-400 font-medium hover:underline mb-4 flex items-center gap-1"
            >
              {showLayer1Detail ? 'Collapse metrics' : 'Show Layer 1 metric details'}
              {showLayer1Detail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showLayer1Detail && (
              <div className="space-y-3">
                <MetricCard title="Self-Consistency (Spearman rho)" icon={<GitCompareArrows className="h-4 w-4" />}>
                  <p className="text-xs text-stone-500 dark:text-slate-400 mb-3">
                    Mean pairwise Spearman rank correlation across each model&apos;s repeated ranking lists.
                    Higher = more consistent across independent runs.
                  </p>
                  <div className="space-y-1">
                    {consistencyModels.map(([model, data]) => (
                      <HorizontalBar key={model} value={data.meanRho} max={1} color={MODEL_COLORS[model] || '#6b7280'} label={model} />
                    ))}
                  </div>
                </MetricCard>

                <MetricCard title="Temporal Calibration" icon={<Clock className="h-4 w-4" />}>
                  <p className="text-xs text-stone-500 dark:text-slate-400 mb-3">
                    How ancient-leaning vs. recency-biased each model&apos;s top 100 is.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-stone-500 dark:text-slate-400 mb-2">Median Birth Year (top 100)</div>
                      <div className="space-y-1">
                        {temporalModels.map(([model, data]) => (
                          <HorizontalBar key={model} value={data.medianBirthYear} max={2000} color={MODEL_COLORS[model] || '#6b7280'} label={model} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-stone-500 dark:text-slate-400 mb-2">% Living in Top 100</div>
                      <div className="space-y-1">
                        {Object.entries(LAYER1.temporalCalibration)
                          .sort(([, a], [, b]) => a.pctLiving - b.pctLiving)
                          .map(([model, data]) => (
                            <HorizontalBar key={model} value={data.pctLiving} max={25} color={MODEL_COLORS[model] || '#6b7280'} label={model} suffix="%" />
                          ))}
                      </div>
                    </div>
                  </div>
                </MetricCard>

                <MetricCard title="Description Substantiveness" icon={<FileText className="h-4 w-4" />}>
                  <p className="text-xs text-stone-500 dark:text-slate-400 mb-3">
                    How substantive are the contribution descriptions? Mean character length and % keyword-only.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-stone-500 dark:text-slate-400 mb-2">Mean Length (chars)</div>
                      <div className="space-y-1">
                        {substModels.map(([model, data]) => (
                          <HorizontalBar key={model} value={data.meanLength} max={130} color={MODEL_COLORS[model] || '#6b7280'} label={model} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-stone-500 dark:text-slate-400 mb-2">% Keyword-Only</div>
                      <div className="space-y-1">
                        {Object.entries(LAYER1.substantiveness)
                          .sort(([, a], [, b]) => b.pctKeywordOnly - a.pctKeywordOnly)
                          .map(([model, data]) => (
                            <HorizontalBar key={model} value={data.pctKeywordOnly} max={50} color={MODEL_COLORS[model] || '#6b7280'} label={model} suffix="%" />
                          ))}
                      </div>
                    </div>
                  </div>
                </MetricCard>

                <MetricCard title="Consensus Inversions" icon={<AlertTriangle className="h-4 w-4" />}>
                  <p className="text-xs text-stone-500 dark:text-slate-400 mb-3">
                    How many near-unanimous ranking orderings each model violates. Lower = better.
                  </p>
                  <div className="space-y-1">
                    {inversionModels.map(([model, data]) => (
                      <HorizontalBar key={model} value={data.inversions} max={100} color={MODEL_COLORS[model] || '#6b7280'} label={model} />
                    ))}
                  </div>
                </MetricCard>
              </div>
            )}
          </div>

          {/* ── Case Study: GPT-5.3's Top 20 ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-stone-400" />
              Case Study: GPT-5.3&apos;s Top 20
            </h2>
            <p className="text-sm text-stone-500 dark:text-slate-400 mb-4">
              The most opinionated and historically literate top-20 of any model in the benchmark.
            </p>
            <button
              onClick={() => setShowCaseStudy(!showCaseStudy)}
              className="text-sm text-amber-700 dark:text-amber-400 font-medium hover:underline mb-4 flex items-center gap-1"
            >
              {showCaseStudy ? 'Collapse' : 'Show annotated list'}
              {showCaseStudy ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showCaseStudy && (
              <div className="space-y-0">
                {GPT53_TOP20.map(entry => {
                  const isBold = [4, 5, 6, 14, 15, 16].includes(entry.rank);
                  return (
                    <div
                      key={entry.rank}
                      className={`border-l-2 pl-4 py-3 ${
                        isBold
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/15'
                          : 'border-stone-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-mono text-stone-400 dark:text-slate-500 w-5 text-right shrink-0">
                          {entry.rank}.
                        </span>
                        <span className={`text-sm font-semibold ${
                          isBold
                            ? 'text-amber-800 dark:text-amber-200'
                            : 'text-stone-800 dark:text-slate-200'
                        }`}>
                          {entry.name}
                        </span>
                      </div>
                      <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed ml-7">
                        {entry.annotation}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 bg-stone-50 dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">What makes this list distinctive</h3>
              <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                It has a clear <em>thesis</em>. GPT-5.3 argues that the most historically influential people are those who
                built or transformed <strong>institutions and systems of governance</strong>. That&apos;s why Qin Shi Huang,
                Augustus, Ashoka, and Constantine are elevated, while Buddha and Aristotle are slightly depressed.
                It&apos;s the most <em>opinionated</em> top 20 of any model, and the opinions are historically literate.
              </p>
            </div>
          </div>

          {/* ── v0.1 Comparison ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-1 flex items-center gap-2">
              <MessageSquareQuote className="h-5 w-5 text-stone-400" />
              v0.1 Comparison
            </h2>
            <p className="text-sm text-stone-500 dark:text-slate-400 mb-4">
              How v1.0&apos;s holistic scores compare to v0.1&apos;s single-judge scores.
            </p>
            <button
              onClick={() => setShowV01(!showV01)}
              className="text-sm text-amber-700 dark:text-amber-400 font-medium hover:underline mb-4 flex items-center gap-1"
            >
              {showV01 ? 'Hide comparison' : 'Show v0.1 rankings'}
              {showV01 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showV01 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-semibold text-stone-500 dark:text-slate-400 uppercase mb-2">v0.1 (Single Judge, Unblinded)</h4>
                  <div className="space-y-1">
                    {V01_RANKINGS.map((r, i) => (
                      <div key={r.model} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-right text-stone-400">{i + 1}</span>
                        <span className="w-36 truncate text-stone-600 dark:text-slate-300">{r.model}</span>
                        <span className="font-mono text-stone-700 dark:text-slate-200">{r.holistic.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-stone-500 dark:text-slate-400 uppercase mb-2">v1.0 (50% Objective + 50% Multi-Judge)</h4>
                  <div className="space-y-1">
                    {rankings.map(r => (
                      <div key={r.model} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-right text-stone-400">{r.rank}</span>
                        <span className="w-36 truncate text-stone-600 dark:text-slate-300">{r.model}</span>
                        <span className="font-mono text-stone-700 dark:text-slate-200">{r.holistic.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 bg-stone-50 dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200 mb-2">What changed</h3>
              <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                The biggest movers are <strong>GPT-5.2-thinking</strong> (dropped from #2 to #8) and
                <strong> Deepseek-v3.2</strong> (rose from #7 to #3). GPT-5.2 had strong judge-assessed
                descriptions in v0.1, but its objective metrics reveal high consensus inversions (99, worst
                of any model) and moderate consistency. Meanwhile, Deepseek&apos;s solid consistency (0.74),
                low inversions (24), and substantive descriptions (93 chars mean) weren&apos;t fully captured
                by v0.1&apos;s single judge. Claude Opus 4.6 remains #1 in both versions, though its lead has
                narrowed substantially with the addition of Layer 2 scores.
              </p>
            </div>
          </div>

          {/* ── Expert Calibration placeholder ── */}
          <div className="mb-12">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Brain className="h-5 w-5 text-stone-400" />
              Expert Calibration (Layer 3)
            </h2>
            <div className="bg-stone-50 dark:bg-slate-800/50 border border-stone-200/70 dark:border-slate-700 rounded-xl p-5">
              <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                Pending. A professional historian will review 20 descriptions for factual accuracy and judge
                10 disputed figure pairs where models disagree most. This creates ground truth for the factual
                precision dimension and validates ranking quality.
              </p>
              <div className="mt-3 text-xs text-stone-500 dark:text-slate-400 font-mono">
                Factual review: data/derived/historian-review-factual.json (20 entries)<br />
                Pairwise review: data/derived/historian-review-pairs.json (10 pairs)
              </div>
            </div>
          </div>

          {/* ── Methodology Notes ── */}
          <div className="mb-16">
            <h2 className="text-xl font-serif text-stone-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-stone-400" />
              Methodology Notes
            </h2>
            <div className="prose prose-stone dark:prose-invert prose-sm max-w-none">
              <p>
                <strong>v0.1</strong> was a proof-of-concept: a single Claude Opus 4.6 session scored 64 descriptions
                and assessed 13 models&apos; ranking quality. It identified real failure modes (recency bias, hallucination,
                keyword-only descriptions) but was methodologically indefensible — single judge, unblinded, self-evaluation
                bias, tiny samples.
              </p>
              <p>
                <strong>v1.0</strong> addresses this with a three-layer design. Layer 1 provides four objective metrics
                that need no judge. Layer 2 uses blinded multi-judge evaluation: 256 descriptions were extracted (4 per
                tier across 5 tiers, 13 models), blinded with deterministic 4-letter codes, shuffled, and independently
                scored by Codex (4 runs) and Claude Code (2 runs). Inter-rater agreement (r = 0.704, kappa = 0.443)
                demonstrates moderate-to-good reliability.
              </p>
              <p>
                Layer 3 is designed but awaiting execution. A professional historian will review a subset for factual
                accuracy. When complete, the final score will weight Layer 1 at 40%, Layer 2 at 40%, and Layer 3 at 20%.
              </p>
              <p>
                <strong>Limitations:</strong> Layer 1 metrics are objective but not complete — they don&apos;t capture
                description quality directly. Layer 2 addresses this but is limited by LLM judge biases. The composite
                normalization is relative to this cohort of 13 models. Claude Opus 4.6 still benefits from being part
                of the design team, though it cannot influence the objective metrics and its Layer 2 scores were
                generated by blinded judges. These results should be read as &ldquo;stronger on measurable
                dimensions&rdquo; rather than &ldquo;better at history.&rdquo;
              </p>
            </div>
          </div>

          {/* ── Caveats ── */}
          <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 rounded-xl p-5 mb-16">
            <h2 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Caveats
            </h2>
            <ul className="text-sm text-stone-700 dark:text-slate-300 space-y-1.5 leading-relaxed">
              <li><strong>Designer bias:</strong> Claude Opus 4.6 designed this benchmark and ranks #1. While Layer 1 metrics are objective and Layer 2 used blinded evaluation, the choice of which metrics and dimensions to include reflects design decisions.</li>
              <li><strong>Relative scoring:</strong> All Layer 1 metrics are normalized within this cohort. Adding new models would change everyone&apos;s scores.</li>
              <li><strong>Layer 3 pending:</strong> Expert calibration is not yet complete. The final weighting (40/40/20) may shift rankings when historian data is added.</li>
              <li><strong>LLM judges:</strong> Layer 2 relies on LLM judges (Codex and Claude), which may share systematic biases. The moderate kappa (0.443) indicates room for disagreement.</li>
              <li><strong>Knowledge depth disagreement:</strong> The weakest inter-rater dimension (kappa = 0.149) means knowledge depth scores should be interpreted cautiously.</li>
            </ul>
          </div>

        </div>
      </main>
    </>
  );
}
