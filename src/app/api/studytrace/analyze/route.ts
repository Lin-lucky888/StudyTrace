import { respData, respErr } from '@/shared/lib/resp';
import type {
  AIUseRecord,
  AcademicProcessStage,
  CitationMatch,
  CitationMatchStatus,
  EvidenceCard,
  EvidenceKind,
  EvidenceStatus,
  EvidenceStrength,
  ExtractedClaim,
  RiskCategory,
  RiskFinding,
  RiskLevel,
  StudyTraceAnalysisResult,
  SubmissionSuitability,
  TimelineEvent,
  TraceFileGroup,
  TraceFileKind,
  TraceReport,
} from '@/shared/blocks/studytrace';

interface AnalyzeFileInput {
  id: string;
  name: string;
  kind: TraceFileKind;
  group?: TraceFileGroup;
  hash: string;
  uploadedAt: string;
  excerpt?: string;
  content?: string;
}

interface AnalyzeProjectInput {
  id: string;
  title: string;
  studentProfile: string;
  courseName?: string;
  assignmentTitle?: string;
  paperTitle?: string;
  submittedAt?: string;
  files: AnalyzeFileInput[];
}

const MAX_FILES = 12;
const MAX_CONTENT_CHARS_PER_FILE = 32000;
const MAX_TOTAL_CONTENT_CHARS = 120000;

const fileKinds: TraceFileKind[] = [
  'final-paper',
  'draft',
  'version-history',
  'reference-source',
  'citation-library',
  'ai-use-log',
  'school-policy',
  'assignment-brief',
  'misconduct-notice',
  'appeal-material',
  'notes',
  'paper',
  'policy',
];
const fileGroups: TraceFileGroup[] = [
  'paper',
  'citation-evidence',
  'writing-process',
  'ai-use',
  'school-material',
  'appeal-material',
];
const evidenceKinds: EvidenceKind[] = [
  'citation',
  'draft',
  'ai-use',
  'version-history',
  'mentor-feedback',
  'policy',
  'appeal',
  'process',
];
const evidenceStatuses: EvidenceStatus[] = [
  'verified',
  'ready',
  'review',
  'risk',
];
const evidenceStrengths: EvidenceStrength[] = ['strong', 'medium', 'weak'];
const suitabilityValues: SubmissionSuitability[] = [
  'ready-to-submit',
  'needs-supplement',
  'not-recommended',
];
const riskLevels: RiskLevel[] = ['low', 'medium', 'high'];
const riskCategories: RiskCategory[] = [
  'citation-authenticity',
  'citation-format',
  'ai-use-explanation',
  'writing-process-gap',
  'appeal-completeness',
];
const citationStatuses: CitationMatchStatus[] = [
  'matched',
  'needs-review',
  'missing-metadata',
  'unsupported',
];
const processStages: AcademicProcessStage[] = [
  'topic-confirmation',
  'literature-search',
  'reading-notes',
  'first-draft',
  'ai-assistance',
  'revision',
  'citation-check',
  'submission',
  'challenge',
  'appeal',
];

function makeId(prefix: string, index: number) {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, 8);
}

function pickValue<T extends string>(
  value: unknown,
  allowed: T[],
  fallback: T
) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function stripThinking(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function parseJsonContent(content: string) {
  const withoutThinking = stripThinking(content);

  try {
    return JSON.parse(withoutThinking);
  } catch {
    const start = withoutThinking.indexOf('{');
    const end = withoutThinking.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(withoutThinking.slice(start, end + 1));
    }

    throw new Error('AI response was not valid JSON');
  }
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

function sanitizeFiles(files: AnalyzeFileInput[]) {
  let remaining = MAX_TOTAL_CONTENT_CHARS;

  return files.slice(0, MAX_FILES).map((file) => {
    const rawContent = asString(file.content || file.excerpt);
    const content = rawContent.slice(
      0,
      Math.min(MAX_CONTENT_CHARS_PER_FILE, remaining)
    );
    remaining = Math.max(0, remaining - content.length);
    const kind = pickValue(file.kind, fileKinds, 'notes');

    return {
      id: asString(file.id),
      name: asString(file.name, 'untitled-file'),
      kind,
      group: pickValue(file.group, fileGroups, groupFromKind(kind)),
      hash: asString(file.hash),
      uploadedAt: asString(file.uploadedAt),
      excerpt: asString(file.excerpt),
      content,
    };
  });
}

function normalizeClaims(value: unknown): ExtractedClaim[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 12).map((item: any, index) => ({
    id: asString(item?.id, makeId('claim', index)),
    text: asString(item?.text || item?.claim, 'Unspecified claim'),
    location: asString(item?.location || item?.linkedParagraph) || undefined,
    sourceFileIds: asStringArray(item?.sourceFileIds),
    evidenceIds: asStringArray(item?.evidenceIds),
    confidence: asNumber(item?.confidence, 60),
    note: asString(item?.note || item?.explanation),
  }));
}

