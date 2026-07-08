import { respData, respErr } from '@/shared/lib/resp';
import {
  saveStudyTraceProjectSnapshot,
  type SnapshotCard,
  type SnapshotFile,
  type SnapshotTimelineEvent,
} from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

type SavePayload = {
  projectId?: string;
  project?: {
    title?: string;
    courseName?: string;
    institutionPolicy?: string;
    concern?: string;
    aiBoundary?: string;
    settings?: unknown;
  };
  files?: SnapshotFile[];
  cards?: SnapshotCard[];
  timeline?: SnapshotTimelineEvent[];
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as SavePayload;
    if (!payload.projectId) {
      return respErr('projectId is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const saved = await saveStudyTraceProjectSnapshot({
      projectId: payload.projectId,
      userId: user.id,
      project: payload.project || {},
      files: Array.isArray(payload.files) ? payload.files : [],
      cards: Array.isArray(payload.cards) ? payload.cards : [],
      timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
    });

    if (!saved) {
      return respErr('project not found');
    }

    return respData({ saved: true });
  } catch (e: any) {
    console.log('save studytrace project failed:', e);
    return respErr(`save studytrace project failed: ${e.message}`);
  }
}
