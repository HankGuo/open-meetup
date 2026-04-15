import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveConfigAndStart: (config: { port: number; hostPassword: string; roomTitle: string }) => {
    ipcRenderer.send('save-config-and-start', config);
  },
});