function normalizeCitationMatches(value: unknown): CitationMatch[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 16).map((item: any, index) => ({
    id: asString(item?.id, makeId('citation', index)),
    citationText: asString(
      item?.citationText || item?.citation,
      'Unspecified citation'
    ),
    claimId: asString(item?.claimId) || undefined,
    sourceTitle: asString(item?.sourceTitle || item?.title) || undefined,
    authors: asString(item?.authors) || undefined,
    year: asString(item?.year) || undefined,
    doi: asString(item?.doi) || undefined,
    url: asString(item?.url) || undefined,
    status: pickValue(item?.status, citationStatuses, 'needs-review'),
    explanation: asString(
      item?.explanation,
      'Citation requires manual source review.'
    ),
    sourceFileIds: asStringArray(item?.sourceFileIds),
    confidence: asNumber(item?.confidence, 60),
  }));
}

function normalizeAIUseRecords(value: unknown): AIUseRecord[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 12).map((item: any, index) => ({
    id: asString(item?.id, makeId('ai-use', index)),
    stage: asString(item?.stage, 'writing process'),
    toolName: asString(item?.toolName || item?.tool) || undefined,
    promptOrAction: asString(
      item?.promptOrAction || item?.action,
      'AI assistance mentioned but not fully specified.'
    ),
    humanAction: asString(
      item?.humanAction,
      'Human revision evidence needs review.'
    ),
    disclosureRisk: pickValue(item?.disclosureRisk, riskLevels, 'medium'),
    sourceFileIds: asStringArray(item?.sourceFileIds),
    confidence: asNumber(item?.confidence, 60),
  }));
}

function normalizeEvidenceCards(
  value: unknown,
  files: AnalyzeFileInput[]
): EvidenceCard[] {
  if (!Array.isArray(value)) return fallbackEvidenceCards(files);

  const cards = value.slice(0, 10).map((item: any, index) => {
    const action = asString(item?.action, 'Review and supplement this evidence.');
    const actions = asStringArray(item?.actions);

    return {
      id: asString(item?.id, makeId('evidence', index)),
      kind: pickValue(item?.kind, evidenceKinds, 'process'),
      title: asString(item?.title, 'Evidence card'),
      status: pickValue(item?.status, evidenceStatuses, 'review'),
      strength: pickValue(item?.strength, evidenceStrengths, 'medium'),
      suitability: pickValue(
        item?.suitability,
        suitabilityValues,
        'needs-supplement'
      ),
      proofTarget: asString(
        item?.proofTarget,
        'Explains how this material supports the student writing process.'
      ),
      linkedParagraph: asString(
        item?.linkedParagraph || item?.location,
        'Whole paper or process record'
      ),
      score: asNumber(item?.score, 60),
      summary: asString(item?.summary, 'Evidence needs manual review.'),
      evidence: asStringArray(item?.evidence).slice(0, 5),
      risks: asStringArray(item?.risks).slice(0, 5),
      sourceIds: asStringArray(item?.sourceIds),
      actions: actions.length ? actions : [action],
      action,
      includedInReport: asBoolean(item?.includedInReport, true),
      sensitive: asBoolean(item?.sensitive, false),
    };
  });

  return cards.length ? cards : fallbackEvidenceCards(files);
}

