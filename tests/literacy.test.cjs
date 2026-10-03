const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../rainclass-autofill.user.js');
const { fixture } = require('./fixtures.cjs');
const bank = api.literacyEntries();
const chapters = [...new Set(bank.map(entry => entry.chapter))];
const vectors = [
  ['B','A','D','A','C','B','D','CD','AD','A'],
  ['ACD','BCDEF','C','BCD','AD','A','ABCD'],
  ['D','B','BCD','ABCE','AB','ABCD','C','AB','A','B','AB','BC','A'],
  ['ABCDE','ABCDE','A','BC','B','A','B','C','C','BD','A'],
  ['A','BCD','A','BD','BC','D','A','BC','CD','AC','AB','A','AB'],
  ['D','ABCD','ABCD','ABCDEF','D','C','ABCDEF'],
  ['BD','B','C','D'],
  ['A','B','D','C'],
  ['ABD','ABEFG','C','A','ABCD'],
  ['B','D','true','D','ABCD','A','false','B','ABC','B','B','ABCD','B','B'],
  ['B','BC','C','C','A'],
  ['ABCD','C','B','D','ABCD','ABCD','A','B','A','ABCD','B','B','B','ABCDE','B','ABCD']
];
function question(entry, reverse = false) {
  const judgment = entry.type === 'judgment';
  const texts = judgment ? ['false','true'] : reverse ? [...entry.expectedOptions].reverse() : entry.expectedOptions;
  const text = judgment ? entry.judgmentStem : entry.raw.slice(0, entry.answers[0].start - 1);
  return { type: judgment ? 'judgment' : entry.expectedType, ordinal: 999, fields: [], text, parts: [text],
    options: texts.map((text, i) => ({ key: judgment ? text : String.fromCharCode(65 + i), text: judgment ? (text === 'true' ? '√' : '×') : text })) };
}
function originalKeys(entry) {
  return entry.type === 'judgment' ? entry.judgmentAnswer : entry.answers.map(answer => String.fromCharCode(65 + entry.expectedOptions.indexOf(answer.text))).join('');
}
function makeFixture({ unmatched = false } = {}) {
  const entries = [bank.find(e => e.recordId === 'week-7:q1-2'), bank.find(e => e.recordId === 'week-9:q1-2'), bank.find(e => e.judgmentAnswer === 'false')];
  const questions = entries.map(e => question(e, true));
  if (unmatched) questions[1].options[0].text += '额外否定条件';
  return fixture({ entries, chapter: '', course: 'literacy', types: questions.map(q => q.type), questions });
}

test('literacy preserves 109 unique records from 110 weekly images without final exam or index renumbering', () => {
  assert.equal(bank.length, 109); assert.equal(chapters.length, 12);
  assert.equal(new Set(bank.map(e => e.recordId)).size, 109);
  assert.equal(new Set(bank.flatMap(e => e.sourceImages)).size, 110);
  assert.deepEqual([...new Set(bank.map(e => e.sectionId))], Array.from({length: 12}, (_, i) => 'week-' + (i + 1)));
  assert.ok(bank.every(e => e.source === api.LITERACY_SOURCE && e.answerEvidence.length));
  assert.equal(bank.filter(e => e.type === 'judgment').length, 2);
  assert.equal(bank.filter(e => e.expectedType === 'single').length, 63);
  assert.equal(bank.filter(e => e.expectedType === 'multiple').length, 44);
  const fresh = api.literacyEntries(); fresh[0].sourceImages.push('changed'); fresh[0].answers[0].text = 'changed';
  assert.equal(api.literacyEntries()[0].sourceImages.length, 1); assert.equal(api.literacyEntries()[0].answers[0].text, '1985.4.1');
});
for (const [i, expected] of vectors.entries()) test('literacy week ' + (i + 1) + ' retains its source answer vector, including repeated lesson numbers', () => {
  const entries = bank.filter(entry => entry.chapter === chapters[i]);
  assert.deepEqual(entries.map(originalKeys), expected);
  for (const entry of entries) assert.equal(api.matchLiteracyQuestion(question(entry), bank, entry.chapter).entry.recordId, entry.recordId);
});

