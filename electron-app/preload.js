const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recorderApp", {
  openFile() {
    return ipcRenderer.invoke("dialog:open-file");
  },
  saveFile(options) {
    return ipcRenderer.invoke("dialog:save-file", options);
  }
});
