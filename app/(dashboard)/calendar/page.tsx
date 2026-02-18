"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  Video,
  ExternalLink,
  Check,
  X,
  HelpCircle,
  Edit2,
  Trash2,
  Briefcase,
  CheckSquare,
  AlertTriangle,
  Target,
  Link2,
  Eye,
  EyeOff,
  MessageCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string | null;
  meeting_link: string | null;
  meeting_platform: string | null;
  visibility: string;
  color: string;
  programme_id: string | null;
  created_by: string;
  created_at: string;
  creator: { id: string; full_name: string } | null;
  programme: { id: string; name: string } | null;
  participants: Participant[];
}

interface Participant {
  id: string;
  status: string;
  responded_at: string | null;
  user: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

interface TaskDeadline {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
  programme_id: string | null;
}

interface ProgrammeDeadline {
  id: string;
  name: string;
  status: string;
  end_date: string;
}

interface UserOption {
  id: string;
  full_name: string;
  email: string;
 
}

type ViewMode = "day" | "week" | "month";

// ─── Helpers ────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmt(d: Date) {
  return d.toISOString().split("T")[0];
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}
function fmtFull(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function startOfWeek(d: Date) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}
function endOfWeek(d: Date) {
  const e = startOfWeek(d);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function getMonthDays(d: Date) {
  const first = startOfMonth(d);
  const last = endOfMonth(d);
  const days: Date[] = [];
  // Pad start
  const startDay = first.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    const pad = new Date(first);
    pad.setDate(pad.getDate() - i - 1);
    days.push(pad);
  }
  // Month days
  for (let i = 1; i <= last.getDate(); i++) {
    days.push(new Date(d.getFullYear(), d.getMonth(), i));
  }
  // Pad end to complete grid (6 rows)
  while (days.length < 42) {
    const pad = new Date(last);
    pad.setDate(pad.getDate() + (days.length - startDay - last.getDate() + 1));
    days.push(pad);
  }
  return days;
}

const EVENT_COLORS: Record<string, string> = {
  meeting: "#000000",
  event: "#4D4D4D",
  deadline: "#B91C1C",
  reminder: "#7D7D7D",
};

const PLATFORM_ICONS: Record<string, { label: string; color: string }> = {
  google_meet: { label: "Google Meet", color: "#1A73E8" },
  zoom: { label: "Zoom", color: "#2D8CFF" },
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  teams: { label: "Teams", color: "#6264A7" },
  other: { label: "Meeting Link", color: "#4D4D4D" },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#DC2626",
  high: "#F59E0B",
  normal: "#6B7280",
  low: "#9CA3AF",
};

