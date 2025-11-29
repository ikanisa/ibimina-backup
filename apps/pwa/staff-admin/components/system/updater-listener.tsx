"use client";

import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "@/providers/toast-provider";

export function UpdaterListener() {
  const toast = useToast();

  useEffect(() => {
    let unlistenCheck: (() => void) | undefined;
    let unlistenAvailable: (() => void) | undefined;

    const setupListeners = async () => {
      // Listen for "Check for Updates" from System Tray
      unlistenCheck = await listen("check-updates", async () => {
        try {
          toast.info("Checking for updates...");
          const update = await check();
          if (update?.available) {
            const yes = await ask(
              `Update to ${update.version} is available!\n\nRelease notes: ${update.body}`,
              {
                title: "Update Available",
                kind: "info",
                okLabel: "Update",
                cancelLabel: "Cancel",
              }
            );
            if (yes) {
              await update.downloadAndInstall();
              await relaunch();
            }
          } else {
            await message("You are on the latest version.", {
              title: "No Updates Available",
              kind: "info",
            });
          }
        } catch (error) {
          console.error("Failed to check for updates:", error);
          toast.error("Failed to check for updates");
        }
      });

      // Listen for "update-available" event from backend (auto-check on startup)
      unlistenAvailable = await listen("update-available", async (event: any) => {
        const updateInfo = event.payload;
        toast.info(`Update available: ${updateInfo.version}`);
        // The backend check might be simpler, so we re-run the plugin check to get the full object
        // or we could just prompt here if we had the full metadata.
        // For consistency, we'll trigger the same flow as manual check.
        const update = await check();
        if (update?.available) {
          const yes = await ask(
            `Update to ${update.version} is available!\n\nRelease notes: ${update.body}`,
            {
              title: "Update Available",
              kind: "info",
              okLabel: "Update",
              cancelLabel: "Cancel",
            }
          );
          if (yes) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      });
    };

    setupListeners();

    return () => {
      unlistenCheck?.();
      unlistenAvailable?.();
    };
  }, [toast]);

  return null;
}
