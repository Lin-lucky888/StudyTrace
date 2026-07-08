import { respData, respErr } from '@/shared/lib/resp';
import { createStudyTraceProject } from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const project = await createStudyTraceProject({
      userId: user.id,
      title: body?.title,
      courseName: body?.courseName,
      institutionPolicy: body?.institutionPolicy,
      concern: body?.concern,
      aiBoundary: body?.aiBoundary,
      settings: body?.settings,
    });

    return respData({ project });
  } catch (e: any) {
    console.log('create studytrace project failed:', e);
    return respErr(`create studytrace project failed: ${e.message}`);
  }
}
