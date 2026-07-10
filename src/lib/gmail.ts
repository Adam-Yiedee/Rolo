import {
  DEFAULT_REMINDER_EMAIL_TEMPLATE,
  ReminderEmailContext,
  ReminderEmailTemplate,
  renderReminderEmailTemplate,
} from './reminderEmail';

const encodeUtf8Base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const encodeBase64Url = (value: string) => encodeUtf8Base64(value)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const encodeMimeHeader = (value: string) => {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${encodeUtf8Base64(value)}?=`;
};

async function getGmailApiError(res: Response, fallback: string): Promise<Error> {
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

export async function sendReminderEmail(
  token: string,
  toEmail: string,
  contactName: string,
  template: ReminderEmailTemplate = DEFAULT_REMINDER_EMAIL_TEMPLATE,
  context: Partial<Omit<ReminderEmailContext, 'contactName'>> = {},
) {
  const rendered = renderReminderEmailTemplate(template, {
    ...context,
    contactName,
  });

  const rawMessage = [
    `To: ${toEmail}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    `Subject: ${encodeMimeHeader(rendered.subject)}`,
    '',
    rendered.body,
  ].join('\r\n');

  const encodedMessage = encodeBase64Url(rawMessage);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedMessage,
    }),
  });

  if (!res.ok) {
    throw await getGmailApiError(res, 'Failed to send reminder email');
  }

  return res.json();
}
