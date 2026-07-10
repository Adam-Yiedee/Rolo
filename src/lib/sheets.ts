import {
  DEFAULT_REMINDER_EMAIL_TEMPLATE,
  ReminderEmailTemplate,
  normalizeReminderEmailTemplate,
} from './reminderEmail';

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
  email?: string;
  phoneNumber?: string;
  lastContactDate: string; // ISO string
  reminderIntervalDays: number | null;
  lastReminderSentDate: string; // ISO string
  oneTimeReminderDate?: string; // ISO string
  oneTimeReminderCreatedDate?: string; // ISO string
  linkedContacts: LinkedContact[];
  subContacts: SubContact[];
  history: ContactHistoryEntry[];
  categories: string[];
}

export interface SpreadsheetCandidate {
  id: string;
  name: string;
  modifiedTime?: string;
  contactCount?: number;
  error?: string;
}

export interface AppSettings {
  reminderEmailTemplate: ReminderEmailTemplate;
}

const SPREADSHEET_TITLE = 'Roldex Contacts';
const STORAGE_KEY = 'rolodex_spreadsheet_id';
const SHEET_NAME = 'Contacts';
const SETTINGS_SHEET_NAME = 'Settings';
const DEFAULT_APP_SETTINGS: AppSettings = {
  reminderEmailTemplate: DEFAULT_REMINDER_EMAIL_TEMPLATE,
};

const getStorageKey = (ownerId?: string | null): string => {
  return ownerId ? `${STORAGE_KEY}:${ownerId}` : STORAGE_KEY;
};

export const getSpreadsheetId = (ownerId?: string | null): string | null => {
  return localStorage.getItem(getStorageKey(ownerId)) || localStorage.getItem(STORAGE_KEY);
};

export const setSpreadsheetId = (id: string, ownerId?: string | null) => {
  localStorage.setItem(getStorageKey(ownerId), id);
  if (!ownerId) {
    localStorage.setItem(STORAGE_KEY, id);
  }
};

export const clearSpreadsheetId = (ownerId?: string | null) => {
  localStorage.removeItem(getStorageKey(ownerId));
  localStorage.removeItem(STORAGE_KEY);
};
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
  'LinkedIn URL',
  'Email',
  'Phone Number',
  'One-Time Reminder Date',
  'One-Time Reminder Created Date'
];

async function getGoogleApiError(res: Response, fallback: string): Promise<Error> {
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

async function ensureContactHeaders(token: string, spreadsheetId: string): Promise<void> {
  const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:S1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [HEADERS],
    }),
  });

  if (!headerRes.ok) {
    throw await getGoogleApiError(headerRes, 'Failed to initialize spreadsheet headers');
  }
}

