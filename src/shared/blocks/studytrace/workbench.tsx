'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileCheck2,
  FileJson,
  FileText,
  GraduationCap,
  History,
  Link2,
  RefreshCw,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
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
import { Progress } from '@/shared/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';

import {
  createDemoProject,
  createEmptyProject,
  demoPapers,
  demoPolicies,
  demoTaskScripts,
  demoWritingSamples,
} from './mock-data';
import {
  STUDYTRACE_STORAGE_KEY,
  type AcademicProcessStage,
  type EvidenceCard,
  type EvidenceKind,
  type EvidenceStatus,
  type EvidenceStrength,
  type ReportVariant,
  type RiskCategory,
  type RiskFinding,
  type RiskLevel,
  type StudyTraceAnalysisResult,
  type StudyTraceProject,
  type SubmissionSuitability,
  type TimelineEvent,
  type TraceFile,
  type TraceFileGroup,
  type TraceFileKind,
  type TraceReport,
} from './types';

type ActiveSection = 'paper' | 'evidence' | 'timeline' | 'risks' | 'reports';
type FileKindSelection = TraceFileKind | 'auto';

interface ApiResponse<T> {
  code: number;
  message: string;
  data?: T;
}

interface PaperSegment {
  id: string;
  location: string;
  text: string;
  evidenceIds: string[];
  citationCount: number;
  hasAIUse: boolean;
  riskLevel: RiskLevel;
}

const initialProject: StudyTraceProject = {
  id: 'trace-loading',
  title: 'StudyTrace workspace',
  studentProfile: 'International student preparing an academic process proof',
  courseName: '',
  assignmentTitle: '',
  paperTitle: '',
  submittedAt: '',
  createdAt: '',
  updatedAt: '',
  files: [],
  evidenceCards: [],
  timeline: [],
  risks: [],
  processConclusion: '',
};

const fileGroupLabels: Record<TraceFileGroup, string> = {
  paper: 'Paper',
  'citation-evidence': 'Citation evidence',
  'writing-process': 'Writing process',
  'ai-use': 'AI use records',
  'school-material': 'School material',
  'appeal-material': 'Appeal material',
};

const fileKindLabels: Record<TraceFileKind, string> = {
  'final-paper': 'Final paper',
  draft: 'Draft file',
  'version-history': 'Version history',
  'reference-source': 'Source PDF / page',
  'citation-library': 'Zotero / BibTeX / RIS',
  'ai-use-log': 'AI / Grammarly record',
  'school-policy': 'School AI policy',
  'assignment-brief': 'Assignment brief',
  'misconduct-notice': 'Notice / Turnitin / GPTZero',
  'appeal-material': 'Appeal material',
  notes: 'Process notes',
  paper: 'Paper or bibliography',
  policy: 'Institution policy',
};

const processStageLabels: Record<AcademicProcessStage, string> = {
  'topic-confirmation': 'Topic and brief',
  'literature-search': 'Literature search',
  'reading-notes': 'Reading notes',
  'first-draft': 'First draft',
  'ai-assistance': 'AI assistance',
  revision: 'Revision',
  'citation-check': 'Citation check',
  submission: 'Submission',
  challenge: 'Question raised',
  appeal: 'Appeal',
};

const evidenceKindLabels: Record<EvidenceKind, string> = {
  citation: 'Citation',
  draft: 'Draft',
  'ai-use': 'AI use',
  'version-history': 'Version history',
  'mentor-feedback': 'Tutor feedback',
  policy: 'Policy',
  appeal: 'Appeal',
  process: 'Process',
};

const riskCategoryLabels: Record<RiskCategory, string> = {
  'citation-authenticity': 'Citation authenticity',
  'citation-format': 'Citation format',
  'ai-use-explanation': 'AI use explanation',
  'writing-process-gap': 'Writing process gap',
  'appeal-completeness': 'Appeal completeness',
};

const reportVariantLabels: Record<ReportVariant, string> = {
  'student-check': 'Student check version',
  'school-submission': 'School submission version',
  'appeal-statement': 'Appeal statement version',
};

const reportVariantDescriptions: Record<ReportVariant, string> = {
  'student-check':
    'Includes risks, missing evidence, sensitive notes, and next actions for internal review.',
  'school-submission':
    'Uses restrained language and includes only materials that can be explained with evidence.',
  'appeal-statement':
    'Combines timeline, evidence index, AI-use statement, and citation verification summary.',
};

const evidenceIcons: Record<EvidenceKind, LucideIcon> = {
  citation: Link2,
  draft: FileText,
  'ai-use': Brain,
  'version-history': History,
  'mentor-feedback': GraduationCap,
  policy: Scale,
  appeal: FileCheck2,
  process: ClipboardList,
};

const timelineIcons: Record<TimelineEvent['type'], LucideIcon> = {
  upload: Upload,
  analysis: Sparkles,
  review: ClipboardList,
  export: Download,
};

const navItems: Array<{
  id: ActiveSection;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'paper', label: 'Paper preview', icon: FileText },
  { id: 'evidence', label: 'Evidence cards', icon: ShieldCheck },
  { id: 'timeline', label: 'Process timeline', icon: History },
  { id: 'risks', label: 'Risk explanation', icon: AlertTriangle },
  { id: 'reports', label: 'Report export', icon: Download },
];

