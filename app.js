// 四个主步骤；第三步包含「用餐安排」和「吃什么」两个画面。
const OPTION_STEPS = 4;
const RESULT_STEP = OPTION_STEPS + 1;
const byId = id => document.getElementById(id);
let currentStep = 1;
let mealChoice = '';
let mealView = 'meal';
let resultMode = 'plan';
const mealKeys = { lunch: 'mealLunch', dinner: 'mealDinner', both: 'mealBoth', none: 'mealNone' };

function toggleTag(tag) {
  const selected = tag.classList.toggle('active');
  tag.setAttribute('aria-pressed', String(selected));
}

['activityWrap', 'foodWrap'].forEach(id => {
  byId(id).addEventListener('click', event => {
    const tag = event.target.closest('.tag-item');
    if (tag) toggleTag(tag);
  });
});

function addCustomTag(inputId, wrapId) {
  const input = byId(inputId);
  const text = input.value.trim();
  if (!text) return;
  const wrap = byId(wrapId);
  const duplicate = [...wrap.querySelectorAll('.tag-item')].find(tag => tag.textContent.trim() === text);
  if (duplicate) {
    duplicate.classList.add('active');
    duplicate.setAttribute('aria-pressed', 'true');
  } else {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'tag-item px-3 py-1.5 rounded-full border border-warm-primary/50 cursor-pointer select-none active';
    tag.dataset.custom = 'true';
    tag.setAttribute('aria-pressed', 'true');
    tag.textContent = text;
    wrap.appendChild(tag);
  }
  input.value = '';
}

for (const [input, wrap, button] of [
  ['activityOther', 'activityWrap', 'activityAddBtn'],
  ['foodOther', 'foodWrap', 'foodAddBtn']
]) {
  byId(button).addEventListener('click', () => addCustomTag(input, wrap));
  byId(input).addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCustomTag(input, wrap);
    }
  });
}

document.querySelectorAll('[data-meal]').forEach(button => {
  button.addEventListener('click', () => {
    mealChoice = button.dataset.meal;
    document.querySelectorAll('[data-meal]').forEach(item => {
      item.setAttribute('aria-pressed', String(item.dataset.meal === mealChoice));
    });
    byId('mealError').classList.add('hidden');
    renderMeal();
  });
});

function renderMeal() {
  byId('mealChoiceView').hidden = mealView !== 'meal';
  byId('foodChoiceView').hidden = mealView !== 'food';
  byId('mealSummary').textContent = mealChoice ? t(mealKeys[mealChoice]) : '';
}

function confirmPlace() {
  const value = byId('meetPlace').value.trim();
  byId('meetPlaceConfirm').classList.toggle('hidden', !value);
  byId('meetPlaceConfirm').querySelector('.meet-value').textContent = value;
}
byId('meetPlaceBtn').addEventListener('click', confirmPlace);
byId('meetPlace').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); confirmPlace(); }
});
byId('meetPlace').addEventListener('input', () => byId('meetPlaceConfirm').classList.add('hidden'));

function selectedTags(id) {
  return [...byId(id).querySelectorAll('.tag-item.active')].map(tag => tag.textContent.trim());
}
function formatTime(value) {
  if (!value) return t('notSet');
  const [day, time] = value.split('T');
  const [, month, date] = day.split('-').map(Number);
  return `${month}/${date} ${time}`;
}
function validTime() {
  const start = byId('timeStart').value;
  const end = byId('timeEnd').value;
  const valid = !(start && end && end < start);
  byId('timeError').classList.toggle('hidden', valid);
  return valid;
}
['timeStart', 'timeEnd'].forEach(id => byId(id).addEventListener('input', () => byId('timeError').classList.add('hidden')));

function generatePlan() {
  if (resultMode === 'skipped') {
    byId('resultBox').value = `${t('brand')}\n${t('skippedPlan')}`;
    return;
  }
  const G = I18N[currentLang].gen;
  const activities = selectedTags('activityWrap');
  const food = selectedTags('foodWrap');
  const inSingapore = document.querySelector('input[name="cityType"]:checked').value === 'singapore';
  const lines = [
    G.title, G.divider,
    G.time + formatTime(byId('timeStart').value) + ' ~ ' + formatTime(byId('timeEnd').value),
    G.travel + t(inSingapore ? 'radioSingapore' : 'radioAbroad'),
    G.meet + (byId('meetPlace').value.trim() || t('meetDefault')),
    '', G.activity, activities.length ? activities.join(G.sep) : t('none'),
    '', G.meal + (mealChoice ? t(mealKeys[mealChoice]) : t('none'))
  ];
  if (mealChoice && mealChoice !== 'none') lines.push('', G.food, food.length ? food.join(G.sep) : t('none'));
  lines.push('', G.divider, G.ending);
  byId('resultBox').value = lines.join('\n');
}

