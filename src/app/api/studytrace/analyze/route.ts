import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';
import { respData, respErr } from '@/shared/lib/resp';
import { Configs, getAllConfigs } from '@/shared/models/config';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import {
  createStudyTraceAnalysisRun,
  findStudyTraceProject,
  StudyTraceRunStatus,
} from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

type RiskDimensionKey =
  | 'citation-authenticity'
  | 'citation-format'
  | 'ai-use'
  | 'process-gap'
  | 'appeal-completeness';

type RiskLevel = 'low' | 'medium' | 'high';

type RiskDimension = {
  key: RiskDimensionKey;
  level: RiskLevel;
  finding: string;
  suggestion?: string;
};

const RISK_DIMENSION_KEYS: RiskDimensionKey[] = [
  'citation-authenticity',
  'citation-format',
  'ai-use',
  'process-gap',
  'appeal-completeness',
];

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high'];

type StudyTraceAnalysis = {
  trustScore: number;
  summary: string;
  riskItems: string[];
  riskDimensions?: RiskDimension[];
  processConclusion?: string;
  timelineFindings: string[];
  evidenceGaps: string[];
  appealOutline: string[];
  aiBoundaryStatement: string;
  exportChecklist: string[];
  providerStatus?: string;
};

type StudyTracePayload = {
  projectId?: string;
  locale?: string;
  assignment?: {
    title?: string;
    courseName?: string;
    school?: string;
    studentId?: string;
    submittedAt?: string;
    institutionPolicy?: string;
    concern?: string;
  };
  files?: unknown[];
  evidenceCards?: unknown[];
  timelineEvents?: unknown[];
  aiBoundary?: string;
  settings?: unknown;
  localAnalysis?: StudyTraceAnalysis;
};

// English is the default output language; Chinese only when explicitly requested.
function resolveOutputLanguage(locale?: string) {
  return locale && locale.toLowerCase().startsWith('zh')
    ? 'Chinese'
    : 'English';
}

type StudyTraceModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

const DEFAULT_ANALYSIS: StudyTraceAnalysis = {
  trustScore: 35,
  summary:
    'Materials still need work. Build a writing timeline first, and upload draft versions and citation sources.',
  riskItems: [
    'Current evidence is insufficient to support a complete writing process.',
  ],
  timelineFindings: ['No continuous timeline has formed yet.'],
  evidenceGaps: [
    'Missing drafts, citation sources, and an AI-use boundary statement.',
  ],
  appealOutline: [
    'Explain the concern raised.',
    'Explain the writing process along the timeline.',
    'List citation sources and the AI-use boundary.',
    'Request human review.',
  ],
  aiBoundaryStatement:
    'State whether AI was used for topic selection, outlining, grammar checking, polishing, or organizing materials, and which parts were done entirely by you.',
  exportChecklist: ['Add the missing evidence before exporting the report.'],
  providerStatus: 'local',
};

function normalizeRiskDimensions(
  value: any,
  fallback?: RiskDimension[]
): RiskDimension[] | undefined {
  // Models sometimes return an object keyed by dimension name instead of an
  // array; accept both shapes.
  const entries: any[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, item]) =>
          item && typeof item === 'object'
            ? { key, ...item }
            : { key, finding: item }
        )
      : [];
  if (!entries.length) return fallback;

  const byKey = new Map<RiskDimensionKey, RiskDimension>();
  for (const item of entries) {
    const key =
      typeof item?.key === 'string'
        ? (item.key.trim().toLowerCase().replace(/_/g, '-') as RiskDimensionKey)
        : ('' as RiskDimensionKey);
    if (!RISK_DIMENSION_KEYS.includes(key) || byKey.has(key)) continue;

    const finding = String(item?.finding || '').trim();
    if (!finding) continue;

    const level =
      typeof item?.level === 'string' &&
      RISK_LEVELS.includes(item.level.trim().toLowerCase() as RiskLevel)
        ? (item.level.trim().toLowerCase() as RiskLevel)
        : 'medium';

    byKey.set(key, {
      key,
      level,
      finding: finding.slice(0, 600),
      suggestion: String(item?.suggestion || '').trim().slice(0, 600) || undefined,
    });
  }

  if (!byKey.size) return fallback;

  // Keep the canonical dimension order and backfill missing dimensions from
  // the local fallback so the UI always shows all five.
  const fallbackByKey = new Map(
    (fallback || []).map((dimension) => [dimension.key, dimension])
  );
  return RISK_DIMENSION_KEYS.map(
    (key) => byKey.get(key) || fallbackByKey.get(key)
  ).filter(Boolean) as RiskDimension[];
}

