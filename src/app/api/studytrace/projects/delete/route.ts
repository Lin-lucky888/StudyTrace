import { respData, respErr } from '@/shared/lib/resp';
import { softDeleteStudyTraceProject } from '@/shared/models/studytrace';
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

    const deleted = await softDeleteStudyTraceProject(projectId, user.id);
    if (!deleted) {
      return respErr('project not found');
    }

    return respData({ deleted: true });
  } catch (e: any) {
    console.log('delete studytrace project failed:', e);
    return respErr(`delete studytrace project failed: ${e.message}`);
  }
}
