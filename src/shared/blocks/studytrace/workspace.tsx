'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Files,
  FileText,
  Link as LinkIcon,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';

type EvidenceKind =
  | 'draft'
  | 'source'
  | 'ai-disclosure'
  | 'feedback'
  | 'version'
  | 'process'
  | 'other';

type EvidenceStrength = 'strong' | 'medium' | 'weak';

type UploadedEvidenceFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
  lastModified: string;
  lastModifiedLabel: string;
  category: EvidenceKind;
  extractedText?: string;
};

type EvidenceCard = {
  id: string;
  title: string;
  kind: EvidenceKind;
  source: string;
  fileId?: string;
  summary: string;
  notes: string;
  strength: EvidenceStrength;
  tags: string[];
  riskFlags: string[];
};

type TimelineEvent = {
  id: string;
  date: string;
  label: string;
  detail: string;
  source: string;
  strength: EvidenceStrength;
};

type StudyTraceSettings = {
  evidenceStandard: 'balanced' | 'strict';
  riskSensitivity: number;
  aiPolicy: 'none' | 'assistive-only' | 'drafting-with-disclosure';
  includeDetectorCaveat: boolean;
  includeCitationAudit: boolean;
  requiredEvidenceKinds: EvidenceKind[];
};

type StudyTraceAnalysis = {
  trustScore: number;
  summary: string;
  riskItems: string[];
  timelineFindings: string[];
  evidenceGaps: string[];
  appealOutline: string[];
  aiBoundaryStatement: string;
  exportChecklist: string[];
  providerStatus?: string;
};

const STORAGE_KEY = 'studytrace-workspace-v1';
const MAX_TEXT_SNIPPET_LENGTH = 12_000;
const MAX_SAVED_ITEMS = 120;
const MAX_SAVED_TEXT_LENGTH = 1_200;
const MAX_SAVED_ANALYSIS_ITEMS = 20;

const evidenceKindLabels: Record<EvidenceKind, string> = {
  draft: '草稿与版本',
  source: '引用来源',
  'ai-disclosure': 'AI 使用边界',
  feedback: '反馈与批注',
  version: '版本历史',
  process: '写作过程',
  other: '其他材料',
};

const marketSignals = [
  {
    name: '写作过程信号',
    source: 'GPTZero Authorship',
    detail: '关注复制粘贴、编辑时长、协作者数量、版本变化等过程证据。',
  },
  {
    name: '相似度与引用检查',
    source: 'Turnitin Draft Coach',
    detail: '把相似度、引用规范、语法反馈拆成独立检查维度。',
  },
  {
    name: '解释型风险信号',
    source: 'Copyleaks AI Logic',
    detail: '不仅给风险分数，还解释触发信号、文本片段和可能来源。',
  },
  {
    name: '多维内容质量',
    source: 'Originality.ai',
    detail: 'AI、抄袭、事实、可读性、语法等可以组合成报告维度。',
  },
];

const defaultSettings: StudyTraceSettings = {
  evidenceStandard: 'balanced',
  riskSensitivity: 62,
  aiPolicy: 'assistive-only',
  includeDetectorCaveat: true,
  includeCitationAudit: true,
  requiredEvidenceKinds: ['draft', 'source', 'ai-disclosure', 'process'],
};

const initialAnalysis: StudyTraceAnalysis = {
  trustScore: 38,
  summary:
    '先上传草稿、参考文献、反馈记录和 AI 使用说明，系统会把材料整理成证据卡、时间线和申诉报告草稿。',
  riskItems: ['当前材料不足，无法形成可信的写作过程链。'],
  timelineFindings: ['尚未建立时间线。'],
  evidenceGaps: ['缺少草稿版本、引用来源和 AI 使用边界说明。'],
  appealOutline: ['补充材料后生成申诉陈述。'],
  aiBoundaryStatement:
    '请说明 AI 是否用于选题、提纲、润色、语法检查或资料整理。',
  exportChecklist: ['上传至少 3 类证据。', '填写课程与作业信息。'],
  providerStatus: 'local',
};

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateLabel(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未识别时间';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toDateTimeInput(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function getExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function guessEvidenceKind(file: File): EvidenceKind {
  const name = file.name.toLowerCase();
  const ext = getExtension(file.name);
  if (
    name.includes('citation') ||
    name.includes('source') ||
    name.includes('reference') ||
    name.includes('bibliography') ||
    name.includes('quote') ||
    name.includes('引用') ||
    name.includes('参考')
  ) {
    return 'source';
  }
  if (
    name.includes('ai') ||
    name.includes('chatgpt') ||
    name.includes('prompt') ||
    name.includes('声明')
  ) {
    return 'ai-disclosure';
  }
  if (
    name.includes('feedback') ||
    name.includes('comment') ||
    name.includes('rubric') ||
    name.includes('批注') ||
    name.includes('反馈')
  ) {
    return 'feedback';
  }
  if (
    name.includes('history') ||
    name.includes('version') ||
    name.includes('版本') ||
    ['gdoc', 'docx', 'doc', 'pages'].includes(ext)
  ) {
    return 'version';
  }
  if (
    name.includes('draft') ||
    name.includes('outline') ||
    name.includes('草稿') ||
    name.includes('提纲')
  ) {
    return 'draft';
  }
  return 'process';
}

