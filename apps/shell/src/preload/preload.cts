import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("learningOsDesktop", {
  appName: "Learning OS",
  getApiToken: () => ipcRenderer.invoke("learning-os:get-api-token"),
});
