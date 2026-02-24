// DESTINATION: app/(dashboard)/crm/new/page.tsx
// WHY: Stakeholder creation form with inline contact persons, duplicate email detection, tag input, validation

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  Loader2,
  UserPlus,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useCrmRole } from "@/lib/hooks/use-crm-role";
import type { StakeholderType, StakeholderStatus } from "@/lib/types/stakeholder";
import { STAKEHOLDER_TYPE_LABELS, STAKEHOLDER_STATUS_LABELS } from "@/lib/types/stakeholder";

// ── Types ─────────────────────────────────────────────────────

interface ContactPerson {
  id: string; // client-only key
  name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
}

interface DuplicateWarning {
  field: string;
  value: string;
  match_name: string;
  match_id: string;
}

// ── Page Component ────────────────────────────────────────────

export default function NewStakeholderPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { isEditor, isLoading: roleLoading } = useCrmRole();

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<StakeholderType>("partner");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<StakeholderStatus>("active");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Contact persons
  const [contacts, setContacts] = useState<ContactPerson[]>([]);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateWarning[]>([]);
  const [showDupeWarning, setShowDupeWarning] = useState(false);



  // ── Duplicate detection ─────────────────────────────────────

  const checkDuplicates = useCallback(async () => {
    if (!email && !name) return [];
    const supabase = createClient();
    const warnings: DuplicateWarning[] = [];

    // Exact email match
    if (email) {
      const { data } = await supabase
        .from("stakeholders")
        .select("id, name, email")
        .ilike("email", email)
        .limit(1);

      if (data && data.length > 0) {
        warnings.push({
          field: "email",
          value: email,
          match_name: data[0].name,
          match_id: data[0].id,
        });
      }
    }

    // Fuzzy name match (simple contains for now — pg_trgm powers the real search)
    if (name.length >= 3) {
      const { data } = await supabase
        .from("stakeholders")
        .select("id, name")
        .ilike("name", `%${name}%`)
        .limit(3);

      if (data && data.length > 0) {
        data.forEach((s) => {
          // Skip if it's the same as email match
          if (!warnings.some((w) => w.match_id === s.id)) {
            warnings.push({
              field: "name",
              value: name,
              match_name: s.name,
              match_id: s.id,
            });
          }
        });
      }
    }

    return warnings;
  }, [email, name]);

  // ── Tag handling ────────────────────────────────────────────

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // ── Contact person CRUD ─────────────────────────────────────

  const addContact = () => {
    setContacts([
      ...contacts,
      {
        id: crypto.randomUUID(),
        name: "",
        role: "",
        email: "",
        phone: "",
        is_primary: contacts.length === 0, // first one is primary by default
      },
    ]);
  };

  const updateContact = (id: string, field: keyof ContactPerson, value: string | boolean) => {
    setContacts(
      contacts.map((c) => {
        if (c.id === id) {
          return { ...c, [field]: value };
        }
        // If setting primary, unset others
        if (field === "is_primary" && value === true) {
          return { ...c, is_primary: false };
        }
        return c;
      })
    );
  };

  const removeContact = (id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    // If we removed the primary, make the first one primary
    if (updated.length > 0 && !updated.some((c) => c.is_primary)) {
      updated[0].is_primary = true;
    }
    setContacts(updated);
  };

  // ── Validation ──────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Organisation name is required";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Invalid email format";
    }
    if (website && !website.startsWith("http")) {
      errs.website = "Website must start with http:// or https://";
    }

    // Validate contacts
    contacts.forEach((c, idx) => {
      if (!c.name.trim()) {
        errs[`contact_${idx}_name`] = `Contact ${idx + 1} name is required`;
      }
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ────────────────────────────────────────────────────

  const handleSave = async (forceSave = false) => {
    if (!validate()) return;
    if (!user) return;

    // Check duplicates first (unless force-saving past warning)
    if (!forceSave) {
      const dupes = await checkDuplicates();
      if (dupes.length > 0) {
        // Block on exact email match
        const emailDupe = dupes.find((d) => d.field === "email");
        if (emailDupe) {
          setErrors({
            email: `This email is already used by "${emailDupe.match_name}"`,
          });
          return;
        }
        // Warn on fuzzy name match
        setDuplicates(dupes);
        setShowDupeWarning(true);
        return;
      }
    }

    setIsSaving(true);
    setShowDupeWarning(false);

    try {
      const supabase = createClient();

      // Insert stakeholder
      const { data: stakeholder, error } = await supabase
        .from("stakeholders")
        .insert({
          name: name.trim(),
          type,
          category: category.trim() || null,
          status,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          website: website.trim() || null,
          notes: notes.trim() || null,
          tags,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error || !stakeholder) {
        console.error("Error creating stakeholder:", error);
        setErrors({ form: "Failed to create stakeholder. Please try again." });
        setIsSaving(false);
        return;
      }

      // Insert contacts
      if (contacts.length > 0) {
        const contactRows = contacts
          .filter((c) => c.name.trim())
          .map((c) => ({
            stakeholder_id: stakeholder.id,
            name: c.name.trim(),
            role: c.role.trim() || null,
            email: c.email.trim() || null,
            phone: c.phone.trim() || null,
            is_primary: c.is_primary,
          }));

        if (contactRows.length > 0) {
          const { error: contactError } = await supabase
            .from("stakeholder_contacts")
            .insert(contactRows);

          if (contactError) {
            console.error("Error creating contacts:", contactError);
            // Non-fatal — stakeholder is already created
          }
        }
      }

      router.push(`/crm/${stakeholder.id}`);
    } catch (err) {
      console.error("Unexpected error:", err);
      setErrors({ form: "An unexpected error occurred." });
      setIsSaving(false);
    }
  };

  // ── Guard: must be manager+ ─────────────────────────────────

  if (roleLoading) {
    return (
      <div className="flex min-h-400px items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isEditor) {
    return (
      <div className="flex min-h-400px items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">
          You need manager or admin access to create stakeholders.
        </p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/crm">
          <Button variant="outline" size="icon" className="border-2 shadow-retro-sm">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Add Stakeholder
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            Create a new stakeholder record.
          </p>
        </div>
      </div>

      {/* Form error */}
      {errors.form && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {errors.form}
        </div>
      )}

      {/* Duplicate warning modal */}
      {showDupeWarning && duplicates.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <h3 className="font-bold text-amber-800">Possible duplicates found</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-700">
                {duplicates.map((d, i) => (
                  <li key={i}>
                    Similar {d.field}: &quot;{d.match_name}&quot; —{" "}
                    <Link
                      href={`/crm/${d.match_id}`}
                      className="underline hover:text-amber-900"
                      target="_blank"
                    >
                      view
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDupeWarning(false)}
                  className="border-amber-300"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave(true)}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  Create Anyway
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Organisation Details ────────────────────────────── */}
      <section className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
        <h2 className="text-lg font-bold text-foreground">Organisation Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Name */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Organisation Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ford Foundation"
              className={cn("border-2 shadow-retro-sm", errors.name && "border-red-400")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as StakeholderType)}
              className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
            >
              {Object.entries(STAKEHOLDER_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StakeholderStatus)}
              className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
            >
              {Object.entries(STAKEHOLDER_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Category
            </label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. International NGO, Tech Company, Government Ministry"
              className="border-2 shadow-retro-sm"
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@organisation.org"
              className={cn("border-2 shadow-retro-sm", errors.email && "border-red-400")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Phone
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 800 000 0000"
              className="border-2 shadow-retro-sm"
            />
          </div>

          {/* Website */}
          <div>
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Website
            </label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://organisation.org"
              className={cn("border-2 shadow-retro-sm", errors.website && "border-red-400")}
            />
            {errors.website && (
              <p className="mt-1 text-xs text-red-500">{errors.website}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Address
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="City, Country"
              className="border-2 shadow-retro-sm"
            />
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional context about this stakeholder..."
              className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm shadow-retro-sm focus:outline-none"
            />
          </div>

          {/* Tags */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tags
            </label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag and press Enter"
                className="border-2 shadow-retro-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addTag}
                className="border-2 shadow-retro-sm"
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 hover:text-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Contact Persons ─────────────────────────────────── */}
      <section className="rounded-2xl border-2 border-border bg-card p-6 shadow-retro-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Contact Persons</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addContact}
            className="border-2 shadow-retro-sm"
          >
            <UserPlus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Add Contact
          </Button>
        </div>

        {contacts.length === 0 ? (
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            No contact persons added. Click "Add Contact" to add key people at this organisation.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {contacts.map((contact, idx) => (
              <div
                key={contact.id}
                className="rounded-xl border-2 border-border bg-background p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      Contact {idx + 1}
                    </span>
                    {contact.is_primary && (
                      <span className="flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] text-background">
                        <Star className="h-3 w-3" />
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!contact.is_primary && (
                      <button
                        onClick={() => updateContact(contact.id, "is_primary", true)}
                        className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Set Primary
                      </button>
                    )}
                    <button
                      onClick={() => removeContact(contact.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Full Name *
                    </label>
                    <Input
                      value={contact.name}
                      onChange={(e) => updateContact(contact.id, "name", e.target.value)}
                      placeholder="John Doe"
                      className={cn(
                        "border-2 shadow-retro-sm",
                        errors[`contact_${idx}_name`] && "border-red-400"
                      )}
                    />
                    {errors[`contact_${idx}_name`] && (
                      <p className="mt-1 text-xs text-red-500">
                        {errors[`contact_${idx}_name`]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Role / Title
                    </label>
                    <Input
                      value={contact.role}
                      onChange={(e) => updateContact(contact.id, "role", e.target.value)}
                      placeholder="Programme Director"
                      className="border-2 shadow-retro-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Email
                    </label>
                    <Input
                      type="email"
                      value={contact.email}
                      onChange={(e) => updateContact(contact.id, "email", e.target.value)}
                      placeholder="john@organisation.org"
                      className="border-2 shadow-retro-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Phone
                    </label>
                    <Input
                      value={contact.phone}
                      onChange={(e) => updateContact(contact.id, "phone", e.target.value)}
                      placeholder="+234 800 000 0000"
                      className="border-2 shadow-retro-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Actions ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-2xl border-2 border-border bg-card p-4 shadow-retro-sm">
        <Link href="/crm">
          <Button variant="outline" className="border-2 shadow-retro-sm">
            Cancel
          </Button>
        </Link>
        <Button
          onClick={() => handleSave(false)}
          disabled={isSaving}
          className="border-2 border-foreground bg-foreground text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Create Stakeholder
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Local cn helper ───────────────────────────────────────────

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}