function isTextReadable(file: File) {
  const ext = getExtension(file.name);
  return (
    file.type.startsWith('text/') ||
    [
      'txt',
      'md',
      'markdown',
      'csv',
      'json',
      'rtf',
      'html',
      'xml',
      'bib',
    ].includes(ext)
  );
}

async function readTextSnippet(file: File) {
  if (!isTextReadable(file)) return '';
  const text = await file.text();
  return text.slice(0, MAX_TEXT_SNIPPET_LENGTH);
}

function truncateSavedText(value: unknown, maxLength = MAX_SAVED_TEXT_LENGTH) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function takeSavedItems<T>(items: T[] | undefined) {
  return Array.isArray(items) ? items.slice(0, MAX_SAVED_ITEMS) : [];
}

function sanitizeSavedFile(file: UploadedEvidenceFile): UploadedEvidenceFile {
  return {
    id: file.id,
    name: truncateSavedText(file.name, 240),
    size: Number(file.size) || 0,
    type: truncateSavedText(file.type, 120) || 'unknown',
    extension: truncateSavedText(file.extension, 40),
    lastModified: truncateSavedText(file.lastModified, 80),
    lastModifiedLabel: truncateSavedText(file.lastModifiedLabel, 80),
    category: file.category,
  };
}

function sanitizeSavedCard(card: EvidenceCard): EvidenceCard {
  return {
    id: card.id,
    title: truncateSavedText(card.title, 240),
    kind: card.kind,
    source: truncateSavedText(card.source, 240),
    fileId: card.fileId,
    summary: truncateSavedText(card.summary),
    notes: truncateSavedText(card.notes),
    strength: card.strength,
    tags: takeSavedItems(card.tags).map((tag) => truncateSavedText(tag, 80)),
    riskFlags: takeSavedItems(card.riskFlags).map((flag) =>
      truncateSavedText(flag, 160)
    ),
  };
}

function sanitizeSavedTimelineEvent(event: TimelineEvent): TimelineEvent {
  return {
    id: event.id,
    date: truncateSavedText(event.date, 80),
    label: truncateSavedText(event.label, 240),
    detail: truncateSavedText(event.detail),
    source: truncateSavedText(event.source, 240),
    strength: event.strength,
  };
}

function sanitizeSavedAnalysis(
  analysis: StudyTraceAnalysis
): StudyTraceAnalysis {
  return {
    trustScore: Number(analysis.trustScore) || 0,
    summary: truncateSavedText(analysis.summary),
    riskItems: takeSavedItems(analysis.riskItems)
      .slice(0, MAX_SAVED_ANALYSIS_ITEMS)
      .map((item) => truncateSavedText(item)),
    timelineFindings: takeSavedItems(analysis.timelineFindings)
      .slice(0, MAX_SAVED_ANALYSIS_ITEMS)
      .map((item) => truncateSavedText(item)),
    evidenceGaps: takeSavedItems(analysis.evidenceGaps)
      .slice(0, MAX_SAVED_ANALYSIS_ITEMS)
      .map((item) => truncateSavedText(item)),
    appealOutline: takeSavedItems(analysis.appealOutline)
      .slice(0, MAX_SAVED_ANALYSIS_ITEMS)
      .map((item) => truncateSavedText(item)),
    aiBoundaryStatement: truncateSavedText(analysis.aiBoundaryStatement),
    exportChecklist: takeSavedItems(analysis.exportChecklist)
      .slice(0, MAX_SAVED_ANALYSIS_ITEMS)
      .map((item) => truncateSavedText(item)),
    providerStatus: analysis.providerStatus,
  };
}

function isQuotaExceededError(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }

  return error instanceof Error && error.name.includes('Quota');
}

function strengthFromKind(kind: EvidenceKind): EvidenceStrength {
  if (['version', 'draft', 'source'].includes(kind)) return 'strong';
  if (['feedback', 'ai-disclosure', 'process'].includes(kind)) return 'medium';
  return 'weak';
}

function buildCardFromFile(file: UploadedEvidenceFile): EvidenceCard {
  const kindLabel = evidenceKindLabels[file.category];
  const preview = file.extractedText
    ? file.extractedText.replace(/\s+/g, ' ').slice(0, 180)
    : '';

  return {
    id: newId(),
    title: file.name,
    kind: file.category,
    source: '上传文件',
    fileId: file.id,
    summary: preview
      ? `${kindLabel}：${preview}`
      : `${kindLabel}：${file.extension || file.type || '未知格式'} 文件，${formatFileSize(file.size)}。`,
    notes: '',
    strength: strengthFromKind(file.category),
    tags: [kindLabel, file.extension || 'file'].filter(Boolean),
    riskFlags: [],
  };
}

function buildTimelineFromFile(file: UploadedEvidenceFile): TimelineEvent {
  return {
    id: newId(),
    date: toDateTimeInput(file.lastModified),
    label: `上传证据：${file.name}`,
    detail: `${evidenceKindLabels[file.category]}，文件最后修改时间为 ${file.lastModifiedLabel}。`,
    source: '文件时间戳',
    strength: strengthFromKind(file.category),
  };
}

