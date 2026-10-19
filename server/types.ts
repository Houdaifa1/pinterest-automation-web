export interface Env {
 DB: D1Database;
 APP_ORIGIN: string;
 OWNER_EMAIL: string;
 GOOGLE_CLIENT_ID: string;
 GOOGLE_CLIENT_SECRET: string;
 ENCRYPTION_KEY: string;
 DEV_LOGIN?: string;
}
export interface User {id: string; email: string; name: string; status: string; created_at: number; last_active: number}
export interface Session {token_hash: string; user_id: string; csrf: string; expires_at: number}
export type AppEnv = {Bindings: Env; Variables: {user: User; session: Session}};
export interface Automation {
 id: string; user_id: string; integration_id: string | null; name: string; config: string;
 revision: number; applied_revision: number; flow_id: string | null; seed_run_id: string | null;
 status: string; sheet_url: string | null; operation_id: string | null; created_at: number; updated_at: number;
}
