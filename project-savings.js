/* Mutable Savings accounts: virtual earmarks over real cash held in payment channels. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const R=v=>Math.round((Number(v)||0)*100)/100;
const E=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const wallets=()=> (S.paymentAccounts||[]).filter(a=>a?.id&&!a.isProjectSubaccount);
const wallet=id=>Wallets.account(id)?.name||"待指定渠道";
const project=id=>S.projects.find(p=>p.id===id);
const nameProject=id=>project(id)?.name||"原专项";
const accounts=()=>S.variableSavingsAccounts||[];
const account=id=>accounts().find(a=>a.id===id);
const label=p=>p.savingsAccountName||((p.name||"专项").endsWith("专项")?p.name:p.name+"专项");
const defaultId=pid=>{
  const p=project(pid);
  const id=p?.defaultVariableAccountId;
  return account(id)?.id||accounts().find(a=>a.projectId===pid)?.id||accounts()[0]?.id||"";
};
function initAccounts(){
  S.variableSavingsAccounts=Array.isArray(S.variableSavingsAccounts)?S.variableSavingsAccounts:[];
  let changed=false;
  for(const p of S.projects){
    const existing=accounts().find(a=>a.id===p.defaultVariableAccountId)
      ||accounts().find(a=>a.id==="va_"+p.id)
      ||accounts().find(a=>a.projectId===p.id);
    if(existing){
      if(!p.defaultVariableAccountId){p.defaultVariableAccountId=existing.id;changed=true;}
      continue;
    }
    const id="va_"+p.id;
    S.variableSavingsAccounts.push({
      id,name:label(p),projectId:p.id,
      walletAccountId:Wallets.account(p.savingsWalletId)?p.savingsWalletId:"",
      createdAt:p.createdAt||td()
    });
    p.defaultVariableAccountId=id;
    changed=true;
  }
  if(changed)save();
}
initAccounts();
function channelOptions(selected="",empty=true){
  return (empty?'<option value="">实际渠道待指定</option>':"")+
    wallets().map(w=>'<option value="'+E(w.id)+'"'+(selected===w.id?" selected":"")+'>'+E(w.name)+'</option>').join("");
}
function variableOptions(selected="",omit=""){
  return '<option value="">选择可变动账户</option>'+
    accounts().filter(a=>!a.archived&&a.id!==omit).map(a=>'<option value="'+E(a.id)+'"'+
      (selected===a.id?" selected":"")+'>'+E(a.name)+'</option>').join("");
}
function projectOptions(selected="",positiveOnly=null){
  return '<option value="">选择专项</option>'+S.projects
    .filter(p=>!p.archived&&(positiveOnly===null||positiveOnly[p.id]>.005))
    .map(p=>'<option value="'+E(p.id)+'"'+(selected===p.id?" selected":"")+'>'+E(p.name)+'</option>').join("");
}
function allocate(pool,owner,id,amount){
  const n=R(amount);
  if(n<=.005||!id||!account(id))return;
  const row=pool[owner]||(pool[owner]={});
  row[id]=R((row[id]||0)+n);
}
function consume(pool,owner,id,amount){
  const row=pool[owner]||(pool[owner]={});
  let remaining=Math.max(0,R(amount)),taken=0;
  const choices=id?[id,...Object.keys(row).filter(x=>x!==id)]:Object.keys(row);
  for(const a of choices){
    if(remaining<=.005)break;
    const current=Math.max(0,R(row[a]));
    const used=Math.min(current,remaining);
    row[a]=R(current-used);remaining=R(remaining-used);taken=R(taken+used);
  }
  return taken;
}
function orderedEvents(){
  return (S.tx||[]).filter(t=>!t.date||t.date<=td()).slice().sort((a,b)=>{
    if(String(a.date||"")!==String(b.date||""))return String(a.date||"").localeCompare(String(b.date||""));
    if(a.type==="income"&&b.type!=="income")return -1;
    if(b.type==="income"&&a.type!=="income")return 1;
    return txStamp(a)-txStamp(b)||String(a.id).localeCompare(String(b.id));
  });
}
function snapshot(){
  const funds={},light={},fallback={};
  S.projects.forEach(p=>{
    const id=defaultId(p.id);
    if(p.initialFund>0)allocate(funds,p.id,id,p.initialFund);
  });
  for(const t of orderedEvents()){
    const amount=R(t.amount);
    if(t.type==="income"){
      (t.alloc?.projects||[]).forEach(x=>
        allocate(funds,x.projectId,x.holdingVariableAccountId||defaultId(x.projectId),R(x.amount)));
      (t.alloc?.lightPlans||[]).forEach(x=>{
        if(x.holdingVariableAccountId)allocate(light,x.lightPlanId,x.holdingVariableAccountId,R(x.amount));
      });
    }else if((t.type==="pocket_to_project"||t.type==="saving_to_project")&&t.projectId){
      allocate(funds,t.projectId,t.holdingVariableAccountId||defaultId(t.projectId),amount);
    }else if(t.type==="wallet_transfer"&&t.projectHoldingSource==="project"&&t.fromVariableAccountId&&t.toVariableAccountId){
      // Moving the same fund between Savings accounts preserves the project budget.
      const moved=consume(funds,t.projectId,t.fromVariableAccountId,amount);
      allocate(funds,t.projectId,t.toVariableAccountId,moved);
    }else if(t.type==="project_transfer"){
      const moved=consume(funds,t.fromProjectId,t.fromVariableAccountId,amount);
      if(t.toProjectId&&t.toProjectId!=="__saving__")
        allocate(funds,t.toProjectId,t.toVariableAccountId||defaultId(t.toProjectId),moved);
    }else if(t.type==="project_settlement"&&t.projectId){
      consume(funds,t.projectId,t.fromVariableAccountId,amount);
    }else if(t.type==="expense"&&t.bucket==="project"&&t.refId&&!t.projectBorrow){
      consume(funds,t.refId,t.holdingVariableAccountId,amount);
    }else if(t.type==="expense"&&t.projectBorrow&&t.refId){
      consume(funds,t.refId,t.holdingVariableAccountId,amount);
    }else if(t.type==="expense"&&t.personalPlannedExpenseId){
      consume(light,t.personalPlannedExpenseId,t.holdingVariableAccountId,amount);
    }
  }
  const posted=accounting();
  // The existing accounting engine owns project advances, reimbursements and AA offsets.
  // Align every project's account allocation with its authoritative remaining budget.
  S.projects.forEach(p=>{
    const desired=Math.max(0,R(posted.projects[p.id]));
    const row=funds[p.id]||(funds[p.id]={});
    const sum=R(Object.values(row).reduce((n,x)=>n+R(x),0));
    if(sum>desired+.005)consume(funds,p.id,"",R(sum-desired));
    else if(desired>sum+.005)allocate(funds,p.id,defaultId(p.id),R(desired-sum));
  });
  Object.keys(light).forEach(id=>{
    const remaining=Math.max(0,R(lightPlanReservedRemaining(id)));
    const row=light[id];
    const sum=R(Object.values(row).reduce((n,x)=>n+R(x),0));
    if(sum>remaining+.005)consume(light,id,"",R(sum-remaining));
  });
  const totals={},byAccount={};
  accounts().forEach(a=>{totals[a.id]=0;byAccount[a.id]={projects:{},light:{}};});
  Object.entries(funds).forEach(([pid,row])=>Object.entries(row).forEach(([id,n])=>{
    if(R(n)<=.005||!byAccount[id])return;
    totals[id]=R(totals[id]+R(n));
    byAccount[id].projects[pid]=R((byAccount[id].projects[pid]||0)+R(n));
  }));
  Object.entries(light).forEach(([lid,row])=>Object.entries(row).forEach(([id,n])=>{
    if(R(n)<=.005||!byAccount[id])return;
    totals[id]=R(totals[id]+R(n));
    byAccount[id].light[lid]=R((byAccount[id].light[lid]||0)+R(n));
  }));
  return {funds,light,totals,byAccount};
}
function historyFor(a){
  const rows=[];
  for(const t of S.tx||[]){
    if(t.type==="income"){
      (t.alloc?.projects||[]).filter(x=>(x.holdingVariableAccountId||defaultId(x.projectId))===a.id)
        .forEach(x=>rows.push({date:t.date,text:x.repayment?"专项补回":"收入分配",
          amount:R(x.amount),meta:nameProject(x.projectId)}));
      (t.alloc?.lightPlans||[]).filter(x=>x.holdingVariableAccountId===a.id)
        .forEach(x=>rows.push({date:t.date,text:"近期计划预留",amount:R(x.amount),
          meta:(S.plannedExpenses||[]).find(z=>z.id===x.lightPlanId)?.name||""}));
    }else if((t.type==="pocket_to_project"||t.type==="saving_to_project")
      &&(t.holdingVariableAccountId||defaultId(t.projectId))===a.id){
      rows.push({date:t.date,text:t.type==="saving_to_project"?"普通储蓄转入":"零花钱转入",
        amount:R(t.amount),meta:nameProject(t.projectId)});
    }else if(t.type==="wallet_transfer"&&t.projectHoldingSource==="project"
      &&(t.fromVariableAccountId===a.id||t.toVariableAccountId===a.id)){
      rows.push({date:t.date,text:t.toVariableAccountId===a.id?"账户间调入":"账户间调出",
        amount:(t.toVariableAccountId===a.id?1:-1)*R(t.amount),
        meta:nameProject(t.projectId)});
    }else if(t.type==="project_transfer"
      &&(t.fromVariableAccountId===a.id||t.toVariableAccountId===a.id)){
      rows.push({date:t.date,text:t.fromVariableAccountId===a.id?"专项转出":"专项调入",
        amount:(t.fromVariableAccountId===a.id?-1:1)*R(t.amount),meta:t.note||""});
    }
  }
  return rows.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,20);
}
const section=document.createElement("div");
section.className="section projectSavingsSection";
section.innerHTML='<div class="sectionHeader savingsFoldSectionHeader">'+
 '<div class="sectionTitle">可变动账户</div><div class="savingsSectionControls">'+
 '<strong class="savingsSectionTotal" id="projectSavingsTotal">¥0</strong>'+
 '<button class="sectionToggle" type="button" id="projectSavingsAdd">新增账户</button>'+
 '<button class="savingsSectionFoldButton" type="button" id="projectSavingsFold" aria-expanded="true" aria-controls="projectSavingsBody"><span class="savingsFoldChevron"></span></button>'+
 '</div></div><div class="savingsFoldSectionBody" id="projectSavingsBody">'+
 '<div class="card"><div class="shortAccountList" id="projectSavingsList"></div></div></div>';
const bank=$("bankSavingSectionTotal")?.closest(".section");
if(bank)bank.parentElement.insertBefore(section,bank);else $("savings")?.appendChild(section);
const style=document.createElement("style");
style.textContent= [
 '.projectSavingsSection .shortAccountLine{margin:0}',
 '.projectSavingsSection .shortAccountLineSub{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}',
 '.projectSavingsSection .varBtns{display:flex;gap:5px;flex-wrap:wrap}',
 '.projectSavingsSection .varBtns button{font-size:11px;padding:6px 9px}',
 '.projectSavingsSection .varBreakdown{padding:8px 0;margin:7px 0;border-top:1px solid var(--line)}',
 '.projectSavingsSection .varRow{display:flex;justify-content:space-between;gap:8px;padding:5px 1px;font-size:12px}',
 '.projectSavingsSection .varHistory{border-top:1px solid var(--line);padding-top:8px}',
 '.projectSavingsSection .varHistory summary{font-size:12px;color:var(--muted);cursor:pointer}',
 '.projectSavingsSection .varHistRow{display:flex;justify-content:space-between;gap:9px;padding:8px 2px;border-bottom:1px solid var(--line);font-size:12px}',
 '.projectSavingsSection .varHistRow .meta{font-size:10px;margin-top:3px}',
 '.projectSavingsSection .varHistRow strong{white-space:nowrap;font-variant-numeric:tabular-nums}'
].join("");
document.head.appendChild(style);
function refresh(){
  const data=snapshot(),list=$("projectSavingsList");
  if(!list)return;
  $("projectSavingsTotal").textContent=M(R(Object.values(data.totals).reduce((a,b)=>a+R(b),0)));
  list.innerHTML=accounts().length?accounts().filter(a=>!a.archived||data.totals[a.id]>.005).map(a=>{
    const count=R(data.totals[a.id]),rows=data.byAccount[a.id]||{projects:{},light:{}};
    const belonging=Object.entries(rows.projects).map(([id,value])=>
      '<div class="varRow"><span>'+E(nameProject(id))+'</span><strong>'+M(value)+'</strong></div>').join("")+
      Object.entries(rows.light).map(([id,value])=>
      '<div class="varRow"><span>'+E((S.plannedExpenses||[]).find(x=>x.id===id)?.name||"近期计划")+'</span><strong>'+M(value)+'</strong></div>').join("");
    const detail=historyFor(a).map(x=>'<div class="varHistRow"><div><div>'+E(x.text)+'</div><div class="meta">'+E(x.date||"")+(x.meta?' · '+E(x.meta):"")+'</div></div><strong>'+
      (x.amount>0?"+":x.amount<0?"−":"")+M(Math.abs(x.amount))+'</strong></div>').join("");
    const walletText=a.walletAccountId?wallet(a.walletAccountId):"待指定渠道";
    return '<details class="shortAccountLine shortAccountFold" data-project-saving="'+E(a.id)+'"'+
      (readSavingFold("variable:"+a.id,false)?" open":"")+'>'+
      '<summary class="shortAccountLineTop savingsAccountFoldSummary"><span class="name">'+E(a.name)+'</span>'+
      '<span class="savingsAccountSummaryEnd"><strong>'+M(count)+'</strong><span class="savingsFoldChevron"></span></span></summary>'+
      '<div class="shortAccountLineSub"><span class="small">实际资金渠道：'+E(walletText)+'</span>'+
      '<span class="varBtns"><button data-op="in" data-id="'+E(a.id)+'">转入</button>'+
      '<button data-op="out" data-id="'+E(a.id)+'">转出</button>'+
      '<button data-op="move" data-id="'+E(a.id)+'">转存账户</button>'+
      '<button data-op="edit" data-id="'+E(a.id)+'">编辑</button></span></div>'+
      '<div class="varBreakdown">'+(belonging||'<div class="note">当前余额 ¥0</div>')+'</div>'+
      '<details class="varHistory"><summary>变动记录</summary>'+(detail||'<div class="note">暂无记录</div>')+'</details></details>';
  }).join(""):'<div class="note">新增可变动账户后，可以在收入分配中选择存入。</div>';
}
const modal=document.createElement("div");
modal.className="sheet";modal.id="projectSavingsSheet";
modal.innerHTML='<div class="sheetCard"><div class="sheetTitle" id="projectSavingSheetTitle">可变动账户</div>'+
 '<input type="hidden" id="projectSavingId"><input type="hidden" id="projectSavingMode">'+
 '<div class="formGrid one">'+
 '<div id="projectSavingNameRow"><label>账户名称</label><input id="projectSavingName" maxlength="36"></div>'+
 '<div id="projectSavingFromRow"><label id="projectSavingFromLabel">实际转出渠道</label><select id="projectSavingFrom"></select></div>'+
 '<div id="projectSavingToRow"><label id="projectSavingToLabel">实际存放的支付渠道</label><select id="projectSavingTo"></select></div>'+
 '<div id="projectSavingVariableRow"><label>转入哪个可变动账户</label><select id="projectSavingVariable"></select></div>'+
 '<div id="projectSavingProjectRow"><label>资金所属专项</label><select id="projectSavingProject"></select></div>'+
 '<div id="projectSavingFundingRow"><label>资金来源</label><select id="projectSavingFunding"><option value="safe">零花钱</option><option value="saving">普通储蓄</option></select></div>'+
 '<div id="projectSavingAmountRow"><label>金额</label><input id="projectSavingAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div>'+
 '<div class="note" id="projectSavingPreview"></div></div>'+
 '<div class="actions"><button type="button" class="ghost" id="projectSavingCancel">取消</button>'+
 '<button type="button" class="primary" id="projectSavingConfirm">确认</button></div></div>';
document.body.appendChild(modal);
const newId=prefix=>prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function selectField(id,value){
  const el=$(id);if(!el)return;
  if([...el.options].some(o=>o.value===value))el.value=value;
}
function open(mode,id=""){
  const a=account(id);
  if(mode!=="new"&&!a)return msg("账户记录已更新，请重新打开");
  if(a?.archived&&mode!=="edit")return msg("请先恢复已归档账户");
  $("projectSavingMode").value=mode;$("projectSavingId").value=id;
  $("projectSavingName").value=a?.name||"";
  $("projectSavingAmount").value="";
  $("projectSavingFunding").value="safe";
  const source=S.settings?.walletSpendDefault||wallets()[0]?.id||"";
  const holder=a?.walletAccountId||source;
  $("projectSavingFrom").innerHTML=channelOptions(source);
  $("projectSavingTo").innerHTML=channelOptions(holder);
  $("projectSavingVariable").innerHTML=variableOptions("",id);
  const balances=snapshot().byAccount[id]?.projects||{};
  $("projectSavingProject").innerHTML=projectOptions(a?.projectId||"",mode==="out"||mode==="move"?balances:null);
  selectField("projectSavingFrom",mode==="in"?source:holder);
  selectField("projectSavingTo",holder);
  selectField("projectSavingProject",a?.projectId||Object.keys(balances)[0]||"");
  $("projectSavingNameRow").hidden=!(mode==="new"||mode==="edit");
  $("projectSavingFromRow").hidden=(mode==="new"||mode==="edit");
  $("projectSavingToRow").hidden=mode==="out"||mode==="move";
  $("projectSavingVariableRow").hidden=mode!=="move";
  $("projectSavingProjectRow").hidden=mode==="new"||mode==="edit";
  $("projectSavingFundingRow").hidden=mode!=="in";
  $("projectSavingAmountRow").hidden=mode==="new"||mode==="edit";
  $("projectSavingToLabel").textContent=mode==="in"?"账户所在支付渠道":"账户默认存放渠道";
  $("projectSavingFromLabel").textContent=mode==="out"
    ?"转出后普通储蓄存放的支付渠道":"资金实际转出渠道";
  $("projectSavingSheetTitle").textContent=({new:"新增可变动账户",edit:"编辑可变动账户",
    in:"转入可变动账户",out:"转出到普通储蓄",move:"可变动账户间转存"})[mode];
  $("projectSavingConfirm").textContent=mode==="new"||mode==="edit"?"保存账户":"确认变动";
  $("projectSavingPreview").textContent="";
  modal.classList.add("show");
}
function sourceWalletAmount(accountId,day=td()){return Math.max(0,R(Wallets.balanceAt(accountId,day)))}
function record(){
  const mode=$("projectSavingMode").value,a=account($("projectSavingId").value);
  const amount=R($("projectSavingAmount").value),from=$("projectSavingFrom").value;
  const destination=$("projectSavingTo").value;
  if(mode==="new"){
    const name=$("projectSavingName").value.trim();
    if(!name)return msg("请输入账户名称");
    if(!Wallets.account(destination))return msg("请选择账户所在的实际支付渠道");
    S.variableSavingsAccounts.push({id:newId("va_"),name,walletAccountId:destination,
      createdAt:td(),projectId:""});
    save();closeSheet("projectSavingsSheet");render();return msg("可变动账户已添加");
  }
  if(!a)return msg("账户已更新，请重新打开");
  if(mode==="edit"){
    const name=$("projectSavingName").value.trim();
    if(!name)return msg("请输入账户名称");
    if(!Wallets.account(destination))return msg("请选择实际支付渠道");
    a.name=name;a.walletAccountId=destination;
    save();closeSheet("projectSavingsSheet");render();return msg("可变动账户已更新");
  }
  if(amount<=0)return msg("请输入有效金额");
  const pid=$("projectSavingProject").value;
  if(!project(pid))return msg("请选择资金所属专项");
  if(!Wallets.account(from))return msg("请选择实际转出渠道");
  const accountSnapshot=snapshot(),held=R(accountSnapshot.byAccount[a.id]?.projects[pid]||0);
  if((mode==="out"||mode==="move")&&amount>held+.005)return msg("该账户对应专项的可转余额不足");
  const oldTx=S.tx;
  const oldShares=JSON.stringify(S.settings.ordinaryWalletShares||{});
  const oldAbsorbed=JSON.stringify(S.settings.ordinaryWalletAbsorbedMovements||{});
  const revert=()=>{
    S.tx=oldTx;
    S.settings.ordinaryWalletShares=JSON.parse(oldShares);
    S.settings.ordinaryWalletAbsorbedMovements=JSON.parse(oldAbsorbed);
  };
  let toWallet=a.walletAccountId||from,txRows=[];
  const dt=td();
  if(mode==="in"){
    const kind=$("projectSavingFunding").value;
    const available=kind==="saving"?Math.max(0,R(accounting().saving)):Math.max(0,R(bal().safe));
    if(amount>available+.005)return msg("选定资金池可用余额不足");
    if(amount>sourceWalletAmount(from)+.005)return msg("来源支付渠道余额不足");
    if(kind==="safe"){
      const snapshotBefore=snapshot();
      const alreadyReserved=accounts().filter(x=>x.walletAccountId===from)
        .reduce((sum,x)=>sum+R(snapshotBefore.totals[x.id]),0);
      const ordinary=R(ordinaryWalletDistribution().allocation[from]);
      const availableInWallet=Math.max(0,R(sourceWalletAmount(from)-alreadyReserved-ordinary));
      if(amount>availableInWallet+.005)
        return msg("该支付渠道的自由资金不足，请核对已分配到储蓄账户的金额");
    }
    if(kind==="saving"){
      const dist=ordinaryWalletDistribution();
      if(amount>R(dist.allocation[from])+.005)return msg("来源渠道普通储蓄余额不足");
      S.settings.ordinaryWalletShares={...dist.allocation};
      const absorbed=S.settings.ordinaryWalletAbsorbedMovements||(S.settings.ordinaryWalletAbsorbedMovements={});
      (dist.inferredMovementIds||[]).forEach(id=>{absorbed[id]=true;});
      S.settings.ordinaryWalletShares[from]=R(R(S.settings.ordinaryWalletShares[from])-amount);
    }
    const funding={id:newId("vsf"),type:kind==="saving"?"saving_to_project":"pocket_to_project",
      date:dt,amount,projectId:pid,holdingVariableAccountId:a.id,
      projectHoldingAccountId:toWallet,walletFromAccountId:from,
      cycleIncomeId:cycleIncomeIdForDate(dt),isVariableSavingEntry:true,
      note:"转入可变动账户 · "+a.name};
    txRows.push(funding);
    if(from!==toWallet){
      const movement={id:newId("vsw"),type:"wallet_transfer",date:dt,amount,
        projectId:pid,projectHoldingSource:kind,fromAccountId:from,toAccountId:toWallet,
        linkedProjectWalletFundingId:funding.id,isVariableSavingEntry:true,note:"转存至 "+a.name};
      funding.linkedProjectWalletTxId=movement.id;
      txRows.push(movement);
    }
  }else if(mode==="out"){
    toWallet=from;
    const home=a.walletAccountId||from;
    txRows.push({id:newId("vso"),type:"project_transfer",date:dt,amount,
      fromProjectId:pid,fromVariableAccountId:a.id,toProjectId:"__saving__",
      savingDestination:"ordinary",cycleIncomeId:cycleIncomeIdForDate(dt),
      isVariableSavingEntry:true,note:"可变动账户转出 · "+a.name});
    if(home!==toWallet){
      txRows.push({id:newId("vsw"),type:"wallet_transfer",date:dt,amount,
        fromAccountId:home,toAccountId:toWallet,projectId:pid,
        projectHoldingSource:"project_out",isVariableSavingEntry:true,note:"专项转出 · "+a.name});
    }
  }else if(mode==="move"){
    const to=account($("projectSavingVariable").value);
    if(!to||to.id===a.id)return msg("请选择另一个可变动账户");
    const original=a.walletAccountId||from,target=to.walletAccountId||from;
    txRows.push({id:newId("vsm"),type:"wallet_transfer",date:dt,amount,projectId:pid,
      projectHoldingSource:"project",fromVariableAccountId:a.id,toVariableAccountId:to.id,
      fromAccountId:original,toAccountId:target,isVariableSavingEntry:true,
      note:"可变动账户内部转存 · "+a.name+" → "+to.name});
  }else return;
  const beforeBudget=accounting();
  const walletBefore=wallets().map(w=>({id:w.id,amount:Wallets.balance(w.id)}));
  S.tx=[...S.tx,...txRows];
  const afterBudget=accounting();
  const walletValid=walletBefore.every(w=>Wallets.balance(w.id)>=Math.min(0,w.amount)-.005);
  const budgetValid=afterBudget.projects[pid]>=-.005
    &&afterBudget.saving>=Math.min(0,beforeBudget.saving)-.005
    &&afterBudget.raw.safe>=Math.min(0,beforeBudget.raw.safe)-.005;
  if(!walletValid||!budgetValid){revert();return msg("本次变动导致支付渠道或资金池余额不足");}
  if(mode==="out"){
    const dist=ordinaryWalletDistribution();
    S.settings.ordinaryWalletShares={...dist.allocation};
    const reserved=reserveOrdinaryWalletShare(toWallet,amount);
    if(reserved.amount+0.005<amount){revert();return msg("普通储蓄账户分配校验失败");}
  }
  save();closeSheet("projectSavingsSheet");render();msg("可变动账户和实际支付渠道已同步更新");
}
const prev=renderSavings;
renderSavings=function(){prev();refresh();};
const removeProject=removeProjectTimelineTx;
removeProjectTimelineTx=function(id){
  const item=S.tx.find(t=>t.id===id);
  if(item?.isVariableSavingEntry||item?.linkedProjectWalletFundingId||item?.linkedProjectWalletTxId)
    return msg("关联流水请在储蓄页通过反向变动核对");
  return removeProject(id);
};
const oldWalletTxHtml=Wallets.txHtml;
Wallets.txHtml=function(t){
  if(t?.type==="wallet_transfer"&&t.fromVariableAccountId&&t.toVariableAccountId){
    return '<div class="item"><div class="txRow"><div class="txLeft"><div class="name">可变动账户转存</div>'+
      '<div class="meta">'+E(t.date)+' · '+E(account(t.fromVariableAccountId)?.name||"原账户")+
      ' → '+E(account(t.toVariableAccountId)?.name||"目标账户")+
      ' · '+E(nameProject(t.projectId))+'</div></div><div class="txRight"><div class="txAmount txMuted">'+M(t.amount)+'</div></div></div></div>';
  }
  return oldWalletTxHtml(t);
};
$("projectSavingsAdd").onclick=()=>open("new");
$("projectSavingCancel").onclick=()=>closeSheet("projectSavingsSheet");
$("projectSavingConfirm").onclick=record;
$("projectSavingsFold").onclick=()=>{
  const body=$("projectSavingsBody"),collapsed=!body.hidden;
  body.hidden=collapsed;$("projectSavingsFold").setAttribute("aria-expanded",String(!collapsed));
  if(typeof writeSavingFold==="function")writeSavingFold("section:variable",!collapsed);
};
$("projectSavingsList").addEventListener("click",e=>{
  const btn=e.target.closest("button[data-op]");if(!btn)return;
  e.preventDefault();e.stopPropagation();open(btn.dataset.op,btn.dataset.id);
});
$("projectSavingsList").addEventListener("toggle",e=>{
  if(e.target.matches?.("details[data-project-saving]")&&typeof writeSavingFold==="function")
    writeSavingFold("variable:"+e.target.dataset.projectSaving,e.target.open);
},true);
const folded=typeof readSavingFold==="function"?readSavingFold("section:variable",true):true;
$("projectSavingsBody").hidden=!folded;
$("projectSavingsFold").setAttribute("aria-expanded",String(folded));
renderSavings();
})();