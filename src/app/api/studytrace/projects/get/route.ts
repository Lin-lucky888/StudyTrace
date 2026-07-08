import { respData, respErr } from '@/shared/lib/resp';
import { getStudyTraceProjectSnapshot } from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const { projectId } = await req.json().catch(() => ({}));
    if (!projectId) {
      return respErr('projectId is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const snapshot = await getStudyTraceProjectSnapshot(projectId, user.id);
    if (!snapshot) {
      return respErr('project not found');
    }

    return respData(snapshot);
  } catch (e: any) {
    console.log('get studytrace project failed:', e);
    return respErr(`get studytrace project failed: ${e.message}`);
  }
}
