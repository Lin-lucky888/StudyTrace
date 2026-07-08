import { getUuid } from '@/shared/lib/hash';
import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';
import { respData, respErr } from '@/shared/lib/resp';
import { Configs, getAllConfigs } from '@/shared/models/config';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { findStudyTraceProject } from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

type EvidenceKind =
  | 'paper'
  | 'citation'
  | 'writing-process'
  | 'ai-use'
  | 'school'
  | 'appeal';

type EvidenceStrength = 'strong' | 'medium' | 'weak';
type SubmitStatus = 'ready' | 'needs-more' | 'do-not-submit';
type TimelinePhase =
  | 'topic'
  | 'research'
  | 'reading'
  | 'draft'
  | 'ai-assist'
  | 'revision'
  | 'citation-check'
  | 'submission'
  | 'challenge-appeal';

type IngestFile = {
  id: string;
  name: string;
  size?: number;
  type?: string;
  extension?: string;
  lastModified?: string;
  lastModifiedLabel?: string;
  category?: EvidenceKind;
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
  proofTarget?: string;
  paperLocator?: string;
  submitStatus?: SubmitStatus;
  actionItems?: string[];
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
  phase?: TimelinePhase;
  cardIds?: string[];
};

type StudyTraceIngestPayload = {
  projectId?: string;
  locale?: string;
  assignment?: {
    title?: string;
    courseName?: string;
    institutionPolicy?: string;
    concern?: string;
  };
  files?: IngestFile[];
  aiBoundary?: string;
  settings?: unknown;
};

type StudyTraceIngestResult = {
  files: {
    id: string;
    category: EvidenceKind;
  }[];
  evidenceCards: EvidenceCard[];
  timelineEvents: TimelineEvent[];
  providerStatus?: string;
};

type StudyTraceModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

const EVIDENCE_KINDS: EvidenceKind[] = [
  'paper',
  'citation',
  'writing-process',
  'ai-use',
  'school',
  'appeal',
];

const EVIDENCE_STRENGTHS: EvidenceStrength[] = ['strong', 'medium', 'weak'];
const SUBMIT_STATUSES: SubmitStatus[] = [
  'ready',
  'needs-more',
  'do-not-submit',
];
const TIMELINE_PHASES: TimelinePhase[] = [
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
const MAX_FILES = 20;
const MAX_TEXT_PER_FILE = 12_000;
const MAX_PROMPT_LENGTH = 100_000;

// English is the default output language; Chinese only when explicitly requested.
function resolveOutputLanguage(locale?: string) {
  return locale && locale.toLowerCase().startsWith('zh')
    ? 'Chinese'
    : 'English';
}

function getStudyTraceModelConfig(configs: Configs): StudyTraceModelConfig {
  return {
    apiKey: configs.studytrace_ai_api_key || '',
    baseUrl: configs.studytrace_ai_base_url || 'https://direct.evolink.ai',
    model: configs.studytrace_ai_model || 'MiniMax-M3',
    provider: configs.studytrace_ai_provider || 'evolink',
  };
}

function getIngestCostCredits(configs: Configs) {
  const value = Number(
    configs.studytrace_ingest_cost_credits ??
      configs.studytrace_analysis_cost_credits ??
      1
  );
  if (!Number.isFinite(value) || value < 0) return 1;
  return Math.round(value);
}

function getIngestMinIntervalMs(configs: Configs) {
  const value = Number(
    configs.studytrace_ingest_min_interval_ms ??
      configs.studytrace_analysis_min_interval_ms ??
      5000
  );
  if (!Number.isFinite(value) || value < 0) return 5000;
  return Math.round(value);
}

function normalizeText(value: unknown, fallback = '', maxLength = 600) {
  const text =
    typeof value === 'string' ? value : value == null ? '' : String(value);
  const normalized = text.replace(/\s+/g, ' ').trim();
  const result = normalized || fallback;
  return result.length > maxLength ? result.slice(0, maxLength) : result;
}

function normalizeStringArray(value: unknown, maxItems = 8, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item, '', maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeEvidenceKind(
  value: unknown,
  fallback: EvidenceKind = 'appeal'
): EvidenceKind {
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
  return EVIDENCE_KINDS.includes(normalized as EvidenceKind)
    ? (normalized as EvidenceKind)
    : fallback;
}

function normalizeEvidenceStrength(
  value: unknown,
  fallback: EvidenceStrength = 'medium'
): EvidenceStrength {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  return EVIDENCE_STRENGTHS.includes(normalized as EvidenceStrength)
    ? (normalized as EvidenceStrength)
    : fallback;
}

function strengthFromKind(kind: EvidenceKind): EvidenceStrength {
  if (['paper', 'citation', 'writing-process'].includes(kind)) {
    return 'strong';
  }
  if (['ai-use', 'school'].includes(kind)) return 'medium';
  return 'weak';
}

function normalizeSubmitStatus(
  value: unknown,
  fallback: SubmitStatus = 'needs-more'
): SubmitStatus {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SUBMIT_STATUSES.includes(normalized as SubmitStatus)
    ? (normalized as SubmitStatus)
    : fallback;
}

function normalizeTimelinePhase(
  value: unknown,
  fallback: TimelinePhase = 'draft'
): TimelinePhase {
  const normalized =
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/_/g, '-')
      : '';
  return TIMELINE_PHASES.includes(normalized as TimelinePhase)
    ? (normalized as TimelinePhase)
    : fallback;
}

function normalizeDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with fenced or embedded JSON extraction.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // Continue.
    }
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }

  throw new Error('AI response did not include JSON');
}

