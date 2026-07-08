import type { useTranslations } from 'next-intl';

/* -------------------------------------------------------------------------- */
/* Types & constants shared across the StudyTrace workspace                   */
/* -------------------------------------------------------------------------- */

export type EvidenceKind =
  | 'paper'
  | 'citation'
  | 'writing-process'
  | 'ai-use'
  | 'school'
  | 'appeal';

export type EvidenceStrength = 'strong' | 'medium' | 'weak';
export type SubmitStatus = 'ready' | 'needs-more' | 'do-not-submit';
export type TimelinePhase =
  | 'topic'
  | 'research'
  | 'reading'
  | 'draft'
  | 'ai-assist'
  | 'revision'
  | 'citation-check'
  | 'submission'
  | 'challenge-appeal';
export type ReportVariant =
  | 'self-check'
  | 'school-submission'
  | 'appeal-statement';

export type UploadedEvidenceFile = {
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

export type EvidenceCard = {
  id: string;
  title: string;
  kind: EvidenceKind;
  source: string;
  fileId?: string;
  summary: string;
  notes: string;
  strength: EvidenceStrength;
  proofTarget?: string;
  paperLocator?: string;
  submitStatus?: SubmitStatus;
  actionItems?: string[];
  tags: string[];
  riskFlags: string[];
};

export type TimelineEvent = {
  id: string;
  date: string;
  label: string;
  detail: string;
  source: string;
  strength: EvidenceStrength;
  phase?: TimelinePhase;
  cardIds?: string[];
};

export type StudyTraceSettings = {
  evidenceStandard: 'balanced' | 'strict';
  riskSensitivity: number;
  aiPolicy: 'none' | 'assistive-only' | 'drafting-with-disclosure';
  includeDetectorCaveat: boolean;
  includeCitationAudit: boolean;
  requiredEvidenceKinds: EvidenceKind[];
};

export type StudyTraceAnalysis = {
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

export type StudyTraceIngestResult = {
  files?: {
    id: string;
    category: EvidenceKind;
  }[];
  evidenceCards: EvidenceCard[];
  timelineEvents: TimelineEvent[];
  providerStatus?: string;
};

export type SavedReport = {
  id: string;
  title: string;
  format: string;
  content: string;
  createdAt: string;
};

export const STORAGE_KEY = 'studytrace-workspace-v1';
export const MAX_SAVED_ITEMS = 120;
export const MAX_SAVED_TEXT_LENGTH = 1_200;
export const MAX_SAVED_ANALYSIS_ITEMS = 20;

// next-intl translator scoped to the `studytrace` namespace. Passed into
// helpers so their generated copy stays locale-aware.
export type StudyTraceTranslator = ReturnType<typeof useTranslations>;

export const evidenceKindKeys: EvidenceKind[] = [
  'paper',
  'citation',
  'writing-process',
  'ai-use',
  'school',
  'appeal',
];

export const timelinePhaseKeys: TimelinePhase[] = [
  'topic',
  'research',
  'reading',
  'draft',
  'ai-assist',
  'revision',
  'citation-check',
  'submission',
  'challenge-appeal',
];

export function getEvidenceKind(value: unknown): EvidenceKind | null {
  const normalized =
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/_/g, '-')
      : '';

  const legacyMap: Record<string, EvidenceKind> = {
    draft: 'writing-process',
    source: 'citation',
    'ai-disclosure': 'ai-use',
    feedback: 'writing-process',
    version: 'writing-process',
    process: 'writing-process',
    other: 'appeal',
  };

  if (legacyMap[normalized]) return legacyMap[normalized];

  return evidenceKindKeys.includes(normalized as EvidenceKind)
    ? (normalized as EvidenceKind)
    : null;
}

export function isEvidenceKind(value: unknown): value is EvidenceKind {
  return Boolean(getEvidenceKind(value));
}

export const defaultSettings: StudyTraceSettings = {
  evidenceStandard: 'balanced',
  riskSensitivity: 62,
  aiPolicy: 'assistive-only',
  includeDetectorCaveat: true,
  includeCitationAudit: true,
  requiredEvidenceKinds: [
    'paper',
    'citation',
    'writing-process',
    'ai-use',
    'school',
    'appeal',
  ],
};

export function getInitialAnalysis(t: StudyTraceTranslator): StudyTraceAnalysis {
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

/* -------------------------------------------------------------------------- */
/* Locale-aware date formatting                                               */
/* -------------------------------------------------------------------------- */

// Date formatting reads these module singletons, set from the active locale on
// each render, so the many call sites below stay parameter-free.
let activeDateLocale = 'en';
let unrecognizedTimeLabel = 'Unrecognized time';

export function setActiveDateFormatting(locale: string, unknownLabel: string) {
  activeDateLocale = locale;
  unrecognizedTimeLabel = unknownLabel;
}

export function getActiveDateLocale() {
  return activeDateLocale;
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function formatFileSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDateLabel(value: string | number | Date) {
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

export function toDateTimeInput(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function getExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

// Content fingerprint. Computed in the browser over the raw bytes so the
// original file never leaves the device, yet the SHA-256 can later prove the
// exact content that existed at upload time. Requires a secure context
// (https / localhost); degrades to an empty string otherwise.
export async function sha256File(file: File): Promise<string> {
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

export function shortChecksum(value?: string) {
  if (!value) return '';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function guessEvidenceKind(file: File): EvidenceKind {
  const name = file.name.toLowerCase();
  const ext = getExtension(file.name);
  if (
    name.includes('final') ||
    name.includes('submission') ||
    name.includes('submitted') ||
    name.includes('essay') ||
    name.includes('paper') ||
    name.includes('最终') ||
    name.includes('终稿') ||
    name.includes('论文')
  ) {
    return 'paper';
  }
  if (
    name.includes('citation') ||
    name.includes('source') ||
    name.includes('reference') ||
    name.includes('bibliography') ||
    name.includes('zotero') ||
    name.includes('endnote') ||
    name.includes('bibtex') ||
    name.includes('ris') ||
    ['bib', 'ris'].includes(ext) ||
    name.includes('quote') ||
    name.includes('引用') ||
    name.includes('参考') ||
    name.includes('文献')
  ) {
    return 'citation';
  }
  if (
    name.includes('ai') ||
    name.includes('chatgpt') ||
    name.includes('claude') ||
    name.includes('grammarly') ||
    name.includes('prompt') ||
    name.includes('声明') ||
    name.includes('润色')
  ) {
    return 'ai-use';
  }
  if (
    name.includes('policy') ||
    name.includes('assignment') ||
    name.includes('brief') ||
    name.includes('rubric') ||
    name.includes('turnitin') ||
    name.includes('gptzero') ||
    name.includes('misconduct') ||
    name.includes('notice') ||
    name.includes('email') ||
    name.includes('政策') ||
    name.includes('题目') ||
    name.includes('作业要求') ||
    name.includes('通知') ||
    name.includes('邮件')
  ) {
    return 'school';
  }
  if (
    name.includes('appeal') ||
    name.includes('statement') ||
    name.includes('申诉') ||
    name.includes('陈述')
  ) {
    return 'appeal';
  }
  if (
    name.includes('feedback') ||
    name.includes('comment') ||
    name.includes('批注') ||
    name.includes('反馈')
  ) {
    return 'writing-process';
  }
  if (
    name.includes('history') ||
    name.includes('version') ||
    name.includes('draft') ||
    name.includes('outline') ||
    name.includes('google docs') ||
    name.includes('草稿') ||
    name.includes('提纲') ||
    name.includes('版本') ||
    ['gdoc', 'docx', 'doc', 'pages'].includes(ext)
  ) {
    return 'writing-process';
  }
  return 'writing-process';
}

/* -------------------------------------------------------------------------- */
/* Snapshot sanitizers (localStorage size limits)                             */
/* -------------------------------------------------------------------------- */

export function truncateSavedText(
  value: unknown,
  maxLength = MAX_SAVED_TEXT_LENGTH
) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

export function takeSavedItems<T>(items: T[] | undefined) {
  return Array.isArray(items) ? items.slice(0, MAX_SAVED_ITEMS) : [];
}

export function sanitizeSavedFile(
  file: UploadedEvidenceFile
): UploadedEvidenceFile {
  return {
    id: file.id,
    name: truncateSavedText(file.name, 240),
    size: Number(file.size) || 0,
    type: truncateSavedText(file.type, 120) || 'unknown',
    extension: truncateSavedText(file.extension, 40),
    lastModified: truncateSavedText(file.lastModified, 80),
    lastModifiedLabel: truncateSavedText(file.lastModifiedLabel, 80),
    category: getEvidenceKind(file.category) || 'writing-process',
    checksum: file.checksum,
  };
}

export function stripExtractedTextFromFiles(
  files: UploadedEvidenceFile[]
): UploadedEvidenceFile[] {
  return files.map(sanitizeSavedFile);
}

export function sanitizeSavedCard(card: EvidenceCard): EvidenceCard {
  const kind = getEvidenceKind(card.kind) || 'appeal';
  const submitStatus = getSubmitStatus(card.submitStatus);

  return {
    id: card.id,
    title: truncateSavedText(card.title, 240),
    kind,
    source: truncateSavedText(card.source, 240),
    fileId: card.fileId,
    summary: truncateSavedText(card.summary),
    notes: truncateSavedText(card.notes),
    strength: card.strength,
    proofTarget: truncateSavedText(card.proofTarget, 240),
    paperLocator: truncateSavedText(card.paperLocator, 180),
    submitStatus,
    actionItems: takeSavedItems(card.actionItems).map((item) =>
      truncateSavedText(item, 120)
    ),
    tags: takeSavedItems(card.tags).map((tag) => truncateSavedText(tag, 80)),
    riskFlags: takeSavedItems(card.riskFlags).map((flag) =>
      truncateSavedText(flag, 160)
    ),
  };
}

export function sanitizeSavedTimelineEvent(event: TimelineEvent): TimelineEvent {
  return {
    id: event.id,
    date: truncateSavedText(event.date, 80),
    label: truncateSavedText(event.label, 240),
    detail: truncateSavedText(event.detail),
    source: truncateSavedText(event.source, 240),
    strength: event.strength,
    phase: getTimelinePhase(event.phase) || 'draft',
    cardIds: takeSavedItems(event.cardIds).map((id) =>
      truncateSavedText(id, 120)
    ),
  };
}

export function sanitizeSavedAnalysis(
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

export function isQuotaExceededError(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }

  return error instanceof Error && error.name.includes('Quota');
}

/* -------------------------------------------------------------------------- */
/* Evidence card / timeline enrichment                                        */
/* -------------------------------------------------------------------------- */

export function strengthFromKind(kind: EvidenceKind): EvidenceStrength {
  if (['paper', 'citation', 'writing-process'].includes(kind)) {
    return 'strong';
  }
  if (['ai-use', 'school'].includes(kind)) return 'medium';
  return 'weak';
}

export function getSubmitStatus(value: unknown): SubmitStatus {
  return value === 'ready' ||
    value === 'needs-more' ||
    value === 'do-not-submit'
    ? value
    : 'needs-more';
}

export function getTimelinePhase(value: unknown): TimelinePhase | null {
  const normalized =
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/_/g, '-')
      : '';

  return timelinePhaseKeys.includes(normalized as TimelinePhase)
    ? (normalized as TimelinePhase)
    : null;
}

export function phaseFromKind(kind: EvidenceKind): TimelinePhase {
  if (kind === 'paper') return 'submission';
  if (kind === 'citation') return 'research';
  if (kind === 'ai-use') return 'ai-assist';
  if (kind === 'school') return 'topic';
  if (kind === 'appeal') return 'challenge-appeal';
  return 'draft';
}

export function defaultProofTarget(kind: EvidenceKind, t: StudyTraceTranslator) {
  return t(`proofTargets.${kind}`);
}

export function defaultPaperLocator(
  kind: EvidenceKind,
  t: StudyTraceTranslator
) {
  return kind === 'paper'
    ? t('workspace.cards.locatorWholePaper')
    : t('workspace.cards.locatorToFill');
}

export function defaultSubmitStatus(
  kind: EvidenceKind,
  strength: EvidenceStrength
): SubmitStatus {
  if (kind === 'appeal') return 'needs-more';
  if (strength === 'weak') return 'needs-more';
  return 'ready';
}

export function defaultRiskFlags(kind: EvidenceKind, t: StudyTraceTranslator) {
  const values = t.raw(`defaultRiskFlags.${kind}`) as string[];
  return Array.isArray(values) ? values.slice(0, 2) : [];
}

export function defaultActionItems(
  status: SubmitStatus,
  t: StudyTraceTranslator
) {
  const values = t.raw(`actionItems.${status}`) as string[];
  return Array.isArray(values) ? values : [];
}

export function enrichEvidenceCard(
  card: EvidenceCard,
  t: StudyTraceTranslator
): EvidenceCard {
  const kind = getEvidenceKind(card.kind) || 'appeal';
  const strength = card.strength || strengthFromKind(kind);
  const submitStatus = card.submitStatus || defaultSubmitStatus(kind, strength);

  return {
    ...card,
    kind,
    strength,
    proofTarget: card.proofTarget || defaultProofTarget(kind, t),
    paperLocator: card.paperLocator || defaultPaperLocator(kind, t),
    submitStatus,
    actionItems: card.actionItems?.length
      ? card.actionItems
      : defaultActionItems(submitStatus, t),
    riskFlags: card.riskFlags?.length
      ? card.riskFlags
      : defaultRiskFlags(kind, t),
  };
}

export function buildCardFromFile(
  file: UploadedEvidenceFile,
  t: StudyTraceTranslator
): EvidenceCard {
  const kindLabel = t(`evidenceKinds.${file.category}`);
  const preview = file.extractedText
    ? file.extractedText.replace(/\s+/g, ' ').slice(0, 180)
    : '';

  return enrichEvidenceCard(
    {
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
    },
    t
  );
}

export function buildTimelineFromFile(
  file: UploadedEvidenceFile,
  t: StudyTraceTranslator,
  cardId?: string
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
    phase: phaseFromKind(file.category),
    cardIds: cardId ? [cardId] : [],
  };
}

export function enrichTimelineEvent(event: TimelineEvent): TimelineEvent {
  return {
    ...event,
    phase: getTimelinePhase(event.phase) || 'draft',
    cardIds: Array.isArray(event.cardIds) ? event.cardIds : [],
  };
}

export function applyIngestFileCategories(
  uploadedFiles: UploadedEvidenceFile[],
  ingestFiles?: StudyTraceIngestResult['files']
) {
  if (!Array.isArray(ingestFiles) || !ingestFiles.length) {
    return uploadedFiles;
  }

  const categoryById = new Map(
    ingestFiles
      .filter((file) => file?.id && isEvidenceKind(file.category))
      .map((file) => [file.id, getEvidenceKind(file.category) || 'appeal'])
  );

  return uploadedFiles.map((file) => ({
    ...file,
    category: categoryById.get(file.id) || file.category,
  }));
}

/* -------------------------------------------------------------------------- */
/* Local heuristic analysis                                                   */
/* -------------------------------------------------------------------------- */

export function getLocalAnalysis({
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
  const citationCount = cards.filter((card) => card.kind === 'citation').length;
  const processCount = cards.filter(
    (card) => card.kind === 'writing-process'
  ).length;
  const aiUseCount = cards.filter((card) => card.kind === 'ai-use').length;
  const listSeparator = activeDateLocale.startsWith('zh') ? '、' : ', ';

  const strict = settings.evidenceStandard === 'strict';
  // Sensitivity shifts the score conservatively: high sensitivity users want
  // the tool to under-promise, low sensitivity users want encouragement.
  const sensitivityAdjust = Math.round((50 - settings.riskSensitivity) / 10);

  const rawScore =
    22 +
    Math.min(files.length, 8) * 4 +
    Math.min(cards.length, 10) * 3 +
    strongCards * 5 +
    Math.min(chronologicalEvents, 8) * 4 +
    (boundaryReady ? 14 : 0) +
    (citationCount >= 2 ? 8 : 0) +
    (processCount >= 2 ? 6 : 0) +
    (aiUseCount ? 4 : 0) -
    missingRequired.length * (strict ? 10 : 7) +
    sensitivityAdjust;

  const score = Math.max(
    8,
    Math.min(94, Math.round(strict ? rawScore * 0.92 : rawScore))
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

  if (settings.includeCitationAudit && citationCount < 2) {
    riskItems.push(t('analysis.local.riskSourceShort'));
  }

  if (strict && strongCards < 2) {
    riskItems.push(t('analysis.local.riskStrictStrong'));
  }

  if (settings.riskSensitivity >= 70) {
    riskItems.push(t('analysis.local.riskHighSensitivity'));
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
      processCount
        ? t('analysis.local.timelineHasDraft')
        : t('analysis.local.timelineNoDraft'),
      cards.some((card) => card.kind === 'school')
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