function normalizeRisks(value: unknown, cards: EvidenceCard[]): RiskFinding[] {
  if (!Array.isArray(value)) return fallbackRisks(cards);

  const risks = value.slice(0, 8).map((item: any, index) => ({
    id: asString(item?.id, makeId('risk', index)),
    level: pickValue(item?.level, riskLevels, 'medium'),
    category: pickValue(
      item?.category,
      riskCategories,
      'appeal-completeness'
    ),
    area: asString(item?.area, 'Academic process explanation'),
    title: asString(item?.title, 'Review required'),
    explanation: asString(
      item?.explanation,
      'The evidence chain needs manual confirmation.'
    ),
    recommendation: asString(
      item?.recommendation,
      'Attach source material and rerun analysis.'
    ),
    linkedEvidenceIds: asStringArray(item?.linkedEvidenceIds),
  }));

  return risks.length ? risks : fallbackRisks(cards);
}

function normalizeTimeline(value: unknown): TimelineEvent[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 10).map((item: any, index) => ({
    id: asString(item?.id, makeId('timeline-ai', index)),
    at: asString(item?.at, new Date().toISOString()),
    title: asString(item?.title, 'AI analysis event'),
    description: asString(
      item?.description,
      'StudyTrace generated an academic process milestone.'
    ),
    type: pickValue(
      item?.type,
      ['upload', 'analysis', 'review', 'export'],
      'analysis'
    ),
    stage: pickValue(item?.stage, processStages, 'citation-check'),
    evidenceCardIds: asStringArray(item?.evidenceCardIds),
    fileId: asString(item?.fileId) || undefined,
  }));
}

function normalizeReport(value: unknown, cards: EvidenceCard[]): TraceReport {
  const item = typeof value === 'object' && value ? (value as any) : {};
  const readinessScore = asNumber(item?.readinessScore, averageScore(cards));

  return {
    id: asString(item?.id, `report-${Date.now()}`),
    createdAt: asString(item?.createdAt, new Date().toISOString()),
    readinessScore,
    summary: asString(
      item?.summary,
      'StudyTrace generated a process proof summary from the uploaded materials.'
    ),
    variant: 'student-check',
  };
}

function averageScore(cards: EvidenceCard[]) {
  if (!cards.length) return 0;

  return Math.round(
    cards.reduce((total, card) => total + card.score, 0) / cards.length
  );
}

function fallbackEvidenceCards(files: AnalyzeFileInput[]): EvidenceCard[] {
  const sourceIds = files.map((file) => file.id);

  return [
    {
      id: 'evidence-process-review',
      kind: 'process',
      title: 'Evidence package requires manual review',
      status: 'review',
      strength: 'medium',
      suitability: 'needs-supplement',
      proofTarget:
        'Explains the uploaded materials without making a misconduct judgment.',
      linkedParagraph: 'Whole submission package',
      score: 62,
      summary:
        'The AI response did not include complete evidence cards, so StudyTrace created a conservative process-review card.',
      evidence: [
        `${files.length} uploaded file(s) were included in the analysis request.`,
        'Manual review is required before using the report for school communication.',
      ],
      risks: ['Some source, timestamp, or policy details may still be missing.'],
      sourceIds,
      actions: [
        'Review extracted claims',
        'Add missing timestamps',
        'Confirm citation metadata',
      ],
      action: 'Review the extracted claims, citations, and AI-use notes.',
      includedInReport: true,
      sensitive: false,
    },
  ];
}

function fallbackRisks(cards: EvidenceCard[]): RiskFinding[] {
  return [
    {
      id: 'risk-manual-review-required',
      level: 'medium',
      category: 'appeal-completeness',
      area: 'Appeal material completeness',
      title: 'Manual review is still required',
      explanation:
        'The model output should be treated as a structured draft, not a final academic or legal conclusion.',
      recommendation:
        'Confirm each citation source, AI-use statement, policy reference, and sensitive detail before export.',
      linkedEvidenceIds: cards.map((card) => card.id),
    },
  ];
}

