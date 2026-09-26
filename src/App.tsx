//! Sublix App root — detects which window and renders the appropriate view.
//!
//! Routing:
//! - `overlay` window → OverlayView (subtitle overlay)
//! - `main` window:
//!   - First run (no STT installed) → OnboardingView
//!   - Otherwise → SettingsView
//!
//! The user can leave OnboardingView at any time and return via Settings
//! (re-call `checkSetup` shows updated state).

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SettingsView from "./views/SettingsView";
import OverlayView from "./views/OverlayView";
import OnboardingView from "./views/OnboardingView";
import { sublix } from "./lib/tauri";
import "./App.css";

type Phase = "loading" | "onboarding" | "settings";

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    // Get current window label (Tauri 2 API — sync)
    try {
      const label = getCurrentWindow().label;
      setWindowLabel(label);
    } catch {
      setWindowLabel("main");
    }
  }, []);

  // When main window mounts, check setup state to decide first view
  useEffect(() => {
    if (windowLabel === null) return;
    if (windowLabel === "overlay") {
      setPhase("settings"); // unused for overlay, but avoids stuck loading
      return;
    }
    (async () => {
      try {
        const s = await sublix.checkSetup();
        setPhase(s.is_first_run ? "onboarding" : "settings");
      } catch (e) {
        console.error("checkSetup failed, defaulting to settings:", e);
        setPhase("settings");
      }
    })();
  }, [windowLabel]);

  // While loading, show a tiny placeholder
  if (windowLabel === null || phase === "loading") {
    return <div className="app-loading">Sublix</div>;
  }

  if (windowLabel === "overlay") {
    return <OverlayView />;
  }

  if (phase === "onboarding") {
    return <OnboardingView onComplete={() => setPhase("settings")} />;
  }

  return <SettingsView />;
}

export default App;
