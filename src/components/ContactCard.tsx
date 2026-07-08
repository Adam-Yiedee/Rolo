import React, { useState } from 'react';
import { Contact } from '../lib/sheets';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { UserRound, Heart, Clock, Plus, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ContactCardProps {
  key?: React.Key;
  contact: Contact;
  onClick: () => void;
  onLogContact: () => void;
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

export function ContactCard({ contact, onClick, onLogContact }: ContactCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  let lastContactStr = 'Never';
  if (contact.lastContactDate) {
    try {
      lastContactStr = formatDistanceToNow(parseISO(contact.lastContactDate), { addSuffix: true });
    } catch (e) {
      // Ignore parse error
    }
  }

  return (
    <div className="bg-white rounded-[24px] shadow-sm border border-[#e0dbc5] flex flex-col hover:shadow-md transition-all duration-300 group">
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={onClick}
      >
        {contact.profilePicture ? (
          <img src={contact.profilePicture} alt={contact.name} className="w-12 h-12 rounded-full object-cover bg-[#e8e4d3] shrink-0 border border-[#e0dbc5] shadow-sm" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[#f4f1e6] flex items-center justify-center text-[#8e8a75] shrink-0 border border-[#e0dbc5] shadow-sm">
            <UserRound size={20} strokeWidth={1.5} />
          </div>
        )}
        
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <p className="text-[15px] font-bold text-[#4a453e] truncate">{contact.name}</p>
              {contact.categories && contact.categories.length > 0 && (
                <div className="hidden sm:flex flex-wrap gap-1.5">
                  {contact.categories.map(cat => (
                    <span key={cat} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${getCategoryColor(cat)}`}>
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-0.5">
              <p className="text-[11px] text-[#8e8a75] flex items-center gap-1 font-medium tracking-wide uppercase">
                <Clock size={10} strokeWidth={2.5} /> Last: {lastContactStr}
              </p>
              {contact.interests && (
                <p className="text-[11px] text-[#a8a38d] flex items-center gap-1 truncate max-w-xs">
                  <Heart size={10} strokeWidth={2.5} /> {contact.interests}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLogContact();
            }}
            title="Add Interaction"
            className="w-10 h-10 rounded-full bg-[#f4f1e6] hover:bg-[#5a5a40] text-[#8e8a75] hover:text-white flex items-center justify-center transition-all duration-300 shadow-sm"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="w-10 h-10 rounded-full hover:bg-[#f4f1e6] text-[#8e8a75] flex items-center justify-center transition-all duration-300"
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-16 pb-5 pt-2 text-[13px] text-[#6d6858] leading-relaxed border-t border-[#f0eee0] bg-[#fbfaf5]/50 rounded-b-[24px]">
              <div className="flex sm:hidden flex-wrap gap-1.5 mb-4">
                {(contact.categories || []).map(cat => (
                  <span key={cat} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${getCategoryColor(cat)}`}>
                    {cat}
                  </span>
                ))}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#a8a38d] mb-1">Notes</h4>
                  <p className="whitespace-pre-wrap">{contact.notes || 'No notes added.'}</p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#a8a38d] mb-1">Reminder Goal</h4>
                    <p>{contact.reminderIntervalDays ? `Every ${contact.reminderIntervalDays} days` : 'No reminder set'}</p>
                  </div>
                  
                  {contact.family && (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#a8a38d] mb-1">Family Situation</h4>
                      <p>{contact.family}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
