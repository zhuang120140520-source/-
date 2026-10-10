(() => {
  'use strict';
  const API = (window.WEEKEND_API || '').replace(/\/$/, '');
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = ['房间','时间','活动','美食','共同决定','周末安排'];
  const meals = {lunch:'吃中午饭',dinner:'吃晚饭',none:'这次不一起吃饭'};
  const regions = {local:'本城市',away:'出城游玩'};
  const foodTags = ['火锅','烤肉','日料','寿司','川菜','粤菜','西餐','烧烤','韩餐','小龙虾','海鲜','意面','面馆','奶茶甜品'];
  let room = null, session = null, draft = null, step = 1, busy = false, invitation = '', inviteInfo = null, showInvite = false, pollBusy = false;
  let createDraft = {nickname:'',city:'',name:'这个周末',date:weekendDate()}, joinName = '';
  const memory = new Map();
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return memory.get(key) || null; } }
  function save(key, value) { memory.set(key, value); try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function blank() { return {skip:false,availability:{start:'',end:''},regions:['local'],votes:{},meals:[],foods:[],acceptableFoods:[]}; }
  function nextDay(date,days=1) { return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10); }
  function normalizeDraft(value) {
    const result=structuredClone(value||blank());
    if(!result.availability) {
      const old=(room.slots||[]).find(s=>result.slots?.includes(s.id));
      const day=old?.id.slice(0,10),part=old?.id.slice(11);
      result.availability=old?{start:day+'T'+(part==='morning'?'09:00':part==='afternoon'?'14:00':'19:00'),end:day+'T'+(part==='morning'?'14:00':part==='afternoon'?'19:00':'23:00')}:{start:'',end:''};
    }
    delete result.slots;return result;
  }
  function validateTime() {
    const {start,end}=draft.availability;
    if(!start||!end)throw new Error('请填写开始和结束时间。');
    if(end<=start)throw new Error('结束时间必须晚于开始时间。');
    if(start<room.date+'T00:00'||end>nextDay(room.date,2)+'T00:00')throw new Error('请填写本次出游两天内的空闲时间。');
    if(!draft.regions.length)throw new Error('请选择出行范围。');
  }
  function persist() { if (room && draft) save('weekend-draft-' + room.id, draft); }
  function localDate(date) { return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }
  function weekendDate() { const d=new Date(),day=d.getDay(); d.setDate(d.getDate()+(day===0?-1:(6-day+7)%7)); return localDate(d); }
  function notice(message='') { $('message').textContent=message; $('message').hidden=!message; }
  function link() { return location.origin+location.pathname+'#room='+encodeURIComponent(room.id)+'&invite='+encodeURIComponent(session.invite); }
  async function api(path, data, authenticated=true) {
    const headers={'Content-Type':'application/json'};
    if(authenticated && session) headers.Authorization='Bearer '+session.token;
    let response;
    try { response=await fetch(API+'/api'+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)}); }
    catch { throw new Error('连接暂时失败，请检查网络后重试。'); }
    const value=await response.json().catch(()=>({error:'同步服务暂时没有响应，请稍后重试。'}));
    if(!response.ok) throw new Error(value.error || '操作失败，请重试。');
    return value;
  }
  function accept(value) { room=value; if(room.final&&step>=5) step=6; }
  async function guarded(fn) { if(busy) return; busy=true; notice(); document.querySelectorAll('button').forEach(b=>b.disabled=true); try { await fn(); } catch(e) { notice(e.message); } finally { busy=false; render(); } }
  function buttons(back, next, text='下一步') { return `<div class="actions">${back?`<button class="button secondary" data-step="${back}">上一步</button>`:''}<button class="button" data-action="${next}">${text}</button></div>`; }
  function chips(values, selected, name) { return values.map(([id,label])=>`<label class="choice"><input type="checkbox" data-field="${name}" value="${esc(id)}" ${selected.includes(id)?'checked':''}>${esc(label)}</label>`).join(''); }
  function invitationBox() { return showInvite && session.invite ? `<div class="invite-box"><p class="hint">把下面的链接发给另一位参与者。对方用自己的手机打开即可。</p><input class="text" readonly aria-label="邀请链接" value="${esc(link())}"><p class="hint">请保留当前设备的浏览器记录，便于再次进入自己的选择。</p></div>` : ''; }
  function render() {
    $('roomBar').hidden=!room; $('progress').hidden=!room;
    if(room) {
      $('roomBar').innerHTML=`<div><strong>${esc(room.name)}</strong><small>${esc(room.city)} · ${esc(room.me.nickname)}${room.other?' / '+esc(room.other.nickname):' / 等待另一位加入'}</small></div><button class="small-button secondary" data-action="invite">邀请链接</button>`;
      $('progress').innerHTML=labels.map((name,i)=>`<button data-step="${i+1}" class="${step===i+1?'active':''}" ${i===0||i===5&&!room.final?'disabled':''} ${step===i+1?'aria-current="step"':''}><b>${i+1}</b>${name}</button>`).join('');
    }
    let html='';
    if(!room) html=inviteInfo ? joinPage() : createPage();
    else if(step===2) html=conditionsPage();
    else if(step===3) html=activitiesPage();
    else if(step===4) html=foodPage();
    else if(step===6 && room.final) html=finalPage();
    else { step=5; html=resultPage(); }
    $('screen').innerHTML=html;
  }
  function createPage() {
    return `<span class="eyebrow">01 / 开始这个周末</span><h2>周末去哪里玩？</h2><p class="hint">先建一个两人房间，再把链接发给对方。各自填写，一起决定。</p><form id="createForm"><label class="field"><span>你的称呼</span><input name="nickname" placeholder="怎么称呼你" maxlength="20" required value="${esc(createDraft.nickname)}"></label><label class="field"><span>你们所在的城市</span><input name="city" placeholder="例如：上海、新加坡" maxlength="30" required value="${esc(createDraft.city)}"></label><div class="grid2"><label class="field"><span>安排名称</span><input name="name" maxlength="40" required value="${esc(createDraft.name)}"></label><label class="field"><span>出游第一天</span><input name="date" type="date" required value="${esc(createDraft.date)}"></label></div><button class="button full" type="submit">创建房间，开始选择</button></form><p class="hint">无需注册。每个房间两人，用邀请链接加入。</p>`;
  }
  function joinPage() {
    return `<span class="eyebrow">01 / 一起加入</span><h2>${esc(inviteInfo.name)}</h2><p class="hint">${esc(inviteInfo.city)} · ${esc(inviteInfo.date)} 起两天</p>${inviteInfo.full?'<div class="status-card">房间已有两位参与者。已经加入过的话，请在原设备、原浏览器里打开链接。</div><a class="button secondary" href="./index.html">创建新的房间</a>':`<p>另一位参与者邀请你一起安排周末。</p><form id="joinForm"><label class="field"><span>你的称呼</span><input name="nickname" placeholder="怎么称呼你" maxlength="20" required value="${esc(joinName)}"></label><button class="button full" type="submit">加入并填写我的选择</button></form><p class="hint">提交前，彼此看不到选择。请用自己的设备填写。</p>`}`;
  }
  function conditionsPage() {
    return `<span class="eyebrow">02 / 先看时间</span><h2>你什么时候有空？</h2><p class="hint">填写具体的开始和结束时间，系统会匹配双方重合的部分。时间按 ${esc(room.city)} 的当地时间填写。</p><div class="grid2 time-fields"><label class="field"><span>开始时间</span><input type="datetime-local" data-time="start" min="${esc(room.date)}T00:00" max="${esc(nextDay(room.date))}T23:59" value="${esc(draft.availability.start)}" required></label><label class="field"><span>结束时间</span><input type="datetime-local" data-time="end" min="${esc(room.date)}T00:00" max="${esc(nextDay(room.date,2))}T00:00" value="${esc(draft.availability.end)}" required></label></div><p class="hint">本次安排：${esc(room.date)} 至 ${esc(nextDay(room.date))}。结束时间需要晚于开始时间。</p><button class="quiet" data-action="skip" style="margin-top:10px">这周算了</button><h3>出行范围</h3><div class="option-grid">${chips(Object.entries(regions),draft.regions,'regions')}</div><p class="hint">两个都可以，就都选上。</p>${invitationBox()}${buttons(null,'nextTime')}`;
  }
  function activitiesPage() {
    return `<span class="eyebrow">03 / 玩点什么</span><h2>哪些活动你愿意去？</h2><p class="hint">想玩会优先匹配。任何一方“不想玩”的项目都会排除；没选的项目也不会抽中。</p>${room.activities.map(a=>`<div class="activity"><span class="activity-label"><span class="activity-icon">${esc(a.icon)}</span>${esc(a.label)}</span><div class="vote-group" role="group" aria-label="${esc(a.label)}">${[[2,'想玩'],[1,'可以'],[-1,'不想玩']].map(([v,l])=>`<button class="vote" data-vote="${v}" data-id="${esc(a.id)}" aria-pressed="${draft.votes[a.id]===v}">${l}</button>`).join('')}</div></div>`).join('')}<h3>还有别的想法？</h3><div class="row"><input class="text" id="customActivity" maxlength="30" placeholder="自己加一个活动" aria-label="自定义活动"><button class="small-button secondary" data-action="addActivity">添加</button></div><p class="hint">新活动双方都能看到，各自投票。</p>${buttons(2,'nextActivity')}`;
  }
  function ranking() {
    if(!draft.foods.length) return '<p class="empty">列出最多五种想吃的美食，第一名是你最想吃的。</p>';
    return `<ol class="rank-list">${draft.foods.map((food,i)=>`<li class="rank-item"><strong>${i+1}</strong><span>${esc(food)}</span><button data-food-up="${i}" aria-label="${esc(food)}上移" ${i===0?'disabled':''}>↑</button><button data-food-down="${i}" aria-label="${esc(food)}下移" ${i===draft.foods.length-1?'disabled':''}>↓</button><button data-food-remove="${i}" aria-label="移除${esc(food)}">移除</button></li>`).join('')}</ol>`;
  }
  function foodPage() {
    const eating=!draft.meals.includes('none');
    const fallback=room.match?.conflicts?.some(c=>c.key==='food') || draft.acceptableFoods.length>0;
    return `<span class="eyebrow">04 / 一起吃点什么</span><h2>一起吃中午饭或晚饭吗？</h2><p class="hint">午饭、晚饭都可以的话，就都选上；最终会匹配其中一顿。</p><div class="option-grid">${chips(Object.entries(meals),draft.meals,'meals')}</div>${eating?`<h3>你最想吃的五种美食</h3><p class="hint">最多五项，至少一项。按想吃程度排序，匹配时优先照顾双方靠前的选择。</p>${ranking()}<div class="row"><input class="text" id="foodInput" maxlength="40" aria-label="想吃的美食" placeholder="例如：火锅、日料、意面"><button class="small-button secondary" data-action="addFood" ${draft.foods.length>=5?'disabled':''}>添加</button></div><div class="tag-list">${foodTags.map(f=>`<button class="tag" data-food="${esc(f)}" ${draft.foods.length>=5||draft.foods.includes(f)?'disabled':''}>+ ${esc(f)}</button>`).join('')}</div>${fallback?`<hr class="split-line"><h3>也能接受的美食</h3><p class="hint">两份想吃清单没有重合时，可以再补最多三项。补选不改变你的前五名。</p><div class="tag-list">${draft.acceptableFoods.map((f,i)=>`<button class="tag" data-acceptable-remove="${i}">${esc(f)} ×</button>`).join('')}</div><div class="row"><input class="text" id="acceptableInput" maxlength="40" aria-label="也能接受的美食" placeholder="也能接受什么"><button class="small-button secondary" data-action="addAcceptable" ${draft.acceptableFoods.length>=3?'disabled':''}>补选</button></div><div class="tag-list">${(room.match.foodSuggestions||[]).filter(f=>!draft.foods.includes(f)&&!draft.acceptableFoods.includes(f)).map(f=>`<button class="tag" data-acceptable="${esc(f)}" ${draft.acceptableFoods.length>=3?'disabled':''}>+ ${esc(f)}</button>`).join('')}</div>`:''}`:''}${buttons(3,'submit',room.me.submitted?'更新我的选择':'提交我的选择')}<p class="hint">可以返回修改。提交后才能开始匹配。</p>`;
  }
  function statusPeople() {
    const people=[{nickname:room.me.nickname,submitted:room.me.submitted},room.other];
    return `<div class="status-grid">${people.map(p=>`<div class="status-card ${p?.submitted?'ready':''}"><strong>${p?esc(p.nickname):'另一位参与者'}</strong><small>${p?p.submitted?'已提交':'正在选择':'等待加入'}</small></div>`).join('')}</div>`;
  }
  function editButton() { return '<button class="button secondary full" data-action="edit">修改我的选择</button>'; }
  function resultPage() {
    let content=''; const match=room.match;
    if(match.status==='skipped') content='<div class="status-card"><strong>这周先休息一下。</strong><p class="hint">有人选择了“这周算了”。如果改变主意，可以修改自己的选择。</p></div>'+editButton();
    else if(match.status==='waiting') content=`<h2>等两份选择都准备好</h2><p class="hint">双方提交后，这里会自动更新。</p>${statusPeople()}${invitationBox()}<div class="actions"><button class="button secondary" data-action="invite">发邀请链接</button><button class="button" data-action="edit">${room.me.submitted?'修改我的选择':'继续填写'}</button></div>`;
    else if(match.status==='conflict') content=`<h2>还差一点共同选择</h2><p class="hint">先调整下面这些项，系统就能继续匹配。双方都可以修改自己的答案。</p>${match.conflicts.map(c=>`<div class="status-card"><p>${esc(c.label)}</p><button class="small-button secondary" data-edit-step="${c.step}">调整我的选择</button></div>`).join('')}`;
    else if(match.status==='consent') content=`<h2>有共同可以玩的活动</h2><p>这次没有双方都“想玩”的项目，但有双方都选了“可以”的项目。</p><div class="tag-list">${match.activities.filter(a=>a.score===2).map(a=>`<span class="pill">${esc(a.label)}</span>`).join('')}</div><p class="hint">两人都同意后，再从这些活动里抽签。</p>${room.me.fallback?'<div class="status-card ready">你已同意，等待另一位。</div>':'<button class="button full" data-action="fallback">我同意从这些项目里选</button>'}<div style="margin-top:12px">${editButton()}</div>`;
    else if(room.plan) content=`<h2>这次就这样玩？</h2><p class="hint">这份方案对双方同步。两人都确认后，周末安排才算定下来。</p>${planCard()}<div class="status-grid"><div class="status-card ${room.me.confirmed?'ready':''}"><strong>${esc(room.me.nickname)}</strong><small>${room.me.confirmed?'已确认':'待确认'}</small></div><div class="status-card ${room.other.confirmed?'ready':''}"><strong>${esc(room.other.nickname)}</strong><small>${room.other.confirmed?'已确认':'待确认'}</small></div></div><div class="actions"><button class="button secondary" data-action="reroll" ${room.me.rerollUsed||!room.hasOtherPlan?'disabled':''}>${room.me.rerollUsed?'已用过换签':'换一个'}</button><button class="button" data-action="confirm" ${room.me.confirmed?'disabled':''}>${room.me.confirmed?'等待对方确认':'我确认这个安排'}</button></div><p class="hint">每人可换一次。换签后双方需要重新确认。${!room.hasOtherPlan?'当前没有其他未抽过的同等优先方案。':''}</p>${editButton()}`;
    else content=`<h2>找到你们的共同选择了</h2><p class="hint">优先选择双方更想玩的活动、美食排名合计更高的项目；同等优先的方案随机抽一个。</p><h3>共同活动</h3><div class="tag-list">${match.activities.map(a=>`<span class="pill">${esc(a.label)} · ${esc(a.reason)}</span>`).join('')}</div>${match.foods.length?`<h3>共同美食</h3><div class="tag-list">${match.foods.map(f=>`<span class="pill">${esc(f.label)}</span>`).join('')}</div>`:''}<button class="button full" data-action="draw">帮我们抽一个安排</button><div style="margin-top:12px">${editButton()}</div>`;
    return '<span class="eyebrow">05 / 共同决定</span>'+content;
  }
  function planCard() {
    const p=room.plan;
    return `<div class="plan"><div class="plan-eyebrow">OUR WEEKEND PLAN</div><h3>${esc(p.activity.icon)} ${esc(p.activity.label)}</h3><div class="plan-line"><span>什么时候</span><strong>${esc(p.slot.label)}</strong></div><div class="plan-line"><span>出行范围</span><strong>${esc(regions[p.region])}${p.region==='local'?' · '+esc(room.city):''}</strong></div><div class="plan-line"><span>吃什么</span><strong>${p.meal==='none'?'这次不一起吃饭':esc(meals[p.meal])+' · '+esc(p.food.label)}</strong></div><div class="plan-reason">${esc(p.activity.reason)}${p.food?' · '+esc(p.food.reason):''}</div></div>`;
  }
  function summaryText() { const p=room.plan; return `【${room.name}】\n${room.me.nickname} & ${room.other.nickname}\n时间：${p.slot.label}\n范围：${regions[p.region]}${p.region==='local'?'（'+room.city+'）':''}\n活动：${p.activity.label}\n用餐：${p.meal==='none'?'这次不一起吃饭':meals[p.meal]+' · '+p.food.label}\n双方已确认，具体地点再一起查攻略。`; }
  function keywords() { const p=room.plan; return [room.city+' '+p.activity.label+(p.region==='away'?' 周边游攻略':' 攻略'),...(p.food?[room.city+' '+p.food.label+' 推荐']:[])]; }
  function finalPage() { return `<span class="eyebrow">06 / 周末安排</span><h2>周末安排定好了。</h2><p class="hint">双方都已确认。接下来查攻略，选具体地点就好。</p>${planCard()}<button class="button full" data-action="copyPlan">复制安排，发到微信</button><h3>去小红书查攻略</h3><p class="hint">复制关键词到小红书搜索。出城游玩确定目的地后，把城市名换成目的地。</p>${keywords().map((k,i)=>`<div class="status-card"><p>${esc(k)}</p><button class="small-button secondary" data-keyword="${i}">复制关键词</button><span id="keywordFeedback${i}" class="copy-feedback" role="status" aria-live="polite" hidden></span></div>`).join('')}${editButton()}`; }
  function edit(to=2) { draft=normalizeDraft(room.me.answers&&!room.me.answers.skip?room.me.answers:draft||blank()); persist(); step=to; render(); }
  function foodAdd(value, acceptable=false) { const text=String(value||'').trim(); if(!text) return; const list=acceptable?draft.acceptableFoods:draft.foods,max=acceptable?3:5; if(text.length>40) throw new Error('美食名称最多四十个字。'); if(list.length>=max) throw new Error(acceptable?'最多补选三项。':'想吃清单最多五项。'); if([...draft.foods,...draft.acceptableFoods].some(f=>f.replace(/\s/g,'').toLowerCase()===text.replace(/\s/g,'').toLowerCase())) throw new Error('这项已经在清单里了。'); list.push(text); persist(); }
  async function copy(text, message) {
    try { await navigator.clipboard.writeText(text); notice(message); return true; }
    catch {
      const box=document.createElement('textarea');box.value=text;box.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(box);box.select();
      let copied=false;try { copied=document.execCommand('copy'); } catch {} box.remove();
      if(copied) { notice(message);return true; }
      showInvite=true;notice('浏览器没有开放复制权限，请长按或选中下方文字复制。');render();
      const manual=document.createElement('textarea');manual.className='text summary-box';manual.readOnly=true;manual.value=text;manual.setAttribute('aria-label','可手动复制的内容');$('screen').append(manual);manual.select();return false;
    }
  }
  async function action(name) {
    if(name==='invite') { showInvite=true; render(); if(step!==2&&step!==5) { notice('邀请链接已准备好。'); } await copy(link(),'邀请链接已复制，发给另一位参与者即可。'); return; }
    if(name==='edit') { edit(); return; }
    if(name==='nextTime') { validateTime(); step=3; persist(); return; }
    if(name==='nextActivity') { if(!Object.values(draft.votes).some(v=>v>0)) throw new Error('至少选择一项想玩或可以玩的活动。'); step=4; persist(); return; }
    if(name==='addFood'||name==='addAcceptable') { const id=name==='addFood'?'foodInput':'acceptableInput'; foodAdd($(id).value,name==='addAcceptable'); return; }
    if(name==='addActivity') { const label=$('customActivity').value.trim(); if(!label) throw new Error('先写下活动名称。'); accept(await api('/rooms/'+room.id+'/activities',{label})); const found=room.activities.find(a=>a.label===label); if(found) draft.votes[found.id]=2; persist(); return; }
    if(name==='skip') { accept(await api('/rooms/'+room.id+'/answers',{skip:true})); step=5; return; }
    if(name==='submit') { if($('foodInput')?.value.trim()) foodAdd($('foodInput').value); if($('acceptableInput')?.value.trim()) foodAdd($('acceptableInput').value,true); draft.skip=false; accept(await api('/rooms/'+room.id+'/answers',draft)); persist(); step=5; return; }
    if(name==='copyPlan') { await copy(summaryText(),'安排已复制，可以发到微信。'); return; }
    if(['draw','fallback','reroll','confirm'].includes(name)) { accept(await api('/rooms/'+room.id+'/'+name,['reroll','confirm'].includes(name)?{planVersion:room.plan.version}:{})); }
  }
  document.addEventListener('input',e=>{ if(e.target.form?.id==='createForm') createDraft[e.target.name]=e.target.value; if(e.target.form?.id==='joinForm') joinName=e.target.value; if(e.target.dataset.time&&draft) { draft.availability[e.target.dataset.time]=e.target.value;persist(); } });
  document.addEventListener('change',e=>{
    const field=e.target.dataset.field; if(!field||!draft) return;
    const value=e.target.value,checked=e.target.checked;
    if(field==='meals'&&checked&&value==='none') draft.meals=['none'];
    else { if(field==='meals'&&checked) draft.meals=draft.meals.filter(x=>x!=='none'); draft[field]=checked?[...new Set([...draft[field],value])]:draft[field].filter(x=>x!==value); }
    persist(); if(field==='meals') render();
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b||b.disabled||busy) return;
    if(b.dataset.step) { step=Number(b.dataset.step); render(); return; }
    if(b.dataset.editStep) { edit(Number(b.dataset.editStep)); return; }
    if(b.dataset.vote) { const v=Number(b.dataset.vote),id=b.dataset.id; if(draft.votes[id]===v) delete draft.votes[id]; else draft.votes[id]=v; persist(); render(); return; }
    for(const key of ['foodUp','foodDown','foodRemove','acceptableRemove']) if(b.dataset[key]!==undefined) { const i=Number(b.dataset[key]); if(key==='foodRemove') draft.foods.splice(i,1); else if(key==='acceptableRemove') draft.acceptableFoods.splice(i,1); else { const j=i+(key==='foodUp'?-1:1); [draft.foods[i],draft.foods[j]]=[draft.foods[j],draft.foods[i]]; } persist(); render(); return; }
    if(b.dataset.food||b.dataset.acceptable) { try { foodAdd(b.dataset.food||b.dataset.acceptable,!!b.dataset.acceptable); notice(); } catch(error) { notice(error.message); } render(); return; }
    if(b.dataset.keyword!==undefined) {
      const index=Number(b.dataset.keyword);b.disabled=true;b.textContent='正在复制…';
      copy(keywords()[index],'已成功复制').then(ok=>{ b.textContent='复制关键词';if(ok) { const feedback=$('keywordFeedback'+index);if(feedback){feedback.textContent='已成功复制';feedback.hidden=false;} } }).finally(()=>{b.disabled=false;});return;
    }
    if(b.dataset.action) { if(['invite','copyPlan'].includes(b.dataset.action)) action(b.dataset.action).catch(e=>notice(e.message)); else guarded(()=>action(b.dataset.action)); }
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Enter'&&['foodInput','acceptableInput','customActivity'].includes(e.target.id)) { e.preventDefault(); const name={foodInput:'addFood',acceptableInput:'addAcceptable',customActivity:'addActivity'}[e.target.id]; guarded(()=>action(name)); } });
  document.addEventListener('submit',e=>{
    if(!['createForm','joinForm'].includes(e.target.id)) return; e.preventDefault();
    const form=new FormData(e.target),creating=e.target.id==='createForm';
    guarded(async()=>{
      const value=creating?await api('/rooms',Object.fromEntries(form),false):await api('/rooms/'+inviteInfo.id+'/join',{nickname:form.get('nickname'),invite:invitation},false);
      room=value.room; session={token:value.token,invite:creating?value.invite:invitation}; save('weekend-room-'+room.id,session); draft=blank(); persist(); step=2; showInvite=creating; history.replaceState(null,'','#room='+room.id);
    });
  });
  async function refresh() { if(!room||busy||pollBusy) return; pollBusy=true; try { const value=await api('/rooms/'+room.id); const changed=value.version!==room.version; accept(value); if($('message').textContent==='连接暂时失败，请检查网络后重试。')notice(); if(changed&&step>=5) render(); } catch(e) { if(step>=5) notice(e.message); } finally { pollBusy=false; } }
  async function init() {
    $('screen').innerHTML='<p class="loading">正在准备周末安排…</p>';
    try { const params=new URLSearchParams(location.hash.slice(1)),roomId=params.get('room'); invitation=params.get('invite')||'';
      if(roomId) { session=read('weekend-room-'+roomId); if(session?.token) { accept(await api('/rooms/'+roomId)); draft=normalizeDraft(read('weekend-draft-'+roomId)||room.me.answers&&!room.me.answers.skip&&room.me.answers||blank()); step=room.final?6:room.me.submitted?5:2; }
        else if(invitation) inviteInfo=await api('/rooms/'+roomId+'/invite',{invite:invitation},false);
        else notice('这个设备还没有加入房间。请用带邀请信息的完整链接，或回到原设备打开。');
      }
    } catch(e) { notice(e.message); }
    render(); setInterval(refresh,4000);
  }
  window.addEventListener('hashchange',()=>location.reload());
  init();
})();
