(function projectTransferBootstrap(){
"use strict";
const round=v=>Math.round((Number(v)||0)*100)/100;
const $=id=>document.getElementById(id);
const label=id=>id==="__saving__"?"储蓄":S.projects.find(p=>p.id===id)?.name||"原专项";
const targetName=t=>{
  if(t.toProjectId!=="__saving__")return label(t.toProjectId);
  if(t.savingDestination==="short")return "短期储蓄 · "+shortSavingsAccountLabel(t.shortAccountId);
  if(t.savingDestination==="bank"){
    const name=S.deposits.find(d=>d.id===t.bankDepositId)?.name||"银行存款";
    return "银行 · "+name+(t.bankTransferMode==="increase"?"（追加本金）":"（归入已有本金）");
  }
  return "储蓄余额";
};
const savingTargetValue=t=>t?.savingDestination==="short"?"short:"+t.shortAccountId
  :t?.savingDestination==="bank"?"bank:"+t.bankDepositId:"ordinary";
const targetOptions=()=>'<option value="ordinary">储蓄余额（可调配）</option>'+
  (S.shortAccounts||[]).map(a=>`<option value="short:${esc(a.id)}">短期储蓄 · ${esc(a.name)}</option>`).join("")+
  (S.deposits||[]).filter(d=>N(d.principal)>0).map(d=>
    `<option value="bank:${esc(d.id)}">银行存款 · ${esc(d.name)}</option>`).join("");
const parseTarget=v=>v?.startsWith("short:")?{savingDestination:"short",shortAccountId:v.slice(6),bankDepositId:""}
  :v?.startsWith("bank:")?{savingDestination:"bank",shortAccountId:"",bankDepositId:v.slice(5)}
  :{savingDestination:"ordinary",shortAccountId:"",bankDepositId:""};
const transferRows=pid=>[...S.tx].filter(t=>t.type==="project_transfer"&&(t.fromProjectId===pid||t.toProjectId===pid))
  .sort((a,b)=>String(b.date).localeCompare(String(a.date))||txStamp(b)-txStamp(a));
const modal=document.createElement("div");
modal.className="sheet";
modal.id="projectTransferSheet";
modal.innerHTML=`
  <div class="sheetCard">
    <div class="sheetTitle" id="projectTransferTitle">专项资金调拨</div>
    <input type="hidden" id="projectTransferEditId">
    <div class="formGrid">
      <div><label for="projectTransferFrom">转出专项</label><select id="projectTransferFrom"></select></div>
      <div><label for="projectTransferTo">转入专项或储蓄</label><select id="projectTransferTo"></select></div>
      <div id="projectTransferSavingsRow" style="display:none;grid-column:1/-1">
        <label for="projectTransferSavingsTarget">具体储蓄去向</label><select id="projectTransferSavingsTarget"></select>
      </div>
      <div id="projectTransferBankModeRow" style="display:none;grid-column:1/-1">
        <label for="projectTransferBankMode">银行本金处理</label>
        <select id="projectTransferBankMode">
          <option value="included">归入已记录本金（总额保持原值）</option>
          <option value="increase">追加到现有本金（银行总额增加）</option>
        </select>
        <div class="note">原本金已包含这笔专项资金时选第一项；实际新增存款时选第二项。</div>
      </div>
      <div><label for="projectTransferAmount">调拨金额</label><input id="projectTransferAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0.00"></div>
      <div><label for="projectTransferDate">调拨日期</label><input id="projectTransferDate" type="date"></div>
      <div style="grid-column:1/-1"><label for="projectTransferNote">备注（可选）</label><input id="projectTransferNote" maxlength="80" placeholder="资金用途调整"></div>
    </div>
    <div class="note" id="projectTransferPreview" style="margin-top:12px;line-height:1.8"></div>
    <div class="actions">
      <button type="button" class="secondary" id="projectTransferCancel">取消</button>
      <button type="button" class="primary" id="projectTransferConfirm">确认调拨</button>
    </div>
  </div>`;
document.body.appendChild(modal);
const settle=document.createElement("div");
settle.className="sheet";
settle.id="projectSettlementChoiceSheet";
settle.innerHTML=`
  <div class="sheetCard">
    <div class="sheetTitle">专项结算去向</div>
    <input type="hidden" id="projectSettlementChoiceId">
    <div class="note" id="projectSettlementChoiceHint"></div>
    <div style="margin-top:12px"><label for="projectSettlementDestination">结余资金转到</label>
      <select id="projectSettlementDestination"></select>
    </div>
    <div id="projectSettlementBankModeRow" style="display:none;margin-top:10px">
      <label for="projectSettlementBankMode">银行本金处理</label>
      <select id="projectSettlementBankMode">
        <option value="included">归入已记录本金（保持总额）</option>
        <option value="increase">追加到银行本金（总额增加）</option>
      </select>
    </div>
    <div class="note" style="margin-top:10px">选择保留资金时，专项将继续处于进行中状态，资金可用于后续规划。</div>
    <div class="actions">
      <button type="button" class="secondary" id="projectSettlementCancel">取消</button>
      <button type="button" class="primary" id="projectSettlementConfirm">确认结算</button>
    </div>
  </div>`;
document.body.appendChild(settle);
for(const node of [modal,settle])node.addEventListener("click",e=>{if(e.target===node)node.classList.remove("show")});
$("projectTransferCancel").onclick=()=>closeSheet("projectTransferSheet");
$("projectSettlementCancel").onclick=()=>closeSheet("projectSettlementChoiceSheet");
function optionList(selectedId="",editId=""){
  const edited=S.tx.find(t=>t.id===editId);
  return S.projects.filter(p=>!p.archived||p.id===selectedId||(edited&&(p.id===edited.fromProjectId||p.id===edited.toProjectId)))
    .map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.archived?"（已归档）":""}</option>`).join("");
}
function transferSnapshot(date,editId){
  if(!editId)return accounting(date);
  const before=S.tx;
  S.tx=before.filter(x=>x.id!==editId);
  try{return accounting(date)}finally{S.tx=before}
}
function targetBalance(date,to,options){
  if(to!=="__saving__")return N(accounting(date).projects[to]);
  if(options.savingDestination==="short")return shortAccountBalance(options.shortAccountId,date);
  if(options.savingDestination==="bank"){
    const d=S.deposits.find(x=>x.id===options.bankDepositId);
    return d?bankDepositPrincipalAt(d,date):0;
  }
  return N(accounting(date).saving);
}
function previewTargetBefore(date,editId,to,options){
  const original=S.tx;
  S.tx=original.filter(t=>t.id!==editId);
  try{return targetBalance(date,to,options)}finally{S.tx=original}
}
function simulatedTransferSnapshot(date,editId,fromProjectId,toProjectId,amount,options){
  const before=S.tx;
  const simulated={id:"pt9999999999999preview",type:"project_transfer",
    date,fromProjectId,toProjectId,amount,...options};
  S.tx=[...before.filter(x=>x.id!==editId),simulated];
  try{
    const state=accounting(date);
    return {state,moved:Math.max(0,N(state.effects[simulated.id]?.projectTransfer)),
      targetAfter:targetBalance(date,toProjectId,options)};
  }finally{S.tx=before;}
}
function refreshSavingsTargetRows(){
  const isSavings=$("projectTransferTo").value==="__saving__";
  $("projectTransferSavingsRow").style.display=isSavings?"block":"none";
  const bank=isSavings&&$("projectTransferSavingsTarget").value.startsWith("bank:");
  $("projectTransferBankModeRow").style.display=bank?"block":"none";
}
function refreshPreview(){
  const from=$("projectTransferFrom").value,to=$("projectTransferTo").value;
  const date=$("projectTransferDate").value||td();
  const amount=round($("projectTransferAmount").value);
  const edited=$("projectTransferEditId").value;
  refreshSavingsTargetRows();
  const options=parseTarget($("projectTransferSavingsTarget").value);
  const bankMode=$("projectTransferBankMode").value;
  options.bankTransferMode=options.savingDestination==="bank"?bankMode:"";
  const dest=options.savingDestination==="bank"
    ?S.deposits.find(d=>d.id===options.bankDepositId):null;
  if(!from||!to)return;
  const prior=transferSnapshot(date,edited);
  const available=Math.max(0,round(prior.projects[from]));
  const targetBefore=round(previewTargetBefore(date,edited,to,options));
  const after=simulatedTransferSnapshot(date,edited,from,to,amount,options);
  const afterSource=round(after.state.projects[from]);
  const targetAfter=round(after.targetAfter);
  const targetLabel=to==="__saving__"?(options.savingDestination==="bank"
    ?(dest?.name||"银行存款"):options.savingDestination==="short"
      ?shortSavingsAccountLabel(options.shortAccountId):"储蓄余额"):label(to);
  const offset=to==="__saving__"?0:round(Math.max(0,after.moved-(targetAfter-targetBefore)));
  const planned=projectPlannedTotal(S.projects.find(p=>p.id===from));
  const shortfall=Math.max(0,planned-afterSource);
  $("projectTransferPreview").innerHTML=
    `${esc(label(from))}：${M(available)} → ${M(afterSource)}<br>`+
    `${esc(targetLabel)}：${M(targetBefore)} → ${M(targetAfter)}`+
    (offset>.005?`<br>其中 ${M(offset)} 优先冲抵原专项历史支出垫付`:"")+
    (amount>available+.005?`<br><span style="color:var(--danger)">调拨金额超过该日期可用资金 ${M(available)}</span>`:"")+
    (dest&&date<dest.startDate?`<br><span style="color:var(--danger)">调拨日期须在银行项目开始日 ${dest.startDate} 及以后</span>`:"")+
    (dest&&bankMode==="included"&&amount+bankProjectIncludedPrincipal(dest)-
      (edited?N(S.tx.find(t=>t.id===edited&&t.bankDepositId===dest.id&&t.bankTransferMode!=="increase")?.amount):0)>N(dest.principal)+.005
      ?'<br><span style="color:var(--danger)">归入金额超过银行原本金</span>':"")+
    (shortfall>0?`<br><span style="color:var(--warn)">转出后，当前待支付规划可能存在 ${M(shortfall)} 的资金缺口</span>`:"")+
    `<br>${to==="__saving__"
      ?(options.savingDestination==="bank"&&bankMode==="included"
        ?"归入该银行项目已登记的本金，银行本金总额保持原值。"
        :options.savingDestination==="bank"?"从专项转入该银行项目，新增本金按调拨日期开始计息。"
        :options.savingDestination==="short"?"资金转入指定短期储蓄账户，维持锁定属性。"
        :"转入储蓄余额，成为可调配资金。")
      :"调出金额计入原专项已花；调入资金优先冲抵目标专项历史支出，余款成为可用资金。"}`;
}
window.openProjectTransfer=function(fromId="",editId=""){
  const tx=editId?S.tx.find(t=>t.id===editId&&t.type==="project_transfer"):null;
  if(editId&&!tx)return msg("调拨记录已更新，请重新打开");
  if(tx?.archiveId)return msg("归档结算对应的调拨请从归档记录恢复后修改");
  const current=activeProjects();
  if(current.length<1&&!tx)return msg("请先建立一个进行中的专项");
  const source=tx?.fromProjectId||fromId||current[0]?.id;
  const target=tx?.toProjectId||current.find(p=>p.id!==source)?.id||"__saving__";
  $("projectTransferTitle").textContent=tx?"修改专项调拨":"专项资金调拨";
  $("projectTransferEditId").value=editId;
  $("projectTransferFrom").innerHTML=optionList(source,editId);
  $("projectTransferTo").innerHTML=optionList(target,editId)+`<option value="__saving__">储蓄</option>`;
  $("projectTransferFrom").value=source;
  $("projectTransferTo").value=target;
  $("projectTransferSavingsTarget").innerHTML=targetOptions();
  $("projectTransferSavingsTarget").value=savingTargetValue(tx);
  $("projectTransferBankMode").value=tx?.bankTransferMode==="increase"?"increase":"included";
  $("projectTransferDate").value=tx?.date||td();
  $("projectTransferDate").max=td();
  $("projectTransferAmount").value=tx?.amount||"";
  $("projectTransferNote").value=tx?.note||"";
  enhanceDateInputs();
  syncDateDisplays();
  refreshPreview();
  modal.classList.add("show");
};
for(const id of ["projectTransferFrom","projectTransferTo","projectTransferDate","projectTransferAmount","projectTransferSavingsTarget","projectTransferBankMode"])
  $(id).addEventListener(id==="projectTransferAmount"?"input":"change",refreshPreview);
function savingsTargetsValid(){
  const transfers=S.tx.filter(t=>t.type==="project_transfer"&&t.toProjectId==="__saving__");
  for(const t of transfers){
    if(t.savingDestination==="short"){
      if(!(S.shortAccounts||[]).some(a=>a.id===t.shortAccountId))return false;
    }else if(t.savingDestination==="bank"){
      const d=S.deposits.find(x=>x.id===t.bankDepositId);
      if(!d||t.date<d.startDate)return false;
      if(bankProjectIncludedPrincipal(d)>N(d.principal)+.005)return false;
    }
  }
  return (S.shortAccounts||[]).every(a=>shortLedgerValid(a.id));
}
function allTransfersCovered(){
  const effects=accounting(td()).effects||{};
  return S.tx.filter(t=>t.type==="project_transfer")
    .every(t=>N(effects[t.id]?.projectTransferShortfall)<.005)&&savingsTargetsValid();
}
$("projectTransferConfirm").onclick=()=>{
  const fromProjectId=$("projectTransferFrom").value;
  const toProjectId=$("projectTransferTo").value;
  const date=$("projectTransferDate").value,amount=round($("projectTransferAmount").value);
  const editId=$("projectTransferEditId").value;
  const options=toProjectId==="__saving__"?parseTarget($("projectTransferSavingsTarget").value)
    :{savingDestination:"ordinary",shortAccountId:"",bankDepositId:""};
  options.bankTransferMode=options.savingDestination==="bank"?$("projectTransferBankMode").value:"";
  const original=editId?S.tx.find(t=>t.id===editId):null;
  const validId=id=>S.projects.some(p=>p.id===id);
  if(!validId(fromProjectId)||!(validId(toProjectId)||toProjectId==="__saving__")||fromProjectId===toProjectId)
    return msg("请选择有效的转出专项与转入去向");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>td())return msg("请选择今天或此前的调拨日期");
  if(!Number.isFinite(amount)||amount<=0)return msg("请输入有效的调拨金额");
  if(!original&&[fromProjectId,toProjectId].some(id=>id!=="__saving__"&&S.projects.find(p=>p.id===id)?.archived))
    return msg("归档专项需要先恢复");
  const preview=transferSnapshot(date,editId),available=Math.max(0,N(preview.projects[fromProjectId]));
  if(amount>available+.005)return msg(`该日期可调拨 ${M(available)}，请调整金额`);
  if(options.savingDestination==="bank"){
    const d=S.deposits.find(x=>x.id===options.bankDepositId);
    if(!d||date<d.startDate)return msg("请选择已开始的有效银行存款项目");
  }
  if(options.savingDestination==="short"&&!(S.shortAccounts||[]).some(a=>a.id===options.shortAccountId))
    return msg("请选择有效的短期储蓄账户");
  const planned=projectPlannedTotal(S.projects.find(p=>p.id===fromProjectId));
  const shortfall=Math.max(0,planned-(available-amount));
  if(shortfall>.005&&!confirm(`这笔调拨会使「${label(fromProjectId)}」的待支出规划存在 ${M(shortfall)} 的资金缺口。确定继续吗？`))return;
  const previous=original?{...original}:null;
  const t=original||{id:"pt"+Date.now()+Math.random().toString(36).slice(2,6),type:"project_transfer"};
  Object.assign(t,{type:"project_transfer",fromProjectId,toProjectId,date,amount,...options,
    cycleIncomeId:cycleIncomeIdForDate(date),note:$("projectTransferNote").value.trim()});
  if(original)t.editedAt=Date.now();
  else S.tx.push(t);
  if(!allTransfersCovered()){
    if(previous)Object.assign(original,previous);
    else S.tx=S.tx.filter(x=>x.id!==t.id);
    return msg("此调整会使某笔调拨的当日资金不足，请调整日期或金额");
  }
  save();closeSheet("projectTransferSheet");render();
  msg(original?"资金调拨已修改":"资金调拨已记账，专项已花与可用资金同步更新");
};
const baseFinance=projectFinanceDetailHtml;
projectFinanceDetailHtml=function(p,a){
  const rows=transferRows(p.id);
  const ledger=rows.map(t=>{
    const inbound=t.toProjectId===p.id,partner=inbound?t.fromProjectId:t.toProjectId;
    return `<div class="projectLedgerRow"><div class="projectLedgerInfo">
      <div class="projectLedgerName">${inbound?"从":"转给"} ${esc(inbound?label(partner):targetName(t))}</div>
      <div class="projectLedgerMeta">${t.date} · ${inbound?"计入专项已备":"计入本专项已花"}${t.note?" · "+esc(t.note):""}${t.archiveId?" · 结算归档":""}</div>
    </div><div class="projectLedgerAmount">${inbound?"+":"−"}${M(t.amount)}</div></div>`;
  }).join("");
  const choices=activeProjects().filter(x=>x.id!==p.id);
  const actions=!p.archived?`<button class="projectPlanAdd" type="button" onclick="event.stopPropagation();openProjectTransfer('${p.id}')">资金调拨</button>`:"";
  const transferLedger=`<details class="projectLedger" data-project-transfer-ledger>
    <summary><span>专项资金调拨 · ${rows.length} 笔</span></summary>
    ${ledger||'<div class="note" style="margin-top:8px">暂无专项间调拨记录。</div>'}
  </details>`;
  return baseFinance(p,a).replace('<div class="projectFinanceBox">',`<div class="projectFinanceBox">${actions}`)
    .replace('</div><!--project-transfer-anchor-never-->',"") // keep original markup untouched
    .replace(/(<\/div>)$/,transferLedger+"$1");
};
const baseRender=render;
render=function(){
  baseRender();
  if(typeof projectList==="undefined")return;
  const rows=[...projectList.querySelectorAll(":scope > .item")];
  activeProjects().forEach((p,i)=>{
    if(!rows[i])return;
    const side=rows[i].querySelector(".row > div:last-child");
    if(!side)return;
    const button=document.createElement("button");
    button.className="ghost";
    button.type="button";
    button.textContent="调拨";
    button.style.cssText="padding:4px 8px;font-size:10px;margin-top:6px;margin-right:5px";
    button.onclick=e=>{e.stopPropagation();openProjectTransfer(p.id)};
    side.insertBefore(button,side.querySelector("button"));
  });
};
const beforeTxHtml=txHtml;
txHtml=function(t,del=false,edit=false){
  if(t?.type==="project_transfer"){
    const from=esc(label(t.fromProjectId)),to=esc(targetName(t));
    return `<div class="item"><div class="txRow"><div class="txLeft">
      <div class="name">专项调拨 · ${from} → ${to}</div>
      <div class="meta">${esc(t.date)} · 内部资金调动${t.note?" · "+esc(t.note):""}${t.archiveId?" · 专项结算":""}</div>
      </div><div class="txRight"><div class="txAmount txMuted">→ ${M(t.amount)}</div></div></div></div>`;
  }
  return beforeTxHtml(t,del,edit);
};
const originalEditable=transactionEditable;
transactionEditable=function(t){return t?.type==="project_transfer"?!t.archiveId:originalEditable(t)};
const originalOpenTxEdit=openTxEdit;
openTxEdit=function(id){
  const t=S.tx.find(x=>x.id===id);
  if(t?.type==="project_transfer"){
    if(t.archiveId)return msg("归档产生的资金调拨需先恢复专项");
    return openProjectTransfer(t.fromProjectId,id);
  }
  return originalOpenTxEdit(id);
};
const originalTitle=transactionActionTitle;
transactionActionTitle=function(t){
  if(t?.type==="project_transfer")return `专项调拨 · ${label(t.fromProjectId)} → ${targetName(t)}`;
  return originalTitle(t);
};
const originalSearch=transactionSearchText;
transactionSearchText=function(t){
  if(t?.type==="project_transfer")
    return normalizeHistorySearch(`专项 资金 调拨 转账 内部转移 ${label(t.fromProjectId)} ${targetName(t)} ${t.amount} ${t.note||""} ${t.date}`);
  return originalSearch(t);
};
// Editing other records may reduce an earlier funding source. Preserve already-booked transfers.
const originalSaveTx=saveTxEdit.onclick;
saveTxEdit.onclick=function(e){
  const snapshot=JSON.stringify(S);
  const result=originalSaveTx.call(this,e);
  if(!allTransfersCovered()){
    S=JSON.parse(snapshot);
    save();render();
    msg("修改影响了已登记的专项调拨，请先调整关联调拨记录");
  }
  return result;
};
const originalSaveProject=saveProjectEdit.onclick;
saveProjectEdit.onclick=function(e){
  const snapshot=JSON.stringify(S);
  const result=originalSaveProject.call(this,e);
  if(!allTransfersCovered()){
    S=JSON.parse(snapshot);
    save();render();
    msg("修改初始资金会影响既有专项调拨，原设置已恢复");
  }
  return result;
};
const canRemoveProject=id=>!S.tx.some(t=>t.type==="project_transfer"&&(t.fromProjectId===id||t.toProjectId===id));
const originalQuickDeleteProject=quickDeleteProject;
quickDeleteProject=function(id){
  if(!canRemoveProject(id))return msg("此专项有资金调拨记录，请先处理相关流水");
  return originalQuickDeleteProject(id);
};
const originalDeleteProject=deleteProject.onclick;
deleteProject.onclick=function(e){
  if(!canRemoveProject(editProjectId.value))return msg("此专项有资金调拨记录，请先处理相关流水");
  return originalDeleteProject.call(this,e);
};
const originalRemove=removeTx;
removeTx=function(id){
  const t=S.tx.find(x=>x.id===id);
  if(t?.type==="project_transfer"&&t.archiveId)return removeProjectTimelineTx(id);
  if(S.tx.some(x=>x.type==="project_transfer")){
    const previous=S.tx;
    S.tx=previous.filter(x=>x.id!==id);
    const valid=allTransfersCovered();
    S.tx=previous;
    if(!valid)return msg("这笔记录关联后续专项调拨，请先调整后续调拨资金");
  }
  return originalRemove(id);
};
const originalArchive=archiveProject;
archiveProject=function(id){
  const p=S.projects.find(x=>x.id===id);
  if(!p||p.archived)return;
  if(projectPlannedExpenses(p).length>0)return msg("专项还有待支出规划，请先处理规划");
  if(projectGap(p)>0)return msg("专项还有资金缺口，暂时无法结算");
  if(projectRepayPending(p.id)>0)return msg("专项仍有挪用资金待补回");
  const available=Math.max(0,projectAvail(p));
  $("projectSettlementChoiceId").value=id;
  $("projectSettlementChoiceHint").textContent=`${p.name} 当前结余 ${M(available)}，请选择资金去向。`;
  $("projectSettlementDestination").innerHTML=
    `<option value="saving">储蓄余额（默认）</option>`+
    (S.shortAccounts||[]).map(a=>`<option value="short:${esc(a.id)}">短期储蓄 · ${esc(a.name)}</option>`).join("")+
    (S.deposits||[]).filter(d=>N(d.principal)>0&&(!d.startDate||d.startDate<=td()))
      .map(d=>`<option value="bank:${esc(d.id)}">银行存款 · ${esc(d.name)}</option>`).join("")+
    activeProjects().filter(x=>x.id!==id).map(x=>`<option value="project:${esc(x.id)}">${esc(x.name)}</option>`).join("")+
    `<option value="keep">保留在当前专项（继续进行中）</option>`;
  $("projectSettlementBankMode").value="included";
  $("projectSettlementBankModeRow").style.display="none";
  settle.classList.add("show");
};
$("projectSettlementDestination").addEventListener("change",()=>{
  $("projectSettlementBankModeRow").style.display=
    $("projectSettlementDestination").value.startsWith("bank:")?"block":"none";
});
$("projectSettlementConfirm").onclick=()=>{
  const id=$("projectSettlementChoiceId").value,p=S.projects.find(x=>x.id===id);
  if(!p||p.archived)return msg("专项状态已变更");
  const destination=$("projectSettlementDestination").value;
  if(destination==="keep"){
    closeSheet("projectSettlementChoiceSheet");
    return msg("结余继续保留在当前专项");
  }
  if(projectGap(p)>0||projectRepayPending(id)>0||projectPlannedExpenses(p).length>0)return msg("专项仍有待处理资金或规划");
  if(destination==="saving"){
    closeSheet("projectSettlementChoiceSheet");
    return originalArchive(id);
  }
  if(destination.startsWith("short:")||destination.startsWith("bank:")){
    const options=parseTarget(destination);
    const deposit=options.savingDestination==="bank"
      ?S.deposits.find(d=>d.id===options.bankDepositId):null;
    if(deposit?.startDate>td())return msg("该银行存款尚未开始，请选择其他去向");
    options.bankTransferMode=options.savingDestination==="bank"?$("projectSettlementBankMode").value:"";
    const available=Math.max(0,projectAvail(p)),funded=projectFunded(p),spent=projectSpent(p);
    const archiveId="pa"+Date.now()+Math.random().toString(36).slice(2,6);
    const t={id:"pt"+Date.now()+Math.random().toString(36).slice(2,6),
      date:td(),type:"project_transfer",archiveId,...options,
      cycleIncomeId:currentCycleStats().income?.id||"",
      fromProjectId:p.id,toProjectId:"__saving__",amount:round(available),note:"专项结算结余归储蓄"};
    if(available>0)S.tx.push(t);
    if(!allTransfersCovered()){
      S.tx=S.tx.filter(x=>x.id!==t.id);
      return msg("存款原本金余额或关联储蓄账户不足，请调整去向");
    }
    p.archived=true;p.archivedAt=td();
    S.tx.push({id:archiveId,date:td(),type:"project_archive",projectId:p.id,
      projectName:p.name,funded,spent,available,amount:available,settlementDestination:destination});
    save();closeSheet("projectSettlementChoiceSheet");render();
    msg(`已归档「${p.name}」，结余 ${M(available)} 已归入${targetName(t)}`);
    return;
  }
  const toId=destination.startsWith("project:")?destination.slice(8):"";
  const to=S.projects.find(x=>x.id===toId&&!x.archived);
  if(!to||to.id===p.id)return msg("请选择有效的目标专项");
  const available=Math.max(0,projectAvail(p)),funded=projectFunded(p),spent=projectSpent(p);
  const archiveId="pa"+Date.now()+Math.random().toString(36).slice(2,6);
  if(available>0)S.tx.push({
    id:"pt"+Date.now()+Math.random().toString(36).slice(2,6),
    date:td(),type:"project_transfer",archiveId,
    cycleIncomeId:currentCycleStats().income?.id||"",
    fromProjectId:p.id,toProjectId:to.id,amount:round(available),note:"专项结算结余调拨"
  });
  p.archived=true;p.archivedAt=td();
  S.tx.push({id:archiveId,date:td(),type:"project_archive",projectId:p.id,
    projectName:p.name,funded,spent,available,amount:available,settlementDestination:to.id});
  save();closeSheet("projectSettlementChoiceSheet");render();
  msg(`已归档「${p.name}」，结余 ${M(available)} 已转入「${to.name}」`);
};
const originalRestore=restoreProject;
restoreProject=function(id){
  const a=[...S.tx].filter(t=>t.type==="project_archive"&&t.projectId===id)
    .sort((x,y)=>txStamp(y)-txStamp(x))[0];
  if(a){
    const before=S.tx;
    S.tx=before.filter(x=>!(x.type==="project_transfer"&&x.archiveId===a.id));
    if(!allTransfersCovered()){
      S.tx=before;
      return msg("后续专项调拨使用了这笔结余，请先调整后续资金调拨");
    }
  }
  return originalRestore(id);
};
const originalRemoveProjectTimeline=removeProjectTimelineTx;
removeProjectTimelineTx=function(id){
  const t=S.tx.find(x=>x.id===id);
  const archiveId=t?.type==="project_transfer"&&t.archiveId?t.archiveId
    :t?.type==="project_archive"?t.id:t?.archiveId||"";
  const archive=archiveId&&S.tx.find(x=>x.type==="project_archive"&&x.id===archiveId);
  if(archive){
    const before=S.tx;
    S.tx=before.filter(x=>!(x.type==="project_transfer"&&x.archiveId===archiveId));
    if(!allTransfersCovered()){
      S.tx=before;
      return msg("后续专项调拨仍依赖这笔结余，请先调整后续记录");
    }
    return originalRemoveProjectTimeline(archive.id);
  }
  return originalRemoveProjectTimeline(id);
};
render();
})();
