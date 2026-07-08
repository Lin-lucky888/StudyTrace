import { respData, respErr } from '@/shared/lib/resp';
import {
  createStudyTraceReport,
  findStudyTraceProject,
} from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { projectId, content, title, format, analysisRunId } = body || {};

    if (!projectId) {
      return respErr('projectId is required');
    }
    if (!content) {
      return respErr('content is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const project = await findStudyTraceProject(projectId, user.id);
    if (!project) {
      return respErr('project not found');
    }

    const report = await createStudyTraceReport({
      userId: user.id,
      projectId,
      analysisRunId,
      title,
      format,
      content,
    });

    return respData({ report });
  } catch (e: any) {
    console.log('save studytrace report failed:', e);
    return respErr(`save studytrace report failed: ${e.message}`);
  }
}