test('all 109 literacy records map to the same option text after question and option reordering', () => {
  for (const entry of [...bank].reverse()) {
    const q = question(entry, true), match = api.matchLiteracyQuestion(q, bank);
    assert.equal(match.status, 'matched', entry.recordId); assert.equal(match.entry.recordId, entry.recordId);
    assert.equal(match.method, 'literacy-text');
    if (entry.type === 'judgment') assert.deepEqual(match.answers, [entry.judgmentAnswer]);
    else assert.deepEqual(match.answers.map(key => q.options.find(option => option.key === key).text).sort(), entry.answers.map(answer => answer.text).sort());
  }
});

test('repeated displayed number one identifies four distinct lessons by text and options', () => {
  const entries = bank.filter(e => e.sectionId === 'week-7');
  assert.deepEqual(entries.map(e => e.sourceIndex), [1,1,1,1]);
  for (const entry of entries) {
    const q = question(entry); q.ordinal = 1;
    const match = api.matchLiteracyQuestion(q, bank, entry.chapter);
    assert.equal(match.entry.recordId, entry.recordId); assert.deepEqual(match.answers.join(''), originalKeys(entry));
  }
});

test('wrong submitted answers in the screenshots are never used as reference answers', () => {
  assert.deepEqual(api.matchLiteracyQuestion(question(bank[0]), bank).answers, ['B']);
  const intro = bank.find(e => e.recordId === 'week-10:q1#1');
  assert.deepEqual(api.matchLiteracyQuestion(question(intro), bank).answers, ['B']);
  assert.equal(intro.referenceAnswerRaw, 'B'); assert.equal(intro.answers[0].text, '信息道德');
});

test('search operators, quoted terms and case-sensitive file names remain distinct options', () => {
  const search = bank.find(e => e.recordId === 'week-4:q1-4');
  assert.deepEqual(api.matchLiteracyQuestion(question(search), bank).answers, ['B','D']);
  const baidu = bank.find(e => e.recordId === 'week-9:q1-3');
  assert.deepEqual(api.matchLiteracyQuestion(question(baidu), bank).answers, ['C']);
  const google = bank.find(e => e.recordId === 'week-9:q1-4');
  assert.deepEqual(api.matchLiteracyQuestion(question(google), bank).answers, ['A']);
  const filename = bank.find(e => e.recordId === 'week-12:q3-4');
  assert.deepEqual(api.matchLiteracyQuestion(question(filename), bank).answers, ['B']);
  assert.deepEqual(api.matchLiteracyQuestion(question(filename, true), bank).answers, ['C']);
  const minusChanged = question(google); minusChanged.options[0].text = minusChanged.options[0].text.replace('-', '+');
  const quoteChanged = question(google); quoteChanged.options[0].text = quoteChanged.options[0].text.replaceAll('"', '');
  const spacesChanged = question(google); spacesChanged.options[0].text = spacesChanged.options[0].text.replace('big data', 'bigdata');
  const caseChanged = question(filename); caseChanged.options[1].text = 'Download_***';
  for (const changed of [minusChanged, quoteChanged, spacesChanged, caseChanged]) assert.equal(api.matchLiteracyQuestion(changed, bank).status, 'unmatched');
});

test('operator or file-name case changes invalidate manual answers in the current-page signature', () => {
  for (const [id, change] of [
    ['week-9:q1-4', text => text.replace('-', '+')],
    ['week-12:q3-4', text => text.replace('download', 'Download')]
  ]) {
    const entry = bank.find(e => e.recordId === id), q = question(entry);
    const f = fixture({entries:[entry], course:'literacy', chapter:'', types:[q.type], questions:[q]});
    const before = f.controller.current(); f.controller.overrides.set(before.signature, ['A']);
    assert.equal(f.controller.resolve(before).manual, true);
    const node = [...f.doc.querySelectorAll('.radioText')].find(node => change(node.textContent) !== node.textContent);
    node.textContent = change(node.textContent);
    const after = f.controller.current(); assert.notEqual(after.signature, before.signature);
    assert.equal(f.controller.resolve(after).status, 'unmatched');
  }
});

test('week five source images remain attached to their correct multiple and single questions', () => {
  const multiple = bank.find(e => e.recordId === 'week-5:q1-2'), single = bank.find(e => e.recordId === 'week-5:q2');
  assert.match(multiple.sourceImages[0], /csdn_120bc11094e5e51184bc16ddab4b1ccd\.png$/);
  assert.match(single.sourceImages[0], /csdn_86c1219279d49ef40d6aa5a7c29c6c4b\.png$/);
  assert.deepEqual(api.matchLiteracyQuestion(question(multiple), bank).answers, ['B','C','D']);
  assert.deepEqual(api.matchLiteracyQuestion(question(single), bank).answers, ['A']);
});

