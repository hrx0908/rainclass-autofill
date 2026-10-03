const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const api = require('../rainclass-autofill.user.js');

// Synthetic examples only: no account, exported page, real assignment or network request.
const source = '<div id="cnblogs_post_body"><h2>测试章节</h2><ol>' +
  Array.from({ length: 4 }, (_, i) => '<li>学习示例中的第' + (i + 1) + '项应该填写<strong>示例答案' + (i + 1) + '</strong>作为测试内容。</li>').join('') + '</ol></div>';
const parser = new JSDOM('').window.DOMParser;
const entries = api.parseArticle(source, parser);
const pageUrl = 'https://www.yuketang.cn/ai-workspace/lms-graph/100/exercise/200';
const parts = entry => [entry.raw.slice(0, entry.answers[0].start), entry.raw.slice(entry.answers[0].end)];

function fixture({ failSubmission = false, skipUnmatched = true } = {}) {
  const win = new JSDOM('<main><p id="progress"></p><nav id="nav"></nav><article id="work"></article><button id="submit">提交</button><div id="notice" role="status"></div></main>', {
    url: pageUrl, pretendToBeVisual: true, runScripts: 'outside-only'
  }).window;
  const doc = win.document, drafts = entries.map(() => ['']), submitted = new Set(), clicks = [], visited = [];
  win.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 30 }]; };
  win.HTMLElement.prototype.scrollIntoView = function () {};
  let current = 0;
  function render(index) {
    current = index;
    doc.getElementById('notice').textContent = '';
    doc.getElementById('progress').textContent = submitted.size + '/4 题';
    for (const button of doc.querySelectorAll('#nav button')) button.classList.toggle('active', Number(button.textContent) === index + 1);
    const work = doc.getElementById('work'); work.replaceChildren();
    const title = doc.createElement('h3'); title.textContent = (index + 1) + '.填空题（1分）'; work.append(title);
    const paragraph = doc.createElement('p'); paragraph.className = 'question'; work.append(paragraph);
    const field = doc.createElement('input'); field.placeholder = '输入答案'; field.value = drafts[index][0]; field.readOnly = submitted.has(index);
    field.addEventListener('input', () => { drafts[index] = [field.value]; });
    const text = parts(entries[index]); paragraph.append(text[0], field, text[1]);
    doc.getElementById('submit').disabled = submitted.has(index);
  }
  entries.forEach((_, i) => {
    const button = doc.createElement('button'); button.textContent = i + 1;
    button.addEventListener('click', () => { visited.push(i + 1); render(i); }); doc.getElementById('nav').append(button);
  });
  doc.getElementById('submit').addEventListener('click', () => {
    clicks.push(current + 1);
    if (failSubmission) { doc.getElementById('notice').textContent = '提交失败'; return; }
    submitted.add(current); render(current); doc.getElementById('notice').textContent = '本题已提交';
  });
  render(0);
  const logs = [], controller = new api.Controller(win, { pacing: false, settle: 0, poll: 1, timeout: 250, skipUnmatched }, { log: message => logs.push(message) });
  controller.entries = structuredClone(entries);
  return { win, doc, controller, logs, drafts, clicks, visited, render };
}

function interruptAt(f, index) {
  f.doc.querySelectorAll('#nav button')[index - 1].addEventListener('click', () => { f.controller.stopped = true; }, { once: true });
}

test('blank answers are matched by their surrounding text despite a different displayed number', () => {
  const p = parts(entries[0]); p[0] = '99. ' + p[0];
  assert.deepEqual(api.matchQuestion({ type: 'blank', parts: p }, entries).answers, ['示例答案1']);
});

test('a blank moved to a different location does not borrow a reference answer', () => {
  assert.equal(api.matchQuestion({ type: 'blank', parts: ['学习示例中的', '项应该填写示例答案1作为测试内容。'] }, entries).status, 'unmatched');
});

test('conflicting reference answers require manual review', () => {
  const duplicate = api.parseArticle(source.replace('示例答案1', '冲突答案'), parser);
  assert.equal(api.matchQuestion({ type: 'blank', parts: parts(entries[0]) }, [...entries, ...duplicate]).status, 'ambiguous');
});

