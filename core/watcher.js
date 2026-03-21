const { execFileSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const session = require('./session');

// App category map
const CATEGORIES = {
  // Productive
  'code': 'productive',
  'visual studio code': 'productive',
  'cursor': 'productive',
  'webstorm': 'productive',
  'terminal': 'productive',
  'windows terminal': 'productive',
  'windowsterminal': 'productive',
  'powershell': 'productive',
  'cmd': 'productive',
  'iterm': 'productive',
  'notion': 'productive',
  'figma': 'productive',
  'xcode': 'productive',
  'android studio': 'productive',
  'intellij': 'productive',
  'pycharm': 'productive',
  'sublime text': 'productive',
  'notepad++': 'productive',
  'electron': 'productive',

  // Browser (detailed by Chrome extension)
  'chrome': 'browser',
  'google chrome': 'browser',
  'firefox': 'browser',
  'safari': 'browser',
  'edge': 'browser',
  'msedge': 'browser',
  'microsoft edge': 'browser',
  'brave': 'browser',
  'opera': 'browser',

  // Distractions
  'steam': 'distraction',
  'discord': 'distraction',
  'spotify': 'distraction',
  'netflix': 'distraction',
  'whatsapp': 'distraction',
  'telegram': 'distraction',
  'slack': 'distraction',
  'instagram': 'distraction',
  'twitter': 'distraction',
  'tiktok': 'distraction',
};

let lastApp = null;
let watcherInterval = null;
let psScriptPath = null;
let broadcastFn = null;

function categorizeApp(appName) {
  if (!appName) return 'neutral';
  const lower = appName.toLowerCase();
  for (const [key, category] of Object.entries(CATEGORIES)) {
    if (lower.includes(key)) return category;
  }
  return 'neutral';
}

function createPsScript() {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class MFWin32 {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
try {
  $hwnd = [MFWin32]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 256
  [void][MFWin32]::GetWindowText($hwnd, $sb, 256)
  $title = $sb.ToString()
  $procId = [uint32]0
  [void][MFWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($proc) { Write-Host "$($proc.ProcessName)|||$title" }
  else { Write-Host "Unknown|||$title" }
} catch { Write-Host "Unknown|||Error" }
`;
  const tmpDir = path.join(require('os').tmpdir(), 'mindforge');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const scriptPath = path.join(tmpDir, 'get_active_window.ps1');
  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

function getActiveWindowWindows() {
  try {
    const result = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath,
    ], { timeout: 3000, encoding: 'utf8', windowsHide: true }).trim();

    const sepIdx = result.indexOf('|||');
    if (sepIdx === -1) return null;
    const processName = result.substring(0, sepIdx).trim();
    const title = result.substring(sepIdx + 3).trim();
    return (processName && processName !== 'Unknown') ? { processName, title } : null;
  } catch {
    return null;
  }
}

/**
 * Send a native OS notification (Reliable PowerShell MessageBox)
 */
function sendNotification(title, body) {
  try {
    const safeTitle = title.replace(/'/g, "''");
    const safeBody = body.replace(/'/g, "''");
    const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${safeBody}', '${safeTitle}', 'OK', 'Warning')`;
    exec(`powershell.exe -NoProfile -WindowStyle Hidden -Command "${ps}"`, (err) => {
      // Ignore errors from the background ps process
    });
    console.log(`[Notification] Pop-up sent: ${title}`);
  } catch (err) {
    console.log(`[Notification] ${title}: ${body}`); 
  }
}

/**
 * Start polling — writes to SESSION MEMORY (not Supabase)
 * Only records events when a session is active
 */
async function startWatcher(broadcast) {
  broadcastFn = broadcast || (() => {});
  psScriptPath = createPsScript();
  console.log('[Watcher] PowerShell script ready');

  watcherInterval = setInterval(() => {
    // Only record when session is active
    if (!session.isActive()) return;

    try {
      const win = getActiveWindowWindows();
      const config = session.getConfig();

      if (!win) {
        session.addEvent('system', 'Idle', null, 'idle', true);
        if (lastApp !== 'Idle') {
          console.log('[Watcher] ▸ Idle');
          lastApp = 'Idle';
        }
        return;
      }

      const appName = win.processName;
      const title = win.title;
      
      // Determine if app is customized physically or defaulting
      let isAllowed = false;
      const lowerApp = appName.toLowerCase();
      if (config.allowedApps && config.allowedApps.some(a => lowerApp.includes(a))) {
        isAllowed = true;
      }

      // Default categorization
      let category = categorizeApp(appName);
      if (isAllowed) category = 'productive';

      // Always add to session memory (heartbeat every 2s)
      session.addEvent('system', appName, null, category, false);

      // Log only on app change
      if (appName !== lastApp) {
        console.log(`[Watcher] ▸ ${appName} (${category}) — "${title}"`);
        lastApp = appName;
        
        // Handle new distraction app focused — ONE notification only
        if (category === 'distraction') {
          session.setViolationStart(appName, Date.now());
          
          if (config.mode === 'exam') {
            sendNotification('Exam Mode Warning 🚨', `"${appName}" is a distraction. It will be force-closed in 2 minutes.`);
          } else {
            sendNotification('Focus Slipping 📉', `"${appName}" is a distraction. Get back to work!`);
          }

          // Broadcast distraction alert to UI (once)
          const elapsed = Date.now() - (session.getStatus().startTime || Date.now());
          const focusMinutes = Math.round(elapsed / 60000);
          broadcastFn({ type: 'distraction_alert', app: appName, focusMinutes });
        }
      }

      // ─── EXAM MODE: silent kill after 2 minutes ───
      if (config.mode === 'exam' && category === 'distraction') {
        const violationStart = config.violations[appName];
        if (violationStart) {
          const elapsedSec = (Date.now() - violationStart) / 1000;
          
          if (elapsedSec > 120) {
            console.log(`[Watcher] 🪓 EXAM MODE: Killing ${appName}.exe (exceeded 2 minutes)`);
            try {
              execFileSync('taskkill', ['/IM', `${appName}.exe`, '/F'], { windowsHide: true });
              session.clearViolation(appName);
            } catch (err) {
              console.error(`[Watcher] Failed to kill ${appName}:`, err.message);
            }
          }
        }
      } else {
        if (category !== 'distraction') {
           session.clearViolation(lastApp); 
        }
      }

    } catch (err) {
      console.error('[Watcher] Error:', err.message);
    }
  }, 2000);

  console.log('[Watcher] Polling every 2s (records only during active sessions)');
}

function stopWatcher() {
  if (watcherInterval) { clearInterval(watcherInterval); watcherInterval = null; }
}

module.exports = { startWatcher, stopWatcher, categorizeApp };
