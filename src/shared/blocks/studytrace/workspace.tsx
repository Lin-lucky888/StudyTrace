'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
import { useLocale, useTranslations } from 'next-intl';

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
import {
  applyIngestFileCategories,
  buildCardFromFile,
  buildTimelineFromFile,
  defaultActionItems,
  defaultSettings,
  enrichEvidenceCard,
  enrichTimelineEvent,
  evidenceKindKeys,
  formatDateLabel,
  formatFileSize,
  getEvidenceKind,
  getInitialAnalysis,
  getLocalAnalysis,
  getSubmitStatus,
  getTimelinePhase,
  isQuotaExceededError,
  newId,
  sanitizeSavedAnalysis,
  sanitizeSavedCard,
  sanitizeSavedFile,
  sanitizeSavedTimelineEvent,
  setActiveDateFormatting,
  sha256File,
  shortChecksum,
  STORAGE_KEY,
  stripExtractedTextFromFiles,
  strengthFromKind,
  takeSavedItems,
  timelinePhaseKeys,
  toDateTimeInput,
  truncateSavedText,
  getExtension,
  guessEvidenceKind,
  type EvidenceCard,
  type EvidenceKind,
  type EvidenceStrength,
  type ReportVariant,
  type SavedReport,
  type StudyTraceAnalysis,
  type StudyTraceIngestResult,
  type StudyTraceSettings,
  type SubmitStatus,
  type TimelineEvent,
  type TimelinePhase,
  type UploadedEvidenceFile,
} from './lib';
import { exportReportPdf } from './report-pdf';

