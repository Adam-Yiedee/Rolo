import React from 'react';
import { Contact } from '../lib/sheets';
import { formatDistanceToNow, parseISO, addDays, format, differenceInDays } from 'date-fns';
import { Plus, Clock, Mail } from 'lucide-react';
import { motion } from 'motion/react';

interface GoalsDashboardProps {
  contacts: Contact[];
  onLogContact: (contact: Contact) => void;
  onClick: (contact: Contact) => void;
}

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function GoalsDashboard({ contacts, onLogContact, onClick }: GoalsDashboardProps) {
  const getNextContactDate = (c: Contact) => {
    if (!c.lastContactDate || !c.reminderIntervalDays) return new Date();
    return addDays(parseISO(c.lastContactDate), c.reminderIntervalDays);
  };

  const sortedContacts = [...contacts].sort((a, b) => {
    return getNextContactDate(a).getTime() - getNextContactDate(b).getTime();
  });

  return (
    <div className="bg-white rounded-[32px] shadow-sm border border-[#e0dbc5] p-6 sm:p-8 flex flex-col h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 shrink-0 gap-4">
        <div>
          <h2 className="text-xl font-serif text-[#4a453e] mb-1">Contact Goals</h2>
          <p className="text-sm text-[#8e8a75]">Stay in touch with your most important connections.</p>
        </div>
      </div>

      {sortedContacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Clock className="text-[#d0cdc1] mb-4" size={32} />
          <h3 className="text-[#4a453e] font-bold">No Goals Set</h3>
          <p className="text-sm text-[#8e8a75] max-w-sm mt-2">Edit a contact and add a Reminder Interval to track when you need to contact them next.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          <motion.div 
            className="flex flex-col gap-3"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
              hidden: {},
            }}
          >
            {sortedContacts.map((contact) => {
              const lastContact = contact.lastContactDate ? parseISO(contact.lastContactDate) : new Date();
              const nextContact = getNextContactDate(contact);
              const daysUntil = differenceInDays(nextContact, new Date());
              const isOverdue = daysUntil < 0;

              return (
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
                  }}
                  whileHover={{ x: 4, transition: { duration: 0.2 } }}
                  key={contact.id}
                  onClick={() => onClick(contact)}
                  className={`cursor-pointer rounded-2xl p-4 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isOverdue 
                      ? 'bg-[#fff0ed] border-[#e67e5a]/30 hover:border-[#e67e5a]/60' 
                      : 'bg-[#fbfaf5] border-[#e0dbc5] hover:border-[#d0cdc1]'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {contact.profilePicture ? (
                      <img src={contact.profilePicture} alt={contact.name} className="w-12 h-12 rounded-full object-cover shadow-sm border border-[#e0dbc5] shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#e8e4d3] text-[#5a5a40] flex items-center justify-center font-serif text-lg border border-[#e0dbc5] shadow-sm shrink-0">
                        {getInitials(contact.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-bold text-[#4a453e] text-base truncate">{contact.name}</h3>
                      <p className="text-[11px] uppercase tracking-wider font-bold text-[#8e8a75] mt-0.5 truncate">
                        Every {contact.reminderIntervalDays} days
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 text-right shrink-0">
                    <div className="hidden sm:block">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d] mb-1">Last Contact</p>
                      <p className="text-xs font-medium text-[#6d6858]">{format(lastContact, 'MMM d, yyyy')}</p>
                    </div>
                    <div className="w-32">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-[#a8a38d] mb-1">Next Contact</p>
                      <p className={`text-xs font-bold ${isOverdue ? 'text-[#e67e5a]' : 'text-[#5a5a40]'}`}>
                        {isOverdue 
                          ? `Overdue (${format(nextContact, 'MMM d')})` 
                          : daysUntil === 0 
                            ? 'Due today' 
                            : `In ${daysUntil} day${daysUntil === 1 ? '' : 's'} (${format(nextContact, 'MMM d')})`
                        }
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLogContact(contact);
                      }}
                      className="p-2.5 bg-white hover:bg-[#f4f1e6] border border-[#e0dbc5] rounded-full text-[#4a453e] transition-colors"
                      title="Log Interaction"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}
    </div>
  );
}
