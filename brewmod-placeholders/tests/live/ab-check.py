#!/usr/bin/env python3
# Live A/B helper for ab.sh: run plan, transcript extraction, verdict table. Run as `python3 -I ab-check.py <cmd> ...`.
import glob, hashlib, json, os, re, shutil, sys

HEADERS = {
    '++r': 'User typed `++r` — Two-phase review discipline is active for this turn:',
}
LEGACY_FENCED = 'OVERRIDE-LEGACY-R: brewtools legacy review-double override\nsecond legacy line'
LEGACY_FILE = 'prose outside the fence is ignored\n```\n' + LEGACY_FENCED + '\n```\ntrailing prose is ignored\n'
NATIVE_BODY = 'OVERRIDE-NATIVE-R: mod project-layer r.md override\nsecond native line'
NATIVE_FILE = NATIVE_BODY + '\n'
R_HEADER = HEADERS['++r']
EXP_R_NATIVE = R_HEADER + '\n\n' + NATIVE_BODY
EXP_R_LEGACY = R_HEADER + '\n\n' + LEGACY_FENCED

# name, cwd key, permission mode, mod (mod|nomod|fault), brewtools (on|off), prompt; fault = the mod snapshot patched to throw after next()
RUNS = [
    ('c1-r-A', 'tmp', 'default', 'mod', 'on', '++r say ok'),
    ('c1-r-B', 'tmp', 'default', 'nomod', 'on', '++r say ok'),
    ('c1-am-A', 'tmp', 'default', 'mod', 'on', '++a ++m say ok'),
    ('c1-am-B', 'tmp', 'default', 'nomod', 'on', '++a ++m say ok'),
    ('c1-rr-A', 'tmp', 'default', 'mod', 'on', '++rr say ok'),
    ('c1-rr-B', 'tmp', 'default', 'nomod', 'on', '++rr say ok'),
    ('c2-m-A', 'tmp', 'plan', 'mod', 'on', '++m say ok'),
    ('c2-m-B', 'tmp', 'plan', 'nomod', 'on', '++m say ok'),
    ('c2-cron-A', 'tmp', 'plan', 'mod', 'on', '+++ say ok'),
    ('c2-cron-B', 'tmp', 'plan', 'nomod', 'on', '+++ say ok'),
    ('c2-cron-default-A', 'tmp', 'default', 'mod', 'on', '+++ say ok'),
    ('c2-cron-default-B', 'tmp', 'default', 'nomod', 'on', '+++ say ok'),
    ('c3a-deep-A', 'repo-deep', 'default', 'mod', 'on', '++r say ok'),
    ('c3a-deep-B', 'repo-deep', 'default', 'nomod', 'on', '++r say ok'),
    ('c3b-root-A', 'repo-root', 'default', 'mod', 'on', '++r say ok'),
    ('c3b-root-B', 'repo-root', 'default', 'nomod', 'on', '++r say ok'),
    ('c3c-local-A', 'repo2-deep', 'default', 'mod', 'on', '++r say ok'),
    ('c3c-local-B', 'repo2-deep', 'default', 'nomod', 'on', '++r say ok'),
    ('c4-r-A', 'tmp', 'default', 'mod', 'off', '++r say ok'),
    ('c4-am-A', 'tmp', 'default', 'mod', 'off', '++a ++m say ok'),
    ('c4-ctl', 'tmp', 'default', 'nomod', 'off', '++r say ok'),
    ('c5-fault', 'repo-root', 'default', 'fault', 'on', '++r say ok'),
]
BY = {r[0]: r for r in RUNS}