test('downloaded markup is parsed as inert text and script instructions are excluded', () => {
  const data = api.parseArticle('<div id="cnblogs_post_body"><h2>测试</h2><ol><li>用于测试的完整题干文字<script>globalThis.hacked=true</script><strong>&lt;img onerror=alert(1)&gt;</strong></li></ol></div>', parser);
  assert.equal(data[0].raw.includes('hacked'), false);
  assert.equal(data[0].answers[0].text, '<img onerror=alert(1)>');
});

test('research choices map to their current letters when option order changes', () => {
  const entry = api.researchEntries().find(record => record.chapter === api.RESEARCH_CHAPTER && record.sourceIndex === 2);
  const optionTexts = [...entry.expectedOptions].reverse();
  const question = { type: 'single', text: entry.raw.slice(0, entry.answers[0].start), parts: [entry.raw.slice(0, entry.answers[0].start)],
    options: optionTexts.map((text, i) => ({ key: String.fromCharCode(65 + i), text })) };
  const match = api.matchQuestion(question, [entry]);
  assert.equal(match.status, 'matched'); assert.deepEqual(match.answers, ['D']);
  question.options[0].text += '额外否定词';
  assert.equal(api.matchQuestion(question, [entry]).status, 'unmatched');
});

for (const [text, expected] of [['正确', 'true'], ['错误', 'false'], ['√', 'true'], ['×', 'false'], ['不一定', null]]) {
  test('judgment markers remain explicit: ' + text, () => assert.equal(api.parseJudgmentAnswer(text), expected));
}

test('single-choice validation rejects two answers or nonexistent options', () => {
  const question = { type: 'single', options: [{ key: 'A' }, { key: 'B' }] };
  assert.throws(() => api.choiceAnswers(question, ['A', 'B']), /只能选择一个/);
  assert.throws(() => api.choiceAnswers(question, ['C']), /不一致/);
});

test('malformed font data is rejected before it can be used', () => {
  assert.throws(() => api.fontOutlines(new Uint8Array(8)), /大小异常/);
});

test('scan reads every question without writing or submitting, then requires a trial', async () => {
  const f = fixture();
  await f.controller.task(() => f.controller.scan());
  assert.equal(f.controller.lastScan.completed, true); assert.deepEqual(f.clicks, []);
  assert.deepEqual(f.drafts, [[''], [''], [''], ['']]);
  await assert.rejects(f.controller.task(() => f.controller.fillAndSubmit()), /先检查全部/);
});

test('current fill emits input events and preserves a different existing answer by default', async () => {
  const f = fixture();
  f.doc.querySelector('.question input').value = '人工答案';
  await assert.rejects(f.controller.task(() => f.controller.fillCurrent()), /已有不同答案/);
  assert.equal(f.doc.querySelector('.question input').value, '人工答案');
  await f.controller.task(() => f.controller.fillCurrent(true));
  assert.deepEqual(f.drafts[0], ['示例答案1']); assert.deepEqual(f.clicks, []);
});

test('only a completed scan and trial allow simulated per-question submissions', async () => {
  const f = fixture();
  await f.controller.task(() => f.controller.scan());
  await f.controller.task(() => f.controller.fillCurrent());
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 4);
  assert.deepEqual(f.clicks, [1, 2, 3, 4]);
  assert.deepEqual(f.drafts, entries.map(entry => entry.answers.map(answer => answer.text)));
});

test('submission failure stops without retrying or proceeding to later questions', async () => {
  const f = fixture({ failSubmission: true });
  await f.controller.task(() => f.controller.scan()); await f.controller.task(() => f.controller.fillCurrent());
  await assert.rejects(f.controller.task(() => f.controller.fillAndSubmit()), /提交失败/);
  assert.deepEqual(f.clicks, [1]);
});

