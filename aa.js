/* SafeSpend AA and personal reimbursements.
   Actual cash posts to S.tx; AA records are the settlement register.
   Neither reimbursements nor unpaid promises count as new income. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const C=v=>Math.round((Number(v)||0)*100);
const R=v=>C(v)/100;
const money=v=>M(R(v));
const safe=v=>esc(String(v??""));
const id=prefix=>prefix+Date.now()+Math.random().toString(36).slice(2,8);
const entries=()=>Array.isArray(S.aaEntries)?S.aaEntries:[];
const get=aaId=>entries().find(x=>x.id===aaId);
const posted=(a,p,except="")=>R(S.tx.filter(t=>t.aaId===a.id&&t.aaPersonId===p.id&&t.id!==except&&(t.type==="aa_receive"||(t.type==="expense"&&t.aaKind==="pay"))).reduce((s,t)=>s+R(t.amount),0));
const left=(a,p,except="")=>Math.max(0,R(R(p.amount)-posted(a,p,except)));
const totalLeft=a=>a.resolution?0:R((a.people||[]).reduce((s,p)=>s+left(a,p),0));
const settled=a=>R((a.people||[]).reduce((s,p)=>s+posted(a,p),0));
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=td();
let editing="",settleEdit="",seq=0,aaHostNode=null;
const moneyBox=(val)=>money(val);
const uiStyle=[
'.aaSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}',
'.aaCell{padding:10px 8px;border:1px solid var(--line);border-radius:12px;background:#F8F9F7;min-width:0}',
'.aaCell span{font-size:10px;color:var(--muted);display:block}',
'.aaCell strong{display:block;margin-top:5px;font-size:17px;white-space:nowrap;font-variant-numeric:tabular-nums}',
'.aaCell .aaWarn{color:var(--warn)}',
'.aaRecords{margin-top:10px;border-top:1px solid var(--line);padding-top:7px}',
'.aaRecords>summary{font-size:11px;color:var(--muted);cursor:pointer;padding:4px 2px;font-weight:700}',
'.aaEntry{border-top:1px solid var(--line);padding:12px 1px}',
'.aaEntry:first-child{border-top:0}',
'.aaEntryTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
'.aaEntryTitle{font-weight:750;font-size:12px;overflow-wrap:anywhere}',
'.aaEntryMeta{font-size:10px;color:var(--muted);line-height:1.6;margin-top:4px}',
'.aaEntrySum{text-align:right;flex:none;font-size:13px;font-weight:800}',
'.aaEntryActions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:7px;margin-top:8px}',
'.aaEntryActions button{border:1px solid var(--line);border-radius:10px;background:#fff;font-size:10px;padding:6px 10px;color:var(--text)}',
'.aaEntryActions .aaPrimary{border-color:var(--accent);color:var(--accent);background:var(--accentSoft)}',
'.aaPeople{display:grid;gap:8px;margin-top:8px}',
'.aaPerson{display:grid;grid-template-columns:minmax(0,1fr) minmax(85px,.46fr) 28px;gap:7px;align-items:end}',
'.aaPerson input{height:40px;min-height:40px;font-size:14px}',
'.aaPerson button{border:0;background:#F7F8F5;border-radius:8px;height:40px;color:var(--muted)}',
'.aaFormHint{font-size:11px;color:var(--muted);line-height:1.5;margin:8px 0}',
'.aaFormHint.bad{color:var(--danger)}',
'.aaFormMode{display:grid;grid-template-columns:1fr 1fr;gap:7px}',
'.aaFormMode button{background:#fff;border:1px solid var(--line);padding:10px 5px;border-radius:10px;font-size:12px}',
'.aaFormMode .selected{background:var(--accentSoft);border-color:var(--accent);color:var(--accent);font-weight:800}',
'.aaSecondary{font-size:10px;background:#F7F8F5;border:1px solid var(--line);border-radius:10px;color:var(--accent);padding:8px 10px}',
'.aaTools{display:flex;justify-content:space-between;gap:9px;margin-top:8px}',
'.aaPeopleRowHead{font-size:11px;font-weight:750;margin:14px 0 6px}',
'.aaMainDisclosure{padding:0;overflow:hidden;border:0;box-shadow:none;border-radius:15px;background:transparent}',
'.aaUpcomingGroup{margin-top:0}',
'.aaUpcomingGroup .aaMainDisclosure>summary{padding:11px 12px}',
'.aaUpcomingGroup{border-bottom:1px solid var(--line);margin:0 0 5px}',
'.aaUpcomingGroup .aaMainTitle{font-size:12.5px}',
'.aaResolveConfirmRow{display:flex;align-items:flex-start;gap:9px;margin:8px 0 12px;padding:10px 11px;border:1px solid var(--line);border-radius:11px;font-size:11px;color:var(--text);line-height:1.6}',
'.aaResolveConfirmRow input{width:17px;height:17px;flex:none;margin-top:1px;accent-color:var(--accent)}',
'.aaResolveConfirmRow[hidden]{display:none!important}',
'.aaUpcomingGroup .aaDisclosureBody{padding:0 11px 12px}',
'.aaResolveOptions{display:grid;gap:8px;margin:12px 0}',
'.aaResolveOption{padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;text-align:left;font-size:12px;color:var(--text)}',
'.aaResolveOption.selected{border-color:var(--accent);background:var(--accentSoft);font-weight:750}',
'.aaResolveHint{font-size:11px;line-height:1.6;margin:10px 0;color:var(--muted)}',
'.aaResolveInputs{display:grid;gap:8px;margin:12px 0}',
'.aaResolveInputs[hidden],#aaResolveProjectWrap[hidden]{display:none!important}',
'.aaMainDisclosure>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 16px;list-style:none;cursor:pointer}',
'.aaMainDisclosure>summary::-webkit-details-marker{display:none}',
'.aaMainTitle{font-size:14px;font-weight:800;white-space:nowrap}',
'.aaMainSummaryRight{display:flex;gap:8px;align-items:center;min-width:0}',
'.aaMainBadges{font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.aaMainDisclosure[open] .aaMainArrow{transform:rotate(180deg)}',
'.aaMainArrow{font-size:13px;color:var(--muted);transition:transform .15s ease}',
'.aaDisclosureBody{padding:0 14px 14px}',
'.aaDisclosureTools{display:flex;justify-content:flex-end;margin-top:10px}',
'.aaDisclosureTools button{font-size:11px;padding:9px 14px;border-radius:12px}',
'.aaSpendTabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:4px;background:#F5F7F4;border-radius:13px;margin:12px 0 15px}',
'.aaSpendTabs button{border:0;border-radius:10px;padding:10px 5px;background:transparent;color:var(--muted);font-size:12px;font-weight:700}',
'.aaSpendTabs button.selected{color:var(--accent);background:#fff;box-shadow:0 2px 8px rgba(20,45,32,.08)}',
'#aaInlineHost[hidden],#spendRegularForm[hidden]{display:none!important}',
'#aaInlineHost>.sheetTitle{display:none}',
'/* Lightweight AA section: ledger-style summary, not nested statistical cards. */',
'.aaUpcomingGroup{margin:0;border-bottom:1px solid var(--line)}',
'.aaUpcomingGroup .aaMainDisclosure>summary{padding:10px 12px}',
'.aaUpcomingGroup .aaMainTitle{font-size:12px;font-weight:720;letter-spacing:0;color:var(--text)}',
'.aaUpcomingGroup .aaMainBadges{font-size:10px;font-weight:500;color:var(--muted)}',
'.aaUpcomingGroup .aaMainArrow{font-size:12px}',
'.aaUpcomingGroup .aaDisclosureBody{padding:0 12px 11px}',
'.aaInlineTotals{display:flex;align-items:center;flex-wrap:wrap;gap:6px 15px;padding:2px 1px 11px;border-bottom:1px solid var(--line)}',
'.aaInlineItem{display:inline-flex;gap:5px;align-items:baseline;white-space:nowrap;font-size:10.5px;color:var(--muted);font-weight:500}',
'.aaInlineItem strong{font-size:11.5px;font-weight:680;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap}',
'.aaInlineItem .aaWarn{color:var(--warn)}',
'.aaUpcomingGroup .aaRecords{margin-top:8px;border-top:0;padding-top:0}',
'.aaUpcomingGroup .aaRecords>summary{font-size:10.5px;font-weight:630;padding:5px 1px;color:var(--muted)}',
'.aaUpcomingGroup .aaEntry{padding:9px 0;border-top:1px solid var(--line)}',
'.aaUpcomingGroup .aaEntryTitle{font-size:11.5px;font-weight:680;line-height:1.45}',
'.aaUpcomingGroup .aaEntryMeta{font-size:10px;line-height:1.5;margin-top:3px;color:var(--muted)}',
'.aaUpcomingGroup .aaEntrySum{font-size:11.5px;font-weight:680;line-height:1.45;max-width:38%;white-space:normal}',
'.aaUpcomingGroup .aaEntryTop{gap:8px}',
'.aaUpcomingGroup .aaEntryActions{margin-top:4px;gap:3px 14px;justify-content:flex-start}',
'.aaUpcomingGroup .aaEntryActions button{border:0;background:transparent;border-radius:0;padding:5px 1px;min-height:28px;font-size:10.5px;font-weight:640;color:var(--accent)}',
'.aaUpcomingGroup .aaEntryActions button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}',
'@media(max-width:370px){.aaInlineTotals{gap:5px 10px}.aaUpcomingGroup .aaMainTitle{font-size:11.5px}.aaUpcomingGroup .aaMainBadges{font-size:9.5px}}',
'#aaInlineHost .aaFormMode{margin-bottom:5px}'
].join("\n");
function mount(){
  const style=document.createElement("style");style.textContent=uiStyle;document.head.appendChild(style);
  const target=$("upcomingBox");
  if(!target)throw Error("近期必须处理区域尚未加载");
  target.insertAdjacentHTML("beforeend",[
   '<div class="upcomingGroup aaUpcomingGroup" id="aaSection"><details class="aaMainDisclosure" id="aaMainDisclosure" data-disclosure-key="upcoming:aa">',
   '<summary class="upcomingGroupTitle disclosureSummary"><span class="upcomingGroupTitleMain">AA 与往来</span>',
   '<span class="upcomingGroupTitleRight"><span class="upcomingGroupCount" id="aaMainBadges">0 笔</span><span class="disclosureState" aria-hidden="true"></span></span></summary>',
   '<div class="aaDisclosureBody"><div class="aaInlineTotals" aria-label="AA 往来统计">',
   '<span class="aaInlineItem">待收 <strong id="aaReceivable">¥0</strong></span>',
   '<span class="aaInlineItem">待付 <strong id="aaPayable">¥0</strong></span>',
   '<span class="aaInlineItem">已结清 <strong id="aaSettled">¥0</strong></span>',
   '</div>',
   '<details class="aaRecords" id="aaOpenDetails" open><summary id="aaOpenSummary">待处理往来</summary><div id="aaOpenList"></div></details>',
   '<details class="aaRecords" id="aaClosedDetails"><summary id="aaClosedSummary">已结清</summary><div id="aaClosedList"></div></details>',
   '</div></details></div>'
  ].join(""));
  aaHostNode=$("aaSection");
  const disclosure=$("aaMainDisclosure");
  try{disclosure.open=localStorage.getItem("safespend_aa_open_v1")==="1";}catch(e){}
  disclosure.addEventListener("toggle",()=>{
    try{localStorage.setItem("safespend_aa_open_v1",disclosure.open?"1":"0");}catch(e){}
    if(typeof rememberDisclosure==="function")rememberDisclosure(disclosure,"upcoming:aa");
  });
  // All receivables and payables live in the AA group within upcoming tasks.
  // Shared Record Spending form hosts both ordinary and AA entries.
  const spendCard=$("spendSheet")?.querySelector(".sheetCard");
  const spendTitle=spendCard?.querySelector(".sheetTitle");
  if(spendCard&&spendTitle){
    const tabs=document.createElement("div");
    tabs.className="aaSpendTabs";tabs.id="aaSpendTabs";
    tabs.innerHTML='<button type="button" class="selected" id="aaSpendTabNormal">普通支出</button>'+
      '<button type="button" id="aaSpendTabSplit">AA 分摊</button>';
    spendTitle.insertAdjacentElement("afterend",tabs);
    const regular=document.createElement("div");regular.id="spendRegularForm";
    while(tabs.nextSibling)regular.appendChild(tabs.nextSibling);
    spendCard.appendChild(regular);
    const inline=document.createElement("div");inline.id="aaInlineHost";
    inline.hidden=true;spendCard.appendChild(inline);
  }
  document.body.insertAdjacentHTML("beforeend",[
   '<div class="sheet" id="aaFormSheet"><div class="sheetCard"><div class="sheetTitle" id="aaFormTitle">新增 AA 往来</div>',
   '<div class="aaFormMode"><button type="button" id="aaModeReceive">我先付款 · 待收</button><button type="button" id="aaModePay">别人付款 · 待付</button></div>',
   '<input type="hidden" id="aaDirection" value="receivable"><div class="formGrid one" style="margin-top:12px">',
   '<div><label>名称</label><input id="aaTitle" maxlength="80" placeholder="例如 三人聚餐"></div>',
   '<div><label>消费日期</label><input id="aaDate" type="date"></div>',
   '<div><label>本次总金额</label><input id="aaTotal" type="number" min="0.01" step="0.01" inputmode="decimal"></div>',
   '<div><label>我承担的金额</label><input id="aaOwn" type="number" min="0" step="0.01" inputmode="decimal"></div>',
   '<div id="aaPayerWrap" hidden><label>先付款的人</label><input id="aaPayer" placeholder="例如 朋友A" maxlength="45"></div>',
   '<div id="aaBucketWrap"><label>实际付款的预算来源</label><select id="aaBucket"><option value="safe">日常支出（基础生活优先）</option><option value="project">专项</option><option value="saving">储蓄</option></select></div>',
   '<div id="aaProjectWrap" hidden><label>对应专项</label><select id="aaProject"></select></div>',
   '<div id="aaWalletWrap"><label>实际付款渠道</label><select id="aaWallet"></select></div>',
   '<div><label>约定结清日期（选填）</label><input id="aaDue" type="date"></div>',
   '</div><div id="aaPeopleWrap"><div class="aaPeopleRowHead">其他参与者应付金额</div><div class="aaPeople" id="aaPeople"></div>',
   '<div class="aaTools"><button type="button" class="aaSecondary" id="aaAddPerson">＋ 添加参与者</button><button type="button" class="aaSecondary" id="aaEqual">平均分配剩余</button></div></div>',
   '<div class="aaFormHint" id="aaPreview"></div>',
   '<div class="actions"><button class="ghost" type="button" id="aaCancel">取消</button><button class="primary" type="button" id="aaSave">保存 AA</button></div>',
   '<button class="danger" type="button" id="aaDelete" style="display:none;width:100%;margin-top:8px">删除整笔 AA 及关联流水</button>',
   '</div></div>',
   '<div class="sheet" id="aaSettleSheet"><div class="sheetCard"><div class="sheetTitle" id="aaSettleTitle">AA 核销</div>',
   '<div class="formGrid one">',
   '<div><label>往来对象</label><select id="aaSettlePerson"></select></div>',
   '<div><label>本次核销金额</label><input id="aaSettleAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div>',
   '<div><label>实际收付日期</label><input id="aaSettleDate" type="date"></div>',
   '<div id="aaSettleBucketWrap"><label>付款预算来源</label><select id="aaSettleBucket"><option value="safe">日常支出</option><option value="project">专项</option><option value="saving">储蓄</option></select></div>',
   '<div id="aaSettleProjectWrap" hidden><label>对应专项</label><select id="aaSettleProject"></select></div>',
   '<div><label id="aaSettleWalletLabel">实际收款渠道</label><select id="aaSettleWallet"></select></div>',
   '</div><div class="aaFormHint" id="aaSettleHint"></div>',
   '<div class="actions"><button class="ghost" type="button" id="aaSettleCancel">取消</button><button class="primary" type="button" id="aaSettleSave">确认核销</button></div>',
   '</div></div>',
   '<div class="sheet" id="aaResolveSheet"><div class="sheetCard"><h2 class="sheetTitle">结束 AA · 最终处理</h2>',
   '<div class="meta" id="aaResolveTitle"></div><div class="aaResolveOptions">',
   '<button type="button" class="aaResolveOption" id="aaResolveExpense">不再 AA · 转个人独立支出</button>',
   '<button type="button" class="aaResolveOption" id="aaResolveVoid">取消交易 · 最终不支出</button></div>',
   '<div class="aaResolveInputs" id="aaResolvePayFields" hidden>',
   '<div><label>已实际补付的金额</label><input id="aaResolveAmount" type="number" min="0" step="0.01" inputmode="decimal"></div>',
   '<div><label>实际付款日期</label><input id="aaResolveDate" type="date"></div>',
   '<div><label>实际付款预算来源</label><select id="aaResolveBucket"><option value="safe">日常支出（基础生活优先）</option><option value="project">专项</option><option value="saving">储蓄</option></select></div>',
   '<div id="aaResolveProjectWrap" hidden><label>对应专项</label><select id="aaResolveProject"></select></div>',
   '<div><label>实际付款渠道</label><select id="aaResolveWallet"></select></div></div>',
   '<div class="aaResolveHint" id="aaResolveHint"></div>',
   '<label class="aaResolveConfirmRow" id="aaResolveRefundConfirmWrap" hidden><input type="checkbox" id="aaResolveRefundConfirm">',
   '<span>确认相关已付资金确实退回、已收 AA 回款也已妥善退还或清算。取消后原收付款保留为已取消历史流水，不再影响余额。</span></label>',
   '<div><label>处理备注（选填）</label><input id="aaResolveNote" maxlength="100" placeholder="例如 取消集体活动"></div>',
   '<div class="actions"><button class="ghost" type="button" id="aaResolveCancel">返回</button><button class="primary" type="button" id="aaResolveConfirm">确认处理</button></div>',
   '</div></div>'
  ].join(""));
  document.querySelectorAll("#aaFormSheet,#aaSettleSheet,#aaResolveSheet").forEach(s=>s.addEventListener("click",e=>{if(e.target===s)s.classList.remove("show");}));
  $("aaSpendTabNormal").onclick=restoreSpendingForm;
  $("aaSpendTabSplit").onclick=()=>switchToAA(true);
  $("aaModeReceive").onclick=()=>changeMode("receivable");
  $("aaModePay").onclick=()=>changeMode("payable");
  $("aaBucket").onchange=()=>{$("aaProjectWrap").hidden=$("aaBucket").value!=="project";preview();};
  $("aaSettleBucket").onchange=()=>{$("aaSettleProjectWrap").hidden=$("aaSettleBucket").value!=="project";updateSettleHint();};
  $("aaSettlePerson").onchange=()=>{const a=get($("aaSettleSheet").dataset.aaId);const p=a?.people.find(x=>x.id===$("aaSettlePerson").value);if(p)$("aaSettleAmount").value=left(a,p,settleEdit);updateSettleHint();};
  $("aaSettleAmount").oninput=updateSettleHint;
  $("aaTotal").oninput=preview;
  $("aaOwn").oninput=preview;
  $("aaAddPerson").onclick=()=>addPerson("","");
  $("aaEqual").onclick=evenSplit;
  $("aaCancel").onclick=()=>{
    if(inlineActive()){
      closeSheet("spendSheet");
      restoreSpendingForm();
    }else closeSheet("aaFormSheet");
  };
  $("aaSave").onclick=saveEntry;
  $("aaDelete").onclick=()=>deleteEntry(editing);
  $("aaSettleCancel").onclick=()=>closeSheet("aaSettleSheet");
  $("aaSettleSave").onclick=saveSettlement;
  $("aaResolveExpense").onclick=()=>chooseResolution("expense");
  $("aaResolveVoid").onclick=()=>chooseResolution("void");
  $("aaResolveBucket").onchange=()=>{$("aaResolveProjectWrap").hidden=$("aaResolveBucket").value!=="project";};
  $("aaResolveCancel").onclick=()=>closeSheet("aaResolveSheet");
  $("aaResolveConfirm").onclick=saveResolution;
  aaHostNode.addEventListener("click",e=>{
    const btn=e.target.closest("[data-aa-resolve-id]");
    if(btn)openResolution(btn.dataset.aaResolveId);
  });
  if(typeof enhanceDateInputs==="function")enhanceDateInputs();
  render();
}
function inlineActive(){return !!($("aaInlineHost")&&!$("aaInlineHost").hidden);}
function moveAAFormToInline(){
  const source=$("aaFormSheet")?.querySelector(".sheetCard");
  const inline=$("aaInlineHost");
  if(!source||!inline)return;
  while(source.firstChild)inline.appendChild(source.firstChild);
}
function restoreSpendingForm(){
  const inline=$("aaInlineHost"),source=$("aaFormSheet")?.querySelector(".sheetCard");
  if(inline&&source){
    while(inline.firstChild)source.appendChild(inline.firstChild);
    inline.hidden=true;
  }
  if($("spendRegularForm"))$("spendRegularForm").hidden=false;
  $("aaSpendTabNormal")?.classList.add("selected");
  $("aaSpendTabSplit")?.classList.remove("selected");
}
function switchToAA(copySpend=true){
  open("receivable",copySpend,"",true);
}
function showAAInline(){
  moveAAFormToInline();
  $("spendRegularForm").hidden=true;
  $("aaInlineHost").hidden=false;
  $("aaSpendTabNormal").classList.remove("selected");
  $("aaSpendTabSplit").classList.add("selected");
}
function changeMode(direction){
 $("aaDirection").value=direction;
 const receive=direction==="receivable";
 $("aaModeReceive").classList.toggle("selected",receive);
 $("aaModePay").classList.toggle("selected",!receive);
 $("aaPeopleWrap").hidden=!receive;
 $("aaPayerWrap").hidden=receive;
 $("aaBucketWrap").hidden=!receive;
 $("aaWalletWrap").hidden=!receive;
 $("aaProjectWrap").hidden=!receive||$("aaBucket").value!=="project";
 preview();
}
function peopleRows(){return [...$("aaPeople").querySelectorAll("[data-aa-person]")];}
function addPerson(name="",amount="",personId=""){
 const row=document.createElement("div");
 row.className="aaPerson";row.dataset.aaPerson=personId||id("ap");
 row.innerHTML='<div><label>姓名或称呼</label><input class="aaPersonName" maxlength="45" placeholder="朋友A"></div>'+
  '<div><label>应付金额</label><input class="aaPersonAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"></div>'+
  '<button type="button" aria-label="移除参与者">×</button>';
 row.querySelector(".aaPersonName").value=name;
 row.querySelector(".aaPersonAmount").value=amount;
 row.querySelector("button").onclick=()=>{row.remove();preview();};
 row.querySelectorAll("input").forEach(x=>x.oninput=preview);
 $("aaPeople").appendChild(row);
 preview();
}
function evenSplit(){
 const rows=peopleRows();
 if(!rows.length)return msg("先添加参与者");
 const remain=C($("aaTotal").value)-C($("aaOwn").value);
 if(remain<0)return msg("我承担的金额大于总金额");
 const each=Math.floor(remain/rows.length);
 rows.forEach((row,i)=>row.querySelector(".aaPersonAmount").value=((i===rows.length-1?remain-each*(rows.length-1):each)/100).toFixed(2));
 preview();
}
function preview(){
 const receive=$("aaDirection").value==="receivable";
 if(receive){
  const rest=R(R($("aaTotal").value)-R($("aaOwn").value)-R(peopleRows().reduce((s,row)=>s+R(row.querySelector(".aaPersonAmount").value),0)));
  $("aaPreview").textContent="他人应付共 "+money(R(R($("aaTotal").value)-R($("aaOwn").value)))+"；尚待分配 "+money(Math.abs(rest))+(rest<0?"（超出）":"")+". 实际付款先减少资金余额，收款时逐笔返还。";
  $("aaPreview").classList.toggle("bad",Math.abs(rest)>.005||R($("aaTotal").value)<R($("aaOwn").value));
 }else{
  $("aaPreview").textContent="当前仅登记待支付 "+money($("aaOwn").value)+"，核销时才产生实际支出。总金额用于记录本次集体消费。";
  $("aaPreview").classList.remove("bad");
 }
}
function fillProjects(selectId,selected=""){
 const opts=activeProjects().map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+' · 可用 '+money(projectAvail(p))+'</option>').join("");
 $(selectId).innerHTML='<option value="">选择专项</option>'+opts;
 $(selectId).value=selected;
}
function fillWallet(selectId,selected=""){
 $(selectId).innerHTML=Wallets.selectOptions(selected);
 $(selectId).value=selected;
}
function open(direction="receivable",fromSpend=false,aaId="",inline=false){
 if(!inline)restoreSpendingForm();
 const a=get(aaId);
 if(a?.resolution)return msg("此笔 AA 已结束，请在已处理记录查看");
 editing=a?.id||"";
 $("aaFormTitle").textContent=a?"编辑 AA 往来":"新增 AA 往来";
 $("aaDelete").style.display=a?"block":"none";
 const dir=a?.direction||direction;
 $("aaPeople").innerHTML="";
 $("aaTitle").value=a?.title||(fromSpend?spendNote.value:"")||"";
 $("aaDate").value=a?.date||(fromSpend?spendDate.value:td());
 $("aaDate").max=td();
 $("aaTotal").value=a?.total||(fromSpend?spendAmount.value:"");
 $("aaOwn").value=a?.own??"";
 $("aaDue").value=a?.dueDate||"";
 $("aaPayer").value=dir==="payable"?(a?.people?.[0]?.name||""):"";
 $("aaBucket").value=a?.bucket||(fromSpend?spendBucket.value:"safe");
 $("aaWallet").value="";
 fillWallet("aaWallet",a?.walletAccountId||(fromSpend?($("wallet_spend")?.value||""):(S.settings.walletSpendDefault||"")));
 fillProjects("aaProject",a?.projectId||(fromSpend&&spendBucket.value==="project"?spendRef.value:""));
 if(dir==="receivable"){
   (a?.people?.length?a.people:[{id:id("ap"),name:"",amount:""}]).forEach(p=>addPerson(p.name,p.amount,p.id));
 }
 changeMode(dir);
 if(a&&(a.direction!==dir||settled(a)>0)){
   $("aaModeReceive").disabled=true;$("aaModePay").disabled=true;
 }else{
   $("aaModeReceive").disabled=false;$("aaModePay").disabled=false;
 }
 preview();
 if(inline){
   showAAInline();
 }else{
   $("aaFormSheet").classList.add("show");
 }
 if(typeof syncDateDisplays==="function")syncDateDisplays();
}
function readForm(){
 const direction=$("aaDirection").value;
 const receive=direction==="receivable";
 const total=R($("aaTotal").value),own=R($("aaOwn").value);
 if(!$("aaTitle").value.trim())throw Error("请填写消费名称");
 if(!validDate($("aaDate").value))throw Error("消费日期需为今天或过去的日期");
 if(total<=0||own<0||own>total)throw Error("请核对总金额和本人承担金额");
 let people=[];
 if(receive){
   people=peopleRows().map(row=>({id:row.dataset.aaPerson,name:row.querySelector(".aaPersonName").value.trim(),amount:R(row.querySelector(".aaPersonAmount").value)}));
   if(!people.length||people.some(p=>!p.name||p.amount<=0))throw Error("请填写每位参与者及其应付金额");
   if(C(people.reduce((s,p)=>s+p.amount,0))+C(own)!==C(total))throw Error("本人份额与其他参与者金额合计需要等于总额");
 }else{
   if(own<=0)throw Error("请填写本人应付金额");
   const name=$("aaPayer").value.trim();
   if(!name)throw Error("请填写先付款人的姓名");
   const prior=get(editing)?.people?.[0];
   people=[{id:prior?.id||id("ap"),name,amount:own}];
 }
 const bucket=receive?$("aaBucket").value:"safe";
 const projectId=bucket==="project"?$("aaProject").value:"";
 if(receive&&bucket==="project"&&!projectId)throw Error("请选择专项");
 if(receive&&bucket==="saving"&&total>R(Math.max(0,bal().saving))&& !editing)throw Error("当前储蓄不足以承担全部垫付款");
 const prev=get(editing);
 if(prev){
  if(prev.direction!==direction&&settled(prev)>.005)throw Error("存在核销流水，当前只能修改原来的往来方向");
  for(const p of prev.people||[]){
   const was=posted(prev,p);
   const updated=people.find(x=>x.id===p.id);
   if(was>.005&&(!updated||was>updated.amount+.005))throw Error(p.name+"已有核销记录，请保留其金额并核对剩余应付");
  }
 }
 return {title:$("aaTitle").value.trim(),date:$("aaDate").value,dueDate:$("aaDue").value||"",direction,total,own,people,bucket,projectId,walletAccountId:receive?$("aaWallet").value:""};
}
function saveEntry(){
 let value;
 try{value=readForm();}catch(e){return msg(e.message);}
 const old=get(editing);
 if(old){
   const oldTx=S.tx.find(t=>t.aaId===old.id&&t.aaKind==="advance");
   const collected=S.tx.filter(t=>t.aaId===old.id&&t.type==="aa_receive");
   if(value.direction==="receivable"&&collected.some(t=>t.date<value.date))return msg("消费日期需早于或等于已核销收款日期");
   Object.assign(old,value);
   if(oldTx){
     Object.assign(oldTx,{date:value.date,amount:value.total,aaOwnShare:value.own,bucket:value.bucket,
       refId:value.projectId,projectOverrunSource:"safe",walletAccountId:value.walletAccountId,
       cycleIncomeId:cycleIncomeIdForDate(value.date),note:value.title});
   }else if(value.direction==="receivable"){
     S.tx.push(makeAdvance(old));
   }
   if(value.direction==="payable"){
     S.tx=S.tx.filter(t=>!(t.aaId===old.id&&t.aaKind==="advance"));
   }
   const opening=S.tx.find(t=>t.aaId===old.id&&t.type==="aa_open");
   if(opening){opening.date=value.date;opening.amount=value.direction==="receivable"?R(value.total-value.own):value.own;opening.note=value.title;}
 }else{
   const entry={id:id("aa"),...value,createdAt:Date.now()};
   entries().push(entry);
   S.tx.push({id:id("aaop"),date:entry.date,type:"aa_open",aaId:entry.id,amount:entry.direction==="receivable"?R(entry.total-entry.own):entry.own,note:entry.title});
   if(entry.direction==="receivable")S.tx.push(makeAdvance(entry));
 }
 const submittedInline=inlineActive();
 save();closeSheet("aaFormSheet");
 if(submittedInline)closeSheet("spendSheet");
 restoreSpendingForm();
 renderAll();
 msg(old?"AA 记录已更新":"AA 往来已记录");
}
function makeAdvance(a){
 return {id:id("e"),date:a.date,type:"expense",bucket:a.bucket,refId:a.projectId,
 amount:a.total,aaOwnShare:a.own,aaId:a.id,aaKind:"advance",cycleIncomeId:cycleIncomeIdForDate(a.date),
 walletAccountId:a.walletAccountId||"",note:a.title,projectOverrunSource:"safe"};
}
function openSettlement(aaId,txId=""){
 const a=get(aaId);if(!a)return;
 if(a.resolution)return msg("此笔 AA 已结束，不再产生收付核销");
 const t=S.tx.find(x=>x.id===txId&&x.aaId===aaId);
 settleEdit=t?.id||"";
 $("aaSettleSheet").dataset.aaId=aaId;
 const isReceive=a.direction==="receivable";
 $("aaSettleTitle").textContent=(t?"修改":"记录")+(isReceive?"AA 收款":"AA 付款")+" · "+a.title;
 const people=a.people.filter(p=>left(a,p,settleEdit)>.005||p.id===t?.aaPersonId);
 $("aaSettlePerson").innerHTML=people.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+' · 尚待 '+money(left(a,p,settleEdit))+'</option>').join("");
 if(!people.length)return msg("这笔AA已经结清");
 $("aaSettlePerson").value=t?.aaPersonId||people[0].id;
 const person=people.find(x=>x.id===$("aaSettlePerson").value);
 $("aaSettleAmount").value=t?R(t.amount):left(a,person);
 $("aaSettleDate").value=t?.date||td();
 $("aaSettleDate").max=td();
 $("aaSettleBucketWrap").hidden=isReceive;
 $("aaSettleWalletLabel").textContent=isReceive?"实际收款渠道":"实际付款渠道";
 $("aaSettleBucket").value=t?.bucket||"safe";
 fillProjects("aaSettleProject",t?.refId||"");
 $("aaSettleProjectWrap").hidden=isReceive||$("aaSettleBucket").value!=="project";
 fillWallet("aaSettleWallet",t?.walletAccountId||S.settings.walletSpendDefault||"");
 updateSettleHint();
 $("aaSettleSheet").classList.add("show");
 if(typeof syncDateDisplays==="function")syncDateDisplays();
}
function updateSettleHint(){
 const a=get($("aaSettleSheet")?.dataset.aaId);
 if(!a)return;
 const person=a.people.find(x=>x.id===$("aaSettlePerson").value);
 if(!person)return;
 const available=left(a,person,settleEdit);
 const amount=R($("aaSettleAmount").value);
 $("aaSettleHint").classList.toggle("bad",amount>available+.005||amount<=0);
 $("aaSettleHint").textContent=person.name+" 待核销 "+money(available)+"，本次 "+money(amount)+"，核销后剩余 "+money(Math.max(0,R(available-amount)))+
 (a.direction==="receivable"?"。到账资金回补原付款预算，不计为新收入。":"。只有实际付款时才会记入个人消费。");
}
function saveSettlement(){
 const a=get($("aaSettleSheet").dataset.aaId);if(!a)return;
 const p=a.people.find(x=>x.id===$("aaSettlePerson").value);if(!p)return msg("请选择往来对象");
 const amount=R($("aaSettleAmount").value),date=$("aaSettleDate").value;
 const original=S.tx.find(t=>t.id===settleEdit&&t.aaId===a.id);
 if(!validDate(date)||date<a.date)return msg("核销日期需位于消费日期至今天之间");
 if(amount<=0||amount>left(a,p,settleEdit)+.005)return msg("核销金额应在该人员待结清额度内");
 const isReceive=a.direction==="receivable";
 const bucket=isReceive?"":$("aaSettleBucket").value;
 const refId=bucket==="project"?$("aaSettleProject").value:"";
 if(!isReceive&&bucket==="project"&&!refId)return msg("请选择对应专项");
 if(!isReceive&&bucket==="saving"&&amount>Math.max(0,N(bal().saving))&&!original)return msg("当前储蓄不足以付款");
 const row=original||{id:id(isReceive?"aar":"e"),type:isReceive?"aa_receive":"expense",aaId:a.id};
 Object.assign(row,{date,amount,aaPersonId:p.id,aaPersonName:p.name,aaId:a.id,
 walletAccountId:$("aaSettleWallet").value,cycleIncomeId:cycleIncomeIdForDate(date),
 note:a.title});
 if(isReceive){
  row.type="aa_receive";row.aaKind="receive";
  delete row.bucket;delete row.refId;
 }else{
  row.type="expense";row.aaKind="pay";row.bucket=bucket;row.refId=refId;
  row.projectOverrunSource="safe";
 }
 if(!original)S.tx.push(row);
 save();closeSheet("aaSettleSheet");renderAll();
 msg(isReceive?"已核销AA收款":"已核销AA付款");
}