# unit id, label, A run, B run (or None), expected tokens (A and B), compare kind
UNITS = [
    ('1.r', 'default ++r', 'c1-r-A', 'c1-r-B', ['++r'], 'same'),
    ('1.am', 'default ++a ++m', 'c1-am-A', 'c1-am-B', ['++m', '++a'], 'same'),
    ('1.rr', 'default ++rr', 'c1-rr-A', 'c1-rr-B', ['++rr'], 'same'),
    ('2.m', 'plan ++m (m.plan)', 'c2-m-A', 'c2-m-B', ['++m'], 'same'),
    ('2.cron', 'plan +++ (cron)', 'c2-cron-A', 'c2-cron-B', ['+++'], 'same'),
    ('2.cron-def', 'default +++ (none)', 'c2-cron-default-A', 'c2-cron-default-B', [], 'same'),
    ('3a', 'subdir launch, overrides at git root', 'c3a-deep-A', 'c3a-deep-B', ['++r'], 'subdir'),
    ('3b', 'root launch, overrides at root', 'c3b-root-A', 'c3b-root-B', ['++r'], 'layers'),
    ('3c', 'subdir launch, overrides in launch dir', 'c3c-local-A', 'c3c-local-B', ['++r'], 'layers'),
    ('4.r', 'brewtools off ++r', 'c4-r-A', 'c1-r-B', ['++r'], 'off'),
    ('4.am', 'brewtools off ++a ++m', 'c4-am-A', 'c1-am-B', ['++m', '++a'], 'off'),
    ('4.ctl', 'brewtools off, no mod ++r', 'c4-ctl', None, [], 'ctl'),
    ('5.fault', 'mod throws after next(): brewtools block once', 'c5-fault', None, ['++r'], 'fault'),
]

JOINER = '\n\n---\n\n'
SPLIT = re.compile(r'\n\n---\n\n(?=User typed `)')
HEAD = re.compile(r'^User typed `([^`]+)` ')