export function StudyTraceWorkspace({
  projectId,
  embedded = false,
}: {
  projectId?: string;
  embedded?: boolean;
} = {}) {
  const t = useTranslations('studytrace');
  const locale = useLocale();

  // Keep the parameter-free date formatters in sync with the active locale.
  setActiveDateFormatting(locale === 'zh' ? 'zh-CN' : 'en', t('date.unknown'));

  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [courseName, setCourseName] = useState('');
  const [submittedAt, setSubmittedAt] = useState('');
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
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
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
  const [reportVariant, setReportVariant] =
    useState<ReportVariant>('school-submission');

  const storageKey = projectId ? `${STORAGE_KEY}:${projectId}` : STORAGE_KEY;
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualCard, setManualCard] = useState({
    title: '',
    kind: 'writing-process' as EvidenceKind,
    summary: '',
    notes: '',
    proofTarget: '',
    paperLocator: '',
  });
  const [manualEvent, setManualEvent] = useState({
    date: toDateTimeInput(new Date()),
    label: '',
    detail: '',
    phase: 'draft' as TimelinePhase,
  });

  const applyLocalSnapshot = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const data = JSON.parse(saved);
      setAssignmentTitle(data.assignmentTitle || '');
      setCourseName(data.courseName || '');
      setSubmittedAt(data.submittedAt || '');
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
        data.analysis
          ? sanitizeSavedAnalysis(data.analysis)
          : getInitialAnalysis(t)
      );
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, t]);

  const applyCloudSnapshot = useCallback(
    (snapshot: any) => {
      const project = snapshot?.project || {};
      setAssignmentTitle(project.title || '');
      setCourseName(project.courseName || '');
      setSubmittedAt(project.settings?.submittedAt || '');
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
            category: getEvidenceKind(file.category) || 'writing-process',
            extractedText: file.extractedText || undefined,
            checksum: file.checksum || undefined,
          })
        )
      );
      setCards(
        (Array.isArray(snapshot?.cards) ? snapshot.cards : [])
          .map(
            (card: any): EvidenceCard => ({
              id: card.id,
              title: card.title || '',
              kind: getEvidenceKind(card.kind) || 'appeal',
              source: card.source || '',
              fileId: card.fileId || undefined,
              summary: card.summary || '',
              notes: card.notes || '',
              strength: (card.strength || 'medium') as EvidenceStrength,
              proofTarget: card.proofTarget || undefined,
              paperLocator: card.paperLocator || undefined,
              // Keep unset so enrichEvidenceCard can derive a kind-aware default.
              submitStatus: card.submitStatus
                ? getSubmitStatus(card.submitStatus)
                : undefined,
              actionItems: Array.isArray(card.actionItems)
                ? card.actionItems
                : [],
              tags: Array.isArray(card.tags) ? card.tags : [],
              riskFlags: Array.isArray(card.riskFlags) ? card.riskFlags : [],
            })
          )
          .map((card: EvidenceCard) => enrichEvidenceCard(card, t))
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
            phase: getTimelinePhase(event.phase) || 'draft',
            cardIds: Array.isArray(event.cardIds) ? event.cardIds : [],
          })
        )
      );
      if (snapshot?.analysis) {
        setAnalysis(sanitizeSavedAnalysis(snapshot.analysis));
      }
    },
    [t]
  );

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
        settings: {
          ...settings,
          submittedAt,
        },
      },
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        extension: file.extension,
        category: file.category,
        lastModified: file.lastModified,
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
        proofTarget: card.proofTarget,
        paperLocator: card.paperLocator,
        submitStatus: card.submitStatus,
        actionItems: card.actionItems,
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
        phase: event.phase,
        cardIds: event.cardIds,
      })),
    }),
    [
      projectId,
      assignmentTitle,
      courseName,
      submittedAt,
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
      submittedAt,
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
            submittedAt,
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
    submittedAt,
    institutionPolicy,
    concern,
    aiBoundary,
    files,
    cards,
    timeline,
    settings,
    analysis,
    t,
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
    submittedAt,
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
  const coverageReadyCount = coverage.filter((item) => item.ready).length;
  const coveragePercent = coverage.length
    ? Math.round((coverageReadyCount / coverage.length) * 100)
    : 0;

  const sortedTimeline = useMemo(
    () =>
      [...timeline].sort((a, b) => {
        const left = new Date(a.date).getTime() || 0;
        const right = new Date(b.date).getTime() || 0;
        return left - right;
      }),
    [timeline]
  );

  const groupedFiles = useMemo(
    () =>
      evidenceKindKeys.map((kind) => ({
        kind,
        label: t(`evidenceKinds.${kind}`),
        files: files.filter((file) => file.category === kind),
      })),
    [files, t]
  );

  const processConclusion = useMemo(() => {
    const writingDays = new Set(
      sortedTimeline
        .map((event) => (event.date ? event.date.slice(0, 10) : ''))
        .filter(Boolean)
    ).size;
    const draftCount = cards.filter(
      (card) => card.kind === 'writing-process'
    ).length;
    const citationCount = cards.filter(
      (card) => card.kind === 'citation'
    ).length;
    const aiUseCount = cards.filter((card) => card.kind === 'ai-use').length;

    return t('workspace.timeline.processConclusion', {
      days: writingDays,
      drafts: draftCount,
      citations: citationCount,
      ai: aiUseCount,
    });
  }, [cards, sortedTimeline, t]);

  const requestIngest = async (
    uploadedFiles: UploadedEvidenceFile[]
  ): Promise<StudyTraceIngestResult> => {
    const response = await fetch('/api/studytrace/ingest', {
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
          submittedAt,
          institutionPolicy,
          concern,
        },
        files: uploadedFiles,
        aiBoundary,
        settings,
      }),
    });

    const result = await response.json();
    if (!response.ok || result.code !== 0) {
      throw new Error(result.message || 'ingest failed');
    }

    return result.data.ingest as StudyTraceIngestResult;
  };

  const handleFiles = async (incomingFiles: FileList | File[]) => {
    const list = Array.from(incomingFiles);
    if (!list.length) return;

    setStatusMessage(t('workspace.upload.status.organizing'));
    const parsedFiles: UploadedEvidenceFile[] = [];
    const fallbackFiles: UploadedEvidenceFile[] = [];
    // Dedupe by content hash so re-uploading identical files never charges
    // ingest credits twice or produces duplicate cards.
    const knownChecksums = new Set(
      files.map((file) => file.checksum).filter(Boolean)
    );
    let skippedDuplicates = 0;

    for (const [index, file] of list.entries()) {
      const fallbackCategory = guessEvidenceKind(file);
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

      if (checksum && knownChecksums.has(checksum)) {
        skippedDuplicates += 1;
        continue;
      }
      if (checksum) {
        knownChecksums.add(checksum);
      }

      const uploadedFile: UploadedEvidenceFile = {
        id: newId(),
        name: file.name,
        size: file.size,
        type: file.type || 'unknown',
        extension: getExtension(file.name),
        lastModified: new Date(file.lastModified).toISOString(),
        lastModifiedLabel: formatDateLabel(file.lastModified),
        category: 'writing-process',
        extractedText,
        checksum,
      };

      parsedFiles.push(uploadedFile);
      fallbackFiles.push({
        ...uploadedFile,
        category: fallbackCategory,
      });
    }

    if (!parsedFiles.length) {
      setStatusMessage(
        t('workspace.upload.status.allDuplicates', {
          count: skippedDuplicates,
        })
      );
      return;
    }

    let nextFiles = fallbackFiles;
    let nextCards = fallbackFiles.map((file) => buildCardFromFile(file, t));
    let cardByFileId = new Map(nextCards.map((card) => [card.fileId, card]));
    let nextEvents = fallbackFiles.map((file) =>
      buildTimelineFromFile(file, t, cardByFileId.get(file.id)?.id)
    );
    let nextStatus = t('workspace.upload.status.localGenerated', {
      count: nextCards.length,
    });

    try {
      setStatusMessage(t('workspace.upload.status.ingesting'));
      const ingest = await requestIngest(parsedFiles);

      if (ingest.evidenceCards?.length) {
        nextFiles = applyIngestFileCategories(parsedFiles, ingest.files);
        nextCards = ingest.evidenceCards.map((card) =>
          enrichEvidenceCard(card, t)
        );
        cardByFileId = new Map(nextCards.map((card) => [card.fileId, card]));
        nextEvents = ingest.timelineEvents?.length
          ? ingest.timelineEvents.map(enrichTimelineEvent)
          : nextFiles.map((file) =>
              buildTimelineFromFile(file, t, cardByFileId.get(file.id)?.id)
            );
        nextStatus = t('workspace.upload.status.aiGenerated', {
          cards: nextCards.length,
          events: nextEvents.length,
        });
      }
    } catch (error) {
      nextStatus =
        error instanceof Error && error.message.includes('auth')
          ? t('workspace.upload.status.needAuth')
          : error instanceof Error && error.message.includes('credits')
            ? t('workspace.upload.status.needCredits')
            : t('workspace.upload.status.unavailable');
    }

    setFiles((prev) => [...nextFiles, ...prev]);
    setCards((prev) => [...nextCards, ...prev]);
    setTimeline((prev) => [...nextEvents, ...prev]);
    const nextAnalysis = getLocalAnalysis({
      files: [...nextFiles, ...files],
      cards: [...nextCards, ...cards],
      timeline: [...nextEvents, ...timeline],
      aiBoundary,
      settings,
      t,
    });

    setAnalysis(nextAnalysis);
    const duplicateNote = skippedDuplicates
      ? ` ${t('workspace.upload.status.duplicatesSkipped', {
          count: skippedDuplicates,
        })}`
      : '';
    setStatusMessage(
      `${nextStatus}${duplicateNote} ${t('workspace.upload.status.reportReady', {
        score: nextAnalysis.trustScore,
      })}`
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
    const card = enrichEvidenceCard(
      {
        id: newId(),
        title: manualCard.title || kindLabel,
        kind,
        source: t('workspace.cards.sourceManual'),
        summary: manualCard.summary,
        notes: manualCard.notes,
        proofTarget: manualCard.proofTarget,
        paperLocator: manualCard.paperLocator,
        strength: strengthFromKind(kind),
        tags: [kindLabel],
        riskFlags: [],
      },
      t
    );

    setCards((prev) => [card, ...prev]);
    setManualCard({
      title: '',
      kind: 'writing-process',
      summary: '',
      notes: '',
      proofTarget: '',
      paperLocator: '',
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
        phase: manualEvent.phase,
        cardIds: [],
      },
      ...prev,
    ]);
    setManualEvent({
      date: toDateTimeInput(new Date()),
      label: '',
      detail: '',
      phase: 'draft',
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
    // Detach the card from any timeline events referencing it.
    setTimeline((prev) =>
      prev.map((event) =>
        event.cardIds?.includes(id)
          ? { ...event, cardIds: event.cardIds.filter((cid) => cid !== id) }
          : event
      )
    );
  };

  const deleteTimelineEvent = (id: string) => {
    setTimeline((prev) => prev.filter((event) => event.id !== id));
  };

  // Deleting a file also removes its derived cards and timeline events, so no
  // orphaned evidence stays behind. Manual entries are never touched.
  const deleteFile = (id: string) => {
    const removedCardIds = new Set(
      cards.filter((card) => card.fileId === id).map((card) => card.id)
    );

    setFiles((prev) => prev.filter((file) => file.id !== id));
    setCards((prev) => prev.filter((card) => card.fileId !== id));
    setTimeline((prev) =>
      prev
        // Auto-generated events reference exactly the removed card(s); events
        // whose every linked card was removed go away with the file.
        .filter(
          (event) =>
            !event.cardIds?.length ||
            !event.cardIds.every((cid) => removedCardIds.has(cid))
        )
        .map((event) =>
          event.cardIds?.some((cid) => removedCardIds.has(cid))
            ? {
                ...event,
                cardIds: event.cardIds.filter(
                  (cid) => !removedCardIds.has(cid)
                ),
              }
            : event
        )
    );
    setStatusMessage(t('workspace.upload.status.fileRemoved'));
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
            submittedAt,
            institutionPolicy,
            concern,
          },
          files: stripExtractedTextFromFiles(files),
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
      setHasAnalyzed(true);
      setActiveTab('report');
    }
  };

  const analysisReady = hasAnalyzed || analysis.providerStatus === 'ai';
  const hasMaterials = cards.length > 0 || files.length > 0;
  const nextStep: 'upload' | 'analyze' | 'export' = !hasMaterials
    ? 'upload'
    : !analysisReady
      ? 'analyze'
      : 'export';

  const guidedSteps = [
    {
      key: 'upload',
      tab: 'upload',
      label: t('workspace.steps.upload'),
      done: hasMaterials,
    },
    {
      key: 'review',
      tab: 'cards',
      label: t('workspace.steps.review'),
      done: hasMaterials && analysisReady,
    },
    {
      key: 'export',
      tab: 'report',
      label: t('workspace.steps.export'),
      done: analysisReady,
    },
  ];

  const handleNextStep = () => {
    if (nextStep === 'upload') {
      setActiveTab('upload');
      return;
    }
    if (nextStep === 'analyze') {
      void runAnalysis();
      return;
    }
    setActiveTab('report');
  };

  const nextStepLabel =
    nextStep === 'upload'
      ? t('workspace.sidebar.nextUpload')
      : nextStep === 'analyze'
        ? t('workspace.sidebar.generate')
        : t('workspace.sidebar.nextExport');

  const report = useMemo(() => {
    const reportCards =
      reportVariant === 'school-submission'
        ? cards.filter((card) => card.submitStatus === 'ready')
        : cards;
    const showInternalRisks = reportVariant !== 'school-submission';

    const evidenceLines = reportCards
      .map(
        (card, index) =>
          `${index + 1}. ${card.title} | ${t(`evidenceKinds.${card.kind}`)} | ${t('reportDoc.credibility')}: ${t(`strength.${card.strength}`)}\n   - ${t('reportDoc.proofTarget')}: ${card.proofTarget || t('reportDoc.empty')}\n   - ${t('reportDoc.paperLocator')}: ${card.paperLocator || t('reportDoc.empty')}\n   - ${t('reportDoc.submitStatus')}: ${card.submitStatus ? t(`submitStatus.${card.submitStatus}`) : t('reportDoc.empty')}\n   - ${card.summary || t('reportDoc.noSummary')}\n   - ${t('reportDoc.notesLabel')}: ${card.notes || t('reportDoc.empty')}${
            showInternalRisks && card.riskFlags?.length
              ? `\n   - ${t('reportDoc.cardRisks')}: ${card.riskFlags.join('; ')}`
              : ''
          }`
      )
      .join('\n');

    const timelineLines = sortedTimeline
      .map(
        (event, index) =>
          `${index + 1}. ${event.date ? formatDateLabel(event.date) : t('date.empty')} | ${event.label}\n   - ${t('reportDoc.phase')}: ${event.phase ? t(`timelinePhases.${event.phase}`) : t('reportDoc.empty')}\n   - ${event.detail || t('reportDoc.empty')}\n   - ${t('reportDoc.sourceLabel')}: ${event.source}`
      )
      .join('\n');

    const fingerprintLines = files
      .map(
        (file, index) =>
          `${index + 1}. ${file.name}\n   - ${t('reportDoc.fingerprintSha')}: ${file.checksum || t('reportDoc.fingerprintUncomputed')}\n   - ${t('reportDoc.fingerprintLastModified')}: ${file.lastModifiedLabel}`
      )
      .join('\n');

    const notFilled = t('reportDoc.notFilled');
    const citationCards = cards.filter((card) => card.kind === 'citation');
    const aiUseCards = cards.filter((card) => card.kind === 'ai-use');
    const aiPolicyLabel = t(
      settings.aiPolicy === 'none'
        ? 'workspace.sidebar.policyNone'
        : settings.aiPolicy === 'drafting-with-disclosure'
          ? 'workspace.sidebar.policyDisclosure'
          : 'workspace.sidebar.policyAssistive'
    );
    const detectorCaveatLine = settings.includeDetectorCaveat
      ? `${t('reportDoc.detectorCaveat')}\n\n`
      : '';
    const riskSection = showInternalRisks
      ? `
## ${t('reportDoc.riskHeading')}

${analysis.riskItems.map((item) => `- ${item}`).join('\n')}

## ${t('reportDoc.gapsHeading')}

${analysis.evidenceGaps.map((item) => `- ${item}`).join('\n')}
`
      : '';
    const checklistSection =
      reportVariant === 'self-check'
        ? `
## ${t('reportDoc.checklistHeading')}

${analysis.exportChecklist.map((item) => `- ${item}`).join('\n')}
`
        : '';

    return `# ${t(`reportDoc.variantTitles.${reportVariant}`)}

## ${t('reportDoc.basicHeading')}

- ${t('reportDoc.assignment')}: ${assignmentTitle || notFilled}
- ${t('reportDoc.course')}: ${courseName || notFilled}
- ${t('reportDoc.submissionTime')}: ${submittedAt ? formatDateLabel(submittedAt) : notFilled}
- ${t('reportDoc.concern')}: ${concern || notFilled}
- ${t('reportDoc.policy')}: ${institutionPolicy || notFilled}

## ${t('reportDoc.summaryHeading')}

${reportVariant === 'school-submission' ? processConclusion : t('reportDoc.trustScore', { score: analysis.trustScore })}

${analysis.summary}

## ${t('reportDoc.citationSummaryHeading')}

${citationCards.length ? t('reportDoc.citationSummary', { count: citationCards.length }) : t('reportDoc.noCitationSummary')}

## ${t('reportDoc.aiBoundaryHeading')}

- ${t('reportDoc.aiPolicyLabel')}: ${aiPolicyLabel}

${analysis.aiBoundaryStatement || aiBoundary || notFilled}

${aiUseCards.length ? t('reportDoc.aiUseSummary', { count: aiUseCards.length }) : t('reportDoc.noAiUseSummary')}

## ${t('reportDoc.cardsHeading')}

${evidenceLines || t('reportDoc.noCards')}

## ${t('reportDoc.timelineHeading')}

${timelineLines || t('reportDoc.noTimeline')}

## ${t('reportDoc.fingerprintHeading')}

${t('reportDoc.fingerprintNote')}

${fingerprintLines || t('reportDoc.noFiles')}

${riskSection}

## ${t('reportDoc.appealHeading')}

${analysis.appealOutline.map((item, index) => `${index + 1}. ${item}`).join('\n')}

${checklistSection}

## ${t('reportDoc.disclaimerHeading')}

${detectorCaveatLine}${t('reportDoc.disclaimer')}
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
    processConclusion,
    reportVariant,
    settings.aiPolicy,
    settings.includeDetectorCaveat,
    sortedTimeline,
    submittedAt,
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
    setSubmittedAt('');
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
      <main
        className={cn(
          'bg-muted/20 flex min-h-dvh items-center justify-center',
          !embedded && 'pt-[72px] max-lg:pt-14'
        )}
      >
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <Loader2 className="size-5 animate-spin" />
          {t('workspace.loading')}
        </div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        'bg-muted/20 min-h-dvh',
        !embedded && 'pt-[72px] max-lg:pt-14'
      )}
    >
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

      <section className="from-background to-muted/45 border-b bg-gradient-to-b">
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
              <div className="grid max-w-3xl gap-2 sm:grid-cols-3">
                {[
                  {
                    icon: <UploadCloud className="size-4" />,
                    text: t('workspace.quick.upload'),
                  },
                  {
                    icon: <Sparkles className="size-4" />,
                    text: t('workspace.quick.organize'),
                  },
                  {
                    icon: <FileDown className="size-4" />,
                    text: t('workspace.quick.export'),
                  },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="bg-background/80 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm"
                  >
                    <span className="text-primary">{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card grid grid-cols-2 gap-2 rounded-md border p-2 text-center shadow-sm md:grid-cols-4 lg:min-w-[460px]">
              <Metric label={t('workspace.metricCards')} value={cards.length} />
              <Metric
                label={t('workspace.metricEvents')}
                value={timeline.length}
              />
              <Metric
                label={t('workspace.metricCoverage')}
                value={coveragePercent}
                suffix="%"
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
              <Field label={t('workspace.basic.submittedAt')}>
                <Input
                  type="datetime-local"
                  value={submittedAt}
                  onChange={(event) => setSubmittedAt(event.target.value)}
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

          <div className="studytrace-no-print grid gap-2 md:grid-cols-3">
            {guidedSteps.map((step, index) => {
              const isCurrent =
                (nextStep === 'upload' && step.key === 'upload') ||
                (nextStep === 'analyze' && step.key === 'review') ||
                (nextStep === 'export' && step.key === 'export');
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveTab(step.tab)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 text-left transition',
                    isCurrent
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'bg-background hover:bg-muted/40'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      step.done
                        ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                        : isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {step.done ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="text-sm font-medium">{step.label}</span>
                </button>
              );
            })}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="studytrace-no-print grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5">
              <TabsTrigger value="upload">
                {t('workspace.tabs.upload')}
              </TabsTrigger>
              <TabsTrigger value="cards">
                {t('workspace.tabs.cards')}
              </TabsTrigger>
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
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {(
                      t.raw('workspace.upload.acceptedMaterials') as string[]
                    ).map((item) => (
                      <div
                        key={item}
                        className="bg-muted/30 text-muted-foreground rounded-md border px-3 py-2 text-sm"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  <label
                    htmlFor="studytrace-files"
                    className="bg-background hover:bg-muted/35 group flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-4 text-center shadow-sm transition"
                  >
                    <div className="bg-primary/10 text-primary rounded-md border p-3 shadow-sm transition-transform group-hover:scale-105">
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
                    <div className="bg-primary/5 text-primary rounded-md border px-3 py-2 text-sm font-medium">
                      {t('workspace.upload.autoDesc')}
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

                  <div className="grid gap-3 md:grid-cols-2">
                    {files.length ? (
                      groupedFiles.map((group) => (
                        <div
                          key={group.kind}
                          className="bg-background rounded-lg border p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 font-medium">
                              <FileText className="text-primary size-4" />
                              {group.label}
                            </div>
                            <Badge variant="outline">
                              {t('workspace.upload.categoryCount', {
                                count: group.files.length,
                              })}
                            </Badge>
                          </div>
                          {group.files.length ? (
                            <div className="space-y-3">
                              {group.files.map((file) => (
                                <div
                                  key={file.id}
                                  className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto]"
                                >
                                  <div className="min-w-0 space-y-2">
                                    <div className="font-medium break-all">
                                      {file.name}
                                    </div>
                                    <p className="text-muted-foreground text-xs">
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
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t(
                                      'workspace.upload.deleteAria'
                                    )}
                                    onClick={() => deleteFile(file.id)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                              {t('workspace.upload.emptyGroup')}
                            </p>
                          )}
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
                        placeholder={t(
                          'workspace.cards.formSummaryPlaceholder'
                        )}
                      />
                    </Field>
                    <Field label={t('workspace.cards.proofTarget')}>
                      <Input
                        value={manualCard.proofTarget}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            proofTarget: event.target.value,
                          }))
                        }
                        placeholder={t(
                          'workspace.cards.proofTargetPlaceholder'
                        )}
                      />
                    </Field>
                    <Field label={t('workspace.cards.paperLocator')}>
                      <Input
                        value={manualCard.paperLocator}
                        onChange={(event) =>
                          setManualCard((prev) => ({
                            ...prev,
                            paperLocator: event.target.value,
                          }))
                        }
                        placeholder={t(
                          'workspace.cards.paperLocatorPlaceholder'
                        )}
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
                          className={cn(
                            'bg-background rounded-lg border-l-4 p-4 shadow-sm',
                            card.submitStatus === 'ready'
                              ? 'border-l-green-600'
                              : card.submitStatus === 'do-not-submit'
                                ? 'border-l-red-500'
                                : 'border-l-amber-500'
                          )}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                  {t(`evidenceKinds.${card.kind}`)}
                                </Badge>
                                <StrengthBadge strength={card.strength} />
                                <SubmitBadge status={card.submitStatus} />
                                <span className="font-medium break-words">
                                  {card.title}
                                </span>
                              </div>
                              <p className="text-muted-foreground text-sm">
                                {t('workspace.cards.sourceLabel', {
                                  source: card.source,
                                })}
                              </p>
                              <div className="grid gap-2 text-sm md:grid-cols-2">
                                <div className="bg-muted/20 rounded-md border p-3">
                                  <div className="text-muted-foreground text-xs">
                                    {t('workspace.cards.proofTarget')}
                                  </div>
                                  <div className="mt-1 font-medium">
                                    {card.proofTarget ||
                                      t('workspace.cards.notSpecified')}
                                  </div>
                                </div>
                                <div className="bg-muted/20 rounded-md border p-3">
                                  <div className="text-muted-foreground text-xs">
                                    {t('workspace.cards.paperLocator')}
                                  </div>
                                  <div className="mt-1 font-medium">
                                    {card.paperLocator ||
                                      t('workspace.cards.notSpecified')}
                                  </div>
                                </div>
                              </div>
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
                            <Field label={t('workspace.cards.proofTarget')}>
                              <Input
                                value={card.proofTarget || ''}
                                onChange={(event) =>
                                  updateCard(card.id, {
                                    proofTarget: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label={t('workspace.cards.paperLocator')}>
                              <Input
                                value={card.paperLocator || ''}
                                onChange={(event) =>
                                  updateCard(card.id, {
                                    paperLocator: event.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label={t('workspace.cards.submitStatus')}>
                              <select
                                value={card.submitStatus || 'needs-more'}
                                onChange={(event) =>
                                  updateCard(card.id, {
                                    submitStatus: event.target
                                      .value as SubmitStatus,
                                  })
                                }
                                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                              >
                                {(
                                  [
                                    'ready',
                                    'needs-more',
                                    'do-not-submit',
                                  ] as SubmitStatus[]
                                ).map((value) => (
                                  <option key={value} value={value}>
                                    {t(`submitStatus.${value}`)}
                                  </option>
                                ))}
                              </select>
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
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-md border p-3">
                              <div className="mb-2 text-sm font-medium">
                                {t('workspace.cards.riskFlags')}
                              </div>
                              <ul className="text-muted-foreground space-y-1 text-sm">
                                {(card.riskFlags?.length
                                  ? card.riskFlags
                                  : [t('workspace.cards.noRiskFlags')]
                                ).map((item) => (
                                  <li key={item}>- {item}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="rounded-md border p-3">
                              <div className="mb-2 text-sm font-medium">
                                {t('workspace.cards.actions')}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(card.actionItems?.length
                                  ? card.actionItems
                                  : defaultActionItems(
                                      card.submitStatus || 'needs-more',
                                      t
                                    )
                                ).map((item) => (
                                  <Badge key={item} variant="secondary">
                                    {item}
                                  </Badge>
                                ))}
                              </div>
                            </div>
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
                  <div className="bg-primary/5 rounded-md border p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="text-primary mt-0.5 size-5" />
                      <div>
                        <div className="text-sm font-medium">
                          {t('workspace.timeline.processConclusionTitle')}
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm leading-6">
                          {processConclusion}
                        </p>
                      </div>
                    </div>
                  </div>

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
                    <Field label={t('workspace.timeline.phase')}>
                      <select
                        value={manualEvent.phase}
                        onChange={(event) =>
                          setManualEvent((prev) => ({
                            ...prev,
                            phase: event.target.value as TimelinePhase,
                          }))
                        }
                        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                      >
                        {timelinePhaseKeys.map((value) => (
                          <option key={value} value={value}>
                            {t(`timelinePhases.${value}`)}
                          </option>
                        ))}
                      </select>
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
                              <Badge variant="outline">
                                {event.phase
                                  ? t(`timelinePhases.${event.phase}`)
                                  : t('workspace.timeline.phaseUnknown')}
                              </Badge>
                              <StrengthBadge strength={event.strength} />
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {event.date
                                ? formatDateLabel(event.date)
                                : t('date.empty')}{' '}
                              · {event.source}
                            </p>
                            <p className="text-sm leading-6">{event.detail}</p>
                            {event.cardIds?.length ? (
                              <p className="text-muted-foreground text-xs">
                                {t('workspace.timeline.linkedCards', {
                                  count: event.cardIds.length,
                                })}
                              </p>
                            ) : null}
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

                  <div className="grid gap-3 md:grid-cols-5">
                    {(
                      t.raw('workspace.risk.dimensions') as {
                        title: string;
                        desc: string;
                      }[]
                    ).map((item) => (
                      <div
                        key={item.title}
                        className="bg-background rounded-lg border p-3"
                      >
                        <div className="text-sm font-medium">{item.title}</div>
                        <p className="text-muted-foreground mt-2 text-xs leading-5">
                          {item.desc}
                        </p>
                      </div>
                    ))}
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
                  <div className="studytrace-no-print grid gap-3 md:grid-cols-3">
                    {(
                      [
                        'self-check',
                        'school-submission',
                        'appeal-statement',
                      ] as ReportVariant[]
                    ).map((variant) => (
                      <button
                        key={variant}
                        type="button"
                        onClick={() => setReportVariant(variant)}
                        className={cn(
                          'rounded-lg border p-4 text-left transition',
                          reportVariant === variant
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'bg-background hover:bg-muted/40'
                        )}
                      >
                        <div className="font-medium">
                          {t(`workspace.report.variants.${variant}.title`)}
                        </div>
                        <p className="text-muted-foreground mt-2 text-sm leading-6">
                          {t(`workspace.report.variants.${variant}.desc`)}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="studytrace-no-print flex flex-wrap gap-2">
                    {!analysisReady ? (
                      <Button onClick={runAnalysis} disabled={isAnalyzing}>
                        {isAnalyzing ? (
                          <RefreshCw className="size-4 animate-spin" />
                        ) : (
                          <BrainCircuit className="size-4" />
                        )}
                        {t('workspace.report.generate')}
                      </Button>
                    ) : null}
                    <Button
                      variant={analysisReady ? 'default' : 'outline'}
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
                          {assignmentTitle ||
                            t('workspace.report.noAssignment')}{' '}
                          · {courseName || t('workspace.report.noCourse')}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {t(`workspace.report.variants.${reportVariant}.title`)}
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
                                  {item.title ||
                                    t('workspace.report.unnamedReport')}
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
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('workspace.sidebar.coverageProgress', {
                      ready: coverageReadyCount,
                      total: coverage.length,
                    })}
                  </span>
                  <span className="font-medium">{coveragePercent}%</span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${coveragePercent}%` }}
                  />
                </div>
              </div>
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
                onClick={handleNextStep}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : nextStep === 'upload' ? (
                  <UploadCloud className="size-4" />
                ) : nextStep === 'analyze' ? (
                  <BrainCircuit className="size-4" />
                ) : (
                  <FileDown className="size-4" />
                )}
                {nextStepLabel}
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

function SubmitBadge({ status }: { status?: SubmitStatus }) {
  const t = useTranslations('studytrace');
  const value = status || 'needs-more';
  return (
    <Badge
      variant="outline"
      className={cn(
        value === 'ready' && 'border-green-300 text-green-700',
        value === 'needs-more' && 'border-amber-300 text-amber-700',
        value === 'do-not-submit' && 'border-red-300 text-red-700'
      )}
    >
      {t(`submitStatus.${value}`)}
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
