export type Language = "en" | "fr" | "ar";
export interface User {
  id: string;
  email: string;
  name: string;
  admin: boolean;
}
export interface Account {
  id: string;
  name: string;
  username: string;
  connection: string;
  niche: string;
  general: boolean;
  category: "crochet" | "food" | "home" | "printables" | "diy" | "other";
  source: "niche" | "website";
  website: string;
  pinsPerProduct: number;
  pinsPerDay: number;
  hours: number[];
  on: boolean;
}
export interface Config {
  emailTo: string;
  botEmail: string;
  timeZone: string;
  reportHour: number;
  notifyEmail: boolean;
  notifyTelegram: boolean;
  emailEveryPin: boolean;
  lowQueue: number;
  google: string;
  gmail: string;
  telegram: string;
  accounts: Account[];
}
export interface Automation {
  id: string;
  name: string;
  config: Partial<Config>;
  revision: number;
  appliedRevision: number;
  setupStep: number;
  errorCode: string | null;
  status: string;
  sheetUrl: string | null;
  connected: boolean;
  deployed: boolean;
  imported: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface Connection {
  id: string;
  service: string;
  label: string;
  identity: string;
  status: string;
}
