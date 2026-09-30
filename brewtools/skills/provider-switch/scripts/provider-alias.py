#!/usr/bin/env python3
"""Serialize a validated provider request as a shell alias without evaluating input."""
import json
import re
import shlex
import sys
from pathlib import Path

PROVIDERS = {
    'deepseek': ('https://api.deepseek.com/anthropic', 'DEEPSEEK_API_KEY', {}),
    'glm': ('https://api.z.ai/api/anthropic', 'ZAI_API_KEY', {
        'CLAUDE_ENABLE_BYTE_WATCHDOG': '0', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS': '1'}),
    'qwen': ('https://dashscope-intl.aliyuncs.com/apps/anthropic', 'DASHSCOPE_API_KEY', {
        'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS': '1'}),
    'minimax': ('https://api.minimax.io/anthropic', 'MINIMAX_API_KEY', {
        'CLAUDE_ENABLE_BYTE_WATCHDOG': '0', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS': '1'}),
    'openrouter': ('https://openrouter.ai/api', 'OPENROUTER_API_KEY', {}),
}
ROLES = ('OPUS', 'SONNET', 'HAIKU')
MODEL_PATTERN = r'[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?(?:\[1m\])?'


def fail():
    raise ValueError('invalid provider alias request')


def endpoint_for(provider, endpoint):
    default = PROVIDERS[provider][0]
    if endpoint == default:
        return endpoint
    if provider == 'qwen' and (endpoint == 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic'
            or re.fullmatch(r'https://[A-Za-z0-9][A-Za-z0-9-]*\.(?:cn-beijing|ap-southeast-1|us-east-1)\.maas\.aliyuncs\.com/apps/anthropic', endpoint)):
        return endpoint
    fail()


def legacy_request(name, body):
    # Only the existing export/core/compatibility form is accepted; never eval shell text.
    commands = [shlex.split(command) for command in body.split(';')]
    if not commands or commands[-1] != ['claude']:
        fail()
    values = {}
    for command in commands[:-1]:
        if len(command) != 2 or command[0] != 'export' or '=' not in command[1]:
            fail()
        key, value = command[1].split('=', 1)
        if key in values:
            fail()
        values[key] = value
    model = values.get('ANTHROPIC_DEFAULT_OPUS_MODEL', '')
    for provider, (endpoint, key, flags) in PROVIDERS.items():
        if values.get('ANTHROPIC_AUTH_TOKEN') != '$' + key:
            continue
        expected = {'ANTHROPIC_BASE_URL': values.get('ANTHROPIC_BASE_URL', ''),
                    'ANTHROPIC_AUTH_TOKEN': '$' + key, 'ANTHROPIC_API_KEY': '', **flags}
        expected.update({'ANTHROPIC_DEFAULT_' + role + '_MODEL': model for role in ROLES})
        if values != expected:
            fail()
        return {'alias_name': name, 'provider': provider, 'model_id': model,
                'base_url': values['ANTHROPIC_BASE_URL']}
    fail()


def serialize(request):
    if not isinstance(request, dict) or not {'alias_name', 'provider', 'model_id'} <= request.keys():
        fail()
    if request.keys() - {'alias_name', 'provider', 'model_id', 'base_url'}:
        fail()
    name, provider, model = (request[key] for key in ('alias_name', 'provider', 'model_id'))
    if not all(isinstance(value, str) for value in (name, provider, model)):
        fail()
    if not re.fullmatch(r'claude[a-z0-9]*', name) or provider not in PROVIDERS:
        fail()
    if not re.fullmatch(MODEL_PATTERN, model) or (provider == 'openrouter' and '/' not in model):
        fail()
    default, key, flags = PROVIDERS[provider]
    endpoint = request.get('base_url', default)
    if not isinstance(endpoint, str):
        fail()
    endpoint_for(provider, endpoint)
    exports = ['export ANTHROPIC_BASE_URL=' + shlex.quote(endpoint),
               'export ANTHROPIC_AUTH_TOKEN="$' + key + '"', 'export ANTHROPIC_API_KEY=""']
    exports.extend('export ANTHROPIC_DEFAULT_' + role + '_MODEL=' + shlex.quote(model) for role in ROLES)
    exports.extend('export ' + flag + '=' + value for flag, value in flags.items())
    body = '; '.join(exports + ['claude'])
    return name + '\n' + 'alias ' + name + '=' + shlex.quote(body)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--request':
        request = json.loads(Path(sys.argv[2]).read_text())
    elif len(sys.argv) == 3 and sys.argv[1] == '--inspect':
        selection = json.loads(Path(sys.argv[2]).read_text())
        if not isinstance(selection, dict):
            fail()
        name, provider = selection.get('alias_name'), selection.get('provider')
        if not isinstance(name, str) or not re.fullmatch(r'claude[a-z0-9]*', name) or provider not in PROVIDERS:
            fail()
        rc = Path.home() / '.zshrc'
        lines = rc.read_text().splitlines() if rc.exists() else []
        matches = [line for line in lines if line.startswith('alias ' + name + '=')]
        if not matches:
            print(json.dumps({'status': 'ABSENT'}))
            return
        if len(matches) != 1:
            fail()
        words = shlex.split(matches[0])
        if len(words) != 2 or words[0] != 'alias' or not words[1].startswith(name + '='):
            fail()
        request = legacy_request(name, words[1].split('=', 1)[1])
        serialize(request)
        if request['provider'] != provider:
            fail()
        print(json.dumps({'status': 'FOUND', 'request': request}))
        return
    elif len(sys.argv) == 4 and sys.argv[1] == '--connection':
        request = json.loads(Path(sys.argv[2]).read_text())
        serialize(request)
        if request['provider'] != sys.argv[3]:
            fail()
        print(request.get('base_url', PROVIDERS[request['provider']][0]))
        print(request['model_id'])
        return
    elif len(sys.argv) == 4 and sys.argv[1] == '--legacy':
        request = legacy_request(sys.argv[2], sys.argv[3])
    else:
        fail()
    print(serialize(request))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError):
        print('FAILED set-alias — invalid provider request or unreadable JSON', file=sys.stderr)
        sys.exit(1)