function showStep(step, view = mealView) {
  currentStep = step;
  if (step !== RESULT_STEP) resultMode = 'plan';
  if (step === 3) mealView = view;
  renderMeal();
  document.querySelectorAll('.step').forEach(section => {
    const active = Number(section.dataset.step) === step;
    section.classList.toggle('active', active);
    section.hidden = !active;
  });
  document.querySelectorAll('.progress-dot').forEach(dot => {
    const active = Number(dot.dataset.step) === step;
    dot.classList.toggle('active', active);
    if (active) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
    dot.setAttribute('aria-label', dot.title);
  });
  byId('stepLabel').textContent = step === RESULT_STEP
    ? t(resultMode === 'skipped' ? 'skippedLabel' : 'doneLabel')
    : t('stepOf').replace('{n}', step).replace('{total}', OPTION_STEPS);
  byId('prevBtn').style.display = step === 1 ? 'none' : '';
  byId('prevBtn').textContent = t(step === RESULT_STEP ? 'backEdit' : step === 3 && mealView === 'food' ? 'mealChange' : 'prev');
  byId('nextBtn').style.display = step === RESULT_STEP ? 'none' : '';
  byId('nextBtn').textContent = t(step === OPTION_STEPS ? 'generate' : 'next');
  byId('resultBox').setAttribute('aria-label', t('resultTitle'));
}

byId('nextBtn').addEventListener('click', () => {
  if ((currentStep === 1 || currentStep === OPTION_STEPS) && !validTime()) { showStep(1); return; }
  if (currentStep === 3 && mealView === 'meal') {
    if (!mealChoice) { byId('mealError').classList.remove('hidden'); return; }
    if (mealChoice !== 'none') { showStep(3, 'food'); return; }
  }
  if (currentStep === OPTION_STEPS) {
    // 顶部圆点跳过用餐安排时，先补选用餐，再生成。
    if (!mealChoice) { showStep(3, 'meal'); byId('mealError').classList.remove('hidden'); return; }
    addCustomTag('activityOther', 'activityWrap');
    if (mealChoice !== 'none') addCustomTag('foodOther', 'foodWrap');
    generatePlan();
    showStep(RESULT_STEP);
  } else showStep(currentStep + 1, 'meal');
});

byId('prevBtn').addEventListener('click', () => {
  if (currentStep === RESULT_STEP) { showStep(resultMode === 'skipped' ? 1 : OPTION_STEPS); return; }
  if (currentStep === 3 && mealView === 'food') { showStep(3, 'meal'); return; }
  if (currentStep === 4) { showStep(3, mealChoice && mealChoice !== 'none' ? 'food' : 'meal'); return; }
  showStep(currentStep - 1, 'meal');
});

document.querySelectorAll('.progress-dot').forEach(dot => {
  dot.addEventListener('click', () => showStep(Number(dot.dataset.step), 'meal'));
});

byId('skipWeekBtn').addEventListener('click', () => {
  resultMode = 'skipped';
  generatePlan();
  showStep(RESULT_STEP);
});

byId('copyBtn').addEventListener('click', async () => {
  const box = byId('resultBox');
  try {
    await navigator.clipboard.writeText(box.value);
    alert(t('copySuccess'));
  } catch (error) {
    box.focus();
    box.select();
    try { if (document.execCommand('copy')) alert(t('copyFallback')); } catch (e) {}
  }
});

byId('resetBtn').addEventListener('click', () => {
  document.querySelectorAll('[data-custom]').forEach(tag => tag.remove());
  document.querySelectorAll('.tag-item').forEach(tag => { tag.classList.remove('active'); tag.setAttribute('aria-pressed', 'false'); });
  document.querySelectorAll('[data-meal]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  ['timeStart', 'timeEnd', 'activityOther', 'foodOther', 'meetPlace', 'resultBox'].forEach(id => { byId(id).value = ''; });
  ['timeError', 'mealError', 'meetPlaceConfirm'].forEach(id => byId(id).classList.add('hidden'));
  document.querySelector('input[name="cityType"][value="singapore"]').checked = true;
  mealChoice = '';
  mealView = 'meal';
  showStep(1);
});

window.onLangChange = () => {
  showStep(currentStep);
  if (currentStep === RESULT_STEP) generatePlan();
};
showStep(1);