const TEXT_PREVIEW_LIMIT = 60000;
const textFileExtensions = [
  '.txt',
  '.md',
  '.markdown',
  '.bib',
  '.ris',
  '.csv',
  '.json',
  '.tex',
  '.rtf',
  '.log',
];

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function shortHash(hash: string) {
  if (!hash) return 'pending';

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function compactText(value?: string, fallback = '') {
  if (!value) return fallback;

  return value.replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function averageScore(cards: EvidenceCard[]) {
  if (!cards.length) return 0;

  return Math.round(
    cards.reduce((total, card) => total + card.score, 0) / cards.length
  );
}

function statusFromScore(score: number): EvidenceStatus {
  if (score >= 85) return 'verified';
  if (score >= 75) return 'ready';
  if (score >= 60) return 'review';

  return 'risk';
}

function strengthFromScore(score: number): EvidenceStrength {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'medium';

  return 'weak';
}

function suitabilityFromScore(score: number): SubmissionSuitability {
  if (score >= 80) return 'ready-to-submit';
  if (score >= 55) return 'needs-supplement';

  return 'not-recommended';
}

function statusVariant(status: EvidenceStatus) {
  if (status === 'verified') return 'default';
  if (status === 'ready') return 'secondary';
  if (status === 'risk') return 'destructive';

  return 'outline';
}

function strengthVariant(strength: EvidenceStrength) {
  if (strength === 'strong') return 'default';
  if (strength === 'medium') return 'secondary';

  return 'outline';
}

function suitabilityVariant(suitability: SubmissionSuitability) {
  if (suitability === 'ready-to-submit') return 'default';
  if (suitability === 'not-recommended') return 'destructive';

  return 'secondary';
}

function riskVariant(level: RiskLevel) {
  if (level === 'high') return 'destructive';
  if (level === 'medium') return 'secondary';

  return 'outline';
}

function riskTone(level: RiskLevel) {
  if (level === 'high') {
    return 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100';
  }

  if (level === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100';
  }

  return 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100';
}

function groupFromKind(kind: TraceFileKind): TraceFileGroup {
  if (kind === 'final-paper' || kind === 'paper') return 'paper';
  if (kind === 'reference-source' || kind === 'citation-library') {
    return 'citation-evidence';
  }
  if (kind === 'draft' || kind === 'version-history') {
    return 'writing-process';
  }
  if (kind === 'ai-use-log') return 'ai-use';
  if (kind === 'school-policy' || kind === 'assignment-brief' || kind === 'policy') {
    return 'school-material';
  }
  if (kind === 'misconduct-notice' || kind === 'appeal-material') {
    return 'appeal-material';
  }

  return 'writing-process';
}

function inferFileKind(file: File, fallback: TraceFileKind): TraceFileKind {
  const name = file.name.toLowerCase();

  if (name.includes('final') || name.includes('submitted')) return 'final-paper';
  if (name.includes('draft')) return 'draft';
  if (name.includes('history') || name.includes('version')) {
    return 'version-history';
  }
  if (
    name.endsWith('.bib') ||
    name.endsWith('.ris') ||
    name.includes('zotero') ||
    name.includes('endnote') ||
    name.includes('bibliography')
  ) {
    return 'citation-library';
  }
  if (
    name.includes('source') ||
    name.includes('doi') ||
    name.includes('reference')
  ) {
    return 'reference-source';
  }
  if (
    name.includes('chatgpt') ||
    name.includes('claude') ||
    name.includes('grammarly') ||
    name.includes('ai-log') ||
    name.includes('ai_use')
  ) {
    return 'ai-use-log';
  }
  if (name.includes('policy')) return 'school-policy';
  if (name.includes('brief') || name.includes('assignment')) {
    return 'assignment-brief';
  }
  if (
    name.includes('turnitin') ||
    name.includes('gptzero') ||
    name.includes('notice') ||
    name.includes('misconduct') ||
    name.includes('email')
  ) {
    return 'misconduct-notice';
  }
  if (name.includes('appeal')) return 'appeal-material';

  return fallback;
}

function fallbackHash(input: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const hex = (hash >>> 0).toString(16).padStart(8, '0');

  return hex.repeat(8).slice(0, 64);
}

async function sha256File(file: File) {
  const buffer = await file.arrayBuffer();

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  return fallbackHash(`${file.name}:${file.size}:${file.lastModified}`);
}

function isTextLikeFile(file: File) {
  const lowerName = file.name.toLowerCase();

  return (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    textFileExtensions.some((extension) => lowerName.endsWith(extension))
  );
}

async function readTextPreview(file: File) {
  if (!isTextLikeFile(file)) return undefined;

  try {
    const text = await file.text();
    const normalized = text.replace(/\u0000/g, '').trim();

    return normalized.slice(0, TEXT_PREVIEW_LIMIT);
  } catch {
    return undefined;
  }
}

function normalizeStoredProject(value: any): StudyTraceProject | null {
  if (!value?.id) return null;

  const files = Array.isArray(value.files)
    ? value.files.map((file: any) => {
        const kind = (file.kind || 'notes') as TraceFileKind;

        return {
          ...file,
          kind,
          group: file.group || groupFromKind(kind),
        } as TraceFile;
      })
    : [];

  return {
    id: value.id,
    title: value.title || 'Untitled academic process proof package',
    studentProfile:
      value.studentProfile ||
      'International student preparing an academic integrity explanation',
    courseName: value.courseName || '',
    assignmentTitle: value.assignmentTitle || '',
    paperTitle: value.paperTitle || '',
    submittedAt: value.submittedAt || '',
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString(),
    files,
    evidenceCards: Array.isArray(value.evidenceCards)
      ? value.evidenceCards.map((card: any) => {
          const score = Number.isFinite(Number(card.score))
            ? Number(card.score)
            : 60;
          const action = card.action || 'Review supporting materials.';

          return {
            ...card,
            kind: card.kind || 'process',
            status: card.status || statusFromScore(score),
            strength: card.strength || strengthFromScore(score),
            suitability: card.suitability || suitabilityFromScore(score),
            proofTarget:
              card.proofTarget ||
              'Explains how this material supports the writing process.',
            linkedParagraph: card.linkedParagraph || 'Whole paper',
            score,
            evidence: Array.isArray(card.evidence) ? card.evidence : [],
            risks: Array.isArray(card.risks) ? card.risks : [],
            sourceIds: Array.isArray(card.sourceIds) ? card.sourceIds : [],
            actions: Array.isArray(card.actions) ? card.actions : [action],
            action,
            includedInReport:
              typeof card.includedInReport === 'boolean'
                ? card.includedInReport
                : true,
            sensitive:
              typeof card.sensitive === 'boolean' ? card.sensitive : false,
          } as EvidenceCard;
        })
      : [],
    timeline: Array.isArray(value.timeline)
      ? value.timeline.map((event: any) => ({
          ...event,
          stage: event.stage || 'review',
          evidenceCardIds: Array.isArray(event.evidenceCardIds)
            ? event.evidenceCardIds
            : [],
        }))
      : [],
    risks: Array.isArray(value.risks)
      ? value.risks.map((risk: any) => ({
          ...risk,
          category: risk.category || 'appeal-completeness',
        }))
      : [],
    processConclusion:
      value.processConclusion ||
      'StudyTrace has not generated a process conclusion for this package yet.',
    report: value.report,
    analysis: value.analysis,
  };
}

function createProcessConclusion(project: StudyTraceProject) {
  if (project.processConclusion && project.processConclusion !== initialProject.processConclusion) {
    return project.processConclusion;
  }

  const groupCount = new Set(project.files.map((file) => file.group)).size;
  const readyCards = project.evidenceCards.filter(
    (card) => card.suitability === 'ready-to-submit'
  ).length;
  const riskCount = project.risks.filter((risk) => risk.level !== 'low').length;

  if (!project.files.length) {
    return 'No process conclusion yet. Upload the final paper, drafts, citation sources, AI-use records, school materials, and appeal records.';
  }

  return `This package has ${project.files.length} uploaded material(s) across ${groupCount} category group(s), ${readyCards} submit-ready evidence card(s), and ${riskCount} explanation issue(s) to resolve.`;
}

function createReport(
  project: StudyTraceProject,
  evidenceCards = project.evidenceCards,
  risks = project.risks,
  variant: ReportVariant = 'student-check'
): TraceReport {
  const highRiskCount = risks.filter((risk) => risk.level === 'high').length;
  const readinessScore = Math.max(
    0,
    Math.min(100, averageScore(evidenceCards) - highRiskCount * 6)
  );

  return {
    id: newId('report'),
    createdAt: new Date().toISOString(),
    readinessScore,
    variant,
    summary:
      readinessScore >= 80
        ? 'The evidence package is coherent enough for a restrained school-facing explanation after final source and privacy checks.'
        : readinessScore >= 60
          ? 'The evidence package can support a student self-check, but selected records need stronger timestamps, source pages, or policy references.'
          : 'The evidence package needs more source material before it can support a credible academic process explanation.',
  };
}

function buildEvidenceCards(files: TraceFile[]): EvidenceCard[] {
  const finalPapers = files.filter((file) => file.group === 'paper');
  const citationFiles = files.filter(
    (file) => file.group === 'citation-evidence'
  );
  const processFiles = files.filter(
    (file) => file.group === 'writing-process'
  );
  const aiFiles = files.filter((file) => file.group === 'ai-use');
  const schoolFiles = files.filter((file) => file.group === 'school-material');
  const appealFiles = files.filter((file) => file.group === 'appeal-material');

  const citationScore = finalPapers.length && citationFiles.length ? 84 : 50;
  const processScore = processFiles.length ? 82 : 46;
  const aiScore = aiFiles.length ? 76 : 52;
  const appealScore = Math.min(
    90,
    36 +
      finalPapers.length * 12 +
      citationFiles.length * 12 +
      processFiles.length * 14 +
      aiFiles.length * 10 +
      schoolFiles.length * 12 +
      appealFiles.length * 8
  );

  return [
    {
      id: newId('evidence-citation'),
      kind: 'citation',
      title: 'Citation source support',
      status: statusFromScore(citationScore),
      strength: strengthFromScore(citationScore),
      suitability: suitabilityFromScore(citationScore),
      proofTarget:
        'Shows whether references can be tied to source files, metadata, and local paper paragraphs.',
      linkedParagraph: 'Paper paragraphs with in-text citations',
      score: citationScore,
      summary:
        finalPapers.length && citationFiles.length
          ? `${citationFiles.length} citation source file(s) are linked to ${finalPapers.length} paper file(s).`
          : 'The package needs both the final paper and source evidence before citation support can be explained.',
      evidence:
        finalPapers.length && citationFiles.length
          ? [
              'The final paper and citation source materials are both present.',
              'StudyTrace can separate source existence from local claim support.',
              'File hashes preserve the uploaded citation evidence package.',
            ]
          : [
              'Upload the final paper, bibliography, DOI list, Zotero export, RIS file, or source PDFs.',
              'Citation explanation is weak until source evidence is attached.',
            ],
      risks:
        finalPapers.length && citationFiles.length
          ? ['Confirm missing DOI or publisher-page evidence before submission.']
          : ['Citation authenticity cannot be explained from a file list alone.'],
      sourceIds: [...finalPapers, ...citationFiles].map((file) => file.id),
      actions: ['Supplement DOI pages', 'Generate citation explanation'],
      action: 'Attach source metadata and publisher pages for unresolved references.',
      includedInReport: true,
      sensitive: false,
    },
    {
      id: newId('evidence-writing-process'),
      kind: 'version-history',
      title: 'Writing process continuity',
      status: statusFromScore(processScore),
      strength: strengthFromScore(processScore),
      suitability: suitabilityFromScore(processScore),
      proofTarget:
        'Shows that the paper developed through drafts, version history, notes, or tutor feedback.',
      linkedParagraph: 'Whole paper and draft history',
      score: processScore,
      summary: processFiles.length
        ? `${processFiles.length} writing-process file(s) support a dated authorship narrative.`
        : 'No draft, version history, or writing notes are attached yet.',
      evidence: processFiles.length
        ? [
            'Process materials can explain how the paper evolved before submission.',
            'Draft files can be connected to final paragraphs and citations.',
            'Version history or screenshots can support timeline continuity.',
          ]
        : [
            'Upload Google Docs or Word version history, early drafts, outlines, notes, or tutor feedback.',
            'A strong appeal explanation usually needs dated process records.',
          ],
      risks: processFiles.length
        ? ['Redact private account details before school-facing export.']
        : ['A writing-process gap may make authorship explanation harder.'],
      sourceIds: processFiles.map((file) => file.id),
      actions: ['Add draft screenshots', 'Hide sensitive account details'],
      action: 'Attach dated draft or version-history material.',
      includedInReport: true,
      sensitive: true,
    },
    {
      id: newId('evidence-ai-boundary'),
      kind: 'ai-use',
      title: 'AI use boundary explanation',
      status: statusFromScore(aiScore),
      strength: strengthFromScore(aiScore),
      suitability: suitabilityFromScore(aiScore),
      proofTarget:
        'Explains whether AI was used for polishing, planning, feedback, or authorship-sensitive work.',
      linkedParagraph: 'Paragraphs mentioned in AI-use records',
      score: aiScore,
      summary: aiFiles.length
        ? `${aiFiles.length} AI-use record(s) can support a boundary statement.`
        : 'No ChatGPT, Claude, Grammarly, or other AI-use record is attached yet.',
      evidence: aiFiles.length
        ? [
            'AI-use records can identify tool, action, stage, and student revision.',
            'The explanation should avoid claiming more than the records show.',
            'Human revision evidence should be linked to any AI-assisted paragraph.',
          ]
        : [
            'Upload AI chat exports, screenshots, Grammarly records, or revision notes.',
            'AI-use explanation is stronger when timestamps and exact prompts are visible.',
          ],
      risks: aiFiles.length
        ? ['Confirm timestamps and tool names before exporting.']
        : ['AI use cannot be explained clearly without the original usage record.'],
      sourceIds: aiFiles.map((file) => file.id),
      actions: ['Generate AI use statement', 'Add timestamped export'],
      action: 'Attach timestamped AI-use records and link them to revised paragraphs.',
      includedInReport: true,
      sensitive: true,
    },
    {
      id: newId('evidence-appeal-package'),
      kind: 'appeal',
      title: 'Appeal material completeness',
      status: statusFromScore(appealScore),
      strength: strengthFromScore(appealScore),
      suitability: suitabilityFromScore(appealScore),
      proofTarget:
        'Shows whether the package has enough school, submission, and notice materials for a coherent explanation.',
      linkedParagraph: 'Appeal statement and evidence index',
      score: appealScore,
      summary:
        files.length > 0
          ? `${files.length} material(s) now form a structured process-proof package.`
          : 'The appeal package has not started because no material has been added.',
      evidence:
        files.length > 0
          ? [
              'Each uploaded material has a timestamp, category, and SHA-256 fingerprint.',
              'School materials and appeal records connect the explanation to the actual question raised.',
              'The report can include an evidence index and appendix manifest.',
            ]
          : [
              'Add final paper, evidence, school material, and appeal records.',
              'StudyTrace will organize the process proof after upload.',
            ],
      risks:
        schoolFiles.length || appealFiles.length
          ? ['Use restrained wording and remove internal risk notes from school-facing export.']
          : ['The package should include assignment brief, policy, notice, or school emails.'],
      sourceIds: [...schoolFiles, ...appealFiles, ...files].map((file) => file.id),
      actions: ['Create school submission version', 'Create appeal statement version'],
      action: 'Attach the relevant policy, assignment brief, notice, or school email.',
      includedInReport: true,
      sensitive: false,
    },
  ];
}

function buildRiskFindings(
  files: TraceFile[],
  evidenceCards: EvidenceCard[]
): RiskFinding[] {
  const risks: RiskFinding[] = [];
  const hasPaper = files.some((file) => file.group === 'paper');
  const hasCitationEvidence = files.some(
    (file) => file.group === 'citation-evidence'
  );
  const hasProcess = files.some((file) => file.group === 'writing-process');
  const hasAIUse = files.some((file) => file.group === 'ai-use');
  const hasSchoolMaterial = files.some(
    (file) => file.group === 'school-material'
  );
  const hasAppealMaterial = files.some(
    (file) => file.group === 'appeal-material'
  );

  if (!hasPaper || !hasCitationEvidence) {
    risks.push({
      id: newId('risk-citation'),
      level: 'high',
      category: 'citation-authenticity',
      area: 'Citation authenticity',
      title: 'Citation explanation needs source evidence',
      explanation:
        'The citation issue can be explained more credibly when the final paper is paired with source files, bibliography exports, DOI pages, or publisher records.',
      recommendation:
        'Upload the final paper together with Zotero, EndNote, BibTeX, RIS, source PDFs, DOI pages, or library screenshots.',
      linkedEvidenceIds: evidenceCards
        .filter((card) => card.kind === 'citation')
        .map((card) => card.id),
    });
  }

  if (!hasProcess) {
    risks.push({
      id: newId('risk-process-gap'),
      level: 'high',
      category: 'writing-process-gap',
      area: 'Writing process gap',
      title: 'Draft continuity is not yet visible',
      explanation:
        'A process explanation is stronger when drafts, version history, notes, or tutor feedback show how the paper changed over time.',
      recommendation:
        'Upload Google Docs or Word version history, early drafts, outlines, reading notes, or tutor feedback.',
      linkedEvidenceIds: evidenceCards
        .filter((card) => card.kind === 'version-history')
        .map((card) => card.id),
    });
  }

  if (!hasAIUse) {
    risks.push({
      id: newId('risk-ai-boundary'),
      level: 'medium',
      category: 'ai-use-explanation',
      area: 'AI use explanation',
      title: 'AI-use boundary is not evidenced yet',
      explanation:
        'If the school question involves AI, the package should show what tool was used, when it was used, and what the student did afterwards.',
      recommendation:
        'Upload ChatGPT, Claude, Grammarly, or editing records with dates and visible prompts where possible.',
      linkedEvidenceIds: evidenceCards
        .filter((card) => card.kind === 'ai-use')
        .map((card) => card.id),
    });
  }

  if (!hasSchoolMaterial || !hasAppealMaterial) {
    risks.push({
      id: newId('risk-appeal-completeness'),
      level: 'medium',
      category: 'appeal-completeness',
      area: 'Appeal material completeness',
      title: 'School context should be attached',
      explanation:
        'The explanation should respond to the actual assignment brief, policy, notice, Turnitin/GPTZero record, or school email.',
      recommendation:
        'Upload the assignment brief, AI policy, misconduct notice, Turnitin report, GPTZero record, or relevant email.',
      linkedEvidenceIds: evidenceCards
        .filter((card) => card.kind === 'appeal' || card.kind === 'policy')
        .map((card) => card.id),
    });
  }

  if (!risks.length) {
    risks.push({
      id: newId('risk-ready-review'),
      level: 'low',
      category: 'appeal-completeness',
      area: 'Appeal material completeness',
      title: 'Evidence package is coherent for review',
      explanation:
        'The package includes paper, citation evidence, writing-process records, AI-use records, and school context. Remaining work is verification and redaction.',
      recommendation:
        'Review sensitive details, confirm source links, and export the appropriate report version.',
      linkedEvidenceIds: evidenceCards.map((card) => card.id),
    });
  }

  return risks;
}

function toReportProject(project: StudyTraceProject, variant?: ReportVariant) {
  if (project.report && (!variant || project.report.variant === variant)) {
    return project;
  }

  return {
    ...project,
    report: createReport(
      project,
      project.evidenceCards,
      project.risks,
      variant || 'student-check'
    ),
  };
}

function appendTimeline(
  project: StudyTraceProject,
  event: Omit<TimelineEvent, 'id' | 'at'>
): StudyTraceProject {
  const at = new Date().toISOString();

  return {
    ...project,
    updatedAt: at,
    timeline: [
      ...project.timeline,
      {
        ...event,
        id: newId('timeline'),
        at,
      },
    ],
  };
}

function groupedFiles(files: TraceFile[]) {
  return (Object.keys(fileGroupLabels) as TraceFileGroup[]).map((group) => ({
    group,
    files: files.filter((file) => file.group === group),
  }));
}

function getPackageMetrics(project: StudyTraceProject) {
  const citationMatches = project.analysis?.citationMatches ?? [];
  const matchedCitations = citationMatches.filter(
    (citation) => citation.status === 'matched'
  ).length;
  const citationTotal =
    citationMatches.length ||
    project.evidenceCards.filter((card) => card.kind === 'citation').length ||
    0;
  const processFiles = project.files.filter(
    (file) => file.group === 'writing-process'
  ).length;
  const draftSupport = Math.min(
    100,
    processFiles * 32 +
      project.evidenceCards.filter((card) => card.kind === 'version-history')
        .length *
        40
  );
  const aiRecords = project.analysis?.aiUseRecords.length ?? 0;
  const aiCards = project.evidenceCards.filter((card) => card.kind === 'ai-use');
  const explainedAI = aiRecords || aiCards.length;
  const appealGroups = new Set(project.files.map((file) => file.group)).size;
  const processCompleteness =
    project.report?.readinessScore ?? averageScore(project.evidenceCards);

  return {
    processCompleteness,
    citationLabel: citationTotal
      ? `${matchedCitations || Math.max(0, citationTotal - 1)} / ${citationTotal}`
      : '0 / 0',
    draftSupport: `${draftSupport}%`,
    aiUseLabel: explainedAI ? `${explainedAI} explained` : '0 explained',
    appealCompleteness:
      appealGroups >= 5 ? 'High' : appealGroups >= 3 ? 'Medium' : 'Low',
  };
}

function buildPaperSegments(project: StudyTraceProject): PaperSegment[] {
  if (project.analysis?.claims.length) {
    return project.analysis.claims.slice(0, 8).map((claim, index) => ({
      id: claim.id,
      location: claim.location || `Paragraph ${index + 1}`,
      text: claim.text,
      evidenceIds: claim.evidenceIds,
      citationCount: project.analysis?.citationMatches.filter(
        (citation) => citation.claimId === claim.id
      ).length ?? 0,
      hasAIUse: Boolean(project.analysis?.aiUseRecords.length),
      riskLevel:
        claim.confidence >= 75 ? 'low' : claim.confidence >= 55 ? 'medium' : 'high',
    }));
  }

  const finalPaper = project.files.find((file) => file.group === 'paper');
  const raw = finalPaper?.content || finalPaper?.excerpt;
  if (raw) {
    return compactText(raw)
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .slice(0, 5)
      .map((text, index) => ({
        id: `segment-${index + 1}`,
        location: `Detected text ${index + 1}`,
        text,
        evidenceIds: project.evidenceCards.slice(0, 2).map((card) => card.id),
        citationCount: /doi|citation|reference|\(\d{4}\)/i.test(text) ? 1 : 0,
        hasAIUse: project.files.some((file) => file.group === 'ai-use'),
        riskLevel: index === 0 ? 'medium' : 'low',
      }));
  }

  return [
    {
      id: 'empty-paper',
      location: 'Paper preview',
      text: 'Upload the final paper to create paragraph-level highlights for citations, AI-use explanation, linked evidence, and unresolved risks.',
      evidenceIds: [],
      citationCount: 0,
      hasAIUse: false,
      riskLevel: 'medium',
    },
  ];
}

function reportCardsForVariant(
  project: StudyTraceProject,
  variant: ReportVariant
) {
  if (variant === 'student-check') return project.evidenceCards;
  if (variant === 'school-submission') {
    return project.evidenceCards.filter(
      (card) =>
        card.includedInReport &&
        card.suitability !== 'not-recommended' &&
        !card.sensitive
    );
  }

  return project.evidenceCards.filter(
    (card) => card.includedInReport && card.suitability !== 'not-recommended'
  );
}

function buildReportHtml(project: StudyTraceProject, variant: ReportVariant) {
  const projectWithReport = toReportProject(project, variant);
  const report = projectWithReport.report as TraceReport;
  const evidenceCards = reportCardsForVariant(projectWithReport, variant);
  const includeInternalRisks = variant === 'student-check';
  const includeRiskExplanation = variant !== 'school-submission';
  const files = projectWithReport.files
    .map(
      (file) => `
        <tr>
          <td>${escapeHtml(file.name)}</td>
          <td>${escapeHtml(fileGroupLabels[file.group])}</td>
          <td>${escapeHtml(fileKindLabels[file.kind])}</td>
          <td>${escapeHtml(formatBytes(file.size))}</td>
          <td><code>${escapeHtml(file.hash)}</code></td>
          <td>${escapeHtml(new Date(file.uploadedAt).toLocaleString())}</td>
        </tr>`
    )
    .join('');
  const cards = evidenceCards
    .map(
      (card) => `
        <section class="panel">
          <div class="row">
            <h2>${escapeHtml(card.title)}</h2>
            <strong>${escapeHtml(card.strength)} / ${escapeHtml(card.suitability)}</strong>
          </div>
          <p><b>Proves:</b> ${escapeHtml(card.proofTarget)}</p>
          <p><b>Linked paragraph:</b> ${escapeHtml(card.linkedParagraph)}</p>
          <p>${escapeHtml(card.summary)}</p>
          <ul>${card.evidence
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join('')}</ul>
          ${
            includeInternalRisks
              ? `<p><b>Review notes:</b> ${escapeHtml(card.risks.join('; ') || 'No internal note.')}</p>`
              : ''
          }
          <p><b>Next action:</b> ${escapeHtml(card.action)}</p>
        </section>`
    )
    .join('');
  const risks = projectWithReport.risks
    .map(
      (risk) => `
        <section class="panel">
          <div class="row">
            <h2>${escapeHtml(risk.title)}</h2>
            <strong>${escapeHtml(riskCategoryLabels[risk.category])}</strong>
          </div>
          <p>${escapeHtml(risk.explanation)}</p>
          <p><b>Suggested supplement:</b> ${escapeHtml(risk.recommendation)}</p>
        </section>`
    )
    .join('');
  const timeline = projectWithReport.timeline
    .map(
      (event) => `
        <li>
          <b>${escapeHtml(formatDate(event.at))} - ${escapeHtml(event.title)}</b>
          <span>${escapeHtml(processStageLabels[event.stage])}: ${escapeHtml(event.description)}</span>
        </li>`
    )
    .join('');
  const citations = projectWithReport.analysis?.citationMatches
    .map(
      (citation) => `
        <tr>
          <td>${escapeHtml(citation.citationText)}</td>
          <td>${escapeHtml(citation.status)}</td>
          <td>${escapeHtml(
            [citation.sourceTitle, citation.authors, citation.year, citation.doi]
              .filter(Boolean)
              .join(' | ')
          )}</td>
          <td>${escapeHtml(citation.explanation)}</td>
        </tr>`
    )
    .join('');
  const aiUseRecords = projectWithReport.analysis?.aiUseRecords
    .map(
      (record) => `
        <tr>
          <td>${escapeHtml(record.stage)}</td>
          <td>${escapeHtml(record.promptOrAction)}</td>
          <td>${escapeHtml(record.humanAction)}</td>
          <td>${escapeHtml(record.toolName || 'Not specified')}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectWithReport.title)} - ${escapeHtml(reportVariantLabels[variant])}</title>
  <style>
    body { color: #111827; font-family: Arial, sans-serif; line-height: 1.55; margin: 40px; }
    header { border-bottom: 2px solid #111827; margin-bottom: 24px; padding-bottom: 16px; }
    h1 { font-size: 30px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 0 0 8px; }
    h3 { font-size: 15px; margin: 18px 0 8px; }
    code { font-size: 11px; overflow-wrap: anywhere; }
    table { border-collapse: collapse; margin-top: 12px; width: 100%; }
    th, td { border: 1px solid #d1d5db; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .score { background: #ecfdf5; border: 1px solid #a7f3d0; display: inline-block; font-size: 20px; font-weight: 700; margin: 8px 0; padding: 10px 14px; }
    .panel { border: 1px solid #d1d5db; margin: 14px 0; padding: 14px; }
    .row { align-items: start; display: flex; gap: 16px; justify-content: space-between; }
    li { margin: 8px 0; }
    li span { display: block; color: #4b5563; }
    @media print { body { margin: 18mm; } .panel { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(projectWithReport.paperTitle || projectWithReport.title)}</h1>
    <p><b>Report:</b> ${escapeHtml(reportVariantLabels[variant])}</p>
    <p><b>Course:</b> ${escapeHtml(projectWithReport.courseName || 'Not recorded')}</p>
    <p><b>Assignment:</b> ${escapeHtml(projectWithReport.assignmentTitle || 'Not recorded')}</p>
    <p><b>Student context:</b> ${escapeHtml(projectWithReport.studentProfile)}</p>
    <div class="score">Process completeness ${report.readinessScore}/100</div>
    <p>${escapeHtml(projectWithReport.processConclusion || report.summary)}</p>
    <p>Generated by StudyTrace on ${escapeHtml(new Date(report.createdAt).toLocaleString())}</p>
  </header>
  <main>
    <section>
      <h2>Writing Process Summary</h2>
      <p>${escapeHtml(report.summary)}</p>
    </section>
    <section>
      <h2>Citation Verification Summary</h2>
      <table>
        <thead><tr><th>Citation</th><th>Status</th><th>Metadata</th><th>Explanation</th></tr></thead>
        <tbody>${citations || '<tr><td colspan="4">No citation matches extracted yet.</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>AI Use Statement Material</h2>
      <table>
        <thead><tr><th>Stage</th><th>AI Action</th><th>Human Action</th><th>Tool</th></tr></thead>
        <tbody>${aiUseRecords || '<tr><td colspan="4">No AI-use records extracted yet.</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Key Evidence Timeline</h2>
      <ol>${timeline || '<li>No timeline events recorded.</li>'}</ol>
    </section>
    <section>
      <h2>Evidence Card Index</h2>
      ${cards || '<p>No evidence cards generated yet.</p>'}
    </section>
    ${
      includeRiskExplanation
        ? `<section><h2>Explanation Issues For Review</h2>${risks || '<p>No explanation risks recorded.</p>'}</section>`
        : ''
    }
    <section>
      <h2>Appendix: File Manifest</h2>
      <table>
        <thead>
          <tr><th>File</th><th>Group</th><th>Kind</th><th>Size</th><th>SHA-256</th><th>Recorded At</th></tr>
        </thead>
        <tbody>${files || '<tr><td colspan="6">No files recorded.</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Scope Note</h2>
      <p>This report does not decide whether academic misconduct occurred. It organizes verifiable materials to explain the writing process and support communication with the institution.</p>
    </section>
  </main>
</body>
</html>`;
}

// localStorage has a ~5MB per-origin quota. Uploaded file `content` (full text
// up to TEXT_PREVIEW_LIMIT chars each) plus the analysis payload can exceed it,
// so we persist a slimmed copy and progressively degrade instead of crashing.
const MAX_STORED_CONTENT_CHARS = 4000;

function stripFileContent(project: StudyTraceProject): StudyTraceProject {
  return {
    ...project,
    files: project.files.map((file) => ({ ...file, content: undefined })),
  };
}

function persistProject(project: StudyTraceProject) {
  const slimContent: StudyTraceProject = {
    ...project,
    files: project.files.map((file) => ({
      ...file,
      content: file.content
        ? file.content.slice(0, MAX_STORED_CONTENT_CHARS)
        : file.content,
    })),
  };
  const candidates: StudyTraceProject[] = [
    project,
    slimContent,
    stripFileContent(project),
    { ...stripFileContent(project), analysis: undefined },
  ];

  for (const candidate of candidates) {
    try {
      localStorage.setItem(STUDYTRACE_STORAGE_KEY, JSON.stringify([candidate]));
      return true;
    } catch {
      // Try the next, smaller candidate.
    }
  }

  try {
    localStorage.removeItem(STUDYTRACE_STORAGE_KEY);
  } catch {
    // Ignore: storage is unavailable, keep the session in memory only.
  }

  return false;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function reportPreviewText(project: StudyTraceProject, variant: ReportVariant) {
  const report = project.report;

  return [
    `StudyTrace academic process proof package`,
    ``,
    `Report: ${reportVariantLabels[variant]}`,
    `Course: ${project.courseName || 'Not recorded'}`,
    `Assignment: ${project.assignmentTitle || 'Not recorded'}`,
    `Paper: ${project.paperTitle || project.title}`,
    `Process completeness: ${report?.readinessScore ?? averageScore(project.evidenceCards)}/100`,
    ``,
    project.processConclusion ||
      'Run analysis to generate the process conclusion.',
    ``,
    `Evidence cards: ${project.evidenceCards.length}`,
    `Risk explanations: ${project.risks.length}`,
    `Files: ${project.files.length}`,
    ``,
    `Disclaimer: This report does not decide whether academic misconduct occurred. It organizes verifiable materials to explain the writing process and support communication.`,
  ].join('\n');
}

export function StudyTraceWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<StudyTraceProject>(initialProject);
  const [hydrated, setHydrated] = useState(false);
  const [fileKind, setFileKind] = useState<FileKindSelection>('auto');
  const [activeSection, setActiveSection] = useState<ActiveSection>('paper');
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [reportVariant, setReportVariant] =
    useState<ReportVariant>('student-check');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STUDYTRACE_STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StudyTraceProject | StudyTraceProject[];
        const storedProject = normalizeStoredProject(
          Array.isArray(parsed) ? parsed[0] : parsed
        );

        if (storedProject) {
          setProject(storedProject);
          setActiveEvidenceId(storedProject.evidenceCards[0]?.id ?? null);
          setHydrated(true);
          return;
        }
      } catch {
        localStorage.removeItem(STUDYTRACE_STORAGE_KEY);
      }
    }

    const emptyProject = createEmptyProject();
    setProject(emptyProject);
    setActiveEvidenceId(null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const fullyPersisted = persistProject(project);

    setStorageWarning(
      fullyPersisted
        ? null
        : 'This package is large, so only a lightweight copy is saved in this browser. Uploaded file text is kept for this session but may not survive a reload. Export the JSON package to keep a full copy.'
    );
  }, [hydrated, project]);

  const metrics = useMemo(() => getPackageMetrics(project), [project]);
  const fileGroups = useMemo(() => groupedFiles(project.files), [project.files]);
  const paperSegments = useMemo(() => buildPaperSegments(project), [project]);
  const selectedSegment = useMemo(
    () =>
      paperSegments.find((segment) => segment.id === activeSegmentId) ??
      paperSegments[0],
    [activeSegmentId, paperSegments]
  );
  const selectedEvidence = useMemo(
    () =>
      project.evidenceCards.find((card) => card.id === activeEvidenceId) ??
      project.evidenceCards.find((card) =>
        selectedSegment?.evidenceIds.includes(card.id)
      ) ??
      project.evidenceCards[0],
    [activeEvidenceId, project.evidenceCards, selectedSegment]
  );
  const selectedSegmentEvidence = useMemo(
    () =>
      project.evidenceCards.filter((card) =>
        selectedSegment?.evidenceIds.includes(card.id)
      ),
    [project.evidenceCards, selectedSegment]
  );
  const sortedTimeline = useMemo(
    () =>
      [...project.timeline].sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
      ),
    [project.timeline]
  );
  const previewText = useMemo(
    () => reportPreviewText(toReportProject(project, reportVariant), reportVariant),
    [project, reportVariant]
  );
  const processConclusion = useMemo(
    () => createProcessConclusion(project),
    [project]
  );

  const demoStats = [
    {
      label: 'English paper records',
      value: demoPapers.length,
      icon: Search,
    },
    {
      label: 'Writing / AI-use samples',
      value: demoWritingSamples.length,
      icon: Brain,
    },
    {
      label: 'Policy excerpts',
      value: demoPolicies.length,
      icon: Scale,
    },
    {
      label: 'Demo task scripts',
      value: demoTaskScripts.length,
      icon: ClipboardList,
    },
  ];

  function loadDemoCase() {
    const demoProject = createDemoProject();

    setProject(demoProject);
    setActiveEvidenceId(demoProject.evidenceCards[0]?.id ?? null);
    setActiveSegmentId(null);
    setActiveSection('paper');
  }

  function resetWorkspace() {
    const emptyProject = createEmptyProject();

    setProject(emptyProject);
    setActiveEvidenceId(null);
    setActiveSegmentId(null);
    setActiveSection('paper');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function updateProjectMeta(
    field:
      | 'title'
      | 'studentProfile'
      | 'courseName'
      | 'assignmentTitle'
      | 'paperTitle'
      | 'submittedAt',
    value: string
  ) {
    setProject((currentProject) => ({
      ...currentProject,
      [field]: value,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function handleFileChange(files: FileList | null) {
    if (!files?.length) return;

    const uploadedFiles: TraceFile[] = [];

    for (const file of Array.from(files)) {
      const kind =
        fileKind === 'auto' ? inferFileKind(file, 'notes') : inferFileKind(file, fileKind);
      const group = groupFromKind(kind);
      const hash = await sha256File(file);
      const content = await readTextPreview(file);
      const uploadedAt = new Date().toISOString();
      const fallbackExcerpt = `${fileGroupLabels[group]} material recorded locally with SHA-256 fingerprint ${shortHash(hash)}.`;
      const excerpt = compactText(content, fallbackExcerpt).slice(0, 280);

      uploadedFiles.push({
        id: newId('file'),
        name: file.name,
        kind,
        group,
        size: file.size,
        type: file.type || 'application/octet-stream',
        hash,
        uploadedAt,
        source: 'upload',
        excerpt,
        content,
        textExtractedAt: content ? uploadedAt : undefined,
      });
    }

    setProject((currentProject) => {
      const uploadEvents = uploadedFiles.map((file) => ({
        id: newId('timeline'),
        at: file.uploadedAt,
        title: `${fileGroupLabels[file.group]} added`,
        description: `${file.name} was categorized as ${fileKindLabels[file.kind]} and recorded in the evidence manifest.`,
        type: 'upload' as const,
        stage:
          file.group === 'citation-evidence'
            ? ('literature-search' as const)
            : file.group === 'writing-process'
              ? ('first-draft' as const)
              : file.group === 'ai-use'
                ? ('ai-assistance' as const)
                : file.group === 'school-material'
                  ? ('topic-confirmation' as const)
                  : file.group === 'appeal-material'
                    ? ('challenge' as const)
                    : ('submission' as const),
        evidenceCardIds: [],
        fileId: file.id,
      }));
      const updatedAt = new Date().toISOString();

      return {
        ...currentProject,
        updatedAt,
        files: [...currentProject.files, ...uploadedFiles],
        timeline: [...currentProject.timeline, ...uploadEvents],
        processConclusion:
          'New materials were added. Run analysis to refresh the process conclusion and evidence cards.',
        report: undefined,
        analysis: undefined,
      };
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function runAIAnalysis() {
    if (!project.files.length || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await fetch('/api/studytrace/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project: {
            id: project.id,
            title: project.title,
            studentProfile: project.studentProfile,
            courseName: project.courseName,
            assignmentTitle: project.assignmentTitle,
            paperTitle: project.paperTitle,
            submittedAt: project.submittedAt,
            files: project.files.map((file) => ({
              id: file.id,
              name: file.name,
              kind: file.kind,
              group: file.group,
              hash: file.hash,
              uploadedAt: file.uploadedAt,
              excerpt: file.excerpt,
              content: file.content,
            })),
          },
        }),
      });
      const payload =
        (await response.json()) as ApiResponse<StudyTraceAnalysisResult>;

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || 'StudyTrace AI analysis failed');
      }

      const analysis = payload.data;

      setProject((currentProject) => {
        const analysisEvent: TimelineEvent = {
          id: newId('timeline-ai'),
          at: analysis.generatedAt,
          title: 'Academic process proof refreshed',
          description:
            'StudyTrace extracted paragraph issues, evidence cards, citation matches, AI-use records, and explanation risks.',
          type: 'analysis',
          stage: 'citation-check',
          evidenceCardIds: analysis.evidenceCards.map((card) => card.id),
        };
        const updatedProject = appendTimeline(
          {
            ...currentProject,
            evidenceCards: analysis.evidenceCards,
            risks: analysis.risks,
            report: analysis.report,
            analysis,
            processConclusion: analysis.processConclusion,
            timeline: [
              ...currentProject.timeline,
              ...analysis.timelineEvents,
              analysisEvent,
            ],
          },
          {
            title: 'Review package updated',
            description:
              'The report preview and evidence cards now reflect the latest analysis.',
            type: 'review',
            stage: 'appeal',
            evidenceCardIds: analysis.evidenceCards.map((card) => card.id),
          }
        );

        setActiveEvidenceId(analysis.evidenceCards[0]?.id ?? null);
        setActiveSegmentId(null);

        return updatedProject;
      });
    } catch (error: any) {
      const message =
        error?.message ||
        'AI analysis failed. StudyTrace generated a local fallback.';

      setAnalysisError(`${message} Falling back to local process-proof rules.`);
      setIsAnalyzing(false);
      window.setTimeout(() => {
        setProject((currentProject) => {
          const evidenceCards = buildEvidenceCards(currentProject.files);
          const risks = buildRiskFindings(currentProject.files, evidenceCards);
          const report = createReport(
            currentProject,
            evidenceCards,
            risks,
            reportVariant
          );
          const updatedProject = appendTimeline(
            {
              ...currentProject,
              evidenceCards,
              risks,
              report,
              analysis: undefined,
              processConclusion: createProcessConclusion({
                ...currentProject,
                evidenceCards,
                risks,
              }),
            },
            {
              title: 'Local fallback analysis completed',
              description:
                'The AI service was unavailable, so StudyTrace used local evidence-package rules.',
              type: 'analysis',
              stage: 'citation-check',
              evidenceCardIds: evidenceCards.map((card) => card.id),
            }
          );

          setActiveEvidenceId(evidenceCards[0]?.id ?? null);
          setActiveSegmentId(null);

          return updatedProject;
        });
      }, 350);
      return;
    }

    setIsAnalyzing(false);
  }

  function exportHtmlReport(variant: ReportVariant) {
    const exportedProject = appendTimeline(toReportProject(project, variant), {
      title: `${reportVariantLabels[variant]} exported`,
      description:
        'A StudyTrace report was downloaded from the browser for review.',
      type: 'export',
      stage: variant === 'appeal-statement' ? 'appeal' : 'submission',
      evidenceCardIds: project.evidenceCards
        .filter((card) => card.includedInReport)
        .map((card) => card.id),
    });

    downloadTextFile(
      `studytrace-${variant}.html`,
      buildReportHtml(exportedProject, variant),
      'text/html;charset=utf-8'
    );
    setProject(exportedProject);
  }

  function exportJsonPackage() {
    const exportedProject = appendTimeline(toReportProject(project, reportVariant), {
      title: 'JSON evidence package exported',
      description:
        'A structured StudyTrace evidence package was downloaded from the browser.',
      type: 'export',
      stage: 'appeal',
      evidenceCardIds: project.evidenceCards.map((card) => card.id),
    });
    const payload = {
      product: 'StudyTrace process proof package',
      storageKey: STUDYTRACE_STORAGE_KEY,
      exportedAt: new Date().toISOString(),
      reportVariant,
      demoDataStats: {
        papers: demoPapers.length,
        writingSamples: demoWritingSamples.length,
        policies: demoPolicies.length,
        taskScripts: demoTaskScripts.length,
      },
      project: exportedProject,
      disclaimer:
        'This package does not decide whether academic misconduct occurred. It organizes verifiable materials to explain the writing process and support communication.',
    };

    downloadTextFile(
      'studytrace-evidence-package.json',
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    setProject(exportedProject);
  }

  function updateEvidenceReportInclusion(cardId: string, included: boolean) {
    setProject((currentProject) => ({
      ...currentProject,
      updatedAt: new Date().toISOString(),
      evidenceCards: currentProject.evidenceCards.map((card) =>
        card.id === cardId ? { ...card, includedInReport: included } : card
      ),
      report: undefined,
    }));
  }

  function renderPaperPreview() {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Paper paragraph map</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {project.paperTitle || 'Final paper preview'}
                </p>
              </div>
              <Badge variant="outline">{paperSegments.length} segments</Badge>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {paperSegments.map((segment) => {
              const active = selectedSegment?.id === segment.id;

              return (
                <button
                  key={segment.id}
                  type="button"
                  className={cn(
                    'block w-full cursor-pointer rounded-lg border bg-background p-4 text-left transition hover:border-primary/60',
                    active && 'border-primary ring-2 ring-primary/20'
                  )}
                  onClick={() => {
                    setActiveSegmentId(segment.id);
                    setActiveSection('paper');
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{segment.location}</Badge>
                    {segment.citationCount ? (
                      <Badge variant="secondary">
                        {segment.citationCount} citation
                      </Badge>
                    ) : null}
                    {segment.hasAIUse ? (
                      <Badge variant="outline">AI use linked</Badge>
                    ) : null}
                    <Badge variant={riskVariant(segment.riskLevel)}>
                      {segment.riskLevel} review
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-7">{segment.text}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="text-base font-semibold">Material groups</h2>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {fileGroups.map(({ group, files }) => (
              <div key={group} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {fileGroupLabels[group]}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {files.length} file(s)
                    </p>
                  </div>
                  <Badge variant={files.length ? 'secondary' : 'outline'}>
                    {files.length}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {files.slice(0, 3).map((file) => (
                    <div key={file.id} className="min-w-0 text-xs">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="truncate text-muted-foreground">
                        {fileKindLabels[file.kind]} · {shortHash(file.hash)}
                      </p>
                    </div>
                  ))}
                  {!files.length ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      No material in this category.
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderEvidenceCards() {
    return (
      <div className="space-y-3">
        {project.evidenceCards.length ? (
          project.evidenceCards.map((card) => {
            const Icon = evidenceIcons[card.kind];
            const active = selectedEvidence?.id === card.id;

            return (
              <article
                key={card.id}
                className={cn(
                  'rounded-lg border bg-card p-4 shadow-sm transition',
                  active && 'border-primary ring-2 ring-primary/20'
                )}
              >
                <button
                  type="button"
                  className="block w-full cursor-pointer text-left"
                  onClick={() => {
                    setActiveEvidenceId(card.id);
                    setActiveSection('evidence');
                  }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold">{card.title}</h2>
                          <Badge variant={statusVariant(card.status)}>
                            {card.status}
                          </Badge>
                          <Badge variant={strengthVariant(card.strength)}>
                            {card.strength}
                          </Badge>
                          <Badge variant={suitabilityVariant(card.suitability)}>
                            {card.suitability.replaceAll('-', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {card.summary}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-24 text-left lg:text-right">
                      <div className="text-2xl font-semibold">{card.score}</div>
                      <div className="text-xs text-muted-foreground">
                        evidence score
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Proves
                      </p>
                      <p className="mt-1 text-sm leading-6">{card.proofTarget}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Linked paragraph
                      </p>
                      <p className="mt-1 text-sm leading-6">
                        {card.linkedParagraph}
                      </p>
                    </div>
                  </div>
                </button>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {card.evidence.slice(0, 3).map((item) => (
                    <div
                      key={item}
                      className="rounded-md border p-3 text-xs leading-5 text-muted-foreground"
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {card.actions.slice(0, 4).map((action) => (
                    <Badge key={action} variant="outline">
                      {action}
                    </Badge>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={card.includedInReport ? 'secondary' : 'outline'}
                    onClick={() =>
                      updateEvidenceReportInclusion(
                        card.id,
                        !card.includedInReport
                      )
                    }
                  >
                    {card.includedInReport ? 'In report' : 'Add to report'}
                  </Button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <ShieldCheck className="mx-auto mb-3 size-8 text-muted-foreground" />
            <h2 className="font-medium">No evidence cards yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Load the demo case or upload materials, then run analysis.
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderTimeline() {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm leading-6">{processConclusion}</p>
        </div>
        {sortedTimeline.map((event) => {
          const Icon = timelineIcons[event.type];

          return (
            <div key={event.id} className="flex gap-3 rounded-lg border bg-card p-4">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{processStageLabels[event.stage]}</Badge>
                  <Badge variant="secondary">{event.type}</Badge>
                </div>
                <h2 className="mt-2 font-medium">{event.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {event.description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(event.at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderRisks() {
    return (
      <div className="space-y-3">
        {project.risks.length ? (
          project.risks.map((risk) => (
            <article
              key={risk.id}
              className={cn('rounded-lg border p-4', riskTone(risk.level))}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={riskVariant(risk.level)}>{risk.level}</Badge>
                <Badge variant="outline">{riskCategoryLabels[risk.category]}</Badge>
              </div>
              <h2 className="mt-3 font-semibold">{risk.title}</h2>
              <p className="mt-2 text-sm leading-6">{risk.explanation}</p>
              <p className="mt-3 text-sm leading-6 font-medium">
                {risk.recommendation}
              </p>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 size-8 text-muted-foreground" />
            <h2 className="font-medium">No explanation risks yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Run analysis to identify missing DOI, timestamp, process, AI-use,
              or appeal-material issues.
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderReports() {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="font-semibold">Report version</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {reportVariantDescriptions[reportVariant]}
              </p>
            </div>
            <Select
              value={reportVariant}
              onValueChange={(value) => setReportVariant(value as ReportVariant)}
            >
              <SelectTrigger className="w-full lg:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(reportVariantLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={() => exportHtmlReport(reportVariant)}>
              <Download className="size-4" />
              Export HTML report
            </Button>
            <Button type="button" variant="outline" onClick={exportJsonPackage}>
              <FileJson className="size-4" />
              Export JSON package
            </Button>
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">Report preview</h2>
          </div>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap p-4 text-sm leading-6 text-muted-foreground">
            {previewText}
          </pre>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Available versions</h2>
          <div className="mt-3 grid gap-3">
            {(Object.keys(reportVariantLabels) as ReportVariant[]).map(
              (variant) => (
                <div key={variant} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {reportVariantLabels[variant]}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => exportHtmlReport(variant)}
                    >
                      <Download className="size-4" />
                      Export
                    </Button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {reportVariantDescriptions[variant]}
                  </p>
                </div>
              )
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderMainSection() {
    if (activeSection === 'paper') return renderPaperPreview();
    if (activeSection === 'evidence') return renderEvidenceCards();
    if (activeSection === 'timeline') return renderTimeline();
    if (activeSection === 'risks') return renderRisks();

    return renderReports();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="size-3.5" />
                StudyTrace
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Database className="size-3.5" />
                local proof package
              </Badge>
              <Badge variant="outline">student-side appeal support</Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-normal text-balance sm:text-4xl">
                Academic Process Proof Workbench
              </h1>
              <p className="max-w-4xl text-sm leading-6 text-muted-foreground sm:text-base">
                {processConclusion}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={loadDemoCase}
              disabled={!hydrated}
            >
              <Sparkles className="size-4" />
              Load demo case
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={resetWorkspace}
              disabled={!hydrated}
            >
              <RefreshCw className="size-4" />
              Start fresh
            </Button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Process completeness</CardDescription>
              <CardTitle className="text-3xl">
                {metrics.processCompleteness}/100
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={metrics.processCompleteness} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Verifiable citations</CardDescription>
              <CardTitle className="text-3xl">{metrics.citationLabel}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Matched citation records or citation evidence cards.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Draft support</CardDescription>
              <CardTitle className="text-3xl">{metrics.draftSupport}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Draft, version history, and process materials.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>AI use explained</CardDescription>
              <CardTitle className="text-3xl">{metrics.aiUseLabel}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Tool records tied to human revision actions.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Appeal material</CardDescription>
              <CardTitle className="text-3xl">
                {metrics.appealCompleteness}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              School policy, notice, and submission context.
            </CardContent>
          </Card>
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_24rem]">
          <aside className="space-y-4">
            <section className="rounded-lg border bg-card">
              <div className="border-b p-3">
                <h2 className="text-sm font-semibold">Project navigation</h2>
              </div>
              <nav className="space-y-1 p-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                      onClick={() => setActiveSection(item.id)}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="size-4" />
                  Intake
                </CardTitle>
                <CardDescription>
                  Final paper, process records, sources, AI logs, and school
                  documents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Course
                  </label>
                  <Textarea
                    value={project.courseName}
                    onChange={(event) =>
                      updateProjectMeta('courseName', event.target.value)
                    }
                    className="min-h-11 resize-none text-sm"
                    disabled={!hydrated}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Assignment
                  </label>
                  <Textarea
                    value={project.assignmentTitle}
                    onChange={(event) =>
                      updateProjectMeta('assignmentTitle', event.target.value)
                    }
                    className="min-h-16 resize-none text-sm"
                    disabled={!hydrated}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Paper title
                  </label>
                  <Textarea
                    value={project.paperTitle}
                    onChange={(event) =>
                      updateProjectMeta('paperTitle', event.target.value)
                    }
                    className="min-h-16 resize-none text-sm"
                    disabled={!hydrated}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Material type
                  </label>
                  <Select
                    value={fileKind}
                    onValueChange={(value) =>
                      setFileKind(value as FileKindSelection)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto classify</SelectItem>
                      {Object.entries(fileKindLabels)
                        .filter(([value]) => value !== 'paper' && value !== 'policy')
                        .map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => handleFileChange(event.target.files)}
                />
                <div className="grid gap-2">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!hydrated}
                  >
                    <Upload className="size-4" />
                    Upload materials
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={runAIAnalysis}
                    disabled={!hydrated || !project.files.length || isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Run analysis
                  </Button>
                </div>
                {analysisError && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                    {analysisError}
                  </div>
                )}
                {storageWarning && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                    {storageWarning}
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="rounded-lg border bg-card">
              <div className="border-b p-3">
                <h2 className="text-sm font-semibold">Demo coverage</h2>
              </div>
              <div className="grid gap-2 p-3">
                {demoStats.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm">{item.label}</span>
                      </div>
                      <Badge variant="secondary">{item.value}</Badge>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>

          <section className="min-w-0">{renderMainSection()}</section>

          <aside className="min-w-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="size-4" />
                  Paragraph explanation
                </CardTitle>
                <CardDescription>
                  Evidence and wording for the selected paragraph.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedSegment ? (
                  <>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{selectedSegment.location}</Badge>
                        <Badge variant={riskVariant(selectedSegment.riskLevel)}>
                          {selectedSegment.riskLevel}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6">
                        {selectedSegment.text}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Linked evidence</h3>
                      {selectedSegmentEvidence.length ? (
                        selectedSegmentEvidence.map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            className="block w-full cursor-pointer rounded-md border p-3 text-left transition hover:border-primary/60"
                            onClick={() => {
                              setActiveEvidenceId(card.id);
                              setActiveSection('evidence');
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                {card.title}
                              </span>
                              <Badge variant={strengthVariant(card.strength)}>
                                {card.strength}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              {card.proofTarget}
                            </p>
                          </button>
                        ))
                      ) : (
                        <p className="rounded-md border border-dashed p-3 text-sm leading-6 text-muted-foreground">
                          No paragraph-level evidence is linked yet.
                        </p>
                      )}
                    </div>
                    <div className="rounded-md border p-3">
                      <h3 className="text-sm font-medium">Suggested wording</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        This paragraph should be explained through attached
                        source materials and process records. Use restrained
                        wording that describes what the files show and what
                        still needs confirmation.
                      </p>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="size-4" />
                  Selected evidence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedEvidence ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(selectedEvidence.status)}>
                        {selectedEvidence.status}
                      </Badge>
                      <Badge variant={strengthVariant(selectedEvidence.strength)}>
                        {selectedEvidence.strength}
                      </Badge>
                      <Badge
                        variant={suitabilityVariant(
                          selectedEvidence.suitability
                        )}
                      >
                        {selectedEvidence.suitability.replaceAll('-', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">
                        {selectedEvidence.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {selectedEvidence.summary}
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Risk points
                      </p>
                      <ul className="mt-2 space-y-1 text-sm leading-6">
                        {(selectedEvidence.risks.length
                          ? selectedEvidence.risks
                          : ['No specific risk point recorded.']
                        ).map((risk) => (
                          <li key={risk}>- {risk}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Primary action
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {selectedEvidence.action}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm leading-6 text-muted-foreground">
                    Select an evidence card to inspect proof target,
                    paragraph link, risks, and submission readiness.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="size-4" />
                  Scope note
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                This report does not decide whether academic misconduct occurred.
                It organizes verifiable materials to explain the writing process
                and support communication with the institution.
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}
