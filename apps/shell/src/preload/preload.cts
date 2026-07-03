import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("learningOsDesktop", {
  appName: "Learning OS",
});
