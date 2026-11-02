import { useState, useEffect } from "react";

export type DeviceMode = "desktop" | "mobile";

export interface DeviceInfo {
  readonly isMobile: boolean;
  readonly isDesktop: boolean;
  readonly mode: DeviceMode;
  readonly toggleMode: () => void;
  readonly setMode: (mode: DeviceMode) => void;
}

const MOBILE_BREAKPOINT = 768;

export function useDeviceMode(): DeviceInfo {
  const [mode, setMode] = useState<DeviceMode>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth <= MOBILE_BREAKPOINT ? "mobile" : "desktop";
    }
    return "desktop";
  });

  useEffect(() => {
    const handleResize = () => {
      const detected = window.innerWidth <= MOBILE_BREAKPOINT ? "mobile" : "desktop";
      setMode(detected);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleMode = () => {
    setMode((prev) => (prev === "desktop" ? "mobile" : "desktop"));
  };

  return {
    isMobile: mode === "mobile",
    isDesktop: mode === "desktop",
    mode,
    toggleMode,
    setMode,
  };
}
