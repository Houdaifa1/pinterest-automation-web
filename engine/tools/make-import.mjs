import fs from 'node:fs';
const [,, templatePath, outPath, google, gmail, telegram, tz, configPath] = process.argv;
// Run from engine/: node tools/make-import.mjs dist/poster.template.json out.json <google> <gmail or -> <telegram or -> <timezone> <config.json>
const gen = await import(new URL('file://' + process.cwd() + '/panel/generator.js'));
const map = { __GOOGLE_CONNECTION__: google, __GMAIL_CONNECTION__: gmail, __TELEGRAM_CONNECTION__: telegram, __TIME_ZONE__: gen.scheduleZone(tz), __CONFIG__: fs.readFileSync(configPath, 'utf8').trim() };
const rep = (v) => typeof v === 'string' ? (v in map ? map[v] : v) : Array.isArray(v) ? v.map(rep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rep(x)])) : v;
const out = rep(JSON.parse(fs.readFileSync(templatePath, 'utf8')));
// '-' = this automation has no login for that channel: drop the step and blank its inputs (as the panel does).
for (const [arg, step] of [[gmail, 'step_2'], [telegram, 'step_tg']]) {
  if (arg !== '-') continue;
  let prev = out.flows[0].trigger;
  while (prev.nextAction) { if (prev.nextAction.name === step) { prev.nextAction = prev.nextAction.nextAction; break; } prev = prev.nextAction; }
  const blank = (x) => { for (; x; x = x.nextAction) { const i = x.settings && x.settings.input; if (i && x.type === 'CODE') for (const [k, v] of Object.entries(i)) if (v === `{{${step}['output']}}`) i[k] = ''; if (x.firstLoopAction) blank(x.firstLoopAction); } };
  blank(out.flows[0].trigger);
}
const text = JSON.stringify(out, null, 1);
if (/"__[A-Z_]+__"/.test(text.replace(/__AP_[A-Z_]+__/g, ''))) throw new Error('blank left');
fs.writeFileSync(outPath, text);
console.log('ok', out.flows[0].trigger.settings.input, text.length);
