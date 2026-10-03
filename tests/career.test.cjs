const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../rainclass-autofill.user.js');
const { fixture } = require('./fixtures.cjs');
const bank = api.careerEntries();
const chapters = [...new Set(bank.map(entry => entry.chapter))];
const rawVectors = [
  ['C','A','A','ABCD','ABC','对','对','对','DB',''],
  ['A','B','C','B','D','错','对','对','ABC','ABCD'],
  ['C','D','C','对','错','对','对','错','AB','ABC'],
  ['D','C','C','A','B','错','对','错','ABC','ABCD'],
  ['A','A','B','B','C','错','对','ABCDE','ABC','ABCD'],
  ['A','C','D','D','B','错','错','错','ABC','ABCDE'],
  ['A','B','C','A','B','对','错','错','ABC','ABC'],
  ['B','C','D','B','对','错','对','错','ABCD','ABC'],
  ['C','B','B','A','D','对','错','错','ABCDE','ABCD'],
  ['C','A','C','A','对','对','错','对','ABCDE','ABC'],
  ['B','D','B','B','C','错','AC','对','对','ABC'],
  ['B','A','C','D','D','对','对','对','ACD','ABCD'],
  ['A','A','对','对','对','对','对','错','ABCDE','ABCD']
];
function choice(type = 'single', ordinal = 1, keys = ['A','B','C','D','E']) {
  return { type, ordinal, fields: [], text: '人工构造的生涯规划测试题干', parts: ['人工构造的生涯规划测试题干'], options: keys.map(key => ({ key, text: '示例选项' + key })) };
}
function match(q, chapter = api.CAREER_CHAPTER, options = {}) {
  return api.matchCareerQuestion(q, bank, chapter, { total: 10, careerOrder: true, ...options });
}
function careerFixture(chapter = api.CAREER_CHAPTER, { wrongType = false } = {}) {
  const entries = api.careerEntries().filter(entry => entry.chapter === chapter);
  const types = entries.map(entry => ['对','错'].includes(entry.sequenceAnswer) ? 'judgment' : entry.sequenceAnswer.length > 1 ? 'multiple' : 'single');
  if (wrongType) types[3] = 'single';
  return fixture({ entries, chapter, types, course: 'career', optionKeys: ['A','B','C','D','E'] });
}
for (const [i, vector] of rawVectors.entries()) test('career chapter ' + (i + 2) + ' retains ten source cells without concatenating or shifting', () => {
  const entries = bank.filter(entry => entry.chapter === chapters[i]);
  assert.deepEqual(entries.map(entry => entry.raw), vector);
  assert.deepEqual(entries.map(entry => entry.sourceIndex), [1,2,3,4,5,6,7,8,9,10]);
  assert.ok(entries.every(entry => entry.source === api.CAREER_SOURCE && entry.type === 'sequence'));
});

test('career contains exactly chapters two through fourteen and 130 records, without inventing chapter one', () => {
  assert.equal(chapters.length, 13); assert.equal(bank.length, 130);
  assert.equal(chapters[0], api.CAREER_CHAPTER); assert.equal(chapters.at(-1), '第十四章习题');
  assert.equal(chapters.includes('第一章习题'), false);
  assert.ok(bank.every(entry => entry.sequenceAnswer));
  const fresh = api.careerEntries(); fresh[0].sequenceAnswer = 'B'; assert.equal(api.careerEntries()[0].sequenceAnswer, 'C');
});

test('the verified second chapter correction splits D and B into questions nine and ten only', () => {
  assert.deepEqual(match(choice('single', 9)).answers, ['D']);
  assert.deepEqual(match(choice('single', 10)).answers, ['B']);
  const corrections = bank.filter(entry => entry.referenceCorrection);
  assert.deepEqual(corrections.map(entry => [entry.chapter, entry.sourceIndex, entry.sourceAnswer, entry.sequenceAnswer]), [[api.CAREER_CHAPTER,9,'DB','D'],[api.CAREER_CHAPTER,10,'','B']]);
  assert.equal(match(choice('single', 9)).method, 'career-order');
  assert.deepEqual(match(choice('multiple', 9), chapters[1]).answers, ['A','B','C']);
  assert.deepEqual(match(choice('multiple', 10), chapters[1]).answers, ['A','B','C','D']);
});

