const { app, BrowserWindow } = require("electron");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  win.webContents.executeJavaScript(
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: true,
        systemEchoCancellation: true
      }
    }).then(s => {
      console.log("SUCCESS, tracks:", s.getAudioTracks().length);
      s.getTracks().forEach(t => t.stop());
    }).catch(e => {
      console.error("FAIL:", e.name, e.message);
    });
  );
  setTimeout(() => app.quit(), 3000);
});