// ─── Component ──────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user, profile } = useAuth();
  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [taskDeadlines, setTaskDeadlines] = useState<TaskDeadline[]>([]);
  const [programmeDeadlines, setProgrammeDeadlines] = useState<ProgrammeDeadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showMobileSummary, setShowMobileSummary] = useState(false);

  // ─── Data range based on view ──────────────────────────────────

  const { rangeStart, rangeEnd } = useMemo(() => {
    const d = currentDate;
    if (view === "day") {
      const s = new Date(d);
      s.setHours(0, 0, 0, 0);
      const e = new Date(d);
      e.setHours(23, 59, 59, 999);
      return { rangeStart: s, rangeEnd: e };
    }
    if (view === "week") {
      return { rangeStart: startOfWeek(d), rangeEnd: endOfWeek(d) };
    }
    // Month: extend to cover padded days
    const ms = startOfMonth(d);
    const me = endOfMonth(d);
    const padStart = new Date(ms);
    padStart.setDate(padStart.getDate() - ms.getDay());
    const padEnd = new Date(me);
    padEnd.setDate(padEnd.getDate() + (6 - me.getDay()));
    padEnd.setHours(23, 59, 59, 999);
    return { rangeStart: padStart, rangeEnd: padEnd };
  }, [currentDate, view]);

  // ─── Fetch data ────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/calendar?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTaskDeadlines(data.taskDeadlines || []);
        setProgrammeDeadlines(data.programmeDeadlines || []);
      }
    } catch (err) {
      console.error("Failed to fetch calendar:", err);
    } finally {
      setIsLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch all users for participant picker
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/search?q=*");
        if (!res.ok) {
          // Fallback: fetch from calendar events participants
          return;
        }
      } catch {}
      // Direct supabase query via a simple endpoint or reuse
    }
    // We'll load users in the modal instead
  }, []);

  // ─── Navigation ────────────────────────────────────────────────

  function navigate(dir: number) {
    const d = new Date(currentDate);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  }

  function goToday() {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  }

  // ─── Events for a specific day ─────────────────────────────────

  function getEventsForDay(day: Date) {
    return events.filter((e) => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      return isSameDay(start, day) || (start <= day && end >= day);
    });
  }

  function getTasksForDay(day: Date) {
    const ds = fmt(day);
    return taskDeadlines.filter((t) => t.due_date === ds);
  }

  function getProgDeadlinesForDay(day: Date) {
    const ds = fmt(day);
    return programmeDeadlines.filter((p) => p.end_date === ds);
  }

  // ─── Summary data ──────────────────────────────────────────────

  const summaryData = useMemo(() => {
    const totalEvents = events.length;
    const meetings = events.filter((e) => e.event_type === "meeting").length;
    const myInvites = events.filter((e) =>
      e.participants.some(
        (p) => p.user?.id === user?.id && p.status === "pending"
      )
    );
    const upcomingTasks = taskDeadlines.filter(
      (t) => t.status !== "done" && new Date(t.due_date) >= new Date()
    );
    const overdueTasks = taskDeadlines.filter(
      (t) => t.status !== "done" && new Date(t.due_date) < new Date()
    );
    const progDeadlines = programmeDeadlines.filter(
      (p) => new Date(p.end_date) >= new Date()
    );

    return {
      totalEvents,
      meetings,
      pendingInvites: myInvites,
      upcomingTasks,
      overdueTasks,
      progDeadlines,
    };
  }, [events, taskDeadlines, programmeDeadlines, user?.id]);

  // ─── RSVP ──────────────────────────────────────────────────────

  async function handleRsvp(eventId: string, status: string) {
    try {
      const res = await fetch(`/api/calendar/${eventId}/rsvp`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(`RSVP: ${status}`);
        fetchData();
        if (selectedEvent?.id === eventId) {
          setShowEventDetail(false);
          setSelectedEvent(null);
        }
      }
    } catch (err) {
      console.error("RSVP error:", err);
    }
  }

  // ─── Delete event ──────────────────────────────────────────────

  async function handleDelete(eventId: string) {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/calendar/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Event deleted");
        setShowEventDetail(false);
        setSelectedEvent(null);
        fetchData();
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  // ─── Toast ─────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ─── View header label ─────────────────────────────────────────

  const headerLabel = useMemo(() => {
    if (view === "day") return fmtFull(currentDate.toISOString());
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      return `${fmtDate(ws.toISOString())} \u2014 ${fmtDate(we.toISOString())}, ${we.getFullYear()}`;
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [currentDate, view]);

  // ─── Scroll to current hour on day/week ────────────────────────

  useEffect(() => {
    if ((view === "day" || view === "week") && scrollRef.current) {
      const now = new Date();
      const scrollTo = Math.max(0, (now.getHours() - 1) * 64);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, [view]);

  // ─── Render ────────────────────────────────────────────────────

  return (
 <div className="flex flex-col" style={{ minHeight: "calc(100vh - 5rem)" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
            <CalendarIcon className="h-5 w-5 text-background" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold">Calendar</h1>
            <p className="text-xs text-muted-foreground">{headerLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Create event */}
          <button
            onClick={() => {
              setEditingEvent(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Event
          </button>

          {/* Mobile summary toggle */}
          <button
            onClick={() => setShowMobileSummary(true)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Target className="h-3.5 w-3.5" />
            Summary
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Calendar area */}
        <div className="flex-1 overflow-auto" ref={scrollRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-6 w-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : view === "month" ? (
            <MonthView
              currentDate={currentDate}
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(d)}
              getEventsForDay={getEventsForDay}
              getTasksForDay={getTasksForDay}
              getProgDeadlinesForDay={getProgDeadlinesForDay}
              onEventClick={(e) => {
                setSelectedEvent(e);
                setShowEventDetail(true);
              }}
            />
          ) : view === "week" ? (
            <WeekView
              currentDate={currentDate}
              events={events}
              onEventClick={(e) => {
                setSelectedEvent(e);
                setShowEventDetail(true);
              }}
              onSlotClick={(d) => {
                setCurrentDate(d);
                setSelectedDate(d);
                setEditingEvent(null);
                setShowCreateModal(true);
              }}
            />
          ) : (
            <DayView
              currentDate={currentDate}
              events={events}
              taskDeadlines={taskDeadlines}
              onEventClick={(e) => {
                setSelectedEvent(e);
                setShowEventDetail(true);
              }}
              onSlotClick={(hour) => {
                const d = new Date(currentDate);
                d.setHours(hour, 0, 0, 0);
                setSelectedDate(d);
                setEditingEvent(null);
                setShowCreateModal(true);
              }}
            />
          )}
        </div>

        {/* Summary Panel - Desktop */}
        <div className="w-72 xl:w-80 border-l border-border overflow-y-auto hidden lg:block">
          <SummaryPanel
            view={view}
            currentDate={currentDate}
            selectedDate={selectedDate}
            summary={summaryData}
            events={events}
            taskDeadlines={taskDeadlines}
            programmeDeadlines={programmeDeadlines}
            userId={user?.id || ""}
            onRsvp={handleRsvp}
            onEventClick={(e) => {
              setSelectedEvent(e);
              setShowEventDetail(true);
            }}
          />
        </div>
      </div>

      {/* Summary Panel - Mobile Overlay */}
      {showMobileSummary && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowMobileSummary(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-background shadow-xl overflow-y-auto animate-fade-in">
            <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border bg-background z-10">
              <h3 className="text-sm font-display font-bold">Summary</h3>
              <button
                onClick={() => setShowMobileSummary(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SummaryPanel
              view={view}
              currentDate={currentDate}
              selectedDate={selectedDate}
              summary={summaryData}
              events={events}
              taskDeadlines={taskDeadlines}
              programmeDeadlines={programmeDeadlines}
              userId={user?.id || ""}
              onRsvp={(eventId, status) => {
                handleRsvp(eventId, status);
                setShowMobileSummary(false);
              }}
              onEventClick={(e) => {
                setSelectedEvent(e);
                setShowEventDetail(true);
                setShowMobileSummary(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <EventModal
          event={editingEvent}
          defaultDate={selectedDate}
          onClose={() => {
            setShowCreateModal(false);
            setEditingEvent(null);
          }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditingEvent(null);
            fetchData();
            showToast(editingEvent ? "Event updated" : "Event created");
          }}
        />
      )}

      {/* Event Detail Drawer */}
      {showEventDetail && selectedEvent && (
        <EventDetail
          event={selectedEvent}
          userId={user?.id || ""}
          isAdmin={["admin", "super_admin"].includes(profile?.role || "")}
          onClose={() => {
            setShowEventDetail(false);
            setSelectedEvent(null);
          }}
          onRsvp={(status) => handleRsvp(selectedEvent.id, status)}
          onEdit={() => {
            setEditingEvent(selectedEvent);
            setShowEventDetail(false);
            setShowCreateModal(true);
          }}
          onDelete={() => handleDelete(selectedEvent.id)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MONTH VIEW
// ═══════════════════════════════════════════════════════════════════

function MonthView({
  currentDate,
  selectedDate,
  onSelectDate,
  getEventsForDay,
  getTasksForDay,
  getProgDeadlinesForDay,
  onEventClick,
}: {
  currentDate: Date;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  getEventsForDay: (d: Date) => CalendarEvent[];
  getTasksForDay: (d: Date) => TaskDeadline[];
  getProgDeadlinesForDay: (d: Date) => ProgrammeDeadline[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const days = getMonthDays(currentDate);
  const today = new Date();

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-xs font-medium text-muted-foreground text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);
          const dayEvents = getEventsForDay(day);
          const dayTasks = getTasksForDay(day);
          const dayProgs = getProgDeadlinesForDay(day);
          const totalItems = dayEvents.length + dayTasks.length + dayProgs.length;

          return (
            <div
              key={i}
              onClick={() => onSelectDate(day)}
              className={`border-b border-r border-border p-1 min-h-[80px] cursor-pointer transition-colors group ${
                isCurrentMonth ? "bg-background" : "bg-muted/20"
              } ${isSelected ? "ring-2 ring-inset ring-foreground/30" : ""} hover:bg-muted/30`}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? "bg-foreground text-background"
                      : isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {day.getDate()}
                </span>
                {totalItems > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{totalItems - 3}
                  </span>
                )}
              </div>

              {/* Events (max 3 visible) */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: (EVENT_COLORS[ev.event_type] || ev.color) + "18",
                      color: EVENT_COLORS[ev.event_type] || ev.color,
                      borderLeft: `2px solid ${EVENT_COLORS[ev.event_type] || ev.color}`,
                    }}
                  >
                    {ev.all_day ? "" : fmtTime(ev.start_time) + " "}{ev.title}
                  </button>
                ))}
                {dayTasks.slice(0, Math.max(0, 3 - dayEvents.length)).map((t) => (
                  <div
                    key={t.id}
                    className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate"
                    style={{
                      backgroundColor: PRIORITY_COLORS[t.priority] + "18",
                      color: PRIORITY_COLORS[t.priority],
                      borderLeft: `2px solid ${PRIORITY_COLORS[t.priority]}`,
                    }}
                  >
                    <CheckSquare className="inline h-2.5 w-2.5 mr-0.5" />
                    {t.title}
                  </div>
                ))}
                {dayProgs
                  .slice(0, Math.max(0, 3 - dayEvents.length - dayTasks.length))
                  .map((p) => (
                    <div
                      key={p.id}
                      className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate bg-amber-50 text-amber-700"
                      style={{ borderLeft: "2px solid #D97706" }}
                    >
                      <Briefcase className="inline h-2.5 w-2.5 mr-0.5" />
                      {p.name} ends
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════════════════════════

function WeekView({
  currentDate,
  events,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (d: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();

  return (
    <div className="flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border sticky top-0 bg-background z-10">
        <div className="border-r border-border" />
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={i}
              className={`text-center py-2 border-r border-border ${
                isToday ? "bg-muted/30" : ""
              }`}
            >
              <div className="text-[10px] text-muted-foreground uppercase">
                {DAYS[d.getDay()]}
              </div>
              <div
                className={`text-sm font-bold ${
                  isToday
                    ? "bg-foreground text-background w-7 h-7 rounded-full flex items-center justify-center mx-auto"
                    : ""
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour grid */}
      <div className="relative">
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border/50 h-16"
          >
            <div className="text-[10px] text-muted-foreground pr-2 text-right pt-1 border-r border-border">
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
            </div>
            {weekDays.map((d, di) => (
              <div
                key={di}
                className="border-r border-border/50 relative cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => {
                  const slot = new Date(d);
                  slot.setHours(hour, 0, 0, 0);
                  onSlotClick(slot);
                }}
              />
            ))}
          </div>
        ))}

        {/* Event overlays */}
        {events
          .filter((e) => !e.all_day)
          .map((ev) => {
            const start = new Date(ev.start_time);
            const end = new Date(ev.end_time);
            const dayIndex = weekDays.findIndex((d) => isSameDay(d, start));
            if (dayIndex === -1) return null;

            const startMinutes = start.getHours() * 60 + start.getMinutes();
            const endMinutes = end.getHours() * 60 + end.getMinutes();
            const duration = Math.max(endMinutes - startMinutes, 30);
            const top = (startMinutes / 60) * 64;
            const height = (duration / 60) * 64;
            const left = `calc(60px + ${(dayIndex / 7) * 100}% * (7/7))`;

            return (
              <button
                key={ev.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(ev);
                }}
                className="absolute rounded-md px-1.5 py-1 text-[10px] font-medium text-white overflow-hidden hover:opacity-90 transition-opacity z-10"
                style={{
                  top: `${top}px`,
                  height: `${height}px`,
                  left: `calc(60px + ${(dayIndex * (100 / 7))}%)`,
                  width: `calc(${100 / 7}% - 4px)`,
                  backgroundColor: EVENT_COLORS[ev.event_type] || ev.color || "#000",
                }}
              >
                <div className="truncate">{ev.title}</div>
                <div className="truncate opacity-80">
                  {fmtTime(ev.start_time)}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DAY VIEW
// ═══════════════════════════════════════════════════════════════════

function DayView({
  currentDate,
  events,
  taskDeadlines,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  taskDeadlines: TaskDeadline[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (hour: number) => void;
}) {
  const dayEvents = events.filter((e) =>
    isSameDay(new Date(e.start_time), currentDate)
  );
  const allDayEvents = dayEvents.filter((e) => e.all_day);
  const timedEvents = dayEvents.filter((e) => !e.all_day);
  const dayTasks = taskDeadlines.filter((t) => t.due_date === fmt(currentDate));

  return (
    <div className="flex flex-col">
      {/* All-day events + tasks */}
      {(allDayEvents.length > 0 || dayTasks.length > 0) && (
        <div className="border-b border-border px-4 py-2 space-y-1">
          <div className="text-[10px] text-muted-foreground uppercase font-medium mb-1">
            All Day & Deadlines
          </div>
          {allDayEvents.map((ev) => (
            <button
              key={ev.id}
              onClick={() => onEventClick(ev)}
              className="block w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{
                backgroundColor: EVENT_COLORS[ev.event_type] || ev.color,
              }}
            >
              {ev.title}
            </button>
          ))}
          {dayTasks.map((t) => (
            <div
              key={t.id}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
              style={{
                backgroundColor: PRIORITY_COLORS[t.priority] + "18",
                color: PRIORITY_COLORS[t.priority],
              }}
            >
              <CheckSquare className="h-3 w-3" />
              {t.title}
              <span className="ml-auto text-[10px] opacity-60">
                {t.priority}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Hour grid */}
      <div className="relative">
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="flex border-b border-border/50 h-16 cursor-pointer hover:bg-muted/10 transition-colors"
            onClick={() => onSlotClick(hour)}
          >
            <div className="w-16 shrink-0 text-[10px] text-muted-foreground text-right pr-3 pt-1 border-r border-border">
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
            </div>
            <div className="flex-1 relative" />
          </div>
        ))}

        {/* Event overlays */}
        {timedEvents.map((ev) => {
          const start = new Date(ev.start_time);
          const end = new Date(ev.end_time);
          const startMinutes = start.getHours() * 60 + start.getMinutes();
          const endMinutes = end.getHours() * 60 + end.getMinutes();
          const duration = Math.max(endMinutes - startMinutes, 30);
          const top = (startMinutes / 60) * 64;
          const height = (duration / 60) * 64;

          return (
            <button
              key={ev.id}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(ev);
              }}
              className="absolute left-16 right-4 rounded-lg px-3 py-1.5 text-xs font-medium text-white overflow-hidden hover:opacity-90 transition-opacity z-10"
              style={{
                top: `${top}px`,
                height: `${height}px`,
                backgroundColor: EVENT_COLORS[ev.event_type] || ev.color || "#000",
              }}
            >
              <div className="font-semibold truncate">{ev.title}</div>
              <div className="opacity-80 text-[10px]">
                {fmtTime(ev.start_time)} \u2013 {fmtTime(ev.end_time)}
                {ev.location && ` \u2022 ${ev.location}`}
              </div>
            </button>
          );
        })}

        {/* Current time indicator */}
        {isSameDay(currentDate, new Date()) && (
          <div
            className="absolute left-16 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
            style={{
              top: `${((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * 64}px`,
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -mt-[5px] -ml-[5px]" />
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY PANEL
// ═══════════════════════════════════════════════════════════════════

function SummaryPanel({
  view,
  currentDate,
  selectedDate,
  summary,
  events,
  taskDeadlines,
  programmeDeadlines,
  userId,
  onRsvp,
  onEventClick,
}: {
  view: ViewMode;
  currentDate: Date;
  selectedDate: Date;
  summary: any;
  events: CalendarEvent[];
  taskDeadlines: TaskDeadline[];
  programmeDeadlines: ProgrammeDeadline[];
  userId: string;
  onRsvp: (eventId: string, status: string) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const viewLabel =
    view === "day" ? "Today" : view === "week" ? "This Week" : "This Month";

  // For day view, filter to selected day
  const filteredEvents = useMemo(() => {
    if (view === "day") {
      return events.filter((e) =>
        isSameDay(new Date(e.start_time), selectedDate)
      );
    }
    return events;
  }, [events, view, selectedDate]);

  const upcomingEvents = filteredEvents
    .filter((e) => new Date(e.start_time) >= new Date())
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    .slice(0, 5);

  return (
    <div className="p-4 space-y-5">
      {/* Summary title */}
      <div>
        <h3 className="text-sm font-display font-bold">{viewLabel} Summary</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {view === "day"
            ? fmtFull(selectedDate.toISOString())
            : view === "week"
            ? `${fmtDate(startOfWeek(currentDate).toISOString())} \u2013 ${fmtDate(endOfWeek(currentDate).toISOString())}`
            : `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border p-3">
          <div className="text-lg font-bold font-display">
            {summary.totalEvents}
          </div>
          <div className="text-[10px] text-muted-foreground">Events</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-lg font-bold font-display">
            {summary.meetings}
          </div>
          <div className="text-[10px] text-muted-foreground">Meetings</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-lg font-bold font-display">
            {summary.upcomingTasks.length}
          </div>
          <div className="text-[10px] text-muted-foreground">Task Due</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-lg font-bold font-display text-red-600">
            {summary.overdueTasks.length}
          </div>
          <div className="text-[10px] text-muted-foreground">Overdue</div>
        </div>
      </div>

      {/* Pending invites */}
      {summary.pendingInvites.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Pending Invites ({summary.pendingInvites.length})
          </h4>
          <div className="space-y-2">
            {summary.pendingInvites.map((ev: CalendarEvent) => (
              <div
                key={ev.id}
                className="rounded-xl border border-border p-2.5 space-y-2"
              >
                <button
                  onClick={() => onEventClick(ev)}
                  className="text-xs font-semibold hover:underline text-left w-full"
                >
                  {ev.title}
                </button>
                <div className="text-[10px] text-muted-foreground">
                  {fmtDate(ev.start_time)} \u2022 {fmtTime(ev.start_time)}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onRsvp(ev.id, "accepted")}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-foreground text-background text-[10px] font-medium hover:bg-foreground/90 transition-colors"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    onClick={() => onRsvp(ev.id, "tentative")}
                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[10px] font-medium hover:bg-muted transition-colors"
                  >
                    <HelpCircle className="h-3 w-3" />
                    Maybe
                  </button>
                  <button
                    onClick={() => onRsvp(ev.id, "declined")}
                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2">Upcoming</h4>
          <div className="space-y-1.5">
            {upcomingEvents.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onEventClick(ev)}
                className="w-full text-left rounded-xl border border-border p-2.5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-8 rounded-full shrink-0"
                    style={{
                      backgroundColor: EVENT_COLORS[ev.event_type] || ev.color,
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {ev.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {fmtTime(ev.start_time)} \u2013 {fmtTime(ev.end_time)}
                      {ev.meeting_platform && (
                        <span className="ml-1">
                          \u2022{" "}
                          {PLATFORM_ICONS[ev.meeting_platform]?.label ||
                            "Online"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Task deadlines */}
      {summary.upcomingTasks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Task Deadlines
          </h4>
          <div className="space-y-1.5">
            {summary.upcomingTasks.slice(0, 5).map((t: TaskDeadline) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: PRIORITY_COLORS[t.priority] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{t.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Due {fmtDate(t.due_date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Programme deadlines */}
      {summary.progDeadlines.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Programme Deadlines
          </h4>
          <div className="space-y-1.5">
            {summary.progDeadlines.map((p: ProgrammeDeadline) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-2"
              >
                <Briefcase className="h-3 w-3 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-amber-700">
                    Ends {fmtDate(p.end_date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EVENT DETAIL DRAWER
// ═══════════════════════════════════════════════════════════════════

function EventDetail({
  event,
  userId,
  isAdmin,
  onClose,
  onRsvp,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  userId: string;
  isAdmin: boolean;
  onClose: () => void;
  onRsvp: (status: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCreator = event.created_by === userId;
  const canManage = isCreator || isAdmin;
  const myParticipant = event.participants.find(
    (p) => p.user?.id === userId
  );
  const accepted = event.participants.filter((p) => p.status === "accepted");
  const pending = event.participants.filter((p) => p.status === "pending");
  const declined = event.participants.filter((p) => p.status === "declined");

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-background shadow-xl overflow-y-auto animate-fade-in">
        {/* Header */}
        <div
          className="p-6 text-white"
          style={{
            backgroundColor: EVENT_COLORS[event.event_type] || event.color || "#000",
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-[10px] uppercase tracking-wider opacity-80">
              {event.event_type}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 className="text-xl font-display font-bold">{event.title}</h2>
          <div className="flex items-center gap-2 mt-2 text-sm opacity-90">
            <Clock className="h-3.5 w-3.5" />
            {event.all_day ? (
              <span>All Day \u2022 {fmtFull(event.start_time)}</span>
            ) : (
              <span>
                {fmtFull(event.start_time)} \u2022 {fmtTime(event.start_time)}{" "}
                \u2013 {fmtTime(event.end_time)}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* RSVP for invited users */}
          {myParticipant && myParticipant.status === "pending" && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
              <div className="text-xs font-semibold text-amber-800 mb-2">
                You are invited to this event
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onRsvp("accepted")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium"
                >
                  <Check className="h-3 w-3" />
                  Accept
                </button>
                <button
                  onClick={() => onRsvp("tentative")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium"
                >
                  <HelpCircle className="h-3 w-3" />
                  Maybe
                </button>
                <button
                  onClick={() => onRsvp("declined")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 text-xs font-medium text-red-600"
                >
                  <X className="h-3 w-3" />
                  Decline
                </button>
              </div>
            </div>
          )}

          {myParticipant && myParticipant.status !== "pending" && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Your RSVP:</span>
              <span
                className={`px-2 py-0.5 rounded-full font-medium ${
                  myParticipant.status === "accepted"
                    ? "bg-green-100 text-green-700"
                    : myParticipant.status === "declined"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {myParticipant.status}
              </span>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase font-medium mb-1">
                Description
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {/* Meeting link */}
          {event.meeting_link && (
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground shrink-0" />
              <a
                href={event.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline flex items-center gap-1"
                style={{
                  color:
                    PLATFORM_ICONS[event.meeting_platform || "other"]?.color ||
                    "#000",
                }}
              >
                {PLATFORM_ICONS[event.meeting_platform || "other"]?.label ||
                  "Join Meeting"}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Visibility */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {event.visibility === "everyone" ? (
              <>
                <Eye className="h-4 w-4" />
                <span>Visible to everyone</span>
              </>
            ) : (
              <>
                <EyeOff className="h-4 w-4" />
                <span>Invited only</span>
              </>
            )}
          </div>

          {/* Programme */}
          {event.programme && (
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>{event.programme.name}</span>
            </div>
          )}

          {/* Creator */}
          {event.creator && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                {event.creator.full_name?.charAt(0) || "?"}
              </div>
              <span className="text-muted-foreground">
                Created by{" "}
                <span className="text-foreground font-medium">
                  {event.creator.full_name}
                </span>
              </span>
            </div>
          )}

          {/* Participants */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium mb-2">
              Participants ({event.participants.length})
            </div>

            {accepted.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] text-green-600 font-medium mb-1">
                  Accepted ({accepted.length})
                </div>
                {accepted.map((p) => (
                  <ParticipantRow key={p.id} participant={p} />
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] text-amber-600 font-medium mb-1">
                  Pending ({pending.length})
                </div>
                {pending.map((p) => (
                  <ParticipantRow key={p.id} participant={p} />
                ))}
              </div>
            )}

            {declined.length > 0 && (
              <div>
                <div className="text-[10px] text-red-600 font-medium mb-1">
                  Declined ({declined.length})
                </div>
                {declined.map((p) => (
                  <ParticipantRow key={p.id} participant={p} />
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {canManage && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
              >
                <Edit2 className="h-3 w-3" />
                Edit
              </button>
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantRow({ participant }: { participant: Participant }) {
  if (!participant.user) return null;
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
        {participant.user.full_name?.charAt(0) || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">
          {participant.user.full_name}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {participant.user.email}
        </div>
      </div>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
          participant.status === "accepted"
            ? "bg-green-100 text-green-700"
            : participant.status === "declined"
            ? "bg-red-100 text-red-700"
            : participant.status === "tentative"
            ? "bg-amber-100 text-amber-700"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {participant.status}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EVENT CREATE/EDIT MODAL
// ═══════════════════════════════════════════════════════════════════

function EventModal({
  event,
  defaultDate,
  onClose,
  onSaved,
}: {
  event: CalendarEvent | null;
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!event;

  const defaultStart = event
    ? event.start_time.slice(0, 16)
    : (() => {
        const d = new Date(defaultDate);
        d.setMinutes(0, 0, 0);
        if (d < new Date()) {
          d.setHours(new Date().getHours() + 1);
        }
        return d.toISOString().slice(0, 16);
      })();

  const defaultEnd = event
    ? event.end_time.slice(0, 16)
    : (() => {
        const d = new Date(defaultStart);
        d.setHours(d.getHours() + 1);
        return d.toISOString().slice(0, 16);
      })();

  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [eventType, setEventType] = useState(event?.event_type || "meeting");
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [allDay, setAllDay] = useState(event?.all_day || false);
  const [location, setLocation] = useState(event?.location || "");
  const [meetingLink, setMeetingLink] = useState(event?.meeting_link || "");
  const [meetingPlatform, setMeetingPlatform] = useState(
    event?.meeting_platform || ""
  );
  const [visibility, setVisibility] = useState(
    event?.visibility || "everyone"
  );
  const [selectedUsers, setSelectedUsers] = useState<string[]>(
    event?.participants.map((p) => p.user?.id || "").filter(Boolean) || []
  );
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);

  // Load users
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/calendar/users");
        if (!res.ok) {
          // Fallback: use search API
          const searchRes = await fetch("/api/search?q=a");
          if (searchRes.ok) {
            const data = await searchRes.json();
            const users = data.results
              .filter((r: any) => r.type === "user")
              .map((r: any) => ({
                id: r.id,
                full_name: r.title,
                email: r.subtitle.split(" \u2022 ")[1] || "",
                avatar_url: null,
              }));
            setAllUsers(users);
          }
          return;
        }
        const data = await res.json();
        setAllUsers(data);
      } catch {}
    }
    loadUsers();
  }, []);

  // Auto-detect platform from link
  useEffect(() => {
    if (!meetingLink) {
      setMeetingPlatform("");
      return;
    }
    if (meetingLink.includes("meet.google.com")) setMeetingPlatform("google_meet");
    else if (meetingLink.includes("zoom.us") || meetingLink.includes("zoom.com")) setMeetingPlatform("zoom");
    else if (meetingLink.includes("wa.me") || meetingLink.includes("whatsapp") || meetingLink.includes("chat.whatsapp")) setMeetingPlatform("whatsapp");
    else if (meetingLink.includes("teams.microsoft") || meetingLink.includes("teams.live")) setMeetingPlatform("teams");
    else setMeetingPlatform("other");
  }, [meetingLink]);

  async function handleSubmit() {
    if (!title.trim() || !startTime || !endTime) return;
    setIsSaving(true);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      event_type: eventType,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      all_day: allDay,
      location: location.trim() || null,
      meeting_link: meetingLink.trim() || null,
      meeting_platform: meetingPlatform || null,
      visibility,
      participant_ids: selectedUsers,
    };

    try {
      const url = isEditing ? `/api/calendar/${event!.id}` : "/api/calendar";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSaved();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save event");
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  }

  const filteredUsers = allUsers.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-bold">
              {isEditing ? "Edit Event" : "New Event"}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Title *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Team standup, Q1 Review..."
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            {/* Event type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Type
              </label>
              <div className="flex gap-2">
                {["meeting", "event", "deadline", "reminder"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setEventType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      eventType === t
                        ? "bg-foreground text-background border-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* All day toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-medium">All day event</span>
            </label>

            {/* Date/time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Start *
                </label>
                <input
                  type={allDay ? "date" : "datetime-local"}
                  value={allDay ? startTime.split("T")[0] : startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  End *
                </label>
                <input
                  type={allDay ? "date" : "datetime-local"}
                  value={allDay ? endTime.split("T")[0] : endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Add details about this event..."
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
              />
            </div>

            {/* Location */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                <MapPin className="inline h-3 w-3 mr-1" />
                Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Conference Room A, Lagos Office..."
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            {/* Meeting link */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                <Link2 className="inline h-3 w-3 mr-1" />
                Meeting Link
              </label>
              <input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              {meetingPlatform && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Video className="h-3 w-3" style={{ color: PLATFORM_ICONS[meetingPlatform]?.color }} />
                  <span className="text-[10px] font-medium" style={{ color: PLATFORM_ICONS[meetingPlatform]?.color }}>
                    {PLATFORM_ICONS[meetingPlatform]?.label} detected
                  </span>
                </div>
              )}
            </div>

            {/* Visibility */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Visibility
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setVisibility("everyone")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    visibility === "everyone"
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  Everyone
                </button>
                <button
                  onClick={() => setVisibility("invited_only")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    visibility === "invited_only"
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <EyeOff className="h-3 w-3" />
                  Invited Only
                </button>
              </div>
            </div>

            {/* Invite participants */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                <Users className="inline h-3 w-3 mr-1" />
                Invite People
              </label>
              <div className="relative">
                <input
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setShowUserPicker(true);
                  }}
                  onFocus={() => setShowUserPicker(true)}
                  placeholder="Search by name or email..."
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />

                {showUserPicker && filteredUsers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto z-10">
                    {filteredUsers.map((u) => {
                      const isSelected = selectedUsers.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedUsers(
                                selectedUsers.filter((id) => id !== u.id)
                              );
                            } else {
                              setSelectedUsers([...selectedUsers, u.id]);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted transition-colors ${
                            isSelected ? "bg-muted/50" : ""
                          }`}
                        >
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                            {u.full_name?.charAt(0) || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">
                              {u.full_name}
                            </div>
                            <div className="text-muted-foreground truncate">
                              {u.email}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected users */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedUsers.map((uid) => {
                    const u = allUsers.find((u) => u.id === uid);
                    if (!u) return null;
                    return (
                      <span
                        key={uid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium"
                      >
                        {u.full_name}
                        <button
                          onClick={() =>
                            setSelectedUsers(
                              selectedUsers.filter((id) => id !== uid)
                            )
                          }
                          className="hover:text-red-600 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSubmit}
                disabled={isSaving || !title.trim()}
                className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                {isSaving
                  ? "Saving..."
                  : isEditing
                  ? "Update Event"
                  : "Create Event"}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}