test('career matching requires the correct chapter, ten questions, valid ordinal and enabled mode', () => {
  assert.equal(match(choice(), '').status, 'unmatched');
  assert.equal(match(choice(), '第一章习题').status, 'unmatched');
  for (const total of [null, 9, 11, '10']) assert.equal(match(choice(), api.CAREER_CHAPTER, { total }).status, 'unmatched');
  for (const ordinal of [null, 0, 11, '1', 1.5]) assert.equal(match(choice('single', ordinal)).status, 'unmatched');
  assert.equal(match(choice(), api.CAREER_CHAPTER, { careerOrder: false }).status, 'unmatched');
  assert.deepEqual(match(choice()).answers, ['C']);
});

test('career checks type, selected letters and semantic true/false controls, including five-option questions', () => {
  assert.equal(match(choice('single', 4)).status, 'unmatched');
  assert.deepEqual(match(choice('multiple', 4)).answers, ['A','B','C','D']);
  assert.equal(match(choice('multiple', 4, ['A','B','C'])).status, 'unmatched');
  assert.deepEqual(match(choice('judgment', 6, ['false','true'])).answers, ['true']);
  assert.deepEqual(match(choice('judgment', 6, ['false','true']), chapters[1]).answers, ['false']);
  assert.equal(match(choice('judgment', 6, ['A','B'])).status, 'unmatched');
  assert.equal(match(choice('single', 6)).status, 'unmatched');
  assert.equal(match(choice('judgment', 1, ['true','false'])).status, 'unmatched');
  assert.deepEqual(match(choice('multiple', 8), chapters[4]).answers, ['A','B','C','D','E']);
  assert.equal(match(choice('multiple', 8, ['A','B','C','D']), chapters[4]).status, 'unmatched');
});

test('career can use confirmed image-option letters but cannot turn letter keys into fill answers', () => {
  const q = choice(); q.imageDependent = true; q.options[2].imageDependent = true;
  assert.deepEqual(match(q).answers, ['C']); assert.equal(api.matchQuestion(q, bank, api.CAREER_CHAPTER).status, 'unmatched');
  assert.equal(match({ type: 'blank', ordinal: 1, parts: ['人工构造的完整题干',''], fields: [{}] }).status, 'unmatched');
  assert.deepEqual(api.align(['人工构造的完整题干',''], bank[0]), []);
});

test('career read-only scan and trial submit ten separate questions with corrected D/B and boolean values', async () => {
  const f = careerFixture(); await f.controller.task(() => f.controller.scan());
  assert.equal(f.controller.scanReport().matchedCount, 10); assert.deepEqual(f.clicks, []); assert.ok(f.drafts.every(values => values.length === 0));
  const report = f.controller.scanReport(); assert.equal(report.course, 'career'); assert.equal(report.source, api.CAREER_SOURCE);
  assert.deepEqual(report.questions.filter(q => q.referenceCorrection).map(q => [q.index, q.sourceAnswer]), [[9,'DB'],[10,'']]);
  await assert.rejects(f.controller.task(() => f.controller.fillAndSubmit()), /先检查全部/);
  f.render(0); await f.controller.task(() => f.controller.fillCurrent());
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 10);
  assert.deepEqual(f.clicks, [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(f.drafts, [['C'],['A'],['A'],['A','B','C','D'],['A','B','C'],['true'],['true'],['true'],['D'],['B']]);
});

test('career skips a type mismatch and preserves its existing choice without submitting it', async () => {
  const f = careerFixture(api.CAREER_CHAPTER, { wrongType: true }); f.drafts[3] = ['E'];
  await f.controller.task(() => f.controller.scan()); assert.deepEqual(f.controller.scanReport().skippedIndices, [4]);
  f.render(0); await f.controller.task(() => f.controller.fillCurrent());
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 9);
  assert.deepEqual(f.clicks, [1,2,3,5,6,7,8,9,10]); assert.deepEqual(f.drafts[3], ['E']);
});

