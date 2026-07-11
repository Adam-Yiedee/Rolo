import React, { useMemo, useState } from 'react';
import { Contact } from '../lib/sheets';
import {
  addDays,
  addMonths,
  differenceInDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, List, Plus } from 'lucide-react';
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

const getShortName = (name: string) => {
  return name.trim().split(/\s+/)[0] || name;
};

const interpolate = (start: number, end: number, amount: number) => {
  return Math.round(start + (end - start) * amount);
};

const colorToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.substring(0, 2), 16),
    g: parseInt(normalized.substring(2, 4), 16),
    b: parseInt(normalized.substring(4, 6), 16),
  };
};

const mixHex = (startHex: string, endHex: string, amount: number) => {
  const start = colorToRgb(startHex);
  const end = colorToRgb(endHex);
  const r = interpolate(start.r, end.r, amount).toString(16).padStart(2, '0');
  const g = interpolate(start.g, end.g, amount).toString(16).padStart(2, '0');
  const b = interpolate(start.b, end.b, amount).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

export function GoalsDashboard({ contacts, onLogContact, onClick }: GoalsDashboardProps) {
  const [viewMode, setViewMode] = useState<'list' | 'schedule'>('list');
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const today = startOfDay(new Date());

  const parseContactDate = (value?: string) => {
    if (!value) return null;
    const date = parseISO(value);
    return Number.isNaN(date.getTime()) ? null : startOfDay(date);
  };

  const getNextContactDate = (c: Contact) => {
    const oneTimeReminderDate = parseContactDate(c.oneTimeReminderDate);
    if (oneTimeReminderDate) return oneTimeReminderDate;

    const lastContactDate = parseContactDate(c.lastContactDate);
    if (!lastContactDate || !c.reminderIntervalDays) return new Date();
    return addDays(lastContactDate, c.reminderIntervalDays);
  };

  const getGoalProgress = (contact: Contact) => {
    const oneTimeReminderDate = parseContactDate(contact.oneTimeReminderDate);
    if (oneTimeReminderDate) {
      const createdDate = parseContactDate(contact.oneTimeReminderCreatedDate) || parseContactDate(contact.lastContactDate) || today;
      const totalDays = Math.max(1, differenceInDays(oneTimeReminderDate, createdDate));
      const elapsedDays = Math.max(0, differenceInDays(today, createdDate));
      return Math.min(elapsedDays / totalDays, 1);
    }

    if (!contact.lastContactDate || !contact.reminderIntervalDays) return 1;
    const lastContact = parseContactDate(contact.lastContactDate);
    if (!lastContact) return 1;
    const daysSinceLastContact = Math.max(0, differenceInDays(today, lastContact));
    return Math.min(daysSinceLastContact / contact.reminderIntervalDays, 1);
  };

  const getGoalColor = (contact: Contact) => {
    const progress = Math.max(0, Math.min(1, getGoalProgress(contact)));
    const colorProgress = Math.pow(progress, 0.72);
    const tint = mixHex('#e4eee0', '#f2d2c8', colorProgress);
    const border = mixHex('#cad8bf', '#de8d76', colorProgress);
    const text = mixHex('#536b4d', '#a5533f', colorProgress);

    return {
      backgroundColor: tint,
      borderColor: border,
      color: text,
      progress,
    };
  };

  const getDueText = (daysUntil: number) => {
    if (daysUntil < 0) {
      const daysOverdue = Math.abs(daysUntil);
      return `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`;
    }
    if (daysUntil === 0) return 'Due today';
    if (daysUntil === 1) return 'Tomorrow';
    return `${daysUntil} days`;
  };

  const getLastContactText = (contact: Contact) => {
    const lastContact = parseContactDate(contact.lastContactDate);
    if (!lastContact) return 'No contact logged';

    const daysSince = Math.max(0, differenceInDays(today, lastContact));
    if (daysSince === 0) return 'Contacted Today';
    if (daysSince === 1) return 'Contacted Yesterday';
    return `Contacted ${daysSince} Days Ago`;
  };

  const sortedContacts = [...contacts].sort((a, b) => {
    return getNextContactDate(a).getTime() - getNextContactDate(b).getTime();
  });

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(visibleMonth)),
      end: endOfWeek(endOfMonth(visibleMonth)),
    });
  }, [visibleMonth]);

  return (
    <div className="bg-white rounded-[32px] shadow-sm border border-[#e0dbc5] p-5 sm:p-7 flex flex-col h-full overflow-hidden max-sm:rounded-2xl max-sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 shrink-0 gap-4 max-sm:mb-4 max-sm:gap-3">
        <div>
          <h2 className="text-xl font-serif text-[#4a453e] mb-1 max-sm:text-lg">Contact Goals</h2>
          <p className="text-sm text-[#8e8a75] max-sm:text-xs">Stay in touch with your most important connections.</p>
        </div>
        <div className="flex items-center bg-[#f4f1e6] rounded-full p-1 border border-[#e0dbc5] shadow-inner self-start sm:self-auto">
          <button
            onClick={() => setViewMode('list')}
            className={`w-10 h-9 rounded-full flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-white text-[#5a5a40] shadow-sm' : 'text-[#8e8a75] hover:text-[#4a453e]'}`}
            title="List view"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => setViewMode('schedule')}
            className={`w-10 h-9 rounded-full flex items-center justify-center transition-colors ${viewMode === 'schedule' ? 'bg-white text-[#5a5a40] shadow-sm' : 'text-[#8e8a75] hover:text-[#4a453e]'}`}
            title="Schedule view"
          >
            <CalendarDays size={16} />
          </button>
        </div>
      </div>

      {sortedContacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <Clock className="text-[#d0cdc1] mb-4" size={32} />
          <h3 className="text-[#4a453e] font-bold">No Goals Set</h3>
          <p className="text-sm text-[#8e8a75] max-w-sm mt-2">Edit a contact and set how often you want to reach out.</p>
        </div>
      ) : viewMode === 'schedule' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0 max-sm:mb-3">
            <button
              onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#8e8a75] hover:text-[#4a453e] hover:bg-[#f4f1e6] transition-colors"
              title="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-sm font-bold uppercase tracking-wider text-[#5a5a40] max-sm:text-xs">
              {format(visibleMonth, 'MMMM yyyy')}
            </div>
            <button
              onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#8e8a75] hover:text-[#4a453e] hover:bg-[#f4f1e6] transition-colors"
              title="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-[#a8a38d] mb-2 shrink-0 max-sm:text-[9px]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
            <div className="grid min-h-[528px] grid-cols-7 auto-rows-fr overflow-hidden rounded-2xl border border-[#e0dbc5] bg-[#fbfaf5] max-sm:min-h-[430px]">
              {calendarDays.map(day => {
                const dayContacts = sortedContacts.filter(contact => isSameDay(getNextContactDate(contact), day));
                const isCurrentMonth = isSameMonth(day, visibleMonth);

                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[88px] border-r border-b border-[#eeeadd] p-1.5 sm:p-2 overflow-hidden max-sm:min-h-[72px] max-sm:p-1 ${isCurrentMonth ? 'bg-white/70' : 'bg-[#f4f1e6]/55'}`}
                  >
                    <div className={`mb-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold max-sm:mb-1 max-sm:h-5 max-sm:w-5 max-sm:text-[10px] ${isToday(day) ? 'bg-[#5a5a40] text-white' : isCurrentMonth ? 'text-[#6d6858]' : 'text-[#c2bda9]'}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {dayContacts.slice(0, 3).map(contact => {
                        const goalColor = getGoalColor(contact);
                        return (
                          <button
                            key={contact.id}
                            onClick={() => onClick(contact)}
                            className="w-full max-w-full rounded-md border px-1.5 py-1 text-center text-[10px] sm:text-[11px] font-bold leading-tight transition-transform hover:-translate-y-0.5 max-sm:px-1 max-sm:text-[9px]"
                            style={{
                              backgroundColor: goalColor.backgroundColor,
                              borderColor: goalColor.borderColor,
                              color: goalColor.color,
                            }}
                            title={contact.name}
                          >
                            <span className="block whitespace-normal break-words">{getShortName(contact.name)}</span>
                          </button>
                        );
                      })}
                      {dayContacts.length > 3 && (
                        <div className="px-1 text-center text-[10px] font-bold text-[#a8a38d]">
                          +{dayContacts.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-sm:pr-1">
          <motion.div 
            className="flex flex-col gap-3 max-sm:gap-2"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
              hidden: {},
            }}
          >
            {sortedContacts.map((contact) => {
              const nextContact = getNextContactDate(contact);
              const daysUntil = differenceInDays(nextContact, today);
              const goalColor = getGoalColor(contact);
              return (
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
                  }}
                  whileHover={{ x: 4, transition: { duration: 0.2 } }}
                  key={contact.id}
                  onClick={() => onClick(contact)}
                  className="cursor-pointer rounded-[18px] px-4 py-3 border transition-all hover:shadow-sm max-sm:rounded-2xl max-sm:px-3 max-sm:py-2.5"
                  style={{
                    backgroundColor: goalColor.backgroundColor,
                    borderColor: goalColor.borderColor,
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {contact.profilePicture ? (
                        <img src={contact.profilePicture} alt={contact.name} className="w-11 h-11 rounded-full object-cover shadow-sm border border-[#e0dbc5] shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-[#f4f1e6]/75 text-[#5a5a40] flex items-center justify-center font-serif text-base border border-[#e0dbc5] shadow-sm shrink-0">
                          {getInitials(contact.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-[#4a453e] text-[15px] truncate">{contact.name}</h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 sm:justify-end shrink-0">
                      <div className="text-left sm:text-right min-w-[96px] max-sm:min-w-0">
                        <p className="text-[15px] font-serif leading-tight max-sm:text-sm" style={{ color: goalColor.color }}>
                          {getDueText(daysUntil)}
                        </p>
                        <p className="text-[10px] font-bold text-[#8e8a75] mt-0.5 max-sm:text-[9px]">
                          {getLastContactText(contact)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onLogContact(contact);
                        }}
                        className="w-9 h-9 bg-white/90 hover:bg-[#f4f1e6] border border-[#e0dbc5] rounded-full text-[#4a453e] transition-colors flex items-center justify-center shadow-sm"
                        title="Log Interaction"
                      >
                        <Plus size={17} strokeWidth={2.5} />
                      </button>
                    </div>
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
