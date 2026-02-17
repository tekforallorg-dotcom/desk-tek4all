"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  role: "member" | "manager" | "admin" | "super_admin";
  must_change_password: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log("AuthProvider: Starting...");
    const supabase = createClient();

    const loadUser = async () => {
      try {
        console.log("AuthProvider: Calling getUser...");
        const { data, error } = await supabase.auth.getUser();
        
        console.log("AuthProvider: getUser result:", { user: data.user?.email, error });
        
        if (error) {
          console.error("AuthProvider: getUser error:", error);
          setIsLoading(false);
          return;
        }

        if (!data.user) {
          console.log("AuthProvider: No user found");
          setIsLoading(false);
          return;
        }

        setUser(data.user);
        console.log("AuthProvider: User set, fetching profile for:", data.user.id);

        // Fetch profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

        console.log("AuthProvider: Profile result:", { profileData, profileError });

        if (profileData) {
          setProfile(profileData);
        }
      } catch (err) {
        console.error("AuthProvider: Unexpected error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("AuthProvider: Auth state change:", event, session?.user?.email);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  console.log("AuthProvider: Rendering with:", { 
    hasUser: !!user, 
    hasProfile: !!profile, 
    isLoading 
  });

  return (
    <AuthContext.Provider value={{ user, profile, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}