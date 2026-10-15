#!/usr/bin/env python3
# Live gate helper for ab.sh: run plan, transcript extraction, verdict table. Run as `python3 -I ab-check.py <cmd> ...`.
import glob, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, '..', 'parity', 'golden.generated.ts')
JOINER = '\n\n---\n\n'


def golden(vid):
    # frozen spec: expected additionalContext of the vector `vid` in tests/parity/golden.generated.ts
    s = open(GOLDEN, encoding='utf-8').read()
    j = s.index('= [', s.index('export const VECTORS')) + 2
    for v in json.loads(s[j:s.rindex(']') + 1]):
        if v['id'] == vid:
            return v['expected']
    raise KeyError(vid)


NATIVE_BODY = 'OVERRIDE-NATIVE-R: mod project-layer r.md override\nsecond native line'
NATIVE_FILE = NATIVE_BODY + '\n'
R_HEADER = 'User typed `++r` — Two-phase review discipline is active for this turn:'
EXP_R_NATIVE = R_HEADER + '\n\n' + NATIVE_BODY

# name, cwd key, permission mode, mod (always mod), brewtools (always off: the mod runs alone), prompt
RUNS = [
    ('c1-r', 'tmp', 'default', 'mod', 'off', '++r say ok'),
    ('c1-am', 'tmp', 'default', 'mod', 'off', '++a ++m say ok'),
    ('c1-rr', 'tmp', 'default', 'mod', 'off', '++rr say ok'),
    ('c2-m', 'tmp', 'plan', 'mod', 'off', '++m say ok'),
    ('c2-cron', 'tmp', 'plan', 'mod', 'off', '+++ say ok'),
    ('c2-cron-default', 'tmp', 'default', 'mod', 'off', '+++ say ok'),
    ('c3a-deep', 'repo-deep', 'default', 'mod', 'off', '++r say ok'),
    ('c3b-root', 'repo-root', 'default', 'mod', 'off', '++r say ok'),
    ('c3c-local', 'repo2-deep', 'default', 'mod', 'off', '++r say ok'),
]
BY = {r[0]: r for r in RUNS}

# unit id, label, run, expected tokens, expected entries (golden vector ids joined) or 'native' / 'subdir'
UNITS = [
    ('1.r', 'default ++r', 'c1-r', ['++r'], ['spec-4']),
    ('1.am', 'default ++a ++m', 'c1-am', ['++m', '++a'], ['spec-1', 'spec-3']),
    ('1.rr', 'default ++rr', 'c1-rr', ['++rr'], ['spec-5']),
    ('2.m', 'plan ++m (m.plan)', 'c2-m', ['++m'], ['spec-2']),
    ('2.cron', 'plan +++ (cron)', 'c2-cron', ['+++'], ['spec-6']),
    ('2.cron-def', 'default +++ (none)', 'c2-cron-default', [], []),
    ('3a', 'subdir launch, overrides at git root', 'c3a-deep', ['++r'], 'subdir'),
    ('3b', 'root launch, overrides at root', 'c3b-root', ['++r'], 'native'),
    ('3c', 'subdir launch, overrides in launch dir', 'c3c-local', ['++r'], 'native'),
]

SPLIT = re.compile(r'\n\n---\n\n(?=User typed `)')
HEAD = re.compile(r'^User typed `([^`]+)` ')


