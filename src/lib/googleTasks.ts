import { ReminderEmailContext } from './reminderEmail';

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const ROLDEX_TASK_LIST_TITLE = 'Roldex';

export interface ReminderTaskTemplate {
  title: string;
  notes: string;
}

export interface GoogleTask {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
  webViewLink?: string;
}

interface GoogleTaskList {
  id: string;
  title: string;
}

export const DEFAULT_REMINDER_TASK_TEMPLATE: ReminderTaskTemplate = {
  title: 'Reach out to {name}',
  notes: [
    'Roldex reminder to reach out to {name}.',
    'Due {dueDate}.',
    '',
    '{reason}',
  ].join('\n'),
};

export class GoogleTaskNotFoundError extends Error {
  constructor(message = 'Google Task not found') {
    super(message);
    this.name = 'GoogleTaskNotFoundError';
  }
}

export const normalizeReminderTaskTemplate = (
  template?: Partial<ReminderTaskTemplate> | null,
): ReminderTaskTemplate => ({
  title: template?.title?.trim() || DEFAULT_REMINDER_TASK_TEMPLATE.title,
  notes: template?.notes?.trim() || DEFAULT_REMINDER_TASK_TEMPLATE.notes,
});

const formatDateForTask = (value?: string) => {
  if (!value) return 'not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not recorded';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const renderReminderTaskTemplate = (
  template: ReminderTaskTemplate,
  context: ReminderEmailContext,
): ReminderTaskTemplate => {
  const normalizedTemplate = normalizeReminderTaskTemplate(template);
  const values: Record<string, string> = {
    appName: 'Roldex',
    name: context.contactName,
    contactName: context.contactName,
    daysSinceContact: typeof context.daysSinceContact === 'number' ? String(context.daysSinceContact) : 'a few',
    reminderIntervalDays: typeof context.reminderIntervalDays === 'number' ? String(context.reminderIntervalDays) : '',
    lastContactDate: formatDateForTask(context.lastContactDate),
    dueDate: formatDateForTask(context.dueDate),
    reason: context.reason?.trim() || '',
  };

  const render = (value: string) => value.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });

  return {
    title: render(normalizedTemplate.title).replace(/[\r\n]+/g, ' ').trim() || DEFAULT_REMINDER_TASK_TEMPLATE.title,
    notes: render(normalizedTemplate.notes).trim(),
  };
};

export const getGoogleTaskDueValue = (dueDate: Date) => {
  const due = new Date(dueDate);
  due.setUTCHours(0, 0, 0, 0);
  return due.toISOString();
};

async function getGoogleTasksApiError(res: Response, fallback: string): Promise<Error> {
  let detail = '';
  try {
    const data = await res.json();
    detail = data.error?.message || JSON.stringify(data.error || data);
  } catch {
    try {
      detail = await res.text();
    } catch {
      detail = '';
    }
  }

  return new Error(`${fallback} (${res.status}${res.statusText ? ` ${res.statusText}` : ''}${detail ? `: ${detail}` : ''})`);
}

const encodePath = (value: string) => encodeURIComponent(value);

async function fetchGoogleTasks<T>(
  token: string,
  path: string,
  options: RequestInit = {},
  fallback = 'Google Tasks request failed',
): Promise<T> {
  const res = await fetch(`${TASKS_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 404) {
    throw new GoogleTaskNotFoundError(fallback);
  }

  if (!res.ok) {
    throw await getGoogleTasksApiError(res, fallback);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export async function getOrCreateRoldexTaskList(token: string, preferredTaskListId?: string): Promise<string> {
  if (preferredTaskListId) {
    try {
      const preferred = await fetchGoogleTasks<GoogleTaskList>(
        token,
        `/users/@me/lists/${encodePath(preferredTaskListId)}`,
        {},
        'Failed to read saved Google Tasks list',
      );
      return preferred.id;
    } catch (err) {
      if (!(err instanceof GoogleTaskNotFoundError)) throw err;
    }
  }

  const taskLists = await fetchGoogleTasks<{ items?: GoogleTaskList[] }>(
    token,
    '/users/@me/lists?maxResults=100',
    {},
    'Failed to list Google Tasks lists',
  );

  const existingRoldexList = (taskLists.items || []).find((list) => list.title === ROLDEX_TASK_LIST_TITLE);
  if (existingRoldexList) return existingRoldexList.id;

  const created = await fetchGoogleTasks<GoogleTaskList>(
    token,
    '/users/@me/lists',
    {
      method: 'POST',
      body: JSON.stringify({ title: ROLDEX_TASK_LIST_TITLE }),
    },
    'Failed to create Roldex Google Tasks list',
  );

  return created.id;
}

export async function createGoogleReminderTask(
  token: string,
  taskListId: string,
  task: Pick<GoogleTask, 'title' | 'notes' | 'due' | 'status'>,
): Promise<GoogleTask> {
  return fetchGoogleTasks<GoogleTask>(
    token,
    `/lists/${encodePath(taskListId)}/tasks`,
    {
      method: 'POST',
      body: JSON.stringify(task),
    },
    'Failed to create Google reminder task',
  );
}

export async function patchGoogleReminderTask(
  token: string,
  taskListId: string,
  taskId: string,
  task: Pick<GoogleTask, 'title' | 'notes' | 'due' | 'status'>,
): Promise<GoogleTask> {
  return fetchGoogleTasks<GoogleTask>(
    token,
    `/lists/${encodePath(taskListId)}/tasks/${encodePath(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(task),
    },
    'Failed to update Google reminder task',
  );
}

export async function deleteGoogleReminderTask(
  token: string,
  taskListId?: string,
  taskId?: string,
): Promise<void> {
  if (!taskListId || !taskId) return;

  try {
    await fetchGoogleTasks<void>(
      token,
      `/lists/${encodePath(taskListId)}/tasks/${encodePath(taskId)}`,
      { method: 'DELETE' },
      'Failed to delete Google reminder task',
    );
  } catch (err) {
    if (!(err instanceof GoogleTaskNotFoundError)) throw err;
  }
}