function openResolution(aaId){
 const a=get(aaId);
 if(!a||a.resolution)return msg("此笔 AA 已经结束");
 const paid=R(S.tx.filter(t=>t.aaId===a.id&&t.type==="expense"&&t.aaKind==="pay")
   .reduce((sum,t)=>sum+R(t.amount),0));
 const received=R(S.tx.filter(t=>t.aaId===a.id&&t.type==="aa_receive")
   .reduce((sum,t)=>sum+R(t.amount),0));
 $("aaResolveSheet").dataset.aaId=a.id;
 $("aaResolveTitle").textContent=a.title+" · 总金额 "+money(a.total)+
   (a.direction==="receivable"?" · 已收回 "+money(received):" · 已支付 "+money(paid));
 $("aaResolveAmount").value=Math.max(0,R(a.total-paid)).toFixed(2);
 $("aaResolveDate").value=td();$("aaResolveDate").max=td();
 $("aaResolveBucket").value="safe";
 fillProjects("aaResolveProject");
 fillWallet("aaResolveWallet",S.settings.walletSpendDefault||"");
 $("aaResolveNote").value="";
 $("aaResolveRefundConfirm").checked=false;
 chooseResolution("expense");
 $("aaResolveSheet").classList.add("show");
 if(typeof syncDateDisplays==="function")syncDateDisplays();
}
function chooseResolution(mode){
 const a=get($("aaResolveSheet").dataset.aaId);
 if(!a)return;
 $("aaResolveSheet").dataset.mode=mode;
 $("aaResolveExpense").classList.toggle("selected",mode==="expense");
 $("aaResolveVoid").classList.toggle("selected",mode==="void");
 $("aaResolvePayFields").hidden=mode!=="expense"||a.direction==="receivable";
 $("aaResolveProjectWrap").hidden=$("aaResolveBucket").value!=="project";
 const related=S.tx.filter(t=>t.aaId===a.id);
 const fundsMoved=related.some(t=>t.type==="expense"||t.type==="aa_receive");
 $("aaResolveRefundConfirmWrap").hidden=mode!=="void"||!fundsMoved;
 if(mode==="void"){
   const expenses=R(related.filter(t=>t.type==="expense").reduce((n,t)=>n+R(t.amount),0));
   const receipts=R(related.filter(t=>t.type==="aa_receive").reduce((n,t)=>n+R(t.amount),0));
   $("aaResolveHint").textContent="此前实际已付 "+money(expenses)+"，收回 "+money(receipts)+"。"+
      (fundsMoved?"资金确实全部退回或清算后方可取消。已取消的原收付会保留为历史记录。":
       "尚无实际付款，取消后不产生支出。");
 }else if(a.direction==="receivable"){
   $("aaResolveHint").textContent="你已支付过的整个消费仍是原来的实际支出，这里仅结束尚未收回的 AA 款项，不会再次扣款。已收到的还款继续保留在流水中。";
 }else{
   const paid=R(S.tx.filter(t=>t.aaId===a.id&&t.aaKind==="pay").reduce((n,t)=>n+R(t.amount),0));
   $("aaResolveHint").textContent="此前已付 "+money(paid)+"。若改成自己承担全单，还需实际补付 "+
     money(Math.max(0,R(a.total-paid)))+"。只有确实完成付款后才能确认，不提前记支出。";
 }
}
function saveResolution(){
 const a=get($("aaResolveSheet").dataset.aaId);
 if(!a||a.resolution)return msg("该笔 AA 已经结束");
 const mode=$("aaResolveSheet").dataset.mode;
 const note=$("aaResolveNote").value.trim();
 const related=S.tx.filter(t=>t.aaId===a.id);
 const oldPayments=R(related.filter(t=>t.type==="expense"&&t.aaKind==="pay")
   .reduce((n,t)=>n+R(t.amount),0));
 const paidBack=R(related.filter(t=>t.type==="aa_receive")
   .reduce((n,t)=>n+R(t.amount),0));
 const outstanding=R(a.people.reduce((n,p)=>n+left(a,p),0));
 let newExpense=null;
 if(mode==="expense"){
   if(a.direction==="receivable"){
     if(!related.some(t=>t.aaKind==="advance"))
       return msg("找不到已记录的原始垫付支出，请核对 AA 流水");
   }else{
     const amount=R($("aaResolveAmount").value);
     const required=Math.max(0,R(a.total-oldPayments));
     const date=$("aaResolveDate").value;
     if(!validDate(date)||date<a.date)return msg("请核对实际付款日期");
     if(Math.abs(amount-required)>.005)
       return msg("实际补付金额应为 "+money(required)+"，扣除以前已付部分");
     if(amount>.005){
       const bucket=$("aaResolveBucket").value;
       const projectId=bucket==="project"?$("aaResolveProject").value:"";
       const wallet=$("aaResolveWallet").value;
       if(bucket==="project"&&!projectId)return msg("请选择付款专项");
       if(bucket==="saving"&&amount>Math.max(0,N(bal().saving))+.005)
         return msg("可用普通储蓄不足");
       if(wallet&&!Wallets.account(wallet))return msg("请选择有效的付款渠道");
       newExpense={id:id("e"),type:"expense",date,amount,bucket,refId:projectId,
         cycleIncomeId:cycleIncomeIdForDate(date),walletAccountId:wallet,
         aaId:a.id,aaKind:"conversion",projectOverrunSource:"safe",
         note:a.title+" · 个人承担全单"};
     }
   }
   const question=a.direction==="receivable"
     ?"不再追收剩余 "+money(outstanding)+"？整笔消费原先已经扣款，此操作仅结束 AA 往来，不重复扣钱。"
     :"确认已经实际补付 "+money(newExpense?.amount||0)+"，由自己承担整笔 "+money(a.total)+"？";
   if(!confirm(question))return;
   if(newExpense)S.tx.push(newExpense);
   a.resolution="expense";
   a.resolutionAmount=a.direction==="receivable"?R(a.total-paidBack):R(a.total);
 }else if(mode==="void"){
   const realTransactions=related.filter(t=>t.type==="expense"||t.type==="aa_receive");
   if(realTransactions.length&&!$("aaResolveRefundConfirm").checked)
     return msg("请先确认原付款和回款均已实际退回或清算");
   if(!confirm(realTransactions.length
      ?"确认实际收付款已全部退款或清算完毕？将撤销 "+realTransactions.length+" 笔过账，原始内容保留为已取消历史流水。"
      :"确认取消这笔尚无实际收支的 AA 往来？"))return;
   // Full journal: retain each original record as a no-posting audit event
   // rather than physically removing it. This also undoes the original
   // pocket/project/savings and payment-channel effects with no new spending.
   const reversed=related.filter(t=>t.type==="expense"||t.type==="aa_receive");
   S.tx=S.tx.map(t=>{
     if(t.aaId!==a.id||t.type==="aa_open")return t;
     return {...t,type:"aa_void_history",
       voidOriginalType:t.type,voidOriginalKind:t.aaKind||"",
       voidOriginalAmount:R(t.amount),voidOriginalBucket:t.bucket||"",
       voidOriginalWallet:t.walletAccountId||"",
       amount:0,note:t.note||a.title};
   });
   a.voidReversedCount=reversed.length;
   a.voidReversedPayments=R(reversed.filter(t=>t.type==="expense").reduce((n,t)=>n+R(t.amount),0));
   a.voidReversedReceipts=R(reversed.filter(t=>t.type==="aa_receive").reduce((n,t)=>n+R(t.amount),0));
   a.resolution="void";
   a.resolutionAmount=0;
 }else return;
 a.resolvedAt=td();a.resolutionMemo=note;a.resolutionDueAtClose=outstanding;
 S.tx.push({id:id("aares"),type:"aa_resolution",aaId:a.id,date:td(),
   action:a.resolution,amount:0,note,summary:a.title});
 save();closeSheet("aaResolveSheet");renderAll();
 msg(mode==="expense"?"AA 已结转为个人承担":"AA 已取消，不计入实际支出");
}
function renderEntry(a){
 const isReceive=a.direction==="receivable",people=a.people||[];
 const rest=totalLeft(a);
 const lines=people.map(p=>safe(p.name)+"："+money(posted(a,p))+" / "+money(p.amount)).join("；");
 const resolutionText=a.resolution==="expense"?"已转个人支出":a.resolution==="void"?"已取消":rest>.005?(isReceive?"待收 ":"待付 ")+money(rest):"已结清";
 const outcomeMeta=a.resolution==="expense"?
    " · 最终个人承担 "+money(a.resolutionAmount)+" · 不再 AA"+(a.resolutionDueAtClose>.005?" · 放弃待结清 "+money(a.resolutionDueAtClose):""):
    a.resolution==="void"?" · 历史收付已取消 · 账务金额撤销"+(a.voidReversedCount?" · "+a.voidReversedCount+" 笔记录保留":"") :
    "";
 const buttons=a.resolution?"":rest>.005?
   '<div class="aaEntryActions"><button type="button" onclick="AA.openSettlement('+"'"+safe(a.id)+"'"+')">'+(isReceive?"收到还款":"支付核销")+'</button>'+
   '<button type="button" data-aa-resolve-id="'+safe(a.id)+'">最终处理</button>'+
   '<button type="button" onclick="AA.open('+"'"+a.direction+"','', '"+safe(a.id)+"'"+')">编辑</button></div>':
   '<div class="aaEntryActions"><button type="button" data-aa-resolve-id="'+safe(a.id)+'">最终处理</button>'+
   '<button type="button" onclick="AA.open('+"'"+a.direction+"','', '"+safe(a.id)+"'"+')">编辑</button></div>';
 return '<div class="aaEntry"><div class="aaEntryTop"><div>'+
 '<div class="aaEntryTitle">'+safe(a.title)+' · '+(isReceive?"我先付款":"别人先付款")+'</div>'+
 '<div class="aaEntryMeta">'+safe(a.date)+(a.dueDate?" · 约定 "+safe(a.dueDate):"")+
 ' · 总额 '+money(a.total)+' · 原本人份额 '+money(a.own)+'</div>'+
 '<div class="aaEntryMeta">'+lines+safe(outcomeMeta)+'</div></div>'+
 '<div class="aaEntrySum" style="color:'+(rest>.005?"var(--warn)":"var(--accent)")+'">'+resolutionText+'</div></div>'+
 buttons+'</div>';
}