function normalizeAnalysis(
  raw: any,
  files: AnalyzeFileInput[],
  provider: string,
  model: string
): StudyTraceAnalysisResult {
  const claims = normalizeClaims(raw?.claims);
  const citationMatches = normalizeCitationMatches(raw?.citationMatches);
  const aiUseRecords = normalizeAIUseRecords(raw?.aiUseRecords);
  const evidenceCards = normalizeEvidenceCards(raw?.evidenceCards, files);
  const risks = normalizeRisks(raw?.risks, evidenceCards);
  const timelineEvents = normalizeTimeline(raw?.timelineEvents);
  const report = normalizeReport(raw?.report, evidenceCards);
  const processConclusion = asString(
    raw?.processConclusion,
    'StudyTrace organized the uploaded materials into a process proof package; review missing metadata before submission.'
  );

  return {
    provider,
    model,
    generatedAt: new Date().toISOString(),
    claims,
    citationMatches,
    aiUseRecords,
    evidenceCards,
    timelineEvents,
    risks,
    report,
    processConclusion,
    summary: asString(raw?.summary, report.summary),
  };
}

function buildPrompt(project: AnalyzeProjectInput, files: AnalyzeFileInput[]) {
  return JSON.stringify(
    {
      task: 'Analyze academic materials for a student-side StudyTrace process proof package.',
      productGoal:
        'Prepare a credible, explainable, traceable package for an international student to explain their real writing process, citation sources, AI-use boundary, and appeal evidence.',
      strictRules: [
        'Use only the uploaded text and metadata provided in this request.',
        'Do not decide whether academic misconduct occurred.',
        'Do not use verdict wording such as plagiarism, fake citation, AI probability, or misconduct unless quoting source material.',
        'Use explanatory wording: describe what the material can show, what remains missing, and what should be supplemented.',
        'Separate source existence from whether the source supports the local paragraph claim.',
        'Frame AI use as a boundary explanation: grammar, polishing, planning, source selection, or authorship evidence if supported.',
        'Every evidence card should answer: what this card proves, which paragraph it relates to, how strong it is, whether it is submit-ready, and what action is needed.',
        'Return JSON only. No markdown.',
      ],
      expectedJsonShape: {
        claims: [
          {
            id: 'claim-01',
            text: 'Main claim or paragraph-level issue extracted from the paper',
            location: 'Page 3, paragraph 4, sentence 2',
            sourceFileIds: ['file-id'],
            evidenceIds: ['evidence-01'],
            confidence: 0,
            note: 'Why this claim matters for explanation',
          },
        ],
        citationMatches: [
          {
            id: 'citation-01',
            citationText: 'Raw citation text',
            claimId: 'claim-01',
            sourceTitle: 'Source title if present',
            authors: 'Authors if present',
            year: 'Year if present',
            doi: 'DOI if present',
            url: 'URL if present',
            status: 'matched | needs-review | missing-metadata | unsupported',
            explanation: 'Explain source metadata and local claim support without verdict language',
            sourceFileIds: ['file-id'],
            confidence: 0,
          },
        ],
        aiUseRecords: [
          {
            id: 'ai-use-01',
            stage: 'outline | draft | revision | final | language polishing | unknown',
            toolName: 'Tool/model name if present',
            promptOrAction: 'Prompt, tool action, or AI assistance description',
            humanAction: 'Student revision or authorship action',
            disclosureRisk: 'low | medium | high',
            sourceFileIds: ['file-id'],
            confidence: 0,
          },
        ],
        evidenceCards: [
          {
            id: 'evidence-citation',
            kind: 'citation | draft | ai-use | version-history | mentor-feedback | policy | appeal | process',
            title: 'Evidence card title',
            status: 'verified | ready | review | risk',
            strength: 'strong | medium | weak',
            suitability: 'ready-to-submit | needs-supplement | not-recommended',
            proofTarget: 'What this card helps prove',
            linkedParagraph: 'Page/paragraph/sentence or process scope',
            score: 0,
            summary: 'Short explanatory summary',
            evidence: ['Concrete evidence bullet'],
            risks: ['Missing DOI, timestamp gap, policy mismatch, or sensitive detail'],
            sourceIds: ['file-id'],
            actions: ['Supplement source', 'Generate explanation', 'Add to report', 'Hide sensitive info'],
            action: 'Primary next action',
            includedInReport: true,
            sensitive: false,
          },
        ],
        timelineEvents: [
          {
            id: 'timeline-ai-analysis',
            at: 'ISO date',
            title: 'Timeline title',
            description: 'What happened in the academic process',
            type: 'analysis',
            stage:
              'topic-confirmation | literature-search | reading-notes | first-draft | ai-assistance | revision | citation-check | submission | challenge | appeal',
            evidenceCardIds: ['evidence-id'],
            fileId: 'optional file id',
          },
        ],
        risks: [
          {
            id: 'risk-01',
            level: 'low | medium | high',
            category:
              'citation-authenticity | citation-format | ai-use-explanation | writing-process-gap | appeal-completeness',
            area: 'Citation authenticity | Citation format | AI use explanation | Writing process gap | Appeal material completeness',
            title: 'Explanation issue title',
            explanation: 'Explain the issue without judging misconduct',
            recommendation: 'What user should do next',
            linkedEvidenceIds: ['evidence-id'],
          },
        ],
        report: {
          id: 'report-ai',
          createdAt: 'ISO date',
          readinessScore: 0,
          summary: 'Academic process proof report summary',
        },
        processConclusion:
          'One sentence: continuous writing days, draft versions, checkable citations, AI-use boundary, and appeal material completeness.',
        summary: 'One restrained paragraph summary',
      },
      project: {
        id: project.id,
        title: project.title,
        studentProfile: project.studentProfile,
        courseName: project.courseName,
        assignmentTitle: project.assignmentTitle,
        paperTitle: project.paperTitle,
        submittedAt: project.submittedAt,
      },
      files,
    },
    null,
    2
  );
}

