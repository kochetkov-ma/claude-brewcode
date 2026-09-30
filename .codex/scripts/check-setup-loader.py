#!/usr/bin/env python3
"""Read-only local Codex loader probe; never starts a model turn."""
import argparse
import json
import os
from pathlib import Path
import selectors
import subprocess
import tempfile
import time


def probe(root, home, timeout=20):
    root = root.resolve()
    env = dict(os.environ, CODEX_HOME=str(home))
    with tempfile.TemporaryFile(mode='w+') as stderr:
        process = subprocess.Popen(['codex', '-C', str(root), 'app-server', '--strict-config', '--stdio'],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, env=env)
        selector = selectors.DefaultSelector()
        buffer = bytearray()

        def rpc(number, method, params):
            process.stdin.write((json.dumps(dict(id=number, method=method, params=params)) + '\n').encode())
            process.stdin.flush()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                while b'\n' in buffer:
                    line, _, remaining = buffer.partition(b'\n')
                    buffer[:] = remaining
                    response = json.loads(line)
                    if response.get('id') == number:
                        if 'error' in response:
                            raise RuntimeError(f'{method}: {response["error"].get("message", "RPC error")}')
                        return response['result']
                for key, _ in selector.select(timeout=min(0.2, max(0, deadline - time.monotonic()))):
                    chunk = os.read(key.fd, 65536)
                    if not chunk:
                        raise RuntimeError(f'{method}: app-server stdout closed')
                    buffer.extend(chunk)
            raise RuntimeError(f'{method}: timed out')

        try:
            selector.register(process.stdout, selectors.EVENT_READ)
            initialized = rpc(1, 'initialize', dict(clientInfo=dict(name='native-setup-probe', version='1'), capabilities=dict(experimentalApi=True)))
            process.stdin.write((json.dumps(dict(method='initialized')) + '\n').encode())
            process.stdin.flush()
            config = rpc(2, 'config/read', dict(cwd=str(root), includeLayers=True))
            skills = rpc(3, 'skills/list', dict(cwds=[str(root)], forceReload=True))
            hooks = rpc(4, 'hooks/list', dict(cwd=str(root)))
            effective = config.get('config', {})
            project_skills = []
            skill_errors = []
            for group in skills.get('data', []):
                skill_errors.extend(group.get('errors', []))
                for skill in group.get('skills', []):
                    path = Path(skill['path'])
                    if path.is_relative_to(root):
                        project_skills.append(dict(name=skill['name'], path=str(path), enabled=skill.get('enabled')))
            names = sorted(item['name'] for item in project_skills)
            expected = sorted(['docs', 'superreview', 'brewcode-review', 'memory-sync', 'claude-plugin-guide', 'update-overview', 'eurodns'])
            if names != expected:
                raise RuntimeError(f'project skill set mismatch: {names}')
            if any(item['enabled'] is not True for item in project_skills):
                raise RuntimeError('project skills must remain enabled')
            if skill_errors:
                raise RuntimeError(f'skill discovery errors: {len(skill_errors)}')
            agents = effective.get('agents') or {}
            if agents.get('enabled') is not True:
                raise RuntimeError('effective native agents disabled')
            features = effective.get('features') or {}
            hook_data = hooks.get('data') or []
            summary = dict(user_agent=initialized.get('userAgent'),
                           config=dict(model=effective.get('model'), review_model=effective.get('review_model'),
                                       agents_enabled=agents.get('enabled'), default_subagent_model=agents.get('default_subagent_model'),
                                       plugins=features.get('plugins'), remote_plugin=features.get('remote_plugin')),
                           project_skills=sorted(project_skills, key=lambda item: item['name']),
                           hook_summary=dict(response_keys=sorted(hooks), group_count=len(hook_data),
                                             groups=[dict(hook_count=len(item.get('hooks') or []),
                                                          error_count=len(item.get('errors') or []),
                                                          warning_count=len(item.get('warnings') or []),
                                                          hook_states=[{key: hook.get(key) for key in ['enabled', 'trusted', 'status'] if key in hook}
                                                                       for hook in item.get('hooks') or []]) for item in hook_data]),
                           config_layer_count=len(config.get('layers') or []))
            if [effective.get('model'), effective.get('review_model'), agents.get('default_subagent_model')] != ['gpt-6.1-sol'] * 3:
                raise RuntimeError('effective model mismatch')
            if features.get('plugins') is not False or features.get('remote_plugin') is not False:
                raise RuntimeError('effective plugin flags must remain disabled')
            prompt = subprocess.run(['codex', '-C', str(root), 'debug', 'prompt-input', 'offline native setup probe'],
                                    env=env, capture_output=True, text=True, timeout=20)
            if prompt.returncode != 0:
                raise RuntimeError(f'debug prompt-input exited: {prompt.returncode}')
            json.loads(prompt.stdout)
            summary['prompt_summary'] = dict(project_instructions_present='# Codex workspace' in prompt.stdout,
                                             native_role_instructions_present='Write the single owned public documentation file assigned' in prompt.stdout)
            if not summary['prompt_summary']['project_instructions_present']:
                raise RuntimeError('project AGENTS instructions missing from model-visible prompt')
            return summary
        finally:
            selector.close()
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            process.stdin.close()
            process.stdout.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    parser.add_argument('--home', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(probe(args.root.resolve(), args.home.resolve()), indent=2))


if __name__ == '__main__':
    main()
