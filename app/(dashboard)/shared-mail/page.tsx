"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  RefreshCw,
  Clock,
  User,
  AlertCircle,
  Sparkles,
  Reply,
  Tag,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface EmailThread {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  from: { name: string; email: string };
  date: string;
  isUnread: boolean;
  labelIds: string[];
  messagesCount: number;
}

interface Classification {
  importance: string;
  category: string;
  summary: string;
  suggestedActions: string[];
  draftReply: string | null;
}

interface EmailWithClassification extends EmailThread {
  classification?: Classification;
}

const IMPORTANCE_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  important: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  partnerships: "bg-purple-100 text-purple-700",
  funding: "bg-green-100 text-green-700",
  programme: "bg-blue-100 text-blue-700",
  media: "bg-pink-100 text-pink-700",
  finance: "bg-yellow-100 text-yellow-700",
  general: "bg-gray-100 text-gray-700",
  spam: "bg-red-100 text-red-700",
};

export default function SharedMailPage() {
  const { profile, user, isLoading: authLoading } = useAuth();
  const [threads, setThreads] = useState<EmailWithClassification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  
  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Check group access
  useEffect(() => {
    const checkGroupAccess = async () => {
      if (!user?.id) {
        setCheckingAccess(false);
        return;
      }

      if (profile?.role === "admin" || profile?.role === "super_admin") {
        setHasAccess(true);
        setCheckingAccess(false);
        return;
      }

      const supabase = createClient();
      const { data } = await supabase
        .from("group_members")
        .select("group:groups(name)")
        .eq("user_id", user.id);

      const groupNames: string[] = [];
if (data) {
  for (const gm of data) {
    const group = gm.group as unknown;
    if (Array.isArray(group) && group[0]?.name) {
      groupNames.push(group[0].name);
    } else if (group && typeof group === "object" && "name" in group) {
      groupNames.push((group as { name: string }).name);
    }
  }
}

      setHasAccess(groupNames.includes("shared_mail_admin"));
      setCheckingAccess(false);
    };

    if (!authLoading) {
      checkGroupAccess();
    }
  }, [user?.id, profile?.role, authLoading]);

  // Fetch threads
  useEffect(() => {
    const fetchThreads = async () => {
      if (!hasAccess) return;

      try {
        const response = await fetch("/api/gmail/threads");
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        setThreads(data.threads || []);
        
       // Auto-analyze after fetching (admin/super_admin only to preserve Gemini quota)
        if (data.threads && data.threads.length > 0 && (profile?.role === "admin" || profile?.role === "super_admin")) {
        analyzeEmails(data.threads);
      }
      } catch (err) {
        setError("Failed to load emails.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (!checkingAccess && hasAccess) {
      fetchThreads();
    } else if (!checkingAccess && !hasAccess) {
      setIsLoading(false);
    }
  }, [hasAccess, checkingAccess]);

  const analyzeEmails = async (emailThreads: EmailWithClassification[]) => {
    setIsAnalyzing(true);
    
    const threadsToAnalyze = emailThreads.slice(0, 15);
const updatedThreads: EmailWithClassification[] = [...emailThreads];

    for (let i = 0; i < threadsToAnalyze.length; i++) {
      const thread = threadsToAnalyze[i];
      
      try {
        const response = await fetch("/api/gmail/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: thread.subject,
            from: thread.from.email,
            body: thread.snippet,
          }),
        });

        if (response.ok) {
          const classification = await response.json();
          const threadIndex = updatedThreads.findIndex((t) => t.id === thread.id);
          if (threadIndex !== -1) {
            updatedThreads[threadIndex] = {
              ...updatedThreads[threadIndex],
              classification,
            };
            // Update state progressively
            setThreads([...updatedThreads]);
          }
        }
      } catch (err) {
        console.error("Error classifying thread:", err);
      }
    }

    setIsAnalyzing(false);
    setAnalysisComplete(true);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setAnalysisComplete(false);
    
    try {
      const response = await fetch("/api/gmail/threads");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setThreads(data.threads || []);
      
      if (data.threads && data.threads.length > 0) {
        analyzeEmails(data.threads);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredThreads = filter === "unread" 
    ? threads.filter((t) => t.isUnread) 
    : threads;

  const totalCount = threads.length;
  const unreadCount = threads.filter((t) => t.isUnread).length;

  // AI Analytics
  const classifiedThreads = threads.filter((t) => t.classification);
  const urgentCount = classifiedThreads.filter((t) => t.classification?.importance === "urgent").length;
  const toReplyCount = classifiedThreads.filter((t) => t.classification?.draftReply !== null).length;
  
  const categoryBreakdown = classifiedThreads.reduce((acc, t) => {
    const cat = t.classification?.category || "general";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
handleRefresh
  const topCategories = Object.entries(categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return diffMins <= 1 ? "Just now" : `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  if (authLoading || checkingAccess) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border-2 border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-border bg-muted">
          <Mail className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h2 className="mt-4 text-xl font-bold">Access Required</h2>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          You need to be in the Shared Mail Admin group.
        </p>
        <Link href="/" className="mt-4">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Shared Mail
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            impact@tekforall.org inbox
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing || isAnalyzing}
          variant="outline"
          className="border-2 shadow-retro-sm"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total */}
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border bg-muted">
              <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCount}</p>
              <p className="font-mono text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </div>

        {/* Unread */}
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-blue-200 bg-blue-50">
              <Clock className="h-5 w-5 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-2xl font-bold">{unreadCount}</p>
              <p className="font-mono text-xs text-muted-foreground">Unread</p>
            </div>
          </div>
        </div>

        {/* Urgent */}
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border-2 border-red-200 bg-white">
              <AlertCircle className="h-5 w-5 text-red-600" strokeWidth={1.5} />
              <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-red-400" />
            </div>
            <div>
              {isAnalyzing && !analysisComplete ? (
                <Loader2 className="h-6 w-6 animate-spin text-red-400" />
              ) : (
                <p className="text-2xl font-bold text-red-700">{urgentCount}</p>
              )}
              <p className="font-mono text-xs text-red-600">Urgent</p>
            </div>
          </div>
        </div>

        {/* To Reply */}
        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4 shadow-retro-sm">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border-2 border-orange-200 bg-white">
              <Reply className="h-5 w-5 text-orange-600" strokeWidth={1.5} />
              <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-orange-400" />
            </div>
            <div>
              {isAnalyzing && !analysisComplete ? (
                <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
              ) : (
                <p className="text-2xl font-bold text-orange-700">{toReplyCount}</p>
              )}
              <p className="font-mono text-xs text-orange-600">To Reply</p>
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {topCategories.length > 0 && (
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <p className="font-mono text-xs font-medium text-muted-foreground">
              Categories
            </p>
            {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {topCategories.map(([category, count]) => (
              <span
                key={category}
                className={`rounded-full px-3 py-1 font-mono text-xs font-medium ${CATEGORY_COLORS[category] || "bg-gray-100 text-gray-700"}`}
              >
                {category}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          onClick={() => setFilter("all")}
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          className={`border-2 ${filter === "all" ? "border-foreground bg-foreground text-background" : ""}`}
        >
          All {totalCount}
        </Button>
        <Button
          onClick={() => setFilter("unread")}
          variant={filter === "unread" ? "default" : "outline"}
          size="sm"
          className={`border-2 ${filter === "unread" ? "border-foreground bg-foreground text-background" : ""}`}
        >
          Unread {unreadCount}
        </Button>
      </div>

      {/* Email List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border-2 border-border bg-card" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      ) : filteredThreads.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12">
          <Mail className="h-12 w-12 text-muted-foreground" strokeWidth={1} />
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            {filter === "unread" ? "No unread emails." : "No emails found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredThreads.map((thread) => (
            <Link key={thread.id} href={`/shared-mail/${thread.id}`}>
              <div
                className={`group flex items-start gap-4 rounded-xl border-2 p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-retro ${
                  thread.isUnread
                    ? "border-blue-200 bg-blue-50/50"
                    : "border-border bg-card"
                }`}
              >
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-border bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`truncate ${thread.isUnread ? "font-bold" : "font-medium"}`}>
                      {thread.from.name || thread.from.email}
                    </p>
                    {thread.isUnread && (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}
                    {thread.messagesCount > 1 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">
                        {thread.messagesCount}
                      </span>
                    )}
                  </div>
                  <p className={`truncate text-sm ${thread.isUnread ? "font-medium" : ""}`}>
                    {thread.subject}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {thread.snippet}
                  </p>
                  
                  {/* Classification badges */}
                  {thread.classification && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                          IMPORTANCE_COLORS[thread.classification.importance]
                        }`}
                      >
                        {thread.classification.importance}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                          CATEGORY_COLORS[thread.classification.category]
                        }`}
                      >
                        {thread.classification.category}
                      </span>
                    </div>
                  )}
                </div>

                {/* Time & Arrow */}
                <div className="flex flex-col items-end gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDate(thread.date)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}