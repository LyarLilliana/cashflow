/* Project earmarked cash accounts live in Savings, backed by the existing project ledger. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const R=value=>Math.round((Number(value)||0)*100)/100;
const E=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const physical=()=>((S.paymentAccounts||[]).filter(a=>a&&a.id&&!a.isProjectSubaccount));
const wallet=id=>Wallets.account(id)?.name||"待指定渠道";
const accountLabel=p=>p.savingsAccountName||((p.name||"专项").endsWith("专项")?p.name:p.name+"专项");
const project=id=>S.projects.find(p=>p.id===id);
const total=p=>Math.max(0,R(accounting().projects[p.id]));
const options=(selected="",unknown=false)=>((unknown?'<option value="">待指定渠道</option>':"")+
  physical().map(a=>'<option value="'+E(a.id)+'"'+(selected===a.id?' selected':'')+'>'+E(a.name)+'</option>').join(""));
const profile=p=>{
  const assigned=(p.savingsWalletId&&Wallets.account(p.savingsWalletId))?p.savingsWalletId:"";
  const recent=[...S.tx].reverse().find(t=>t.type==="income"&&(t.alloc?.projects||[]).some(x=>x.projectId===p.id));
  const receipt=(recent?.alloc?.projects||[]).find(x=>x.projectId===p.id);
  return assigned||receipt?.holdingAccountId||recent?.walletAccountId||physical()[0]?.id||"";
};
const section=document.createElement("div");
section.className="section projectSavingsSection";
section.innerHTML='<div class="sectionHeader savingsFoldSectionHeader">'+
  '<div class="sectionTitle">专项资金账户</div><div class="savingsSectionControls">'+
  '<strong class="savingsSectionTotal" id="projectSavingsTotal">¥0</strong>'+
  '<button class="sectionToggle" type="button" id="projectSavingsAdd">新增账户</button>'+
  '<button class="savingsSectionFoldButton" type="button" id="projectSavingsFold" aria-expanded="true" aria-controls="projectSavingsBody" aria-label="收起专项资金账户"><span class="savingsFoldChevron"></span></button>'+
  '</div></div><div class="savingsFoldSectionBody" id="projectSavingsBody">'+
  '<div class="card"><div class="shortAccountList" id="projectSavingsList"></div></div></div>';
const bank=$("bankSavingSectionTotal")?.closest(".section");
if(bank)bank.parentElement.insertBefore(section,bank);
else $("savings")?.appendChild(section);
const style=document.createElement("style");
style.textContent=[
  '.projectSavingsSection .shortAccountLine{margin:0}',
  '.projectSavingsSection .shortAccountLineSub{display:flex;gap:9px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}',
  '.projectSavingsSection .projectSavingBtns{display:flex;gap:5px;flex-wrap:wrap}',
  '.projectSavingsSection .projectSavingBtns button{font-size:11px;padding:6px 9px}',
  '.projectSavingsSection .projectSavingPositions{margin:8px 0;padding:8px 0;border-top:1px solid var(--line)}',
  '.projectSavingsSection .projectSavingPosition{display:flex;justify-content:space-between;gap:8px;padding:5px 2px;font-size:12px}',
  '.projectSavingsSection .projectSavingHistory{margin-top:7px;border-top:1px solid var(--line);padding-top:8px}',
  '.projectSavingsSection .projectSavingHistory summary{font-size:12px;color:var(--muted);cursor:pointer}',
  '.projectSavingsSection .projectSavingHistoryRow{display:flex;justify-content:space-between;gap:9px;padding:8px 2px;border-bottom:1px solid var(--line);font-size:12px}',
  '.projectSavingsSection .projectSavingHistoryRow:last-child{border-bottom:0}',
  '.projectSavingsSection .projectSavingHistoryRow .meta{margin-top:3px;font-size:10px}',
  '.projectSavingsSection .projectSavingHistoryRow strong{white-space:nowrap;font-variant-numeric:tabular-nums}',
  '.projectSavingsSection .projectSavingHint{font-size:11px;color:var(--muted);margin-top:5px}'
].join("");
document.head.appendChild(style);
const modal=document.createElement("div");
modal.className="sheet";
modal.id="projectSavingsSheet";
modal.innerHTML='<div class="sheetCard"><div class="sheetTitle" id="projectSavingSheetTitle">专项资金账户</div>'+
 '<input type="hidden" id="projectSavingId"><input type="hidden" id="projectSavingMode">'+
 '<div class="formGrid one">'+
 '<div id="projectSavingNameRow"><label>账户名称</label><input id="projectSavingName" maxlength="36" placeholder="例如 旅行专项"></div>'+
 '<div id="projectSavingBudgetRow"><label>专项预算</label><input id="projectSavingBudget" type="number" min="0.01" step="0.01" inputmode="decimal"></div>'+
 '<div id="projectSavingFundingRow"><label>资金来源</label><select id="projectSavingFunding"><option value="safe">零花钱</option><option value="saving">普通储蓄</option></select></div>'+
 '<div id="projectSavingFromRow"><label id="projectSavingFromLabel">实际转出渠道</label><select id="projectSavingFrom"></select></div>'+
 '<div id="projectSavingToRow"><label id="projectSavingToLabel">实际存放渠道</label><select id="projectSavingTo"></select></div>'+
 '<div id="projectSavingAmountRow"><label>金额</label><input id="projectSavingAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div>'+
 '<div class="note" id="projectSavingPreview"></div>'+
 '</div><div class="actions"><button type="button" class="ghost" id="projectSavingCancel">取消</button>'+
 '<button type="button" class="primary" id="projectSavingConfirm">保存</button></div></div>';
document.body.appendChild(modal);
function projectRaw(p,asOf=td()){
  const held={};
  const add=(id,amount)=>{
    if(!id||!Wallets.account(id))return;
    held[id]=R((held[id]||0)+Math.max(0,R(amount)));
  };
  const spend=(source,amount)=>{
    let left=Math.max(0,R(amount));
    if(source&&held[source]>0){
      const use=Math.min(left,held[source]);held[source]=R(held[source]-use);left=R(left-use);
    }
    for(const id of Object.keys(held)){
      if(left<=0.005)break;
      const use=Math.min(left,Math.max(0,held[id]));
      held[id]=R(held[id]-use);left=R(left-use);
    }
  };
  if(p.initialFund>0&&(p.initialHoldingWalletId||p.savingsWalletId))
    add(p.initialHoldingWalletId||p.savingsWalletId,p.initialFund);
  const rows=(S.tx||[]).filter(t=>!t.date||t.date<=asOf).slice().sort((a,b)=>
    String(a.date||"").localeCompare(String(b.date||""))||(
      a.type==="income"&&b.type!=="income"?-1:
      b.type==="income"&&a.type!=="income"?1:txStamp(a)-txStamp(b)));
  for(const t of rows){
    if(t.type==="income"){
      (t.alloc?.projects||[]).filter(x=>x.projectId===p.id).forEach(x=>
        add(x.holdingAccountId||t.walletAccountId,R(x.amount)));
    }else if((t.type==="pocket_to_project"||t.type==="saving_to_project")&&t.projectId===p.id){
      if(!t.linkedProjectWalletTxId)add(t.projectHoldingAccountId||t.walletFromAccountId,R(t.amount));
    }else if(t.type==="wallet_transfer"&&t.projectId===p.id&&t.projectHoldingSource){
      if(t.projectHoldingSource==="project"){
        spend(t.fromAccountId,t.amount);
        add(t.toAccountId,t.amount);
      }else if(t.projectHoldingSource==="safe"||t.projectHoldingSource==="saving"){
        add(t.toAccountId,t.amount);
      }
    }else if(t.type==="project_transfer"){
      if(t.fromProjectId===p.id)spend(t.walletFromAccountId,R(t.amount));
      if(t.toProjectId===p.id)add(t.walletToAccountId,R(t.amount));
    }else if(t.type==="project_settlement"&&t.projectId===p.id){
      spend("",R(t.amount));
    }else if(t.type==="expense"&&((t.bucket==="project"&&t.refId===p.id)||t.projectBorrow&&t.refId===p.id)){
      spend(t.walletAccountId,R(t.amount));
    }
  }
  return held;
}
function projectPositions(p){
  const remaining={};
  physical().forEach(w=>{remaining[w.id]=Math.max(0,R(Wallets.balance(w.id)))});
  // Allocate real channel capacity consistently across all project accounts.
  const results={};
  for(const item of S.projects){
    let available=total(item);
    const raw=projectRaw(item);
    const allocated={};
    Object.entries(raw).forEach(([id,value])=>{
      const valueCapped=Math.min(Math.max(0,R(value)),available,Math.max(0,remaining[id]||0));
      if(valueCapped>.005){
        allocated[id]=R(valueCapped);
        available=R(available-valueCapped);
        remaining[id]=R(remaining[id]-valueCapped);
      }
    });
    results[item.id]={held:allocated,unassigned:R(available)};
  }
  return results[p.id]||{held:{},unassigned:total(p)};
}
function history(p){
  const rows=[];
  for(const t of S.tx||[]){
    if(t.type==="income"){
      (t.alloc?.projects||[]).filter(x=>x.projectId===p.id&&R(x.amount)>0).forEach(x=>
        rows.push({date:t.date,label:x.repayment?"收入补回专项":"收入分配存入",amount:R(x.amount),
          meta:wallet(x.holdingAccountId||t.walletAccountId)+(x.holdingName?" · "+x.holdingName:"")}));
    }else if((t.type==="pocket_to_project"||t.type==="saving_to_project")&&t.projectId===p.id){
      rows.push({date:t.date,label:t.type==="saving_to_project"?"普通储蓄转入":"零花钱转入",amount:R(t.amount),
        meta:wallet(t.projectHoldingAccountId||t.walletFromAccountId)});
    }else if(t.type==="project_transfer"&&(t.fromProjectId===p.id||t.toProjectId===p.id)){
      const inbound=t.toProjectId===p.id;
      rows.push({date:t.date,label:inbound?"其他专项调入":"专项调出",amount:(inbound?1:-1)*R(t.amount),
        meta:t.note||""});
    }else if(t.type==="project_settlement"&&t.projectId===p.id){
      rows.push({date:t.date,label:"专项结余结算",amount:-R(t.amount),meta:t.note||""});
    }else if(t.type==="expense"&&((t.bucket==="project"&&t.refId===p.id)||t.projectBorrow&&t.refId===p.id)){
      rows.push({date:t.date,label:"专项支出",amount:-R(t.amount),meta:t.note||wallet(t.walletAccountId)});
    }else if(t.type==="wallet_transfer"&&t.projectId===p.id&&t.projectHoldingSource==="project"){
      rows.push({date:t.date,label:"存放渠道调整",amount:0,meta:wallet(t.fromAccountId)+" → "+wallet(t.toAccountId)+" · "+M(t.amount)});
    }
  }
  return rows.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,15);
}
function refresh(){
  const list=$("projectSavingsList");
  if(!list)return;
  const rows=(S.projects||[]).filter(p=>!p.archived||total(p)>.005);
  $("projectSavingsTotal").textContent=M(rows.reduce((n,p)=>n+total(p),0));
  list.innerHTML=rows.length?rows.map(p=>{
    const pos=projectPositions(p),sum=total(p);
    const locations=Object.entries(pos.held).map(([id,amount])=>
      '<div class="projectSavingPosition"><span>'+E(wallet(id))+'</span><strong>'+M(amount)+'</strong></div>').join("");
    const unsure=pos.unassigned>.005?'<div class="projectSavingPosition"><span>存放渠道待核对</span><strong>'+M(pos.unassigned)+'</strong></div>':"";
    const movements=history(p).map(x=>'<div class="projectSavingHistoryRow"><div><div>'+E(x.label)+'</div><div class="meta">'+E(x.date||"")+(x.meta?' · '+E(x.meta):"")+'</div></div><strong>'+(
      x.amount>0?"+":x.amount<0?"−":"")+M(Math.abs(x.amount))+'</strong></div>').join("");
    return '<details class="shortAccountLine shortAccountFold" data-project-saving="'+E(p.id)+'"'+
      (readSavingFold("project:"+p.id,false)?" open":"")+'>'+
      '<summary class="shortAccountLineTop savingsAccountFoldSummary"><span class="name">'+E(accountLabel(p))+'</span>'+
      '<span class="savingsAccountSummaryEnd"><strong>'+M(sum)+'</strong><span class="savingsFoldChevron"></span></span></summary>'+
      '<div class="shortAccountLineSub"><div class="projectSavingHint">关联专项：'+E(p.name)+(p.archived?" · 已归档":"")+
      '</div><div class="projectSavingBtns">'+
      (!p.archived?'<button data-op="in" data-id="'+E(p.id)+'">转入</button>'+
        '<button data-op="out" data-id="'+E(p.id)+'">转出</button>'+
        '<button data-op="move" data-id="'+E(p.id)+'">渠道互转</button>':"")+
      '<button data-op="edit" data-id="'+E(p.id)+'">编辑账户</button></div></div>'+
      '<div class="projectSavingPositions">'+(locations+unsure||'<div class="note">当前账户余额为零</div>')+'</div>'+
      '<details class="projectSavingHistory"><summary>资金变动流水</summary>'+
      (movements||'<div class="note">暂无变动记录</div>')+'</details></details>';
  }).join(""):'<div class="note">暂无专项账户，可在此建立第一笔专项账户。</div>';
}
function open(mode,id=""){
  const p=project(id);
  if(mode!=="new"&&!p)return msg("专项账户已更新，请重新选择");
  if(p?.archived&&["in","out","move"].includes(mode))return msg("请先恢复已归档专项");
  $("projectSavingMode").value=mode;
  $("projectSavingId").value=id;
  $("projectSavingName").value=p?accountLabel(p):"";
  $("projectSavingBudget").value=p?R(p.budget):"";
  $("projectSavingAmount").value="";
  $("projectSavingFunding").value="safe";
  const preferred=p?profile(p):physical()[0]?.id||"";
  $("projectSavingFrom").innerHTML=options(preferred,true);
  $("projectSavingTo").innerHTML=options(preferred,true);
  $("projectSavingFrom").value=preferred;
  $("projectSavingTo").value=preferred;
  $("projectSavingNameRow").hidden=!(mode==="new"||mode==="edit");
  $("projectSavingBudgetRow").hidden=mode!=="new";
  $("projectSavingFundingRow").hidden=mode!=="in";
  $("projectSavingFromRow").hidden=(mode==="edit"||mode==="new");
  $("projectSavingAmountRow").hidden=(mode==="edit"||mode==="new");
  $("projectSavingToRow").hidden=false;
  $("projectSavingFromLabel").textContent=mode==="move"?"当前存放渠道":mode==="out"?"专项存放渠道":"资金来源渠道";
  $("projectSavingToLabel").textContent=mode==="edit"||mode==="new"?"默认存放渠道":
    mode==="out"?"转入普通储蓄的渠道":"实际存放渠道";
  $("projectSavingPreview").textContent="";
  $("projectSavingSheetTitle").textContent=({new:"新增专项账户",edit:"编辑专项账户",in:"专项账户转入",out:"专项转普通储蓄",move:"专项资金渠道互转"})[mode];
  $("projectSavingConfirm").textContent=mode==="edit"||mode==="new"?"保存账户":"确认变动";
  updatePreview();
  modal.classList.add("show");
}
function updatePreview(){
  const mode=$("projectSavingMode").value,p=project($("projectSavingId").value);
  if(!p&&mode!=="new")return;
  const amount=R($("projectSavingAmount").value),from=$("projectSavingFrom").value,to=$("projectSavingTo").value;
  const source=$("projectSavingFunding").value;
  if(mode==="new"||mode==="edit"){
    $("projectSavingPreview").textContent="默认存放渠道用于新转入资金；已有资金的位置以实际转账记录为准。";
    return;
  }
  if(mode==="in"){
    const available=source==="saving"?Math.max(0,R(accounting().saving)):Math.max(0,R(bal().safe));
    $("projectSavingPreview").textContent="当前可分配 "+M(available)+" · 专项现有余额 "+M(total(p))+
      (amount>0?" · 转入后 "+M(total(p)+amount):"");
  }else{
    const held=projectPositions(p).held[from]||0;
    $("projectSavingPreview").textContent=wallet(from)+" 内已登记专项 "+M(held)+
      (amount>0?(mode==="out"?" · 转出后专项 "+M(Math.max(0,total(p)-amount)):" · 转存 "+M(amount)+" 至 "+wallet(to)):"");
  }
}
function newId(prefix){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function record(){
  const mode=$("projectSavingMode").value,p=project($("projectSavingId").value);
  const name=$("projectSavingName").value.trim();
  const from=$("projectSavingFrom").value,to=$("projectSavingTo").value;
  const amount=R($("projectSavingAmount").value),now=td();
  if(mode==="new"){
    const budget=R($("projectSavingBudget").value);
    if(!name||budget<=0)return msg("请填写账户名称与专项预算");
    if(!Wallets.account(to))return msg("请选择默认存放渠道");
    S.projects.push({id:newId("p"),name,budget,initialFund:0,createdAt:now,dueDate:"",
      savingsAccountName:name,savingsWalletId:to});
    save();closeSheet("projectSavingsSheet");render();return msg("专项账户已建立");
  }
  if(!p)return msg("账户已更新，请重新打开");
  if(mode==="edit"){
    if(!name)return msg("请输入账户名称");
    if(!Wallets.account(to))return msg("请选择有效的默认存放渠道");
    if(p.initialFund>0&&!p.initialHoldingWalletId)
      p.initialHoldingWalletId=p.savingsWalletId||to;
    p.savingsAccountName=name;
    p.savingsWalletId=to;
    save();closeSheet("projectSavingsSheet");render();return msg("专项账户设置已保存");
  }
  if(!Number.isFinite(amount)||amount<=0)return msg("请输入有效的变动金额");
  if(!Wallets.account(from)||!Wallets.account(to))return msg("请选择实际支付渠道");
  if(Wallets.balance(from)+.005<amount)return msg("转出渠道实际余额不足");
  if(mode==="move"&&from===to)return msg("请选择不同的转入渠道");
  const previousTx=S.tx;
  const previousShares=JSON.parse(JSON.stringify(S.settings.ordinaryWalletShares||{}));
  const previousAbsorbed=JSON.parse(JSON.stringify(S.settings.ordinaryWalletAbsorbedMovements||{}));
  const revert=()=>{S.tx=previousTx;S.settings.ordinaryWalletShares=previousShares;S.settings.ordinaryWalletAbsorbedMovements=previousAbsorbed;};
  const held=projectPositions(p).held[from]||0;
  if((mode==="out"||mode==="move")&&amount>held+.005)return msg("该存放渠道已登记的专项余额不足，请先核对资金位置");
  let newRows=[];
  if(mode==="in"){
    const kind=$("projectSavingFunding").value;
    const available=kind==="saving"?Math.max(0,R(accounting().saving)):Math.max(0,R(bal().safe));
    if(amount>available+.005)return msg("资金来源可用余额不足");
    if(kind==="saving"){
      const distribution=ordinaryWalletDistribution();
      if(amount>R(distribution.allocation[from])+.005)return msg("来源渠道的普通储蓄余额不足，请核对储蓄存放渠道");
      S.settings.ordinaryWalletShares={...distribution.allocation};
      const absorbed=S.settings.ordinaryWalletAbsorbedMovements||(S.settings.ordinaryWalletAbsorbedMovements={});
      (distribution.inferredMovementIds||[]).forEach(id=>{absorbed[id]=true});
      S.settings.ordinaryWalletShares[from]=R(R(S.settings.ordinaryWalletShares[from])-amount);
    }
    const tx={id:newId("psf"),date:now,type:kind==="saving"?"saving_to_project":"pocket_to_project",
      projectId:p.id,amount,cycleIncomeId:cycleIncomeIdForDate(now),
      walletFromAccountId:from,projectHoldingAccountId:to,projectHoldingName:accountLabel(p),
      note:"专项账户存入 · "+accountLabel(p)};
    newRows.push(tx);
    if(from!==to){
      const movement={id:newId("psw"),date:now,type:"wallet_transfer",projectId:p.id,
        projectHoldingSource:kind,fromAccountId:from,toAccountId:to,amount,
        linkedProjectWalletFundingId:tx.id,projectHoldingName:accountLabel(p),
        note:"专项账户转存"};
      tx.linkedProjectWalletTxId=movement.id;
      newRows.push(movement);
    }
  }else if(mode==="out"){
    const tx={id:newId("pst"),date:now,type:"project_transfer",
      fromProjectId:p.id,toProjectId:"__saving__",savingDestination:"ordinary",
      amount,cycleIncomeId:cycleIncomeIdForDate(now),walletFromAccountId:from,
      walletToAccountId:to,note:"专项账户转回普通储蓄"};
    newRows.push(tx);
    if(from!==to)newRows.push({id:newId("psw"),date:now,type:"wallet_transfer",amount,
      projectId:p.id,projectHoldingSource:"project_out",fromAccountId:from,toAccountId:to,
      linkedProjectWalletFundingId:tx.id,note:"专项账户转出同步换渠道"});
    const distribution=ordinaryWalletDistribution();
    S.settings.ordinaryWalletShares={...distribution.allocation};
    const absorbed=S.settings.ordinaryWalletAbsorbedMovements||(S.settings.ordinaryWalletAbsorbedMovements={});
    (distribution.inferredMovementIds||[]).forEach(id=>{absorbed[id]=true});
  }else if(mode==="move"){
    newRows.push({id:newId("psw"),date:now,type:"wallet_transfer",amount,
      projectId:p.id,projectHoldingSource:"project",fromAccountId:from,toAccountId:to,
      projectHoldingName:accountLabel(p),note:"专项账户存放渠道调整"});
  }else return;
  const beforeBudget=accounting(),beforePhysical=physical().map(a=>({id:a.id,amount:Wallets.balance(a.id)}));
  S.tx=[...S.tx,...newRows];
  const afterBudget=accounting();
  const affected=beforePhysical.every(w=>Wallets.balance(w.id)>=Math.min(0,w.amount)-.005);
  const budgetValid=afterBudget.projects[p.id]>=-0.005
    &&afterBudget.raw.safe>=Math.min(0,beforeBudget.raw.safe)-.005
    &&afterBudget.saving>=Math.min(0,beforeBudget.saving)-.005;
  if(!affected||!budgetValid){revert();return msg("本次变动使预算或实际渠道余额不足，请核对金额");}
  if(mode==="out"){
    const reserved=reserveOrdinaryWalletShare(to,amount);
    if(reserved.amount+0.005<amount){revert();return msg("普通储蓄渠道余额不足，无法完成转出");}
  }
  if(mode==="move"&&R(projectPositions(p).held[to])<amount-.005){
    revert();return msg("渠道互转后余额分布校验失败，请核对专项资金");
  }
  if(mode==="in"&&R(afterBudget.projects[p.id])<R(beforeBudget.projects[p.id])-.005){
    revert();return msg("资金变动验证失败");
  }
  p.savingsWalletId=to;
  save();closeSheet("projectSavingsSheet");render();msg("专项账户余额与渠道已同步更新");
}
const previousSavings=renderSavings;
renderSavings=function(){previousSavings();refresh();};
$("projectSavingsAdd").onclick=()=>open("new");
$("projectSavingCancel").onclick=()=>closeSheet("projectSavingsSheet");
$("projectSavingConfirm").onclick=record;
$("projectSavingsFold").onclick=()=>{
  const body=$("projectSavingsBody"),collapsed=!body.hidden;
  body.hidden=collapsed;
  $("projectSavingsFold").setAttribute("aria-expanded",String(!collapsed));
  $("projectSavingsFold").setAttribute("aria-label",collapsed?"展开专项资金账户":"收起专项资金账户");
  if(typeof writeSavingFold==="function")writeSavingFold("section:project",!collapsed);
};
$("projectSavingsList").addEventListener("click",event=>{
  const btn=event.target.closest("button[data-op]");
  if(!btn)return;
  event.preventDefault();event.stopPropagation();
  open(btn.dataset.op,btn.dataset.id);
});
$("projectSavingsList").addEventListener("toggle",event=>{
  const item=event.target.closest("details[data-project-saving]");
  if(item===event.target&&typeof writeSavingFold==="function")
    writeSavingFold("project:"+item.dataset.projectSaving,item.open);
},true);
["projectSavingFunding","projectSavingFrom","projectSavingTo","projectSavingAmount"].forEach(id=>{
  $(id).addEventListener("change",updatePreview);
  if(id==="projectSavingAmount")$(id).addEventListener("input",updatePreview);
});
if(typeof enhanceDateInputs==="function")enhanceDateInputs();
const openByDefault=typeof readSavingFold==="function"?readSavingFold("section:project",true):true;
$("projectSavingsBody").hidden=!openByDefault;
$("projectSavingsFold").setAttribute("aria-expanded",String(openByDefault));
renderSavings();
})();