function getLocalAnalysis({
  files,
  cards,
  timeline,
  aiBoundary,
  settings,
}: {
  files: UploadedEvidenceFile[];
  cards: EvidenceCard[];
  timeline: TimelineEvent[];
  aiBoundary: string;
  settings: StudyTraceSettings;
}): StudyTraceAnalysis {
  const presentKinds = new Set(cards.map((card) => card.kind));
  const missingRequired = settings.requiredEvidenceKinds.filter(
    (kind) => !presentKinds.has(kind)
  );
  const strongCards = cards.filter((card) => card.strength === 'strong').length;
  const chronologicalEvents = timeline.filter((event) => event.date).length;
  const boundaryReady = aiBoundary.trim().length >= 40;
  const sourceCount = cards.filter((card) => card.kind === 'source').length;

  const score = Math.max(
    8,
    Math.min(
      94,
      Math.round(
        22 +
          Math.min(files.length, 8) * 4 +
          Math.min(cards.length, 10) * 3 +
          strongCards * 5 +
          Math.min(chronologicalEvents, 8) * 4 +
          (boundaryReady ? 14 : 0) +
          (sourceCount >= 2 ? 8 : 0) -
          missingRequired.length * 7
      )
    )
  );

  const riskItems = [
    missingRequired.length
      ? `缺少 ${missingRequired.map((kind) => evidenceKindLabels[kind]).join('、')}，容易让申诉材料显得片面。`
      : '核心证据类型已覆盖，后续重点是补充每张卡与作业要求的对应关系。',
    chronologicalEvents < 4
      ? '时间线事件偏少，建议补充选题、查资料、提纲、初稿、修改、最终提交等节点。'
      : '时间线已经能呈现连续写作过程。',
    boundaryReady
      ? 'AI 使用边界有基本说明，建议继续写明具体工具、用途和未用于代写的范围。'
      : 'AI 使用边界说明太短，容易被解读为回避关键问题。',
  ];

  if (settings.includeCitationAudit && sourceCount < 2) {
    riskItems.push(
      '引用来源证据不足，建议上传参考文献、阅读笔记、数据库检索截图或网页保存记录。'
    );
  }

  return {
    trustScore: score,
    summary:
      score >= 75
        ? '材料已经接近可提交状态，重点检查时间线一致性、引用来源可验证性和 AI 使用声明措辞。'
        : score >= 50
          ? '材料有初步可信度，但还需要补足关键证据并把每项材料与作业过程对应起来。'
          : '当前材料仍偏分散，建议先建立完整时间线，再补齐草稿、来源和 AI 边界证据。',
    riskItems,
    timelineFindings: [
      chronologicalEvents
        ? `已识别 ${chronologicalEvents} 个带时间的过程节点。`
        : '未识别到可用时间节点。',
      cards.some((card) => card.kind === 'draft')
        ? '已有草稿类证据，可支撑“逐步写作”叙事。'
        : '缺少草稿或阶段版本，较难证明文本不是一次性生成。',
      cards.some((card) => card.kind === 'feedback')
        ? '已有反馈或批注，可作为人与人互动、修改过程的旁证。'
        : '可以补充教师、同伴、导师反馈来增强过程可信度。',
    ],
    evidenceGaps: missingRequired.length
      ? missingRequired.map((kind) => `补充${evidenceKindLabels[kind]}。`)
      : ['把每张证据卡的“说明”写成可直接引用的申诉语言。'],
    appealOutline: [
      '说明作业背景、提交时间和被质疑的问题。',
      '按时间线解释写作过程：选题、资料检索、提纲、草稿、修改和最终稿。',
      '列出引用来源与阅读/摘录证据，说明哪些观点来自外部材料。',
      '说明 AI 工具的使用边界，区分允许的辅助和未发生的代写行为。',
      '请求复核时附上证据清单，并承认可改进的引用或披露细节。',
    ],
    aiBoundaryStatement:
      aiBoundary.trim() ||
      '我仅在允许范围内使用 AI 进行语法检查、结构建议或资料整理，没有让 AI 直接代写最终正文。具体使用记录见证据卡。',
    exportChecklist: [
      '报告中不要声称“检测器一定错误”，而是强调证据链和复核请求。',
      '每个引用来源都应能被打开或由截图、笔记、书目信息验证。',
      'AI 使用说明要具体到工具、日期、用途和是否进入最终稿。',
      '导出前删除无关私人信息，只保留与申诉相关的证据。',
    ],
    providerStatus: 'local',
  };
}

