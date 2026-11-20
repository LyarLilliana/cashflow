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
      const defaultLabel=kind==="light"?title+"预留":title.endsWith("专项")?title:title+"专项";
      const existingWallet=existing?.holdingAccountId||"__income__";
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
const originalFinance=projectFinanceDetailHtml;
projectFinanceDetailHtml=function(p,a){
  const base=originalFinance(p,a);
  const rows=records(p.id).sort((x,y)=>String(y.date).localeCompare(String(x.date))||txStamp(y)-txStamp(x));
  let history="";
  rows.forEach(t=>{
    history+='<div class="projectLedgerRow"><div class="projectLedgerInfo">'+
      '<div class="projectLedgerName">'+clean(walletName(t.fromAccountId))+' → '+clean(walletName(t.toAccountId))+'</div>'+
      '<div class="projectLedgerMeta">'+clean(t.date)+' · '+clean(kindName[t.projectHoldingSource]||"专项转账")+
      (t.note?' · '+clean(t.note):"")+'</div></div>'+
      '<div class="projectLedgerAmount">'+M(t.amount)+'</div></div>';
  });
  const holdings={};
  const events=(S.tx||[]).filter(t=>
    (t.type==="wallet_transfer"&&t.projectId===p.id&&t.projectHoldingSource)
    ||(t.type==="income"&&(t.alloc?.projects||[]).some(x=>x.projectId===p.id))
    ||((t.type==="pocket_to_project"||t.type==="saving_to_project")&&t.projectId===p.id&&!t.linkedProjectWalletTxId)
    ||(t.type==="expense"&&t.bucket==="project"&&t.refId===p.id))
    .filter(t=>!t.date||t.date<=td())
    .sort((x,y)=>String(x.date).localeCompare(String(y.date))||txStamp(x)-txStamp(y));
  events.forEach(t=>{
    if(t.type==="wallet_transfer"){
      const amount=round(t.amount);
      if(t.projectHoldingSource==="project"&&holdings[t.fromAccountId])
        holdings[t.fromAccountId]=Math.max(0,round(holdings[t.fromAccountId]-amount));
      holdings[t.toAccountId]=round((holdings[t.toAccountId]||0)+amount);
    }else if(t.type==="income"){
      (t.alloc?.projects||[]).filter(x=>x.projectId===p.id).forEach(x=>{
        const id=x.holdingAccountId||t.walletAccountId;
        if(id)holdings[id]=round((holdings[id]||0)+round(x.amount));
      });
    }else if(t.type==="pocket_to_project"||t.type==="saving_to_project"){
      const id=t.projectHoldingAccountId||t.walletFromAccountId;
      if(id)holdings[id]=round((holdings[id]||0)+round(t.amount));
    }else if(t.walletAccountId&&holdings[t.walletAccountId]){
      holdings[t.walletAccountId]=Math.max(0,round(holdings[t.walletAccountId]-round(t.amount)));
    }
  });
  let available=Math.max(0,round(a.projects[p.id]));
  let situated="";
  Object.keys(holdings).forEach(id=>{
    const amount=Math.min(Math.max(0,round(holdings[id])),
      Math.max(0,round(Wallets.balance(id))),available);
    if(amount>.005){
      situated+='<div class="projectLedgerRow"><div class="projectLedgerInfo"><div class="projectLedgerName">'+clean(walletName(id))+
        '</div></div><div class="projectLedgerAmount">'+M(amount)+'</div></div>';
      available=round(available-amount);
    }
  });
  if(available>.005)situated+='<div class="projectLedgerRow"><div class="projectLedgerInfo"><div class="projectLedgerName">尚待指定存放位置</div>'+
    '</div><div class="projectLedgerAmount">'+M(available)+'</div></div>';
  const area='<details class="projectLedger"><summary><span>专项资金存放 · '+rows.length+' 笔账户转存</span></summary>'+
    '<div class="projectLedgerMeta" style="margin-top:9px">当前已登记的存放位置</div>'+situated+
    '<div class="projectLedgerMeta" style="margin-top:9px">账户转存记录</div>'+
    (history||'<div class="note">尚无账户转存记录</div>')+'</details>';
  return base+area;
};
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