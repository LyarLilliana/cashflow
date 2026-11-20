/* Project money holdings: link the project budget to physical payment accounts. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const round=v=>Math.round((Number(v)||0)*100)/100;
const clean=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const projectName=id=>S.projects.find(p=>p.id===id)?.name||"专项";
const walletName=id=>Wallets.account(id)?.name||"原账户";
const records=id=>(S.tx||[]).filter(t=>t.type==="wallet_transfer"&&t.projectId===id&&t.projectHoldingSource);
const kindName={safe:"零花钱转入专项",saving:"普通储蓄转入专项",project:"已有专项资金调整存放"};

// Income allocations retain budget ownership while recording the actual holding account.
function availableChannels(){
  return (S.paymentAccounts||[]).filter(a=>a?.id&&!a.isProjectSubaccount);
}
function incomeHoldingOptions(selected=""){
  return '<option value="__income__">留在本次到账渠道</option>'+
    availableChannels().map(a=>
      '<option value="'+clean(a.id)+'"'+(selected===a.id?' selected':'')+'>'+
      clean(a.name)+'</option>').join("");
}
function incomeHoldingFields(scope,edit=false,tx=null){
  if(!scope)return;
  const types=[
    [edit?"editIncomeProjectAmount":"projectContrib","project"],
    [edit?"editIncomeRepayAmount":"projectRepayContrib","repayment"],
    [edit?"editIncomeLightAmount":"lightPlanContrib","light"]
  ];
  types.forEach(([className,kind])=>{
    scope.querySelectorAll("."+className).forEach(input=>{
      const id=input.dataset.id, parent=input.closest(".formGrid");
      if(!id||!parent||parent.querySelector('.incomeHoldingSelect[data-kind="'+kind+'"]'))return;
      const existing=kind==="light"?(tx?.alloc?.lightPlans||[]).find(x=>x.lightPlanId===id):
        (tx?.alloc?.projects||[]).find(x=>x.projectId===id&&!!x.repayment===(kind==="repayment"));
      const title=kind==="light"
        ?(S.plannedExpenses||[]).find(p=>p.id===id)?.name||"计划"
        :S.projects.find(p=>p.id===id)?.name||"专项";
      const project=kind==="light"?null:S.projects.find(p=>p.id===id);
      const defaultLabel=kind==="light"?title+"预留":project?.savingsAccountName||(title.endsWith("专项")?title:title+"专项");
      const existingWallet=edit?(existing?.holdingAccountId||"__income__"):
        (project?.savingsWalletId||"__income__");
      const chosen=availableChannels().some(a=>a.id===existingWallet)?existingWallet:"__income__";
      const label=existing?.holdingName||defaultLabel;
      const row=document.createElement("div");
      row.className="incomeHoldingFields";
      row.style.cssText="grid-column:1/-1;display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:0 0 6px";
      row.innerHTML='<div style="flex:1 1 135px;min-width:0"><label style="font-size:10px">实际存放渠道</label>'+
        '<select class="incomeHoldingSelect" data-kind="'+kind+'" data-id="'+clean(id)+'">'+
        incomeHoldingOptions(chosen)+'</select></div>'+
        '<div style="flex:1 1 125px;min-width:0"><label style="font-size:10px">账户内资金名称</label>'+
        '<input class="incomeHoldingName" data-kind="'+kind+'" data-id="'+clean(id)+'" maxlength="36" value="'+clean(label)+'"></div>';
      parent.appendChild(row);
      const selector=row.querySelector("select");
      if(selector)selector.value=chosen;
    });
  });
}
function holdingFor(kind,id,edit=false){
  const scope=edit?$("editTxFields"):$("projectSuggest");
  const select=[...(scope?.querySelectorAll(".incomeHoldingSelect")||[])]
    .find(x=>x.dataset.kind===kind&&x.dataset.id===id);
  const label=[...(scope?.querySelectorAll(".incomeHoldingName")||[])]
    .find(x=>x.dataset.kind===kind&&x.dataset.id===id);
  const target=select?.value||"__income__";
  return {holdingAccountId:target==="__income__"?"":target,
    holdingName:(label?.value||"").trim()};
}
function holdingDescription(allocation,income){
  const target=allocation?.holdingAccountId||income?.walletAccountId||"";
  const name=Wallets.account(target)?.name||"存放渠道待核对";
  const label=String(allocation?.holdingName||"").trim();
  return name+(label?" · "+label:"");
}
function linkedHoldingTransfers(tx){
  const out=[],source=tx.walletAccountId||"";
  const rows=[
    ...(tx.alloc?.projects||[]).map((x,i)=>({row:x,kind:x.repayment?"repayment":"project",id:x.projectId,number:i})),
    ...(tx.alloc?.lightPlans||[]).map((x,i)=>({row:x,kind:"light",id:x.lightPlanId,number:i}))
  ];
  for(const entry of rows){
    const item=entry.row,to=item.holdingAccountId||source;
    if(!(Number(item.amount)>0)||!source||!to||to===source)continue;
    if(!Wallets.account(to)||Wallets.account(to).isProjectSubaccount)return null;
    out.push({id:"ih_"+tx.id+"_"+entry.kind+"_"+entry.number,
      type:"wallet_transfer",date:tx.date,amount:round(item.amount),
      fromAccountId:source,toAccountId:to,ordinaryAmount:0,
      sourceIncomeId:tx.id,isIncomeHolding:true,holdingName:item.holdingName||"",
      projectId:entry.kind==="light"?"":entry.id,
      lightPlanId:entry.kind==="light"?entry.id:"",
      note:"收入预留转存 · "+(entry.kind==="light"
        ?((S.plannedExpenses||[]).find(p=>p.id===entry.id)?.name||"近期计划")
        :projectName(entry.id))});
  }
  return out;
}
function synchronizeHoldingTransfers(income){
  const previous=S.tx;
  const oldTransfers=previous.filter(t=>t.isIncomeHolding&&t.sourceIncomeId===income.id);
  const next=linkedHoldingTransfers(income);
  if(next===null)return false;
  const affected=[...new Set([...oldTransfers,...next].flatMap(t=>[t.fromAccountId,t.toAccountId]))];
  const baseline=[...new Set([income.date,td(),...previous.filter(t=>t.date>=income.date).map(t=>t.date)])].sort();
  const before=affected.map(id=>({id,balance:baseline.map(d=>Wallets.balanceAt(id,d))}));
  S.tx=previous.filter(t=>!(t.isIncomeHolding&&t.sourceIncomeId===income.id)).concat(next);
  const valid=before.every(rec=>baseline.every((d,i)=>
    Wallets.balanceAt(rec.id,d)>=Math.min(0,rec.balance[i])-0.005));
  if(!valid)S.tx=previous;
  return valid;
}
function migrateLegacyProjectAccounts(){
  // Older versions may have created "支付宝 · 旅行专项" as a second payment channel.
  // Fold that virtual location into the actual channel and keep the subaccount label.
  let changed=false;
  const childIds=new Set((S.tx||[])
    .filter(t=>t.type==="wallet_transfer"&&t.projectHoldingSource)
    .map(t=>t.toAccountId));
  (S.paymentAccounts||[]).filter(a=>a.isProjectSubaccount).forEach(a=>childIds.add(a.id));
  const normalized=v=>String(v||"").replace(/[\s·•._—–-]+/g,"").toLowerCase();
  // Also reconcile previously created project-named accounts, even if no transfer
  // transaction was posted before the user upgraded.
  (S.paymentAccounts||[]).forEach(child=>{
    const other=(S.paymentAccounts||[]).filter(a=>a.id!==child.id&&!a.isProjectSubaccount);
    if(other.some(a=>normalized(child.name).startsWith(normalized(a.name))&&normalized(child.name)!==normalized(a.name))
      &&(S.projects||[]).some(p=>p.name&&normalized(child.name).includes(normalized(p.name))))
      childIds.add(child.id);
  });
  for(const id of childIds){
    const child=Wallets.account(id);
    if(!child)continue;
    const other=(S.paymentAccounts||[]).filter(a=>a.id!==id&&!a.isProjectSubaccount);
    const parent=other.find(a=>a.id===child.parentAccountId||a.id===child.paymentParentId)
      ||other.sort((a,b)=>b.name.length-a.name.length).find(a=>
        normalized(child.name).startsWith(normalized(a.name))&&normalized(child.name)!==normalized(a.name));
    if(!parent)continue;
    const childId=child.id;
    const segment=String(child.name||"");
    const holdingLabel=(segment.includes(parent.name)
      ?segment.slice(segment.indexOf(parent.name)+parent.name.length):segment)
      .replace(/^[\s·•._—–-]+/,"").trim()||"专项";
    S.tx.filter(t=>t.type==="wallet_transfer"&&t.projectHoldingSource&&t.toAccountId===childId)
      .forEach(t=>{t.projectHoldingName=t.projectHoldingName||holdingLabel;});
    parent.openingBalance=round((Number(parent.openingBalance)||0)+(Number(child.openingBalance)||0));
    const cols=["walletAccountId","fromAccountId","toAccountId",
      "walletFromAccountId","walletToAccountId","projectHoldingAccountId"];
    for(const item of S.tx){
      cols.forEach(key=>{if(item[key]===childId)item[key]=parent.id;});
      if(item.type==="income"){
        [...(item.alloc?.projects||[]),...(item.alloc?.lightPlans||[])].forEach(a=>{
          if(a.holdingAccountId===childId)a.holdingAccountId=parent.id;
        });
      }
    }
    const shares=S.settings?.ordinaryWalletShares;
    if(shares&&shares[childId]){
      shares[parent.id]=round((Number(shares[parent.id])||0)+Number(shares[childId]));
      delete shares[childId];
    }
    S.paymentAccounts=S.paymentAccounts.filter(a=>a.id!==childId);
    changed=true;
  }
  if(changed)save();
}
// Project account holdings are displayed and managed in the Savings panel.
const priorWalletHtml=Wallets.txHtml;
Wallets.txHtml=function(t){
  if(t?.type==="wallet_transfer"&&t.isIncomeHolding){
    const title=t.projectId?projectName(t.projectId):((S.plannedExpenses||[]).find(p=>p.id===t.lightPlanId)?.name||"近期计划");
    return '<div class="item"><div class="txRow"><div class="txLeft"><div class="name">收入预留存放 · '+clean(title)+'</div>'+
      '<div class="meta">'+clean(t.date)+' · '+clean(walletName(t.fromAccountId))+' → '+clean(walletName(t.toAccountId))+
      (t.holdingName?' · '+clean(t.holdingName):"")+' · 内部转账</div></div><div class="txRight"><div class="txAmount txMuted">'+M(t.amount)+'</div></div></div></div>';
  }
  if(t?.type==="wallet_transfer"&&t.projectId&&t.projectHoldingSource){
    return '<div class="item"><div class="txRow"><div class="txLeft">'+
      '<div class="name">专项存放 · '+clean(projectName(t.projectId))+'</div>'+
      '<div class="meta">'+clean(t.date)+' · '+clean(walletName(t.fromAccountId))+
      ' → '+clean(walletName(t.toAccountId))+' · '+clean(kindName[t.projectHoldingSource]||"专项转账")+
      (t.note?' · '+clean(t.note):"")+'</div></div>'+
      '<div class="txRight"><div class="txAmount txMuted">'+M(t.amount)+'</div></div></div></div>';
  }
  return priorWalletHtml(t);
};
const previousRemove=removeTx;
removeTx=function(id){
  const item=S.tx.find(t=>t.id===id);
  if(item?.isIncomeHolding){
    return msg("这笔转账属于收入分配，请修改或删除对应的收入流水");
  }
  const wasIncome=item?.type==="income";
  previousRemove(id);
  if(wasIncome&&!S.tx.some(t=>t.id===id)){
    const oldCount=S.tx.length;
    S.tx=S.tx.filter(t=>!(t.isIncomeHolding&&t.sourceIncomeId===id));
    if(S.tx.length!==oldCount){save();render();}
  }
};
window.projectIncomeHoldingFields=incomeHoldingFields;
window.projectIncomeHoldingRead=holdingFor;
window.projectIncomeHoldingSync=synchronizeHoldingTransfers;
window.projectIncomeHoldingDescription=holdingDescription;

migrateLegacyProjectAccounts();
render();
})();