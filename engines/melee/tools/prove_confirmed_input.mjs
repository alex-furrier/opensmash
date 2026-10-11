// Asset-free protocol proof in two fresh browser contexts. No game execution.
import {createRequire} from 'node:module';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = await readFile(new URL('../runtime/web/netplay/confirmed-input.mjs', import.meta.url), 'utf8');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const results = [];
try {
  for (const scenario of ['ordered-hold', 'input-mutation', 'state-mutation', 'disconnect', 'fresh-neutral']) {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const pages = await Promise.all(contexts.map(c => c.newPage()));
    const chains = [Promise.resolve(), Promise.resolve()];
    const holds = [], counts = [0, 0];
    for (let i = 0; i < 2; i++) {
      await pages[i].route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/confirmed-input.mjs') return route.fulfill({contentType: 'text/javascript', body: source});
        if (url.pathname === '/') return route.fulfill({contentType: 'text/html', body: '<title>Confirmed input protocol proof</title><p>Asset-free protocol fixture</p>'});
        return route.abort();
      });
      await pages[i].exposeFunction('sendPeer', message => {
        chains[i] = chains[i].then(async () => {
          if (message.type === 'input') counts[i]++;
          if (scenario === 'disconnect' && i === 1 && message.type === 'input' && message.tick === 30) {
            await Promise.all(pages.map(p => p.evaluate(() => window.disconnected()))); return;
          }
          if (scenario === 'input-mutation' && i === 1 && message.type === 'input' && message.tick === 30) message.pad[0] ^= 256;
          if (scenario === 'ordered-hold' && i === 1 && message.type === 'input' && message.tick === 450) {
            const begin = performance.now(); await new Promise(r => setTimeout(r, 80));
            holds.push(performance.now() - begin);
          }
          await pages[1 - i].evaluate(m => window.receive(m), message);
        });
        return chains[i];
      });
      await pages[i].goto('http://127.0.0.1:4189/');
      await pages[i].evaluate(async ({player, scenario}) => {
        const {createConfirmedInput, neutralPad} = await import('/confirmed-input.mjs');
        const peer = createConfirmedInput({session: scenario, player, timeoutMs: 3000,
          identity: {engine: 'fixture-v1', disc: 'none', rules: 'fixture', costumes: 'none', seed: '101'},
          channel: {send: m => { void window.sendPeer(m).catch(() => window.disconnected()); },
            subscribe: (receive, disconnect) => { window.receive = receive; window.disconnected = disconnect; return () => {}; }}});
        window.start = () => peer.start();
        window.run = async () => {
          let state = [0, 0], trace = [], acquired = 0;
          try {
            for (let tick = 0; tick <= 600; tick++) {
              const digest = scenario === 'state-mutation' && player === 1 && tick === 30 ? 'mutated' : JSON.stringify(state);
              const pads = await peer.synchronize(tick, () => {
                acquired++; const pad = neutralPad();
                if (scenario !== 'fresh-neutral') { pad[0] = tick % 11 === player ? 256 << player : 0; pad[1] = player ? -17 : 13; }
                return pad;
              }, digest);
              if (tick === 600) break; // final fixture-state confirmation, no extra simulation
              trace.push(pads);
              pads.slice(0, 2).forEach((pad, slot) => { state[slot] += pad[0] + pad[1]; });
            }
            return {progress: trace.length, state, trace, acquired, error: null};
          } catch (e) { return {progress: trace.length, state, trace, acquired, error: e.message}; }
          finally { peer.stop(); }
        };
      }, {player: i, scenario});
    }
    await Promise.all(pages.map(p => p.evaluate(() => window.start())));
    const peers = await Promise.all(pages.map(p => p.evaluate(() => window.run())));
    const equal = JSON.stringify(peers[0].trace) === JSON.stringify(peers[1].trace);
    const positive = ['ordered-hold', 'fresh-neutral'].includes(scenario);
    const passed = positive ? peers.every(p => p.progress === 600 && !p.error &&
      p.state.every(n => scenario === 'fresh-neutral' ? n === 0 : n !== 0)) && equal :
      peers.every(p => p.error && p.progress === (scenario === 'input-mutation' ? 31 : 30));
    const result = {scenario, passed, equalAppliedTraces: equal, holdsMs: holds, sentInput: counts,
      peers: peers.map(({trace, ...summary}) => ({...summary,
        appliedTraceSha256: createHash('sha256').update(JSON.stringify(trace)).digest('hex')}))};
    results.push(result);
    await Promise.all(contexts.map(c => c.close()));
    if (!passed) throw Error(`Protocol proof failed: ${JSON.stringify(result)}`);
  }
  const report = {browser: browser.version(), moduleSha256: createHash('sha256').update(source).digest('hex'),
    scope: 'Protocol fixture only; no Melee runtime or game assets', results};
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
