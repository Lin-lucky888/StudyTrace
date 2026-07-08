'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Cloud,
  CloudOff,
  Download,
  FileDown,
  Files,
  FileText,
  History,
  Link as LinkIcon,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
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

import { extractFileText } from './extract-text';
import { exportReportPdf } from './report-pdf';

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
  checksum?: string;
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

type SavedReport = {
  id: string;
  title: string;
  format: string;
  content: string;
  createdAt: string;
};

const STORAGE_KEY = 'studytrace-workspace-v1';
const MAX_SAVED_ITEMS = 120;
const MAX_SAVED_TEXT_LENGTH = 1_200;
const MAX_SAVED_ANALYSIS_ITEMS = 20;

// next-intl translator scoped to the `studytrace` namespace. Passed into
// module-level helpers so their generated copy stays locale-aware.
type StudyTraceTranslator = ReturnType<typeof useTranslations>;

const evidenceKindKeys: EvidenceKind[] = [
  'draft',
  'source',
  'ai-disclosure',
  'feedback',
  'version',
  'process',
  'other',
];

const defaultSettings: StudyTraceSettings = {
  evidenceStandard: 'balanced',
  riskSensitivity: 62,
  aiPolicy: 'assistive-only',
  includeDetectorCaveat: true,
  includeCitationAudit: true,
  requiredEvidenceKinds: ['draft', 'source', 'ai-disclosure', 'process'],
};

function getInitialAnalysis(t: StudyTraceTranslator): StudyTraceAnalysis {
  return {
    trustScore: 38,
    summary: t('analysis.initial.summary'),
    riskItems: [t('analysis.initial.risk')],
    timelineFindings: [t('analysis.initial.timeline')],
    evidenceGaps: [t('analysis.initial.gap')],
    appealOutline: [t('analysis.initial.appeal')],
    aiBoundaryStatement: t('analysis.initial.aiBoundary'),
    exportChecklist: t.raw('analysis.initial.checklist') as string[],
    providerStatus: 'local',
  };
}

