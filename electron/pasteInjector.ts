import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import util from 'node:util';

const execFilePromise = util.promisify(execFile);

let restoreTimer: NodeJS.Timeout | null = null;

/**
 * Performs Win32 keystroke injection (Ctrl+V) without creating or dropping
 * any script files (.vbs / .bat) to disk, preventing antivirus
 * false-positive alerts (Windows Defender / AMSI / EDR).
 *
 * Returns true if the keystroke command was delivered to the OS. Note this
 * cannot confirm the target app actually accepted the paste (e.g. elevated
 * admin windows silently reject synthetic keys from non-elevated apps due
 * to UIPI) — so the transcript is always left in the clipboard for a while
 * as a manual Ctrl+V fallback.
 */
async function triggerWin32Paste(): Promise<boolean> {
  try {
    // Clean inline PowerShell SendWait call without touching disk.
    // Cold start is ~400-800ms on first use; allow generous timeout so a
    // busy system doesn't silently drop the only paste attempt.
    await execFilePromise('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle', 'Hidden',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`
    ], { timeout: 5000 });
    return true;
  } catch (err) {
    console.warn('[PasteInjector] Keystroke injection failed (text left in clipboard for manual paste):', err);
    return false;
  }
}

export async function pasteText(text: string): Promise<boolean> {
  if (!text || text.trim().length === 0) return false;

  // Check if clipboard previously held plain text to prevent wiping images/files
  let previousText: string | null = null;
  let hadPlainText = false;

  try {
    hadPlainText = clipboard.has('text/plain');
    if (hadPlainText) {
      previousText = clipboard.readText();
    }
  } catch {}

  // Write new transcript to clipboard
  clipboard.writeText(text);

  // 80ms synchronization buffer: 15ms was too short and the OS clipboard
  // queue hadn't always propagated before SendKeys fired, causing silent
  // paste misses on busier systems.
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Re-verify clipboard still holds our text (something may have raced us),
  // then trigger Ctrl+V exactly once — never double-send, which would paste
  // the transcript twice in apps that did receive the first attempt.
  try {
    if (clipboard.readText() !== text) {
      clipboard.writeText(text);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  } catch {}

  const delivered = await triggerWin32Paste();

  // Cancel any pending clipboard restore from a rapid previous dictation
  if (restoreTimer) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }

  // Restore previous plain-text clipboard after 15s (was 2s) if untouched.
  // 2s was too short: when auto-paste missed (e.g. UIPI-blocked elevated
  // window), users had almost no window to press Ctrl+V manually.
  restoreTimer = setTimeout(() => {
    try {
      if (hadPlainText && previousText !== null && clipboard.readText() === text) {
        clipboard.writeText(previousText);
      }
    } catch {}
    restoreTimer = null;
  }, 15000);

  return delivered;
}