test('career resumes at a stopped question and rejects a changed course, bank, chapter or order setting', async () => {
  const f = careerFixture();
  f.doc.querySelectorAll('#nav button')[4].addEventListener('click', () => { f.controller.stopped = true; }, { once: true });
  await assert.rejects(f.controller.task(() => f.controller.scan()), /已停止/);
  const report = f.controller.lastScan; assert.equal(f.controller.resumeStatus().nextIndex, 5);
  await f.controller.task(() => f.controller.scan({ resume: true })); assert.equal(f.controller.lastScan, report);
  assert.equal(report.questions.length, 10); assert.equal(report.resumeCount, 1); assert.deepEqual(f.clicks, []);
  for (const change of [c => { c.config.careerOrder = false; }, c => { c.course = 'engineering'; }, c => { c.chapter = chapters[1]; }, c => { c.entries[8].sequenceAnswer = 'A'; }]) {
    const g = careerFixture(); g.doc.querySelectorAll('#nav button')[1].addEventListener('click', () => { g.controller.stopped = true; }, { once: true });
    await assert.rejects(g.controller.task(() => g.controller.scan()), /已停止/); change(g.controller);
    await assert.rejects(g.controller.task(() => g.controller.scan({ resume: true })), /请从头匹配/); assert.deepEqual(g.clicks, []);
  }
});

test('career manual answers remain scoped to both course and displayed ordinal', () => {
  const f = careerFixture(); const q = f.controller.current(); f.controller.overrides.set(q.signature, ['B']);
  assert.deepEqual(f.controller.resolve(q).answers, ['B']); f.render(1); assert.deepEqual(f.controller.resolve(f.controller.current()).answers, ['A']);
  f.render(0); f.controller.course = 'engineering'; assert.notEqual(f.controller.current().signature, q.signature);
});

test('career course selector loads offline, preserves chapters, displays correction and clears stale course state', async () => {
  const f = careerFixture(); let requests = 0; f.win.GM_xmlhttpRequest = () => { requests++; };
  api.mount(f.win); const ui = f.doc.getElementById('rainclass-autofill-panel').shadowRoot;
  const select = course => { ui.getElementById('course').value = course; ui.getElementById('course').dispatchEvent(new f.win.Event('change')); };
  select('career'); assert.equal(requests, 0); assert.match(ui.getElementById('log').textContent, /已读取 130 条/);
  assert.equal(ui.getElementById('chapter').value, api.CAREER_CHAPTER); assert.equal(ui.getElementById('chapter').options.length, 14);
  assert.ok([...ui.getElementById('chapter').options].every(option => option.value !== '第一章习题'));
  assert.equal(ui.getElementById('sourceImport').hidden, true); assert.equal(ui.getElementById('careerOrderLabel').hidden, false);
  assert.equal(ui.getElementById('engineeringOrderLabel').hidden, true); assert.equal(ui.getElementById('imageOrderLabel').hidden, true);
  assert.equal(ui.getElementById('careerOrder').checked, true); assert.match(ui.getElementById('matchMode').textContent, /每章10题/);
  ui.getElementById('chapter').value = chapters.at(-1); ui.getElementById('chapter').dispatchEvent(new f.win.Event('change')); ui.getElementById('load').click();
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(ui.getElementById('chapter').value, chapters.at(-1));
  ui.getElementById('chapter').value = api.CAREER_CHAPTER; ui.getElementById('chapter').dispatchEvent(new f.win.Event('change')); f.render(8);
  ui.getElementById('previewButton').click(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ui.querySelector('#preview input:checked').value, 'D'); assert.match(ui.getElementById('preview').textContent, /第9题为D，第10题为B/);
  for (const course of ['research','engineering','ai','career']) {
    select(course); assert.equal(ui.getElementById('preview').children.length, 0); assert.equal(ui.getElementById('submit').disabled, true);
    assert.equal(ui.getElementById('scanReport').disabled, true); assert.equal(ui.getElementById('scanResume').disabled, true);
  }
  assert.equal(requests, 0);
});