function getPromptFiles(files?: IngestFile[]) {
  return (Array.isArray(files) ? files : [])
    .filter((file) => file?.id)
    .slice(0, MAX_FILES)
    .map((file) => ({
      id: file.id,
      name: normalizeText(file.name, 'Untitled file', 240),
      size: Number(file.size) || 0,
      type: normalizeText(file.type, '', 120),
      extension: normalizeText(file.extension, '', 40),
      lastModified: normalizeText(file.lastModified, '', 80),
      lastModifiedLabel: normalizeText(file.lastModifiedLabel, '', 80),
      checksum: normalizeText(file.checksum, '', 120),
      extractedText: normalizeText(file.extractedText, '', MAX_TEXT_PER_FILE),
    }));
}

function buildSystemPrompt(language: string) {
  return [
    'You are StudyTrace ingest, a careful academic writing-process evidence organizer.',
    'Your job is to read browser-extracted text and file metadata, then create evidence cards and timeline events for a truthful appeal-material package.',
    'Use only the provided content and metadata. Do not invent drafts, dates, sources, feedback, AI usage, policies, or outcomes.',
    'Do not help evade AI detection, hide AI usage, fabricate evidence, or promise appeal success.',
    'If a file has little or no readable text, mark it as weak or metadata-only instead of guessing its contents.',
    'Classify uploads into six user-facing groups: paper, citation, writing-process, ai-use, school, appeal.',
    'Evidence cards are the core product. Treat each card like a legal evidence card that states what it proves, which paragraph it supports, its strength, risks, submit status, and next action.',
    'Return strict JSON only with these keys: files, evidenceCards, timelineEvents.',
    'files must be an array of {id, category}. category must be one of paper, citation, writing-process, ai-use, school, appeal.',
    'evidenceCards must use exactly this shape: {id, title, kind, source, fileId, summary, notes, strength, proofTarget, paperLocator, submitStatus, actionItems, tags, riskFlags}.',
    'submitStatus must be ready, needs-more, or do-not-submit. Use ready only when the card is directly suitable for an appeal package.',
    'timelineEvents must use exactly this shape: {id, date, label, detail, source, strength, phase, cardIds}. phase must be one of topic, research, reading, draft, ai-assist, revision, citation-check, submission, challenge-appeal.',
    'kind must be one allowed category. strength must be strong, medium, or weak. date must be an ISO datetime from provided metadata/content, or an empty string.',
    `All user-facing text must be concise ${language}.`,
  ].join('\n');
}

