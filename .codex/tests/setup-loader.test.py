import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('setup_loader', Path(__file__).resolve().parents[1] / 'scripts/check-setup-loader.py')
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)

FAKE_CODEX = '''import json, os, sys, time
from pathlib import Path
root = sys.argv[2]
mode = os.environ['SETUP_PROBE_MODE']
if 'debug' in sys.argv:
    print(json.dumps({'instructions': '# Codex workspace'}))
    sys.exit(0)
Path(os.environ['SETUP_PROBE_PID']).write_text(str(os.getpid()))
for line in sys.stdin:
    request = json.loads(line)
    method = request['method']
    if method == 'initialized':
        continue
    if mode == 'partial':
        sys.stdout.write('{"id":')
        sys.stdout.flush()
        time.sleep(10)
    if mode == 'eof':
        sys.exit(0)
    result = {}
    if method == 'config/read':
        result = {'config': {'model': 'gpt-6.1-sol', 'review_model': 'gpt-6.1-sol',
                  'agents': {'enabled': mode != 'disabled-agents', 'default_subagent_model': 'gpt-6.1-sol'},
                  'features': {'plugins': False, 'remote_plugin': False}}}
    if method == 'skills/list':
        names = ['docs', 'superreview', 'brewcode-review', 'memory-sync', 'claude-plugin-guide', 'update-overview', 'eurodns']
        result = {'data': [{'skills': [{'name': name, 'path': root + '/.codex/skills/' + name + '/SKILL.md',
                                       'enabled': mode != 'disabled-skills'} for name in names], 'errors': []}]}
    if method == 'hooks/list':
        result = {'data': []}
    print(json.dumps({'id': request['id'], 'result': result}), flush=True)
'''


class LoaderRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        executable = self.root / 'codex'
        executable.write_text(f'#!{sys.executable}\n{FAKE_CODEX}')
        executable.chmod(0o755)
        self.pid = self.root / 'producer.pid'
        self.env = patch.dict(os.environ, PATH=str(self.root) + os.pathsep + os.environ['PATH'],
                              SETUP_PROBE_PID=str(self.pid), SETUP_PROBE_MODE='enabled')
        self.env.start()
        self.addCleanup(self.env.stop)

    def assert_producer_stopped(self):
        self.assertTrue(self.pid.exists(), 'fake producer must have started')
        with self.assertRaises(ProcessLookupError, msg='probe must reap its app-server on all paths'):
            os.kill(int(self.pid.read_text()), 0)

    def test_enabled_producer_loads_all_project_skills(self):
        # GIVEN: producer-shaped enabled config and skills responses.
        # WHEN: the real probe consumes them.
        result = loader.probe(self.root, self.root, timeout=1)
        # THEN: discovery succeeds and the producer is stopped.
        self.assertEqual([item['enabled'] for item in result['project_skills']], [True] * 7, 'all project skills must be enabled')
        self.assertEqual(result['prompt_summary']['project_instructions_present'], True, 'root instructions must load')
        self.assert_producer_stopped()

    def test_disabled_project_skills_are_rejected(self):
        # GIVEN: the full project skill set marked disabled by the producer.
        os.environ['SETUP_PROBE_MODE'] = 'disabled-skills'
        # WHEN: the real probe consumes discovery output.
        with self.assertRaisesRegex(RuntimeError, 'project skills must remain enabled', msg='disabled skills must fail'):
            loader.probe(self.root, self.root, timeout=1)
        # THEN: failure still stops the producer.
        self.assert_producer_stopped()

    def test_disabled_native_agents_are_rejected(self):
        # GIVEN: enabled skills but disabled native agents.
        os.environ['SETUP_PROBE_MODE'] = 'disabled-agents'
        # WHEN: the real probe consumes effective config.
        with self.assertRaisesRegex(RuntimeError, 'effective native agents disabled', msg='disabled agents must fail'):
            loader.probe(self.root, self.root, timeout=1)
        # THEN: failure still stops the producer.
        self.assert_producer_stopped()

    def test_partial_stdout_cannot_block_past_rpc_deadline(self):
        # GIVEN: a producer that flushes partial JSON without a newline, then waits.
        os.environ['SETUP_PROBE_MODE'] = 'partial'
        started = time.monotonic()
        # WHEN: the real RPC reader reaches its deadline.
        with self.assertRaisesRegex(RuntimeError, 'initialize: timed out', msg='partial JSON must reach the deadline'):
            loader.probe(self.root, self.root, timeout=0.2)
        # THEN: bounded failure reaps the producer without waiting for its ten-second stall.
        self.assertLess(time.monotonic() - started, 2, 'partial stdout must not defeat the bounded deadline')
        self.assert_producer_stopped()

    def test_stdout_eof_is_reported_and_child_reaped(self):
        # GIVEN: a producer exiting before replying.
        os.environ['SETUP_PROBE_MODE'] = 'eof'
        # WHEN: the real RPC reader consumes EOF.
        with self.assertRaisesRegex(RuntimeError, 'initialize: app-server stdout closed', msg='EOF must fail explicitly'):
            loader.probe(self.root, self.root, timeout=1)
        # THEN: the exited producer is reaped.
        self.assert_producer_stopped()


if __name__ == '__main__':
    unittest.main()
