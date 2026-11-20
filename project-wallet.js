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
  let changed=false;
  const transfers=(S.tx||[]).filter(t=>t.type==="wallet_transfer"&&t.projectHoldingSource);
  for(const t of transfers){
    const child=Wallets.account(t.toAccountId);
    if(!child)continue;
    const parent=availableChannels()
      .filter(a=>a.id!==child.id)
      .sort((a,b)=>b.name.length-a.name.length)
      .find(a=>child.name.startsWith(a.name+" · ")||child.name.startsWith(a.name+"-"));
    if(!parent)continue;
    const childId=child.id;
    // A legacy named project account is a virtual allocation inside its payment channel.
    t.projectHoldingName=t.projectHoldingName||child.name.slice(parent.name.length).replace(/^[ ·-]+/,"");
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

const outer=document.createElement("div");
outer.innerHTML='<div class="sheet" id="projectWalletSheet"><div class="sheetCard">'+
  '<div class="sheetTitle" id="projectWalletTitle">专项资金存放</div>'+
  '<div class="formGrid one">'+
  '<div><label for="projectWalletFrom">实际转出账户</label><select id="projectWalletFrom"></select></div>'+
  '<div><label for="projectWalletTo">实际转入账户</label><select id="projectWalletTo"></select></div>'+
  '<div id="projectWalletNewRow" style="display:none"><label for="projectWalletNewName">新建独立账户名称</label><input id="projectWalletNewName" maxlength="36" placeholder="例如 支付宝 · 旅行专项"></div>'+
  '<div><label for="projectWalletKind">这笔钱原来归属哪里</label><select id="projectWalletKind">'+
  '<option value="">请选择资金归属</option>'+
  '<option value="safe">本周期零花钱，新增专项已备</option>'+
  '<option value="saving">普通储蓄余额，转入专项已备</option>'+
  '<option value="project">已经计入此专项，仅调整存放账户</option>'+
  '</select></div>'+
  '<div><label for="projectWalletAmount">转入金额</label><input id="projectWalletAmount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00"></div>'+
  '<div><label for="projectWalletDate">日期</label><input id="projectWalletDate" type="date"></div>'+
  '<div><label for="projectWalletNote">备注</label><input id="projectWalletNote" maxlength="80" placeholder="可选"></div>'+
  '</div><div class="meta" id="projectWalletPreview" style="margin-top:11px;line-height:1.6"></div>'+
  '<div class="actions"><button type="button" class="ghost" id="projectWalletCancel">取消</button>'+
  '<button type="button" class="primary" id="projectWalletSave">保存记录</button></div>'+
  '</div></div>';
document.body.appendChild(outer);
let currentProjectId="";
const options=()=>((S.paymentAccounts||[]).map(a=>'<option value="'+clean(a.id)+'">'+clean(a.name)+'</option>')).join("");
function refreshNew(){
  $("projectWalletNewRow").style.display=$("projectWalletTo").value==="__new__"?"":"none";
  preview();
}
function preview(){
  const from=$("projectWalletFrom").value;
  const kind=$("projectWalletKind").value;
  const a=accounting($("projectWalletDate").value||td());
  const available=kind==="safe"?Math.max(0,round(a.raw.safe)):
    kind==="saving"?Math.max(0,round(a.saving)):
      kind==="project"?Math.max(0,round(a.projects[currentProjectId])):0;
  const dest=$("projectWalletTo").value==="__new__"
    ?($("projectWalletNewName").value.trim()||"新账户"):walletName($("projectWalletTo").value);
  $("projectWalletPreview").textContent="转出 "+walletName(from)+" · 实际余额 "+M(Wallets.balance(from))+
    "；转入 "+dest+(kind?"；可分配预算 "+M(available):"；请选择资金原归属");
}
function open(projectId){
  const p=S.projects.find(x=>x.id===projectId);
  if(!p||p.archived)return msg("请选择正在进行的专项");
  if((S.paymentAccounts||[]).length<1)return msg("请先在计划中添加支付账户");
  currentProjectId=projectId;
  $("projectWalletTitle").textContent="专项存放账户 · "+p.name;
  $("projectWalletFrom").innerHTML=options();
  $("projectWalletTo").innerHTML=options()+'<option value="__new__">+ 新建独立账户</option>';
  $("projectWalletFrom").value=S.paymentAccounts[0].id;
  $("projectWalletTo").value=S.paymentAccounts[1]?.id||"__new__";
  $("projectWalletKind").value="";
  $("projectWalletAmount").value="";
  $("projectWalletDate").value=td();
  $("projectWalletDate").max=td();
  $("projectWalletNote").value="";
  $("projectWalletNewName").value="";
  refreshNew();
  $("projectWalletSheet").classList.add("show");
  if(typeof syncDateDisplays==="function")syncDateDisplays();
}
function deleteRecord(id){
  const selected=S.tx.find(t=>t.id===id);
  const tx=selected?.type==="wallet_transfer"&&selected.projectId?selected:
    selected?.linkedProjectWalletTxId?S.tx.find(t=>t.id===selected.linkedProjectWalletTxId):null;
  if(!tx||tx.type!=="wallet_transfer"||!tx.projectId)return false;
  const dates=[...new Set([tx.date,td(),...S.tx.map(t=>t.date).filter(d=>d&&d>=tx.date)])].sort();
  const destinationBefore=dates.map(d=>Wallets.balanceAt(tx.toAccountId,d));
  const before=S.tx;
  S.tx=S.tx.filter(t=>t.id!==tx.id&&t.id!==tx.linkedProjectFundingTxId);
  const remaining=accounting().projects[tx.projectId];
  const destinationValid=dates.every((d,i)=>
    Wallets.balanceAt(tx.toAccountId,d)>=Math.min(0,destinationBefore[i])-.005);
  if(remaining<-.005||!destinationValid){
    S.tx=before;
    msg("后续专项或目标账户已经使用这笔资金，请先调整相关流水");
    return true;
  }
  save();render();msg("专项存放和关联资金分配已同步撤销");
  return true;
}
$("projectWalletCancel").onclick=()=>closeSheet("projectWalletSheet");
["projectWalletFrom","projectWalletTo","projectWalletKind","projectWalletAmount","projectWalletDate","projectWalletNewName"]
  .forEach(id=>$(id).addEventListener(id==="projectWalletAmount"||id==="projectWalletNewName"?"input":"change",id==="projectWalletTo"?refreshNew:preview));
$("projectWalletSave").onclick=()=>{
  const p=S.projects.find(x=>x.id===currentProjectId);
  const from=$("projectWalletFrom").value;
  const target=$("projectWalletTo").value;
  const kind=$("projectWalletKind").value;
  const date=$("projectWalletDate").value||td();
  const raw=$("projectWalletAmount").value.trim();
  const amount=round(Number(raw));
  if(!p||p.archived||!Wallets.account(from))return msg("请选择有效的专项和转出账户");
  if(!["safe","saving","project"].includes(kind))return msg("请选择这笔钱原来的预算归属");
  if(!raw||!Number.isFinite(Number(raw))||amount<=0)return msg("请输入有效金额");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>td())return msg("请选择今天或之前的日期");
  if(target!=="__new__"&&(!Wallets.account(target)||target===from))return msg("请选择不同的转入账户");
  const newName=$("projectWalletNewName").value.trim();
  if(target==="__new__"&&!newName)return msg("请输入新的独立账户名称");
  if(target==="__new__"&&(S.paymentAccounts||[]).some(a=>a.name===newName))
    return msg("该账户已存在，请从转入账户列表选择");
  const a=accounting(date);
  const available=kind==="safe"?round(a.raw.safe):
    kind==="saving"?round(a.saving):round(a.projects[p.id]);
  if(available+0.005<amount)return msg("该预算归属可用 "+M(Math.max(0,available))+"，请调整金额");
  const distribution=typeof ordinaryWalletDistribution==="function"?ordinaryWalletDistribution():null;
  const ordinaryShare=Math.max(0,round(distribution?.allocation[from]));
  const physical=Wallets.balanceAt(from,date);
  if(physical+0.005<amount)return msg("转出账户当日实际余额只有 "+M(physical));
  if(kind==="saving"&&ordinaryShare+0.005<amount)
    return msg("转出账户中已标记的普通储蓄不足，请先校准普通储蓄渠道分布");
  if(kind==="safe"&&Wallets.balance(from)-ordinaryShare+0.005<amount)
    return msg("该账户普通储蓄以外的余额不足，请选择实际存有这笔钱的来源");
  const oldTx=S.tx,oldAccounts=S.paymentAccounts;
  const destination=target==="__new__"?"wallet_"+Date.now()+"_"+Math.random().toString(36).slice(2,6):target;
  const beforeDates=[...new Set([date,td(),...S.tx.map(t=>t.date).filter(d=>d&&d>=date)])].sort();
  const beforeSource=beforeDates.map(d=>Wallets.balanceAt(from,d));
  if(target==="__new__")S.paymentAccounts=[...S.paymentAccounts,{id:destination,name:newName,openingBalance:0}];
  const token="pwallet_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
  const companionId=kind==="project"?"":token+"_fund";
  const note=$("projectWalletNote").value.trim();
  const flow={id:token,type:"wallet_transfer",date,fromAccountId:from,toAccountId:destination,
    amount,ordinaryAmount:0,projectId:p.id,projectName:p.name,
    projectHoldingSource:kind,linkedProjectFundingTxId:companionId,
    note:note||"专项存放 · "+p.name};
  S.tx=[...S.tx,flow];
  if(companionId){
    S.tx.push({id:companionId,type:kind==="safe"?"pocket_to_project":"saving_to_project",
      projectId:p.id,date,amount,linkedProjectWalletTxId:token,
      walletFromAccountId:from,projectHoldingAccountId:destination,
      cycleIncomeId:cycleIncomeIdForDate(date),
      note:"存到 "+walletName(destination)+(note?" · "+note:"")});
  }
  const datedValid=beforeDates.every((d,i)=>Wallets.balanceAt(from,d)>=Math.min(0,beforeSource[i])-.005);
  const budgetValid=accounting(td()).projects[p.id]>=-.005;
  if(!datedValid||!budgetValid){
    S.tx=oldTx;S.paymentAccounts=oldAccounts;
    return msg("该转账会造成账户或专项后续资金不足，请调整金额及日期");
  }
  save();closeSheet("projectWalletSheet");render();
  msg("专项存放已登记，实际账户余额同步更新");
};
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
    ||(t.type==="expense"&&t.bucket==="project"&&t.refId===p.id))
    .filter(t=>!t.date||t.date<=td())
    .sort((x,y)=>String(x.date).localeCompare(String(y.date))||txStamp(x)-txStamp(y));
  events.forEach(t=>{
    if(t.type==="wallet_transfer"){
      const amount=round(t.amount);
      if(t.projectHoldingSource==="project"&&holdings[t.fromAccountId])
        holdings[t.fromAccountId]=Math.max(0,round(holdings[t.fromAccountId]-amount));
      holdings[t.toAccountId]=round((holdings[t.toAccountId]||0)+amount);
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
  const area='<div style="margin-top:9px"><button type="button" class="projectPlanAdd" onclick="event.stopPropagation();openProjectWalletTransfer(\''+clean(p.id)+'\')">+ 登记专项存放账户</button></div>'+
    '<details class="projectLedger"><summary><span>专项存放账户 · '+rows.length+' 笔记录</span></summary>'+
    '<div class="projectLedgerMeta" style="margin-top:9px">当前已登记的存放位置</div>'+situated+
    '<div class="projectLedgerMeta" style="margin-top:9px">账户转存记录</div>'+
    (history||'<div class="note">尚无账户转存记录</div>')+'</details>';
  return base+area;
};
const priorWalletHtml=Wallets.txHtml;
Wallets.txHtml=function(t){
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
removeTx=function(id){if(deleteRecord(id))return;return previousRemove(id);};
window.openProjectWalletTransfer=open;
render();
})();