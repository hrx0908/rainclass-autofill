const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../rainclass-autofill.user.js');

// Preserve paragraph boundaries and source positions, including unusual keys.
const vectors = [
  'B A B D ACD ABCD ABCD A BCD ABD 对 对 B 对',
  'D C B B D ABCD ABD ABD ABCD 对 错 对 错 对',
  '对 对 对 错 错 D A ABCD ABCD ABCD ABCD ABCD',
  'BC A A BCD ABC AD ABCD A',
  'B D C B B ABC ACD AB BCD ABCD 错 错 对 对 对',
  'C C C A B ABD ACD ABC AC ABD 对 对 错 错',
  'A D B D C ABCD ABCD BD ABCD 对 对 对 ABCD',
  'A C B A ABC CD',
  'C D C C B AD ACD ABCD BCD ABCD 错 对 错 对 错 错',
  'C B A C B BC ABCD ABCD ABCD ABCD 对 错 对 错 对',
  'A 对 对 对 对 ABCD ABCD ABCD ABCDE AB ABCD',
  'A A B C D BD ABCD ACD BCD ABCD 错 错 错 错 错',
  'B D A B D D ABCD ABD ABCD BC 对 错 错'
];
const bank = api.engineeringEntries();
const chapters = [...new Set(bank.map(entry => entry.chapter))];
function fixedParts(entry) {
  return [entry.raw.slice(0, entry.answers[0].start), ...entry.answers.map((answer, i) => entry.raw.slice(answer.end, entry.answers[i + 1]?.start ?? entry.raw.length))];
}
function choice(type = 'single', ordinal = 1, keys = ['A', 'B', 'C', 'D']) {
  return { type, ordinal, text: '人工构造的工程伦理测试题干。', parts: ['人工构造的工程伦理测试题干。'], fields: [],
    options: keys.map(key => ({ key, text: '示例选项' + key })) };
}
function match(question, chapter = chapters[0], options = {}) {
  return api.matchEngineeringQuestion(question, bank, chapter, { total: bank.filter(entry => entry.chapter === chapter).length, ...options });
}

for (const [i, vector] of vectors.entries()) test('engineering source chapter ' + (i + 1) + ' preserves every key and ordinal', () => {
  const records = bank.filter(entry => entry.chapter === chapters[i] && entry.type === 'sequence');
  assert.deepEqual(records.map(entry => entry.sequenceAnswer), vector.split(' '));
  assert.deepEqual(records.map(entry => entry.sourceIndex), Array.from({ length: records.length }, (_, j) => j + 1));
  assert.ok(records.every(entry => entry.source === api.ENGINEERING_SOURCE && entry.answers.length === 0));
});

test('engineering bank has thirteen chapters, 166 keys and two full three-blank records', () => {
  assert.equal(chapters.length, 13); assert.equal(bank.length, 168);
  assert.deepEqual(chapters.map(chapter => bank.filter(entry => entry.chapter === chapter).length), [14,14,12,8,15,14,13,8,16,15,11,15,13]);
  const blanks = bank.filter(entry => entry.expectedType === 'blank');
  assert.deepEqual(blanks.map(entry => entry.sourceIndex), [7,8]);
  assert.deepEqual(blanks.map(entry => entry.answers.map(answer => answer.text)), [['全体员工','工厂主门','公众'], ['安全发展','生命至上','安全第一']]);
  const fresh = api.engineeringEntries(); fresh[0].sequenceAnswer = 'D'; fresh.find(entry => entry.answers.length).answers[0].text = '变更';
  assert.equal(api.engineeringEntries()[0].sequenceAnswer, 'B');
  assert.equal(api.engineeringEntries().find(entry => entry.answers.length).answers[0].text, '全体员工');
});

test('ordinal matching requires a chapter, valid ordinal, verified mode and equal chapter total', () => {
  assert.equal(match(choice(), '').status, 'unmatched');
  for (const total of [null, 13, 15, '14']) assert.equal(match(choice(), chapters[0], { total }).status, 'unmatched');
  for (const ordinal of [null, 0, 15, 1.5, '1']) assert.equal(match(choice('single', ordinal)).status, 'unmatched');
  assert.equal(match(choice(), chapters[0], { engineeringOrder: false }).status, 'unmatched');
  assert.deepEqual(match(choice()).answers, ['B']); assert.equal(match(choice()).method, 'engineering-order');
  assert.equal(match(choice()).exact, false);
});

test('choice keys never become boolean answers or cross a type or option mismatch', () => {
  assert.equal(match(choice('judgment', 13, ['true','false'])).status, 'unmatched'); // Source has B here: preserve it.
  assert.equal(match(choice('single', 5)).status, 'unmatched'); // ACD requires multiple selection.
  assert.deepEqual(match(choice('multiple', 5)).answers, ['A','C','D']);
  assert.equal(match(choice('multiple', 5, ['A','B','C'])).status, 'unmatched');
  assert.equal(match(choice('single', 11)).status, 'unmatched'); // Source is 对 here.
  assert.deepEqual(match(choice('multiple', 9, ['A','B','C','D','E']), chapters[10]).answers, ['A','B','C','D','E']);
  assert.equal(match(choice('multiple', 9), chapters[10]).status, 'unmatched');
});

