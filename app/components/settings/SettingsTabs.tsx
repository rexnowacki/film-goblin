"use client";

import { Children, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

const TABS = [
  { id: "your-face", label: "Your Face" },
  { id: "whispers", label: "Whispers" },
  { id: "appetite", label: "Appetite" },
  { id: "keys", label: "Keys" },
  { id: "final-rites", label: "Final Rites", danger: true },
] as const;

export default function SettingsTabs({ children }: { children: ReactNode }) {
  const panels = Children.toArray(children);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const index = TABS.findIndex(tab => tab.id === hash);
    if (index >= 0) setActiveIndex(index);
  }, []);

  function activate(index: number, moveFocus = false) {
    setActiveIndex(index);
    const tab = TABS[index];
    window.history.replaceState(null, "", `#${tab.id}`);
    if (moveFocus) document.getElementById(`settings-tab-${tab.id}`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    activate(next, true);
  }

  return (
    <div className="settings-tabs" id="settings-tabs">
      <div className="settings-pill-nav" role="tablist" aria-label="Settings sections">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={index === activeIndex ? 0 : -1}
            data-danger={"danger" in tab && tab.danger ? "true" : undefined}
            onClick={() => activate(index)}
            onKeyDown={event => onKeyDown(event, index)}
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {TABS.map((tab, index) => (
        <div
          key={tab.id}
          id={`settings-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab.id}`}
          hidden={index !== activeIndex}
          className="settings-tab-panel"
        >
          {panels[index]}
        </div>
      ))}
    </div>
  );
}