// Date formatting reads these module singletons, set from the active locale on
// each render, so the many call sites below stay parameter-free.
let activeDateLocale = 'en';
let unrecognizedTimeLabel = 'Unrecognized time';

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
  if (Number.isNaN(date.getTime())) return unrecognizedTimeLabel;
  return new Intl.DateTimeFormat(activeDateLocale, {
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

// Content fingerprint. Computed in the browser over the raw bytes so the
// original file never leaves the device, yet the SHA-256 can later prove the
// exact content that existed at upload time. Requires a secure context
// (https / localhost); degrades to an empty string otherwise.
async function sha256File(file: File): Promise<string> {
  try {
    if (!globalThis.crypto?.subtle) return '';
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}

function shortChecksum(value?: string) {
  if (!value) return '';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
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
    checksum: file.checksum,
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

function buildCardFromFile(
  file: UploadedEvidenceFile,
  t: StudyTraceTranslator
): EvidenceCard {
  const kindLabel = t(`evidenceKinds.${file.category}`);
  const preview = file.extractedText
    ? file.extractedText.replace(/\s+/g, ' ').slice(0, 180)
    : '';

  return {
    id: newId(),
    title: file.name,
    kind: file.category,
    source: t('workspace.cards.sourceUpload'),
    fileId: file.id,
    summary: preview
      ? t('workspace.cards.summaryFromPreview', { kind: kindLabel, preview })
      : t('workspace.cards.summaryFromMeta', {
          kind: kindLabel,
          ext: file.extension || file.type || 'unknown',
          size: formatFileSize(file.size),
        }),
    notes: '',
    strength: strengthFromKind(file.category),
    tags: [kindLabel, file.extension || 'file'].filter(Boolean),
    riskFlags: [],
  };
}

function buildTimelineFromFile(
  file: UploadedEvidenceFile,
  t: StudyTraceTranslator
): TimelineEvent {
  return {
    id: newId(),
    date: toDateTimeInput(file.lastModified),
    label: t('workspace.timeline.uploadLabel', { name: file.name }),
    detail: t('workspace.timeline.uploadDetail', {
      kind: t(`evidenceKinds.${file.category}`),
      time: file.lastModifiedLabel,
    }),
    source: t('workspace.timeline.sourceTimestamp'),
    strength: strengthFromKind(file.category),
  };
}

function getLocalAnalysis({
  files,
  cards,
  timeline,
  aiBoundary,
  settings,
  t,
}: {
  files: UploadedEvidenceFile[];
  cards: EvidenceCard[];
  timeline: TimelineEvent[];
  aiBoundary: string;
  settings: StudyTraceSettings;
  t: StudyTraceTranslator;
}): StudyTraceAnalysis {
  const presentKinds = new Set(cards.map((card) => card.kind));
  const missingRequired = settings.requiredEvidenceKinds.filter(
    (kind) => !presentKinds.has(kind)
  );
  const strongCards = cards.filter((card) => card.strength === 'strong').length;
  const chronologicalEvents = timeline.filter((event) => event.date).length;
  const boundaryReady = aiBoundary.trim().length >= 40;
  const sourceCount = cards.filter((card) => card.kind === 'source').length;
  const listSeparator = activeDateLocale.startsWith('zh') ? '、' : ', ';

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
      ? t('analysis.local.riskMissing', {
          kinds: missingRequired
            .map((kind) => t(`evidenceKinds.${kind}`))
            .join(listSeparator),
        })
      : t('analysis.local.riskCovered'),
    chronologicalEvents < 4
      ? t('analysis.local.riskFewTimeline')
      : t('analysis.local.riskTimelineOk'),
    boundaryReady
      ? t('analysis.local.riskBoundaryOk')
      : t('analysis.local.riskBoundaryShort'),
  ];

  if (settings.includeCitationAudit && sourceCount < 2) {
    riskItems.push(t('analysis.local.riskSourceShort'));
  }

  return {
    trustScore: score,
    summary:
      score >= 75
        ? t('analysis.local.summaryHigh')
        : score >= 50
          ? t('analysis.local.summaryMid')
          : t('analysis.local.summaryLow'),
    riskItems,
    timelineFindings: [
      chronologicalEvents
        ? t('analysis.local.timelineEvents', { count: chronologicalEvents })
        : t('analysis.local.timelineNoEvents'),
      cards.some((card) => card.kind === 'draft')
        ? t('analysis.local.timelineHasDraft')
        : t('analysis.local.timelineNoDraft'),
      cards.some((card) => card.kind === 'feedback')
        ? t('analysis.local.timelineHasFeedback')
        : t('analysis.local.timelineNoFeedback'),
    ],
    evidenceGaps: missingRequired.length
      ? missingRequired.map((kind) =>
          t('analysis.local.gapSupplement', {
            kind: t(`evidenceKinds.${kind}`),
          })
        )
      : [t('analysis.local.gapWriteAppeal')],
    appealOutline: t.raw('analysis.local.appealOutline') as string[],
    aiBoundaryStatement:
      aiBoundary.trim() || t('analysis.local.aiBoundaryStatement'),
    exportChecklist: t.raw('analysis.local.exportChecklist') as string[],
    providerStatus: 'local',
  };
}

export function StudyTraceWorkspace({
  projectId,
}: {
  projectId?: string;
} = {}) {
  const t = useTranslations('studytrace');
  const locale = useLocale();

  // Keep the parameter-free date formatters in sync with the active locale.
  activeDateLocale = locale === 'zh' ? 'zh-CN' : 'en';
  unrecognizedTimeLabel = t('date.unknown');

  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [courseName, setCourseName] = useState('');
  const [institutionPolicy, setInstitutionPolicy] = useState('');
  const [concern, setConcern] = useState('');
  const [aiBoundary, setAiBoundary] = useState(() =>
    t('aiBoundaryDefaultInput')
  );
  const [files, setFiles] = useState<UploadedEvidenceFile[]>([]);
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [settings, setSettings] = useState<StudyTraceSettings>(defaultSettings);
  const [analysis, setAnalysis] = useState<StudyTraceAnalysis>(() =>
    getInitialAnalysis(t)
  );
  const [activeTab, setActiveTab] = useState('upload');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(projectId));
  const [cloudMode, setCloudMode] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );
  const [lastAnalysisRunId, setLastAnalysisRunId] = useState('');
  const [reportHistory, setReportHistory] = useState<SavedReport[]>([]);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const storageKey = projectId ? `${STORAGE_KEY}:${projectId}` : STORAGE_KEY;
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const applyLocalSnapshot = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const data = JSON.parse(saved);
      setAssignmentTitle(data.assignmentTitle || '');
      setCourseName(data.courseName || '');
      setInstitutionPolicy(data.institutionPolicy || '');
      setConcern(data.concern || '');
      if (data.aiBoundary) setAiBoundary(data.aiBoundary);
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
        data.analysis ? sanitizeSavedAnalysis(data.analysis) : getInitialAnalysis(t)
      );
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, t]);

  const applyCloudSnapshot = useCallback((snapshot: any) => {
    const project = snapshot?.project || {};
    setAssignmentTitle(project.title || '');
    setCourseName(project.courseName || '');
    setInstitutionPolicy(project.institutionPolicy || '');
    setConcern(project.concern || '');
    if (typeof project.aiBoundary === 'string' && project.aiBoundary) {
      setAiBoundary(project.aiBoundary);
    }
    setSettings(
      project.settings && typeof project.settings === 'object'
        ? { ...defaultSettings, ...project.settings }
        : defaultSettings
    );
    setFiles(
      (Array.isArray(snapshot?.files) ? snapshot.files : []).map(
        (file: any): UploadedEvidenceFile => ({
          id: file.id,
          name: file.name || '',
          size: Number(file.size) || 0,
          type: file.type || 'unknown',
          extension: file.extension || '',
          lastModified: file.lastModified || '',
          lastModifiedLabel: file.lastModified
            ? formatDateLabel(file.lastModified)
            : t('date.unknown'),
          category: (file.category || 'process') as EvidenceKind,
          extractedText: file.extractedText || undefined,
          checksum: file.checksum || undefined,
        })
      )
    );
    setCards(
      (Array.isArray(snapshot?.cards) ? snapshot.cards : []).map(
        (card: any): EvidenceCard => ({
          id: card.id,
          title: card.title || '',
          kind: (card.kind || 'other') as EvidenceKind,
          source: card.source || '',
          fileId: card.fileId || undefined,
          summary: card.summary || '',
          notes: card.notes || '',
          strength: (card.strength || 'medium') as EvidenceStrength,
          tags: Array.isArray(card.tags) ? card.tags : [],
          riskFlags: Array.isArray(card.riskFlags) ? card.riskFlags : [],
        })
      )
    );
    setTimeline(
      (Array.isArray(snapshot?.timeline) ? snapshot.timeline : []).map(
        (event: any): TimelineEvent => ({
          id: event.id,
          date: event.date ? toDateTimeInput(event.date) : '',
          label: event.label || '',
          detail: event.detail || '',
          source: event.source || t('workspace.cards.sourceManual'),
          strength: (event.strength || 'medium') as EvidenceStrength,
        })
      )
    );
    if (snapshot?.analysis) {
      setAnalysis(sanitizeSavedAnalysis(snapshot.analysis));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (!projectId) {
        applyLocalSnapshot();
        hydratedRef.current = true;
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch('/api/studytrace/projects/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        const result = await response.json();
        if (cancelled) return;

        if (response.ok && result.code === 0) {
          applyCloudSnapshot(result.data);
          setCloudMode(true);
          setSyncState('saved');
        } else {
          // Cloud load failed (no auth / not found). Fall back to local cache.
          applyLocalSnapshot();
          setCloudMode(false);
          setStatusMessage(
            result?.message?.includes('auth')
              ? t('workspace.hydrate.guest')
              : t('workspace.hydrate.loadFailed')
          );
        }
      } catch {
        if (cancelled) return;
        applyLocalSnapshot();
        setCloudMode(false);
        setStatusMessage(t('workspace.hydrate.connectFailed'));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          hydratedRef.current = true;
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const buildCloudPayload = useCallback(
    () => ({
      projectId,
      project: {
        title: assignmentTitle,
        courseName,
        institutionPolicy,
        concern,
        aiBoundary,
        settings,
      },
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        extension: file.extension,
        category: file.category,
        lastModified: file.lastModified,
        extractedText: file.extractedText,
        checksum: file.checksum,
      })),
      cards: cards.map((card) => ({
        id: card.id,
        fileId: card.fileId,
        title: card.title,
        kind: card.kind,
        source: card.source,
        summary: card.summary,
        notes: card.notes,
        strength: card.strength,
        tags: card.tags,
        riskFlags: card.riskFlags,
      })),
      timeline: timeline.map((event) => ({
        id: event.id,
        date: event.date,
        label: event.label,
        detail: event.detail,
        source: event.source,
        strength: event.strength,
      })),
    }),
    [
      projectId,
      assignmentTitle,
      courseName,
      institutionPolicy,
      concern,
      aiBoundary,
      settings,
      files,
      cards,
      timeline,
    ]
  );

  // Local cache (offline fallback / guest mode).
  useEffect(() => {
    if (!hydratedRef.current) return;

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
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn('Failed to save StudyTrace workspace snapshot', error);
        return;
      }

      try {
        localStorage.removeItem(storageKey);
        localStorage.setItem(
          storageKey,
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
        setStatusMessage(t('workspace.localCacheReduced'));
      } catch {
        localStorage.removeItem(storageKey);
        setStatusMessage(t('workspace.localCachePaused'));
      }
    }
  }, [
    storageKey,
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

  // Debounced cloud autosave.
  useEffect(() => {
    if (!hydratedRef.current || !cloudMode || !projectId) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSyncState('saving');
    saveTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/studytrace/projects/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCloudPayload()),
        });
        const result = await response.json();
        setSyncState(response.ok && result.code === 0 ? 'saved' : 'idle');
      } catch {
        setSyncState('idle');
      }
    }, 1500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    cloudMode,
    projectId,
    buildCloudPayload,
    assignmentTitle,
    courseName,
    institutionPolicy,
    concern,
    aiBoundary,
    files,
    cards,
    timeline,
    settings,
  ]);

  const localAnalysis = useMemo(
    () =>
      getLocalAnalysis({
        files,
        cards,
        timeline,
        aiBoundary,
        settings,
        t,
      }),
    [files, cards, timeline, aiBoundary, settings, t]
  );

  const coverage = useMemo(() => {
    const kinds = new Set(cards.map((card) => card.kind));
    return settings.requiredEvidenceKinds.map((kind) => ({
      kind,
      label: t(`evidenceKinds.${kind}`),
      ready: kinds.has(kind),
    }));
  }, [cards, settings.requiredEvidenceKinds, t]);

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

    setStatusMessage(t('workspace.upload.status.organizing'));
    const nextFiles: UploadedEvidenceFile[] = [];
    const nextCards: EvidenceCard[] = [];
    const nextEvents: TimelineEvent[] = [];

    for (const [index, file] of list.entries()) {
      const category = guessEvidenceKind(file);
      setStatusMessage(
        list.length > 1
          ? t('workspace.upload.status.parsingMulti', {
              index: index + 1,
              total: list.length,
              name: file.name,
            })
          : t('workspace.upload.status.parsingOne', { name: file.name })
      );
      const [extractedText, checksum] = await Promise.all([
        extractFileText(file),
        sha256File(file),
      ]);
      const uploadedFile: UploadedEvidenceFile = {
        id: newId(),
        name: file.name,
        size: file.size,
        type: file.type || 'unknown',
        extension: getExtension(file.name),
        lastModified: new Date(file.lastModified).toISOString(),
        lastModifiedLabel: formatDateLabel(file.lastModified),
        category,
        extractedText,
        checksum,
      };

      nextFiles.push(uploadedFile);
      nextCards.push(buildCardFromFile(uploadedFile, t));
      nextEvents.push(buildTimelineFromFile(uploadedFile, t));
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
        t,
      })
    );
    setStatusMessage(
      t('workspace.upload.status.generated', { count: nextCards.length })
    );
    setActiveTab('cards');
  };

  const addManualCard = () => {
    if (!manualCard.title.trim() && !manualCard.summary.trim()) {
      setStatusMessage(t('workspace.cards.needTitleOrSummary'));
      return;
    }

    const kind = manualCard.kind;
    const kindLabel = t(`evidenceKinds.${kind}`);
    const card: EvidenceCard = {
      id: newId(),
      title: manualCard.title || kindLabel,
      kind,
      source: t('workspace.cards.sourceManual'),
      summary: manualCard.summary,
      notes: manualCard.notes,
      strength: strengthFromKind(kind),
      tags: [kindLabel],
      riskFlags: [],
    };

    setCards((prev) => [card, ...prev]);
    setManualCard({
      title: '',
      kind: 'process',
      summary: '',
      notes: '',
    });
    setStatusMessage(t('workspace.cards.added'));
  };

  const addManualEvent = () => {
    if (!manualEvent.label.trim()) {
      setStatusMessage(t('workspace.timeline.needLabel'));
      return;
    }

    setTimeline((prev) => [
      {
        id: newId(),
        date: manualEvent.date,
        label: manualEvent.label,
        detail: manualEvent.detail,
        source: t('workspace.cards.sourceManual'),
        strength: 'medium',
      },
      ...prev,
    ]);
    setManualEvent({
      date: toDateTimeInput(new Date()),
      label: '',
      detail: '',
    });
    setStatusMessage(t('workspace.timeline.added'));
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
      t,
    });

    if (!cards.length) {
      setAnalysis(fallback);
      setStatusMessage(t('workspace.analysisStatus.needMaterials'));
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage(t('workspace.analysisStatus.generating'));

    try {
      const response = await fetch('/api/studytrace/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          locale,
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
      setLastAnalysisRunId(result.data.analysisRunId || '');
      setStatusMessage(
        result.data.analysis.providerStatus === 'ai'
          ? t('workspace.analysisStatus.aiDone')
          : t('workspace.analysisStatus.localDone')
      );
    } catch (error) {
      setAnalysis(fallback);
      setStatusMessage(
        error instanceof Error && error.message.includes('auth')
          ? t('workspace.analysisStatus.needAuth')
          : error instanceof Error && error.message.includes('credits')
            ? t('workspace.analysisStatus.needCredits')
            : t('workspace.analysisStatus.unavailable')
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
          `${index + 1}. ${card.title} | ${t(`evidenceKinds.${card.kind}`)} | ${t('reportDoc.credibility')}: ${t(`strength.${card.strength}`)}\n   - ${card.summary || t('reportDoc.noSummary')}\n   - ${t('reportDoc.notesLabel')}: ${card.notes || t('reportDoc.empty')}`
      )
      .join('\n');

    const timelineLines = sortedTimeline
      .map(
        (event, index) =>
          `${index + 1}. ${event.date ? formatDateLabel(event.date) : t('date.empty')} | ${event.label}\n   - ${event.detail || t('reportDoc.empty')}\n   - ${t('reportDoc.sourceLabel')}: ${event.source}`
      )
      .join('\n');

    const fingerprintLines = files
      .map(
        (file, index) =>
          `${index + 1}. ${file.name}\n   - ${t('reportDoc.fingerprintSha')}: ${file.checksum || t('reportDoc.fingerprintUncomputed')}\n   - ${t('reportDoc.fingerprintLastModified')}: ${file.lastModifiedLabel}`
      )
      .join('\n');

    const notFilled = t('reportDoc.notFilled');

    return `# ${t('reportDoc.title')}

## ${t('reportDoc.basicHeading')}

- ${t('reportDoc.assignment')}: ${assignmentTitle || notFilled}
- ${t('reportDoc.course')}: ${courseName || notFilled}
- ${t('reportDoc.concern')}: ${concern || notFilled}
- ${t('reportDoc.policy')}: ${institutionPolicy || notFilled}

## ${t('reportDoc.summaryHeading')}

${t('reportDoc.trustScore', { score: analysis.trustScore })}

${analysis.summary}

## ${t('reportDoc.aiBoundaryHeading')}

${analysis.aiBoundaryStatement || aiBoundary || notFilled}

## ${t('reportDoc.cardsHeading')}

${evidenceLines || t('reportDoc.noCards')}

## ${t('reportDoc.timelineHeading')}

${timelineLines || t('reportDoc.noTimeline')}

## ${t('reportDoc.fingerprintHeading')}

${t('reportDoc.fingerprintNote')}

${fingerprintLines || t('reportDoc.noFiles')}

## ${t('reportDoc.riskHeading')}

${analysis.riskItems.map((item) => `- ${item}`).join('\n')}

## ${t('reportDoc.gapsHeading')}

${analysis.evidenceGaps.map((item) => `- ${item}`).join('\n')}

## ${t('reportDoc.appealHeading')}

${analysis.appealOutline.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## ${t('reportDoc.checklistHeading')}

${analysis.exportChecklist.map((item) => `- ${item}`).join('\n')}
`;
  }, [
    aiBoundary,
    analysis,
    assignmentTitle,
    cards,
    concern,
    courseName,
    files,
    institutionPolicy,
    sortedTimeline,
    t,
  ]);

  const loadReportHistory = useCallback(async () => {
    if (!cloudMode || !projectId) return;
    try {
      const response = await fetch('/api/studytrace/reports/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const result = await response.json();
      if (response.ok && result.code === 0) {
        setReportHistory(result.data?.list || []);
      }
    } catch {
      // History is best-effort.
    }
  }, [cloudMode, projectId]);

  const saveReportToCloud = useCallback(
    async (silent = true): Promise<boolean> => {
      if (!cloudMode || !projectId) return false;
      try {
        const response = await fetch('/api/studytrace/reports/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            title: assignmentTitle || t('reportDoc.title'),
            format: 'markdown',
            content: report,
            analysisRunId: lastAnalysisRunId || undefined,
          }),
        });
        const result = await response.json();
        const ok = response.ok && result.code === 0;
        if (ok) void loadReportHistory();
        return ok;
      } catch {
        if (!silent) setStatusMessage(t('workspace.report.status.saveFailed'));
        return false;
      }
    },
    [
      cloudMode,
      projectId,
      assignmentTitle,
      report,
      lastAnalysisRunId,
      loadReportHistory,
      t,
    ]
  );

  const handleSaveReport = async () => {
    if (!cloudMode || !projectId) {
      setStatusMessage(t('workspace.report.status.needProject'));
      return;
    }
    setIsSavingReport(true);
    const ok = await saveReportToCloud(false);
    setIsSavingReport(false);
    setStatusMessage(
      ok
        ? t('workspace.report.status.saved')
        : t('workspace.report.status.saveFailed')
    );
  };

  useEffect(() => {
    if (cloudMode && projectId) {
      void loadReportHistory();
    }
  }, [cloudMode, projectId, loadReportHistory]);

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
    void saveReportToCloud();
  };

  const downloadSavedReport = (item: SavedReport) => {
    const extension = item.format === 'markdown' ? 'md' : item.format || 'txt';
    const blob = new Blob([item.content], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stamp = new Date(item.createdAt).getTime() || Date.now();
    link.download = `studytrace-report-${stamp}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setStatusMessage(t('workspace.report.status.copied'));
    } catch {
      setStatusMessage(t('workspace.report.status.copyFailed'));
    }
  };

  const printReport = () => {
    window.print();
  };

  const exportPdf = async () => {
    setIsExportingPdf(true);
    setStatusMessage(t('workspace.report.status.pdfGenerating'));
    try {
      await exportReportPdf(report, `studytrace-report-${Date.now()}.pdf`);
      setStatusMessage(t('workspace.report.status.pdfDone'));
      void saveReportToCloud();
    } catch (error) {
      console.warn('StudyTrace export pdf failed:', error);
      setStatusMessage(t('workspace.report.status.pdfFailed'));
    } finally {
      setIsExportingPdf(false);
    }
  };

  const syncLabel =
    syncState === 'saving'
      ? t('workspace.syncSaving')
      : syncState === 'saved'
        ? t('workspace.syncSaved')
        : t('workspace.localDraft');

  const resetWorkspace = () => {
    setAssignmentTitle('');
    setCourseName('');
    setInstitutionPolicy('');
    setConcern('');
    setAiBoundary(t('aiBoundaryDefaultInput'));
    setFiles([]);
    setCards([]);
    setTimeline([]);
    setSettings(defaultSettings);
    setAnalysis(getInitialAnalysis(t));
    setStatusMessage(t('workspace.sidebar.resetDone'));
  };

  if (isLoading) {
    return (
      <main className="bg-muted/20 flex min-h-dvh items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <Loader2 className="size-5 animate-spin" />
          {t('workspace.loading')}
        </div>
      </main>
    );
  }

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
              <div className="flex flex-wrap items-center gap-2">
                {projectId ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="studytrace-no-print h-7 gap-1 px-2"
                  >
                    <Link href="/studytrace">
                      <ArrowLeft className="size-3.5" />
                      {t('workspace.backToProjects')}
                    </Link>
                  </Button>
                ) : null}
                <Badge variant="outline" className="gap-2">
                  <ShieldCheck className="size-3.5" />
                  StudyTrace
                </Badge>
                {projectId ? (
                  <Badge
                    variant="outline"
                    className="studytrace-no-print gap-1.5 text-xs"
                  >
                    {syncState === 'saving' ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : cloudMode ? (
                      <Cloud className="size-3" />
                    ) : (
                      <CloudOff className="size-3" />
                    )}
                    {cloudMode ? syncLabel : t('workspace.localDraft')}
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-normal md:text-4xl">
                  {assignmentTitle
                    ? assignmentTitle
                    : t('workspace.defaultTitle')}
                </h1>
                <p className="text-muted-foreground text-sm leading-6 md:text-base">
                  {t('workspace.subtitle')}
                </p>
              </div>
            </div>

            <div className="bg-card grid grid-cols-3 gap-2 rounded-md border p-2 text-center shadow-sm md:min-w-[360px]">
              <Metric label={t('workspace.metricCards')} value={cards.length} />
              <Metric
                label={t('workspace.metricEvents')}
                value={timeline.length}
              />
              <Metric
                label={t('workspace.metricScore')}
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
                {t('workspace.basic.title')}
              </CardTitle>
              <CardDescription>{t('workspace.basic.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label={t('workspace.basic.assignment')}>
                <Input
                  value={assignmentTitle}
                  onChange={(event) => setAssignmentTitle(event.target.value)}
                  placeholder={t('workspace.basic.assignmentPlaceholder')}
                />
              </Field>
              <Field label={t('workspace.basic.course')}>
                <Input
                  value={courseName}
                  onChange={(event) => setCourseName(event.target.value)}
                  placeholder={t('workspace.basic.coursePlaceholder')}
                />
              </Field>
              <Field label={t('workspace.basic.concern')}>
                <Textarea
                  value={concern}
                  onChange={(event) => setConcern(event.target.value)}
                  placeholder={t('workspace.basic.concernPlaceholder')}
                  className="min-h-24"
                />
              </Field>
              <Field label={t('workspace.basic.policy')}>
                <Textarea
                  value={institutionPolicy}
                  onChange={(event) => setInstitutionPolicy(event.target.value)}
                  placeholder={t('workspace.basic.policyPlaceholder')}
                  className="min-h-24"
                />
              </Field>
              <Field
                label={t('workspace.basic.aiBoundary')}
                className="md:col-span-2"
              >
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
                {t('workspace.privacy.title')}
              </CardTitle>
              <CardDescription className="leading-6">
                {t('workspace.privacy.desc')}
              </CardDescription>
            </CardHeader>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="studytrace-no-print grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5">
              <TabsTrigger value="upload">{t('workspace.tabs.upload')}</TabsTrigger>
              <TabsTrigger value="cards">{t('workspace.tabs.cards')}</TabsTrigger>
              <TabsTrigger value="timeline">
                {t('workspace.tabs.timeline')}
              </TabsTrigger>
              <TabsTrigger value="risk">{t('workspace.tabs.risk')}</TabsTrigger>
              <TabsTrigger value="report">
                {t('workspace.tabs.report')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4 space-y-4">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UploadCloud className="size-5" />
                    {t('workspace.upload.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('workspace.upload.desc')}
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
                      <div className="font-medium">
                        {t('workspace.upload.dropTitle')}
                      </div>
                      <p className="text-muted-foreground max-w-xl text-sm leading-6">
                        {t('workspace.upload.dropDesc')}
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
                                {t(`evidenceKinds.${file.category}`)}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {formatFileSize(file.size)} ·{' '}
                              {file.type || 'unknown'} ·{' '}
                              {t('workspace.upload.lastModified')}{' '}
                              {file.lastModifiedLabel}
                            </p>
                            {file.checksum ? (
                              <p
                                className="text-muted-foreground font-mono text-xs break-all"
                                title={file.checksum}
                              >
                                {t('workspace.upload.fingerprint')}{' '}
                                {shortChecksum(file.checksum)}
                              </p>
                            ) : null}
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
                            aria-label={t('workspace.upload.deleteAria')}
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
                      <EmptyLine text={t('workspace.upload.empty')} />
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
                    {t('workspace.cards.title')}
                  </CardTitle>
                  <CardDescription>{t('workspace.cards.desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/20 grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_180px]">
                    <Field label={t('workspace.cards.formTitle')}>
                      <Input
                        value={manualCard.title}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }))
                        }
                        placeholder={t('workspace.cards.formTitlePlaceholder')}
                      />
                    </Field>
                    <Field label={t('workspace.cards.formKind')}>
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
                        {evidenceKindKeys.map((value) => (
                          <option key={value} value={value}>
                            {t(`evidenceKinds.${value}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={t('workspace.cards.formSummary')}
                      className="md:col-span-2"
                    >
                      <Textarea
                        value={manualCard.summary}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            summary: event.target.value,
                          }))
                        }
                        placeholder={t('workspace.cards.formSummaryPlaceholder')}
                      />
                    </Field>
                    <Field
                      label={t('workspace.cards.formNotes')}
                      className="md:col-span-2"
                    >
                      <Textarea
                        value={manualCard.notes}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            notes: event.target.value,
                          }))
                        }
                        placeholder={t('workspace.cards.formNotesPlaceholder')}
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Button onClick={addManualCard}>
                        <Plus className="size-4" />
                        {t('workspace.cards.add')}
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
                                  {t(`evidenceKinds.${card.kind}`)}
                                </Badge>
                                <StrengthBadge strength={card.strength} />
                                <span className="font-medium break-words">
                                  {card.title}
                                </span>
                              </div>
                              <p className="text-muted-foreground text-sm">
                                {t('workspace.cards.sourceLabel', {
                                  source: card.source,
                                })}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('workspace.cards.deleteAria')}
                              onClick={() => deleteCard(card.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <Field label={t('workspace.cards.formSummary')}>
                              <Textarea
                                value={card.summary}
                                onChange={(event) =>
                                  updateCard(card.id, {
                                    summary: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label={t('workspace.cards.formNotes')}>
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
                      <EmptyLine text={t('workspace.cards.empty')} />
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
                    {t('workspace.timeline.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('workspace.timeline.desc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted/20 grid gap-3 rounded-lg border p-4 md:grid-cols-[220px_1fr]">
                    <Field label={t('workspace.timeline.time')}>
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
                    <Field label={t('workspace.timeline.label')}>
                      <Input
                        value={manualEvent.label}
                        onChange={(event) =>
                          setManualEvent((prev) => ({
                            ...prev,
                            label: event.target.value,
                          }))
                        }
                        placeholder={t('workspace.timeline.labelPlaceholder')}
                      />
                    </Field>
                    <Field
                      label={t('workspace.timeline.detail')}
                      className="md:col-span-2"
                    >
                      <Textarea
                        value={manualEvent.detail}
                        onChange={(event) =>
                          setManualEvent((prev) => ({
                            ...prev,
                            detail: event.target.value,
                          }))
                        }
                        placeholder={t('workspace.timeline.detailPlaceholder')}
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Button onClick={addManualEvent}>
                        <Plus className="size-4" />
                        {t('workspace.timeline.add')}
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
                                : t('date.empty')}{' '}
                              · {event.source}
                            </p>
                            <p className="text-sm leading-6">{event.detail}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('workspace.timeline.deleteAria')}
                            onClick={() => deleteTimelineEvent(event.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <EmptyLine text={t('workspace.timeline.empty')} />
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
                    {t('workspace.risk.title')}
                  </CardTitle>
                  <CardDescription>{t('workspace.risk.desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <ScorePanel score={analysis.trustScore} />
                    <div className="bg-background rounded-lg border p-4 md:col-span-2">
                      <div className="mb-2 flex items-center gap-2 font-medium">
                        <Sparkles className="text-primary size-4" />
                        {t('workspace.risk.summary')}
                      </div>
                      <p className="text-muted-foreground text-sm leading-6">
                        {analysis.summary || localAnalysis.summary}
                      </p>
                    </div>
                  </div>

                  <InsightList
                    title={t('workspace.risk.mainRisks')}
                    icon={<AlertTriangle className="size-4" />}
                    items={analysis.riskItems}
                  />
                  <InsightList
                    title={t('workspace.risk.timelineFindings')}
                    icon={<Clock3 className="size-4" />}
                    items={analysis.timelineFindings}
                  />
                  <InsightList
                    title={t('workspace.risk.gaps')}
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
                      {t('workspace.risk.reanalyze')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAnalysis(localAnalysis);
                        setStatusMessage(t('workspace.risk.localRefreshed'));
                      }}
                    >
                      <SlidersHorizontal className="size-4" />
                      {t('workspace.risk.localEval')}
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
                    {t('workspace.report.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('workspace.report.desc')}
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
                      {t('workspace.report.generate')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={exportPdf}
                      disabled={isExportingPdf}
                    >
                      {isExportingPdf ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <FileDown className="size-4" />
                      )}
                      {t('workspace.report.exportPdf')}
                    </Button>
                    <Button variant="outline" onClick={downloadReport}>
                      <Download className="size-4" />
                      {t('workspace.report.exportMarkdown')}
                    </Button>
                    <Button variant="outline" onClick={printReport}>
                      <Printer className="size-4" />
                      {t('workspace.report.print')}
                    </Button>
                    {projectId ? (
                      <Button
                        variant="outline"
                        onClick={handleSaveReport}
                        disabled={isSavingReport || !cloudMode}
                      >
                        {isSavingReport ? (
                          <RefreshCw className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        {t('workspace.report.saveCloud')}
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={copyReport}>
                      <ClipboardCheck className="size-4" />
                      {t('workspace.report.copy')}
                    </Button>
                  </div>

                  <div
                    id="studytrace-report"
                    className="bg-background rounded-lg border p-5"
                  >
                    <div className="mb-4 flex flex-col gap-2 border-b pb-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-xl font-semibold">
                          {t('workspace.report.cardHeading')}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                          {assignmentTitle || t('workspace.report.noAssignment')}{' '}
                          · {courseName || t('workspace.report.noCourse')}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {t('workspace.report.scoreBadge', {
                          score: analysis.trustScore,
                        })}
                      </Badge>
                    </div>
                    <pre className="text-foreground p-0 text-sm leading-7 break-words whitespace-pre-wrap">
                      {report}
                    </pre>
                  </div>

                  {projectId && cloudMode ? (
                    <div className="studytrace-no-print space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <History className="size-4" />
                        {t('workspace.report.history')}
                        {reportHistory.length ? (
                          <span className="text-muted-foreground font-normal">
                            （{reportHistory.length}）
                          </span>
                        ) : null}
                      </div>
                      {reportHistory.length ? (
                        <div className="space-y-2">
                          {reportHistory.map((item) => (
                            <div
                              key={item.id}
                              className="bg-background flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {item.title || t('workspace.report.unnamedReport')}
                                </div>
                                <div className="text-muted-foreground text-xs">
                                  {formatDateLabel(item.createdAt)} ·{' '}
                                  {item.format.toUpperCase()}
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => downloadSavedReport(item)}
                                >
                                  <Download className="size-4" />
                                  {t('workspace.report.download')}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyLine text={t('workspace.report.historyEmpty')} />
                      )}
                    </div>
                  ) : null}
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
                {t('workspace.sidebar.coverage')}
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
                {t('workspace.sidebar.generate')}
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
                {t('workspace.sidebar.settingsTitle')}
              </CardTitle>
              <CardDescription>
                {t('workspace.sidebar.settingsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t('workspace.sidebar.evidenceStandard')}>
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
                  <option value="balanced">
                    {t('workspace.sidebar.standardBalanced')}
                  </option>
                  <option value="strict">
                    {t('workspace.sidebar.standardStrict')}
                  </option>
                </select>
              </Field>
              <Field
                label={t('workspace.sidebar.riskSensitivity', {
                  value: settings.riskSensitivity,
                })}
              >
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
              <Field label={t('workspace.sidebar.aiPolicy')}>
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
                  <option value="none">
                    {t('workspace.sidebar.policyNone')}
                  </option>
                  <option value="assistive-only">
                    {t('workspace.sidebar.policyAssistive')}
                  </option>
                  <option value="drafting-with-disclosure">
                    {t('workspace.sidebar.policyDisclosure')}
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
                {t('workspace.sidebar.detectorCaveat')}
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
                {t('workspace.sidebar.citationAudit')}
              </label>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LinkIcon className="size-4" />
                {t('workspace.sidebar.referencesTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                t.raw('marketSignals') as {
                  name: string;
                  source: string;
                  detail: string;
                }[]
              ).map((signal) => (
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
            {t('workspace.sidebar.reset')}
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
  const t = useTranslations('studytrace');
  const label = t(`strength.${strength}`);
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
  const t = useTranslations('studytrace');
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
        {t('scorePanel.title')}
      </div>
      <div className={cn('text-4xl font-semibold', tone)}>{score}</div>
      <div className="text-muted-foreground mt-2 text-sm">
        {t('scorePanel.outOf')}
      </div>
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
