export const STUDYTRACE_STORAGE_KEY = 'studytrace.process-proof.projects.v2';

export type TraceFileGroup =
  | 'paper'
  | 'citation-evidence'
  | 'writing-process'
  | 'ai-use'
  | 'school-material'
  | 'appeal-material';

export type TraceFileKind =
  | 'final-paper'
  | 'draft'
  | 'version-history'
  | 'reference-source'
  | 'citation-library'
  | 'ai-use-log'
  | 'school-policy'
  | 'assignment-brief'
  | 'misconduct-notice'
  | 'appeal-material'
  | 'notes'
  // legacy aliases kept so old localStorage payloads and API responses still load
  | 'paper'
  | 'policy';

export type EvidenceKind =
  | 'citation'
  | 'draft'
  | 'ai-use'
  | 'version-history'
  | 'mentor-feedback'
  | 'policy'
  | 'appeal'
  | 'process';

export type EvidenceStatus = 'verified' | 'ready' | 'review' | 'risk';

export type EvidenceStrength = 'strong' | 'medium' | 'weak';

export type SubmissionSuitability =
  | 'ready-to-submit'
  | 'needs-supplement'
  | 'not-recommended';

export type TimelineEventType =
  | 'upload'
  | 'analysis'
  | 'review'
  | 'export';

export type AcademicProcessStage =
  | 'topic-confirmation'
  | 'literature-search'
  | 'reading-notes'
  | 'first-draft'
  | 'ai-assistance'
  | 'revision'
  | 'citation-check'
  | 'submission'
  | 'challenge'
  | 'appeal';

export type RiskLevel = 'low' | 'medium' | 'high';

export type RiskCategory =
  | 'citation-authenticity'
  | 'citation-format'
  | 'ai-use-explanation'
  | 'writing-process-gap'
  | 'appeal-completeness';

export type ReportVariant =
  | 'student-check'
  | 'school-submission'
  | 'appeal-statement';

export interface TraceFile {
  id: string;
  name: string;
  kind: TraceFileKind;
  group: TraceFileGroup;
  size: number;
  type: string;
  hash: string;
  uploadedAt: string;
  source: 'upload' | 'demo';
  excerpt?: string;
  content?: string;
  textExtractedAt?: string;
}

export interface EvidenceCard {
  id: string;
  kind: EvidenceKind;
  title: string;
  status: EvidenceStatus;
  strength: EvidenceStrength;
  suitability: SubmissionSuitability;
  proofTarget: string;
  linkedParagraph: string;
  score: number;
  summary: string;
  evidence: string[];
  risks: string[];
  sourceIds: string[];
  actions: string[];
  action: string;
  includedInReport: boolean;
  sensitive: boolean;
}

export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  description: string;
  type: TimelineEventType;
  stage: AcademicProcessStage;
  evidenceCardIds: string[];
  fileId?: string;
}

export interface RiskFinding {
  id: string;
  level: RiskLevel;
  category: RiskCategory;
  area: string;
  title: string;
  explanation: string;
  recommendation: string;
  linkedEvidenceIds: string[];
}

export interface TraceReport {
  id: string;
  createdAt: string;
  readinessScore: number;
  summary: string;
  variant?: ReportVariant;
}

export interface ExtractedClaim {
  id: string;
  text: string;
  location?: string;
  sourceFileIds: string[];
  evidenceIds: string[];
  confidence: number;
  note: string;
}

export type CitationMatchStatus =
  | 'matched'
  | 'needs-review'
  | 'missing-metadata'
  | 'unsupported';

export interface CitationMatch {
  id: string;
  citationText: string;
  claimId?: string;
  sourceTitle?: string;
  authors?: string;
  year?: string;
  doi?: string;
  url?: string;
  status: CitationMatchStatus;
  explanation: string;
  sourceFileIds: string[];
  confidence: number;
}

export interface AIUseRecord {
  id: string;
  stage: string;
  toolName?: string;
  promptOrAction: string;
  humanAction: string;
  disclosureRisk: RiskLevel;
  sourceFileIds: string[];
  confidence: number;
}

export interface StudyTraceAnalysisResult {
  provider: string;
  model: string;
  generatedAt: string;
  claims: ExtractedClaim[];
  citationMatches: CitationMatch[];
  aiUseRecords: AIUseRecord[];
  evidenceCards: EvidenceCard[];
  timelineEvents: TimelineEvent[];
  risks: RiskFinding[];
  report: TraceReport;
  processConclusion: string;
  summary: string;
}

export interface StudyTraceProject {
  id: string;
  title: string;
  studentProfile: string;
  courseName: string;
  assignmentTitle: string;
  paperTitle: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  files: TraceFile[];
  evidenceCards: EvidenceCard[];
  timeline: TimelineEvent[];
  risks: RiskFinding[];
  processConclusion: string;
  report?: TraceReport;
  analysis?: StudyTraceAnalysisResult;
}

export interface DemoPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  doi: string;
  citationContext: string;
  verificationStatus: 'matched' | 'needs-review' | 'metadata-mismatch';
}

export interface DemoWritingSample {
  id: string;
  stage: 'outline' | 'draft' | 'revision' | 'final';
  originalText: string;
  aiUse: string;
  humanEdit: string;
  disclosureNote: string;
}

export interface DemoPolicy {
  id: string;
  institution: string;
  region: string;
  topic: 'AI disclosure' | 'citation integrity' | 'appeal evidence';
  rule: string;
  evidenceRequirement: string;
}

export interface DemoTaskScript {
  id: string;
  category:
    | 'citation authenticity'
    | 'ai disclosure'
    | 'appeal evidence'
    | 'combined review';
  userGoal: string;
  inputSet: string;
  expectedOutput: string;
  demoHighlight: string;
}
