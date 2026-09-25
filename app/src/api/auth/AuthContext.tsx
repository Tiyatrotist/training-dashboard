import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { onAuthChange, signIn as apiSignIn, signOut as apiSignOut } from "../supabase/auth";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null>(null);
  // Ob überhaupt schon ein Ereignis verarbeitet wurde — unterscheidet den
  // ALLERERSTEN Aufruf (Ausgangslage, s. Kommentar unten) von einem echten
  // späteren Wechsel, ohne dafür `lastUserId` selbst mit einem dritten
  // Zustand zu überladen.
  const hasKnownIdentity = useRef(false);

  useEffect(() => {
    // Session-Herkunft bewusst NUR onAuthChange, kein zusätzliches
    // getCurrentSession() daneben (frühere Fassung): zwei unabhängig
    // tickende Promises für dieselbe zugrundeliegende Session konnten sich
    // überholen — Supabase feuert onAuthStateChange beim Abonnieren SOFORT
    // einmal mit der aktuellen Session ("INITIAL_SESSION"), das lief bei
    // bereits bestehender Session reproduzierbar VOR dem separaten
    // getCurrentSession()-Promise durch. Das ließ den Cache einer gerade
    // erst geladenen Fahrten-Query sofort wieder verwerfen (queryClient.
    // clear() unten, fälschlich als "Kontowechsel" erkannt) — die Seite
    // blieb dauerhaft auf "Lädt …" hängen, weil danach kein neuer
    // Ladeversuch mehr angestoßen wurde (nur ein Tab-Wechsel/Neu-Mount half).
    // Live mit Playwright reproduziert: 5/5 eingeloggt hängend, 0/8
    // ausgeloggt. Eine einzige Quelle schließt die Race strukturell, statt
    // sie nur abzufangen — zusätzlich verhinderte die zweite Quelle nebenbei
    // noch einen zweiten, ähnlichen Fehler: ein spät auflösendes
    // getCurrentSession() konnte eine inzwischen von onAuthChange bereits
    // korrekt gesetzte NEUERE Session mit einem veralteten Stand überschreiben.
    const subscription = onAuthChange((next) => {
      const nextUserId = next?.user?.id ?? null;
      // Kontowechsel oder Logout: den gesamten Query-Cache verwerfen.
      //
      // Ein Teil der Caches ist user-gebunden (Check-in, Profil, Schreib-
      // Berechtigung) und dürfte den Nutzerwechsel ohnehin nicht überleben.
      // Der Rest ist zwar athletengebunden und öffentlich lesbar, kann aber
      // unter einer Session MEHR enthalten haben als danach — RLS liefert
      // einem Trainer Vorschläge und Check-ins seines Athleten, einem
      // Ausgeloggten nicht. Ohne dieses Leeren bliebe das nach dem Logout
      // sichtbar, bis eine Query von selbst veraltet.
      //
      // Nie beim ALLERERSTEN Ereignis (hasKnownIdentity noch false) — das
      // ist die Ausgangslage, kein Wechsel.
      if (hasKnownIdentity.current && nextUserId !== lastUserId.current) {
        queryClient.clear();
      }
      hasKnownIdentity.current = true;
      lastUserId.current = nextUserId;
      setSession(next);
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, [queryClient]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: apiSignIn,
    signOut: apiSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