def sha(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def cmd_plan(_):
    for r in RUNS:
        print('\t'.join(r))


def cmd_mkfault(a):
    # a: <mod snapshot> <fault copy>; the throw sits right after `await next(e)` in classic.UserPromptSubmit, where a local try/catch would not reach it.
    src, dst = a[0], a[1]
    shutil.copytree(src, dst)
    p = os.path.join(dst, 'hooks', 'register.ts')
    s = open(p, encoding='utf-8').read()
    pat = re.compile(r'(\n( +)const r = await next\(e\)\n)(?= +return built === null)')
    if len(pat.findall(s)) != 1:
        print('ab-check: PRECONDITION register.ts has no unique `const r = await next(e)` followed by `return built === null`')
        sys.exit(2)
    s = pat.sub(lambda m: m.group(1) + m.group(2) + "if (r !== undefined) throw new Error('boom-after-next')\n", s)
    open(p, 'w', encoding='utf-8').write(s)


def cmd_mkrepo(a):
    d, where = a[0], a[1]
    base = d if where == 'root' else os.path.join(d, 'sub', 'deep')
    os.makedirs(os.path.join(d, 'sub', 'deep'), exist_ok=True)
    for rel, text in (('.claude/placeholders/r.md', NATIVE_FILE), ('.claude/brewtools/manager/prompts/review-double.md', LEGACY_FILE)):
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
    res['bt_hook'] = len(re.findall(r'manager-prompt\.mjs\] \(plugin brewtools@claude-brewcode\) finished with status 0', dbg))
    for line in rd('.stream.jsonl').splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get('type') == 'result':
            res['result'] = {'subtype': d.get('subtype'), 'is_error': d.get('is_error'), 'text': (d.get('result') or '')[:40]}
    with open(g('.inj.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(f"{name}: rc={res['rc']} rows={res['rows']} count={res['count']} sha={res['sha'][:12]} chars={res['chars']} modloaded={res['mod_loaded']} btHook={res['bt_hook']} notLoad={res['did_not_load']}")


def load(out, name):
    p = os.path.join(out, name + '.inj.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


def run_checks(x, spec):
    # per-run preconditions; returns list of failure strings
    _, _, _, mod, bt, _ = spec
    f = []
    if x is None:
        return ['no extraction']
    if x['transcripts'] != 1:
        f.append(f"transcripts={x['transcripts']}")
    if x['did_not_load'] != 0:
        f.append('hooks module did not load')
    if (x['mod_loaded'] >= 1) != (mod in ('mod', 'fault')):
        f.append(f"mod_loaded={x['mod_loaded']} (expected {'>=1' if mod in ('mod', 'fault') else 0})")
    if (x['bt_hook'] >= 1) != (bt == 'on'):
        f.append(f"brewtools hook runs={x['bt_hook']} (expected {'>=1' if bt == 'on' else 0})")
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
    for uid, label, an, bn, toks, kind in [u for u in UNITS if not only or only in (u[2], u[3])]:
        xa, xb = load(out, an), (load(out, bn) if bn else None)
        fails = []
        deviation = None
        fails += ['A: ' + s for s in run_checks(xa, BY[an])]
        if bn and bn in BY:
            fails += ['B: ' + s for s in run_checks(xb, BY[bn])]
        if xa is not None:
            fails += ['A: ' + s for s in exact_once(xa, toks)]
        if xb is not None and bn:
            fails += ['B: ' + s for s in exact_once(xb, toks)]
        if xa is not None and xb is not None:
            if kind in ('same', 'off'):
                if xa['entries'] != xb['entries'] or xa['sha'] != xb['sha']:
                    fails.append(f"A != B bytes (A {xa['sha'][:12]}/{xa['bytes']}B, B {xb['sha'][:12]}/{xb['bytes']}B)")
            if kind == 'subdir':
                ctl = load(out, 'c1-r-B')
                spec_ok = xa['entries'] == [EXP_R_NATIVE] and xb['entries'] == [EXP_R_LEGACY]
                dflt_ok = ctl is not None and xa['entries'] == ctl['entries'] and xb['entries'] == ctl['entries']
                if not spec_ok:
                    if dflt_ok and not fails:
                        deviation = 'SPEC PREMISE NOT REPRODUCED: from sub/deep neither A nor B reads overrides at the git root; both use the launch dir as project root and fall back to the DEFAULT text (A == B)'
                    else:
                        fails.append('A/B text is neither the spec layers nor the default text: ' + json.dumps([xa['entries'], xb['entries']])[:300])
            if kind == 'layers':
                if xa['entries'] != [EXP_R_NATIVE]:
                    fails.append('A text != expected native project layer text: ' + json.dumps(xa['entries'])[:200])
                if xb['entries'] != [EXP_R_LEGACY]:
                    fails.append('B text != expected brewtools legacy override text: ' + json.dumps(xb['entries'])[:200])
        if kind == 'fault' and xa is not None:
            if xa['entries'] != [EXP_R_LEGACY]:
                fails.append('fault text != brewtools legacy override text: ' + json.dumps(xa['entries'])[:200])
            if xa['hook_failed'] < 1:
                fails.append('debug log has no `hook failed: brewmod-placeholders` line (the fault did not fire)')
            if xa['bt_hook'] != 1:
                fails.append(f"brewtools hook runs={xa['bt_hook']} (expected exactly 1, not replayed)")
        if kind == 'ctl' and xa is not None and xa['rows'] != 0:
            fails.append(f"rows={xa['rows']} with brewtools off and no mod")
        ok = not fails
        allok = allok and ok
        if deviation and ok:
            devs.append((uid, deviation))
        fmt = lambda x: '-' if x is None else ','.join(f'{t}x{c}' for t, c in x['count'].items()) or 'none'
        shaa = '-' if xa is None else f"{xa['sha'][:10]}/{xa['bytes']}B"
        shab = '-' if xb is None else f"{xb['sha'][:10]}/{xb['bytes']}B"
        lines.append((uid, label, fmt(xa), fmt(xb), shaa, shab, ('DEVIATION' if deviation else 'PASS') if ok else 'FAIL', fails))
    print('| Case | Scenario | A inj | B inj | A sha/len | B sha/len | Verdict |')
    print('|---|---|---|---|---|---|---|')
    for l in lines:
        print('| ' + ' | '.join(l[:7]) + ' |')
    for l in lines:
        for fl in l[7]:
            print(f'FAIL-DETAIL {l[0]}: {fl}')
    for uid, d in devs:
        print(f'DEVIATION {uid}: {d}')
    print('OVERALL ' + ('PASS' if allok else 'FAIL') + (f' ({len(devs)} DEVIATION: ' + ','.join(u for u, _ in devs) + ')' if devs else ''))
    sys.exit(0 if allok else 1)


if __name__ == '__main__':
    {'plan': cmd_plan, 'mkfault': cmd_mkfault, 'mkrepo': cmd_mkrepo, 'extract': cmd_extract, 'verdict': cmd_verdict}[sys.argv[1]](sys.argv[2:])
