import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "./firebase";

const EMAIL_STORAGE_KEY = "cedar-mit-email";

export function isMitEmail(email: string) {
  return /^[^@\s]+@mit\.edu$/i.test(email.trim());
}

type AuthValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  pendingEmailLink: boolean;
  message: string | null;
  signInWithGoogle: () => Promise<void>;
  sendMitEmailLink: (email: string) => Promise<void>;
  finishMitEmailLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearMessage: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

function cleanAuthUrl() {
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [pendingEmailLink, setPendingEmailLink] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseAuth) return;
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!firebaseAuth || !isSignInWithEmailLink(firebaseAuth, window.location.href)) return;
    const savedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    if (!savedEmail) {
      setPendingEmailLink(true);
      setMessage("Enter the same MIT email address to finish signing in.");
      return;
    }
    setLoading(true);
    signInWithEmailLink(firebaseAuth, savedEmail, window.location.href)
      .then(() => {
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        cleanAuthUrl();
        setMessage("Signed in. Your Cedar plan will now sync to this account.");
      })
      .catch(() => setMessage("That sign-in link is invalid or expired. Request a new one."))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(() => ({
    configured: firebaseConfigured,
    loading,
    user,
    pendingEmailLink,
    message,
    clearMessage: () => setMessage(null),
    async signInWithGoogle() {
      if (!firebaseAuth) {
        setMessage("Cloud sign-in is not configured yet.");
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(firebaseAuth, provider);
        setMessage("Signed in. Your Cedar plan will now sync to this account.");
      } catch (error: any) {
        if (error?.code !== "auth/popup-closed-by-user") setMessage("Google sign-in could not be completed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    async sendMitEmailLink(email: string) {
      if (!firebaseAuth) {
        setMessage("Cloud sign-in is not configured yet.");
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!isMitEmail(normalizedEmail)) {
        setMessage("Use an @mit.edu email address.");
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        await sendSignInLinkToEmail(firebaseAuth, normalizedEmail, {
          url: `${window.location.origin}${window.location.pathname}`,
          handleCodeInApp: true,
        });
        window.localStorage.setItem(EMAIL_STORAGE_KEY, normalizedEmail);
        setMessage(`Check ${normalizedEmail} for a sign-in link.`);
      } catch {
        setMessage("The sign-in email could not be sent. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    async finishMitEmailLink(email: string) {
      if (!firebaseAuth || !isSignInWithEmailLink(firebaseAuth, window.location.href)) return;
      const normalizedEmail = email.trim().toLowerCase();
      if (!isMitEmail(normalizedEmail)) {
        setMessage("Use the same @mit.edu email address that received this link.");
        return;
      }
      setLoading(true);
      try {
        await signInWithEmailLink(firebaseAuth, normalizedEmail, window.location.href);
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        cleanAuthUrl();
        setPendingEmailLink(false);
        setMessage("Signed in. Your Cedar plan will now sync to this account.");
      } catch {
        setMessage("That sign-in link is invalid or expired. Request a new one.");
      } finally {
        setLoading(false);
      }
    },
    async signOut() {
      if (firebaseAuth) await firebaseSignOut(firebaseAuth);
      setMessage("Signed out. Cedar is using this browser's local plan.");
    },
  }), [loading, message, pendingEmailLink, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
