(function projectTransferBootstrap(){
"use strict";
const round=v=>Math.round((Number(v)||0)*100)/100;
const $=id=>document.getElementById(id);
const label=id=>S.projects.find(p=>p.id===id)?.name||"原专项";
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
      <div><label for="projectTransferTo">转入专项</label><select id="projectTransferTo"></select></div>
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
function refreshPreview(){
  const from=$("projectTransferFrom").value,to=$("projectTransferTo").value;
  const date=$("projectTransferDate").value||td();
  const amount=round($("projectTransferAmount").value);
  const edited=$("projectTransferEditId").value;
  if(!from||!to)return;
  const prior=transferSnapshot(date,edited);
  const available=Math.max(0,round(prior.projects[from]));
  const targetBefore=round(prior.projects[to]);
  const afterSource=Math.max(0,available-amount);
  const planned=projectPlannedTotal(S.projects.find(p=>p.id===from));
  const shortfall=Math.max(0,planned-afterSource);
  $("projectTransferPreview").innerHTML=
    `${esc(label(from))}：${M(available)} → ${M(afterSource)}<br>`+
    `${esc(label(to))}：${M(targetBefore)} → ${M(targetBefore+amount)}`+
    (amount>available+.005?`<br><span style="color:var(--danger)">调拨金额超过该日期可用资金 ${M(available)}</span>`:"")+
    (shortfall>0?`<br><span style="color:var(--warn)">转出后，当前待支付规划可能存在 ${M(shortfall)} 的资金缺口</span>`:"")+
    `<br>专项资金总额保持一致，实际消费与本周期预计可存保持原有结果。`;
}
window.openProjectTransfer=function(fromId="",editId=""){
  const tx=editId?S.tx.find(t=>t.id===editId&&t.type==="project_transfer"):null;
  if(editId&&!tx)return msg("调拨记录已更新，请重新打开");
  if(tx?.archiveId)return msg("归档结算对应的调拨请从归档记录恢复后修改");
  const current=activeProjects();
  if(current.length<2&&!tx)return msg("至少建立两个进行中的专项才能调拨资金");
  const source=tx?.fromProjectId||fromId||current[0]?.id;
  const target=tx?.toProjectId||current.find(p=>p.id!==source)?.id||"";
  $("projectTransferTitle").textContent=tx?"修改专项调拨":"专项资金调拨";
  $("projectTransferEditId").value=editId;
  $("projectTransferFrom").innerHTML=optionList(source,editId);
  $("projectTransferTo").innerHTML=optionList(target,editId);
  $("projectTransferFrom").value=source;
  $("projectTransferTo").value=target;
  $("projectTransferDate").value=tx?.date||td();
  $("projectTransferDate").max=td();
  $("projectTransferAmount").value=tx?.amount||"";
  $("projectTransferNote").value=tx?.note||"";
  enhanceDateInputs();
  syncDateDisplays();
  refreshPreview();
  modal.classList.add("show");
};
for(const id of ["projectTransferFrom","projectTransferTo","projectTransferDate","projectTransferAmount"])
  $(id).addEventListener(id==="projectTransferAmount"?"input":"change",refreshPreview);
function allTransfersCovered(){
  const effects=accounting(td()).effects||{};
  return S.tx.filter(t=>t.type==="project_transfer")
    .every(t=>N(effects[t.id]?.projectTransferShortfall)<.005);
}
$("projectTransferConfirm").onclick=()=>{
  const fromProjectId=$("projectTransferFrom").value;
  const toProjectId=$("projectTransferTo").value;
  const date=$("projectTransferDate").value,amount=round($("projectTransferAmount").value);
  const editId=$("projectTransferEditId").value;
  const original=editId?S.tx.find(t=>t.id===editId):null;
  const validId=id=>S.projects.some(p=>p.id===id);
  if(!validId(fromProjectId)||!validId(toProjectId)||fromProjectId===toProjectId)
    return msg("请选择两个不同的有效专项");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>td())return msg("请选择今天或此前的调拨日期");
  if(!Number.isFinite(amount)||amount<=0)return msg("请输入有效的调拨金额");
  if(!original&&[fromProjectId,toProjectId].some(id=>S.projects.find(p=>p.id===id)?.archived))
    return msg("归档专项需要先恢复");
  const preview=transferSnapshot(date,editId),available=Math.max(0,N(preview.projects[fromProjectId]));
  if(amount>available+.005)return msg(`该日期可调拨 ${M(available)}，请调整金额`);
  const planned=projectPlannedTotal(S.projects.find(p=>p.id===fromProjectId));
  const shortfall=Math.max(0,planned-(available-amount));
  if(shortfall>.005&&!confirm(`这笔调拨会使「${label(fromProjectId)}」的待支出规划存在 ${M(shortfall)} 的资金缺口。确定继续吗？`))return;
  const previous=original?{...original}:null;
  const t=original||{id:"pt"+Date.now()+Math.random().toString(36).slice(2,6),type:"project_transfer"};
  Object.assign(t,{type:"project_transfer",fromProjectId,toProjectId,date,amount,
    cycleIncomeId:cycleIncomeIdForDate(date),note:$("projectTransferNote").value.trim()});
  if(original)t.editedAt=Date.now();
  else S.tx.push(t);
  if(!allTransfersCovered()){
    if(previous)Object.assign(original,previous);
    else S.tx=S.tx.filter(x=>x.id!==t.id);
    return msg("此调整会使某笔调拨的当日资金不足，请调整日期或金额");
  }
  save();closeSheet("projectTransferSheet");render();
  msg(original?"专项调拨已修改":"专项资金已调拨，收支与储蓄统计保持一致");
};
const baseFinance=projectFinanceDetailHtml;
projectFinanceDetailHtml=function(p,a){
  const rows=transferRows(p.id);
  const ledger=rows.map(t=>{
    const inbound=t.toProjectId===p.id,partner=inbound?t.fromProjectId:t.toProjectId;
    return `<div class="projectLedgerRow"><div class="projectLedgerInfo">
      <div class="projectLedgerName">${inbound?"从":"转给"} ${esc(label(partner))}</div>
      <div class="projectLedgerMeta">${t.date}${t.note?" · "+esc(t.note):""}${t.archiveId?" · 结算归档":""}</div>
    </div><div class="projectLedgerAmount">${inbound?"+":"−"}${M(t.amount)}</div></div>`;
  }).join("");
  const choices=activeProjects().filter(x=>x.id!==p.id);
  const actions=choices.length?`<button class="projectPlanAdd" type="button" onclick="event.stopPropagation();openProjectTransfer('${p.id}')">资金调拨</button>`:"";
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
    if(!rows[i]||activeProjects().length<2)return;
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
    const from=esc(label(t.fromProjectId)),to=esc(label(t.toProjectId));
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
  if(t?.type==="project_transfer")return `专项调拨 · ${label(t.fromProjectId)} → ${label(t.toProjectId)}`;
  return originalTitle(t);
};
const originalSearch=transactionSearchText;
transactionSearchText=function(t){
  if(t?.type==="project_transfer")
    return normalizeHistorySearch(`专项 资金 调拨 转账 内部转移 ${label(t.fromProjectId)} ${label(t.toProjectId)} ${t.amount} ${t.note||""} ${t.date}`);
  return originalSearch(t);
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
    `<option value="saving">日常可用储蓄（默认）</option>`+
    activeProjects().filter(x=>x.id!==id).map(x=>`<option value="project:${esc(x.id)}">${esc(x.name)}</option>`).join("")+
    `<option value="keep">保留在当前专项（继续进行中）</option>`;
  settle.classList.add("show");
};
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
  if(a)S.tx=S.tx.filter(x=>!(x.type==="project_transfer"&&x.archiveId===a.id));
  return originalRestore(id);
};
const originalRemoveProjectTimeline=removeProjectTimelineTx;
removeProjectTimelineTx=function(id){
  const t=S.tx.find(x=>x.id===id);
  const archiveId=t?.type==="project_transfer"&&t.archiveId?t.archiveId
    :t?.type==="project_archive"?t.id:t?.archiveId||"";
  const archive=archiveId&&S.tx.find(x=>x.type==="project_archive"&&x.id===archiveId);
  if(archive){
    S.tx=S.tx.filter(x=>!(x.type==="project_transfer"&&x.archiveId===archiveId));
    return originalRemoveProjectTimeline(archive.id);
  }
  return originalRemoveProjectTimeline(id);
};
render();
})();
