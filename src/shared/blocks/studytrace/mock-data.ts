import {
  DemoPaper,
  DemoPolicy,
  DemoTaskScript,
  DemoWritingSample,
  EvidenceCard,
  RiskFinding,
  StudyTraceProject,
  TimelineEvent,
  TraceFile,
} from './types';

const paperTopics = [
  'academic integrity in AI-assisted writing',
  'citation practice among international students',
  'source evaluation in higher education',
  'writing process transparency',
  'policy compliance in postgraduate assessment',
  'evidence-based appeal preparation',
  'LLM disclosure in university coursework',
  'research literacy and citation accuracy',
];

const venues = [
  'Journal of Academic Writing',
  'Higher Education Research Review',
  'International Journal for Educational Integrity',
  'Computers and Composition',
  'Assessment and Evaluation in Higher Education',
];

export const demoPapers: DemoPaper[] = Array.from({ length: 80 }, (_, index) => {
  const n = index + 1;
  const topic = paperTopics[index % paperTopics.length];

  return {
    id: `paper-${String(n).padStart(2, '0')}`,
    title: `Traceable ${topic}: evidence patterns in student writing ${n}`,
    authors: `A. Morgan, L. Chen, P. Williams`,
    year: 2019 + (index % 7),
    venue: venues[index % venues.length],
    doi: `10.5555/studytrace.${2020 + (index % 6)}.${String(n).padStart(4, '0')}`,
    citationContext: `The manuscript cites this source to support a claim about ${topic}.`,
    verificationStatus:
      index % 17 === 0
        ? 'metadata-mismatch'
        : index % 9 === 0
          ? 'needs-review'
          : 'matched',
  };
});

export const demoWritingSamples: DemoWritingSample[] = Array.from(
  { length: 50 },
  (_, index) => {
    const n = index + 1;
    const stages: DemoWritingSample['stage'][] = [
      'outline',
      'draft',
      'revision',
      'final',
    ];

    return {
      id: `writing-${String(n).padStart(2, '0')}`,
      stage: stages[index % stages.length],
      originalText: `Paragraph ${n} argues that academic support tools should improve clarity without replacing student judgement.`,
      aiUse: `AI was used to restructure sentence flow and identify unclear transitions in paragraph ${n}.`,
      humanEdit: `Student accepted wording suggestions selectively and added discipline-specific evidence after review.`,
      disclosureNote: `AI assistance was limited to language clarity and planning; claims, citations, and final judgement were human-authored.`,
    };
  }
);

const institutions = [
  'University of Melbourne',
  'University of Sydney',
  'Monash University',
  'University of Manchester',
  'University College London',
  'University of Toronto',
  'University of British Columbia',
  'New York University',
  'University of Auckland',
  'National University of Singapore',
];

export const demoPolicies: DemoPolicy[] = Array.from(
  { length: 30 },
  (_, index) => {
    const n = index + 1;
    const topics: DemoPolicy['topic'][] = [
      'AI disclosure',
      'citation integrity',
      'appeal evidence',
    ];
    const topic = topics[index % topics.length];

    return {
      id: `policy-${String(n).padStart(2, '0')}`,
      institution: institutions[index % institutions.length],
      region: ['AU', 'UK', 'CA', 'US', 'NZ', 'SG'][index % 6],
      topic,
      rule:
        topic === 'AI disclosure'
          ? 'Students must describe material use of generative AI where it influenced planning, drafting, editing, or evidence selection.'
          : topic === 'citation integrity'
            ? 'References must identify real sources and accurately support the claims they are attached to.'
            : 'Appeals should include dated evidence that explains process, intent, and corrective actions.',
      evidenceRequirement:
        topic === 'AI disclosure'
          ? 'Prompt logs, revision notes, and an AI use statement.'
          : topic === 'citation integrity'
            ? 'Source metadata, DOI/URL checks, and local citation context.'
            : 'Timeline, file manifest, draft history, and supporting policy excerpts.',
    };
  }
);