test('changed stems, full option sets, negative terms, type and selected chapter require manual review', () => {
  const q = question(bank[0]);
  const changedStem = structuredClone(q); changedStem.text += '额外否定条件';
  const changedOption = structuredClone(q); changedOption.options[0].text += '额外否定条件';
  const missingOption = structuredClone(q); missingOption.options.pop();
  const wrongType = structuredClone(q); wrongType.type = 'multiple';
  for (const changed of [changedStem, changedOption, missingOption, wrongType]) assert.equal(api.matchLiteracyQuestion(changed, bank).status, 'unmatched');
  assert.equal(api.matchLiteracyQuestion(q, bank, chapters[1]).status, 'unmatched');
  const typo = bank.find(e => e.recordId === 'week-6:q3');
  const corrected = question(typo); corrected.text = corrected.text.replace('本看', '本着');
  assert.equal(api.matchLiteracyQuestion(corrected, bank).status, 'unmatched');
});

test('literacy image questions cannot use the ordinal image fallback and blanks cannot borrow choice keys', () => {
  const q = question(bank[0]); q.ordinal = 1; q.imageDependent = true;
  assert.equal(api.matchLiteracyQuestion(q, bank, chapters[0]).status, 'unmatched');
  q.imageDependent = false; q.options[0].imageDependent = true;
  assert.equal(api.matchLiteracyQuestion(q, bank, chapters[0]).status, 'unmatched');
  assert.equal(api.matchLiteracyQuestion({type:'blank', ordinal:1, parts:['最早公布的',''], fields:[{}]}, bank).status, 'unmatched');
});

function syntheticRecord(overrides = {}) {
  const imageUrl = 'https://yongfei-hu.github.io/xidian-rainclass/images/info-literacy/synthetic.png';
  return { recordId:'week-1:q1', sourceIndex:1, type:'single', stem:'人工构造的完整测试题干是什么',
    options:[{key:'A',text:'测试选项甲'},{key:'B',text:'测试选项乙'}], answers:['B'],
    referenceAnswerRaw:'B', verificationStatus:'verified', sourceImages:[imageUrl], answerEvidence:[{imageUrl,text:'正确答案：B'}], ...overrides };
}
const syntheticSection = questions => [{sectionId:'week-1', chapter:'构造的测试周次', questions}];
test('only verified answers are imported; a candidate cannot fill a missing or unverified answer', () => {
  assert.deepEqual(api.literacyEntries(syntheticSection([syntheticRecord({verificationStatus:'needs_review', answers:['A'], candidateAnswers:['A']})])), []);
  assert.throws(() => api.literacyEntries(syntheticSection([syntheticRecord({answers:null, candidateAnswers:['A']})])), /答案无效/);
  const imported = api.literacyEntries(syntheticSection([syntheticRecord({candidateAnswers:['A']})]));
  assert.deepEqual(api.matchLiteracyQuestion(question(imported[0]), imported).answers, ['B']);
  assert.throws(() => api.literacyEntries([{sectionId:'final-answers-2025', chapter:'期末', questions:[]}]), /仅收录/);
  assert.throws(() => api.literacyEntries([{sectionId:'week-13', chapter:'说明', questions:[]}]), /仅收录/);
});

test('conflicting verified answers and duplicate IDs do not silently pick a result', () => {
  const a = syntheticRecord(), b = syntheticRecord({recordId:'week-1:q1-2', answers:['A'], referenceAnswerRaw:'A'});
  const entries = api.literacyEntries(syntheticSection([a, b]));
  assert.equal(api.matchLiteracyQuestion(question(entries[0]), entries).status, 'ambiguous');
  assert.throws(() => api.literacyEntries(syntheticSection([a, a])), /ID 缺失或重复/);
});

test('seven-option multiple choices and symbolic judgments survive reactive controls and individual submits', async () => {
  const f = makeFixture(); await f.controller.task(() => f.controller.scan());
  assert.deepEqual(f.clicks, []); assert.ok(f.drafts.every(draft => draft.length === 0));
  const report = f.controller.scanReport(); assert.equal(report.matchedCount, 3); assert.equal(report.course, 'literacy');
  assert.deepEqual(report.questions.map(q => q.sourceRecordId), f.controller.entries.map(e => e.recordId));
  assert.deepEqual(report.questions[1].sourceImages, f.controller.entries[1].sourceImages);
  assert.ok(report.questions.every(q => q.method === 'literacy-text'));
  await assert.rejects(f.controller.task(() => f.controller.fillAndSubmit()), /先检查全部/);
  f.render(0); await f.controller.task(() => f.controller.fillCurrent());
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 3);
  assert.deepEqual(f.clicks, [1,2,3]); assert.deepEqual(f.drafts, [['C'],['A','B','C','F','G'],['false']]);
});

