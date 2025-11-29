import { useEffect, useRef, useState } from "react";

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  minLength?: number;
  endChar?: string; // Character that signals end of scan (usually 'Enter')
  timeThreshold?: number; // Max time between keystrokes (ms)
}

export function useBarcodeScanner({
  onScan,
  minLength = 3,
  endChar = "Enter",
  timeThreshold = 50, // Scanners are fast, usually < 50ms per char
}: UseBarcodeScannerOptions) {
  const buffer = useRef<string>("");
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime.current;

      // If time difference is too large, reset buffer (manual typing vs scanner)
      if (buffer.current.length > 0 && timeDiff > timeThreshold) {
        buffer.current = "";
      }

      lastKeyTime.current = currentTime;

      if (event.key === endChar) {
        if (buffer.current.length >= minLength) {
          onScan(buffer.current);
          buffer.current = "";
          // Prevent default action (e.g., form submission) if it was a scan
          event.preventDefault();
        }
      } else if (event.key.length === 1) {
        // Only append printable characters
        buffer.current += event.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onScan, minLength, endChar, timeThreshold]);
}
