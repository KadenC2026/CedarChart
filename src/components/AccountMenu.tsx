import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useApp } from "../state/AppContext";

export default function AccountMenu() {
  const auth = useAuth();
  const { syncStatus } = useApp();
  const [open, setOpen] = useState(auth.pendingEmailLink);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (auth.pendingEmailLink) setOpen(true);
  }, [auth.pendingEmailLink]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (auth.user) {
    return (
      <div className="account-menu" ref={menuRef}>
        <button className="account-trigger signed-in" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span className="account-avatar">{(auth.user.displayName || auth.user.email || "A").charAt(0).toUpperCase()}</span>
          <span>{auth.user.displayName || auth.user.email}</span>
        </button>
        {open && (
          <div className="account-popover">
            <strong>Signed in</strong>
            <span>{auth.user.email}</span>
            <p>{syncStatus === "synced" ? "Cloud saved." : syncStatus === "saving" ? "Saving to your account…" : syncStatus === "loading" ? "Loading your cloud plan…" : syncStatus === "error" ? "Cloud sync is unavailable. Changes are cached in this browser." : "Using local storage."}</p>
            <button className="secondary-button" onClick={() => void auth.signOut()}>Sign out</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button className="account-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Sign in
      </button>
      {open && (
        <div className="account-popover">
          <strong>Save cedar to your account</strong>
          <p>Continue with Google to save and sync your cedar plan.</p>
          <button className="google-sign-in" disabled={auth.loading || !auth.configured} onClick={() => void auth.signInWithGoogle()}>
            <span aria-hidden="true">G</span> Continue with Google
          </button>
          {!auth.configured && <p className="account-setup-note">Sign-in will turn on after the Firebase environment values are added in Vercel.</p>}
          {auth.message && <p className="method-note" aria-live="polite">{auth.message}</p>}
          <small>Google handles authentication; cedar never sees your password.</small>
        </div>
      )}
    </div>
  );
}
