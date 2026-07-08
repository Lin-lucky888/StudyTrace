import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';
import { respData, respErr } from '@/shared/lib/resp';
import { Configs, getAllConfigs } from '@/shared/models/config';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import {
  createStudyTraceAnalysisRun,
  StudyTraceRunStatus,
} from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

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

type StudyTracePayload = {
  projectId?: string;
  assignment?: {
    title?: string;
    courseName?: string;
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

type StudyTraceModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

const DEFAULT_ANALYSIS: StudyTraceAnalysis = {
  trustScore: 35,
  summary: '材料仍需要补充。请优先建立写作时间线、上传草稿版本和引用来源。',
  riskItems: ['当前证据不足，难以支撑完整写作过程。'],
  timelineFindings: ['尚未形成连续时间线。'],
  evidenceGaps: ['缺少草稿、来源和 AI 使用边界说明。'],
  appealOutline: [
    '说明被质疑的问题。',
    '按时间线解释写作过程。',
    '列出引用来源和 AI 使用边界。',
    '请求人工复核。',
  ],
  aiBoundaryStatement:
    '请说明 AI 是否用于选题、提纲、语法检查、润色或资料整理，以及哪些部分完全由本人完成。',
  exportChecklist: ['补齐证据后再导出报告。'],
  providerStatus: 'local',
};

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

function buildSystemPrompt() {
  return [
    'You are StudyTrace, a careful academic integrity evidence organizer.',
    'Your job is to help a student organize truthful writing-process evidence, citation sources, AI-use boundaries, and appeal materials.',
    'Do not help evade detection, fabricate evidence, hide AI usage, or claim certainty about detector errors.',
    'Explain risk in a balanced way and recommend verifiable evidence.',
    'Return strict JSON only with these keys: trustScore, summary, riskItems, timelineFindings, evidenceGaps, appealOutline, aiBoundaryStatement, exportChecklist.',
    'trustScore must be an integer from 0 to 100. All list fields must be arrays of concise Chinese strings.',
  ].join('\n');
}

function buildUserPrompt(payload: StudyTracePayload) {
  return [
    '请基于以下材料生成中文分析。',
    '重点：真实写作过程、引用来源、AI 使用边界、申诉证据清单、风险解释。',
    '要求：不要编造不存在的证据；如果材料不足，请明确指出缺口。',
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
            content: buildSystemPrompt(),
          },
          {
            role: 'user',
            content: buildUserPrompt(payload),
          },
        ],
        thinking: {
          type: 'disabled',
        },
        temperature: 0.2,
        max_completion_tokens: 3000,
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
            projectId: payload.projectId || '',
          }),
        });
        creditId = consumedCredit?.id || null;
      }

      let analysisRunId = '';
      try {
        const run = await createStudyTraceAnalysisRun({
          userId: user.id,
          projectId: payload.projectId,
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
          projectId: payload.projectId,
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
