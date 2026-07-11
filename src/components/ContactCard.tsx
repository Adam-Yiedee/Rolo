import React, { useState } from 'react';
import { Contact } from '../lib/sheets';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
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

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function ContactCard({ contact, onClick, onLogContact }: ContactCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasOneTimeReminder = Boolean(contact.oneTimeReminderDate);
  let lastContactStr = 'Never';
  if (contact.lastContactDate) {
    try {
      lastContactStr = formatDistanceToNow(parseISO(contact.lastContactDate), { addSuffix: true });
    } catch (e) {
      // Ignore parse error
    }
  }
  let oneTimeReminderStr = '';
  if (contact.oneTimeReminderDate) {
    try {
      oneTimeReminderStr = format(parseISO(contact.oneTimeReminderDate), 'MMM d');
    } catch (e) {
      oneTimeReminderStr = 'set';
    }
  }
  const hasReminder = hasOneTimeReminder || Boolean(contact.reminderIntervalDays && contact.reminderIntervalDays > 0);
  const reminderLabel = hasOneTimeReminder ? `Once: ${oneTimeReminderStr}` : `Last: ${lastContactStr}`;

  const primaryCategory = contact.categories && contact.categories.length > 0 ? contact.categories[0] : null;
  const avatarColorClass = primaryCategory ? getCategoryColor(primaryCategory) : 'bg-[#f4f1e6] text-[#8e8a75]';

  return (
    <motion.div 
      whileHover={{ y: -2, transition: { duration: 0.2, ease: 'easeOut' } }}
      className="bg-white rounded-[18px] shadow-sm hover:shadow-md border border-[#e0dbc5] flex flex-col group max-sm:rounded-2xl"
    >
      <div 
        className="flex items-center gap-3 px-4 py-3 cursor-pointer max-sm:gap-2.5 max-sm:px-3 max-sm:py-2.5"
        onClick={onClick}
      >
        {contact.profilePicture ? (
          <img src={contact.profilePicture} alt={contact.name} className="w-11 h-11 rounded-full object-cover bg-[#e8e4d3] shrink-0 border border-[#e0dbc5] shadow-sm max-sm:w-10 max-sm:h-10" />
        ) : (
          <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 border border-[#e0dbc5] shadow-sm font-serif text-base tracking-wide max-sm:w-10 max-sm:h-10 max-sm:text-sm ${avatarColorClass}`}>
            {getInitials(contact.name)}
          </div>
        )}
        
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <p className="text-[15px] font-bold text-[#4a453e] truncate max-sm:text-sm">{contact.name}</p>
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
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-0.5 max-sm:mt-0">
              {contact.interests && (
                <p className="text-[11px] text-[#a8a38d] flex items-center gap-1 truncate max-w-xs max-sm:max-w-[46vw]">
                  <Heart size={10} strokeWidth={2.5} /> {contact.interests}
                </p>
              )}
              {hasReminder && (
                <p className="text-[11px] text-[#8e8a75] flex sm:hidden items-center gap-1 font-medium tracking-wide uppercase">
                  <Clock size={10} strokeWidth={2.5} /> {reminderLabel}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 max-sm:gap-1">
          {hasReminder && (
            <p className="hidden sm:flex items-center gap-1 text-[11px] text-[#8e8a75] font-medium tracking-wide uppercase whitespace-nowrap pr-1">
              <Clock size={10} strokeWidth={2.5} /> {reminderLabel}
            </p>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLogContact();
            }}
            title="Log Interaction"
            className="w-9 h-9 rounded-full bg-[#f4f1e6] hover:bg-[#5a5a40] text-[#8e8a75] hover:text-white flex items-center justify-center transition-all duration-300 shadow-sm max-sm:w-8 max-sm:h-8"
          >
            <Plus size={17} strokeWidth={2.5} />
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="w-9 h-9 rounded-full hover:bg-[#f4f1e6] text-[#8e8a75] flex items-center justify-center transition-all duration-300 max-sm:w-8 max-sm:h-8"
          >
            {isExpanded ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
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
            <div className="px-14 pb-4 pt-2 text-[13px] text-[#6d6858] leading-relaxed border-t border-[#f0eee0] bg-[#fbfaf5]/50 rounded-b-[18px]">
              <div className="flex sm:hidden flex-wrap gap-1.5 mb-3">
                {(contact.categories || []).map(cat => (
                  <span key={cat} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${getCategoryColor(cat)}`}>
                    {cat}
                  </span>
                ))}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#a8a38d] mb-1">Notes</h4>
                  <p className="whitespace-pre-wrap">{contact.notes || 'No notes added.'}</p>
                </div>
                
                <div className="space-y-4">
                  {hasOneTimeReminder ? (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#a8a38d] mb-1">Reach Out Reminder</h4>
                      <p>One time on {oneTimeReminderStr}</p>
                    </div>
                  ) : contact.reminderIntervalDays && contact.reminderIntervalDays > 0 ? (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#a8a38d] mb-1">Reach Out Reminder</h4>
                      <p>Every {contact.reminderIntervalDays} days</p>
                    </div>
                  ) : null}
                  
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
    </motion.div>
  );
}
