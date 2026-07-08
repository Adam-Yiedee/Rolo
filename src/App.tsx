import React, { useState, useEffect } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ContactCard } from './components/ContactCard';
import { ContactModal } from './components/ContactModal';
import { GraphView } from './components/GraphView';
import { initAuth, googleSignIn, logout, getAccessToken } from './lib/auth';
import { User } from 'firebase/auth';
import { Contact, getSpreadsheetId, createSpreadsheet, getContacts, saveContacts } from './lib/sheets';
import { sendReminderEmail } from './lib/gmail';
import { differenceInDays, parseISO } from 'date-fns';
import { LogOut, Plus, Search, Loader2, UserRound, LayoutGrid, Network } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [user, setUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'goals'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'graph'>('grid');
  
  const [spreadsheetId, setAppSpreadsheetId] = useState<string | null>(getSpreadsheetId());
  
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setUser(user);
        setNeedsAuth(false);
        setIsInitializing(false);
        loadData(token);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
        setIsInitializing(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        await loadData(result.accessToken);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loadData = async (token: string) => {
    setLoading(true);
    try {
      let currentSpreadsheetId = spreadsheetId;
      if (!currentSpreadsheetId) {
        currentSpreadsheetId = await createSpreadsheet(token);
        setAppSpreadsheetId(currentSpreadsheetId);
      }
      
      const loadedContacts = await getContacts(token, currentSpreadsheetId);
      setContacts(loadedContacts);
      
      // Process reminders in the background
      processReminders(token, loadedContacts, currentSpreadsheetId);
    } catch (err) {
      console.error('Failed to load data:', err);
      // If we failed, maybe spreadsheet was deleted, clear it to recreate next time
      localStorage.removeItem('rolodex_spreadsheet_id');
      setAppSpreadsheetId(null);
    } finally {
      setLoading(false);
    }
  };

  const processReminders = async (token: string, currentContacts: Contact[], sid: string) => {
    if (!user?.email) return;
    let needsSave = false;
    const now = new Date();
    
    const updatedContacts = [...currentContacts];

    for (let i = 0; i < updatedContacts.length; i++) {
      const contact = updatedContacts[i];
      if (!contact.lastContactDate || !contact.reminderIntervalDays) continue;
      
      const lastContact = parseISO(contact.lastContactDate);
      const daysSinceContact = differenceInDays(now, lastContact);
      
      if (daysSinceContact >= contact.reminderIntervalDays) {
        let shouldSend = false;
        
        if (!contact.lastReminderSentDate) {
          shouldSend = true;
        } else {
          const lastReminder = parseISO(contact.lastReminderSentDate);
          const daysSinceReminder = differenceInDays(now, lastReminder);
          // Only send reminder once a day if overdue
          if (daysSinceReminder >= 1) {
            shouldSend = true;
          }
        }

        if (shouldSend) {
          try {
            await sendReminderEmail(token, user.email, contact.name);
            updatedContacts[i] = { ...contact, lastReminderSentDate: now.toISOString() };
            needsSave = true;
          } catch (e) {
            console.error('Error sending reminder for', contact.name, e);
          }
        }
      }
    }

    if (needsSave) {
      setContacts(updatedContacts);
      await saveContacts(token, sid, updatedContacts);
    }
  };

  const handleSaveContact = async (contact: Contact) => {
    if (!spreadsheetId) return;
    const token = await getAccessToken();
    if (!token) return;

    setLoading(true);
    try {
      const isExisting = contacts.some(c => c.id === contact.id);
      let newContacts = [];
      if (isExisting) {
        newContacts = contacts.map(c => c.id === contact.id ? contact : c);
      } else {
        newContacts = [...contacts, contact];
      }
      
      await saveContacts(token, spreadsheetId, newContacts);
      setContacts(newContacts);
      setIsModalOpen(false);
      setSelectedContact(null);
    } catch (err) {
      console.error('Failed to save contact:', err);
      alert('Failed to save contact. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!spreadsheetId) return;
    const token = await getAccessToken();
    if (!token) return;

    setLoading(true);
    try {
      const newContacts = contacts.filter(c => c.id !== id);
      await saveContacts(token, spreadsheetId, newContacts);
      setContacts(newContacts);
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
    if (!spreadsheetId) return;
    
    const note = window.prompt(`Log interaction with ${contact.name}:\n(Optional) Add a note for this interaction:`);
    if (note === null) return; // User cancelled the prompt
    
    const token = await getAccessToken();
    if (!token) return;
    
    // Optimistic update
    const newHistory = [
      { id: crypto.randomUUID(), date: new Date().toISOString(), notes: note },
      ...(contact.history || [])
    ];
    
    const updatedContact = { 
      ...contact, 
      lastContactDate: new Date().toISOString(),
      history: newHistory
    };
    
    const newContacts = contacts.map(c => c.id === contact.id ? updatedContact : c);
    setContacts(newContacts);
    
    try {
      await saveContacts(token, spreadsheetId, newContacts);
    } catch (err) {
      console.error('Failed to log interaction:', err);
      setContacts(contacts); // Revert
      alert('Failed to log interaction. Please try again.');
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

  let filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.notes.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.interests.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.categories && c.categories.some(cat => cat.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  if (selectedCategory) {
    filteredContacts = filteredContacts.filter(c => c.categories && c.categories.includes(selectedCategory));
  }

  if (sortBy === 'goals') {
    filteredContacts = filteredContacts.filter(c => c.reminderIntervalDays && c.reminderIntervalDays > 0);
  }

  filteredContacts.sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'recent') {
      const dateA = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
      const dateB = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
      return dateB - dateA; // Descending
    } else if (sortBy === 'goals') {
      const getOverdue = (c: Contact) => {
        if (!c.lastContactDate || !c.reminderIntervalDays) return -9999;
        return differenceInDays(new Date(), parseISO(c.lastContactDate)) - c.reminderIntervalDays;
      };
      return getOverdue(b) - getOverdue(a); // Descending overdue
    }
    return 0;
  });

  const overdueCount = contacts.filter(c => c.lastContactDate && c.reminderIntervalDays && differenceInDays(new Date(), parseISO(c.lastContactDate)) >= c.reminderIntervalDays).length;

  const allCategories = Array.from(new Set(contacts.flatMap(c => c.categories || []))).sort();

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#4a453e] font-sans flex flex-col h-screen overflow-hidden">
      <header className="h-20 bg-[#fbfaf5]/80 backdrop-blur-md border-b border-[#f0eee0] shrink-0 z-20 sticky top-0 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-serif italic text-[#5a5a40] tracking-tight">Rolodex</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {loading && <Loader2 className="w-5 h-5 animate-spin text-[#8e8a75]" />}
            {user?.photoURL && (
              <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-[#e0dbc5]" />
            )}
            <button
              onClick={logout}
              className="text-[#8e8a75] hover:text-[#5a5a40] transition-colors"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 flex-1 w-full flex flex-col pt-8 pb-4 min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 shrink-0">
          <div className="relative flex-1 max-w-md flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a38d]" size={18} />
              <input
                type="text"
                placeholder="Search connections, notes, interests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-2.5 bg-[#f4f1e6] border border-transparent rounded-full text-sm focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none shadow-inner focus:shadow-sm"
              />
            </div>
            {viewMode === 'grid' && (
              <div className="flex items-center bg-[#f4f1e6] rounded-full p-1 border border-[#e0dbc5] shadow-inner relative">
                {(['name', 'recent', 'goals'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSortBy(mode)}
                    className={`relative px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${sortBy === mode ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#4a453e]'}`}
                  >
                    {sortBy === mode && (
                      <motion.div
                        layoutId="sortTab"
                        className="absolute inset-0 bg-white shadow-sm rounded-full"
                        style={{ zIndex: 0 }}
                        transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
                      />
                    )}
                    <span className="relative z-10">{mode === 'name' ? 'A-Z' : mode === 'recent' ? 'Recent' : 'Goals'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-[#f4f1e6] rounded-full p-1 border border-[#e0dbc5] shadow-inner relative">
              <button
                onClick={() => setViewMode('grid')}
                className={`relative p-2 rounded-full transition-all duration-300 ${viewMode === 'grid' ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#4a453e]'}`}
                title="List View"
              >
                {viewMode === 'grid' && (
                  <motion.div
                    layoutId="viewTab"
                    className="absolute inset-0 bg-white shadow-sm rounded-full"
                    style={{ zIndex: 0 }}
                    transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
                  />
                )}
                <LayoutGrid size={18} strokeWidth={2} className="relative z-10" />
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`relative p-2 rounded-full transition-all duration-300 ${viewMode === 'graph' ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#4a453e]'}`}
                title="Graph View"
              >
                {viewMode === 'graph' && (
                  <motion.div
                    layoutId="viewTab"
                    className="absolute inset-0 bg-white shadow-sm rounded-full"
                    style={{ zIndex: 0 }}
                    transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
                  />
                )}
                <Network size={18} strokeWidth={2} className="relative z-10" />
              </button>
            </div>
            <button
              onClick={() => {
                setSelectedContact(null);
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#5a5a40] hover:bg-[#4a4a34] text-[#fbfaf5] text-sm font-medium rounded-full shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
            >
              <Plus size={18} />
              New Connection
            </button>
          </div>
        </div>

        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 shrink-0">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase transition-all duration-300 ${selectedCategory === null ? 'bg-[#5a5a40] text-white shadow-sm' : 'bg-transparent border border-[#e0dbc5] text-[#8e8a75] hover:bg-[#e8e4d3]'}`}
            >
              All
            </button>
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase transition-all duration-300 ${selectedCategory === cat ? 'bg-[#5a5a40] text-white shadow-sm' : 'bg-transparent border border-[#e0dbc5] text-[#8e8a75] hover:bg-[#e8e4d3]'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          {contacts.length === 0 && !loading ? (
            <div className="text-center py-20 bg-[#f9f8f3] rounded-[32px] border border-dashed border-[#d0cdc1] flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 bg-[#e8e4d3] rounded-full flex items-center justify-center mx-auto mb-4">
                <UserRound className="text-[#8e8a75]" size={32} />
              </div>
              <h3 className="text-xl font-serif text-[#4a453e] mb-2">Your circle is empty</h3>
              <p className="text-[#6d6858] text-sm mb-6 max-w-md mx-auto">
                Add the people you meet to build your personal relationship manager. Rolodex will remind you to keep in touch.
              </p>
              <button
                onClick={() => {
                  setSelectedContact(null);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-[#e0dbc5] hover:bg-[#f4f1e6] text-[#4a453e] text-sm font-medium rounded-full shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
              >
                <Plus size={18} />
                Add First Connection
              </button>
            </div>
          ) : viewMode === 'graph' ? (
            <GraphView 
              contacts={contacts} 
              onNodeClick={(contact) => {
                setSelectedContact(contact);
                setIsModalOpen(true);
              }}
            />
          ) : (
            <div className="flex flex-col gap-4 overflow-y-auto pb-6 h-full content-start pr-2 custom-scrollbar">
              {filteredContacts.map(contact => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onClick={() => {
                    setSelectedContact(contact);
                    setIsModalOpen(true);
                  }}
                  onLogContact={() => handleLogInteraction(contact)}
                />
              ))}
            </div>
          )}
        </div>
        
        {contacts.length > 0 && (
          <div className="shrink-0 pt-6 mt-auto">
            <div className="flex items-center gap-6">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-serif text-[#4a453e]">{contacts.length}</span>
                <span className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Total Connections</span>
              </div>
              <div className="h-6 w-px bg-[#e0dbc5]"></div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-serif ${overdueCount > 0 ? 'text-[#e67e5a]' : 'text-[#4a453e]'}`}>{overdueCount}</span>
                <span className={`text-[11px] uppercase tracking-wider font-bold ${overdueCount > 0 ? 'text-[#e67e5a]' : 'text-[#a8a38d]'}`}>Overdue Catch-ups</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="shrink-0 h-12 bg-[#5a5a40] text-[#fbfaf5] px-6 flex items-center justify-between text-[11px]">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div>&copy; 2024 Rolodex • Synchronized with Google Docs Storage</div>
          <div className="flex gap-6 uppercase tracking-widest font-bold">
            <span>{contacts.length} Connections</span>
          </div>
        </div>
      </footer>

      <ContactModal
        contact={selectedContact}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
        allContacts={contacts}
      />
    </div>
  );
}
