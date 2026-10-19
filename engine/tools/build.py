"""Builds Pinterest Autopilot v3.

Outputs:
  dist/steps/<step>.mjs           each code step as a standalone module (used by the local tests)
  dist/lib.mjs                    shared helpers with exports (unit tests)
  dist/poster.template.json       the one automation, with placeholders the Control Panel fills in
  dist/Pinterest Autopilot.html   the Control Panel (template + generator inlined, works offline)

Nothing personal is built in: connection IDs, email, time zone and accounts all come from the
Control Panel, which writes them into a copy of the template for each person.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from flowkit import chain, code_step, loop_step, out, read_connection, schedule_trigger, template_file  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
PANEL = os.path.join(ROOT, 'panel')

PLACEHOLDERS = {
    'google': '__GOOGLE_CONNECTION__',
    'gmail': '__GMAIL_CONNECTION__',
    'telegram': '__TELEGRAM_CONNECTION__',
    'timezone': '__TIME_ZONE__',
    'config': '__CONFIG__',
}
FIRST_HOUR, LAST_HOUR = 6, 23


def source(*files):
    return '\n'.join(open(os.path.join(SRC, f)).read() for f in files)


def poster_flow():
    trig = schedule_trigger(f'0 {FIRST_HOUR}-{LAST_HOUR} * * *', PLACEHOLDERS['timezone'], 'Every hour')
    s1 = read_connection('step_1', 'Google login', PLACEHOLDERS['google'])
    s2 = read_connection('step_2', 'Gmail login', PLACEHOLDERS['gmail'], continue_on_failure=True)
    stg = read_connection('step_tg', 'Telegram login', PLACEHOLDERS['telegram'], continue_on_failure=True)
    s3 = code_step('step_3', 'Prepare (spreadsheet + who posts now)', source('lib.js', 'workspace.js', 'prepare.js'), {
        'google': out('step_1'), 'gmail': out('step_2'), 'telegram': out('step_tg'), 'config': PLACEHOLDERS['config'],
    })
    loop = loop_step('step_4', 'For each account due now', "{{step_3['output'].due}}")
    s5 = read_connection('step_5', 'Pinterest login (this account)', "{{step_4['output'].item.connection}}", continue_on_failure=True)
    s6 = code_step('step_6', 'Publish + daily sync (this account)', source('lib.js', 'account-engine.js'), {
        'google': out('step_1'), 'gmail': out('step_2'), 'telegram': out('step_tg'), 'pinterest': out('step_5'),
        'accountName': "{{step_4['output'].item.name}}", 'publish': "{{step_4['output'].item.publish}}",
    })
    s7 = code_step('step_7', 'Daily report (at the report hour)', source('lib.js', 'report.js'), {
        'google': out('step_1'), 'gmail': out('step_2'), 'telegram': out('step_tg'), 'due': "{{step_3['output'].reportDue}}",
    })
    chain(s5, s6)
    loop['firstLoopAction'] = s5
    chain(trig, s1, s2, stg, s3, loop, s7)
    return 'Pinterest Autopilot', trig


def main():
    os.makedirs(os.path.join(DIST, 'steps'), exist_ok=True)
    steps = {
        'prepare': ('lib.js', 'workspace.js', 'prepare.js'),
        'account-engine': ('lib.js', 'account-engine.js'),
        'report': ('lib.js', 'report.js'),
    }
    for name, files in steps.items():
        with open(os.path.join(DIST, 'steps', f'{name}.mjs'), 'w') as f:
            f.write(source(*files))
    exports = ['formatKeywords', 'finalDescription', 'cellToLocalStamp', 'localDate', 'localStamp', 'isValidLink',
               'folderIdFromLink', 'driveIdFromText', 'colLetter', 'quoteTab', 'buildMime', 'classifyFailure',
               'imageSize', 'sniffImageType', 'mp4DurationSeconds', 'normalizeUrl', 'PIN_COLUMNS', 'ACCOUNT_COLUMNS',
               'parseHours', 'formatHours', 'readSettings', 'BOARD_COLUMNS']
    with open(os.path.join(DIST, 'lib.mjs'), 'w') as f:
        f.write(source('lib.js') + '\nexport { ' + ', '.join(exports) + ' };\n')

    display, trig = poster_flow()
    template = template_file(display, trig, 'Posts your pins on Pinterest every hour, syncs boards and statistics, sends the daily report.')
    template_text = json.dumps(template, ensure_ascii=False)
    with open(os.path.join(DIST, 'poster.template.json'), 'w') as f:
        f.write(template_text)
    print(f'poster template: {len(template_text) // 1024} KB')

    panel_src = os.path.join(PANEL, 'panel.html')
    if os.path.exists(panel_src):
        html = open(panel_src, encoding='utf-8').read()
        generator = open(os.path.join(PANEL, 'generator.js'), encoding='utf-8').read()
        prompt = open(os.path.join(PANEL, 'codex-prompt.md'), encoding='utf-8').read()
        # Inlined as JSON strings so the panel works from a double-clicked file (no server, no network).
        html = html.replace('/*__GENERATOR__*/', generator.replace('export ', ''))
        html = html.replace('"__POSTER_TEMPLATE__"', json.dumps(template_text).replace('</', '<\\/'))
        html = html.replace('"__CODEX_PROMPT__"', json.dumps(prompt).replace('</', '<\\/'))
        out_path = os.path.join(DIST, 'Pinterest Autopilot.html')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'control panel: {os.path.getsize(out_path) // 1024} KB')


if __name__ == '__main__':
    main()