test('literacy skips an unmatched option set while preserving its draft and processes the other matches', async () => {
  const f = makeFixture({unmatched:true}); f.drafts[1] = ['B'];
  await f.controller.task(() => f.controller.scan()); assert.deepEqual(f.controller.scanReport().skippedIndices, [2]);
  f.render(0); await f.controller.task(() => f.controller.fillCurrent());
  assert.equal(await f.controller.task(() => f.controller.fillAndSubmit()), 2);
  assert.deepEqual(f.clicks, [1,3]); assert.deepEqual(f.drafts[1], ['B']);
});

test('literacy can continue an interrupted scan without losing record IDs or rewriting earlier answers', async () => {
  const f = makeFixture();
  f.doc.querySelectorAll('#nav button')[2].addEventListener('click', () => { f.controller.stopped = true; }, {once:true});
  await assert.rejects(f.controller.task(() => f.controller.scan()), /已停止/);
  assert.equal(f.controller.resumeStatus().nextIndex, 3); const before = f.controller.lastScan;
  await f.controller.task(() => f.controller.scan({resume:true}));
  assert.equal(f.controller.lastScan, before); assert.equal(before.questions.length, 3); assert.equal(before.resumeCount, 1);
  assert.deepEqual(before.questions.map(q => q.sourceRecordId), f.controller.entries.map(e => e.recordId));
  assert.deepEqual(f.clicks, []); assert.ok(f.drafts.every(draft => draft.length === 0));
});

test('literacy selector loads offline with all weeks, preserves a selected week and links exact preview provenance', async () => {
  const f = fixture(); let requests = 0; f.win.GM_xmlhttpRequest = () => { requests++; };
  api.mount(f.win); const ui = f.doc.getElementById('rainclass-autofill-panel').shadowRoot;
  const select = course => { ui.getElementById('course').value = course; ui.getElementById('course').dispatchEvent(new f.win.Event('change')); };
  select('literacy'); assert.equal(requests, 0); assert.match(ui.getElementById('log').textContent, /已读取 109 条/);
  assert.equal(ui.getElementById('chapter').value, ''); assert.equal(ui.getElementById('chapter').options.length, 13);
  assert.equal(ui.getElementById('sourceImport').hidden, true);
  for (const id of ['engineeringOrderLabel','careerOrderLabel','imageOrderLabel']) assert.equal(ui.getElementById(id).hidden, true);
  assert.match(ui.getElementById('matchMode').textContent, /第1至12周/);
  ui.getElementById('chapter').value = chapters[4]; ui.getElementById('chapter').dispatchEvent(new f.win.Event('change'));
  ui.getElementById('load').click(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(ui.getElementById('chapter').value, chapters[4]);
  ui.getElementById('chapter').value = ''; ui.getElementById('chapter').dispatchEvent(new f.win.Event('change'));
  const q = question(bank[0]); f.doc.querySelector('.problem-body').textContent = q.text;
  const list = f.doc.querySelector('.list-unstyled-radio');
  const last = list.lastElementChild.cloneNode(true); list.append(last);
  [...list.children].forEach((row,i) => { row.querySelector('input').value = q.options[i].key; row.querySelector('.radioInput').textContent = q.options[i].key; row.querySelector('.radioText').textContent = q.options[i].text; });
  ui.getElementById('previewButton').click(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ui.querySelector('#preview input:checked').value, 'B');
  assert.match(ui.getElementById('preview').textContent, /week-1:q1/);
  assert.equal(ui.querySelector('#preview a').href, bank[0].sourceImages[0]);
  assert.equal(ui.querySelector('#preview a').rel, 'noopener noreferrer');
  for (const course of ['research','engineering','career','ai','literacy']) {
    select(course); assert.equal(ui.getElementById('preview').children.length, 0);
    assert.equal(ui.getElementById('submit').disabled, true); assert.equal(ui.getElementById('scanResume').disabled, true);
  }
  assert.equal(requests, 0);
});
