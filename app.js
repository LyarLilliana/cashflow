
const KEY="safespend_cashflow_v5";
const OLD_KEYS=["safespend_cashflow_v4","safespend_cashflow_v3","laiya_cashflow_pwa_v2"];
const defaults={
  version:5,
  settings:{dailyLiving:0,monthlyGoal:0},
  incomePlans:[],
  bills:[],
  projects:[],
  tx:[]
};
let S=load();

function load(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY));
    if(d)return normalize(d);
    for(const k of OLD_KEYS){
      const old=localStorage.getItem(k);
      if(old){
        const parsed=JSON.parse(old);
        const migrated=normalize(parsed);
        migrated._migrated=true;
        localStorage.setItem(KEY,JSON.stringify(migrated));
        return migrated;
      }
    }
  }catch(e){}
  return JSON.parse(JSON.stringify(defaults));
}
function normalize(d){
  const s={...defaults,...d};
  s.settings={...defaults.settings,...(d.settings||{})};
  if(!s.settings.dailyLiving && d.settings?.dailyFood) s.settings.dailyLiving=Number(d.settings.dailyFood)||0;
  if(!s.settings.monthlyGoal && d.settings?.saveGoal) s.settings.monthlyGoal=Number(d.settings.saveGoal)||0;
  s.incomePlans=Array.isArray(d.incomePlans)?d.incomePlans:[];
  s.bills=Array.isArray(d.bills)?d.bills:[];
  s.projects=Array.isArray(d.projects)?d.projects:[];
  s.tx=Array.isArray(d.tx)?d.tx:[];
  return s;
}
function save(){localStorage.setItem(KEY,JSON.stringify(S))}
function N(v){return Number(v)||0}
function td(){return new Date().toISOString().slice(0,10)}
function D(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=D(s);d.setDate(d.getDate()+Number(n));return d.toISOString().slice(0,10)}
function addMonth(s){const d=D(s);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return d.toISOString().slice(0,10)}
function diffDays(a,b){return Math.max(0,Math.ceil((D(b)-D(a))/86400000))}
function md(s=td()){return s.slice(0,7)}
function M(v){return "¥"+(Math.round(N(v)*100)/100).toLocaleString("zh-CN",{maximumFractionDigits:2})}
function sm(a,f){return a.reduce((x,y)=>x+(f?f(y):N(y)),0)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function msg(t){toast.textContent=t;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),1600)}
function closeSheet(id){document.getElementById(id).classList.remove("show")}
function freqLabel(f){return {weekly:"每周",biweekly:"每两周",monthly:"每月",none:"仅一次"}[f]||f}
function saveRuleLabel(p){return p.saveType==="percent"?`${p.saveValue}%`:`${M(p.saveValue)}`}
function nextAfter(date,freq){
  if(freq==="weekly") return addDays(date,7);
  if(freq==="biweekly") return addDays(date,14);
  if(freq==="monthly") return addMonth(date);
  return "";
}

function projectFunded(p){
  return N(p.initialFund)+sm(S.tx.filter(t=>t.type==="income"),t=>sm((t.alloc?.projects||[]).filter(x=>x.projectId===p.id),x=>x.amount));
}
function projectSpent(p){return sm(S.tx.filter(t=>t.type==="expense"&&t.bucket==="project"&&t.refId===p.id),t=>t.amount)}
function projectGap(p){return Math.max(0,N(p.budget)-projectFunded(p))}

