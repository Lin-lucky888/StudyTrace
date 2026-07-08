import { respData, respErr } from '@/shared/lib/resp';
import {
  findAITaskByProviderTaskId,
  UpdateAITask,
  updateAITaskById,
} from '@/shared/models/ai_task';
import { getAIService } from '@/shared/services/ai';

function getNestedValue(value: any, path: string[]) {
  return path.reduce((current, key) => current?.[key], value);
}

function extractProviderTaskId(payload: any) {
  const paths = [
    ['taskId'],
    ['task_id'],
    ['id'],
    ['request_id'],
    ['data', 'taskId'],
    ['data', 'task_id'],
    ['data', 'id'],
    ['data', 'request_id'],
    ['prediction', 'id'],
  ];

  for (const path of paths) {
    const value = getNestedValue(payload, path);
    if (value) return String(value);
  }

  return '';
}

async function readPayload(req: Request) {
  const text = await req.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    if (!provider) {
      return respErr('invalid provider');
    }

    const payload = await readPayload(req);
    const providerTaskId = extractProviderTaskId(payload);
    if (!providerTaskId) {
      return respErr('task id not found');
    }

    const task = await findAITaskByProviderTaskId({
      provider,
      taskId: providerTaskId,
    });
    if (!task) {
      return respErr('task not found');
    }

    const aiService = await getAIService();
    const aiProvider = aiService.getProvider(provider);
    if (!aiProvider?.query) {
      return respErr('invalid ai provider');
    }

    const result = await aiProvider.query({
      taskId: task.taskId || providerTaskId,
      mediaType: task.mediaType,
      model: task.model,
    });

    if (!result?.taskStatus) {
      return respErr('query ai task failed');
    }

    const updateAITask: UpdateAITask = {
      status: result.taskStatus,
      taskInfo: result.taskInfo ? JSON.stringify(result.taskInfo) : null,
      taskResult: result.taskResult
        ? JSON.stringify(result.taskResult)
        : JSON.stringify(payload),
      creditId: task.creditId,
    };

    const updated = await updateAITaskById(task.id, updateAITask);
    return respData(updated);
  } catch (e: any) {
    console.log('ai notify failed', e);
    return respErr(e.message || 'ai notify failed');
  }
}