function render(){
 const box=$("upcomingBox");
 if(aaHostNode&&box&&aaHostNode.parentElement!==box)box.prepend(aaHostNode);
 if(!aaHostNode||!box)return;
 const emptyNote=box.querySelector(":scope > .note");
 if(emptyNote&&emptyNote.textContent.includes("暂无近期必须处理")&&entries().length)emptyNote.remove();
 if(aaHostNode!==box.firstElementChild)box.prepend(aaHostNode);
 const openEntries=entries().filter(a=>totalLeft(a)>.005).sort((a,b)=>(a.dueDate||a.date).localeCompare(b.dueDate||b.date));
 const closedEntries=entries().filter(a=>totalLeft(a)<=.005).sort((a,b)=>b.date.localeCompare(a.date));
 const receivable=R(openEntries.filter(a=>a.direction==="receivable").reduce((s,a)=>s+totalLeft(a),0));
 const payable=R(openEntries.filter(a=>a.direction==="payable").reduce((s,a)=>s+totalLeft(a),0));
 const cleared=R(closedEntries.reduce((s,a)=>s+settled(a),0));
 $("aaReceivable").textContent=money(receivable);
 $("aaPayable").textContent=money(payable);
 $("aaSettled").textContent=money(cleared);
 $("aaMainBadges").textContent=openEntries.length+" 笔";
 $("aaReceivable").classList.toggle("aaWarn",receivable>0);
 $("aaPayable").classList.toggle("aaWarn",payable>0);
 $("aaOpenSummary").textContent="待处理 · "+openEntries.length+" 笔";
 $("aaOpenList").innerHTML=openEntries.map(renderEntry).join("")||'<div class="note" style="padding:9px 0">暂无待处理往来</div>';
 $("aaClosedDetails").style.display=closedEntries.length?"":"none";
 $("aaClosedSummary").textContent="已处理 "+closedEntries.length+" 笔";
 $("aaClosedList").innerHTML=closedEntries.map(renderEntry).join("");
 if(typeof updateDisclosureAllToggles==="function")updateDisclosureAllToggles();

}
function renderAll(){
 if(typeof window.render==="function")window.render();
 else render();
}
function deleteEntry(aaId){
 const a=get(aaId);if(!a)return;
 if(!confirm('删除「'+a.title+'」及相关的垫付、还款流水？这会重新计算全部关联余额。'))return;
 S.aaEntries=entries().filter(x=>x.id!==aaId);
 S.tx=S.tx.filter(t=>t.aaId!==aaId);
 save();closeSheet("aaFormSheet");renderAll();msg("AA 记录及关联流水已删除");
}
function openLinkedTransaction(t){
 if(!t?.aaId)return;
 if(t.type==="aa_receive"||(t.type==="expense"&&t.aaKind==="pay"))openSettlement(t.aaId,t.id);
 else open(get(t.aaId)?.direction||"receivable",false,t.aaId);
}
window.AA={mount,open,render,openSettlement,openLinkedTransaction,deleteEntry,addPerson,evenSplit,restoreSpendingForm,switchToAA};
mount();
})();