function buildUserPrompt(payload: StudyTraceIngestPayload, language: string) {
  return [
    `Generate the ingest result in ${language}.`,
    'Create 1-3 evidence cards per useful file and timeline nodes only when the uploaded content or metadata supports them.',
    'Support final paper plus process materials: final papers, version history screenshots/exports, drafts, literature PDFs, Zotero/EndNote/BibTeX/RIS libraries, ChatGPT/Claude/Grammarly records, school AI policies, assignment briefs, Turnitin/GPTZero reports, school emails, and misconduct notices.',
    'Prefer direct writing-process evidence: topic confirmation, literature search, reading/excerpts, drafts, AI assistance, revision/polishing, citation verification, submission, and challenge/appeal records.',
    'For notes, write short appeal-ready explanations, not verdicts and not a full appeal letter.',
    'Avoid wording such as "suspected plagiarism", "fake citation", or an AI-risk percentage. Explain gaps and evidence support instead.',
    '',
    JSON.stringify(
      {
        assignment: payload.assignment,
        files: getPromptFiles(payload.files),
        aiBoundary: payload.aiBoundary,
        settings: payload.settings,
      },
      null,
      2
    ).slice(0, MAX_PROMPT_LENGTH),
  ].join('\n');
}

async function callStudyTraceModel(
  payload: StudyTraceIngestPayload,
  config: StudyTraceModelConfig
) {
  const { apiKey, baseUrl, model } = config;
  const language = resolveOutputLanguage(payload.locale);

  if (!apiKey) {
    throw new Error('STUDYTRACE_AI_API_KEY is not configured');
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(language),
          },
          {
            role: 'user',
            content: buildUserPrompt(payload, language),
          },
        ],
        thinking: {
          type: 'disabled',
        },
        temperature: 0.1,
        max_completion_tokens: 4000,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`StudyTrace ingest request failed: ${response.status}`);
  }

  const data = await response.json();
  const content =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.delta?.content ||
    '';

  if (!content) {
    throw new Error('StudyTrace ingest returned empty content');
  }

  return extractJsonObject(content);
}