export const demoTaskScripts: DemoTaskScript[] = [
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `task-citation-${index + 1}`,
    category: 'citation authenticity' as const,
    userGoal: `Check whether reference cluster ${index + 1} is real and supports the claim.`,
    inputSet: 'Final paper, bibliography, DOI list, source PDFs',
    expectedOutput: 'Evidence cards with matched, needs-supplement, and format-risk labels.',
    demoHighlight: 'StudyTrace separates source existence from whether the source supports the local claim.',
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `task-ai-${index + 1}`,
    category: 'ai disclosure' as const,
    userGoal: `Explain AI use for paragraph group ${index + 1} without overstating authorship.`,
    inputSet: 'Prompt log, Grammarly export, draft comparison',
    expectedOutput: 'AI use explanation and human revision statement.',
    demoHighlight: 'The report frames AI as writing support, not a misconduct verdict.',
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `task-appeal-${index + 1}`,
    category: 'appeal evidence' as const,
    userGoal: `Prepare a submission-ready evidence chain for case ${index + 1}.`,
    inputSet: 'Policy excerpt, assignment brief, notice, dated draft history',
    expectedOutput: 'Evidence timeline and missing-evidence checklist.',
    demoHighlight: 'Every statement can point back to a dated artifact.',
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `task-combined-${index + 1}`,
    category: 'combined review' as const,
    userGoal: `Run a full StudyTrace review for demonstration case ${index + 1}.`,
    inputSet: 'Paper, sources, AI log, policy packet, misconduct notice',
    expectedOutput: 'Student check, school submission, and appeal statement reports.',
    demoHighlight: 'The workbench produces a credible academic process proof package.',
  })),
];

const now = new Date('2026-07-07T10:00:00.000Z');

export const demoFiles: TraceFile[] = [
  {
    id: 'file-demo-final-paper',
    name: 'final-essay-submitted-version.pdf',
    kind: 'final-paper',
    group: 'paper',
    size: 842144,
    type: 'application/pdf',
    hash: '7d71148b6cb8b9f8dfd00e4f1f3ac0fbb2b3988c14a45a06d4e87d7e93c91318',
    uploadedAt: now.toISOString(),
    source: 'demo',
    excerpt:
      'Submitted final paper with 18 in-text citations and 6 paragraphs requiring explanation.',
    content:
      'Paragraph 4: Academic support tools can improve clarity without replacing student judgement. Citation: Morgan, A., Chen, L., and Williams, P. (2024). Traceable academic integrity in AI-assisted writing. Journal of Academic Writing. DOI: 10.5555/studytrace.2024.0001.',
  },
  {
    id: 'file-demo-bibtex',
    name: 'zotero-library-export.bib',
    kind: 'citation-library',
    group: 'citation-evidence',
    size: 121904,
    type: 'text/x-bibtex',
    hash: 'af037d4583f88966fce7c87ad7fc19d645fe7f3817a093b4b909fe15f9be1051',
    uploadedAt: new Date(now.getTime() + 1000 * 60 * 12).toISOString(),
    source: 'demo',
    excerpt:
      'BibTeX export with DOI, title, author, year, and publisher metadata for the reference list.',
    content:
      '@article{morgan2024traceable,title={Traceable academic integrity in AI-assisted writing},author={Morgan, A. and Chen, L. and Williams, P.},year={2024},doi={10.5555/studytrace.2024.0001}}',
  },
  {
    id: 'file-demo-draft-history',
    name: 'google-docs-version-history-screenshots.zip',
    kind: 'version-history',
    group: 'writing-process',
    size: 542904,
    type: 'application/zip',
    hash: 'c8714ba50b7f4994e4237f05abefc4a7efa3bd98a9c11d92d0fab4d69bb31db8',
    uploadedAt: new Date(now.getTime() + 1000 * 60 * 25).toISOString(),
    source: 'demo',
    excerpt:
      'Version history screenshots show continuous drafting over 9 days with three major revisions.',
  },
  {
    id: 'file-demo-ai-log',
    name: 'grammarly-chatgpt-language-support-log.pdf',
    kind: 'ai-use-log',
    group: 'ai-use',
    size: 221904,
    type: 'application/pdf',
    hash: '41e83d2a25a8b97a991a871b4a70ca6975ecdc837f2f74148641e0d6912ec0fa',
    uploadedAt: new Date(now.getTime() + 1000 * 60 * 34).toISOString(),
    source: 'demo',
    excerpt:
      'AI and Grammarly records show grammar correction, paragraph transition review, and no direct whole-paragraph paste.',
    content:
      'AI use log: On 2026-07-06, the student used Grammarly to revise grammar and used ChatGPT to identify unclear transitions. The student rejected generated claims and rewrote final wording manually.',
  },
  {
    id: 'file-demo-policy',
    name: 'assignment-brief-and-ai-policy.pdf',
    kind: 'assignment-brief',
    group: 'school-material',
    size: 39248,
    type: 'application/pdf',
    hash: '3cbe7b42b9c9e74bc4d3c1ea0a813a746b699447640a6d806f79e63d1aecc550',
    uploadedAt: new Date(now.getTime() + 1000 * 60 * 44).toISOString(),
    source: 'demo',
    excerpt:
      'Assignment brief and school AI policy permit language editing support when disclosed and not used for authorship.',
    content:
      'Policy excerpt: Students must describe material use of generative AI where it influenced planning, drafting, editing, or evidence selection. References must identify real sources and accurately support the claims they are attached to.',
  },
  {
    id: 'file-demo-notice',
    name: 'academic-integrity-meeting-notice.pdf',
    kind: 'misconduct-notice',
    group: 'appeal-material',
    size: 68291,
    type: 'application/pdf',
    hash: '92a6f9b456af38df671dfc006ac10d8e1db91a3330fce10b6a6f4e975dc4a946',
    uploadedAt: new Date(now.getTime() + 1000 * 60 * 54).toISOString(),
    source: 'demo',
    excerpt:
      'School notice asks the student to explain citation support and AI use in paragraphs 4 and 7.',
  },
];