function normalizeAnalysis(value: any, fallback: StudyTraceAnalysis) {
  const analysis = value && typeof value === 'object' ? value : {};

  return {
    trustScore: clampScore(analysis.trustScore ?? fallback.trustScore),
    summary: String(analysis.summary || fallback.summary),
    riskItems: normalizeStringArray(analysis.riskItems, fallback.riskItems),
    timelineFindings: normalizeStringArray(
      analysis.timelineFindings,
      fallback.timelineFindings
    ),
    evidenceGaps: normalizeStringArray(
      analysis.evidenceGaps,
      fallback.evidenceGaps
    ),
    appealOutline: normalizeStringArray(
      analysis.appealOutline,
      fallback.appealOutline
    ),
    aiBoundaryStatement: String(
      analysis.aiBoundaryStatement || fallback.aiBoundaryStatement
    ),
    exportChecklist: normalizeStringArray(
      analysis.exportChecklist,
      fallback.exportChecklist
    ),
    riskDimensions: normalizeRiskDimensions(
      analysis.riskDimensions,
      fallback.riskDimensions
    ),
    processConclusion:
      String(analysis.processConclusion || '').trim().slice(0, 600) ||
      fallback.processConclusion,
    providerStatus: analysis.providerStatus || fallback.providerStatus || 'ai',
  } satisfies StudyTraceAnalysis;
}

function normalizeStringArray(value: any, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const result = value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 10);

  return result.length ? result : fallback;
}

function clampScore(value: any) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
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

function buildSystemPrompt(language: string) {
  return [
    'You are StudyTrace, a careful academic integrity evidence organizer.',
    'Your job is to help a student organize truthful writing-process evidence, citation sources, AI-use boundaries, and appeal materials.',
    'Do not help evade detection, fabricate evidence, hide AI usage, or claim certainty about detector errors.',
    'Base every conclusion on the provided evidence cards and timeline events. If evidence is missing, say it is missing instead of inventing it.',
    'Explain risk in a balanced way and recommend verifiable evidence, not tactics for bypassing AI detection.',
    'Use explanatory wording, not verdict wording. Do not write "AI risk 82%", "suspected plagiarism", "fake citation", or equivalent categorical labels.',
    'Risk explanation must cover these dimensions when relevant: citation authenticity, citation format, AI-use explanation, writing-process gaps, and appeal-material completeness.',
    'This product does not decide whether academic misconduct occurred. It organizes verifiable materials for explanation and communication.',
    'Do not write a complete appeal letter. Return analysis pieces that the front-end report template can assemble.',
    'Return strict JSON only with these keys: trustScore, summary, riskItems, riskDimensions, processConclusion, timelineFindings, evidenceGaps, appealOutline, aiBoundaryStatement, exportChecklist.',
    'riskDimensions must be a JSON array of exactly five objects, one per key in this order: citation-authenticity, citation-format, ai-use, process-gap, appeal-completeness. Each object is {key, level, finding, suggestion}. level must be low, medium, or high. finding explains the current evidence situation for that dimension; suggestion is the single most useful next step. Reference concrete evidence cards or timeline events by title when possible.',
    'processConclusion must be one factual sentence summarizing the writing process, built only from provided timeline events and evidence cards, e.g. counts of dated writing records, draft versions, verifiable citations, and where AI use is concentrated. If the timeline is empty, say the process record is not yet established.',
    `trustScore must be an integer from 0 to 100. All text fields and list items must be concise ${language} strings.`,
  ].join('\n');
}

function buildUserPrompt(payload: StudyTracePayload, language: string) {
  return [
    `Generate the analysis in ${language}.`,
    'Focus on: the genuine writing process, citation authenticity, citation formatting, AI-use boundary, appeal-material completeness, and a balanced explanatory risk summary.',
    'Requirements: do not fabricate evidence that does not exist; if materials are insufficient, clearly point out the gaps.',
    'Use evidenceCards and timelineEvents as the source of truth. files are supporting context only.',
    'Good wording example: "Paragraph 4 has an AI-detection dispute risk because the sentence pattern is highly regular, but draft/version evidence supports the writing process."',
    'Good wording example: "Smith 2021 lacks a DOI; add a publisher page or replace it with a verifiable source."',
    'Good wording example: "AI-use records indicate grammar polishing and do not show direct pasting of generated paragraphs."',
    'appealOutline should be an outline/checklist, not a polished appeal letter.',
    '',
    JSON.stringify(
      {
        assignment: payload.assignment,
        files: payload.files,
        evidenceCards: payload.evidenceCards,
        timelineEvents: payload.timelineEvents,
        aiBoundary: payload.aiBoundary,
        settings: payload.settings,
        localAnalysis: payload.localAnalysis,
      },
      null,
      2
    ).slice(0, 80_000),
  ].join('\n');
}

