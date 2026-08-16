//! Sublix App root — detects which window and renders the appropriate view.
//!
//! - `main` window → SettingsView (control panel)
//! - `overlay` window → OverlayView (subtitle overlay)

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SettingsView from "./views/SettingsView";
import OverlayView from "./views/OverlayView";
import "./App.css";

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    // Get current window label (Tauri 2 API — sync)
    try {
      const label = getCurrentWindow().label;
      setWindowLabel(label);
    } catch {
      setWindowLabel("main");
    }
  }, []);

  // While loading, show a tiny placeholder
  if (windowLabel === null) {
    return <div className="app-loading">Sublix</div>;
  }

  if (windowLabel === "overlay") {
    return <OverlayView />;
  }

  return <SettingsView />;
}

export default App;