export async function createSpreadsheet(token: string): Promise<string> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: SPREADSHEET_TITLE,
      },
      sheets: [
        {
          properties: {
            title: SHEET_NAME,
          },
        },
        {
          properties: {
            title: SETTINGS_SHEET_NAME,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw await getGoogleApiError(res, 'Failed to create spreadsheet');
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  
  // Set headers
  await ensureContactHeaders(token, spreadsheetId);

  await saveAppSettings(token, spreadsheetId, DEFAULT_APP_SETTINGS);

  return spreadsheetId;
}

export async function findExistingSpreadsheet(token: string): Promise<string | null> {
  const candidates = await findSpreadsheetCandidates(token);
  const readableCandidates = candidates
    .filter((candidate) => typeof candidate.contactCount === 'number')
    .sort((a, b) => {
      const countDelta = (b.contactCount || 0) - (a.contactCount || 0);
      if (countDelta !== 0) return countDelta;
      return (new Date(b.modifiedTime || 0).getTime()) - (new Date(a.modifiedTime || 0).getTime());
    });

  return readableCandidates[0]?.id || null;
}

export async function findSpreadsheetCandidates(token: string): Promise<SpreadsheetCandidate[]> {
  const query = [
    "(name contains 'Roldex' or name contains 'Rolodex')",
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    'trashed = false',
  ].join(' and ');

  const params = new URLSearchParams({
    q: query,
    pageSize: '10',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,modifiedTime)',
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw await getGoogleApiError(res, 'Failed to search Google Drive for an existing contacts spreadsheet');
  }

  const data = await res.json();
  const files = (data.files || []) as Array<{ id: string; name: string; modifiedTime?: string }>;

  return Promise.all(files.map(async (file) => {
    try {
      const contacts = await getContacts(token, file.id);
      return {
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        contactCount: contacts.length,
      };
    } catch (err: any) {
      return {
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        error: err.message || String(err),
      };
    }
  }));
}

export async function getContacts(token: string, spreadsheetId: string): Promise<Contact[]> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A2:S`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Spreadsheet not found');
    }
    throw await getGoogleApiError(res, 'Failed to fetch contacts');
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
      linkedInUrl: row[14] || '',
      email: row[15] || '',
      phoneNumber: row[16] || '',
      oneTimeReminderDate: row[17] || '',
      oneTimeReminderCreatedDate: row[18] || ''
    };
  });
}

export async function saveContacts(token: string, spreadsheetId: string, contacts: Contact[]): Promise<void> {
  await ensureContactHeaders(token, spreadsheetId);

  // We will clear the existing data and overwrite to make it simple.
  // First clear
  const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A2:S:clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!clearRes.ok) {
    throw await getGoogleApiError(clearRes, 'Failed to clear contacts');
  }

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
    c.linkedInUrl || '',
    c.email || '',
    c.phoneNumber || '',
    c.oneTimeReminderDate || '',
    c.oneTimeReminderCreatedDate || ''
  ]);

  const saveRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A2:S?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values,
    }),
  });

  if (!saveRes.ok) {
    throw await getGoogleApiError(saveRes, 'Failed to save contacts');
  }
}

async function ensureSettingsSheet(token: string, spreadsheetId: string): Promise<void> {
  const metadataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!metadataRes.ok) {
    throw await getGoogleApiError(metadataRes, 'Failed to read spreadsheet metadata');
  }

  const metadata = await metadataRes.json();
  const sheets = (metadata.sheets || []) as Array<{ properties?: { title?: string } }>;
  if (sheets.some((sheet) => sheet.properties?.title === SETTINGS_SHEET_NAME)) return;

  const addSheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: SETTINGS_SHEET_NAME,
            },
          },
        },
      ],
    }),
  });

  if (!addSheetRes.ok) {
    throw await getGoogleApiError(addSheetRes, 'Failed to create settings sheet');
  }
}

export async function getAppSettings(token: string, spreadsheetId: string): Promise<AppSettings> {
  await ensureSettingsSheet(token, spreadsheetId);

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SETTINGS_SHEET_NAME}!A2:B`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw await getGoogleApiError(res, 'Failed to fetch app settings');
  }

  const data = await res.json();
  const rows = (data.values || []) as string[][];
  const settingsByKey = new Map(rows.map((row) => [row[0], row[1]]));
  const reminderTemplateValue = settingsByKey.get('reminderEmailTemplate');
  let reminderEmailTemplate = DEFAULT_REMINDER_EMAIL_TEMPLATE;

  if (reminderTemplateValue) {
    try {
      reminderEmailTemplate = normalizeReminderEmailTemplate(JSON.parse(reminderTemplateValue));
    } catch (err) {
      console.warn('Failed to parse reminder email template setting:', err);
    }
  }

  return {
    reminderEmailTemplate,
  };
}

export async function saveAppSettings(token: string, spreadsheetId: string, settings: AppSettings): Promise<void> {
  await ensureSettingsSheet(token, spreadsheetId);

  const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SETTINGS_SHEET_NAME}!A:B:clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!clearRes.ok) {
    throw await getGoogleApiError(clearRes, 'Failed to clear app settings');
  }

  const saveRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SETTINGS_SHEET_NAME}!A1:B?valueInputOption=RAW`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [
        ['Key', 'Value'],
        ['reminderEmailTemplate', JSON.stringify(normalizeReminderEmailTemplate(settings.reminderEmailTemplate))],
      ],
    }),
  });

  if (!saveRes.ok) {
    throw await getGoogleApiError(saveRes, 'Failed to save app settings');
  }
}
