"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    // Log the sign-in action
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "user_login",
        details: { email },
      });
    }

    // Get redirect URL or default to dashboard
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "/";

    router.push(redirect);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      {/* Login Card */}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-foreground shadow-retro">
            <Moon className="h-7 w-7 text-background" strokeWidth={1.5} />
          </div>
          <div className="mt-4 text-center">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Tek4All
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              MoonDesk
            </h1>
          </div>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border-2 border-border bg-card p-8 shadow-retro">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-foreground">Welcome back</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@tekforall.org"
                required
                className="border-2 border-border bg-background font-mono text-sm shadow-retro-sm transition-shadow focus:shadow-retro"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                  className="border-2 border-border bg-background pr-10 font-mono text-sm shadow-retro-sm transition-shadow focus:shadow-retro"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-foreground px-5 py-3 font-semibold text-background shadow-retro transition-all hover:shadow-retro-lg hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-retro"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center font-mono text-xs text-muted-foreground">
          Contact your administrator if you need access.
        </p>
      </div>

      {/* Bottom branding */}
      <p className="mt-12 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        © 2026 Tek4All 
      </p>
    </div>
  );
}