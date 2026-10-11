
/* SafeSpend optional credit ledger and repayment workflow. */
(function(){
"use strict";
const el=id=>document.getElementById(id);
const round=v=>Math.round((Number(v)||0)*100)/100;
const uid=()=>("cr"+Date.now()+Math.random().toString(36).slice(2,7));
const account=id=>(S.creditAccounts||[]).find(x=>x.id===id);
const fmtDate=(ym,n)=>{const a=ym.split("-").map(Number);return ym+"-"+String(Math.min(new Date(a[0],a[1],0,12).getDate(),Math.max(1,n||1))).padStart(2,"0");};
const dueDate=(a,date)=>{const ym=date.slice(0,7);const statement=fmtDate(ym,a.billDay||10);
 const billMonth=date>statement?addMonth(statement).slice(0,7):ym;
 let due=fmtDate(billMonth,a.dueDay||20);
 if(due<=statement)due=fmtDate(addMonth(statement).slice(0,7),a.dueDay||20);
 if(due<date)due=fmtDate(addMonth(due).slice(0,7),a.dueDay||20);
 return due;
};
function ledger(asOf=td()){
 const paid={},used={},funded={};
 for(const t of S.tx){
  if(!t.date||t.date>asOf)continue;
  if(t.type==="credit_repayment"&&t.creditChargeId){paid[t.creditChargeId]=(paid[t.creditChargeId]||0)+N(t.amount);used[t.creditChargeId]=(used[t.creditChargeId]||0)+N(t.creditReservedUsed);}
  if(t.type==="credit_fund"&&t.creditChargeId)funded[t.creditChargeId]=(funded[t.creditChargeId]||0)+N(t.amount);
 }
 return S.tx.filter(t=>t.creditAccountId&&t.date&&t.date<=asOf
   &&(t.type==="credit_opening"||t.type==="credit_loan"||(t.type==="expense"&&t.creditFundMode)))
  .map(t=>{const remaining=Math.max(0,round(N(t.amount)-(paid[t.id]||0)));
   const mode=t.type==="expense"?t.creditFundMode:"future";
   const reserve0=mode==="reserve"?N(t.amount):N(funded[t.id]);
   const reserve=Math.min(remaining,Math.max(0,round(reserve0-(used[t.id]||0))));
   return {id:t.id,t,account:account(t.creditAccountId),remaining,mode,reserve,
    gap:Math.max(0,round(remaining-reserve)),due:t.creditDueDate||t.date};
  });
}
window.creditLedger=ledger;
window.creditSavingAdjustmentForRange=function(start="",end=""){
 let change=0;
 for(const t of S.tx){
  const d=t.date||"";
  if(!d||d>td()||(start&&d<start)||(end&&d>end))continue;
  if(t.type==="expense"&&t.creditFundMode==="future")change-=N(t.amount);
  if(t.type==="credit_fund")change+=N(t.amount);
  if(t.type==="credit_repayment"&&t.creditMode==="future")change+=Math.max(0,N(t.amount)-N(t.creditReservedUsed));
  if(t.type==="credit_loan")change-=N(t.amount);
 }
 return round(change);
};
const css=document.createElement("style");
css.textContent=[
".creditHead{display:flex;align-items:center;justify-content:space-between;gap:12px}",
".creditSwitch{appearance:none;width:44px;height:26px;flex:none;border:1px solid var(--line);background:#D9DFDA;border-radius:15px;position:relative}",
".creditSwitch:before{content:'';position:absolute;left:3px;top:3px;width:18px;height:18px;background:white;border-radius:50%;box-shadow:0 1px 4px #0002}",
".creditSwitch:checked{background:var(--accent)}.creditSwitch:checked:before{left:21px}",
".creditCompact{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.creditCompact button{padding:8px 11px;font-size:11px}",
".creditItem{padding:10px 0;border-top:1px solid var(--line)}.creditItem:first-child{border-top:0}",
".creditPair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}",
".creditPair>div{padding:10px;border-radius:12px;background:#F6F8F5;color:var(--muted);font-size:11px}",
".creditPair strong{display:block;color:var(--text);font-size:17px;margin-top:5px}",
".creditTip{color:var(--muted);font-size:11px;line-height:1.5;margin-top:5px}",
".creditDanger{color:var(--danger)}"
].join("");
document.head.appendChild(css);
const plan=document.createElement("div");
plan.className="section";plan.id="creditPlanSection";
plan.innerHTML='<div class="sectionTitle">信用与还款</div><div class="card">'
+'<div class="creditHead"><div><div class="name">启用信用与还款</div>'
+'<div class="creditTip">信用卡、花呗与小额借款。关闭时保留债务与还款提醒。</div></div>'
+'<input id="creditEnabled" aria-label="启用信用与还款" type="checkbox" class="creditSwitch"></div>'
+'<div id="creditPlanContent" hidden><div class="creditPair"><div>当前待还<strong id="creditPlanOwed">¥0</strong></div>'
+'<div>已备还款资金<strong id="creditPlanReserve">¥0</strong></div></div>'
+'<div id="creditAccountList"></div><div class="creditCompact">'
+'<button id="creditAddAccount" type="button" class="secondary">新增信用账户</button>'
+'<button id="creditAddLoan" type="button" class="ghost">记录现金借款</button></div></div>'
+'<div id="creditHiddenNotice" class="creditTip" hidden></div></div>';
el("lightPlanSection").before(plan);
const now=document.createElement("div");now.className="section";now.id="creditNowSection";now.style.display="none";
now.innerHTML='<div class="sectionHeader"><div class="sectionTitle">近期还款</div>'
+'<button id="creditManage" type="button" class="sectionToggle">账户管理</button></div>'
+'<div class="card" id="creditNowList"></div>';
el("upcomingBox").closest(".section").before(now);
const spend=document.createElement("div");spend.id="creditSpendSection";spend.style.display="none";
spend.innerHTML='<label>支付渠道</label><select id="creditPayment">'
+'<option value="cash">现有资金支付</option><option value="credit">信用支付</option></select>'
+'<div id="creditSpendExtra" style="display:none;margin-top:8px">'
+'<div><label>信用账户</label><select id="creditSpendAccount"></select></div>'
+'<div style="margin-top:8px"><label>还款资金安排</label><select id="creditSpendMode">'
+'<option value="reserve">现有资金预留</option><option value="future">按未来收入安排</option></select></div>'
+'<div style="margin-top:8px"><label>还款日期</label><input type="date" id="creditSpendDue"></div></div>';
el("refRow").before(spend);
function mountSheet(id,title,body){
 const node=document.createElement("div");node.className="sheet";node.id=id;
 node.innerHTML='<div class="sheetCard"><div class="sheetTitle">'+title+'</div>'+body+'</div>';
 el("toast").before(node);
 node.addEventListener("click",e=>{if(e.target===node)node.classList.remove("show")});
}
const actions=(id,label)=>'<div class="actions"><button class="ghost" type="button" data-credit-close="'+id+'">取消</button>'
+'<button class="primary" type="button" id="'+id+'Submit">'+label+'</button></div>';
mountSheet("creditAccountSheet","信用账户",
 '<input id="creditEditId" type="hidden"><div class="formGrid">'
 +'<div><label>账户名称</label><input id="creditName" placeholder="例如 花呗"></div>'
 +'<div><label>账户类型</label><select id="creditKind"><option value="huabei">花呗</option><option value="card">信用卡</option><option value="other">白条／其他</option><option value="loan">小额借款</option></select></div>'
 +'<div><label>信用额度（选填）</label><input id="creditLimit" type="number" min="0"></div>'
 +'<div><label>每月账单日</label><input id="creditBillDay" type="number" min="1" max="31"></div>'
 +'<div><label>每月还款日</label><input id="creditDueDay" type="number" min="1" max="31"></div>'
 +'<div><label>默认资金安排</label><select id="creditDefaultMode"><option value="reserve">现有资金预留</option><option value="future">未来收入还款</option></select></div>'
 +'<div style="grid-column:1/-1"><label>账户状态</label><select id="creditActive"><option value="yes">启用</option><option value="no">暂停新增消费</option></select></div>'
 +'<div style="grid-column:1/-1" id="creditOpeningFields"><label>已有待还债务（选填）</label><input id="creditOpening" type="number" min="0">'
 +'<label style="margin-top:8px">已有债务还款日期</label><input id="creditOpeningDue" type="date"></div></div>'
 +actions("creditAccountSheet","保存账户"));
mountSheet("creditRepaySheet","记录信用还款",
 '<input id="creditRepayId" type="hidden"><div class="meta" id="creditRepayMeta"></div>'
 +'<div class="formGrid" style="margin-top:12px"><div><label>还款本金</label><input id="creditRepayAmount" type="number" min="0.01" step="0.01"></div>'
 +'<div><label>实际还款日期</label><input id="creditRepayDate" type="date"></div>'
 +'<div style="grid-column:1/-1"><label>资金来源（优先核销原有预留）</label><select id="creditRepaySource">'
 +'<option value="safe">日常支出余额，超额时储蓄补位</option><option value="saving">日常可用储蓄</option></select></div>'
 +'<div style="grid-column:1/-1"><label>利息／手续费</label><input id="creditRepayFee" type="number" min="0" step="0.01" value="0"></div></div>'
 +'<div class="creditTip" id="creditRepayHint"></div>'+actions("creditRepaySheet","确认还款"));
mountSheet("creditFundSheet","安排还款资金",
 '<input id="creditFundId" type="hidden"><div class="meta" id="creditFundMeta"></div>'
 +'<div class="formGrid" style="margin-top:12px"><div><label>本次预留金额</label><input id="creditFundAmount" type="number" min="0.01" step="0.01"></div>'
 +'<div><label>资金来源</label><select id="creditFundSource"><option value="safe">日常支出余额</option><option value="saving">日常可用储蓄</option></select></div></div>'
 +'<div class="creditTip">预留属于资金用途调整，还款时核销预留。</div>'+actions("creditFundSheet","确认预留"));
mountSheet("creditLoanSheet","记录现金借款到账",
 '<div class="formGrid"><div style="grid-column:1/-1"><label>借款账户</label><select id="creditLoanAccount"></select></div>'
 +'<div><label>实际到账本金</label><input id="creditLoanAmount" type="number" min="0.01" step="0.01"></div>'
 +'<div><label>到账日期</label><input id="creditLoanDate" type="date"></div>'
 +'<div style="grid-column:1/-1"><label>约定还款日期</label><input id="creditLoanDue" type="date"></div></div>'
 +'<div class="creditTip">借款属于融资，增加现金与待还负债，单独于实际收入统计。</div>'
 +actions("creditLoanSheet","记录到账"));
document.querySelectorAll("[data-credit-close]").forEach(b=>b.onclick=()=>el(b.dataset.creditClose).classList.remove("show"));
const open=id=>{el(id).classList.add("show");syncDateDisplays()};
const close=id=>el(id).classList.remove("show");
function openAccount(id=""){
 const a=account(id);
 el("creditEditId").value=id;
 el("creditName").value=a?.name||"";
 el("creditKind").value=a?.kind||"huabei";
 el("creditLimit").value=a?.limit||"";
 el("creditBillDay").value=a?.billDay||10;
 el("creditDueDay").value=a?.dueDay||20;
 el("creditDefaultMode").value=a?.defaultMode||"reserve";
 el("creditActive").value=a?.active===false?"no":"yes";
 el("creditOpeningFields").hidden=!!a;
 el("creditOpening").value="";
 el("creditOpeningDue").value=addMonth(td());
 open("creditAccountSheet");
}
el("creditAddAccount").onclick=()=>openAccount();
el("creditAccountSheetSubmit").onclick=()=>{
 const id=el("creditEditId").value,name=el("creditName").value.trim();
 if(!name)return msg("请输入信用账户名称");
 const a={id:id||uid(),name,kind:el("creditKind").value,limit:Math.max(0,round(el("creditLimit").value)),
 billDay:Math.min(31,Math.max(1,Math.floor(N(el("creditBillDay").value)||10))),
 dueDay:Math.min(31,Math.max(1,Math.floor(N(el("creditDueDay").value)||20))),
 defaultMode:el("creditDefaultMode").value,active:el("creditActive").value==="yes"};
 const idx=S.creditAccounts.findIndex(x=>x.id===id);
 if(idx>=0)S.creditAccounts[idx]=a;else S.creditAccounts.push(a);
 if(idx<0&&N(el("creditOpening").value)>0){
  S.tx.push({id:uid(),date:td(),type:"credit_opening",creditAccountId:a.id,
   amount:round(el("creditOpening").value),
   creditDueDate:el("creditOpeningDue").value||dueDate(a,td()),note:"期初已有债务"});
 }
 save();close("creditAccountSheet");render();msg("信用账户已保存");
};
el("creditEnabled").onchange=e=>{S.settings.creditEnabled=!!e.target.checked;save();render();msg(S.settings.creditEnabled?"信用与还款已开启":"信用支付入口已关闭，待还债务继续保留")};
el("creditManage").onclick=()=>activateMainTab("plan",{scrollTop:true});
function row(id){return ledger().find(x=>x.id===id)}
function openRepay(id){
 const r=row(id);if(!r||r.remaining<=.005)return msg("账单已结清");
 el("creditRepayId").value=id;el("creditRepayAmount").value=r.remaining;
 el("creditRepayDate").value=td();el("creditRepayFee").value=0;el("creditRepaySource").value="safe";
 el("creditRepayMeta").textContent=(r.account?.name||"信用账户")+" · 待还 "+M(r.remaining)+" · 到期 "+r.due;
 el("creditRepayHint").textContent="已有预留 "+M(r.reserve)+"，实际偿还时优先核销。";
 open("creditRepaySheet");
}
el("creditRepaySheetSubmit").onclick=()=>{
 const r=row(el("creditRepayId").value);if(!r)return msg("请选择有效账单");
 const amount=round(el("creditRepayAmount").value),fee=round(el("creditRepayFee").value),date=el("creditRepayDate").value;
 if(amount<=0||amount>r.remaining+.005)return msg("本金超出待还范围");
 if(!date||date>td()||date<r.t.date)return msg("实际还款日期有误");
 if(fee<0)return msg("手续费须大于或等于零");
 const datedRow=ledger(date).find(x=>x.id===r.id);
 if(!datedRow||amount>datedRow.remaining+.005)return msg("还款日期对应的待还本金不足");
 const reserved=Math.min(amount,datedRow.reserve),need=round(amount-reserved),source=el("creditRepaySource").value;
 if(source==="saving"&&need+fee>Math.max(0,bal().saving)+.005)return msg("日常可用储蓄不足");
 S.tx.push({id:uid(),date,type:"credit_repayment",amount,fee,
  creditChargeId:r.id,creditAccountId:r.t.creditAccountId,creditMode:r.mode,
  creditReservedUsed:reserved,creditSource:source,note:"信用还款本金"});
 save();close("creditRepaySheet");render();msg("还款成功记录，本金只核销债务");
};
function openFund(id){
 const r=row(id);if(!r||r.mode!=="future"||r.gap<=.005)return;
 el("creditFundId").value=id;el("creditFundAmount").value=r.gap;el("creditFundSource").value="safe";
 el("creditFundMeta").textContent=(r.account?.name||"信用账户")+" · 待安排 "+M(r.gap);
 open("creditFundSheet");
}
el("creditFundSheetSubmit").onclick=()=>{
 const r=row(el("creditFundId").value);if(!r||r.mode!=="future")return msg("请选择待还账单");
 const amount=round(el("creditFundAmount").value),source=el("creditFundSource").value;
 if(amount<=0||amount>r.gap+.005)return msg("预留金额超出待安排范围");
 const available=source==="saving"?Math.max(0,bal().saving):Math.max(0,bal().safe);
 if(amount>available+.005)return msg("可用资金为 "+M(available));
 S.tx.push({id:uid(),date:td(),type:"credit_fund",amount,creditChargeId:r.id,
  creditAccountId:r.t.creditAccountId,creditSource:source});
 save();close("creditFundSheet");render();msg("还款资金已预留");
};
el("creditAddLoan").onclick=()=>{
 const accounts=S.creditAccounts.filter(a=>a.active);
 if(!accounts.length)return msg("请先启用一个信用账户");
 el("creditLoanAccount").innerHTML=accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");
 el("creditLoanAmount").value="";el("creditLoanDate").value=td();el("creditLoanDue").value=addMonth(td());
 open("creditLoanSheet");
};
el("creditLoanSheetSubmit").onclick=()=>{
 const a=account(el("creditLoanAccount").value),amount=round(el("creditLoanAmount").value);
 const date=el("creditLoanDate").value,due=el("creditLoanDue").value;
 if(!a||!a.active||amount<=0)return msg("请填写借款账户与本金");
 if(!date||date>td()||!due||due<date)return msg("请核对到账和还款日期");
 const owed=sm(ledger(),r=>r.t.creditAccountId===a.id?r.remaining:0);
 if(a.limit>0&&owed+amount>a.limit+.005)return msg("借款超过信用额度");
 S.tx.push({id:uid(),date,type:"credit_loan",amount,creditAccountId:a.id,creditDueDate:due,note:"现金借款到账"});
 save();close("creditLoanSheet");render();msg("借款到账与待还债务已登记");
};
function creditSpendUI(){
 const accounts=S.creditAccounts.filter(a=>a.active);
 const show=!!S.settings.creditEnabled&&spendBucket.value==="safe"
   &&spendPaymentMode.value!=="borrow"&&accounts.length>0;
 el("creditSpendSection").style.display=show?"":"none";
 if(!show)el("creditPayment").value="cash";
 const extra=show&&el("creditPayment").value==="credit";
 el("creditSpendExtra").style.display=extra?"":"none";
 if(!extra)return;
 const id=el("creditSpendAccount").value;
 el("creditSpendAccount").innerHTML=accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");
 if(accounts.some(a=>a.id===id))el("creditSpendAccount").value=id;
 if(!el("creditSpendDue").value)chooseAccount();
}
function chooseAccount(){
 const a=account(el("creditSpendAccount").value);if(!a)return;
 el("creditSpendMode").value=a.defaultMode||"reserve";
 el("creditSpendDue").value=dueDate(a,spendDate.value||td());
 syncDateDisplays();
}
const oldOpenSpend=openSpend;
openSpend=function(){oldOpenSpend();el("creditPayment").value="cash";el("creditSpendDue").value="";creditSpendUI()};
const oldRefreshSpend=refreshSpendRefs;
refreshSpendRefs=function(){oldRefreshSpend();creditSpendUI()};
el("creditPayment").onchange=()=>{el("creditSpendDue").value="";creditSpendUI()};
el("creditSpendAccount").onchange=chooseAccount;
spendDate.addEventListener("change",()=>{if(el("creditPayment").value==="credit")chooseAccount()});
spendBucket.addEventListener("change",()=>setTimeout(creditSpendUI,0));
spendPaymentMode.addEventListener("change",()=>setTimeout(creditSpendUI,0));
const oldSaveSpend=saveSpend.onclick;
saveSpend.onclick=e=>{
 if(el("creditSpendSection").style.display==="none"||el("creditPayment").value!=="credit")return oldSaveSpend(e);
 const a=account(el("creditSpendAccount").value),amount=round(spendAmount.value);
 const date=spendDate.value||td(),due=el("creditSpendDue").value;
 if(!a||!a.active||amount<=0)return msg("请选择信用账户并填写金额");
 if(date>td()||!due||due<date)return msg("请核对消费日期和还款日期");
 const owed=sm(ledger(),r=>r.t.creditAccountId===a.id?r.remaining:0);
 if(a.limit>0&&owed+amount>a.limit+.005)return msg("信用额度不足");
 if(el("creditSpendMode").value==="reserve"){
  const available=Math.max(0,dailyLivingAvailableForNewExpense(date))
   +Math.max(0,bal().safe)+Math.max(0,bal().saving);
  if(amount>available+.005)return msg("现有资金可预留 "+M(available)+"，可切换为未来收入还款");
 }
 const id="e"+Date.now()+Math.random().toString(36).slice(2,6);
 let snapshot=null;
 if(typeof plannedExpensePayment!=="undefined"&&plannedExpensePayment?.kind==="personal"){
  const p=S.plannedExpenses.find(x=>x.id===plannedExpensePayment.plannedId);
  if(p){snapshot={...p};p.status="bought";p.handledAt=date;p.expenseId=id;}
 }
 S.tx.push({id,date,type:"expense",bucket:"safe",refId:"",amount,note:spendNote.value.trim(),
  cycleIncomeId:cycleIncomeIdForDate(date),creditAccountId:a.id,
  creditFundMode:el("creditSpendMode").value,creditDueDate:due,
  personalPlannedExpenseId:snapshot?.id||"",personalPlannedExpenseSnapshot:snapshot});
 if(typeof plannedExpensePayment!=="undefined")plannedExpensePayment=null;
 save();close("spendSheet");render();msg("信用消费与待还账单已记录");
};
function renderCredit(){
 const entries=ledger().filter(x=>x.remaining>.005).sort((a,b)=>a.due.localeCompare(b.due));
 const debt=round(sm(entries,r=>r.remaining)),reserve=round(sm(entries,r=>r.reserve));
 const enabled=!!S.settings.creditEnabled;
 el("creditEnabled").checked=enabled;
 el("creditPlanContent").hidden=!enabled;
 el("creditHiddenNotice").hidden=enabled||debt<=.005;
 el("creditHiddenNotice").textContent=debt>.005?"当前待还 "+M(debt)+"，保留还款提醒。":"";
 el("creditPlanOwed").textContent=M(debt);
 el("creditPlanReserve").textContent=M(reserve);
 el("creditAccountList").innerHTML=S.creditAccounts.length
  ?S.creditAccounts.map(a=>{const owed=sm(entries,r=>r.t.creditAccountId===a.id?r.remaining:0);
    return '<div class="item"><div class="row"><div style="min-width:0"><div class="name">'+esc(a.name)+'</div>'
    +'<div class="meta">'+(a.active?"启用中":"暂停新增")+' · '+(a.defaultMode==="future"?"未来收入还款":"现有资金预留")
    +(a.limit>0?" · 可用 "+M(Math.max(0,a.limit-owed)):"")+'</div></div>'
    +'<div style="text-align:right"><div class="amount">'+M(owed)+'</div>'
    +'<button class="ghost" type="button" style="margin-top:6px;padding:5px 9px;font-size:11px" data-credit-edit="'+esc(a.id)+'">修改</button></div></div></div>';
  }).join(""):'<div class="note">添加信用账户后可记录信用支付。</div>';
 el("creditAccountList").querySelectorAll("[data-credit-edit]").forEach(b=>b.onclick=()=>openAccount(b.dataset.creditEdit));
 el("creditNowSection").style.display=enabled||entries.length?"":"none";
 el("creditNowList").innerHTML=entries.length
  ?'<div class="creditPair"><div>待还合计<strong>'+M(debt)+'</strong></div><div>已预留<strong>'+M(reserve)+'</strong></div></div>'
   +entries.map(r=>{const future=r.mode==="future"&&r.gap>.005?upcomingRecurringIncomeEventsUntil(r.due):[];
    return '<div class="creditItem"><div class="row"><div style="min-width:0"><div class="name">'
     +esc(r.account?.name||"信用账户")+(r.t.note?" · "+esc(r.t.note):"")+'</div>'
     +'<div class="meta '+(r.due<td()?"creditDanger":"")+'">'+r.due+(r.due<td()?" 已到期":" 到期")
     +' · 已预留 '+M(r.reserve)+' · 待安排 '+M(r.gap)
     +(future.length?" · "+future.length+" 次计划收入，每次建议 "+M(Math.ceil(r.gap/future.length*100)/100):"")
     +'</div></div><div class="amount">'+M(r.remaining)+'</div></div><div class="creditCompact">'
     +'<button class="secondary" type="button" data-credit-repay="'+esc(r.id)+'">还款</button>'
     +(enabled&&r.mode==="future"&&r.gap>.005?'<button class="ghost" data-credit-fund="'+esc(r.id)+'">预留资金</button>':"")
     +'</div></div>';
   }).join(""):'<div class="note">信用账单已经全部结清。</div>';
 el("creditNowList").querySelectorAll("[data-credit-repay]").forEach(b=>b.onclick=()=>openRepay(b.dataset.creditRepay));
 el("creditNowList").querySelectorAll("[data-credit-fund]").forEach(b=>b.onclick=()=>openFund(b.dataset.creditFund));
 creditSpendUI();
}
const oldRender=render;
render=function(){oldRender();renderCredit()};
const oldTxHtml=txHtml;
txHtml=function(t,del=false,edit=false){
 if(["credit_opening","credit_loan","credit_fund","credit_repayment"].includes(t.type)){
  const label=t.type==="credit_opening"?"已有信用债务":t.type==="credit_loan"?"现金借款到账":t.type==="credit_fund"?"信用还款预留":"偿还信用本金";
  return '<div class="item"><div class="txRow"><div class="txLeft"><div class="name">'+label+' · '+esc(account(t.creditAccountId)?.name||"信用账户")+'</div>'
   +'<div class="meta">'+(t.date||"")+(t.creditDueDate?" · 到期 "+t.creditDueDate:"")
   +(N(t.fee)>0?" · 费用 "+M(t.fee):"")+'</div></div><div class="txRight"><div class="txAmount txMuted">'+M(t.amount)+'</div></div></div></div>';
 }
 const base=oldTxHtml(t,del,edit);
 if(t.type==="expense"&&t.creditAccountId){
  const suffix=' · 信用 '+esc(account(t.creditAccountId)?.name||"账户")
    +' · '+(t.creditFundMode==="future"?"未来收入安排":"已有资金预留")+' · 还款 '+esc(t.creditDueDate||"");
  return base.replace('</div></div><div class="txRight">',suffix+'</div></div><div class="txRight">');
 }
 return base;
};
const oldEditable=transactionEditable;
transactionEditable=function(t){return t?.creditAccountId?false:oldEditable(t)};
const oldRemove=removeTx;
removeTx=function(id){
 const t=S.tx.find(x=>x.id===id);
 if(t&&(t.type==="credit_loan"||t.type==="credit_opening"||(t.type==="expense"&&t.creditAccountId))
    &&S.tx.some(x=>x.creditChargeId===id))return msg("请先撤销关联预留和还款");
 if(t?.type==="credit_fund"&&S.tx.some(x=>x.type==="credit_repayment"
   &&x.creditChargeId===t.creditChargeId&&N(x.creditReservedUsed)>0))return msg("请先撤销这笔债务的还款");
 return oldRemove(id);
};
enhanceDateInputs();
render();
})();