test('Chinese judgment keys select semantic controls even when false is first', () => {
  const q = choice('judgment', 11, ['false','true']);
  assert.deepEqual(match(q).answers, ['true']);
  assert.deepEqual(match(q, chapters[1]).answers, ['false']);
  assert.equal(match(choice('judgment', 11, ['A','B'])).status, 'unmatched');
});

test('engineering image options may use confirmed letters while other courses keep manual review', () => {
  const q = choice(); q.imageDependent = true; q.options[1].imageDependent = true;
  assert.deepEqual(match(q).answers, ['B']);
  assert.equal(api.matchQuestion(q, bank, chapters[0]).status, 'unmatched');
});

test('ordinal keys are not used as text or blank answers', () => {
  const entry = bank[0];
  assert.deepEqual(api.align(['人工构造的完整填空题干', ''], entry), []);
  assert.equal(api.matchQuestion(choice(), [entry]).status, 'unmatched');
  assert.equal(match({ type: 'blank', ordinal: 1, parts: ['人工构造的完整填空题干',''], fields: [{}] }).status, 'unmatched');
});

test('both chapter eight blanks require all three slots and full surrounding text, independent of ordinal', () => {
  for (const entry of bank.filter(entry => entry.expectedType === 'blank')) {
    const q = { type: 'blank', ordinal: 99, parts: fixedParts(entry), fields: [{},{},{}] };
    const result = match(q, entry.chapter, { total: null, engineeringOrder: false });
    assert.equal(result.status, 'matched'); assert.equal(result.exact, true);
    assert.deepEqual(result.answers, entry.answers.map(answer => answer.text));
    assert.equal(match({ ...q, fields: [{},{}] }, entry.chapter).status, 'unmatched');
    assert.equal(match({ ...q, parts: ['不同题干', ...q.parts.slice(1)] }, entry.chapter).status, 'unmatched');
    assert.equal(match({ ...q, parts: [...q.parts.slice(0, -1), q.parts.at(-1) + '附加条件'] }, entry.chapter).status, 'unmatched');
    assert.equal(match({ ...q, imageDependent: true }, entry.chapter).status, 'unmatched');
    assert.equal(match(choice('single', entry.sourceIndex), entry.chapter).status, 'unmatched');
  }
});

const { fixture } = require('./fixtures.cjs');

test('mixed engineering scan is read only; trial and simulated per-question submissions use the correct controls', async () => {
  const f = fixture();
  await f.controller.task(() => f.controller.scan());
  assert.equal(f.controller.scanReport().matchedCount, 4); assert.deepEqual(f.drafts, [[],[],[],[]]); assert.deepEqual(f.clicks, []);
  assert.deepEqual(f.controller.scanReport().questions.map(q => q.method), ['engineering-order','engineering-order','engineering-order','text']);
  await assert.rejects(f.controller.task(() => f.controller.fillAndSubmit()), /先检查全部/);
  await f.controller.task(() => f.controller.fillCurrent()); assert.deepEqual(f.clicks, []);
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 4);
  assert.deepEqual(f.clicks, [1,2,3,4]); assert.deepEqual(f.drafts, [['B'],['A','C'],['false'],['示例一','示例二','示例三']]);
});

test('engineering signatures and manual overrides stay scoped to their question ordinal', () => {
  const f = fixture({ types: ['single','single','judgment','blank'] });
  const first = f.controller.current(); f.controller.overrides.set(first.signature, ['A']);
  assert.deepEqual(f.controller.resolve(first).answers, ['A']); f.render(1);
  assert.notEqual(first.signature, f.controller.current().signature);
  assert.equal(f.controller.resolve(f.controller.current()).status, 'unmatched');
});

test('source Chinese judgments fill tick or cross in reversed reactive controls and protect existing answers', async () => {
  for (const [chapter, answer] of [[chapters[0], 'true'], [chapters[1], 'false']]) {
    const entries = bank.filter(entry => entry.chapter === chapter);
    const types = entries.map(entry => ['对','错'].includes(entry.sequenceAnswer) ? 'judgment' : entry.sequenceAnswer.length > 1 ? 'multiple' : 'single');
    const f = fixture({ entries, chapter, types }); f.render(10);
    assert.deepEqual(f.controller.current().options.map(option => option.key), ['false','true']);
    await f.controller.task(() => f.controller.fillCurrent());
    assert.deepEqual(f.drafts[10], [answer]); assert.deepEqual(f.clicks, []);
    f.drafts[10] = [answer === 'true' ? 'false' : 'true']; f.render(10);
    await assert.rejects(f.controller.task(() => f.controller.fillCurrent()), /已有不同选项/);
    await f.controller.task(() => f.controller.fillCurrent(true)); assert.deepEqual(f.drafts[10], [answer]);
  }
});

