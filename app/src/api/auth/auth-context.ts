import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Result } from "../types";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Result<{ user: User }>>;
  signOut: () => Promise<Result>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