export const demoEvidenceCards: EvidenceCard[] = [
  {
    id: 'evidence-citation-real',
    kind: 'citation',
    title: 'Citation source exists and matches the paper',
    status: 'verified',
    strength: 'strong',
    suitability: 'ready-to-submit',
    proofTarget: 'Shows that Morgan 2024 is a real source used for the local claim.',
    linkedParagraph: 'Page 3, paragraph 4, sentence 2',
    score: 88,
    summary:
      'The citation appears in the final paper and is supported by the Zotero BibTeX export with title, author, year, and DOI metadata.',
    evidence: [
      'BibTeX metadata includes DOI 10.5555/studytrace.2024.0001.',
      'The final paper cites the same author and year in paragraph 4.',
      'The source supports the general claim about process-based academic integrity evidence.',
    ],
    risks: [
      'Two other references in the bibliography still need DOI or publisher-page confirmation.',
    ],
    sourceIds: ['file-demo-final-paper', 'file-demo-bibtex'],
    actions: ['Add publisher page screenshot', 'Add to school submission report'],
    action: 'Attach DOI landing-page evidence for the two remaining references.',
    includedInReport: true,
    sensitive: false,
  },
  {
    id: 'evidence-version-history',
    kind: 'version-history',
    title: 'Continuous draft history supports student authorship',
    status: 'ready',
    strength: 'strong',
    suitability: 'ready-to-submit',
    proofTarget:
      'Shows that the essay developed through a continuous student writing process.',
    linkedParagraph: 'Whole paper, draft versions 1-3',
    score: 84,
    summary:
      'Version history screenshots show 9 days of edits, three major draft versions, and progressive expansion from outline to final paper.',
    evidence: [
      'The first draft reached 1,230 words before AI language polishing records appear.',
      'Later revisions change structure, citations, and examples rather than replacing the whole essay.',
      'File hashes and timestamps preserve the uploaded process record.',
    ],
    risks: ['Screenshots should show account name or export metadata where possible.'],
    sourceIds: ['file-demo-draft-history'],
    actions: ['Generate process explanation', 'Hide account email before export'],
    action: 'Redact private account identifiers before adding screenshots to the report.',
    includedInReport: true,
    sensitive: true,
  },
  {
    id: 'evidence-ai-boundary',
    kind: 'ai-use',
    title: 'AI use appears limited to language support',
    status: 'ready',
    strength: 'medium',
    suitability: 'needs-supplement',
    proofTarget:
      'Explains that AI was used for grammar, clarity, and transitions rather than full authorship.',
    linkedParagraph: 'Page 3, paragraph 4; page 5, paragraph 7',
    score: 76,
    summary:
      'AI records show grammar and transition review. The log does not show a whole paragraph being generated and pasted into the final paper.',
    evidence: [
      'Grammarly support is dated after the first full draft was created.',
      'ChatGPT prompt asks for unclear transitions, not source claims or final wording.',
      'The student manually rewrote the final text after suggestions.',
    ],
    risks: ['The ChatGPT export is missing exact conversation timestamps.'],
    sourceIds: ['file-demo-ai-log', 'file-demo-draft-history'],
    actions: ['Add timestamped AI export', 'Generate AI use statement'],
    action: 'Supplement the record with account export timestamps if available.',
    includedInReport: true,
    sensitive: true,
  },
  {
    id: 'evidence-policy',
    kind: 'policy',
    title: 'School policy supports a process explanation',
    status: 'review',
    strength: 'medium',
    suitability: 'needs-supplement',
    proofTarget:
      'Connects the student explanation to the school policy and assignment brief.',
    linkedParagraph: 'AI use statement and appeal cover note',
    score: 72,
    summary:
      'The assignment brief and AI policy distinguish language editing support from authorship or evidence generation.',
    evidence: [
      'Policy excerpt asks students to describe material AI use.',
      'Citation policy requires source existence and local claim support.',
      'Appeal materials ask for dated evidence and an explanation of process.',
    ],
    risks: ['The exact faculty-level procedure should be added if available.'],
    sourceIds: ['file-demo-policy', 'file-demo-notice'],
    actions: ['Add faculty procedure', 'Quote policy in appeal statement'],
    action: 'Replace general school policy with the exact course or faculty rule.',
    includedInReport: true,
    sensitive: false,
  },
];

