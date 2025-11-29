"use client";

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { tauriCommands, type UpdateInfo, type DownloadProgress } from "@/lib/tauri/commands";
import { Loader2, Download, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

export function UpdaterListener() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Listen for update-available event from backend
    const unlistenUpdate = listen<UpdateInfo>("update-available", (event) => {
      setUpdateAvailable(event.payload);
      setShowModal(true);
      toast.info("New update available!");
    });

    // Listen for download progress
    const unlistenProgress = listen<DownloadProgress>("download-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlistenUpdate.then((f) => f());
      unlistenProgress.then((f) => f());
    };
  }, []);

  const handleDownload = async () => {
    if (!updateAvailable) return;

    try {
      setDownloading(true);
      const installerPath = await tauriCommands.updates.downloadUpdate(
        updateAvailable.download_url
      );

      // Install update
      await tauriCommands.updates.installUpdate(installerPath);
    } catch (error) {
      console.error("Failed to update:", error);
      toast.error("Failed to download update");
      setDownloading(false);
    }
  };

  if (!showModal || !updateAvailable) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 m-4 border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Update Available
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Version {updateAvailable.latest_version} is available.
            </p>
          </div>
          {!downloading && (
            <button
              onClick={() => setShowModal(false)}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-6 max-h-48 overflow-y-auto">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Release Notes:
          </p>
          <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans">
            {updateAvailable.release_notes}
          </pre>
        </div>

        {downloading ? (
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Downloading...</span>
              <span>{progress ? Math.round(progress.percentage) : 0}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progress?.percentage || 0}%` }}
              />
            </div>
            <p className="text-xs text-center text-gray-500">
              The app will restart automatically when finished.
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setShowModal(false)}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Later
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Update Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
