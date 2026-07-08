import React, { useState, useEffect } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ContactCard } from './components/ContactCard';
import { ContactModal } from './components/ContactModal';
import { GraphView } from './components/GraphView';
import { GoalsDashboard } from './components/GoalsDashboard';
import { initAuth, googleSignIn, logout, getAccessToken } from './lib/auth';
import { User } from 'firebase/auth';
import { Contact, getSpreadsheetId, createSpreadsheet, getContacts, saveContacts } from './lib/sheets';
import { sendReminderEmail } from './lib/gmail';
import { differenceInDays, parseISO } from 'date-fns';
import { LogOut, Plus, Search, Loader2, UserRound, LayoutGrid, Network, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [user, setUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'goals' | 'categories'>('name');
  const [isHoveringSort, setIsHoveringSort] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showGraphView, setShowGraphView] = useState(false);
  
  const [spreadsheetId, setAppSpreadsheetId] = useState<string | null>(getSpreadsheetId());
  
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<'details' | 'history'>('details');
  
  const [loading, setLoading] = useState(false);

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
    } catch (err: any) {
      console.error('Failed to load data:', err);
      alert(`Failed to load data from Google Sheets. Please ensure you have enabled the Google Sheets API in your Google Cloud Console. Error: ${err.message}`);
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
    openContactModal(contact, 'history');
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
            <h1 className="text-2xl font-serif italic text-[#5a5a40] tracking-tight">Roldex</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {loading && <Loader2 className="w-5 h-5 animate-spin text-[#8e8a75]" />}
            
            <motion.div 
              className="relative flex items-center group bg-[#f4f1e6] border border-[#e0dbc5] shadow-inner overflow-hidden"
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
              <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-[#e0dbc5]" />
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

      <main className="max-w-7xl mx-auto px-6 flex-1 w-full flex flex-col pt-8 pb-4 min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 shrink-0">
          <div className="flex-1 flex items-center gap-4">
            <motion.div 
              layout
              className="flex items-center bg-[#f4f1e6] rounded-full p-1 border border-[#e0dbc5] shadow-inner relative overflow-hidden inline-flex"
              onMouseEnter={() => setIsHoveringSort(true)}
              onMouseLeave={() => setIsHoveringSort(false)}
              style={{ borderRadius: 9999 }}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {(['name', 'recent', 'goals', 'categories'] as const).map(mode => {
                  if (!isHoveringSort && sortBy !== mode) return null;
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      key={mode}
                    >
                      <button
                        onClick={() => setSortBy(mode)}
                        className={`relative py-1.5 px-4 mx-0.5 text-xs font-bold uppercase tracking-wider rounded-full whitespace-nowrap block outline-none ${sortBy === mode ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#4a453e]'}`}
                      >
                        {sortBy === mode && (
                          <motion.div
                            layoutId="sortTab"
                            className="absolute inset-0 bg-white shadow-sm rounded-full"
                            style={{ zIndex: 0 }}
                            transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                          />
                        )}
                        <span className="relative z-10">
                          {mode === 'name' ? 'A-Z' : mode === 'recent' ? 'Recent' : mode === 'goals' ? 'Goals' : 'Categories'}
                        </span>
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              onClick={() => openContactModal(null, 'details')}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#5a5a40] hover:bg-[#4a4a34] text-[#fbfaf5] text-sm font-medium rounded-full shadow-md hover:shadow-lg transition-colors duration-300 whitespace-nowrap"
            >
              <Plus size={18} />
              New Connection
            </motion.button>
          </div>
        </div>

        {sortBy === 'categories' && allCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 shrink-0">
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
            <div className="text-center py-20 bg-[#f9f8f3] rounded-[32px] border border-dashed border-[#d0cdc1] flex flex-col items-center justify-center h-full">
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
          ) : sortBy === 'goals' ? (
            <div className="h-full pb-6">
              <GoalsDashboard 
                contacts={filteredContacts} 
                onLogContact={(c) => openContactModal(c, 'history')} 
                onClick={(c) => openContactModal(c, 'details')} 
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4 overflow-y-scroll pb-6 h-full content-start pr-2 custom-scrollbar">
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
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-[#fbfaf5] rounded-[24px] shadow-2xl w-full max-w-sm overflow-hidden border border-[#e0dbc5] p-6 relative"
            >
              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="absolute top-4 right-4 text-[#8e8a75] hover:text-[#4a453e] p-1 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              
              <h2 className="text-2xl font-serif text-[#4a453e] mb-6">Settings</h2>
              
              <div className="space-y-4">
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
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