export const demoTimeline: TimelineEvent[] = [
  {
    id: 'timeline-brief',
    at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 9).toISOString(),
    title: 'Assignment brief and policy collected',
    description: 'The assignment requirements and AI disclosure rules were saved as school materials.',
    type: 'upload',
    stage: 'topic-confirmation',
    evidenceCardIds: ['evidence-policy'],
    fileId: 'file-demo-policy',
  },
  {
    id: 'timeline-literature',
    at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    title: '12 references imported from Zotero',
    description: 'Citation metadata was exported from Zotero and linked to the final reference list.',
    type: 'upload',
    stage: 'literature-search',
    evidenceCardIds: ['evidence-citation-real'],
    fileId: 'file-demo-bibtex',
  },
  {
    id: 'timeline-draft',
    at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    title: 'First full draft reached 1,230 words',
    description: 'Version history shows the paper existed before AI language-polishing records.',
    type: 'review',
    stage: 'first-draft',
    evidenceCardIds: ['evidence-version-history'],
    fileId: 'file-demo-draft-history',
  },
  {
    id: 'timeline-ai',
    at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    title: 'Grammarly and AI used for language polishing',
    description: 'The records show grammar correction and transition review, with manual final wording.',
    type: 'review',
    stage: 'ai-assistance',
    evidenceCardIds: ['evidence-ai-boundary'],
    fileId: 'file-demo-ai-log',
  },
  {
    id: 'timeline-citation-check',
    at: new Date(now.getTime() - 1000 * 60 * 60 * 8).toISOString(),
    title: '18 citations checked; 2 need DOI supplement',
    description: 'StudyTrace separated citation existence from local claim support and marked missing metadata.',
    type: 'analysis',
    stage: 'citation-check',
    evidenceCardIds: ['evidence-citation-real'],
  },
  {
    id: 'timeline-notice',
    at: new Date(now.getTime() + 1000 * 60 * 54).toISOString(),
    title: 'Academic integrity notice added',
    description: 'The notice asks for an explanation of AI use and citation support in selected paragraphs.',
    type: 'upload',
    stage: 'challenge',
    evidenceCardIds: ['evidence-policy', 'evidence-ai-boundary'],
    fileId: 'file-demo-notice',
  },
];

