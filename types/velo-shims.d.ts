// Ambient declarations so the TS server in the IDE can resolve Velo web modules

// Generic catch-all for any backend web module (JSW)
declare module 'backend/*' {
  const mod: any;
  export = mod;
}

// Specific typing for logger to get nicer intellisense
declare module 'backend/logger.jsw' {
  export function sendDiscordLog(message: string): Promise<any>;
}

