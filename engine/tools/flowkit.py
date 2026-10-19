"""Small helpers to build Activepieces flow-import payloads (schema version 28)."""
import json

NOW = "2026-10-01T12:00:00.000Z"
SCHEDULE_PIECE = ("@activepieces/piece-schedule", "0.1.22")
CONNECTIONS_PIECE = ("@activepieces/piece-connections", "0.5.10")


def _errors(continue_on_failure=False, retry_on_failure=False):
    return {
        "continueOnFailure": {"value": continue_on_failure},
        "retryOnFailure": {"value": retry_on_failure},
    }


def schedule_trigger(cron, timezone, display="Schedule"):
    return {
        "name": "trigger",
        "displayName": display,
        "type": "PIECE_TRIGGER",
        "valid": True,
        "lastUpdatedDate": NOW,
        "settings": {
            "pieceName": SCHEDULE_PIECE[0],
            "pieceVersion": SCHEDULE_PIECE[1],
            "triggerName": "cron_expression",
            "input": {"cronExpression": cron, "timezone": timezone},
            "propertySettings": {},
        },
    }


def read_connection(name, display, external_id, continue_on_failure=False):
    return {
        "name": name,
        "displayName": display,
        "type": "PIECE",
        "valid": True,
        "lastUpdatedDate": NOW,
        "settings": {
            "pieceName": CONNECTIONS_PIECE[0],
            "pieceVersion": CONNECTIONS_PIECE[1],
            "actionName": "read_connection",
            "input": {"connection_name": external_id},
            "propertySettings": {},
            "errorHandlingOptions": _errors(continue_on_failure),
        },
    }


def code_step(name, display, source, inputs, continue_on_failure=False):
    return {
        "name": name,
        "displayName": display,
        "type": "CODE",
        "valid": True,
        "lastUpdatedDate": NOW,
        "settings": {
            "input": inputs,
            "sourceCode": {"packageJson": "{}", "code": source},
            "errorHandlingOptions": _errors(continue_on_failure),
        },
    }


def loop_step(name, display, items_expr):
    return {
        "name": name,
        "displayName": display,
        "type": "LOOP_ON_ITEMS",
        "valid": True,
        "lastUpdatedDate": NOW,
        "settings": {"items": items_expr},
    }


def chain(*steps):
    """Link steps with nextAction; returns the first step."""
    for a, b in zip(steps, steps[1:]):
        a["nextAction"] = b
    return steps[0]


def import_payload(display_name, trigger):
    return {"displayName": display_name, "trigger": trigger, "schemaVersion": "28", "notes": []}


def template_file(display_name, trigger, description=""):
    """Shareable file format (works with Activepieces' Import button)."""
    return {
        "name": display_name,
        "description": description,
        "flows": [{
            "displayName": display_name,
            "description": description,
            "trigger": trigger,
            "valid": True,
            "schemaVersion": "28",
            "notes": [],
        }],
    }


def out(ref):
    """Expression for a step's output, e.g. out('step_1') -> {{step_1['output']}}"""
    return "{{%s['output']}}" % ref


def write(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False)
