export interface ReminderEmailTemplate {
  subject: string;
  body: string;
}

export interface ReminderEmailContext {
  contactName: string;
  lastContactDate?: string;
  daysSinceContact?: number;
  reminderIntervalDays?: number | null;
  dueDate?: string;
  reason?: string;
}

export const DEFAULT_REMINDER_EMAIL_TEMPLATE: ReminderEmailTemplate = {
  subject: 'Reminder: reach out to {name}',
  body: [
    'Hi,',
    '',
    'This is your Roldex reminder to reach out to {name}.',
    '',
    'It has been {daysSinceContact} days since your last contact. A quick note is enough to keep the connection warm.',
    '',
    '- Roldex',
  ].join('\n'),
};

export const normalizeReminderEmailTemplate = (
  template?: Partial<ReminderEmailTemplate> | null,
): ReminderEmailTemplate => ({
  subject: template?.subject?.trim() || DEFAULT_REMINDER_EMAIL_TEMPLATE.subject,
  body: template?.body?.trim() || DEFAULT_REMINDER_EMAIL_TEMPLATE.body,
});

const formatDateForEmail = (value?: string) => {
  if (!value) return 'not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not recorded';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const renderReminderEmailTemplate = (
  template: ReminderEmailTemplate,
  context: ReminderEmailContext,
): ReminderEmailTemplate => {
  const normalizedTemplate = normalizeReminderEmailTemplate(template);
  const values: Record<string, string> = {
    appName: 'Roldex',
    name: context.contactName,
    contactName: context.contactName,
    daysSinceContact: typeof context.daysSinceContact === 'number' ? String(context.daysSinceContact) : 'a few',
    reminderIntervalDays: typeof context.reminderIntervalDays === 'number' ? String(context.reminderIntervalDays) : '',
    lastContactDate: formatDateForEmail(context.lastContactDate),
    dueDate: formatDateForEmail(context.dueDate),
    reason: context.reason?.trim() || '',
  };

  const render = (value: string) => value.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });

  return {
    subject: render(normalizedTemplate.subject).replace(/[\r\n]+/g, ' ').trim(),
    body: render(normalizedTemplate.body),
  };
};
