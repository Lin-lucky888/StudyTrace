import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { studytraceAnalysisRun, studytraceProject } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

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

export type StudyTraceAnalysisRun = typeof studytraceAnalysisRun.$inferSelect;
export type NewStudyTraceAnalysisRun =
  typeof studytraceAnalysisRun.$inferInsert;

export enum StudyTraceRunStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

function stringify(value: unknown, fallback = '[]') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

function truncate(value: string, maxLength = 120_000) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export async function createStudyTraceAnalysisRun({
  userId,
  projectId,
  provider,
  model,
  status,
  providerStatus,
  analysis,
  inputSnapshot,
  rawOutput,
  error,
  costCredits = 0,
  creditId,
}: {
  userId: string;
  projectId?: string | null;
  provider?: string;
  model?: string;
  status: StudyTraceRunStatus | string;
  providerStatus?: string;
  analysis?: Partial<StudyTraceAnalysis>;
  inputSnapshot?: unknown;
  rawOutput?: unknown;
  error?: string;
  costCredits?: number;
  creditId?: string | null;
}) {
  const row: NewStudyTraceAnalysisRun = {
    id: getUuid(),
    userId,
    projectId: projectId || null,
    provider: provider || '',
    model: model || '',
    status,
    providerStatus: providerStatus || analysis?.providerStatus || 'local',
    trustScore: Number(analysis?.trustScore || 0),
    summary: analysis?.summary || '',
    riskItems: stringify(analysis?.riskItems),
    timelineFindings: stringify(analysis?.timelineFindings),
    evidenceGaps: stringify(analysis?.evidenceGaps),
    appealOutline: stringify(analysis?.appealOutline),
    aiBoundaryStatement: analysis?.aiBoundaryStatement || '',
    exportChecklist: stringify(analysis?.exportChecklist),
    inputSnapshot:
      inputSnapshot === undefined
        ? null
        : truncate(JSON.stringify(inputSnapshot, null, 2)),
    rawOutput:
      rawOutput === undefined
        ? null
        : truncate(JSON.stringify(rawOutput, null, 2)),
    error: error || null,
    costCredits,
    creditId: creditId || null,
  };

  const [result] = await db()
    .insert(studytraceAnalysisRun)
    .values(row)
    .returning();

  if (projectId && analysis) {
    await db()
      .update(studytraceProject)
      .set({
        latestTrustScore: Number(analysis.trustScore || 0),
        lastAnalyzedAt: new Date(),
      })
      .where(eq(studytraceProject.id, projectId));
  }

  return result;
}