export const demoRisks: RiskFinding[] = [
  {
    id: 'risk-citation-doi',
    level: 'medium',
    category: 'citation-authenticity',
    area: 'Citation authenticity',
    title: 'Two references need source-page support',
    explanation:
      'The cited sources may be real, but two bibliography entries do not yet include DOI or stable publisher-page evidence.',
    recommendation:
      'Add DOI pages, publisher pages, or library screenshots before submitting those references as evidence.',
    linkedEvidenceIds: ['evidence-citation-real'],
  },
  {
    id: 'risk-ai-timestamp',
    level: 'medium',
    category: 'ai-use-explanation',
    area: 'AI use explanation',
    title: 'AI conversation export lacks exact timestamps',
    explanation:
      'The available AI log supports language-polishing use, but the export would be stronger with exact conversation dates.',
    recommendation:
      'Export the original conversation or add screenshots that show date, tool name, and account context.',
    linkedEvidenceIds: ['evidence-ai-boundary'],
  },
  {
    id: 'risk-policy-specificity',
    level: 'low',
    category: 'appeal-completeness',
    area: 'Appeal material completeness',
    title: 'Faculty-level policy can strengthen the explanation',
    explanation:
      'The school policy is relevant, but a course or faculty-specific rule would make the submission more precise.',
    recommendation:
      'Add the faculty procedure, assignment brief clause, or email guidance if available.',
    linkedEvidenceIds: ['evidence-policy'],
  },
];

export function createEmptyProject(): StudyTraceProject {
  const createdAt = new Date().toISOString();

  return {
    id: `trace-${Date.now()}`,
    title: 'Untitled academic process proof package',
    studentProfile: 'International student preparing an academic integrity explanation',
    courseName: '',
    assignmentTitle: '',
    paperTitle: '',
    submittedAt: '',
    createdAt,
    updatedAt: createdAt,
    files: [],
    evidenceCards: [],
    timeline: [
      {
        id: `timeline-${Date.now()}`,
        at: createdAt,
        title: 'Process proof workspace created',
        description: 'StudyTrace is ready to collect final work, process materials, school records, and appeal documents.',
        type: 'review',
        stage: 'topic-confirmation',
        evidenceCardIds: [],
      },
    ],
    risks: [],
    processConclusion:
      'No academic process conclusion yet. Upload the final paper, process records, citation sources, AI-use records, and school materials.',
  };
}

export function createDemoProject(): StudyTraceProject {
  const createdAt = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 9).toISOString();
  const updatedAt = new Date(now.getTime() + 1000 * 60 * 60).toISOString();

  return {
    id: 'trace-demo-academic-process',
    title: 'Academic process proof package for essay review',
    studentProfile: 'International postgraduate student preparing an academic integrity explanation',
    courseName: 'EDUC90021 Academic Writing and Evidence',
    assignmentTitle: 'Research essay, 2,500 words',
    paperTitle: 'Process-Based Evidence in AI-Assisted Academic Writing',
    submittedAt: '2026-07-07T09:00:00.000Z',
    createdAt,
    updatedAt,
    files: demoFiles,
    evidenceCards: demoEvidenceCards,
    timeline: demoTimeline,
    risks: demoRisks,
    processConclusion:
      'This paper has 9 continuous days of writing records, 3 draft versions, 18 checkable citations, and AI use concentrated in the language-polishing stage.',
    report: {
      id: 'report-demo',
      createdAt: updatedAt,
      readinessScore: 82,
      summary:
        'The evidence package is suitable for internal review and can support a restrained school-facing explanation after DOI and AI timestamp supplements are added.',
      variant: 'student-check',
    },
  };
}