/*
  全联动记账引擎
  1. 每个预算池都允许显示负数，负数代表已经超出原计划。
  2. 当某一笔支出把对应预算池花穿时，超出的部分会自动动用“当时已有”的储蓄余额。
  3. 自动动用储蓄不会把预算池的负数抹掉，因为负数本身就是“超计划”的反馈。
  4. 后续新的收入分配会继续滚入各预算池，所以生活费、自由额度、账单和专项都会持续滚动。
*/
function accounting(){
  const raw={safe:0,living:0,bills:0};
  const projects={};
  S.projects.forEach(p=>projects[p.id]=N(p.initialFund));

  let saving=0;
  let autoSavingUsed=0;
  let manualSavingUsed=0;
  let uncovered=0;
  const effects={};

  const ordered=[...S.tx].sort((a,b)=>(String(a.date)+String(a.id)).localeCompare(String(b.date)+String(b.id)));

  ordered.forEach(t=>{
    if(t.type==="income"){
      raw.safe+=N(t.alloc?.safe);
      raw.living+=N(t.alloc?.living);
      raw.bills+=N(t.alloc?.bills);
      saving+=N(t.alloc?.saving);
      (t.alloc?.projects||[]).forEach(x=>{
        projects[x.projectId]=(projects[x.projectId]||0)+N(x.amount);
      });
      return;
    }

    if(t.type!=="expense") return;

    const amount=N(t.amount);
    if(t.bucket==="saving"){
      const before=saving;
      saving-=amount;
      manualSavingUsed+=amount;
      effects[t.id]={autoDraw:0,manualDraw:amount,uncovered:Math.max(0,amount-Math.max(0,before)),overPlan:0};
      return;
    }

    let before=0;
    if(t.bucket==="project"){
      before=N(projects[t.refId]||0);
    }else if(t.bucket==="safe"||t.bucket==="living"||t.bucket==="bill"){
      const key=t.bucket==="bill"?"bills":t.bucket;
      before=N(raw[key]);
    }

    // This transaction's portion above the remaining planned balance.
    const overPlan=Math.max(0,amount-Math.max(0,before));
    const autoDraw=Math.min(overPlan,Math.max(0,saving));
    const gap=Math.max(0,overPlan-autoDraw);

    saving-=autoDraw;
    autoSavingUsed+=autoDraw;
    uncovered+=gap;

    if(t.bucket==="project"){
      projects[t.refId]=(projects[t.refId]||0)-amount;
    }else if(t.bucket==="safe"||t.bucket==="living"||t.bucket==="bill"){
      const key=t.bucket==="bill"?"bills":t.bucket;
      raw[key]-=amount;
    }

    effects[t.id]={autoDraw,manualDraw:0,uncovered:gap,overPlan};
  });

  return {raw,projects,saving,autoSavingUsed,manualSavingUsed,uncovered,effects};
}
function projectAvail(p){
  return N(accounting().projects[p.id]||0);
}
function bal(){
  const a=accounting();
  return {safe:a.raw.safe,living:a.raw.living,bills:a.raw.bills,saving:a.saving};
}
function activeIncomePlans(){return S.incomePlans.filter(p=>p.nextDate)}
function nextPlannedIncome(excludeId=""){
  const arr=activeIncomePlans().filter(p=>p.id!==excludeId).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
  return arr[0]||null;
}
function planSavings(p,amount){
  if(!p)return 0;
  return p.saveType==="percent"?Math.round(amount*N(p.saveValue))/100:N(p.saveValue);
}
function monthLastDay(y,m){return new Date(y,m,0).getDate()}
function billDueDate(b,y,m){
  const day=Math.min(N(b.dueDay),monthLastDay(y,m));
  return `${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function billPaid(bid,ym){return S.tx.some(t=>t.type==="expense"&&t.bucket==="bill"&&t.refId===bid&&md(t.date)===ym)}
function dueBillsBetween(start,end){
  const s=D(start),e=D(end),months=[];
  let y=s.getFullYear(),m=s.getMonth()+1;
  for(let i=0;i<4;i++){
    months.push([y,m]);
    if(y===e.getFullYear()&&m===e.getMonth()+1)break;
    m++;if(m===13){m=1;y++}
  }
  const rows=[];
  S.bills.forEach(b=>months.forEach(([yy,mm])=>{
    const due=billDueDate(b,yy,mm);
    if(due>=start&&due<=end&&!billPaid(b.id,due.slice(0,7))) rows.push({...b,dueDate:due});
  }));
  return rows;
}
function upcomingIncomeCyclesUntil(dueDate){
  const dates=[];
  S.incomePlans.forEach(p=>{
    if(!p.nextDate)return;
    let d=p.nextDate;
    let guard=0;
    while(d && d<=dueDate && guard<100){
      if(d>=td())dates.push(d);
      d=nextAfter(d,p.freq);
      guard++;
      if(p.freq==="none")break;
    }
  });
  return Math.max(1,dates.length);
}
function recommendedProjectContrib(p){
  const gap=projectGap(p);
  if(gap<=0||!p.dueDate)return 0;
  return Math.ceil(gap/upcomingIncomeCyclesUntil(p.dueDate)*100)/100;
}

function render(){
  renderPlan();
  renderNow();
  renderHistory();
  refreshSpendRefs();
}
function renderPlan(){
  planDailyLiving.value=S.settings.dailyLiving||"";
  planMonthlyGoal.value=S.settings.monthlyGoal||"";
  incomePlanList.innerHTML=S.incomePlans.length?S.incomePlans.map(p=>`
    <div class="item" onclick="editIncomePlan('${p.id}')">
      <div class="row"><div><div class="name">${esc(p.name)}</div>
      <div class="meta">${p.nextDate||"未设日期"} · ${freqLabel(p.freq)} · 储蓄 ${saveRuleLabel(p)} · 点击修改</div></div>
      <div class="amount">${M(p.amount)}</div></div>
    </div>`).join(""):'<div class="note">还没有收入计划。先告诉 App 你什么时候收钱、每次多少钱，以及这笔钱想存多少。</div>';

  billList.innerHTML=S.bills.length?S.bills.map(b=>`
    <div class="item" onclick="editBill('${b.id}')"><div class="row"><div><div class="name">${esc(b.name)}</div>
    <div class="meta">每月 ${b.dueDay} 日 · 点击修改</div></div><div class="amount">${M(b.amount)}</div></div></div>`).join("")
    :'<div class="note">还没有固定账单。</div>';

  projectList.innerHTML=S.projects.length?S.projects.map(p=>{
    const funded=projectFunded(p),spent=projectSpent(p),gap=projectGap(p);
    const pct=Math.min(100,Math.max(0,funded/Math.max(1,N(p.budget))*100));
    return `<div class="item" onclick="editProject('${p.id}')">
      <div class="row"><div><div class="name">${esc(p.name)}</div>
      <div class="meta">预算 ${M(p.budget)} · 已备 ${M(funded)} · 已花 ${M(spent)}${p.dueDate?" · "+p.dueDate:""}</div></div>
      <div class="amount ${gap>0?"warn":"pos"}">${gap>0?"缺 "+M(gap):"已备妥"}</div></div>
      <div class="progress"><span style="width:${pct}%"></span></div></div>`;
  }).join(""):'<div class="note">还没有专项计划。</div>';
}
function renderNow(){
  const a=accounting(),b={safe:a.raw.safe,living:a.raw.living,bills:a.raw.bills,saving:a.saving};
  const projectTotal=sm(S.projects,p=>N(a.projects[p.id]||0));

  safeNow.textContent=M(b.safe);
  livingBal.textContent=M(b.living);
  billBal.textContent=M(b.bills);
  savingBal.textContent=M(b.saving);
  projectBal.textContent=M(projectTotal);

  const paint=(el,v)=>{el.style.color=v<=0?"var(--danger)":"inherit"};
  paint(safeNow,b.safe);
  paint(livingBal,b.living);
  paint(billBal,b.bills);
  paint(projectBal,projectTotal);
  paint(savingBal,b.saving);

  const next=nextPlannedIncome();
  if(next){
    const days=diffDays(td(),next.nextDate);
    whyDays.textContent=`${days} 天`;
    dailyFree.textContent=days>0?M(b.safe/days):M(b.safe);
    dailyFree.style.color=(b.safe<=0)?"var(--danger)":"inherit";
    safeSub.textContent=b.safe<0
      ?`当前自由额度已超计划 ${M(Math.abs(b.safe))}。超出的支出已优先从当时可用的储蓄余额补足。下一笔计划收入是 ${next.name}，预计 ${next.nextDate} 到账 ${M(next.amount)}。`
      :`下一笔计划收入是 ${next.name}，预计 ${next.nextDate} 到账 ${M(next.amount)}。`;
    nextIncomeBox.innerHTML=`<div class="row"><div><div class="name">${esc(next.name)}</div><div class="meta">${next.nextDate} · ${freqLabel(next.freq)} · 计划储蓄 ${saveRuleLabel(next)}</div></div><div class="amount pos">${M(next.amount)}</div></div>`;
  }else{
    whyDays.textContent="—";
    dailyFree.textContent=M(b.safe);
    dailyFree.style.color=(b.safe<=0)?"var(--danger)":"inherit";
    safeSub.textContent=b.safe<0
      ?`当前自由额度已超计划 ${M(Math.abs(b.safe))}。计划页里还没有未来收入日期。`
      :"计划页里还没有未来收入日期。先完善收入计划，再记录现在。";
    nextIncomeBox.innerHTML='<div class="note">暂无未来收入计划。</div>';
  }
  whySafe.textContent=M(b.safe);
  whySafe.style.color=b.safe<=0?"var(--danger)":"inherit";

  const horizon=next?.nextDate||addDays(td(),7);
  const rows=dueBillsBetween(td(),horizon).map(x=>`<div class="item"><div class="row"><div><div class="name">${esc(x.name)}</div><div class="meta">${x.dueDate} 到期</div></div><div class="amount">${M(x.amount)}</div></div></div>`);
  S.projects.forEach(p=>{
    const gap=projectGap(p),rec=recommendedProjectContrib(p),avail=N(a.projects[p.id]||0);
    if(avail<0) rows.push(`<div class="item"><div class="row"><div><div class="name">${esc(p.name)} 已超专项</div><div class="meta">当前专项余额 ${M(avail)}，超出部分会联动储蓄余额</div></div><div class="amount neg">${M(avail)}</div></div></div>`);
    else if(gap>0&&rec>0) rows.push(`<div class="item"><div class="row"><div><div class="name">${esc(p.name)}</div><div class="meta">资金缺口 ${M(gap)} · 建议下次收入预留 ${M(rec)}</div></div><div class="amount warn">${p.dueDate||""}</div></div></div>`);
  });
  if(a.uncovered>0) rows.unshift(`<div class="item"><div class="row"><div><div class="name">现金流仍有缺口</div><div class="meta">现有储蓄已经无法完全覆盖所有超计划支出</div></div><div class="amount neg">${M(a.uncovered)}</div></div></div>`);
  upcomingBox.innerHTML=rows.length?rows.join(""):'<div class="note">暂无近期固定账单或专项缺口。</div>';

  const recent=[...S.tx].sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id)).slice(0,8);
  recentTx.innerHTML=recent.length?recent.map(t=>txHtml(t)).join(""):'<div class="note">还没有流水。</div>';
}
function txHtml(t,del=false){
  if(t.type==="income"){
    const p=S.incomePlans.find(x=>x.id===t.planId);
    return `<div class="item"><div class="row"><div><div class="name">收入${p?" · "+esc(p.name):""}</div><div class="meta">${t.date} · 当时安全可花 ${M(t.alloc?.safe)}</div></div><div><div class="amount pos">+${M(t.amount)}</div>${del?delBtn(t.id):""}</div></div></div>`;
  }
  const map={safe:"自由支出",living:"基础生活",bill:"固定账单",project:"专项支出",saving:"储蓄取用"};
  const ref=t.bucket==="bill"?S.bills.find(x=>x.id===t.refId):S.projects.find(x=>x.id===t.refId);
  const ef=accounting().effects[t.id]||{};
  let linked="";
  if(N(ef.autoDraw)>0) linked+=` · 超计划 ${M(ef.overPlan)}，自动动用储蓄 ${M(ef.autoDraw)}`;
  if(N(ef.uncovered)>0) linked+=` · 尚有缺口 ${M(ef.uncovered)}`;
  return `<div class="item"><div class="row"><div><div class="name">${map[t.bucket]||"支出"}${t.note?" · "+esc(t.note):""}</div><div class="meta">${t.date}${ref?" · "+esc(ref.name):""}${linked}</div></div><div><div class="amount neg">-${M(t.amount)}</div>${del?delBtn(t.id):""}</div></div></div>`;
}
function delBtn(id){return `<button class="ghost" style="padding:4px 7px;font-size:10px;margin-top:5px" onclick="event.stopPropagation();removeTx('${id}')">删除</button>`}
function renderHistory(){
  const m=S.tx.filter(t=>md(t.date)===md());
  const inc=sm(m.filter(t=>t.type==="income"),t=>N(t.amount));
  const sp=sm(m.filter(t=>t.type==="expense"),t=>N(t.amount));
  const gross=sm(m.filter(t=>t.type==="income"),t=>N(t.alloc?.saving));
  const a=accounting();
  const auto=sm(m.filter(t=>t.type==="expense"),t=>N(a.effects[t.id]?.autoDraw));
  const manual=sm(m.filter(t=>t.type==="expense"&&t.bucket==="saving"),t=>N(t.amount));
  const net=gross-auto-manual;
  const rate=inc>0 ? net/inc*100 : 0;

  mIncome.textContent=M(inc);
  mSpend.textContent=M(sp);
  mSaving.textContent=M(net);
  mRate.textContent=(Math.round(rate*10)/10)+"%";
  mGrossSaving.textContent=M(gross);
  mAutoSavingUsed.textContent=M(auto);
  mManualSavingUsed.textContent=M(manual);
  mNetSavingDetail.textContent=M(net);

  const tone=net<=0?"var(--danger)":"var(--accent)";
  mSaving.style.color=tone;
  mNetSavingDetail.style.color=tone;
  mRate.style.color=rate<=0?"var(--danger)":"inherit";
  mAutoSavingUsed.style.color=auto>0?"var(--danger)":"inherit";
  mManualSavingUsed.style.color=manual>0?"var(--danger)":"inherit";

  const mt=[...m].sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id));
  monthTx.innerHTML=mt.length?mt.map(t=>txHtml(t,true)).join(""):'<div class="note">本月还没有流水。</div>';
}

/* PLAN actions */
saveBasePlan.onclick=()=>{
  S.settings.dailyLiving=N(planDailyLiving.value);
  S.settings.monthlyGoal=N(planMonthlyGoal.value);
  save();render();msg("基础计划已保存");
};
incomePlanSaveType.onchange=()=>incomePlanSaveLabel.textContent=incomePlanSaveType.value==="percent"?"每次储蓄比例（%）":"每次储蓄金额";
addIncomePlan.onclick=()=>{
  const name=incomePlanName.value.trim(),amount=N(incomePlanAmount.value),nextDate=incomePlanDate.value,freq=incomePlanFreq.value,saveType=incomePlanSaveType.value,saveValue=N(incomePlanSaveValue.value);
  if(!name||amount<=0||!nextDate)return msg("请填写完整的收入计划");
  if(saveType==="percent"&&(saveValue<0||saveValue>100))return msg("储蓄比例请输入 0 到 100");
  S.incomePlans.push({id:"ip"+Date.now(),name,amount,nextDate,freq,saveType,saveValue});
  incomePlanName.value="";incomePlanAmount.value="";incomePlanDate.value="";incomePlanSaveValue.value="";
  save();render();msg("收入计划已添加");
};
function editIncomePlan(id){
  const p=S.incomePlans.find(x=>x.id===id);if(!p)return;
  editIncomePlanId.value=id;editIncomePlanName.value=p.name;editIncomePlanAmount.value=p.amount;editIncomePlanDate.value=p.nextDate;editIncomePlanFreq.value=p.freq;editIncomePlanSaveType.value=p.saveType;editIncomePlanSaveValue.value=p.saveValue;
  editIncomePlanSheet.classList.add("show");
}
saveIncomePlanEdit.onclick=()=>{
  const p=S.incomePlans.find(x=>x.id===editIncomePlanId.value);if(!p)return;
  p.name=editIncomePlanName.value.trim();p.amount=N(editIncomePlanAmount.value);p.nextDate=editIncomePlanDate.value;p.freq=editIncomePlanFreq.value;p.saveType=editIncomePlanSaveType.value;p.saveValue=N(editIncomePlanSaveValue.value);
  save();closeSheet("editIncomePlanSheet");render();msg("收入计划已修改");
};
deleteIncomePlan.onclick=()=>{
  const id=editIncomePlanId.value;if(!confirm("删除这个收入计划？"))return;
  S.incomePlans=S.incomePlans.filter(x=>x.id!==id);save();closeSheet("editIncomePlanSheet");render();
};

addBill.onclick=()=>{
  const name=billName.value.trim(),amount=N(billAmount.value),dueDay=Math.min(31,Math.max(1,N(billDay.value)||1));
  if(!name||amount<=0)return msg("请填写账单名称和金额");
  S.bills.push({id:"b"+Date.now(),name,amount,dueDay});
  billName.value="";billAmount.value="";billDay.value="";save();render();msg("账单已添加");
};
function editBill(id){
  const b=S.bills.find(x=>x.id===id);if(!b)return;
  editBillId.value=id;editBillName.value=b.name;editBillAmount.value=b.amount;editBillDay.value=b.dueDay;editBillSheet.classList.add("show");
}
saveBillEdit.onclick=()=>{
  const b=S.bills.find(x=>x.id===editBillId.value);if(!b)return;
  b.name=editBillName.value.trim();b.amount=N(editBillAmount.value);b.dueDay=Math.min(31,Math.max(1,N(editBillDay.value)||1));
  save();closeSheet("editBillSheet");render();msg("账单已修改");
};
deleteBill.onclick=()=>{
  const id=editBillId.value;if(!confirm("删除这个账单？"))return;
  S.bills=S.bills.filter(x=>x.id!==id);save();closeSheet("editBillSheet");render();
};

addProject.onclick=()=>{
  const name=projectName.value.trim(),budget=N(projectBudget.value),dueDate=projectDue.value,initialFund=N(projectInitial.value);
  if(!name||budget<=0)return msg("请填写专项名称和预算");
  S.projects.push({id:"p"+Date.now(),name,budget,dueDate,initialFund});
  projectName.value="";projectBudget.value="";projectDue.value="";projectInitial.value=0;save();render();msg("专项已添加");
};
function editProject(id){
  const p=S.projects.find(x=>x.id===id);if(!p)return;
  editProjectId.value=id;editProjectName.value=p.name;editProjectBudget.value=p.budget;editProjectDue.value=p.dueDate||"";editProjectInitial.value=p.initialFund||0;editProjectSheet.classList.add("show");
}
saveProjectEdit.onclick=()=>{
  const p=S.projects.find(x=>x.id===editProjectId.value);if(!p)return;
  p.name=editProjectName.value.trim();p.budget=N(editProjectBudget.value);p.dueDate=editProjectDue.value;p.initialFund=N(editProjectInitial.value);
  save();closeSheet("editProjectSheet");render();msg("专项已修改");
};
deleteProject.onclick=()=>{
  const id=editProjectId.value;if(!confirm("删除这个专项？"))return;
  S.projects=S.projects.filter(x=>x.id!==id);save();closeSheet("editProjectSheet");render();
};

/* Income recording */
function openIncome(){
  incPlan.innerHTML='<option value="">手动收入</option>'+S.incomePlans.map(p=>`<option value="${p.id}">${esc(p.name)} · ${M(p.amount)}</option>`).join("");
  const next=nextPlannedIncome();
  if(next) incPlan.value=next.id;
  syncIncomeFromPlan();
  incomeSheet.classList.add("show");
}
incPlan.onchange=syncIncomeFromPlan;
function syncIncomeFromPlan(){
  const p=S.incomePlans.find(x=>x.id===incPlan.value);
  if(p){
    incAmount.value=p.amount;
    incSaving.value=planSavings(p,p.amount);
    const after=nextAfter(p.nextDate,p.freq);
    const other=nextPlannedIncome(p.id);
    const candidates=[after,other?.nextDate].filter(Boolean).sort();
    incNextDate.value=candidates[0]||"";
  }else{
    incAmount.value="";
    incSaving.value="";
    incNextDate.value=nextPlannedIncome()?.nextDate||"";
  }
  recalcIncome();
}
function projectSuggestionInputs(){
  projectSuggest.innerHTML=S.projects.length?S.projects.map(p=>{
    const gap=projectGap(p),rec=recommendedProjectContrib(p);
    if(gap<=0||rec<=0)return "";
    return `<div class="formGrid" style="margin-top:8px"><div><div class="name">${esc(p.name)}</div><div class="meta">缺 ${M(gap)}</div></div><div><input class="projectContrib" data-id="${p.id}" inputmode="decimal" type="number" value="${rec}" min="0"></div></div>`;
  }).join(""):'<div class="note">暂无需要预留的专项。</div>';
  if(!projectSuggest.textContent.trim())projectSuggest.innerHTML='<div class="note">暂无需要预留的专项。</div>';
  document.querySelectorAll(".projectContrib").forEach(x=>x.addEventListener("input",recalcIncomeSummary));
}
function recalcIncome(){
  const next=incNextDate.value;
  const days=next?diffDays(td(),next):0;
  incLiving.value=days*N(S.settings.dailyLiving);
  const bills=next?dueBillsBetween(td(),next):[];
  incBills.textContent=M(sm(bills,x=>x.amount));
  projectSuggestionInputs();
  recalcIncomeSummary();
}
function recalcIncomeSummary(){
  const amount=N(incAmount.value),saving=N(incSaving.value),living=N(incLiving.value),next=incNextDate.value;
  const bills=next?sm(dueBillsBetween(td(),next),x=>x.amount):0;
  const projects=[...document.querySelectorAll(".projectContrib")].map(x=>({projectId:x.dataset.id,amount:N(x.value)})).filter(x=>x.amount>0);
  const ps=sm(projects,x=>x.amount),safe=amount-saving-living-bills-ps;
  sumIncome.textContent=M(amount);sumSaving.textContent=M(saving);sumLiving.textContent=M(living);sumBills.textContent=M(bills);sumProjects.textContent=M(ps);sumSafe.textContent=M(Math.max(0,safe));
  incomeWarning.textContent=safe<0?`当前计划超过这笔收入 ${M(Math.abs(safe))}。可以调整储蓄、生活预留或专项预留。`:"";
  saveIncome.disabled=safe<0;
}
[incAmount,incSaving,incLiving,incNextDate].forEach(x=>x.addEventListener("input",()=>x===incNextDate?recalcIncome():recalcIncomeSummary()));
saveIncome.onclick=()=>{
  const amount=N(incAmount.value),saving=N(incSaving.value),living=N(incLiving.value),next=incNextDate.value;
  if(amount<=0)return msg("请输入到账金额");
  const bills=next?sm(dueBillsBetween(td(),next),x=>x.amount):0;
  const projects=[...document.querySelectorAll(".projectContrib")].map(x=>({projectId:x.dataset.id,amount:N(x.value)})).filter(x=>x.amount>0);
  const ps=sm(projects,x=>x.amount),safe=amount-saving-living-bills-ps;
  if(safe<0)return msg("分配超过到账金额");
  const planId=incPlan.value;
  S.tx.push({id:"i"+Date.now(),date:td(),type:"income",planId,amount,nextIncomeDate:next,alloc:{saving,living,bills,projects,safe}});
  const p=S.incomePlans.find(x=>x.id===planId);
  if(p){
    if(p.freq==="none") p.nextDate="";
    else{
      let nd=nextAfter(p.nextDate,p.freq);
      while(nd && nd<=td()) nd=nextAfter(nd,p.freq);
      p.nextDate=nd;
    }
  }
  save();closeSheet("incomeSheet");render();msg("收入已分配");
};

/* Spend */
function openSpend(){spendBucket.value="safe";spendAmount.value="";spendNote.value="";refreshSpendRefs();spendSheet.classList.add("show")}
function refreshSpendRefs(){
  const t=spendBucket.value,b=bal();
  if(t==="bill"){
    refRow.style.display="block";refLabel.textContent="选择账单";
    spendRef.innerHTML='<option value="">请选择</option>'+S.bills.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
  }else if(t==="project"){
    refRow.style.display="block";refLabel.textContent="选择专项";
    spendRef.innerHTML='<option value="">请选择</option>'+S.projects.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
  }else refRow.style.display="none";
  spendHint.textContent=t==="safe"?`当前自由额度 ${M(b.safe)}；超出后会自动动用当时可用的储蓄。`:t==="living"?`当前生活费余额 ${M(b.living)}；超出后会自动动用当时可用的储蓄。`:t==="bill"?`当前账单预留 ${M(b.bills)}；超出后会自动动用当时可用的储蓄。`:t==="saving"?`当前储蓄余额 ${M(b.saving)}`:"请选择专项";
}
spendBucket.onchange=refreshSpendRefs;
spendRef.onchange=()=>{
  if(spendBucket.value==="project"){
    const p=S.projects.find(x=>x.id===spendRef.value);
    spendHint.textContent=p?`该专项当前可用 ${M(projectAvail(p))}`:"请选择专项";
  }
};
saveSpend.onclick=()=>{
  const bucket=spendBucket.value,amount=N(spendAmount.value),refId=spendRef.value,note=spendNote.value.trim(),b=bal();
  if(amount<=0)return msg("请输入金额");
  if((bucket==="bill"||bucket==="project")&&!refId)return msg("请选择对应项目");
  if(bucket==="saving"){
    if(b.saving<=0)return msg("当前储蓄余额为 0");
    if(amount>b.saving)return msg("这笔金额超过当前储蓄余额");
  }

  const id="e"+Date.now();
  S.tx.push({id,date:td(),type:"expense",bucket,amount,refId,note});
  save();
  const ef=accounting().effects[id]||{};
  closeSheet("spendSheet");
  render();

  if(N(ef.uncovered)>0){
    msg(`已超计划；储蓄补了 ${M(ef.autoDraw)}，仍有缺口 ${M(ef.uncovered)}`);
  }else if(N(ef.autoDraw)>0){
    msg(`超出计划 ${M(ef.overPlan)}，已自动动用储蓄 ${M(ef.autoDraw)}`);
  }else if(bucket==="saving"){
    msg("已从储蓄扣除，结果同步更新");
  }else{
    msg("已记录，相关余额已同步更新");
  }
};
function removeTx(id){S.tx=S.tx.filter(x=>x.id!==id);save();render()}

/* Export */
function summary(){
  const m=S.tx.filter(t=>md(t.date)===md());
  const inc=sm(m.filter(t=>t.type==="income"),t=>N(t.amount));
  const sp=sm(m.filter(t=>t.type==="expense"),t=>N(t.amount));
  const gross=sm(m.filter(t=>t.type==="income"),t=>N(t.alloc?.saving));
  const a=accounting();
  const auto=sm(m.filter(t=>t.type==="expense"),t=>N(a.effects[t.id]?.autoDraw));
  const manual=sm(m.filter(t=>t.type==="expense"&&t.bucket==="saving"),t=>N(t.amount));
  const net=gross-auto-manual;
  const rate=inc>0 ? net/inc*100 : 0;
  const b={safe:a.raw.safe,living:a.raw.living,bills:a.raw.bills,saving:a.saving};
  const projectTotal=sm(S.projects,p=>N(a.projects[p.id]||0));
  const ips=S.incomePlans.map(p=>`${p.name}：${M(p.amount)}，下次 ${p.nextDate||"无"}，${freqLabel(p.freq)}，储蓄规则 ${saveRuleLabel(p)}`).join("\n");
  return `SafeSpend 月度摘要 ${md()}
每日基础生活标准：${M(S.settings.dailyLiving)}
月度储蓄目标：${M(S.settings.monthlyGoal)}
收入：${M(inc)}
消费：${M(sp)}
本月原始储蓄：${M(gross)}
计划超支自动动用储蓄：${M(auto)}
主动从储蓄取用：${M(manual)}
本月储蓄净增：${M(net)}
本月储蓄率：${(Math.round(rate*10)/10)}%
当前自由额度：${M(b.safe)}
当前生活费余额：${M(b.living)}
当前账单预留：${M(b.bills)}
当前专项余额合计：${M(projectTotal)}
当前储蓄余额：${M(b.saving)}
未被储蓄覆盖的现金流缺口：${M(a.uncovered)}

收入计划：
${ips||"无"}

请帮我评估这一阶段的现金流、计划执行情况、超支对储蓄的影响，以及下一收入周期的安全可支出额度。`;
}
async function shareText(){
  const text=summary();
  if(navigator.share){try{await navigator.share({title:"SafeSpend 月度摘要",text});return}catch(e){}}
  await navigator.clipboard.writeText(text);msg("摘要已复制");
}
shareTop.onclick=shareText;shareSummary.onclick=shareText;copySummary.onclick=async()=>{await navigator.clipboard.writeText(summary());msg("摘要已复制")};
function dl(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
exportJson.onclick=()=>dl(new Blob([JSON.stringify(S,null,2)],{type:"application/json"}),`SafeSpend备份_${td()}.json`);
exportCsv.onclick=()=>{
  const rows=[["日期","类型","来源","金额","备注","关联ID","收入计划ID","安全可花分配","生活分配","账单分配","储蓄分配","专项分配"]];
  S.tx.forEach(t=>rows.push([t.date,t.type,t.bucket||"",t.amount,t.note||"",t.refId||"",t.planId||"",t.alloc?.safe||"",t.alloc?.living||"",t.alloc?.bills||"",t.alloc?.saving||"",JSON.stringify(t.alloc?.projects||[])]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  dl(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),`SafeSpend流水_${td()}.csv`);
};
importFile.onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{S=normalize(JSON.parse(await f.text()));save();render();msg("备份已导入")}catch(err){msg("备份格式有误")}
};
resetAll.onclick=()=>{if(confirm("确认清空全部数据？")){S=JSON.parse(JSON.stringify(defaults));save();render();msg("已清空")}};

/* nav + sheet */
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");document.getElementById(b.dataset.tab).classList.add("active");
});
document.querySelectorAll(".sheet").forEach(s=>s.addEventListener("click",e=>{if(e.target===s)s.classList.remove("show")}));
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
render();
