/* Physical payment channels: separate from SafeSpend budget allocations. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const money=n=>"¥"+(Math.round((Number(n)||0)*100)/100).toLocaleString("zh-CN",{maximumFractionDigits:2});
const round=n=>Math.round((Number(n)||0)*100)/100;
const clean=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaults=[{id:"wallet_wechat",name:"微信",openingBalance:0},{id:"wallet_alipay",name:"支付宝",openingBalance:0},{id:"wallet_bank",name:"银行卡",openingBalance:0},{id:"wallet_cash",name:"现金",openingBalance:0}];
const accounts=()=>Array.isArray(S.paymentAccounts)?S.paymentAccounts:[];
const account=id=>accounts().find(a=>a.id===id);
const name=id=>account(id)?.name||"原支付渠道";
function effect(t,id){
  if(!id)return 0;
  if(t.type==="wallet_transfer")return (t.toAccountId===id?round(t.amount):0)-(t.fromAccountId===id?round(t.amount):0);
  if(t.type==="wallet_adjustment")return t.walletAccountId===id?round(t.delta):0;
  if(t.walletAccountId!==id)return 0;
  if(t.type==="income"||t.type==="credit_loan")return round(t.amount);
  if(t.type==="credit_repayment")return -round(round(t.amount)+round(t.fee));
  if(t.type==="expense"||t.type==="living_batch")return -round(t.amount);
  // Only the additional manual amount is a real payment: batch purchases
  // and ordinary daily purchases already have their own payment records.
  if(t.type==="living_settlement"&&!t.autoSettled)return -round(t.manualActualSpent===undefined?t.actualSpent:t.manualActualSpent);
  return 0;
}
function balance(id){
  const a=account(id);
  return a?round(round(a.openingBalance)+(S.tx||[]).reduce((n,t)=>n+effect(t,id),0)):0;
}
function selectOptions(selected=""){
  return '<option value="">未指定渠道</option>'+accounts().map(a=>
    '<option value="'+clean(a.id)+'" '+(selected===a.id?"selected":"")+'>'+clean(a.name)+' · '+money(balance(a.id))+'</option>').join("");
}
function selected(key){
  const id=$("wallet_"+key)?.value||"";
  if(account(id)){
    if(["income","creditLoan"].includes(key))S.settings.walletIncomeDefault=id;
    else if(["spend","bill","living","batch","creditRepay"].includes(key))S.settings.walletSpendDefault=id;
    return id;
  }
  return "";
}
function refreshSelectors(){
  ["income","spend","living","batch","bill","creditLoan","creditRepay","from","to"].forEach(key=>{
    const el=$("wallet_"+key);
    if(!el)return;
    const old=el.value;
    el.innerHTML=selectOptions(old);
    if(account(old))el.value=old;
    else if(["income","creditLoan"].includes(key))el.value=account(S.settings.walletIncomeDefault)?S.settings.walletIncomeDefault:"";
    else if(["spend","living","batch","bill","creditRepay"].includes(key))el.value=account(S.settings.walletSpendDefault)?S.settings.walletSpendDefault:"";
  });
}
const field=(id,label)=>'<div class="walletField"><label for="wallet_'+id+'">'+label+'</label><select id="wallet_'+id+'"></select></div>';
function mount(){
  const style=document.createElement("style");
  style.textContent='.walletList{display:grid;gap:2px}.walletAccountRow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid var(--line);cursor:pointer}.walletAccountRow:last-child{border-bottom:0}.walletAccountRow strong{font-size:17px;font-variant-numeric:tabular-nums}.walletTools{display:flex;gap:8px;margin-top:12px}.walletTools button{flex:1}.walletNegative{color:var(--danger)}.walletSection .walletSummary{font-weight:750;font-variant-numeric:tabular-nums}.walletField select{width:100%}';
  document.head.appendChild(style);
  $("now")?.querySelector(".grid")?.insertAdjacentHTML("afterend",
    '<div class="section walletSection"><div class="sectionTitle">支付渠道</div><div class="card">'+
    '<div class="row"><div><div class="name">实际账户余额</div><div class="meta">微信、支付宝与银行卡分别增减；预算分配按原规则计算。</div></div><strong id="walletTotal" class="walletSummary">¥0</strong></div>'+
    '<div class="walletList" id="walletAccountList" style="margin-top:9px"></div>'+
    '<div class="walletTools"><button class="ghost" id="walletAddBtn" type="button">添加渠道</button><button class="secondary" id="walletTransferBtn" type="button">渠道互转</button></div>'+
    '<div class="note" style="margin-top:9px">点击账户可校准余额。新建渠道填写当时实有资金；既往无渠道的流水保留原状。支付渠道账本与预算储蓄分开核算。</div></div></div>');
  $("incSaving")?.closest("div")?.insertAdjacentHTML("afterend",field("income","到账渠道"));
  $("spendAmount")?.closest("div")?.insertAdjacentHTML("afterend",field("spend","实际付款渠道"));
  $("livingActualSpent")?.closest("div")?.insertAdjacentHTML("afterend",field("living","额外基础生活的付款渠道"));
  $("livingBatchAmount")?.closest("div")?.insertAdjacentHTML("afterend",field("batch","实际付款渠道"));
  const markup=[
    '<div class="sheet" id="walletTransferSheet"><div class="sheetCard"><div class="sheetTitle">渠道之间转账</div><div class="formGrid one">',
    field("from","转出账户"),field("to","转入账户"),
    '<div><label>转账金额</label><input id="wallet_transferAmount" type="number" inputmode="decimal" step="0.01" min="0.01"></div>',
    '<div><label>日期</label><input id="wallet_transferDate" type="date"></div>',
    '<div><label>备注</label><input id="wallet_transferNote" placeholder="例如 微信转支付宝"></div>',
    '</div><div class="note">只影响渠道余额，当前周期的收入、消费和预计可存保持一致。</div>',
    '<div class="actions"><button class="ghost" type="button" id="wallet_transferCancel">取消</button><button class="primary" type="button" id="wallet_transferSave">确认转账</button></div></div></div>',
    '<div class="sheet" id="walletAccountSheet"><div class="sheetCard"><div class="sheetTitle" id="walletAccountTitle">支付渠道</div>',
    '<input id="wallet_accountId" type="hidden"><div class="formGrid one">',
    '<div><label>渠道名称</label><input id="wallet_accountName" maxlength="36" placeholder="例如 招商银行储蓄卡"></div>',
    '<div><label id="wallet_accountBalanceLabel">当前实际余额</label><input id="wallet_accountBalance" type="number" inputmode="decimal" step="0.01"></div>',
    '<div><label>备注</label><input id="wallet_accountNote" maxlength="80" placeholder="余额校准说明，可选"></div>',
    '</div><div class="note" id="wallet_accountHint">余额校准单独留存流水，不增加收入或消费。</div>',
    '<div class="actions"><button class="ghost" type="button" id="wallet_accountCancel">取消</button><button class="primary" type="button" id="wallet_accountSave">保存</button></div>',
    '<button class="danger" type="button" id="wallet_accountDelete" style="display:none;width:100%;margin-top:9px">删除渠道</button></div></div>',
    '<div class="sheet" id="walletBillSheet"><div class="sheetCard"><div class="sheetTitle" id="wallet_billTitle">确认账单付款</div><div class="formGrid one">',
    field("bill","实际付款渠道"),
    '</div><div class="note">账单预留是预算归属，实际支付从选择的渠道扣减一次。</div>',
    '<div class="actions"><button class="ghost" type="button" id="wallet_billCancel">取消</button><button class="primary" type="button" id="wallet_billSave">确认已支付</button></div></div></div>'
  ].join("");
  document.body.insertAdjacentHTML("beforeend",markup);
  $("walletAddBtn").onclick=()=>openAccount("");
  $("walletTransferBtn").onclick=openTransfer;
  $("wallet_accountCancel").onclick=()=>closeSheet("walletAccountSheet");
  $("wallet_transferCancel").onclick=()=>closeSheet("walletTransferSheet");
  $("wallet_billCancel").onclick=()=>closeSheet("walletBillSheet");
  $("walletAccountList").addEventListener("click",e=>{
    const row=e.target.closest("[data-wallet-id]");
    if(row)openAccount(row.dataset.walletId);
  });
  $("wallet_accountSave").onclick=saveAccount;
  $("wallet_accountDelete").onclick=deleteAccount;
  $("wallet_transferSave").onclick=saveTransfer;
  $("wallet_billSave").onclick=()=>{
    const d=$("walletBillSheet").dataset,id=selected("bill");
    closeSheet("walletBillSheet");
    markBillHandled(d.billId,d.dueDate,id);
  };
}
function render(){
  if(!$("walletAccountList"))return;
  $("walletTotal").textContent=money(accounts().reduce((sum,a)=>sum+balance(a.id),0));
  $("walletAccountList").innerHTML=accounts().map(a=>
    '<div class="walletAccountRow" data-wallet-id="'+clean(a.id)+'"><div><div class="name">'+clean(a.name)+
    '</div><div class="meta">点击查看或校准</div></div><strong class="'+(balance(a.id)<0?"walletNegative":"")+'">'+money(balance(a.id))+'</strong></div>'
  ).join("");
  refreshSelectors();
}
function openAccount(id){
  const a=account(id);
  $("wallet_accountId").value=a?.id||"";
  $("wallet_accountName").value=a?.name||"";
  $("wallet_accountBalance").value=a?balance(a.id):0;
  $("wallet_accountNote").value="";
  $("wallet_accountBalanceLabel").textContent=a?"当前实际余额（校准）":"初始实际余额";
  $("walletAccountTitle").textContent=a?"支付渠道 · "+a.name:"添加支付渠道";
  $("wallet_accountDelete").style.display=a?"block":"none";
  $("wallet_accountHint").textContent=a?"调整余额将登记一条独立校准流水。":"填写渠道登记时的实有余额，后续由交易流水自动加减。";
  $("walletAccountSheet").classList.add("show");
}
function saveAccount(){
  const id=$("wallet_accountId").value,title=$("wallet_accountName").value.trim(),raw=$("wallet_accountBalance").value;
  const target=round(Number(raw));
  if(!title||!raw||!Number.isFinite(Number(raw)))return msg("请输入名称及有效余额");
  if(id){
    const a=account(id);if(!a)return msg("渠道已不存在");
    const delta=round(target-balance(id));
    a.name=title;
    if(Math.abs(delta)>=0.005)S.tx.push({id:"wa"+Date.now(),date:td(),type:"wallet_adjustment",
      walletAccountId:id,delta,targetBalance:target,note:$("wallet_accountNote").value.trim()});
  }else S.paymentAccounts.push({id:"wallet_"+Date.now(),name:title,openingBalance:target});
  save();closeSheet("walletAccountSheet");renderAll();msg("渠道余额已更新");
}
function deleteAccount(){
  const id=$("wallet_accountId").value,a=account(id);if(!a)return;
  if(S.tx.some(t=>t.walletAccountId===id||t.fromAccountId===id||t.toAccountId===id))
    return msg("此渠道已有流水，请先变更关联流水");
  if(!confirm("删除支付渠道「"+a.name+"」？"))return;
  S.paymentAccounts=S.paymentAccounts.filter(x=>x.id!==id);
  save();closeSheet("walletAccountSheet");renderAll();msg("渠道已删除");
}
function openTransfer(){
  refreshSelectors();
  $("wallet_from").value=accounts()[0]?.id||"";
  $("wallet_to").value=accounts()[1]?.id||"";
  $("wallet_transferDate").value=td();
  $("wallet_transferDate").max=td();
  $("wallet_transferAmount").value="";
  $("wallet_transferNote").value="";
  $("walletTransferSheet").classList.add("show");
  if(typeof syncDateDisplays==="function")syncDateDisplays();
}
function saveTransfer(){
  const from=$("wallet_from").value,to=$("wallet_to").value,date=$("wallet_transferDate").value||td(),amount=round(Number($("wallet_transferAmount").value));
  if(!account(from)||!account(to)||from===to)return msg("请选择两个不同渠道");
  if(!Number.isFinite(amount)||amount<=0)return msg("请输入有效的转账金额");
  if(date>td())return msg("日期不能晚于今天");
  if(amount>balance(from)+0.005)return msg("转出账户的当前余额不足");
  S.tx.push({id:"wt"+Date.now(),type:"wallet_transfer",date,fromAccountId:from,toAccountId:to,amount,note:$("wallet_transferNote").value.trim()});
  save();closeSheet("walletTransferSheet");renderAll();msg("两个渠道余额已同步");
}
function openBillPayment(billId,dueDate){
  const b=S.bills.find(x=>x.id===billId);if(!b)return;
  $("walletBillSheet").dataset.billId=billId;
  $("walletBillSheet").dataset.dueDate=dueDate;
  $("wallet_billTitle").textContent="支付账单 · "+b.name+" · "+money(billCycleRemainingAmount(b,dueDate));
  refreshSelectors();$("walletBillSheet").classList.add("show");
}
function injectEditor(t){
  if(!["income","expense","living_batch","living_settlement"].includes(t.type))return;
  const box=$("editTxFields")?.querySelector(".formGrid");if(!box)return;
  const div=document.createElement("div");
  div.className="walletField";
  div.innerHTML='<label for="wallet_edit">实际'+(t.type==="income"?"到账":"付款")+'渠道</label><select id="wallet_edit">'+selectOptions(t.walletAccountId||"")+'</select>';
  box.appendChild(div);
}
function editSelected(t){
  const id=$("wallet_edit")?.value||"";
  t.walletAccountId=account(id)?id:"";
}
function inlineTag(t){return t?.walletAccountId&&account(t.walletAccountId)?" · "+clean(name(t.walletAccountId)):"";}
function txHtml(t){
  if(t.type==="wallet_transfer")return '<div class="item"><div class="txRow"><div class="txLeft"><div class="name">支付渠道互转 · '+clean(name(t.fromAccountId))+' → '+clean(name(t.toAccountId))+
    '</div><div class="meta">'+clean(t.date)+(t.note?" · "+clean(t.note):"")+'</div></div><div class="txRight"><div class="txAmount txMuted">'+money(t.amount)+'</div></div></div></div>';
  if(t.type==="wallet_adjustment")return '<div class="item"><div class="txRow"><div class="txLeft"><div class="name">支付渠道余额校准 · '+clean(name(t.walletAccountId))+
    '</div><div class="meta">'+clean(t.date)+' · 校准后 '+money(t.targetBalance)+(t.note?" · "+clean(t.note):"")+'</div></div><div class="txRight"><div class="txAmount txMuted">'+(t.delta>=0?"+":"−")+money(Math.abs(t.delta))+'</div></div></div></div>';
  return "";
}
function renderAll(){if(typeof window.render==="function")window.render();else render();}
mount();
window.Wallets={defaults,account,balance,selected,selectOptions,field,refreshSelectors,render,injectEditor,editSelected,inlineTag,txHtml,openBillPayment};
})();