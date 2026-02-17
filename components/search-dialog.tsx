"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  CheckSquare,
  FolderKanban,
  User,
  MessageSquare,
  Loader2,
} from "lucide-react";

interface SearchResult {
  type: "task" | "programme" | "user" | "message";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_CONFIG = {
  task: { icon: CheckSquare, label: "Task" },
  programme: { icon: FolderKanban, label: "Programme" },
  user: { icon: User, label: "User" },
  message: { icon: MessageSquare, label: "Message" },
};

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard shortcut to open (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!isOpen) {
          // Parent needs to handle opening - this is just for the shortcut hint
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      setResults(data.results || []);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 300);
  };

  const handleSelect = (result: SearchResult) => {
    onClose();
    router.push(result.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>(
    (acc, result) => {
      if (!acc[result.type]) acc[result.type] = [];
      acc[result.type].push(result);
      return acc;
    },
    {}
  );

  // Flatten for index tracking
  let flatIndex = 0;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-100 bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-[15%] z-101 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2">
        <div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-retro-lg">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b-2 border-border px-4 py-3">
            <Search
              className="h-5 w-5 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search tasks, programmes, people, messages…"
              className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {isSearching && (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                strokeWidth={1.5}
              />
            )}
            <button
              onClick={onClose}
              className="flex h-6 items-center rounded border-2 border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            >
              ESC
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {query.length < 2 ? (
              <div className="px-4 py-8 text-center">
                <p className="font-mono text-sm text-muted-foreground">
                  Type at least 2 characters to search…
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground/60">
                  Search across tasks, programmes, team members, and messages
                </p>
              </div>
            ) : results.length === 0 && !isSearching ? (
              <div className="px-4 py-8 text-center">
                <p className="font-mono text-sm text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground/60">
                  Try a different search term
                </p>
              </div>
            ) : (
              <div className="py-2">
                {Object.entries(grouped).map(([type, typeResults]) => {
                  const config =
                    TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
                  return (
                    <div key={type}>
                      {/* Section header */}
                      <p className="px-4 pb-1 pt-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        {config.label}s
                      </p>

                      {typeResults.map((result) => {
                        const currentIndex = flatIndex++;
                        const isSelected = currentIndex === selectedIndex;
                        const Icon = config.icon;

                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => handleSelect(result)}
                            onMouseEnter={() =>
                              setSelectedIndex(currentIndex)
                            }
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              isSelected
                                ? "bg-muted"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-background">
                              <Icon
                                className="h-4 w-4 text-muted-foreground"
                                strokeWidth={1.5}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {result.title}
                              </p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {result.subtitle}
                              </p>
                            </div>
                            {isSelected && (
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                ↵ open
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-4 border-t-2 border-border bg-background px-4 py-2">
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <kbd className="rounded border border-border bg-card px-1">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <kbd className="rounded border border-border bg-card px-1">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <kbd className="rounded border border-border bg-card px-1">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}