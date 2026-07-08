import React, { useState, useEffect, useRef } from 'react';
import { Contact, SubContact, LinkedContact } from '../lib/sheets';
import { X, Camera, Plus, Trash2, Copy, Check, Mail, Phone } from 'lucide-react';
import { resizeImage } from '../lib/image';
import { motion, AnimatePresence } from 'motion/react';

function AutoResizeTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    resize();
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      onChange={(e) => {
        if (props.onChange) props.onChange(e);
        resize();
      }}
      className={`${props.className} overflow-hidden`}
    />
  );
}

const CATEGORY_COLORS = [
  'bg-[#e8e4d3] text-[#5a5a40]',
  'bg-[#e6f0e6] text-[#4a634a]',
  'bg-[#e6eaf0] text-[#4a5563]',
  'bg-[#f0e6ea] text-[#634a55]',
  'bg-[#f0ece6] text-[#63554a]',
  'bg-[#e6f0ef] text-[#4a6361]',
  'bg-[#ede6f0] text-[#584a63]'
];

const getCategoryColor = (category: string) => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface ContactModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Contact) => void;
  onDelete?: (id: string) => void;
  allContacts: Contact[];
  initialTab?: 'details' | 'history';
}

export function ContactModal({ contact, isOpen, onClose, onSave, onDelete, allContacts, initialTab = 'details' }: ContactModalProps) {
  const [formData, setFormData] = useState<Contact>({
    id: '',
    name: '',
    notes: '',
    profilePicture: '',
    interests: '',
    family: '',
    lastContactDate: new Date().toISOString(),
    reminderIntervalDays: null,
    lastReminderSentDate: '',
    linkedContacts: [],
    subContacts: [],
    history: [],
    categories: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>(initialTab);
  const [newCategory, setNewCategory] = useState('');
  const [newInteractionDate, setNewInteractionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newInteractionNotes, setNewInteractionNotes] = useState('');
  const [editingSubContactId, setEditingSubContactId] = useState<string | null>(null);
  const [isNestedExpanded, setIsNestedExpanded] = useState(false);
  const [isLinksExpanded, setIsLinksExpanded] = useState(false);
  const [isEditingLinkedIn, setIsEditingLinkedIn] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    if (contact) {
      setFormData({
        ...contact,
        categories: contact.categories || []
      });
    } else {
      setFormData({
        id: crypto.randomUUID(),
        name: '',
        notes: '',
        profilePicture: '',
        interests: '',
        family: '',
        background: '',
        linkedInUrl: '',
        email: '',
        phoneNumber: '',
        lastContactDate: new Date().toISOString(),
        reminderIntervalDays: null,
        lastReminderSentDate: '',
        linkedContacts: [],
        subContacts: [],
        history: [],
        categories: []
      });
    }
    setActiveTab(initialTab);
  }, [contact, isOpen, initialTab]);

  const handleSaveAndClose = () => {
    let finalFormData = { ...formData };
    if (newCategory.trim()) {
      finalFormData.categories = [...(finalFormData.categories || []), newCategory.trim()];
      setNewCategory('');
    }
    
    if (!finalFormData.id) {
      finalFormData.id = Date.now().toString();
    }
    
    onSave(finalFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setActiveTab('details');
      alert('Please enter a name for the contact.');
      return;
    }
    handleSaveAndClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeImage(file, 128, 128);
        setFormData({ ...formData, profilePicture: base64 });
      } catch (err) {
        console.error('Failed to resize image', err);
      }
    }
  };

  const addCategory = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = newCategory.trim();
      if (val && !formData.categories.includes(val)) {
        setFormData({
          ...formData,
          categories: [...(formData.categories || []), val]
        });
      }
      setNewCategory('');
    }
  };

  const removeCategory = (cat: string) => {
    setFormData({
      ...formData,
      categories: (formData.categories || []).filter(c => c !== cat)
    });
  };

  const addSubContact = () => {
    const newId = crypto.randomUUID();
    setFormData({
      ...formData,
      subContacts: [...formData.subContacts, { id: newId, name: '', relation: '', notes: '' }]
    });
    setEditingSubContactId(newId);
  };

  const updateSubContact = (index: number, field: keyof SubContact, value: string) => {
    const newSubs = [...formData.subContacts];
    newSubs[index] = { ...newSubs[index], [field]: value };
    setFormData({ ...formData, subContacts: newSubs });
  };

  const removeSubContact = (index: number) => {
    const newSubs = [...formData.subContacts];
    newSubs.splice(index, 1);
    setFormData({ ...formData, subContacts: newSubs });
  };

  const addLinkedContact = (linkedId: string, relation: string) => {
    if (!linkedId) return;
    setFormData({
      ...formData,
      linkedContacts: [...formData.linkedContacts, { id: linkedId, relation }]
    });
  };

  const handleAddInteraction = () => {
    if (!newInteractionNotes.trim()) return;
    
    // Create date preserving local timezone intent roughly
    const dateObj = new Date(newInteractionDate);
    const interactionDate = new Date(dateObj.getTime() + dateObj.getTimezoneOffset() * 60000).toISOString();
    
    // Update last contact date if this interaction is newer
    const currentLast = new Date(formData.lastContactDate || 0).getTime();
    const newLast = Math.max(currentLast, new Date(interactionDate).getTime());
    
    setFormData({
      ...formData,
      lastContactDate: new Date(newLast).toISOString(),
      history: [{ id: crypto.randomUUID(), date: interactionDate, notes: newInteractionNotes }, ...formData.history]
    });
    setNewInteractionNotes('');
    setNewInteractionDate(new Date().toISOString().split('T')[0]);
  };

  const updateHistory = (index: number, notes: string) => {
    const newHist = [...formData.history];
    newHist[index].notes = notes;
    setFormData({ ...formData, history: newHist });
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          try {
            const base64 = await resizeImage(file, 128, 128);
            setFormData({ ...formData, profilePicture: base64 });
          } catch (err) {
            console.error('Failed to resize pasted image', err);
          }
        }
        break; // Only handle the first image
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (() => {
        const primaryCategory = (formData.categories || [])[0];
        const avatarColorClass = primaryCategory ? getCategoryColor(primaryCategory) : 'bg-[#f4f1e6] text-[#8e8a75]';
        return (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md overflow-y-auto"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              handleSaveAndClose();
            }
          }}
          onPaste={handlePaste}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="bg-[#fbfaf5] rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden my-auto relative border border-[#e0dbc5] flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-8 border-b border-[#e0dbc5] shrink-0 bg-[#fbfaf5] z-10">
              <h2 className="text-3xl font-serif text-[#4a453e]">
                Connection
              </h2>
              <button type="button" onClick={onClose} className="p-2 text-[#8e8a75] hover:text-[#4a453e] rounded-full hover:bg-[#e8e4d3] transition-colors">
                <motion.div whileHover={{ rotate: 90, scale: 1.1 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                  <X size={20} />
                </motion.div>
              </button>
            </div>

            <div className="flex px-8 border-b border-[#e0dbc5] shrink-0 gap-8 bg-white/50 backdrop-blur-sm z-10 sticky top-0">
              <button 
                type="button" 
                onClick={() => setActiveTab('details')}
                className={`py-4 text-sm font-bold uppercase tracking-wider transition-all duration-300 relative ${activeTab === 'details' ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#6d6858]'}`}
              >
                Details
                {activeTab === 'details' && (
                  <motion.div layoutId="activeTabModal" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5a5a40]" />
                )}
              </button>
              <button 
                type="button" 
                onClick={() => setActiveTab('history')}
                className={`py-4 text-sm font-bold uppercase tracking-wider transition-all duration-300 relative ${activeTab === 'history' ? 'text-[#5a5a40]' : 'text-[#a8a38d] hover:text-[#6d6858]'}`}
              >
                History
                {activeTab === 'history' && (
                  <motion.div layoutId="activeTabModal" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5a5a40]" />
                )}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden relative">
              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar min-h-[500px]">
                <AnimatePresence mode="wait">
                  {activeTab === 'details' && (
                    <motion.div 
                      key="details"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-10"
                    >
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row gap-5 items-start">
                        <div className="shrink-0 flex flex-col items-center gap-3 w-full sm:w-auto">
                          <div className={`w-32 h-32 mx-auto rounded-full shadow-inner overflow-hidden flex flex-col items-center justify-center border border-[#e0dbc5] group relative cursor-pointer ${!formData.profilePicture ? avatarColorClass : 'bg-[#f4f1e6]'}`} onClick={() => fileInputRef.current?.click()}>
                            {formData.profilePicture ? (
                              <img src={formData.profilePicture} alt="Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" />
                            ) : (
                              <span className="text-5xl font-serif tracking-wide transition-all duration-500 group-hover:opacity-0 group-hover:scale-95">{getInitials(formData.name)}</span>
                            )}
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                              <Camera className="text-white" size={28} />
                            </div>
                          </div>
                          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                        </div>

                        <div className="flex-1 space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Name</label>
                            <input
                              type="text"
                              value={formData.name}
                              onChange={e => setFormData({ ...formData, name: e.target.value })}
                              className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] font-medium shadow-inner focus:shadow-sm text-sm"
                              placeholder="Jane Doe"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Categories & Tags</label>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {(formData.categories || []).map(cat => (
                                <span key={cat} className="inline-flex items-center gap-1 px-3 py-1 bg-[#5a5a40] text-white rounded-full text-xs font-medium shadow-sm">
                                  {cat}
                                  <button type="button" onClick={() => removeCategory(cat)} className="hover:text-[#e8e4d3] focus:outline-none">
                                    <X size={12} strokeWidth={3} />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={newCategory}
                              onChange={e => setNewCategory(e.target.value)}
                              onKeyDown={addCategory}
                              className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                              placeholder="Add category (press Enter to add)"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Interests</label>
                          <input
                            type="text"
                            value={formData.interests}
                            onChange={e => setFormData({ ...formData, interests: e.target.value })}
                            className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                            placeholder="Hiking, photography..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Family Situation</label>
                          <input
                            type="text"
                            value={formData.family}
                            onChange={e => setFormData({ ...formData, family: e.target.value })}
                            className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                            placeholder="Married, two kids"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Notes (Appearance, context, etc)</label>
                        <AutoResizeTextarea
                          rows={3}
                          value={formData.notes}
                          onChange={e => setFormData({ ...formData, notes: e.target.value })}
                          className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none resize-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                          placeholder="Met at the JS conference. Wears cool glasses."
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Background (Education, Work History)</label>
                        <AutoResizeTextarea
                          rows={2}
                          value={formData.background || ''}
                          onChange={e => setFormData({ ...formData, background: e.target.value })}
                          className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none resize-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                          placeholder="Went to Stanford, worked at Google..."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Reminder Interval (Days)</label>
                          <input
                            type="number"
                            min="1"
                            value={formData.reminderIntervalDays || ''}
                            onChange={e => setFormData({ ...formData, reminderIntervalDays: e.target.value ? parseInt(e.target.value) : null })}
                            className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                            placeholder="Leave blank for none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">LinkedIn Profile</label>
                          <div className="flex gap-2 h-[42px]">
                            {(!formData.linkedInUrl || isEditingLinkedIn) ? (
                              <div className="flex gap-2 w-full">
                                <input
                                  type="url"
                                  value={formData.linkedInUrl || ''}
                                  onChange={e => setFormData({ ...formData, linkedInUrl: e.target.value })}
                                  onFocus={() => setIsEditingLinkedIn(true)}
                                  onBlur={() => {
                                    if (formData.linkedInUrl) setIsEditingLinkedIn(false);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (formData.linkedInUrl) setIsEditingLinkedIn(false);
                                    }
                                  }}
                                  className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                                  placeholder="https://linkedin.com/in/..."
                                  autoFocus={isEditingLinkedIn}
                                />
                                {formData.linkedInUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setIsEditingLinkedIn(false)}
                                    className="px-4 py-2.5 bg-[#5a5a40] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#4a4a34] transition-colors"
                                  >
                                    Done
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex gap-2 w-full h-full">
                                <a
                                  href={formData.linkedInUrl.startsWith('http') ? formData.linkedInUrl : `https://${formData.linkedInUrl}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 flex items-center justify-center gap-2 bg-[#0a66c2] text-white rounded-xl px-4 hover:bg-[#004182] hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm"
                                  title="Open LinkedIn Profile"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                  </svg>
                                  <span className="font-medium text-sm">View Profile</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingLinkedIn(true)}
                                  className="px-3 flex items-center justify-center bg-[#f4f1e6] hover:bg-[#e8e4d3] text-[#8e8a75] rounded-xl transition-colors border border-transparent hover:border-[#e0dbc5]"
                                  title="Edit Link"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Email Address</label>
                          <div className="flex gap-2 h-[42px]">
                            {(!formData.email || isEditingEmail) ? (
                              <div className="flex gap-2 w-full">
                                <input
                                  type="email"
                                  value={formData.email || ''}
                                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                                  onFocus={() => setIsEditingEmail(true)}
                                  onBlur={() => {
                                    if (formData.email) setIsEditingEmail(false);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (formData.email) setIsEditingEmail(false);
                                    }
                                  }}
                                  className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                                  placeholder="hello@example.com"
                                  autoFocus={isEditingEmail}
                                />
                                {formData.email && (
                                  <button
                                    type="button"
                                    onClick={() => setIsEditingEmail(false)}
                                    className="px-4 py-2.5 bg-[#5a5a40] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#4a4a34] transition-colors"
                                  >
                                    Done
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex gap-2 w-full h-full">
                                <a
                                  href={`mailto:${formData.email}`}
                                  className="flex-1 flex items-center justify-center gap-2 bg-[#d93025] text-white rounded-xl px-4 hover:bg-[#b3271f] hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm"
                                  title="Draft Email"
                                >
                                  <Mail size={16} />
                                  <span className="font-medium text-sm text-ellipsis overflow-hidden whitespace-nowrap max-w-[120px]">{formData.email}</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(formData.email || '');
                                    setCopiedEmail(true);
                                    setTimeout(() => setCopiedEmail(false), 2000);
                                  }}
                                  className="px-3 flex items-center justify-center bg-[#f4f1e6] hover:bg-[#e8e4d3] text-[#8e8a75] rounded-xl transition-colors border border-transparent hover:border-[#e0dbc5]"
                                  title="Copy Email"
                                >
                                  {copiedEmail ? <Check size={14} className="text-[#5a5a40]" /> : <Copy size={14} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingEmail(true)}
                                  className="px-3 flex items-center justify-center bg-[#f4f1e6] hover:bg-[#e8e4d3] text-[#8e8a75] rounded-xl transition-colors border border-transparent hover:border-[#e0dbc5]"
                                  title="Edit Email"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d]">Phone Number</label>
                          <div className="flex gap-2 h-[42px]">
                            {(!formData.phoneNumber || isEditingPhone) ? (
                              <div className="flex gap-2 w-full">
                                <input
                                  type="tel"
                                  value={formData.phoneNumber || ''}
                                  onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                                  onFocus={() => setIsEditingPhone(true)}
                                  onBlur={() => {
                                    if (formData.phoneNumber) setIsEditingPhone(false);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (formData.phoneNumber) setIsEditingPhone(false);
                                    }
                                  }}
                                  className="w-full px-4 py-2.5 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm text-sm"
                                  placeholder="+1 (555) 000-0000"
                                  autoFocus={isEditingPhone}
                                />
                                {formData.phoneNumber && (
                                  <button
                                    type="button"
                                    onClick={() => setIsEditingPhone(false)}
                                    className="px-4 py-2.5 bg-[#5a5a40] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#4a4a34] transition-colors"
                                  >
                                    Done
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex gap-2 w-full h-full">
                                <a
                                  href={`tel:${formData.phoneNumber}`}
                                  className="flex-1 flex items-center justify-center gap-2 bg-[#f4f1e6] text-[#4a453e] border border-transparent rounded-xl px-4 hover:bg-white hover:border-[#e0dbc5] shadow-sm transition-all text-sm font-medium"
                                  title="Call"
                                >
                                  <Phone size={14} className="text-[#a8a38d]" />
                                  <span className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[120px]">{formData.phoneNumber}</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(formData.phoneNumber || '');
                                    setCopiedPhone(true);
                                    setTimeout(() => setCopiedPhone(false), 2000);
                                  }}
                                  className="px-3 flex items-center justify-center bg-[#f4f1e6] hover:bg-[#e8e4d3] text-[#8e8a75] rounded-xl transition-colors border border-transparent hover:border-[#e0dbc5]"
                                  title="Copy Phone"
                                >
                                  {copiedPhone ? <Check size={14} className="text-[#5a5a40]" /> : <Copy size={14} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingPhone(true)}
                                  className="px-3 flex items-center justify-center bg-[#f4f1e6] hover:bg-[#e8e4d3] text-[#8e8a75] rounded-xl transition-colors border border-transparent hover:border-[#e0dbc5]"
                                  title="Edit Phone"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-[#f0eee0] space-y-8">
                      <div>
                        <button 
                          type="button" 
                          onClick={() => setIsNestedExpanded(!isNestedExpanded)}
                          className="w-full flex items-center justify-between py-2 group"
                        >
                          <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Nested Contacts {formData.subContacts.length > 0 && `(${formData.subContacts.length})`}</h3>
                          <div className="flex items-center gap-3">
                            <motion.div animate={{ rotate: isNestedExpanded ? 180 : 0 }} transition={{ duration: 0.3 }} className="text-[#a8a38d] group-hover:text-[#4a453e]">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </motion.div>
                          </div>
                        </button>

                        <AnimatePresence initial={false}>
                          {isNestedExpanded && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="pt-4 space-y-6">
                                <div className="flex justify-end mb-2">
                                  <button type="button" onClick={addSubContact} className="text-[#5a5a40] bg-white hover:bg-[#e8e4d3] px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider border border-[#e0dbc5] shadow-sm">
                                    <Plus size={14} /> Add Person
                                  </button>
                                </div>
                                {formData.subContacts.length === 0 ? (
                          <div className="bg-[#f4f1e6]/50 rounded-2xl p-6 text-center border border-dashed border-[#d0cdc1]">
                            <p className="text-sm text-[#8e8a75]">No nested contacts added yet.</p>
                          </div>
                        ) : (
                          <motion.div layout className="space-y-4">
                            <AnimatePresence initial={false}>
                              {formData.subContacts.map((sub, i) => {
                                const isEditing = editingSubContactId === sub.id;
                                return (
                                <motion.div 
                                  layout 
                                  initial={{ opacity: 0, height: 0, scale: 0.95 }} 
                                  animate={{ opacity: 1, height: 'auto', scale: 1 }} 
                                  exit={{ opacity: 0, height: 0, scale: 0.95, overflow: 'hidden' }} 
                                  transition={{ duration: 0.2 }}
                                  key={sub.id} 
                                  className="bg-white p-5 rounded-2xl shadow-sm border border-[#e0dbc5] relative group"
                                >
                                  <AnimatePresence mode="wait">
                                    {isEditing ? (
                                      <motion.div 
                                        key="editing"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="space-y-3"
                                      >
                                        <input
                                          type="text"
                                          value={sub.name}
                                          onChange={e => updateSubContact(i, 'name', e.target.value)}
                                          placeholder="Name (e.g. Luke)"
                                          className="w-full px-4 py-2 bg-[#f4f1e6] border border-transparent focus:bg-white focus:border-[#e0dbc5] rounded-xl text-sm outline-none transition-all text-[#4a453e]"
                                        />
                                        <input
                                          type="text"
                                          value={sub.relation || ''}
                                          onChange={e => updateSubContact(i, 'relation', e.target.value)}
                                          placeholder="Relationship (e.g. Brother, Sister)"
                                          className="w-full px-4 py-2 bg-[#f4f1e6] border border-transparent focus:bg-white focus:border-[#e0dbc5] rounded-xl text-sm outline-none transition-all text-[#4a453e]"
                                        />
                                        <AutoResizeTextarea
                                          value={sub.notes}
                                          onChange={e => updateSubContact(i, 'notes', e.target.value)}
                                          placeholder="Notes (e.g. 4th grade, loves animals)"
                                          rows={2}
                                          className="w-full px-4 py-2 bg-[#f4f1e6] border border-transparent focus:bg-white focus:border-[#e0dbc5] rounded-xl text-sm outline-none resize-none transition-all text-[#4a453e]"
                                        />
                                        <div className="flex justify-end gap-2 pt-2">
                                          <button type="button" onClick={() => removeSubContact(i)} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#e67e5a] hover:bg-[#fff0eb] rounded-full transition-colors">
                                            Remove
                                          </button>
                                          <button type="button" onClick={() => setEditingSubContactId(null)} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#5a5a40] text-white hover:bg-[#4a4a34] rounded-full transition-colors">
                                            Save
                                          </button>
                                        </div>
                                      </motion.div>
                                    ) : (
                                      <motion.div 
                                        key="viewing"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="flex items-start justify-between cursor-pointer" 
                                        onClick={() => setEditingSubContactId(sub.id)}
                                      >
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-[#4a453e]">{sub.name || 'Unnamed Person'}</h4>
                                            {sub.relation && (
                                              <span className="text-[10px] uppercase tracking-wider font-bold text-[#8e8a75] bg-[#f4f1e6] px-2 py-0.5 rounded-full">{sub.relation}</span>
                                            )}
                                          </div>
                                          {sub.notes && <p className="text-sm text-[#6d6858] mt-1 whitespace-pre-wrap">{sub.notes}</p>}
                                        </div>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); removeSubContact(i); }} className="text-[#8e8a75] hover:text-[#e67e5a] opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                          <Trash2 size={16} />
                                        </button>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.div>
                                )
                              })}
                            </AnimatePresence>
                          </motion.div>
                        )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-[#f0eee0] space-y-8">
                      <div>
                        <button 
                          type="button" 
                          onClick={() => setIsLinksExpanded(!isLinksExpanded)}
                          className="w-full flex items-center justify-between py-2 group"
                        >
                          <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Links to other Contacts {formData.linkedContacts.length > 0 && `(${formData.linkedContacts.length})`}</h3>
                          <div className="flex items-center gap-3">
                            <motion.div animate={{ rotate: isLinksExpanded ? 180 : 0 }} transition={{ duration: 0.3 }} className="text-[#a8a38d] group-hover:text-[#4a453e]">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </motion.div>
                          </div>
                        </button>
                        
                        <AnimatePresence initial={false}>
                          {isLinksExpanded && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="pt-4 space-y-6">
                                <div className="bg-white shadow-sm p-2 rounded-2xl border border-[#e0dbc5] flex gap-2 items-center">
                                  <select id="linkSelect" className="flex-1 px-4 py-3 bg-transparent border-none text-sm outline-none cursor-pointer">
                                    <option value="">Select a contact...</option>
                                    {allContacts.filter(c => c.id !== formData.id).map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                  <div className="w-px h-6 bg-[#e0dbc5]"></div>
                                  <input id="relationInput" type="text" placeholder="Relation" className="flex-1 px-4 py-3 bg-transparent border-none text-sm outline-none" />
                                  <button 
                                    type="button" 
                                    onClick={() => {
                                      const sel = document.getElementById('linkSelect') as HTMLSelectElement;
                                      const rel = document.getElementById('relationInput') as HTMLInputElement;
                                      if (sel.value && rel.value) {
                                        const newLinks = [...formData.linkedContacts];
                                        newLinks.push({ id: sel.value, relation: rel.value });
                                        setFormData({ ...formData, linkedContacts: newLinks });
                                        sel.value = '';
                                        rel.value = '';
                                      }
                                    }}
                                    className="p-3 bg-[#5a5a40] hover:bg-[#4a4a34] text-white rounded-xl transition-all shadow-md active:scale-95"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  {formData.linkedContacts.map((link, i) => {
                                    const linkedContact = allContacts.find(c => c.id === link.id);
                                    return (
                                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={i} className="flex items-center justify-between bg-white px-5 py-3 shadow-sm rounded-xl border border-[#e0dbc5] group">
                                        <span className="text-sm">
                                          <strong className="text-[#4a453e] font-bold">{linkedContact?.name || 'Unknown'}</strong> <span className="text-[#8e8a75] mx-2">—</span> {link.relation}
                                        </span>
                                        <button 
                                          type="button"
                                          onClick={() => {
                                            const newLinks = [...formData.linkedContacts];
                                            newLinks.splice(i, 1);
                                            setFormData({ ...formData, linkedContacts: newLinks });
                                          }}
                                          className="text-[#8e8a75] hover:text-[#e67e5a] opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <X size={16} />
                                        </button>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {contact && onDelete && (
                        <div className="pt-8 mt-4 border-t border-[#f0eee0] flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              onDelete(contact.id);
                            }}
                            className="p-3 text-[#d5d1c5] hover:text-[#e67e5a] hover:bg-[#fff0ed] rounded-full transition-all duration-300 hover:scale-110 active:scale-95"
                            title="Delete Contact"
                          >
                            <Trash2 size={24} strokeWidth={1.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'history' && (
                  <motion.div 
                    key="history"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    <div className="bg-[#f4f1e6] p-5 rounded-2xl border border-[#e0dbc5] space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">New Interaction</h3>
                        <input
                          type="date"
                          value={newInteractionDate}
                          onChange={(e) => setNewInteractionDate(e.target.value)}
                          className="bg-white border border-[#e0dbc5] rounded-xl px-3 py-1.5 text-xs text-[#4a453e] font-medium outline-none"
                        />
                      </div>
                      <AutoResizeTextarea
                        value={newInteractionNotes}
                        onChange={(e) => setNewInteractionNotes(e.target.value)}
                        placeholder="What did you talk about?"
                        rows={2}
                        className="w-full text-sm px-4 py-3 bg-white border border-[#e0dbc5] rounded-xl text-[#4a453e] placeholder:text-[#a8a38d] outline-none resize-none focus:ring-4 focus:ring-[#5a5a40]/10 transition-all"
                      />
                      <div className="flex justify-end">
                        <button 
                          type="button" 
                          onClick={handleAddInteraction}
                          disabled={!newInteractionNotes.trim()}
                          className="text-white bg-[#5a5a40] hover:bg-[#4a4a34] disabled:bg-[#a8a38d] disabled:cursor-not-allowed px-5 py-2 rounded-full flex items-center gap-2 text-[11px] uppercase font-bold tracking-wider transition-colors shadow-sm"
                        >
                          <Plus size={14} /> Log It
                        </button>
                      </div>
                    </div>

                    <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d] mt-8 mb-4">Past Interactions</h3>
                    
                    {formData.history.length === 0 ? (
                      <div className="bg-[#f4f1e6]/50 rounded-2xl p-10 text-center border border-dashed border-[#d0cdc1]">
                        <p className="text-sm text-[#8e8a75]">No interactions logged yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {formData.history.map((hist, i) => (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={hist.id} className="bg-white p-5 rounded-2xl shadow-sm border border-[#e0dbc5] flex flex-col gap-3 group relative">
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-bold tracking-wider uppercase text-[#a8a38d]">{new Date(hist.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                              <button type="button" onClick={() => {
                                const newHist = [...formData.history];
                                newHist.splice(i, 1);
                                setFormData({ ...formData, history: newHist });
                              }} className="text-[#8e8a75] hover:text-[#e67e5a] opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <AutoResizeTextarea
                              value={hist.notes}
                              onChange={e => updateHistory(i, e.target.value)}
                              placeholder="What did you talk about?"
                              rows={2}
                              className="w-full text-sm text-[#4a453e] placeholder:text-[#a8a38d] outline-none resize-none bg-transparent"
                            />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-6 border-t border-[#e0dbc5] shrink-0 bg-[#fbfaf5] flex items-center justify-end z-10">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 text-[#6d6858] hover:bg-[#e8e4d3] font-medium rounded-full transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-8 py-2.5 bg-[#5a5a40] hover:bg-[#4a4a34] text-[#fbfaf5] font-medium rounded-full transition-all duration-300 hover:-translate-y-0.5 active:scale-95 shadow-md hover:shadow-lg text-sm"
                >
                  Save Connection
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </motion.div>
        );
      })()}
    </AnimatePresence>
  );
}