function normalizeIngestResult(
  value: any,
  payload: StudyTraceIngestPayload
): StudyTraceIngestResult {
  const result = value && typeof value === 'object' ? value : {};
  const inputFiles = (Array.isArray(payload.files) ? payload.files : []).filter(
    (file) => file?.id
  );
  const fileById = new Map(inputFiles.map((file) => [file.id, file]));
  const fileIds = new Set(fileById.keys());
  const categoryByFileId = new Map<string, EvidenceKind>();

  if (Array.isArray(result.files)) {
    for (const file of result.files) {
      const id = normalizeText(file?.id, '', 120);
      if (!fileIds.has(id)) continue;
      categoryByFileId.set(id, normalizeEvidenceKind(file?.category, 'appeal'));
    }
  }

  const evidenceCards: EvidenceCard[] = Array.isArray(result.evidenceCards)
    ? result.evidenceCards
        .map((card: any): EvidenceCard | null => {
          const fileId = normalizeText(card?.fileId, '', 120);
          const sourceFile = fileIds.has(fileId) ? fileById.get(fileId) : null;
          const fallbackKind = normalizeEvidenceKind(
            sourceFile?.category,
            'appeal'
          );
          const kind = normalizeEvidenceKind(card?.kind, fallbackKind);
          const title = normalizeText(
            card?.title,
            sourceFile?.name || 'Evidence card',
            240
          );
          const summary = normalizeText(card?.summary, '', 900);

          if (!title && !summary) return null;

          if (sourceFile?.id && !categoryByFileId.has(sourceFile.id)) {
            categoryByFileId.set(sourceFile.id, kind);
          }

          return {
            id: normalizeText(card?.id, getUuid(), 120),
            title,
            kind,
            source: normalizeText(card?.source, sourceFile?.name || '', 240),
            fileId: sourceFile?.id,
            summary,
            notes: normalizeText(card?.notes, '', 900),
            strength: normalizeEvidenceStrength(
              card?.strength,
              strengthFromKind(kind)
            ),
            proofTarget: normalizeText(card?.proofTarget, '', 240),
            paperLocator: normalizeText(card?.paperLocator, '', 180),
            submitStatus: normalizeSubmitStatus(card?.submitStatus),
            actionItems: normalizeStringArray(card?.actionItems, 4, 80),
            tags: normalizeStringArray(card?.tags),
            riskFlags: normalizeStringArray(card?.riskFlags, 8, 120),
          };
        })
        .filter(Boolean)
        .slice(0, 30)
    : [];

  const timelineEvents: TimelineEvent[] = Array.isArray(result.timelineEvents)
    ? result.timelineEvents
        .map((event: any): TimelineEvent | null => {
          const label = normalizeText(event?.label, '', 240);
          const detail = normalizeText(event?.detail, '', 900);
          if (!label && !detail) return null;

          return {
            id: normalizeText(event?.id, getUuid(), 120),
            date: normalizeDate(event?.date),
            label: label || 'Writing-process event',
            detail,
            source: normalizeText(event?.source, '', 240),
            strength: normalizeEvidenceStrength(event?.strength),
            phase: normalizeTimelinePhase(event?.phase),
            cardIds: normalizeStringArray(event?.cardIds, 8, 120),
          };
        })
        .filter(Boolean)
        .slice(0, 40)
    : [];

  return {
    files: Array.from(categoryByFileId.entries()).map(([id, category]) => ({
      id,
      category,
    })),
    evidenceCards,
    timelineEvents,
    providerStatus: 'ai',
  };
}

export async function POST(req: Request) {
  try {
    const configs = await getAllConfigs();
    const limited = enforceMinIntervalRateLimit(req, {
      intervalMs: getIngestMinIntervalMs(configs),
      keyPrefix: 'studytrace-ingest',
    });
    if (limited) {
      return limited;
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const payload = (await req.json()) as StudyTraceIngestPayload;
    const inputFiles = Array.isArray(payload.files) ? payload.files : [];
    if (!inputFiles.length) {
      return respErr('no files to ingest');
    }

    let projectId: string | undefined;
    if (payload.projectId) {
      const project = await findStudyTraceProject(payload.projectId, user.id);
      if (!project) {
        return respErr('project not found');
      }
      projectId = project.id;
    }

    const modelConfig = getStudyTraceModelConfig(configs);
    const costCredits = modelConfig.apiKey ? getIngestCostCredits(configs) : 0;

    if (costCredits > 0) {
      const remainingCredits = await getRemainingCredits(user.id);
      if (remainingCredits < costCredits) {
        return respErr('insufficient credits');
      }
    }

    const aiResult = await callStudyTraceModel(payload, modelConfig);
    const ingest = normalizeIngestResult(aiResult, payload);

    if (costCredits > 0) {
      await consumeCredits({
        userId: user.id,
        credits: costCredits,
        scene: 'studytrace-ingest',
        description: 'StudyTrace AI ingest',
        metadata: JSON.stringify({
          type: 'studytrace-ingest',
          provider: modelConfig.provider,
          model: modelConfig.model,
          projectId: projectId || '',
          fileCount: inputFiles.length,
        }),
      });
    }

    return respData({
      ingest,
    });
  } catch (error: any) {
    console.log('studytrace ingest failed:', error);
    return respErr(error.message || 'studytrace ingest failed');
  }
}