test('both source chapter eight three-blank templates fill and read back without submitting', async () => {
  const chapter = chapters[7], entries = bank.filter(entry => entry.chapter === chapter);
  const types = entries.map(entry => entry.expectedType === 'blank' ? 'blank' : entry.sequenceAnswer.length > 1 ? 'multiple' : 'single');
  const f = fixture({ entries, chapter, types });
  for (const index of [6,7]) {
    f.render(index); await f.controller.task(() => f.controller.fillCurrent());
    assert.deepEqual(f.drafts[index], entries[index].answers.map(answer => answer.text));
  }
  assert.deepEqual(f.clicks, []);
});

test('engineering resumes after a stop, but a changed order setting invalidates the checkpoint', async () => {
  const f = fixture();
  f.doc.querySelectorAll('#nav button')[2].addEventListener('click', () => { f.controller.stopped = true; }, { once: true });
  await assert.rejects(f.controller.task(() => f.controller.scan()), /已停止/);
  assert.equal(f.controller.resumeStatus().nextIndex, 3); const report = f.controller.lastScan; f.visited.length = 0;
  await f.controller.task(() => f.controller.scan({ resume: true }));
  assert.equal(f.controller.lastScan, report); assert.deepEqual(f.visited, [4]); // Current question 3 is already loaded.
  assert.equal(report.questions.length, 4); assert.deepEqual(f.clicks, []);
  const g = fixture(); g.doc.querySelectorAll('#nav button')[2].addEventListener('click', () => { g.controller.stopped = true; }, { once: true });
  await assert.rejects(g.controller.task(() => g.controller.scan()), /已停止/);
  g.controller.config.engineeringOrder = false;
  await assert.rejects(g.controller.task(() => g.controller.scan({ resume: true })), /请从头匹配/);
});

test('engineering skips incompatible questions and preserves their drafts during matched-only submission', async () => {
  const f = fixture({ types: ['single','single','judgment','blank'] });
  f.drafts[1] = ['D']; f.render(0);
  await f.controller.task(() => f.controller.scan()); assert.deepEqual(f.controller.scanReport().skippedIndices, [2]);
  f.render(0); await f.controller.task(() => f.controller.fillCurrent());
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 3);
  assert.deepEqual(f.clicks, [1,3,4]); assert.deepEqual(f.drafts[1], ['D']);
});

test('changing a chapter total blocks ordinal filling before writing any choice', async () => {
  const f = fixture(); f.controller.entries.pop();
  await assert.rejects(f.controller.task(() => f.controller.fillCurrent()), /题数/);
  assert.deepEqual(f.drafts, [[],[],[],[]]); assert.deepEqual(f.clicks, []);
});

test('course panel loads all engineering chapters offline and preserves reload selection', async () => {
  const f = fixture(); let requests = 0; f.win.GM_xmlhttpRequest = () => { requests++; };
  api.mount(f.win); const ui = f.doc.getElementById('rainclass-autofill-panel').shadowRoot;
  const select = course => { ui.getElementById('course').value = course; ui.getElementById('course').dispatchEvent(new f.win.Event('change')); };
  select('engineering');
  assert.equal(requests, 0); assert.match(ui.getElementById('log').textContent, /已读取 168 条/);
  assert.equal(ui.getElementById('chapter').options.length, 14); assert.equal(ui.getElementById('chapter').value, api.ENGINEERING_CHAPTER);
  assert.equal(ui.getElementById('engineeringOrderLabel').hidden, false); assert.equal(ui.getElementById('imageOrderLabel').hidden, true);
  assert.equal(ui.getElementById('sourceImport').hidden, true); assert.match(ui.getElementById('matchMode').textContent, /对→√，错→×/);
  ui.getElementById('chapter').value = chapters[7]; ui.getElementById('chapter').dispatchEvent(new f.win.Event('change')); ui.getElementById('load').click();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(ui.getElementById('chapter').value, chapters[7]); assert.equal(requests, 0);
  select('research'); assert.equal(ui.getElementById('chapter').options.length, 7); assert.equal(ui.getElementById('engineeringOrderLabel').hidden, true);
  select('ai'); assert.equal(ui.getElementById('chapter').options.length, 1); assert.equal(ui.getElementById('sourceImport').hidden, false);
  assert.equal(ui.getElementById('submit').disabled, true); assert.equal(ui.getElementById('scanResume').disabled, true);
  assert.equal(ui.getElementById('scanReport').disabled, true); assert.equal(ui.getElementById('preview').children.length, 0);
});
