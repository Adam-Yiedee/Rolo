import React, { useState, useEffect, useRef } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ContactCard } from './components/ContactCard';
import { ContactModal } from './components/ContactModal';
import { GraphView } from './components/GraphView';
import { GoalsDashboard } from './components/GoalsDashboard';
import { initAuth, googleSignIn, logout, getAccessToken } from './lib/auth';
import { User } from 'firebase/auth';
import { AppSettings, Contact, ContactHistoryEntry, DEFAULT_APP_SETTINGS, getSpreadsheetId, createSpreadsheet, getContacts, saveContacts, findExistingSpreadsheet, findSpreadsheetCandidates, setSpreadsheetId, clearSpreadsheetId, getAppSettings, saveAppSettings } from './lib/sheets';
import { sendReminderEmail } from './lib/gmail';
import { DEFAULT_REMINDER_EMAIL_TEMPLATE, ReminderEmailTemplate, normalizeReminderEmailTemplate, renderReminderEmailTemplate } from './lib/reminderEmail';
import {
  createGoogleReminderTask,
  DEFAULT_REMINDER_TASK_TEMPLATE,
  deleteGoogleReminderTask,
  getGoogleTaskDueValue,
  getOrCreateRoldexTaskList,
  GoogleTaskNotFoundError,
  patchGoogleReminderTask,
  ReminderTaskTemplate,
  normalizeReminderTaskTemplate,
  renderReminderTaskTemplate,
} from './lib/googleTasks';
import { addDays, differenceInDays, parseISO, startOfDay } from 'date-fns';
import { Bug, CheckCircle2, Copy, ListTodo, LogOut, Mail, Plus, RotateCcw, Save, Search, Send, Loader2, Sparkles, UserRound, LayoutGrid, Network, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [user, setUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'contacts' | 'goals'>('contacts');
  const [contactSortBy, setContactSortBy] = useState<'name' | 'recent' | 'categories'>('name');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showGraphView, setShowGraphView] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string>('');
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false);
  const [reminderEmailTemplate, setReminderEmailTemplate] = useState<ReminderEmailTemplate>(DEFAULT_REMINDER_EMAIL_TEMPLATE);
  const [emailSettingsMessage, setEmailSettingsMessage] = useState('');
  const [isSavingEmailTemplate, setIsSavingEmailTemplate] = useState(false);
  const [isSendingTestReminder, setIsSendingTestReminder] = useState(false);
  const [isTaskSettingsOpen, setIsTaskSettingsOpen] = useState(false);
  const [reminderTasksEnabled, setReminderTasksEnabled] = useState(DEFAULT_APP_SETTINGS.reminderTasksEnabled);
  const [reminderTaskTemplate, setReminderTaskTemplate] = useState<ReminderTaskTemplate>(DEFAULT_REMINDER_TASK_TEMPLATE);
  const [reminderTaskListId, setReminderTaskListId] = useState(DEFAULT_APP_SETTINGS.reminderTaskListId || '');
  const [taskSettingsMessage, setTaskSettingsMessage] = useState('');
  const [isSavingTaskSettings, setIsSavingTaskSettings] = useState(false);
  
  const [spreadsheetId, setAppSpreadsheetId] = useState<string | null>(null);
  
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<'details' | 'history'>('details');
  
  const [loading, setLoading] = useState(false);
  const [goalCelebration, setGoalCelebration] = useState<{ id: number; contactName: string } | null>(null);
  const celebrationTimeoutRef = useRef<number | null>(null);

  const openContactModal = (contact: Contact | null, tab: 'details' | 'history' = 'details') => {
    setSelectedContact(contact);
    setModalInitialTab(tab);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setUser(user);
        setNeedsAuth(false);
        setIsInitializing(false);
        loadData(token, user.uid, user.email || undefined);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
        setIsInitializing(false);
        setReminderEmailTemplate(DEFAULT_REMINDER_EMAIL_TEMPLATE);
        setReminderTasksEnabled(DEFAULT_APP_SETTINGS.reminderTasksEnabled);
        setReminderTaskTemplate(DEFAULT_REMINDER_TASK_TEMPLATE);
        setReminderTaskListId(DEFAULT_APP_SETTINGS.reminderTaskListId || '');
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current) {
        window.clearTimeout(celebrationTimeoutRef.current);
      }
    };
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        await loadData(result.accessToken, result.user.uid, result.user.email || undefined);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err.code === 'auth/unauthorized-domain') {
        alert(`Domain not authorized. Please add ${window.location.hostname} to your Firebase Console (Authentication > Settings > Authorized domains).`);
      } else {
        alert("Login failed: " + err.message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loadData = async (token: string, ownerId?: string, userEmail?: string) => {
    setLoading(true);
    try {
      let currentSpreadsheetId = getSpreadsheetId(ownerId);
      let loadedContacts: Contact[] | null = null;
      let loadedReminderEmailTemplate = DEFAULT_REMINDER_EMAIL_TEMPLATE;
      let loadedAppSettings = DEFAULT_APP_SETTINGS;

      if (currentSpreadsheetId) {
        try {
          loadedContacts = await getContacts(token, currentSpreadsheetId);
          if (loadedContacts.length === 0) {
            const discoveredSpreadsheetId = await findExistingSpreadsheet(token);
            if (discoveredSpreadsheetId && discoveredSpreadsheetId !== currentSpreadsheetId) {
              const discoveredContacts = await getContacts(token, discoveredSpreadsheetId);
              if (discoveredContacts.length > loadedContacts.length) {
                currentSpreadsheetId = discoveredSpreadsheetId;
                loadedContacts = discoveredContacts;
              }
            }
          }
        } catch (err) {
          console.warn('Cached spreadsheet unavailable, searching Drive instead:', err);
          clearSpreadsheetId(ownerId);
          currentSpreadsheetId = null;
        }
      }

      if (!currentSpreadsheetId) {
        currentSpreadsheetId = await findExistingSpreadsheet(token);
      }

      if (!currentSpreadsheetId) {
        currentSpreadsheetId = await createSpreadsheet(token);
      }

      setSpreadsheetId(currentSpreadsheetId, ownerId);
      setAppSpreadsheetId(currentSpreadsheetId);

      try {
        const appSettings = await getAppSettings(token, currentSpreadsheetId);
        loadedAppSettings = appSettings;
        loadedReminderEmailTemplate = appSettings.reminderEmailTemplate;
        setReminderEmailTemplate(loadedReminderEmailTemplate);
        setReminderTasksEnabled(appSettings.reminderTasksEnabled);
        setReminderTaskTemplate(appSettings.reminderTaskTemplate);
        setReminderTaskListId(appSettings.reminderTaskListId || '');
      } catch (err) {
        console.warn('Failed to load app settings, using defaults:', err);
        setReminderEmailTemplate(DEFAULT_REMINDER_EMAIL_TEMPLATE);
        setReminderTasksEnabled(DEFAULT_APP_SETTINGS.reminderTasksEnabled);
        setReminderTaskTemplate(DEFAULT_REMINDER_TASK_TEMPLATE);
        setReminderTaskListId(DEFAULT_APP_SETTINGS.reminderTaskListId || '');
      }
      
      if (!loadedContacts) {
        loadedContacts = await getContacts(token, currentSpreadsheetId);
      }

      let loadedContactsNeedSave = false;
      const normalizedLoadedContacts = normalizeContactsActivity(loadedContacts);
      if (haveContactsChanged(loadedContacts, normalizedLoadedContacts)) {
        loadedContacts = normalizedLoadedContacts;
        loadedContactsNeedSave = true;
      }

      try {
        const taskSyncResult = await syncGoogleReminderTasks(token, loadedContacts, loadedAppSettings);
        if (taskSyncResult.contactsChanged) {
          loadedContacts = taskSyncResult.contacts;
          loadedContactsNeedSave = true;
        }
        if (taskSyncResult.settingsChanged) {
          loadedAppSettings = taskSyncResult.settings;
          setReminderTaskListId(loadedAppSettings.reminderTaskListId || '');
          await saveAppSettings(token, currentSpreadsheetId, loadedAppSettings);
        }
      } catch (err) {
        console.warn('Failed to sync Google Tasks reminders:', err);
      }

      if (loadedContactsNeedSave) {
        await saveContacts(token, currentSpreadsheetId, loadedContacts);
      }

      setContacts(loadedContacts);
      
      // Process reminders in the background
      processReminders(token, loadedContacts, currentSpreadsheetId, userEmail, loadedReminderEmailTemplate, loadedAppSettings);
    } catch (err: any) {
      console.error('Failed to load data:', err);
      alert(`Failed to load data from Google. Please ensure you have enabled the Google Sheets API and Google Drive API in your Google Cloud Console. Error: ${err.message}`);
      // If we failed, maybe spreadsheet was deleted, clear it to recreate next time
      clearSpreadsheetId(ownerId);
      setAppSpreadsheetId(null);
    } finally {
      setLoading(false);
    }
  };

  const parseContactDate = (value?: string) => {
    if (!value) return null;
    const date = parseISO(value);
    return Number.isNaN(date.getTime()) ? null : startOfDay(date);
  };

  const getToday = () => startOfDay(new Date());

  const getHistoryEntryTime = (entry: ContactHistoryEntry) => {
    const time = parseContactDate(entry.date)?.getTime();
    return typeof time === 'number' && Number.isFinite(time) ? time : -Infinity;
  };

  const normalizeContactActivity = (contact: Contact): Contact => {
    const sortedHistory = [...(contact.history || [])].sort((a, b) => getHistoryEntryTime(b) - getHistoryEntryTime(a));
    const latestEntry = sortedHistory.find((entry) => Number.isFinite(getHistoryEntryTime(entry)));

    return {
      ...contact,
      history: sortedHistory,
      lastContactDate: latestEntry?.date || contact.lastContactDate || '',
    };
  };

  const normalizeContactsActivity = (sourceContacts: Contact[]) => (
    sourceContacts.map(normalizeContactActivity)
  );

  const haveContactsChanged = (a: Contact[], b: Contact[]) => JSON.stringify(a) !== JSON.stringify(b);

  const getDaysSinceLastContact = (contact: Contact) => {
    const lastContact = parseContactDate(contact.lastContactDate);
    return lastContact ? Math.max(0, differenceInDays(getToday(), lastContact)) : undefined;
  };

  const getEventReminderDueDate = (contact: Contact) => parseContactDate(contact.oneTimeReminderDate);

  const getRecurringReminderDueDate = (contact: Contact) => {
    if (!contact.reminderIntervalDays || contact.reminderIntervalDays <= 0) return null;
    const lastContactDate = parseContactDate(contact.lastContactDate);
    return lastContactDate ? addDays(lastContactDate, contact.reminderIntervalDays) : getToday();
  };

  const getContactReminderDueDate = (contact: Contact) => {
    const eventDate = getEventReminderDueDate(contact);
    const recurringDate = getRecurringReminderDueDate(contact);

    if (eventDate && recurringDate) {
      return eventDate.getTime() <= recurringDate.getTime() ? eventDate : recurringDate;
    }
    return eventDate || recurringDate;
  };

  const isEventReminderDueDate = (contact: Contact, dueDate: Date) => {
    const eventDate = getEventReminderDueDate(contact);
    return Boolean(eventDate && eventDate.getTime() === dueDate.getTime());
  };

  const hasContactReminder = (contact: Contact) => Boolean(getContactReminderDueDate(contact));

  const getContactReminderOverdueDays = (contact: Contact) => {
    const dueDate = getContactReminderDueDate(contact);
    if (!dueDate) return -9999;
    return differenceInDays(getToday(), dueDate);
  };

  const hasStoredReminderTask = (contact: Contact) => Boolean(
    contact.reminderTaskId
    || contact.reminderTaskListId
    || contact.reminderTaskDueDate
    || contact.reminderTaskWebViewLink,
  );

  const clearReminderTaskFields = (contact: Contact): Contact => ({
    ...contact,
    reminderTaskId: '',
    reminderTaskListId: '',
    reminderTaskDueDate: '',
    reminderTaskWebViewLink: '',
  });

  const getCurrentAppSettings = (): AppSettings => ({
    reminderEmailTemplate: normalizeReminderEmailTemplate(reminderEmailTemplate),
    reminderTasksEnabled,
    reminderTaskTemplate: normalizeReminderTaskTemplate(reminderTaskTemplate),
    reminderTaskListId,
  });

  const getReminderTaskPayload = (contact: Contact, dueDate: Date, template: ReminderTaskTemplate) => {
    const dueIso = dueDate.toISOString();
    const due = getGoogleTaskDueValue(dueDate);
    const isEventReminder = isEventReminderDueDate(contact, dueDate);
    const rendered = renderReminderTaskTemplate(template, {
      contactName: contact.name,
      lastContactDate: contact.lastContactDate,
      daysSinceContact: getDaysSinceLastContact(contact),
      reminderIntervalDays: contact.reminderIntervalDays,
      dueDate: dueIso,
      reason: isEventReminder ? contact.oneTimeReminderReason : '',
    });

    return {
      title: rendered.title,
      notes: rendered.notes,
      due,
    };
  };

  const syncGoogleReminderTasks = async (
    token: string,
    sourceContacts: Contact[],
    sourceSettings: AppSettings,
    deletedContacts: Contact[] = [],
  ) => {
    let contactsChanged = false;
    let settingsChanged = false;
    const updatedContacts = [...sourceContacts];
    const settings: AppSettings = {
      ...sourceSettings,
      reminderEmailTemplate: normalizeReminderEmailTemplate(sourceSettings.reminderEmailTemplate),
      reminderTaskTemplate: normalizeReminderTaskTemplate(sourceSettings.reminderTaskTemplate),
      reminderTaskListId: sourceSettings.reminderTaskListId || '',
    };

    const clearTaskForContact = async (contact: Contact) => {
      if (contact.reminderTaskId || contact.reminderTaskListId) {
        await deleteGoogleReminderTask(token, contact.reminderTaskListId || settings.reminderTaskListId, contact.reminderTaskId);
      }
    };

    for (const deletedContact of deletedContacts) {
      await clearTaskForContact(deletedContact);
    }

    if (!settings.reminderTasksEnabled) {
      for (let i = 0; i < updatedContacts.length; i++) {
        const contact = updatedContacts[i];
        if (!hasStoredReminderTask(contact)) continue;
        await clearTaskForContact(contact);
        updatedContacts[i] = clearReminderTaskFields(contact);
        contactsChanged = true;
      }

      return { contacts: updatedContacts, settings, contactsChanged, settingsChanged };
    }

    const taskListId = await getOrCreateRoldexTaskList(token, settings.reminderTaskListId);
    if (settings.reminderTaskListId !== taskListId) {
      settings.reminderTaskListId = taskListId;
      settingsChanged = true;
    }

    for (let i = 0; i < updatedContacts.length; i++) {
      let contact = updatedContacts[i];
      const dueDate = getContactReminderDueDate(contact);

      if (!dueDate) {
        if (hasStoredReminderTask(contact)) {
          await clearTaskForContact(contact);
          updatedContacts[i] = clearReminderTaskFields(contact);
          contactsChanged = true;
        }
        continue;
      }

      if (contact.reminderTaskId && contact.reminderTaskListId && contact.reminderTaskListId !== taskListId) {
        await deleteGoogleReminderTask(token, contact.reminderTaskListId, contact.reminderTaskId);
        contact = clearReminderTaskFields(contact);
      }

      const payload = getReminderTaskPayload(contact, dueDate, settings.reminderTaskTemplate);
      const shouldReopenTask = Boolean(contact.reminderTaskDueDate && contact.reminderTaskDueDate !== payload.due);
      let syncedTask;

      if (contact.reminderTaskId) {
        try {
          syncedTask = await patchGoogleReminderTask(token, taskListId, contact.reminderTaskId, {
            ...payload,
            ...(shouldReopenTask ? { status: 'needsAction' } : {}),
          });
        } catch (err) {
          if (!(err instanceof GoogleTaskNotFoundError)) throw err;
          syncedTask = await createGoogleReminderTask(token, taskListId, {
            ...payload,
            status: 'needsAction',
          });
        }
      } else {
        syncedTask = await createGoogleReminderTask(token, taskListId, {
          ...payload,
          status: 'needsAction',
        });
      }

      const nextContact = {
        ...contact,
        reminderTaskId: syncedTask.id,
        reminderTaskListId: taskListId,
        reminderTaskDueDate: payload.due,
        reminderTaskWebViewLink: syncedTask.webViewLink || contact.reminderTaskWebViewLink || '',
      };

      if (
        nextContact.reminderTaskId !== updatedContacts[i].reminderTaskId
        || nextContact.reminderTaskListId !== updatedContacts[i].reminderTaskListId
        || nextContact.reminderTaskDueDate !== updatedContacts[i].reminderTaskDueDate
        || nextContact.reminderTaskWebViewLink !== updatedContacts[i].reminderTaskWebViewLink
      ) {
        updatedContacts[i] = nextContact;
        contactsChanged = true;
      }
    }

    return { contacts: updatedContacts, settings, contactsChanged, settingsChanged };
  };

  const processReminders = async (
    token: string,
    currentContacts: Contact[],
    sid: string,
    userEmail?: string,
    template: ReminderEmailTemplate = DEFAULT_REMINDER_EMAIL_TEMPLATE,
    settings: AppSettings = getCurrentAppSettings(),
  ) => {
    if (!userEmail) return;
    let needsSave = false;
    const now = getToday();
    const sentAt = new Date();
    
    const updatedContacts = [...currentContacts];

    for (let i = 0; i < updatedContacts.length; i++) {
      const contact = updatedContacts[i];
      const eventDueDate = getEventReminderDueDate(contact);

      if (eventDueDate && differenceInDays(now, eventDueDate) >= 0) {
        try {
          await sendReminderEmail(token, userEmail, contact.name, template, {
            lastContactDate: contact.lastContactDate,
            daysSinceContact: getDaysSinceLastContact(contact),
            reminderIntervalDays: contact.reminderIntervalDays,
            dueDate: eventDueDate.toISOString(),
            reason: contact.oneTimeReminderReason,
          });
          updatedContacts[i] = {
            ...contact,
            lastReminderSentDate: sentAt.toISOString(),
            oneTimeReminderDate: '',
            oneTimeReminderCreatedDate: '',
            oneTimeReminderReason: '',
          };
          needsSave = true;
          continue;
        } catch (e) {
          console.error('Error sending event reminder for', contact.name, e);
        }
      }

      const recurringDueDate = getRecurringReminderDueDate(updatedContacts[i]);
      if (!recurringDueDate || differenceInDays(now, recurringDueDate) < 0) continue;

      let shouldSend = false;
      if (!updatedContacts[i].lastReminderSentDate) {
        shouldSend = true;
      } else {
        const lastReminder = parseContactDate(updatedContacts[i].lastReminderSentDate);
        if (!lastReminder || differenceInDays(now, lastReminder) >= 1) {
          shouldSend = true;
        }
      }

      if (shouldSend) {
        try {
          await sendReminderEmail(token, userEmail, updatedContacts[i].name, template, {
            lastContactDate: updatedContacts[i].lastContactDate,
            daysSinceContact: getDaysSinceLastContact(updatedContacts[i]),
            reminderIntervalDays: updatedContacts[i].reminderIntervalDays,
            dueDate: recurringDueDate.toISOString(),
            reason: '',
          });
          updatedContacts[i] = { ...updatedContacts[i], lastReminderSentDate: sentAt.toISOString() };
          needsSave = true;
        } catch (e) {
          console.error('Error sending reminder for', updatedContacts[i].name, e);
        }
      }
    }

    if (needsSave) {
      let contactsToSave = updatedContacts;
      try {
        const taskSyncResult = await syncGoogleReminderTasks(token, contactsToSave, settings);
        contactsToSave = taskSyncResult.contacts;
        if (taskSyncResult.settingsChanged) {
          setReminderTaskListId(taskSyncResult.settings.reminderTaskListId || '');
          await saveAppSettings(token, sid, taskSyncResult.settings);
        }
      } catch (err) {
        console.warn('Failed to sync Google Tasks after reminders:', err);
      }

      setContacts(contactsToSave);
      await saveContacts(token, sid, contactsToSave);
    }
  };

  const triggerGoalCelebration = (contactName: string) => {
    if (celebrationTimeoutRef.current) {
      window.clearTimeout(celebrationTimeoutRef.current);
    }

    setGoalCelebration({
      id: Date.now(),
      contactName,
    });

    celebrationTimeoutRef.current = window.setTimeout(() => {
      setGoalCelebration(null);
      celebrationTimeoutRef.current = null;
    }, 2800);
  };

  const handleSaveContact = async (contact: Contact) => {
    if (!spreadsheetId) {
      alert("Error: Spreadsheet not connected. Please refresh or check your Google Sheets API setup.");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      alert("Error: Missing access token. Please sign out and sign back in.");
      return;
    }

    setLoading(true);
    try {
      const normalizedContact = normalizeContactActivity(contact);
      const isExisting = contacts.some(c => c.id === normalizedContact.id);
      const previousContact = contacts.find(c => c.id === normalizedContact.id);
      const didLogInteraction = Boolean(
        previousContact
        && (normalizedContact.history?.length || 0) > (previousContact.history?.length || 0),
      );
      const metContactGoal = Boolean(previousContact && didLogInteraction && hasContactReminder(previousContact));
      let newContacts = [];
      if (isExisting) {
        newContacts = contacts.map(c => c.id === normalizedContact.id ? normalizedContact : c);
      } else {
        newContacts = [...contacts, normalizedContact];
      }
      newContacts = normalizeContactsActivity(newContacts);
      let currentSettings = getCurrentAppSettings();

      try {
        const taskSyncResult = await syncGoogleReminderTasks(token, newContacts, currentSettings);
        newContacts = taskSyncResult.contacts;
        currentSettings = taskSyncResult.settings;
        if (taskSyncResult.settingsChanged) {
          setReminderTaskListId(taskSyncResult.settings.reminderTaskListId || '');
          await saveAppSettings(token, spreadsheetId, taskSyncResult.settings);
        }
      } catch (err: any) {
        console.error('Failed to sync Google Tasks reminder:', err);
        if (reminderTasksEnabled || contact.reminderTaskId) {
          alert(`Contact saved, but Google Tasks sync failed. If you just enabled tasks, sign out and back in so Google grants the new Tasks permission. Error: ${err.message || String(err)}`);
        }
      }
      
      await saveContacts(token, spreadsheetId, newContacts);
      setContacts(newContacts);
      setIsModalOpen(false);
      setSelectedContact(null);
      if (metContactGoal) {
        triggerGoalCelebration(normalizedContact.name);
      }
      processReminders(token, newContacts, spreadsheetId, user?.email || undefined, currentSettings.reminderEmailTemplate, currentSettings);
    } catch (err) {
      console.error('Failed to save contact:', err);
      alert('Failed to save contact. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!spreadsheetId) {
      alert("Error: Spreadsheet not connected.");
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      alert("Error: Missing access token.");
      return;
    }

    setLoading(true);
    try {
      const contactToDelete = contacts.find(c => c.id === id);
      const newContacts = contacts.filter(c => c.id !== id);
      let contactsToSave = newContacts;
      try {
        const taskSyncResult = await syncGoogleReminderTasks(
          token,
          newContacts,
          getCurrentAppSettings(),
          contactToDelete ? [contactToDelete] : [],
        );
        contactsToSave = taskSyncResult.contacts;
        if (taskSyncResult.settingsChanged) {
          setReminderTaskListId(taskSyncResult.settings.reminderTaskListId || '');
          await saveAppSettings(token, spreadsheetId, taskSyncResult.settings);
        }
      } catch (err) {
        console.error('Failed to remove Google reminder task for deleted contact:', err);
      }
      await saveContacts(token, spreadsheetId, contactsToSave);
      setContacts(contactsToSave);
      setIsModalOpen(false);
      setSelectedContact(null);
    } catch (err) {
      console.error('Failed to delete contact:', err);
      alert('Failed to delete contact. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogInteraction = async (contact: Contact) => {
    openContactModal(contact, 'history');
  };

  const runDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    const lines: string[] = [];
    const add = (label: string, value: unknown) => {
      lines.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    };

    try {
      add('Time', new Date().toISOString());
      add('Signed in', Boolean(user));
      add('User email', user?.email || 'missing');
      add('User ID', user?.uid || 'missing');
      add('App spreadsheet ID', spreadsheetId || 'missing');
      add('Cached spreadsheet ID', getSpreadsheetId(user?.uid) || 'missing');
      add('Visible contacts', contacts.length);

      const token = await getAccessToken();
      add('Access token available', Boolean(token));

      if (!token) {
        setDiagnostics(lines.join('\n'));
        return;
      }

      try {
        const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`);
        const tokenInfo = await tokenInfoRes.json();
        add('Token info status', tokenInfoRes.status);
        add('Token scopes', tokenInfo.scope || tokenInfo.error_description || tokenInfo.error || 'missing');
        add('Gmail send scope present', Boolean(tokenInfo.scope?.includes('https://www.googleapis.com/auth/gmail.send')));
        add('Google Tasks scope present', Boolean(tokenInfo.scope?.includes('https://www.googleapis.com/auth/tasks')));
      } catch (err: any) {
        add('Token info error', err.message || String(err));
      }

      try {
        const candidates = await findSpreadsheetCandidates(token);
        add('Drive candidates', candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          modifiedTime: candidate.modifiedTime,
          contactCount: candidate.contactCount,
          error: candidate.error,
        })));

        const foundId = await findExistingSpreadsheet(token);
        add('Drive search spreadsheet ID', foundId || 'missing');

        if (foundId) {
          const foundContacts = await getContacts(token, foundId);
          add('Drive search contact count', foundContacts.length);
        }
      } catch (err: any) {
        add('Drive search error', err.message || String(err));
      }

      if (spreadsheetId) {
        try {
          const activeContacts = await getContacts(token, spreadsheetId);
          add('Active spreadsheet contact count', activeContacts.length);
        } catch (err: any) {
          add('Active spreadsheet error', err.message || String(err));
        }
      }
    } finally {
      setDiagnostics(lines.join('\n'));
      setIsRunningDiagnostics(false);
    }
  };

  const saveReminderEmailTemplate = async () => {
    if (!spreadsheetId) {
      setEmailSettingsMessage('Spreadsheet is not connected yet.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setEmailSettingsMessage('Missing Google access token. Sign out and back in to save.');
      return;
    }

    const normalizedTemplate = normalizeReminderEmailTemplate(reminderEmailTemplate);
    setIsSavingEmailTemplate(true);
    setEmailSettingsMessage('');

    try {
      const nextSettings = {
        ...getCurrentAppSettings(),
        reminderEmailTemplate: normalizedTemplate,
      };
      await saveAppSettings(token, spreadsheetId, {
        ...nextSettings,
      });
      setReminderEmailTemplate(normalizedTemplate);
      setEmailSettingsMessage('Reminder email saved.');
    } catch (err: any) {
      console.error('Failed to save reminder email template:', err);
      setEmailSettingsMessage(err.message || 'Failed to save reminder email.');
    } finally {
      setIsSavingEmailTemplate(false);
    }
  };

  const sendTestReminderEmail = async () => {
    if (!user?.email) {
      setEmailSettingsMessage('Your Google account email is missing.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setEmailSettingsMessage('Missing Google access token. Sign out and back in to test.');
      return;
    }

    const lastContactDate = addDays(new Date(), -3).toISOString();
    const dueDate = addDays(new Date(), 2).toISOString();
    setIsSendingTestReminder(true);
    setEmailSettingsMessage('');

    try {
      await sendReminderEmail(token, user.email, 'Test Contact', normalizeReminderEmailTemplate(reminderEmailTemplate), {
        lastContactDate,
        daysSinceContact: 3,
        reminderIntervalDays: 5,
        dueDate,
        reason: 'Follow up about job interview',
      });
      setEmailSettingsMessage(`Test reminder sent to ${user.email}.`);
    } catch (err: any) {
      console.error('Failed to send test reminder email:', err);
      setEmailSettingsMessage(err.message || 'Failed to send test reminder.');
    } finally {
      setIsSendingTestReminder(false);
    }
  };

  const saveReminderTaskSettings = async () => {
    if (!spreadsheetId) {
      setTaskSettingsMessage('Spreadsheet is not connected yet.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setTaskSettingsMessage('Missing Google access token. Sign out and back in to save.');
      return;
    }

    const normalizedTemplate = normalizeReminderTaskTemplate(reminderTaskTemplate);
    let nextSettings: AppSettings = {
      ...getCurrentAppSettings(),
      reminderTasksEnabled,
      reminderTaskTemplate: normalizedTemplate,
    };
    let contactsToSave = contacts;
    let contactsChanged = false;
    let syncError: unknown = null;

    setIsSavingTaskSettings(true);
    setTaskSettingsMessage('');

    try {
      try {
        const taskSyncResult = await syncGoogleReminderTasks(token, contacts, nextSettings);
        nextSettings = taskSyncResult.settings;
        contactsToSave = taskSyncResult.contacts;
        contactsChanged = taskSyncResult.contactsChanged;
      } catch (err) {
        syncError = err;
        console.error('Failed to sync Google Tasks while saving settings:', err);
      }

      await saveAppSettings(token, spreadsheetId, nextSettings);
      if (contactsChanged) {
        await saveContacts(token, spreadsheetId, contactsToSave);
        setContacts(contactsToSave);
      }

      setReminderTasksEnabled(nextSettings.reminderTasksEnabled);
      setReminderTaskTemplate(nextSettings.reminderTaskTemplate);
      setReminderTaskListId(nextSettings.reminderTaskListId || '');

      if (syncError) {
        const message = syncError instanceof Error ? syncError.message : String(syncError);
        setTaskSettingsMessage(`Task settings saved, but Google Tasks sync failed. Sign out and back in if this is the first time enabling tasks. ${message}`);
      } else {
        setTaskSettingsMessage(nextSettings.reminderTasksEnabled
          ? 'Google Tasks reminders saved and synced.'
          : 'Google Tasks reminders turned off.');
      }
    } catch (err: any) {
      console.error('Failed to save Google Tasks settings:', err);
      setTaskSettingsMessage(err.message || 'Failed to save Google Tasks settings.');
    } finally {
      setIsSavingTaskSettings(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#fbfaf5] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8e8a75]" />
      </div>
    );
  }

  if (needsAuth) {
    return <AuthScreen onLogin={handleLogin} isLoggingIn={isLoggingIn} />;
  }

  const searchedContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.notes.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.interests.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.categories && c.categories.some(cat => cat.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  let filteredContacts = [...searchedContacts];

  if (contactSortBy === 'categories' && selectedCategory) {
    filteredContacts = filteredContacts.filter(c => c.categories && c.categories.includes(selectedCategory));
  }

  filteredContacts.sort((a, b) => {
    if (contactSortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else if (contactSortBy === 'recent') {
      const dateA = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
      const dateB = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
      return dateB - dateA; // Descending
    }
    return 0;
  });

  const goalContacts = searchedContacts.filter(hasContactReminder);

  const overdueCount = contacts.filter(c => getContactReminderOverdueDays(c) >= 0).length;

  const allCategories = Array.from(new Set(contacts.flatMap(c => c.categories || []))).sort();
  const reminderEmailPreview = renderReminderEmailTemplate(reminderEmailTemplate, {
    contactName: 'Test Contact',
    lastContactDate: addDays(new Date(), -3).toISOString(),
    daysSinceContact: 3,
    reminderIntervalDays: 5,
    dueDate: addDays(new Date(), 2).toISOString(),
    reason: 'Follow up about job interview',
  });
  const reminderTaskPreview = renderReminderTaskTemplate(reminderTaskTemplate, {
    contactName: 'Test Contact',
    lastContactDate: addDays(new Date(), -3).toISOString(),
    daysSinceContact: 3,
    reminderIntervalDays: 5,
    dueDate: addDays(new Date(), 2).toISOString(),
    reason: 'Follow up about job interview',
  });
  const primaryTabs = [
    { id: 'contacts', label: 'Contacts' },
    { id: 'goals', label: 'Goals' },
  ] as const;
  const contactSortTabs = [
    { id: 'name', label: 'A-Z' },
    { id: 'categories', label: 'Categories' },
    { id: 'recent', label: 'Recents' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#4a453e] font-sans flex flex-col h-screen overflow-hidden max-sm:h-[100dvh]">
      <header className="h-20 bg-[#fbfaf5]/80 backdrop-blur-md border-b border-[#f0eee0] shrink-0 z-20 sticky top-0 transition-all duration-300 max-sm:h-16">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between max-sm:px-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-serif italic text-[#5a5a40] tracking-tight max-sm:text-xl">Roldex</h1>
          </div>
          
          <div className="flex items-center gap-4 max-sm:gap-2">
            {loading && <Loader2 className="w-5 h-5 animate-spin text-[#8e8a75]" />}
            
            <motion.div 
              className="relative flex items-center group bg-[#f4f1e6] border border-[#e0dbc5] shadow-inner overflow-hidden max-sm:max-w-[46vw]"
              initial={false}
              animate={{
                width: (isSearchExpanded || searchTerm) ? 220 : 40,
                borderRadius: 9999
              }}
              onHoverStart={() => setIsSearchExpanded(true)}
              onHoverEnd={() => setIsSearchExpanded(false)}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Search className="absolute left-3 text-[#a8a38d] z-10 pointer-events-none transition-colors duration-300 group-hover:text-[#5a5a40]" size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setIsSearchExpanded(true)}
                onBlur={() => setIsSearchExpanded(false)}
                className="w-full h-10 bg-transparent py-1.5 pl-10 pr-4 text-sm outline-none placeholder-[#a8a38d] focus:bg-white transition-colors duration-300"
              />
            </motion.div>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-[#8e8a75] hover:text-[#5a5a40] transition-colors p-1"
              title="Settings"
            >
              <Settings size={20} />
            </button>
            {user?.photoURL && (
              <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-[#e0dbc5] max-sm:hidden" />
            )}
            <button
              onClick={logout}
              className="text-[#8e8a75] hover:text-[#5a5a40] transition-colors p-1"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 flex-1 w-full flex flex-col pt-8 pb-4 min-h-0 max-sm:px-3 max-sm:pt-4 max-sm:pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 shrink-0 max-sm:gap-3 max-sm:mb-3">
          <div className="flex-1 flex flex-col gap-2 max-sm:w-full">
            <motion.div 
              layout
              className="flex items-center bg-[#f4f1e6] rounded-full p-1 border border-[#e0dbc5] shadow-inner relative overflow-hidden inline-flex w-fit max-sm:w-full max-sm:justify-between"
              style={{ borderRadius: 9999 }}
            >
              {primaryTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-1.5 px-5 mx-0.5 text-xs font-bold uppercase tracking-wider rounded-full whitespace-nowrap block outline-none max-sm:flex-1 max-sm:px-3 max-sm:text-[11px] ${activeTab === tab.id ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#4a453e]'}`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="primaryTab"
                      className="absolute inset-0 bg-white shadow-sm rounded-full"
                      style={{ zIndex: 0 }}
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </motion.div>

            <AnimatePresence initial={false}>
              {activeTab === 'contacts' && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="flex items-center bg-[#f4f1e6] rounded-full p-1 border border-[#e0dbc5] shadow-inner relative overflow-hidden inline-flex w-fit max-sm:w-full max-sm:justify-between"
                  style={{ borderRadius: 9999 }}
                >
                  {contactSortTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setContactSortBy(tab.id)}
                      className={`relative py-1.5 px-4 mx-0.5 text-xs font-bold uppercase tracking-wider rounded-full whitespace-nowrap block outline-none max-sm:flex-1 max-sm:px-3 max-sm:text-[11px] ${contactSortBy === tab.id ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#4a453e]'}`}
                    >
                      {contactSortBy === tab.id && (
                        <motion.div
                          layoutId="contactSortTab"
                          className="absolute inset-0 bg-white shadow-sm rounded-full"
                          style={{ zIndex: 0 }}
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-3 max-sm:w-full">
            <motion.button
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              onClick={() => openContactModal(null, 'details')}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#5a5a40] hover:bg-[#4a4a34] text-[#fbfaf5] text-sm font-medium rounded-full shadow-md hover:shadow-lg transition-colors duration-300 whitespace-nowrap max-sm:w-full max-sm:py-2.5"
            >
              <Plus size={18} />
              New Connection
            </motion.button>
          </div>
        </div>

        {activeTab === 'contacts' && contactSortBy === 'categories' && allCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 shrink-0 max-sm:mb-3 max-sm:max-h-20 max-sm:overflow-y-auto custom-scrollbar">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase transition-all duration-300 hover:-translate-y-0.5 ${selectedCategory === null ? 'bg-[#5a5a40] text-white shadow-sm' : 'bg-transparent border border-[#e0dbc5] text-[#8e8a75] hover:bg-[#e8e4d3] hover:shadow-sm'}`}
            >
              All
            </button>
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase transition-all duration-300 hover:-translate-y-0.5 ${selectedCategory === cat ? 'bg-[#5a5a40] text-white shadow-sm' : 'bg-transparent border border-[#e0dbc5] text-[#8e8a75] hover:bg-[#e8e4d3] hover:shadow-sm'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          {contacts.length === 0 && !loading ? (
            <div className="text-center py-20 bg-[#f9f8f3] rounded-[32px] border border-dashed border-[#d0cdc1] flex flex-col items-center justify-center h-full max-sm:rounded-2xl max-sm:px-5 max-sm:py-10">
              <div className="w-16 h-16 bg-[#e8e4d3] rounded-full flex items-center justify-center mx-auto mb-4">
                <UserRound className="text-[#8e8a75]" size={32} />
              </div>
              <h3 className="text-xl font-serif text-[#4a453e] mb-2">Your circle is empty</h3>
              <p className="text-[#6d6858] text-sm mb-6 max-w-md mx-auto">
                Add the people you meet to build your personal relationship manager. Roldex will remind you to keep in touch.
              </p>
              <motion.button
                whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openContactModal(null, 'details')}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-[#e0dbc5] hover:bg-[#f4f1e6] text-[#4a453e] text-sm font-medium rounded-full shadow-sm hover:shadow-md transition-colors duration-300"
              >
                <Plus size={18} />
                Add First Connection
              </motion.button>
            </div>
          ) : showGraphView ? (
            <GraphView 
              contacts={contacts} 
              onNodeClick={(contact) => {
                openContactModal(contact, 'details');
                setShowGraphView(false);
              }}
            />
          ) : activeTab === 'goals' ? (
            <div className="h-full pb-6 max-sm:pb-3">
              <GoalsDashboard 
                contacts={goalContacts}
                onLogContact={(c) => openContactModal(c, 'history')} 
                onClick={(c) => openContactModal(c, 'details')} 
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 overflow-y-scroll pb-6 pt-1 px-2 -mx-2 h-full content-start custom-scrollbar max-sm:gap-2 max-sm:px-1 max-sm:-mx-1 max-sm:pb-4">
              {filteredContacts.map(contact => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onClick={() => openContactModal(contact, 'details')}
                  onLogContact={() => handleLogInteraction(contact)}
                />
              ))}
            </div>
          )}
        </div>
        
        {contacts.length > 0 && (
          <div className="shrink-0 pt-6 mt-auto max-sm:pt-3">
            <div className="flex items-center gap-6 max-sm:flex-wrap max-sm:gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-serif text-[#4a453e] max-sm:text-xl">{contacts.length}</span>
                <span className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Total Connections</span>
              </div>
              <div className="h-6 w-px bg-[#e0dbc5]"></div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-serif max-sm:text-xl ${overdueCount > 0 ? 'text-[#e67e5a]' : 'text-[#4a453e]'}`}>{overdueCount}</span>
                <span className={`text-[11px] uppercase tracking-wider font-bold ${overdueCount > 0 ? 'text-[#e67e5a]' : 'text-[#a8a38d]'}`}>Overdue Catch-ups</span>
              </div>
            </div>
          </div>
        )}
      </main>
      
      <ContactModal
        contact={selectedContact}
        initialTab={modalInitialTab}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
        allContacts={contacts}
      />

      <AnimatePresence>
        {goalCelebration && (
          <motion.div
            key={goalCelebration.id}
            initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.96 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 18, x: '-50%', scale: 0.98 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="pointer-events-none fixed bottom-8 left-1/2 z-[60] max-sm:bottom-4 max-sm:w-[calc(100%-2rem)]"
          >
            <div className="relative overflow-hidden rounded-full border border-[#d4dcc6] bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md max-sm:rounded-2xl">
              <motion.div
                className="absolute inset-0 rounded-full border border-[#9eb391]/40"
                initial={{ scale: 0.9, opacity: 0.35 }}
                animate={{ scale: 1.18, opacity: 0 }}
                transition={{ duration: 1.2, repeat: 1, ease: 'easeOut' }}
              />
              <div className="relative flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0.7, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e4eee0] text-[#536b4d] shadow-sm"
                >
                  <CheckCircle2 size={21} strokeWidth={2.4} />
                </motion.div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-[#4a453e]">Contact Logged!</p>
                    <Sparkles size={13} className="text-[#8e8a75]" />
                  </div>
                  <p className="truncate text-xs text-[#8e8a75]">
                    Goal reset for {goalCelebration.contactName}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md max-sm:p-2">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-[#fbfaf5] rounded-[24px] shadow-2xl w-full max-w-xl overflow-hidden border border-[#e0dbc5] p-6 relative max-h-[90vh] flex flex-col max-sm:max-h-[96dvh] max-sm:p-4"
            >
              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="absolute top-4 right-4 text-[#8e8a75] hover:text-[#4a453e] p-1 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              
              <h2 className="text-2xl font-serif text-[#4a453e] mb-6 shrink-0 max-sm:mb-4 max-sm:text-xl">Settings</h2>
              
              <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1 -mr-1 max-sm:space-y-3">
                <button
                  onClick={() => {
                    setIsSettingsOpen(false);
                    setShowGraphView(true);
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-white hover:bg-[#f4f1e6] border border-[#e0dbc5] rounded-xl transition-colors text-left"
                >
                  <Network className="text-[#5a5a40]" size={20} />
                  <div>
                    <div className="font-bold text-[#4a453e] text-sm uppercase tracking-wide">View Network Graph</div>
                    <div className="text-xs text-[#8e8a75] mt-0.5">Visualize your connections</div>
                  </div>
                </button>
                
                {showGraphView && (
                  <button
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setShowGraphView(false);
                    }}
                    className="w-full flex items-center gap-3 p-4 bg-white hover:bg-[#f4f1e6] border border-[#e0dbc5] rounded-xl transition-colors text-left"
                  >
                    <LayoutGrid className="text-[#5a5a40]" size={20} />
                    <div>
                      <div className="font-bold text-[#4a453e] text-sm uppercase tracking-wide">View List Layout</div>
                      <div className="text-xs text-[#8e8a75] mt-0.5">Return to standard view</div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsEmailSettingsOpen(!isEmailSettingsOpen);
                    setEmailSettingsMessage('');
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-white hover:bg-[#f4f1e6] border border-[#e0dbc5] rounded-xl transition-colors text-left"
                >
                  <Mail className="text-[#5a5a40]" size={20} />
                  <div>
                    <div className="font-bold text-[#4a453e] text-sm uppercase tracking-wide">Reminder Emails</div>
                    <div className="text-xs text-[#8e8a75] mt-0.5">Edit the message and send a test</div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isEmailSettingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 rounded-xl border border-[#e0dbc5] bg-white p-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Subject</label>
                          <input
                            type="text"
                            value={reminderEmailTemplate.subject}
                            onChange={(e) => setReminderEmailTemplate({ ...reminderEmailTemplate, subject: e.target.value })}
                            className="w-full px-3 py-2 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all outline-none text-sm text-[#4a453e]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Body</label>
                          <textarea
                            value={reminderEmailTemplate.body}
                            onChange={(e) => setReminderEmailTemplate({ ...reminderEmailTemplate, body: e.target.value })}
                            rows={5}
                            className="w-full px-3 py-2 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all outline-none text-sm text-[#4a453e] resize-y min-h-28"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {['{name}', '{daysSinceContact}', '{dueDate}', '{lastContactDate}', '{reason}'].map((token) => (
                            <button
                              key={token}
                              type="button"
                              onClick={() => setReminderEmailTemplate({
                                ...reminderEmailTemplate,
                                body: `${reminderEmailTemplate.body}${reminderEmailTemplate.body.endsWith(' ') || reminderEmailTemplate.body.endsWith('\n') ? '' : ' '}${token}`,
                              })}
                              className="rounded-full border border-[#e0dbc5] bg-[#fbfaf5] px-2.5 py-1 text-[11px] font-medium text-[#6d6858] hover:bg-[#f4f1e6] transition-colors"
                            >
                              {token}
                            </button>
                          ))}
                        </div>

                        {emailSettingsMessage && (
                          <p className="rounded-xl bg-[#f4f1e6] px-3 py-2 text-xs text-[#6d6858]">{emailSettingsMessage}</p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReminderEmailTemplate(DEFAULT_REMINDER_EMAIL_TEMPLATE);
                              setEmailSettingsMessage('Default reminder restored. Save to keep it.');
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#6d6858] hover:bg-[#f4f1e6] rounded-full transition-colors"
                          >
                            <RotateCcw size={14} /> Reset
                          </button>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={sendTestReminderEmail}
                              disabled={isSendingTestReminder || isSavingEmailTemplate}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-[#e0dbc5] bg-white text-xs font-bold uppercase tracking-wider text-[#5a5a40] hover:bg-[#f4f1e6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                              {isSendingTestReminder ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                              Test
                            </button>
                            <button
                              type="button"
                              onClick={saveReminderEmailTemplate}
                              disabled={isSavingEmailTemplate || isSendingTestReminder}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#5a5a40] text-[#fbfaf5] text-xs font-bold uppercase tracking-wider hover:bg-[#4a4a34] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                              {isSavingEmailTemplate ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                              Save
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-[#e0dbc5] bg-[#fbfaf5] p-3">
                          <div className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d] mb-2">Preview</div>
                          <div className="text-sm font-semibold text-[#4a453e] break-words">{reminderEmailPreview.subject}</div>
                          <div className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[#6d6858] break-words custom-scrollbar">{reminderEmailPreview.body}</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => {
                    setIsTaskSettingsOpen(!isTaskSettingsOpen);
                    setTaskSettingsMessage('');
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-white hover:bg-[#f4f1e6] border border-[#e0dbc5] rounded-xl transition-colors text-left"
                >
                  <ListTodo className="text-[#5a5a40]" size={20} />
                  <div className="flex-1">
                    <div className="font-bold text-[#4a453e] text-sm uppercase tracking-wide">Google Tasks</div>
                    <div className="text-xs text-[#8e8a75] mt-0.5">Create tasks for due contact reminders</div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${reminderTasksEnabled ? 'text-[#5a5a40]' : 'text-[#a8a38d]'}`}>
                    {reminderTasksEnabled ? 'On' : 'Off'}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isTaskSettingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 rounded-xl border border-[#e0dbc5] bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Create Google Tasks</div>
                            <div className="text-xs text-[#8e8a75] mt-0.5">Uses a Roldex list in Google Tasks.</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReminderTasksEnabled(!reminderTasksEnabled)}
                            className={`relative h-7 w-12 rounded-full border transition-colors ${reminderTasksEnabled ? 'bg-[#5a5a40] border-[#5a5a40]' : 'bg-[#f4f1e6] border-[#e0dbc5]'}`}
                            aria-pressed={reminderTasksEnabled}
                          >
                            <motion.span
                              className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm"
                              animate={{ left: reminderTasksEnabled ? 22 : 4 }}
                              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                            />
                          </button>
                        </div>

                        <div className={`space-y-4 ${reminderTasksEnabled ? '' : 'opacity-60'}`}>
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Title</label>
                            <input
                              type="text"
                              value={reminderTaskTemplate.title}
                              onChange={(e) => setReminderTaskTemplate({ ...reminderTaskTemplate, title: e.target.value })}
                              disabled={!reminderTasksEnabled}
                              className="w-full px-3 py-2 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all outline-none text-sm text-[#4a453e] disabled:cursor-not-allowed"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Details</label>
                            <textarea
                              value={reminderTaskTemplate.notes}
                              onChange={(e) => setReminderTaskTemplate({ ...reminderTaskTemplate, notes: e.target.value })}
                              disabled={!reminderTasksEnabled}
                              rows={4}
                              className="w-full px-3 py-2 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all outline-none text-sm text-[#4a453e] resize-y min-h-24 disabled:cursor-not-allowed"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {['{name}', '{dueDate}', '{lastContactDate}', '{daysSinceContact}', '{reason}'].map((token) => (
                              <button
                                key={token}
                                type="button"
                                disabled={!reminderTasksEnabled}
                                onClick={() => setReminderTaskTemplate({
                                  ...reminderTaskTemplate,
                                  notes: `${reminderTaskTemplate.notes}${reminderTaskTemplate.notes.endsWith(' ') || reminderTaskTemplate.notes.endsWith('\n') ? '' : ' '}${token}`,
                                })}
                                className="rounded-full border border-[#e0dbc5] bg-[#fbfaf5] px-2.5 py-1 text-[11px] font-medium text-[#6d6858] hover:bg-[#f4f1e6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                              >
                                {token}
                              </button>
                            ))}
                          </div>
                        </div>

                        {taskSettingsMessage && (
                          <p className="rounded-xl bg-[#f4f1e6] px-3 py-2 text-xs text-[#6d6858]">{taskSettingsMessage}</p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReminderTaskTemplate(DEFAULT_REMINDER_TASK_TEMPLATE);
                              setTaskSettingsMessage('Default Google Task text restored. Save to keep it.');
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#6d6858] hover:bg-[#f4f1e6] rounded-full transition-colors"
                          >
                            <RotateCcw size={14} /> Reset
                          </button>

                          <button
                            type="button"
                            onClick={saveReminderTaskSettings}
                            disabled={isSavingTaskSettings}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#5a5a40] text-[#fbfaf5] text-xs font-bold uppercase tracking-wider hover:bg-[#4a4a34] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          >
                            {isSavingTaskSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Save
                          </button>
                        </div>

                        <div className="rounded-xl border border-[#e0dbc5] bg-[#fbfaf5] p-3">
                          <div className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d] mb-2">Preview</div>
                          <div className="text-sm font-semibold text-[#4a453e] break-words">{reminderTaskPreview.title}</div>
                          <div className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[#6d6858] break-words custom-scrollbar">{reminderTaskPreview.notes}</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={runDiagnostics}
                  disabled={isRunningDiagnostics}
                  className="w-full flex items-center gap-3 p-4 bg-white hover:bg-[#f4f1e6] border border-[#e0dbc5] rounded-xl transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isRunningDiagnostics ? <Loader2 className="text-[#5a5a40] animate-spin" size={20} /> : <Bug className="text-[#5a5a40]" size={20} />}
                  <div>
                    <div className="font-bold text-[#4a453e] text-sm uppercase tracking-wide">Run Sync Diagnostics</div>
                    <div className="text-xs text-[#8e8a75] mt-0.5">Check Google access and storage</div>
                  </div>
                </button>

                {diagnostics && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wide text-[#8e8a75]">Diagnostics</div>
                      <button
                        onClick={() => navigator.clipboard.writeText(diagnostics)}
                        className="text-[#8e8a75] hover:text-[#4a453e] p-1 rounded-full transition-colors"
                        title="Copy diagnostics"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[#e0dbc5] bg-white p-3 text-[11px] leading-relaxed text-[#4a453e]">
                      {diagnostics}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
