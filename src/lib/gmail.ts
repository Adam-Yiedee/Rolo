export async function sendReminderEmail(token: string, toEmail: string, contactName: string) {
  const subject = `Reminder: Reach out to ${contactName}`;
  const message = `Hello,\n\nThis is a reminder from your Roldex to reach out to ${contactName}.\n\nIt's been a while since your last contact. Log into your Roldex to view their details and record your next interaction!\n\nBest,\nYour Roldex`;
  
  const rawMessage = [
    `To: ${toEmail}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    message,
  ].join('\n');

  // Base64url encode the message
  const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

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
    const errorData = await res.json();
    console.error('Failed to send email', errorData);
    throw new Error('Failed to send email reminder');
  }
}