def sha(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def cmd_plan(_):
    for r in RUNS:
        print('\t'.join(r))


def cmd_mkrepo(a):
    d, where = a[0], a[1]
    base = d if where == 'root' else os.path.join(d, 'sub', 'deep')
    os.makedirs(os.path.join(d, 'sub', 'deep'), exist_ok=True)
    for rel, text in (('.claude/placeholders/r.md', NATIVE_FILE),):
        p = os.path.join(base, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(text)


def cmd_extract(a):
    out, name = a[0], a[1]
    g = lambda ext: os.path.join(out, name + ext)
    rd = lambda ext: open(g(ext), encoding='utf-8', errors='replace').read() if os.path.exists(g(ext)) else ''
    sid = rd('.sid').strip()
    base = os.environ.get('CLAUDE_CONFIG_DIR') or os.path.expanduser('~/.claude')
    fs = glob.glob(f'{base}/projects/*/{sid}.jsonl') if sid else []
    res = {'name': name, 'rc': rd('.rc').strip().replace('rc=', ''), 'sid': sid, 'transcripts': len(fs), 'rows': 0, 'entries': [], 'blob': {}, 'result': None}
    if len(fs) == 1:
        blobs = []
        for line in open(fs[0], encoding='utf-8'):
            d = json.loads(line)
            at = d.get('attachment') or {}
            if d.get('type') == 'attachment' and at.get('type') == 'hook_additional_context' and at.get('hookEvent') == 'UserPromptSubmit':
                res['rows'] += 1
                res['entries'].extend(at.get('content') or [])
            elif d.get('type') == 'api-request-blob':
                blobs.append(json.dumps(d, ensure_ascii=False))
        res['blob_rows'] = len(blobs)
        res['blob_text'] = blobs
    toks = {}
    for e in res['entries']:
        for b in SPLIT.split(e):
            m = HEAD.match(b)
            toks.setdefault(m.group(1) if m else '<no-header>', []).append(b)
    res['blocks'] = {t: bs for t, bs in toks.items()}
    res['count'] = {t: len(bs) for t, bs in toks.items()}
    res['blobcount'] = {}
    for t in toks:
        res['blobcount'][t] = max([b.count('User typed `' + t + '` ') for b in res.get('blob_text', [])] or [0])
    res['sha'] = sha('\x00'.join(res['entries']))
    res['chars'] = sum(len(e) for e in res['entries'])
    res['bytes'] = sum(len(e.encode('utf-8')) for e in res['entries'])
    res.pop('blob_text', None)
    err = rd('.err')
    dbg = rd('.debug.log')
    res['stderr_bytes'] = len(err.encode('utf-8'))
    res['did_not_load'] = err.count('did not load') + dbg.count('did not load')
    res['mod_loaded'] = len(re.findall(r'hooks module brewmod-placeholders@inline loaded', dbg))
    res['hook_failed'] = len(re.findall(r'hook failed: brewmod-placeholders', dbg))
    res['inject_hook'] = len(re.findall(r'Hooks: UserPromptSubmit \[node "[^"]*hooks/inject\.mjs"\] \(plugin brewmod-placeholders@inline\) finished with status 0', dbg))
    for line in rd('.stream.jsonl').splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get('type') == 'result':
            res['result'] = {'subtype': d.get('subtype'), 'is_error': d.get('is_error'), 'text': (d.get('result') or '')[:40]}
    with open(g('.inj.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(f"{name}: rc={res['rc']} rows={res['rows']} count={res['count']} sha={res['sha'][:12]} chars={res['chars']} modloaded={res['mod_loaded']} injHook={res['inject_hook']} notLoad={res['did_not_load']}")


def load(out, name):
    p = os.path.join(out, name + '.inj.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


def run_checks(x):
    # per-run preconditions; returns list of failure strings
    f = []
    if x is None:
        return ['no extraction']
    if x['transcripts'] != 1:
        f.append(f"transcripts={x['transcripts']}")
    if x['did_not_load'] != 0:
        f.append('hooks module did not load')
    if x['mod_loaded'] < 1:
        f.append(f"mod_loaded={x['mod_loaded']} (expected >=1)")
    if x['inject_hook'] != 1:
        f.append(f"inject.mjs UserPromptSubmit hook ran {x['inject_hook']}x (expected 1: the command hook is the injector)")
    sub = (x['result'] or {}).get('subtype')
    if x['rc'] != '0' and sub != 'error_max_turns':
        f.append(f"claude rc={x['rc']} result={sub}")
    return f


def exact_once(x, toks):
    # exactly the expected tokens, each one block, one attachment row, in the expected order
    f = []
    got = list(x['count'].items())
    if sorted(x['count']) != sorted(toks) or any(c != 1 for c in x['count'].values()):
        f.append(f'blocks={dict(x["count"])} expected one each of {toks}')
    if [t for t, _ in got] != toks:
        f.append(f'order={[t for t, _ in got]} expected {toks}')
    if x['rows'] != (1 if toks else 0):
        f.append(f"rows={x['rows']}")
    for t in toks:
        if x['blobcount'].get(t) != 1:
            f.append(f"api-request-blob count of {t}={x['blobcount'].get(t)} (expected 1)")
    return f


def cmd_verdict(a):
    out = a[0]
    allok = True
    devs = []
    lines = []
    only = os.environ.get('AB_ONLY')
    for uid, label, name, toks, spec in [u for u in UNITS if not only or only == u[2]]:
        x = load(out, name)
        fails = ['run: ' + s for s in run_checks(x)]
        deviation = None
        want = None
        if x is not None:
            fails += exact_once(x, toks)
            if spec == 'native':
                want = [EXP_R_NATIVE]
            elif spec == 'subdir':
                dflt = [golden('spec-4')]
                if x['entries'] == [EXP_R_NATIVE]:
                    want = [EXP_R_NATIVE]
                elif x['entries'] == dflt and not fails:
                    want = dflt
                    deviation = 'SPEC PREMISE NOT REPRODUCED: from sub/deep the mod does not read overrides at the git root; it uses the launch dir as project root and falls back to the DEFAULT text'
                else:
                    want = dflt
            else:
                want = [golden(v) for v in spec]
                want = [JOINER.join(want)] if want else []
            if x['entries'] != want:
                fails.append(f"entries != frozen golden/expected (got {sha(chr(0).join(x['entries']))[:12]}/{x['bytes']}B, want {sha(chr(0).join(want))[:12]})")
        ok = not fails
        allok = allok and ok
        if deviation and ok:
            devs.append((uid, deviation))
        fmt = lambda x: '-' if x is None else ','.join(f'{t}x{c}' for t, c in x['count'].items()) or 'none'
        shaa = '-' if x is None else f"{x['sha'][:10]}/{x['bytes']}B"
        lines.append((uid, label, fmt(x), shaa, ('DEVIATION' if deviation else 'PASS') if ok else 'FAIL', fails))
    print('| Case | Scenario | Mod inj | sha/len | Verdict |')
    print('|---|---|---|---|---|')
    for l in lines:
        print('| ' + ' | '.join(l[:5]) + ' |')
    for l in lines:
        for fl in l[5]:
            print(f'FAIL-DETAIL {l[0]}: {fl}')
    for uid, d in devs:
        print(f'DEVIATION {uid}: {d}')
    print('OVERALL ' + ('PASS' if allok else 'FAIL') + (f' ({len(devs)} DEVIATION: ' + ','.join(u for u, _ in devs) + ')' if devs else ''))
    sys.exit(0 if allok else 1)


if __name__ == '__main__':
    {'plan': cmd_plan, 'mkrepo': cmd_mkrepo, 'extract': cmd_extract, 'verdict': cmd_verdict}[sys.argv[1]](sys.argv[2:])