async function callEvolink(
  project: AnalyzeProjectInput,
  files: AnalyzeFileInput[]
) {
  const provider = process.env.STUDYTRACE_AI_PROVIDER || 'evolink';
  const baseUrl =
    process.env.STUDYTRACE_AI_BASE_URL || 'https://direct.evolink.ai';
  const model = process.env.STUDYTRACE_AI_MODEL || 'MiniMax-M3';
  const apiKey = process.env.STUDYTRACE_AI_API_KEY;

  if (!apiKey) {
    throw new Error('StudyTrace AI API key is not configured');
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
        thinking: { type: 'disabled' },
        temperature: 0.1,
        max_completion_tokens: 5000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are StudyTrace, a student-side academic process proof analyst. You organize verifiable materials and never decide misconduct. Return strict JSON only.',
          },
          {
            role: 'user',
            content: buildPrompt(project, files),
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `StudyTrace AI request failed (${response.status}): ${text.slice(0, 240)}`
    );
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('StudyTrace AI response did not include message content');
  }

  return normalizeAnalysis(parseJsonContent(content), files, provider, model);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = body?.project as AnalyzeProjectInput | undefined;

    if (!project?.id || !Array.isArray(project.files)) {
      throw new Error('invalid StudyTrace analysis payload');
    }

    const files = sanitizeFiles(project.files);
    if (!files.length) {
      throw new Error('at least one file is required for analysis');
    }

    const result = await callEvolink(
      {
        id: asString(project.id),
        title: asString(project.title, 'StudyTrace project'),
        studentProfile: asString(project.studentProfile),
        courseName: asString(project.courseName),
        assignmentTitle: asString(project.assignmentTitle),
        paperTitle: asString(project.paperTitle),
        submittedAt: asString(project.submittedAt),
        files,
      },
      files
    );

    return respData(result);
  } catch (error: any) {
    console.error('studytrace analyze failed', error);
    return respErr(error?.message || 'StudyTrace analysis failed');
  }
}
