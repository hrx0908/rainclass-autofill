const { JSDOM } = require('jsdom');
const api = require('../rainclass-autofill.user.js');
function fixedParts(entry) {
  return [entry.raw.slice(0, entry.answers[0].start), ...entry.answers.map((answer, i) => entry.raw.slice(answer.end, entry.answers[i + 1]?.start ?? entry.raw.length))];
}

// Synthetic reactive exercise: no account, real exported page or network operations.
function fixture({ entries, chapter = '测试章节', types = ['single','multiple','judgment','blank'], course = 'engineering', optionKeys = ['A','B','C','D'], questions } = {}) {
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
      problem.textContent = questions?.[index]?.text ?? '人工构造的选择题完整测试题干。'; // Identical stems test ordinal signatures by default.
      const list = doc.createElement('ul'); list.className = type === 'multiple' ? 'list-unstyled-checkbox' : 'list-unstyled-radio'; body.append(list);
      for (const key of type === 'judgment' ? ['false','true'] : questions?.[index]?.options.map(option => option.key) ?? optionKeys) {
        const row = doc.createElement('li'), label = doc.createElement('label');
        label.className = type === 'multiple' ? 'el-checkbox' : 'el-radio'; row.append(label); list.append(row);
        const input = doc.createElement('input'); input.type = type === 'multiple' ? 'checkbox' : 'radio'; input.name = 'test-choice'; input.value = key;
        input.checked = drafts[index].includes(key); input.disabled = submitted.has(index); label.append(input);
        if (submitted.has(index)) label.classList.add('is-disabled');
        if (type !== 'judgment') {
          const keyNode = doc.createElement('span'); keyNode.className = type === 'multiple' ? 'checkboxInput' : 'radioInput'; keyNode.textContent = key;
          const text = doc.createElement('span'); text.className = type === 'multiple' ? 'checkboxText' : 'radioText'; text.textContent = questions?.[index]?.options.find(option => option.key === key)?.text ?? '示例选项' + key; label.append(keyNode, text);
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
  controller.course = course; controller.source = course === 'literacy' ? api.LITERACY_SOURCE : course === 'career' ? api.CAREER_SOURCE : api.ENGINEERING_SOURCE; controller.chapter = chapter; controller.entries = entries;
  return { win, doc, controller, drafts, clicks, visited, render };
}

module.exports = { fixture };