export function StudyTraceWorkspace() {
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [courseName, setCourseName] = useState('');
  const [institutionPolicy, setInstitutionPolicy] = useState('');
  const [concern, setConcern] = useState('');
  const [aiBoundary, setAiBoundary] = useState(
    '我使用 AI 的范围仅限于理解题目、整理提纲、检查语法或润色个别句子；最终观点、资料选择、段落组织和正文表达由我完成。'
  );
  const [files, setFiles] = useState<UploadedEvidenceFile[]>([]);
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [settings, setSettings] = useState<StudyTraceSettings>(defaultSettings);
  const [analysis, setAnalysis] = useState<StudyTraceAnalysis>(initialAnalysis);
  const [activeTab, setActiveTab] = useState('upload');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [manualCard, setManualCard] = useState({
    title: '',
    kind: 'process' as EvidenceKind,
    summary: '',
    notes: '',
  });
  const [manualEvent, setManualEvent] = useState({
    date: toDateTimeInput(new Date()),
    label: '',
    detail: '',
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const data = JSON.parse(saved);
      setAssignmentTitle(data.assignmentTitle || '');
      setCourseName(data.courseName || '');
      setInstitutionPolicy(data.institutionPolicy || '');
      setConcern(data.concern || '');
      setAiBoundary(data.aiBoundary || aiBoundary);
      setFiles(
        takeSavedItems<UploadedEvidenceFile>(data.files).map(sanitizeSavedFile)
      );
      setCards(takeSavedItems<EvidenceCard>(data.cards).map(sanitizeSavedCard));
      setTimeline(
        takeSavedItems<TimelineEvent>(data.timeline).map(
          sanitizeSavedTimelineEvent
        )
      );
      setSettings(data.settings || defaultSettings);
      setAnalysis(
        data.analysis ? sanitizeSavedAnalysis(data.analysis) : initialAnalysis
      );
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const snapshot = {
      assignmentTitle,
      courseName,
      institutionPolicy: truncateSavedText(institutionPolicy),
      concern: truncateSavedText(concern),
      aiBoundary: truncateSavedText(aiBoundary),
      files: takeSavedItems(files).map(sanitizeSavedFile),
      cards: takeSavedItems(cards).map(sanitizeSavedCard),
      timeline: takeSavedItems(timeline).map(sanitizeSavedTimelineEvent),
      settings,
      analysis: sanitizeSavedAnalysis(analysis),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn('Failed to save StudyTrace workspace snapshot', error);
        return;
      }

      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            assignmentTitle,
            courseName,
            institutionPolicy: truncateSavedText(institutionPolicy, 400),
            concern: truncateSavedText(concern, 400),
            aiBoundary: truncateSavedText(aiBoundary, 400),
            files: takeSavedItems(files).map(sanitizeSavedFile),
            settings,
          })
        );
        setStatusMessage(
          '浏览器本地草稿空间不足，已只保存基础信息和文件列表。'
        );
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setStatusMessage('浏览器本地草稿空间不足，已暂停本地自动保存。');
      }
    }
  }, [
    assignmentTitle,
    courseName,
    institutionPolicy,
    concern,
    aiBoundary,
    files,
    cards,
    timeline,
    settings,
    analysis,
  ]);

  const localAnalysis = useMemo(
    () =>
      getLocalAnalysis({
        files,
        cards,
        timeline,
        aiBoundary,
        settings,
      }),
    [files, cards, timeline, aiBoundary, settings]
  );

  const coverage = useMemo(() => {
    const kinds = new Set(cards.map((card) => card.kind));
    return settings.requiredEvidenceKinds.map((kind) => ({
      kind,
      label: evidenceKindLabels[kind],
      ready: kinds.has(kind),
    }));
  }, [cards, settings.requiredEvidenceKinds]);

  const sortedTimeline = useMemo(
    () =>
      [...timeline].sort((a, b) => {
        const left = new Date(a.date).getTime() || 0;
        const right = new Date(b.date).getTime() || 0;
        return left - right;
      }),
    [timeline]
  );

  const handleFiles = async (incomingFiles: FileList | File[]) => {
    const list = Array.from(incomingFiles);
    if (!list.length) return;

    setStatusMessage('正在整理上传材料...');
    const nextFiles: UploadedEvidenceFile[] = [];
    const nextCards: EvidenceCard[] = [];
    const nextEvents: TimelineEvent[] = [];

    for (const file of list) {
      const category = guessEvidenceKind(file);
      const uploadedFile: UploadedEvidenceFile = {
        id: newId(),
        name: file.name,
        size: file.size,
        type: file.type || 'unknown',
        extension: getExtension(file.name),
        lastModified: new Date(file.lastModified).toISOString(),
        lastModifiedLabel: formatDateLabel(file.lastModified),
        category,
        extractedText: await readTextSnippet(file),
      };

      nextFiles.push(uploadedFile);
      nextCards.push(buildCardFromFile(uploadedFile));
      nextEvents.push(buildTimelineFromFile(uploadedFile));
    }

    setFiles((prev) => [...nextFiles, ...prev]);
    setCards((prev) => [...nextCards, ...prev]);
    setTimeline((prev) => [...nextEvents, ...prev]);
    setAnalysis(
      getLocalAnalysis({
        files: [...nextFiles, ...files],
        cards: [...nextCards, ...cards],
        timeline: [...nextEvents, ...timeline],
        aiBoundary,
        settings,
      })
    );
    setStatusMessage(`已生成 ${nextCards.length} 张证据卡和时间线节点。`);
    setActiveTab('cards');
  };

  const addManualCard = () => {
    if (!manualCard.title.trim() && !manualCard.summary.trim()) {
      setStatusMessage('请先填写证据标题或说明。');
      return;
    }

    const kind = manualCard.kind;
    const card: EvidenceCard = {
      id: newId(),
      title: manualCard.title || evidenceKindLabels[kind],
      kind,
      source: '手动录入',
      summary: manualCard.summary,
      notes: manualCard.notes,
      strength: strengthFromKind(kind),
      tags: [evidenceKindLabels[kind]],
      riskFlags: [],
    };

    setCards((prev) => [card, ...prev]);
    setManualCard({
      title: '',
      kind: 'process',
      summary: '',
      notes: '',
    });
    setStatusMessage('已添加证据卡。');
  };

  const addManualEvent = () => {
    if (!manualEvent.label.trim()) {
      setStatusMessage('请填写时间线节点标题。');
      return;
    }

    setTimeline((prev) => [
      {
        id: newId(),
        date: manualEvent.date,
        label: manualEvent.label,
        detail: manualEvent.detail,
        source: '手动录入',
        strength: 'medium',
      },
      ...prev,
    ]);
    setManualEvent({
      date: toDateTimeInput(new Date()),
      label: '',
      detail: '',
    });
    setStatusMessage('已添加时间线节点。');
  };

  const updateCard = (id: string, patch: Partial<EvidenceCard>) => {
    setCards((prev) =>
      prev.map((card) => (card.id === id ? { ...card, ...patch } : card))
    );
  };

  const deleteCard = (id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  };

  const deleteTimelineEvent = (id: string) => {
    setTimeline((prev) => prev.filter((event) => event.id !== id));
  };

  const runAnalysis = async () => {
    const fallback = getLocalAnalysis({
      files,
      cards,
      timeline,
      aiBoundary,
      settings,
    });

    if (!cards.length) {
      setAnalysis(fallback);
      setStatusMessage('请先上传或录入证据材料。');
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage('正在生成风险解释和申诉结构...');

    try {
      const response = await fetch('/api/studytrace/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignment: {
            title: assignmentTitle,
            courseName,
            institutionPolicy,
            concern,
          },
          files,
          evidenceCards: cards,
          timelineEvents: sortedTimeline,
          aiBoundary,
          settings,
          localAnalysis: fallback,
        }),
      });

      const result = await response.json();
      if (!response.ok || result.code !== 0) {
        throw new Error(result.message || 'analysis failed');
      }

      setAnalysis(result.data.analysis);
      setStatusMessage(
        result.data.analysis.providerStatus === 'ai'
          ? 'AI 分析已完成。'
          : '已生成本地分析；登录或配置服务后可获得 AI 版本。'
      );
    } catch (error) {
      setAnalysis(fallback);
      setStatusMessage(
        error instanceof Error && error.message.includes('auth')
          ? 'AI 分析需要登录；当前已生成本地版本。'
          : error instanceof Error && error.message.includes('credits')
            ? 'AI 分析需要可用积分；当前已生成本地版本。'
            : 'AI 分析暂不可用，已生成本地版本。'
      );
    } finally {
      setIsAnalyzing(false);
      setActiveTab('report');
    }
  };

  const report = useMemo(() => {
    const evidenceLines = cards
      .map(
        (card, index) =>
          `${index + 1}. ${card.title}｜${evidenceKindLabels[card.kind]}｜可信度：${card.strength}\n   - ${card.summary || '未填写摘要'}\n   - 说明：${card.notes || '未填写'}`
      )
      .join('\n');

    const timelineLines = sortedTimeline
      .map(
        (event, index) =>
          `${index + 1}. ${event.date ? formatDateLabel(event.date) : '未填写时间'}｜${event.label}\n   - ${event.detail || '未填写'}\n   - 来源：${event.source}`
      )
      .join('\n');

    return `# 写作过程与 AI 使用边界说明

## 基本信息

- 作业：${assignmentTitle || '未填写'}
- 课程：${courseName || '未填写'}
- 质疑点：${concern || '未填写'}
- 学校/课程政策：${institutionPolicy || '未填写'}

## 总结

可信材料评分：${analysis.trustScore}/100

${analysis.summary}

## AI 使用边界

${analysis.aiBoundaryStatement || aiBoundary || '未填写'}

## 证据卡

${evidenceLines || '暂无证据卡。'}

## 时间线

${timelineLines || '暂无时间线。'}

## 风险解释

${analysis.riskItems.map((item) => `- ${item}`).join('\n')}

## 需要补充的材料

${analysis.evidenceGaps.map((item) => `- ${item}`).join('\n')}

## 申诉陈述结构

${analysis.appealOutline.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## 导出前检查

${analysis.exportChecklist.map((item) => `- ${item}`).join('\n')}
`;
  }, [
    aiBoundary,
    analysis,
    assignmentTitle,
    cards,
    concern,
    courseName,
    institutionPolicy,
    sortedTimeline,
  ]);

  const downloadReport = () => {
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `studytrace-report-${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setStatusMessage('报告已复制到剪贴板。');
    } catch {
      setStatusMessage('复制失败，请使用导出按钮。');
    }
  };

  const printReport = () => {
    window.print();
  };

  const resetWorkspace = () => {
    setAssignmentTitle('');
    setCourseName('');
    setInstitutionPolicy('');
    setConcern('');
    setAiBoundary(
      '我使用 AI 的范围仅限于理解题目、整理提纲、检查语法或润色个别句子；最终观点、资料选择、段落组织和正文表达由我完成。'
    );
    setFiles([]);
    setCards([]);
    setTimeline([]);
    setSettings(defaultSettings);
    setAnalysis(initialAnalysis);
    setStatusMessage('工作区已重置。');
  };

  return (
    <main className="bg-muted/20 min-h-dvh">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #studytrace-report, #studytrace-report * { visibility: visible; }
          #studytrace-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
            color: #111827;
            background: white;
          }
        }
      `}</style>

      <section className="bg-background border-b">
        <div className="container py-6 md:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge variant="outline" className="gap-2">
                <ShieldCheck className="size-3.5" />
                StudyTrace
              </Badge>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-normal md:text-4xl">
                  写作过程证据工作台
                </h1>
                <p className="text-muted-foreground text-sm leading-6 md:text-base">
                  把草稿、引用来源、反馈、AI
                  使用记录和时间线整理成一份可复核的申诉材料。
                </p>
              </div>
            </div>

            <div className="bg-card grid grid-cols-3 gap-2 rounded-md border p-2 text-center shadow-sm md:min-w-[360px]">
              <Metric label="证据卡" value={cards.length} />
              <Metric label="时间节点" value={timeline.length} />
              <Metric
                label="可信评分"
                value={analysis.trustScore}
                suffix="/100"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="container grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="size-5" />
                基本信息
              </CardTitle>
              <CardDescription>
                这些字段会进入最终报告，用来解释申诉背景和政策边界。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="作业标题">
                <Input
                  value={assignmentTitle}
                  onChange={(event) => setAssignmentTitle(event.target.value)}
                  placeholder="例如：Research Essay Final Draft"
                />
              </Field>
              <Field label="课程名称">
                <Input
                  value={courseName}
                  onChange={(event) => setCourseName(event.target.value)}
                  placeholder="例如：Academic Writing 101"
                />
              </Field>
              <Field label="被质疑的问题">
                <Textarea
                  value={concern}
                  onChange={(event) => setConcern(event.target.value)}
                  placeholder="例如：AI 检测显示高风险，但我有完整草稿和引用过程。"
                  className="min-h-24"
                />
              </Field>
              <Field label="课程/学校 AI 政策">
                <Textarea
                  value={institutionPolicy}
                  onChange={(event) => setInstitutionPolicy(event.target.value)}
                  placeholder="粘贴老师或学校对 AI 使用、引用、申诉流程的要求。"
                  className="min-h-24"
                />
              </Field>
              <Field label="AI 使用边界说明" className="md:col-span-2">
                <Textarea
                  value={aiBoundary}
                  onChange={(event) => setAiBoundary(event.target.value)}
                  className="min-h-28"
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-blue-200 bg-blue-50/60 dark:border-blue-950 dark:bg-blue-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-5" />
                隐私与 AI 分析提示
              </CardTitle>
              <CardDescription className="leading-6">
                文本类文件只在当前浏览器会话中读取预览；本地保存时不会持久化完整提取文本。
                点击“生成风险解释”后，证据摘要、时间线和必要文本片段会发送到配置的
                StudyTrace AI 服务用于分析。导出或提交前请移除无关个人信息。
              </CardDescription>
            </CardHeader>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="studytrace-no-print grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5">
              <TabsTrigger value="upload">上传</TabsTrigger>
              <TabsTrigger value="cards">证据卡</TabsTrigger>
              <TabsTrigger value="timeline">时间线</TabsTrigger>
              <TabsTrigger value="risk">风险解释</TabsTrigger>
              <TabsTrigger value="report">导出</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4 space-y-4">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UploadCloud className="size-5" />
                    上传材料
                  </CardTitle>
                  <CardDescription>
                    支持任意格式。文本类文件会读取预览；PDF、DOCX、图片、压缩包等会保留元数据用于证据组织。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label
                    htmlFor="studytrace-files"
                    className="bg-muted/30 hover:bg-muted/50 flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-4 text-center transition"
                  >
                    <div className="bg-background rounded-md border p-3 shadow-sm">
                      <Files className="text-primary size-8" />
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium">选择或拖入写作材料</div>
                      <p className="text-muted-foreground max-w-xl text-sm leading-6">
                        草稿、最终稿、参考文献、阅读笔记、Google Docs
                        导出、ChatGPT
                        对话截图、老师反馈、版本历史和提交回执都可以。
                      </p>
                    </div>
                    <input
                      id="studytrace-files"
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        if (event.target.files) {
                          void handleFiles(event.target.files);
                          event.target.value = '';
                        }
                      }}
                    />
                  </label>

                  <div className="grid gap-3">
                    {files.length ? (
                      files.map((file) => (
                        <div
                          key={file.id}
                          className="bg-background grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto]"
                        >
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <FileText className="text-muted-foreground size-4" />
                              <span className="font-medium break-all">
                                {file.name}
                              </span>
                              <Badge variant="outline">
                                {evidenceKindLabels[file.category]}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {formatFileSize(file.size)} ·{' '}
                              {file.type || 'unknown'} · 最后修改：
                              {file.lastModifiedLabel}
                            </p>
                            {file.extractedText ? (
                              <p className="text-muted-foreground line-clamp-2 text-sm">
                                {file.extractedText
                                  .replace(/\s+/g, ' ')
                                  .slice(0, 220)}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="删除文件"
                            onClick={() =>
                              setFiles((prev) =>
                                prev.filter((item) => item.id !== file.id)
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <EmptyLine text="还没有上传材料。" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cards" className="mt-4 space-y-4">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="size-5" />
                    证据卡
                  </CardTitle>
                  <CardDescription>
                    每张卡都应该回答一个问题：它如何证明真实写作过程、来源可信或
                    AI 使用边界清楚。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/20 grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_180px]">
                    <Field label="证据标题">
                      <Input
                        value={manualCard.title}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }))
                        }
                        placeholder="例如：第一版提纲截图"
                      />
                    </Field>
                    <Field label="类型">
                      <select
                        value={manualCard.kind}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            kind: event.target.value as EvidenceKind,
                          }))
                        }
                        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                      >
                        {Object.entries(evidenceKindLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </Field>
                    <Field label="摘要" className="md:col-span-2">
                      <Textarea
                        value={manualCard.summary}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            summary: event.target.value,
                          }))
                        }
                        placeholder="说明这份证据是什么、来自哪里、与作业哪一部分相关。"
                      />
                    </Field>
                    <Field label="申诉说明" className="md:col-span-2">
                      <Textarea
                        value={manualCard.notes}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="写成可以直接放进报告的语句。"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Button onClick={addManualCard}>
                        <Plus className="size-4" />
                        添加证据卡
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {cards.length ? (
                      cards.map((card) => (
                        <div
                          key={card.id}
                          className="bg-background rounded-lg border p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                  {evidenceKindLabels[card.kind]}
                                </Badge>
                                <StrengthBadge strength={card.strength} />
                                <span className="font-medium break-words">
                                  {card.title}
                                </span>
                              </div>
                              <p className="text-muted-foreground text-sm">
                                来源：{card.source}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="删除证据卡"
                              onClick={() => deleteCard(card.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <Field label="摘要">
                              <Textarea
                                value={card.summary}
                                onChange={(event) =>
                                  updateCard(card.id, {
                                    summary: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="申诉说明">
                              <Textarea
                                value={card.notes}
                                onChange={(event) =>
                                  updateCard(card.id, {
                                    notes: event.target.value,
                                  })
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyLine text="上传文件后会自动生成证据卡，也可以手动添加。" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4 space-y-4">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock3 className="size-5" />
                    写作时间线
                  </CardTitle>
                  <CardDescription>
                    用时间线呈现“逐步完成”的证据链，而不是只展示最终稿。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/20 grid gap-3 rounded-lg border p-4 md:grid-cols-[220px_1fr]">
                    <Field label="时间">
                      <Input
                        type="datetime-local"
                        value={manualEvent.date}
                        onChange={(event) =>
                          setManualEvent((prev) => ({
                            ...prev,
                            date: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="节点标题">
                      <Input
                        value={manualEvent.label}
                        onChange={(event) =>
                          setManualEvent((prev) => ({
                            ...prev,
                            label: event.target.value,
                          }))
                        }
                        placeholder="例如：完成第一版提纲"
                      />
                    </Field>
                    <Field label="细节" className="md:col-span-2">
                      <Textarea
                        value={manualEvent.detail}
                        onChange={(event) =>
                          setManualEvent((prev) => ({
                            ...prev,
                            detail: event.target.value,
                          }))
                        }
                        placeholder="说明该节点对应哪些材料、如何证明写作过程。"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Button onClick={addManualEvent}>
                        <Plus className="size-4" />
                        添加节点
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {sortedTimeline.length ? (
                      sortedTimeline.map((event, index) => (
                        <div
                          key={event.id}
                          className="bg-background grid gap-3 rounded-lg border p-4 md:grid-cols-[32px_1fr_auto]"
                        >
                          <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md text-sm font-medium">
                            {index + 1}
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{event.label}</span>
                              <StrengthBadge strength={event.strength} />
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {event.date
                                ? formatDateLabel(event.date)
                                : '未填写时间'}{' '}
                              · {event.source}
                            </p>
                            <p className="text-sm leading-6">{event.detail}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="删除时间线节点"
                            onClick={() => deleteTimelineEvent(event.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <EmptyLine text="上传材料或手动添加节点后，会在这里形成写作时间线。" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="risk" className="mt-4 space-y-4">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BrainCircuit className="size-5" />
                    风险解释
                  </CardTitle>
                  <CardDescription>
                    分析的目标不是绕过检测器，而是说明材料可信度、缺口和可复核路径。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <ScorePanel score={analysis.trustScore} />
                    <div className="bg-background rounded-lg border p-4 md:col-span-2">
                      <div className="mb-2 flex items-center gap-2 font-medium">
                        <Sparkles className="text-primary size-4" />
                        综合说明
                      </div>
                      <p className="text-muted-foreground text-sm leading-6">
                        {analysis.summary || localAnalysis.summary}
                      </p>
                    </div>
                  </div>

                  <InsightList
                    title="主要风险"
                    icon={<AlertTriangle className="size-4" />}
                    items={analysis.riskItems}
                  />
                  <InsightList
                    title="时间线发现"
                    icon={<Clock3 className="size-4" />}
                    items={analysis.timelineFindings}
                  />
                  <InsightList
                    title="需要补充"
                    icon={<Plus className="size-4" />}
                    items={analysis.evidenceGaps}
                  />

                  <div className="studytrace-no-print flex flex-wrap gap-2">
                    <Button onClick={runAnalysis} disabled={isAnalyzing}>
                      {isAnalyzing ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <BrainCircuit className="size-4" />
                      )}
                      重新分析
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAnalysis(localAnalysis);
                        setStatusMessage('已刷新本地分析。');
                      }}
                    >
                      <SlidersHorizontal className="size-4" />
                      本地评估
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="report" className="mt-4 space-y-4">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="size-5" />
                    报告导出
                  </CardTitle>
                  <CardDescription>
                    导出 Markdown 后可以继续编辑；打印可保存为 PDF。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="studytrace-no-print flex flex-wrap gap-2">
                    <Button onClick={runAnalysis} disabled={isAnalyzing}>
                      {isAnalyzing ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <BrainCircuit className="size-4" />
                      )}
                      生成分析
                    </Button>
                    <Button variant="outline" onClick={downloadReport}>
                      <Download className="size-4" />
                      导出 Markdown
                    </Button>
                    <Button variant="outline" onClick={printReport}>
                      <Printer className="size-4" />
                      打印 / 保存 PDF
                    </Button>
                    <Button variant="ghost" onClick={copyReport}>
                      <ClipboardCheck className="size-4" />
                      复制
                    </Button>
                  </div>

                  <div
                    id="studytrace-report"
                    className="bg-background rounded-lg border p-5"
                  >
                    <div className="mb-4 flex flex-col gap-2 border-b pb-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-xl font-semibold">
                          写作过程与 AI 使用边界说明
                        </h2>
                        <p className="text-muted-foreground text-sm">
                          {assignmentTitle || '未填写作业标题'} ·{' '}
                          {courseName || '未填写课程'}
                        </p>
                      </div>
                      <Badge variant="outline">
                        评分 {analysis.trustScore}/100
                      </Badge>
                    </div>
                    <pre className="text-foreground p-0 text-sm leading-7 break-words whitespace-pre-wrap">
                      {report}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="studytrace-no-print space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" />
                完整度
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {coverage.map((item) => (
                <div
                  key={item.kind}
                  className="bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{item.label}</span>
                  {item.ready ? (
                    <CheckCircle2 className="size-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-600" />
                  )}
                </div>
              ))}
              <Button
                className="w-full"
                onClick={runAnalysis}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <BrainCircuit className="size-4" />
                )}
                生成风险解释
              </Button>
              {statusMessage ? (
                <p className="text-muted-foreground text-sm leading-6">
                  {statusMessage}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="size-4" />
                配置项
              </CardTitle>
              <CardDescription>
                参考同类产品的常见配置，先做成前端工作流参数。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="证据标准">
                <select
                  value={settings.evidenceStandard}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      evidenceStandard: event.target
                        .value as StudyTraceSettings['evidenceStandard'],
                    }))
                  }
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="balanced">均衡</option>
                  <option value="strict">严格</option>
                </select>
              </Field>
              <Field label={`风险敏感度：${settings.riskSensitivity}`}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.riskSensitivity}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      riskSensitivity: Number(event.target.value),
                    }))
                  }
                  className="accent-primary w-full"
                />
              </Field>
              <Field label="AI 政策模式">
                <select
                  value={settings.aiPolicy}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      aiPolicy: event.target
                        .value as StudyTraceSettings['aiPolicy'],
                    }))
                  }
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="none">不允许 AI</option>
                  <option value="assistive-only">仅允许辅助</option>
                  <option value="drafting-with-disclosure">
                    允许披露后使用
                  </option>
                </select>
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.includeDetectorCaveat}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      includeDetectorCaveat: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                报告中说明 AI 检测器可能存在误判，要求人工复核。
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.includeCitationAudit}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      includeCitationAudit: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                强制检查引用来源与阅读证据。
              </label>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LinkIcon className="size-4" />
                产品参考
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {marketSignals.map((signal) => (
                <div key={signal.name} className="rounded-md border p-3">
                  <div className="font-medium">{signal.name}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {signal.source}
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {signal.detail}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button variant="ghost" className="w-full" onClick={resetWorkspace}>
            <Trash2 className="size-4" />
            清空工作区
          </Button>
        </aside>
      </section>
    </main>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('space-y-2', className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="bg-muted/40 rounded-md px-3 py-2">
      <div className="text-lg font-semibold">
        {value}
        {suffix ? <span className="text-sm font-normal">{suffix}</span> : null}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function StrengthBadge({ strength }: { strength: EvidenceStrength }) {
  const label =
    strength === 'strong'
      ? '强证据'
      : strength === 'medium'
        ? '中证据'
        : '弱证据';
  return (
    <Badge
      variant={strength === 'strong' ? 'default' : 'outline'}
      className={cn(strength === 'weak' && 'border-amber-300 text-amber-700')}
    >
      {label}
    </Badge>
  );
}

function ScorePanel({ score }: { score: number }) {
  const tone =
    score >= 75
      ? 'text-green-600'
      : score >= 50
        ? 'text-amber-600'
        : 'text-red-600';
  return (
    <div className="bg-background rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <ShieldCheck className="text-primary size-4" />
        可信材料评分
      </div>
      <div className={cn('text-4xl font-semibold', tone)}>{score}</div>
      <div className="text-muted-foreground mt-2 text-sm">满分 100</div>
    </div>
  );
}

function InsightList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <div className="bg-background rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-6">
            <span className="bg-primary mt-2 size-1.5 shrink-0 rounded-full" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground bg-background rounded-lg border border-dashed p-6 text-center text-sm">
      {text}
    </div>
  );
}
