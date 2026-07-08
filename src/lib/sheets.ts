export interface LinkedContact {
  id: string;
  relation: string;
}

export interface SubContact {
  id: string;
  name: string;
  relation?: string;
  notes: string;
}

export interface ContactHistoryEntry {
  id: string;
  date: string;
  notes: string;
}

export interface Contact {
  id: string;
  name: string;
  notes: string;
  profilePicture: string;
  interests: string;
  family: string;
  background?: string;
  linkedInUrl?: string;
  lastContactDate: string; // ISO string
  reminderIntervalDays: number | null;
  lastReminderSentDate: string; // ISO string
  linkedContacts: LinkedContact[];
  subContacts: SubContact[];
  history: ContactHistoryEntry[];
  categories: string[];
}

const STORAGE_KEY = 'rolodex_spreadsheet_id';

export const getSpreadsheetId = (): string | null => {
  return localStorage.getItem(STORAGE_KEY);
};

export const setSpreadsheetId = (id: string) => {
  localStorage.setItem(STORAGE_KEY, id);
};

const SHEET_NAME = 'Contacts';
const HEADERS = [
  'ID',
  'Name',
  'Notes',
  'Profile Picture',
  'Interests',
  'Family',
  'Last Contact Date',
  'Reminder Interval Days',
  'Last Reminder Sent Date',
  'Linked Contacts',
  'Sub Contacts',
  'History',
  'Categories',
  'Background',
  'LinkedIn URL'
];

export async function createSpreadsheet(token: string): Promise<string> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: 'Rolodex Contacts',
      },
      sheets: [
        {
          properties: {
            title: SHEET_NAME,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to create spreadsheet');
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  
  // Set headers
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:O1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [HEADERS],
    }),
  });

  setSpreadsheetId(spreadsheetId);
  return spreadsheetId;
}

export async function getContacts(token: string, spreadsheetId: string): Promise<Contact[]> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A2:O`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Spreadsheet not found');
    }
    throw new Error('Failed to fetch contacts');
  }

  const data = await res.json();
  const rows = data.values || [];

  return rows.map((row: any[]) => {
    let linkedContacts = [];
    try { linkedContacts = JSON.parse(row[9] || '[]'); } catch(e){}
    let subContacts = [];
    try { subContacts = JSON.parse(row[10] || '[]'); } catch(e){}
    let history = [];
    try { history = JSON.parse(row[11] || '[]'); } catch(e){}
    let categories = [];
    try { categories = JSON.parse(row[12] || '[]'); } catch(e){}

    const reminderDays = row[7] ? parseInt(row[7], 10) : null;

    return {
      id: row[0] || '',
      name: row[1] || '',
      notes: row[2] || '',
      profilePicture: row[3] || '',
      interests: row[4] || '',
      family: row[5] || '',
      lastContactDate: row[6] || '',
      reminderIntervalDays: isNaN(reminderDays as number) ? null : reminderDays,
      lastReminderSentDate: row[8] || '',
      linkedContacts,
      subContacts,
      history,
      categories,
      background: row[13] || '',
      linkedInUrl: row[14] || ''
    };
  });
}

export async function saveContacts(token: string, spreadsheetId: string, contacts: Contact[]): Promise<void> {
  // We will clear the existing data and overwrite to make it simple.
  // First clear
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A2:O:clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (contacts.length === 0) return;

  const values = contacts.map(c => [
    c.id,
    c.name,
    c.notes,
    c.profilePicture,
    c.interests,
    c.family,
    c.lastContactDate,
    c.reminderIntervalDays === null ? '' : c.reminderIntervalDays.toString(),
    c.lastReminderSentDate,
    JSON.stringify(c.linkedContacts || []),
    JSON.stringify(c.subContacts || []),
    JSON.stringify(c.history || []),
    JSON.stringify(c.categories || []),
    c.background || '',
    c.linkedInUrl || ''
  ]);

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A2:O?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values,
    }),
  });
}
