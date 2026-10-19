import {Hono} from 'hono';
import {deleteCookie} from 'hono/cookie';
import {z} from 'zod';
import {auth, requireSession} from './auth';
import {id, isLocal, now, PublicError} from './security';
import type {AppEnv, Automation} from './types';

export const app = new Hono<AppEnv>();
app.use('*',async(c,next) => {
 await next();
 c.header('X-Content-Type-Options','nosniff');
 c.header('Referrer-Policy','same-origin');
 c.header('X-Frame-Options','DENY');
 c.header('Cache-Control','no-store');
 c.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
});
app.onError((error,c) => {
 if (error instanceof z.ZodError) return c.json({error:'validation',message:'Check the highlighted settings and try again.'},400);
 if (error instanceof PublicError) return c.json({error:error.code,message:error.message},error.status as 400);
 return c.json({error:'unavailable',message:'This action could not finish. Please try again.'},503);
});
app.route('/auth',auth);
app.get('/api/health',c => c.json({ok:true}));
app.get('/api/environment',c => c.json({local:isLocal(c)}));
app.use('/api/*',requireSession);
app.get('/api/me',c => c.json({user:{id:c.get('user').id,name:c.get('user').name,email:c.get('user').email,admin:c.get('user').email===c.env.OWNER_EMAIL},csrf:c.get('session').csrf}));
app.post('/api/logout',async c => {
 await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(c.get('session').token_hash).run();
 deleteCookie(c,'session',{path:'/'}); return c.json({ok:true});
});
export async function owned(c: Parameters<typeof isLocal>[0]) {
 const automation = await c.env.DB.prepare('SELECT * FROM automations WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('user').id).first<Automation>();
 if (!automation) throw new PublicError('not_found','This automation was not found.',404);
 return automation;
}
function publicAutomation(a: Automation) {
 return {id:a.id,name:a.name,config:JSON.parse(a.config),revision:a.revision,appliedRevision:a.applied_revision,status:a.status,sheetUrl:a.sheet_url,connected:Boolean(a.integration_id),createdAt:a.created_at,updatedAt:a.updated_at};
}
app.get('/api/automations',async c => {
 const rows = await c.env.DB.prepare('SELECT * FROM automations WHERE user_id=? ORDER BY created_at DESC').bind(c.get('user').id).all<Automation>();
 return c.json({automations:rows.results.map(publicAutomation)});
});
app.post('/api/automations',async c => {
 const {name} = z.object({name:z.string().trim().min(1).max(60)}).parse(await c.req.json());
 const userId = c.get('user').id;
 const total = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM automations WHERE user_id=?').bind(userId).first<{n:number}>();
 if (total!.n>=20) throw new PublicError('limit','You can create up to 20 automations.',409);
 const automationId = id();
 await c.env.DB.prepare('INSERT INTO automations(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(automationId,userId,name,now(),now()).run();
 return c.json({automation:publicAutomation((await c.env.DB.prepare('SELECT * FROM automations WHERE id=?').bind(automationId).first<Automation>())!)},201);
});
app.get('/api/automations/:id',async c => c.json({automation:publicAutomation(await owned(c))}));
const configSchema = z.object({
 emailTo:z.email().or(z.literal('')).default(''), botEmail:z.email().or(z.literal('')).default(''), timeZone:z.string().max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}).default('Africa/Casablanca'),
 reportHour:z.number().int().min(6).max(23).default(22), notifyEmail:z.boolean().default(true),notifyTelegram:z.boolean().default(false),emailEveryPin:z.boolean().default(false),lowQueue:z.number().int().min(0).max(100).default(10),
 google:z.string().max(80).default(''),gmail:z.string().max(80).default(''),telegram:z.string().max(80).default(''),
 accounts:z.array(z.object({id:z.string().max(80),name:z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),username:z.string().max(80),connection:z.string().max(80),niche:z.string().max(300),general:z.boolean().default(false),category:z.enum(['crochet','food','home','printables','diy','other']),source:z.enum(['niche','website']),website:z.string().max(500).default(''),pinsPerProduct:z.number().int().min(3).max(15).default(6),pinsPerDay:z.number().int().min(1).max(18),hours:z.array(z.number().int().min(6).max(23)).min(1).max(18),on:z.boolean().default(true)})).max(20).default([])
});
app.put('/api/automations/:id',async c => {
 const automation = await owned(c);
 const body = z.object({name:z.string().trim().min(1).max(60),revision:z.number().int(),config:configSchema}).parse(await c.req.json());
 if (body.revision!==automation.revision) throw new PublicError('conflict','Settings changed in another tab. Reload to see the latest version.',409);
 const selected = [body.config.google,body.config.gmail,body.config.telegram,...body.config.accounts.map(a=>a.connection)].filter(Boolean);
 for (const connectionId of selected) {
  const connection = await c.env.DB.prepare('SELECT id FROM connections WHERE id=? AND user_id=? AND integration_id=?').bind(connectionId,c.get('user').id,automation.integration_id).first();
  if (!connection) throw new PublicError('connection','Choose a connected account from this automation.',400);
 }
 for (const account of body.config.accounts) {
  if (new Set(account.hours).size!==account.pinsPerDay || account.hours.length!==account.pinsPerDay) throw new PublicError('schedule','Choose one posting time for each daily pin.');
  if (account.source==='website' && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(account.website)) throw new PublicError('website','Enter a complete website address starting with https://.');
 }
 const config = JSON.stringify(body.config);
 if (automation.name===body.name && automation.config===config) return c.json({automation:publicAutomation(automation)});
 const updated = await c.env.DB.prepare(`UPDATE automations SET name=?,config=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING *`).bind(body.name,config,now(),automation.id,c.get('user').id,body.revision).first<Automation>();
 if (!updated) throw new PublicError('conflict','Settings changed in another tab. Reload to see the latest version.',409);
 await c.env.DB.prepare('INSERT INTO versions VALUES(?,?,?,?,?,?)').bind(id(),c.get('user').id,automation.id,updated.revision,config,now()).run();
 return c.json({automation:publicAutomation(updated)});
});
app.get('/api/automations/:id/versions',async c => {
 const a = await owned(c);
 const rows = await c.env.DB.prepare('SELECT id,revision,created_at FROM versions WHERE automation_id=? AND user_id=? ORDER BY revision DESC LIMIT 100').bind(a.id,c.get('user').id).all();
 return c.json({versions:rows.results});
});
app.get('/api/admin/users',async c => {
 if (c.get('user').email!==c.env.OWNER_EMAIL) throw new PublicError('not_found','Page not found.',404);
 const users = await c.env.DB.prepare(`SELECT u.id,u.email,u.name,u.status,u.created_at,u.last_active,
 (SELECT count(*) FROM automations a WHERE a.user_id=u.id) AS automations,
 (SELECT count(*) FROM automations a WHERE a.user_id=u.id AND a.flow_id IS NOT NULL) AS deployed
 FROM users u ORDER BY u.created_at DESC LIMIT 500`).all();
 return c.json({users:users.results});
});
app.post('/api/admin/users/:userId',async c => {
 if (c.get('user').email!==c.env.OWNER_EMAIL) throw new PublicError('not_found','Page not found.',404);
 const {action} = z.object({action:z.enum(['block','unblock','remove'])}).parse(await c.req.json());
 const target = c.req.param('userId');
 if (target===c.get('user').id) throw new PublicError('owner','The owner account must keep access.');
 const exists = await c.env.DB.prepare('SELECT id FROM users WHERE id=?').bind(target).first();
 if (!exists) throw new PublicError('not_found','Member not found.',404);
 await c.env.DB.batch([
  c.env.DB.prepare('UPDATE users SET status=? WHERE id=?').bind(action==='unblock'?'active':action==='block'?'blocked':'removed',target),
  c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target),
  c.env.DB.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').bind(id(),c.get('user').id,target,action,now())
 ]);
 return c.json({ok:true});
});
export default app;