test('resume retries a timed-out question, preserving the checked prefix without duplicates', async () => {
  const f = fixture();
  f.doc.querySelectorAll('#nav button')[2].addEventListener('click', () => f.render(1), { once: true });
  await assert.rejects(f.controller.task(() => f.controller.scan()), /第 3 题超时/);
  const report = f.controller.lastScan, first = f.controller.scanState.records[0];
  assert.equal(report.nextIndex, 3); assert.equal(report.questions.length, 2); assert.equal(f.controller.plan, null);
  await assert.rejects(f.controller.task(() => f.controller.fillAndSubmit()), /先检查全部/);
  f.visited.length = 0;
  await f.controller.task(() => f.controller.scan({ resume: true }));
  assert.equal(f.controller.lastScan, report); assert.equal(f.controller.scanState.records[0], first);
  assert.deepEqual(f.visited, [3, 4]); assert.deepEqual(report.questions.map(q => q.index), [1, 2, 3, 4]);
  assert.equal(report.resumeCount, 1); assert.equal(report.nextIndex, null); assert.deepEqual(f.clicks, []);
});

test('repeated manual stops retain progress; a fresh scan discards it', async () => {
  const f = fixture(); interruptAt(f, 2); interruptAt(f, 3);
  await assert.rejects(f.controller.task(() => f.controller.scan()), /已停止/);
  await assert.rejects(f.controller.task(() => f.controller.scan({ resume: true })), /已停止/);
  assert.equal(f.controller.lastScan.questions.length, 2);
  const oldReport = f.controller.lastScan;
  await f.controller.task(() => f.controller.scan());
  assert.notEqual(f.controller.lastScan, oldReport); assert.equal(f.controller.lastScan.resumeCount, 0);
  assert.equal(f.controller.lastScan.questions.length, 4); assert.deepEqual(f.clicks, []);
});

for (const [name, mutate] of [
  ['chapter', f => { f.controller.chapter = '另一章节'; }],
  ['reference bank', f => { f.controller.entries[0].raw += '变化'; }],
  ['matching settings', f => { f.controller.config.skipUnmatched = false; }],
  ['assignment', f => { f.win.history.replaceState({}, '', '?changed=1'); }]
]) test('resume refuses a changed ' + name + ' before page actions', async () => {
  const f = fixture(); interruptAt(f, 3);
  await assert.rejects(f.controller.task(() => f.controller.scan()), /已停止/);
  mutate(f); f.visited.length = 0;
  await assert.rejects(f.controller.task(() => f.controller.scan({ resume: true })), /请从头匹配/);
  assert.deepEqual(f.visited, []); assert.deepEqual(f.clicks, []); assert.equal(f.controller.plan, null);
});

test('only matched questions are filled and submitted, leaving skipped drafts untouched', async () => {
  const f = fixture(); f.controller.entries = [entries[0], entries[3]];
  await f.controller.task(() => f.controller.scan());
  assert.deepEqual(f.controller.scanReport().skippedIndices, [2, 3]);
  await f.controller.task(() => f.controller.fillCurrent());
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 2);
  assert.deepEqual(f.clicks, [1, 4]); assert.deepEqual(f.drafts[1], ['']); assert.deepEqual(f.drafts[2], ['']);
});

test('random reading pauses remain interruptible before any writing or submission', async () => {
  const f = fixture(); f.controller.config.pacing = true;
  f.controller.hooks.random = () => .5;
  f.controller.hooks.sleep = async () => { f.controller.stopped = true; };
  await assert.rejects(f.controller.task(() => f.controller.scan()), /已停止/);
  assert.equal(f.controller.resumeStatus().nextIndex, 1);
  assert.deepEqual(f.clicks, []); assert.deepEqual(f.drafts, [[''], [''], [''], ['']]);
});

test('exported report omits current input values and cookies', async () => {
  const f = fixture();
  f.doc.cookie = 'secret=synthetic-cookie'; f.doc.querySelector('.question input').value = 'synthetic-private-answer';
  await f.controller.task(() => f.controller.scan());
  const json = JSON.stringify(f.controller.scanReport());
  assert.equal(json.includes('synthetic-cookie'), false); assert.equal(json.includes('synthetic-private-answer'), false);
});

test('panel mounts once and keeps submission and continuation disabled before checking', () => {
  const f = fixture(); api.mount(f.win); api.mount(f.win);
  assert.equal(f.doc.querySelectorAll('#rainclass-autofill-panel').length, 1);
  const ui = f.doc.getElementById('rainclass-autofill-panel').shadowRoot;
  assert.equal(ui.getElementById('scan').textContent, '从头匹配');
  assert.equal(ui.getElementById('scanResume').disabled, true); assert.equal(ui.getElementById('submit').disabled, true);
});
