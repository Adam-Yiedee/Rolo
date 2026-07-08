import React, { useState, useEffect, useRef } from 'react';
import { Contact, SubContact, LinkedContact } from '../lib/sheets';
import { X, Upload, Plus, Trash2 } from 'lucide-react';
import { resizeImage } from '../lib/image';
import { motion, AnimatePresence } from 'motion/react';

interface ContactModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Contact) => void;
  onDelete?: (id: string) => void;
  allContacts: Contact[];
}

export function ContactModal({ contact, isOpen, onClose, onSave, onDelete, allContacts }: ContactModalProps) {
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
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [newCategory, setNewCategory] = useState('');

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
        lastContactDate: new Date().toISOString(),
        reminderIntervalDays: null,
        lastReminderSentDate: '',
        linkedContacts: [],
        subContacts: [],
        history: [],
        categories: []
      });
    }
    setActiveTab('details');
  }, [contact, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalFormData = { ...formData };
    if (newCategory.trim()) {
      finalFormData.categories = [...(finalFormData.categories || []), newCategory.trim()];
      setNewCategory('');
    }
    
    onSave(finalFormData);
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
    setFormData({
      ...formData,
      subContacts: [...formData.subContacts, { id: crypto.randomUUID(), name: '', notes: '' }]
    });
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

  const addHistory = () => {
    setFormData({
      ...formData,
      history: [{ id: crypto.randomUUID(), date: new Date().toISOString(), notes: '' }, ...formData.history]
    });
  };

  const updateHistory = (index: number, notes: string) => {
    const newHist = [...formData.history];
    newHist[index].notes = notes;
    setFormData({ ...formData, history: newHist });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0 }}
            className="bg-[#fbfaf5] rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden my-auto relative border border-[#e0dbc5] flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-8 border-b border-[#e0dbc5] shrink-0 bg-[#fbfaf5] z-10">
              <h2 className="text-3xl font-serif text-[#4a453e]">
                Connection
              </h2>
              <button type="button" onClick={onClose} className="p-2 text-[#8e8a75] hover:text-[#4a453e] rounded-full hover:bg-[#e8e4d3] transition-colors">
                <X size={20} />
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
              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                <AnimatePresence mode="popLayout" initial={false}>
                  {activeTab === 'details' && (
                    <motion.div 
                      key="details"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-10 min-h-[400px]"
                    >
                    <div className="space-y-6">
                      <div className="flex gap-6 items-start">
                        <div className="shrink-0 flex flex-col items-center gap-3">
                          <div className="w-28 h-28 rounded-full bg-[#f4f1e6] shadow-inner overflow-hidden flex items-center justify-center border border-[#e0dbc5] group relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            {formData.profilePicture ? (
                              <img src={formData.profilePicture} alt="Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            ) : (
                              <span className="text-[#a8a38d] text-xs font-bold uppercase tracking-widest">No Image</span>
                            )}
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <Upload className="text-white" size={24} />
                            </div>
                          </div>
                          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                        </div>

                        <div className="flex-1 space-y-5">
                          <div className="space-y-2">
                            <label className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Name</label>
                            <input
                              required
                              type="text"
                              value={formData.name}
                              onChange={e => setFormData({ ...formData, name: e.target.value })}
                              className="w-full px-4 py-3 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] font-medium shadow-inner focus:shadow-sm"
                              placeholder="Jane Doe"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Categories & Tags</label>
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
                              className="w-full px-4 py-3 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm"
                              placeholder="Add category (press Enter to add)"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Interests</label>
                          <input
                            type="text"
                            value={formData.interests}
                            onChange={e => setFormData({ ...formData, interests: e.target.value })}
                            className="w-full px-4 py-3 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm"
                            placeholder="Hiking, photography..."
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Family Situation</label>
                          <input
                            type="text"
                            value={formData.family}
                            onChange={e => setFormData({ ...formData, family: e.target.value })}
                            className="w-full px-4 py-3 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm"
                            placeholder="Married, two kids"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Notes (Appearance, context, etc)</label>
                        <textarea
                          rows={3}
                          value={formData.notes}
                          onChange={e => setFormData({ ...formData, notes: e.target.value })}
                          className="w-full px-4 py-3 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none resize-none text-[#4a453e] shadow-inner focus:shadow-sm"
                          placeholder="Met at the JS conference. Wears cool glasses."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Reminder Interval (Days)</label>
                          <input
                            type="number"
                            min="1"
                            value={formData.reminderIntervalDays || ''}
                            onChange={e => setFormData({ ...formData, reminderIntervalDays: e.target.value ? parseInt(e.target.value) : null })}
                            className="w-full px-4 py-3 bg-[#f4f1e6] border border-transparent rounded-xl focus:bg-white focus:border-[#e0dbc5] focus:ring-4 focus:ring-[#5a5a40]/10 transition-all duration-300 outline-none text-[#4a453e] shadow-inner focus:shadow-sm"
                            placeholder="Leave blank for none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-[#f0eee0] space-y-8">
                      <div>
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Nested Contacts</h3>
                          <button type="button" onClick={addSubContact} className="text-[#5a5a40] hover:bg-[#e8e4d3] px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wider">
                            <Plus size={14} /> Add Person
                          </button>
                        </div>
                        {formData.subContacts.length === 0 ? (
                          <div className="bg-[#f4f1e6]/50 rounded-2xl p-6 text-center border border-dashed border-[#d0cdc1]">
                            <p className="text-sm text-[#8e8a75]">No nested contacts added yet.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {formData.subContacts.map((sub, i) => (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={sub.id} className="bg-white p-5 rounded-2xl shadow-sm border border-[#e0dbc5] flex gap-4 items-start relative group">
                                <button type="button" onClick={() => removeSubContact(i)} className="absolute top-5 right-5 text-[#8e8a75] hover:text-[#e67e5a] opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Trash2 size={16} />
                                </button>
                                <div className="flex-1 space-y-3">
                                  <input
                                    type="text"
                                    value={sub.name}
                                    onChange={e => updateSubContact(i, 'name', e.target.value)}
                                    placeholder="Name (e.g. Luke)"
                                    className="w-full px-4 py-2 bg-[#f4f1e6] border border-transparent focus:bg-white focus:border-[#e0dbc5] rounded-xl text-sm outline-none transition-all"
                                  />
                                  <textarea
                                    value={sub.notes}
                                    onChange={e => updateSubContact(i, 'notes', e.target.value)}
                                    placeholder="Notes (e.g. 4th grade, loves animals)"
                                    rows={2}
                                    className="w-full px-4 py-2 bg-[#f4f1e6] border border-transparent focus:bg-white focus:border-[#e0dbc5] rounded-xl text-sm outline-none resize-none transition-all"
                                  />
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Links to other Contacts</h3>
                        </div>
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
                                addLinkedContact(sel.value, rel.value);
                                sel.value = '';
                                rel.value = '';
                              }
                            }}
                            className="p-3 bg-[#5a5a40] hover:bg-[#4a4a34] text-white rounded-xl transition-all shadow-md active:scale-95"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <div className="mt-4 space-y-2">
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
                    <div className="flex items-center justify-between">
                      <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#a8a38d]">Interaction Log</h3>
                      <button type="button" onClick={addHistory} className="text-[#5a5a40] hover:bg-[#e8e4d3] px-4 py-2 rounded-full flex items-center gap-2 text-[11px] uppercase font-bold tracking-wider transition-colors">
                        <Plus size={14} /> Log Interaction
                      </button>
                    </div>
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
                            <textarea
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

            <div className="p-6 border-t border-[#e0dbc5] shrink-0 bg-[#fbfaf5] flex items-center justify-between z-10">
              {contact && onDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to delete ${contact.name}?`)) {
                      onDelete(contact.id);
                    }
                  }}
                  className="px-5 py-2.5 text-[#e67e5a] hover:bg-[#e67e5a]/10 font-bold rounded-full transition-colors text-sm"
                >
                  Delete
                </button>
              ) : <div></div>}
              
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
      </div>
      )}
    </AnimatePresence>
  );
}