function getStudyTraceModelConfig(configs: Configs): StudyTraceModelConfig {
  return {
    apiKey: configs.studytrace_ai_api_key || '',
    baseUrl: configs.studytrace_ai_base_url || 'https://direct.evolink.ai',
    model: configs.studytrace_ai_model || 'MiniMax-M3',
    provider: configs.studytrace_ai_provider || 'evolink',
  };
}

function getAnalysisCostCredits(configs: Configs) {
  const value = Number(configs.studytrace_analysis_cost_credits ?? 1);
  if (!Number.isFinite(value) || value < 0) return 1;
  return Math.round(value);
}

function getAnalysisMinIntervalMs(configs: Configs) {
  const value = Number(configs.studytrace_analysis_min_interval_ms ?? 5000);
  if (!Number.isFinite(value) || value < 0) return 5000;
  return Math.round(value);
}

async function callStudyTraceModel(
  payload: StudyTracePayload,
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
        temperature: 0.2,
        // The structured five-dimension risk output plus lists needs more
        // room than the old flat schema; truncated JSON fails the whole run.
        max_completion_tokens: 6000,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`StudyTrace AI request failed: ${response.status}`);
  }

  const data = await response.json();
  const content =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.delta?.content ||
    '';

  if (!content) {
    throw new Error('StudyTrace AI returned empty content');
  }

  return extractJsonObject(content);
}

export async function POST(req: Request) {
  try {
    const configs = await getAllConfigs();
    const limited = enforceMinIntervalRateLimit(req, {
      intervalMs: getAnalysisMinIntervalMs(configs),
      keyPrefix: 'studytrace-analyze',
    });
    if (limited) {
      return limited;
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const payload = (await req.json()) as StudyTracePayload;

    // Only attach the run to a project the caller actually owns. Otherwise a
    // forged projectId could pollute another user's project (trust score /
    // last-analyzed timestamp are updated by createStudyTraceAnalysisRun).
    let projectId: string | undefined;
    if (payload.projectId) {
      const project = await findStudyTraceProject(payload.projectId, user.id);
      if (!project) {
        return respErr('project not found');
      }
      projectId = project.id;
    }

    const fallback = normalizeAnalysis(payload.localAnalysis, DEFAULT_ANALYSIS);
    const modelConfig = getStudyTraceModelConfig(configs);
    const costCredits = modelConfig.apiKey
      ? getAnalysisCostCredits(configs)
      : 0;

    if (costCredits > 0) {
      const remainingCredits = await getRemainingCredits(user.id);
      if (remainingCredits < costCredits) {
        return respErr('insufficient credits');
      }
    }

    try {
      const aiResult = await callStudyTraceModel(payload, modelConfig);
      const analysis = normalizeAnalysis(aiResult, {
        ...fallback,
        providerStatus: 'ai',
      });
      let creditId: string | null = null;

      if (costCredits > 0) {
        const consumedCredit = await consumeCredits({
          userId: user.id,
          credits: costCredits,
          scene: 'studytrace-analysis',
          description: 'StudyTrace AI analysis',
          metadata: JSON.stringify({
            type: 'studytrace-analysis',
            provider: modelConfig.provider,
            model: modelConfig.model,
            projectId: projectId || '',
          }),
        });
        creditId = consumedCredit?.id || null;
      }

      let analysisRunId = '';
      try {
        const run = await createStudyTraceAnalysisRun({
          userId: user.id,
          projectId,
          provider: modelConfig.provider,
          model: modelConfig.model,
          status: StudyTraceRunStatus.SUCCESS,
          providerStatus: 'ai',
          analysis,
          inputSnapshot: payload,
          rawOutput: aiResult,
          costCredits,
          creditId,
        });
        analysisRunId = run?.id || '';
      } catch (error) {
        console.log(
          'studytrace analysis audit failed:',
          error instanceof Error ? error.message : error
        );
      }

      return respData({
        analysis: {
          ...analysis,
          providerStatus: 'ai',
        },
        analysisRunId,
      });
    } catch (error) {
      console.log(
        'studytrace ai analysis failed:',
        error instanceof Error ? error.message : error
      );

      try {
        await createStudyTraceAnalysisRun({
          userId: user.id,
          projectId,
          provider: modelConfig.provider,
          model: modelConfig.model,
          status: StudyTraceRunStatus.FAILED,
          providerStatus: 'local',
          analysis: fallback,
          inputSnapshot: payload,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (auditError) {
        console.log(
          'studytrace fallback audit failed:',
          auditError instanceof Error ? auditError.message : auditError
        );
      }

      return respData({
        analysis: {
          ...fallback,
          providerStatus: 'local',
        },
      });
    }
  } catch (error: any) {
    console.log('studytrace analysis failed:', error);
    return respErr(error.message || 'studytrace analysis failed');
  }
}
