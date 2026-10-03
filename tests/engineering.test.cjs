const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
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

// Synthetic reactive exercise: no account, real exported page or network operations.
function fixture({ entries, chapter = '测试章节', types = ['single','multiple','judgment','blank'] } = {}) {
  const win = new JSDOM('<p id="progress"></p><nav id="nav"></nav><main id="work"></main><button id="submit">提交</button><div role="status" id="notice"></div>', {
    url: 'https://www.yuketang.cn/ai-workspace/lms-graph/100/exercise/200', pretendToBeVisual: true
  }).window;
  const doc = win.document;
  win.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 30 }]; };
  win.HTMLElement.prototype.scrollIntoView = function () {};
  if (!entries) {
    const blank = api.parseArticle('<div id="cnblogs_post_body"><h2>测试章节</h2><ol><li>人工构造的三个空格依次为<strong>示例一</strong>接着<strong>示例二</strong>然后<strong>示例三</strong>结束。</li></ol></div>', win.DOMParser)[0];
    entries = ['B','AC','错'].map((key, i) => ({ type: 'sequence', sourceIndex: i + 1, chapter, raw: key, masked: '', answers: [], sequenceAnswer: key }));
    entries.push({ ...blank, sourceIndex: 4, expectedType: 'blank' });
  }
  const drafts = entries.map(() => []), submitted = new Set(), clicks = [], visited = [];
  let current = 0;
  function render(index) {
    current = index; const entry = entries[index], type = types[index];
    doc.getElementById('progress').textContent = submitted.size + '/' + entries.length + ' 题';
    doc.getElementById('notice').textContent = '';
    for (const node of doc.querySelectorAll('#nav button')) node.classList.toggle('active', Number(node.textContent) === index + 1);
    const work = doc.getElementById('work'); work.replaceChildren();
    const subject = doc.createElement('div'); subject.className = 'subject-item'; work.append(subject);
    const heading = doc.createElement('h3'); heading.className = 'item-type';
    heading.textContent = (index + 1) + '.' + ({ single: '单选题', multiple: '多选题', judgment: '判断题', blank: '填空题' })[type] + '（1分）'; subject.append(heading);
    const body = doc.createElement('div'); body.className = 'item-body'; subject.append(body);
    const problem = doc.createElement('div'); problem.className = 'problem-body'; body.append(problem);
    if (type === 'blank') {
      const p = fixedParts(entry); problem.append(p[0]);
      entry.answers.forEach((_, i) => {
        const input = doc.createElement('input'); input.placeholder = '输入答案'; input.value = drafts[index][i] ?? ''; input.readOnly = submitted.has(index);
        input.addEventListener('input', () => { drafts[index][i] = input.value; }); problem.append(input, p[i + 1]);
      });
    } else {
      problem.textContent = '人工构造的选择题完整测试题干。'; // Deliberately identical stems test ordinal signatures.
      const list = doc.createElement('ul'); list.className = type === 'multiple' ? 'list-unstyled-checkbox' : 'list-unstyled-radio'; body.append(list);
      for (const key of type === 'judgment' ? ['false','true'] : ['A','B','C','D']) {
        const row = doc.createElement('li'), label = doc.createElement('label');
        label.className = type === 'multiple' ? 'el-checkbox' : 'el-radio'; row.append(label); list.append(row);
        const input = doc.createElement('input'); input.type = type === 'multiple' ? 'checkbox' : 'radio'; input.name = 'test-choice'; input.value = key;
        input.checked = drafts[index].includes(key); input.disabled = submitted.has(index); label.append(input);
        if (submitted.has(index)) label.classList.add('is-disabled');
        if (type !== 'judgment') {
          const keyNode = doc.createElement('span'); keyNode.className = type === 'multiple' ? 'checkboxInput' : 'radioInput'; keyNode.textContent = key;
          const text = doc.createElement('span'); text.className = type === 'multiple' ? 'checkboxText' : 'radioText'; text.textContent = '示例选项' + key; label.append(keyNode, text);
        } else label.append(key === 'true' ? '√' : '×');
        input.addEventListener('change', () => {
          drafts[index] = [...list.querySelectorAll('input:checked')].map(node => node.value);
          render(index); // Replace controls as reactive UI frameworks do.
        });
      }
    }
    doc.getElementById('submit').disabled = submitted.has(index);
  }
  entries.forEach((_, index) => {
    const button = doc.createElement('button'); button.textContent = index + 1;
    button.addEventListener('click', () => { visited.push(index + 1); render(index); }); doc.getElementById('nav').append(button);
  });
  doc.getElementById('submit').addEventListener('click', () => { clicks.push(current + 1); submitted.add(current); render(current); doc.getElementById('notice').textContent = '本题已提交'; });
  render(0);
  const controller = new api.Controller(win, { pacing: false, poll: 1, settle: 0, timeout: 250 });
  controller.course = 'engineering'; controller.source = api.ENGINEERING_SOURCE; controller.chapter = chapter; controller.entries = entries;
  return { win, doc, controller, drafts, clicks, visited, render };
}

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
