// board: the whole system on one page — a single HTML file with no dependencies and no server.
// Items are drawn as pipelines of steps (who ran, on which model, how it ended, where work went
// back), next to the reasons to trust the result: the rules each item met, the evidence behind
// them, the team's track record, cost, model comparison, schedule and the hot spots of the code.
// The page is a snapshot: regenerate it whenever you want to look again.
import { itemState } from './flow.mjs';
import { evaluate, trust } from './govern.mjs';
import { noticed, silentPasses } from './tension.mjs';
import { closedItems, minutesBetween, ofItem, openItems } from './journal.mjs';
import { anomalies } from './observe.mjs';

/**
 * How many proof packs a witness reproduced, and how (plan 2.4): `independent` — another machine and
 * environment, such as CI; `rerun` — the same machine again. Counted per item, from the last pack made.
 */
export function witnessed(events) {
    const packs = new Map();
    for (const e of events) {
        if (e.kind === 'proof.create' && e.item) packs.set(e.item, { digest: e.digest, level: null });
        if (e.kind === 'proof.witness' && packs.has(e.item) && e.level && !(e.differs ?? []).length) {
            const p = packs.get(e.item);
            if (p.level !== 'independent') p.level = e.level;
        }
    }
    const all = [...packs.values()];
    return { packs: all.length, independent: all.filter((p) => p.level === 'independent').length, rerun: all.filter((p) => p.level === 'rerun').length };
}

/**
 * The quality loop in five numbers (plan 2.8, strategic plan 9.3):
 *  K1 criteria with a tool's result ÷ criteria with a check (below 100 %, PASS should not be possible)
 *  K2 closed items accepted without a return to an agent
 *  K3 defects after acceptance ÷ closed items
 *  K4 median steps between the source of a finding and where it was found
 *  K5 sources found by measurement or by the chain ÷ all sources
 */
export function qualityLoop(events) {
    const closed = closedItems(events);
    const byItem = new Map();
    for (const e of events) if (e.item) (byItem.get(e.item) ?? byItem.set(e.item, []).get(e.item)).push(e);
    let withCheck = 0;
    let measured = 0;
    const short = [];
    for (const [item, ev] of byItem) {
        const list = ev.filter((e) => e.kind === 'criterion').at(-1)?.criteria;
        if (!list) continue;
        const names = new Set(ev.filter((e) => e.kind === 'evidence').map((e) => e.name));
        const tools = list.map((c) => String(c.check ?? '').trim()).filter((c) => c && !c.startsWith('[')).map((c) => c.split(/\s+/)[0]);
        const got = tools.filter((t) => names.has(t)).length;
        withCheck += tools.length;
        measured += got;
        if (got < tools.length) short.push(item);
    }
    const origins = events.filter((e) => e.kind === 'origin');
    let late = 0;
    let started = 0;
    for (const ev of byItem.values()) {
        const first = ev.find((e) => e.kind === 'item.open')?.steps?.[0]?.id;
        if (!ev.some((e) => e.kind === 'step.start' && e.step !== first)) continue;
        started++;
        late += ev.filter((e) => e.kind === 'step.end' && e.status === 'NEEDS-USER' && e.step !== first).length;
    }
    const reworks = events.filter((e) => e.kind === 'verdict' && e.verdict === 'REWORK');
    const fixes = reworks.flatMap((v) => v.fixes ?? []);
    const assumed = fixes.filter((f) => f.mode === 'unasked-assumption').length;
    const briefReturns = reworks.filter((v) => origins.some((o) => o.item === v.item && o.from === 'return' && String(o.cause).startsWith('brief'))).length;
    const delays = origins.map((o) => o.delay).filter((d) => typeof d === 'number').sort((a, b) => a - b);
    const ratio = (a, b) => (b ? +(a / b).toFixed(3) : null);
    return {
        K1: { value: ratio(measured, withCheck), measured, withCheck, short },
        K2: { value: ratio(closed.filter((i) => !(byItem.get(i) ?? []).some((e) => e.kind === 'verdict' && e.verdict === 'REWORK')).length, closed.length), closed: closed.length },
        K3: { value: ratio(closed.filter((i) => (byItem.get(i) ?? []).some((e) => e.kind === 'escape')).length, closed.length), closed: closed.length },
        K4: { value: delays.length ? delays[Math.floor((delays.length - 1) / 2)] : null, n: delays.length },
        K5: { value: ratio(origins.filter((o) => o.method === 'measured' || o.method === 'chain').length, origins.length), n: origins.length },
        // understanding (plan 2.9): questions once the work began, silent assumptions, and returns that were the brief's
        U6: { value: ratio(late, started), questions: late, items: started },
        U7: { value: ratio(assumed, fixes.length), n: fixes.length },
        U8: { value: ratio(briefReturns, reworks.length), n: reworks.length },
    };
}

export function boardData(events, { limit = 14, policy, checks, project, cost = null, matrix = [], plan = null, atlas = null, beliefs = [], skills = null, title = 'facetkit', openedBy = () => [] } = {}) {
    const ids = [...openItems(events), ...closedItems(events).reverse()].slice(0, limit);
    const items = ids.map((id) => {
        const state = itemState(events, id);
        const mine = ofItem(events, id);
        const e = evaluate(events, id, { policy, checks, project });
        const reworkTo = new Set(mine.filter((x) => x.kind === 'verdict' && x.verdict === 'REWORK').flatMap((v) => (v.fixes ?? []).map((f) => f.agent)));
        return {
            id,
            tier: state.tier,
            closed: state.closed,
            holder: mine.find((x) => x.kind === 'item.open')?.w ?? null,
            level: e.level,
            label: e.label,
            cycles: state.cycles,
            rules: e.results.map(({ id: rule, level, pass, got, why, waived }) => ({ rule, level, pass, got, why, waived })),
            evidence: Object.entries(e.evidence).map(([name, v]) => ({ name, ok: v.ok, value: v.value, stale: v.stale })),
            odd: anomalies(events, id).map((a) => `${a.kind} · ${a.step}: ${a.why}`),
            steps: state.steps.map((s) => ({ id: s.id, agent: s.agent ?? (s.gates ? (s.agents ?? []).join(' + ') : 'you'), mode: s.mode ?? null, status: s.status, model: s.model ?? null, attempts: s.attempts, tokens: s.tokens ?? 0, minutes: s.startedAt && s.endedAt ? minutesBetween(s.startedAt, s.endedAt) : null, notes: s.notes.slice(-4).map((n) => n.text), reworked: s.agent ? reworkTo.has(s.agent) : false, verdict: !!s.verdict })),
        };
    });
    return { title, generated: new Date().toISOString(), events: events.length, writers: [...new Set(events.map((e) => e.w).filter(Boolean))], items, trust: trust(events, { policy, checks, project }), witnessed: witnessed(events), quality: qualityLoop(events), initiative: { I1: noticed(events), I5: silentPasses(events, openedBy) }, cost, matrix, plan, beliefs, atlas, skills };
}

const PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__ — board</title>
<style>
:root{--bg:#f6f5f1;--panel:#fffefb;--ink:#1d1c1a;--mute:#6f6c66;--line:#dedbd3;--accent:#3b5bdb;--ok:#2f8a57;--run:#b7791f;--bad:#c2413a;--wait:#7a4fbf;--idle:#b9b5ab;--chip:#eeece6;--shadow:0 1px 2px rgba(30,28,24,.06),0 6px 18px rgba(30,28,24,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--panel:#1c1c1a;--ink:#ecebe6;--mute:#9a978f;--line:#2e2d2a;--accent:#8ea2ff;--ok:#5fc48a;--run:#e0a94a;--bad:#f0766e;--wait:#b497f5;--idle:#55534d;--chip:#262623;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 22px rgba(0,0,0,.35)}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:baseline;padding:20px 24px 8px}
h1{font-size:18px;margin:0;letter-spacing:-.01em}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);margin:0 0 10px;font-weight:600}
.sub{color:var(--mute);font-size:12px}
nav{display:flex;gap:4px;padding:8px 24px;position:sticky;top:0;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);z-index:5;border-bottom:1px solid var(--line);overflow-x:auto}
nav button{font:inherit;color:var(--mute);background:none;border:0;padding:8px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}
nav button[aria-selected=true]{color:var(--ink);background:var(--chip)}nav button:focus-visible,.node:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
main{padding:20px 24px 60px;max-width:1500px}section[hidden],.detail[hidden]{display:none}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}.kpi span{color:var(--mute);font-size:12px}
.lane{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);margin-bottom:16px;overflow:hidden}
.lanehead{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
.lanehead strong{font-size:15px}.chip{background:var(--chip);border-radius:999px;padding:2px 9px;font-size:12px;color:var(--mute);white-space:nowrap}
.lvl{font-weight:600;color:var(--ink)}.lvl[data-l="0"]{color:var(--bad)}.lvl[data-l="1"]{color:var(--run)}.lvl[data-l="2"],.lvl[data-l="3"],.lvl[data-l="4"]{color:var(--ok)}
.canvas{position:relative;overflow-x:auto;padding:22px 16px 26px}
.row{display:flex;gap:34px;align-items:stretch;position:relative;z-index:1;width:max-content}
.node{width:156px;flex:none;background:var(--bg);border:1px solid var(--line);border-left:4px solid var(--idle);border-radius:10px;padding:9px 10px 10px;cursor:pointer;text-align:left;font:inherit;color:inherit}
.node[data-s=done]{border-left-color:var(--ok)}.node[data-s=running]{border-left-color:var(--run)}.node[data-s=blocked]{border-left-color:var(--bad)}.node[data-s=needs-user]{border-left-color:var(--wait)}
.node[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.node .t{display:flex;justify-content:space-between;gap:6px;font-weight:600;font-size:13px}.node .a{color:var(--mute);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node .m{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.node .m span{font-size:11px;background:var(--chip);border-radius:6px;padding:1px 6px;color:var(--mute);font-variant-numeric:tabular-nums}
.node[data-s=running] .t::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--run);animation:pulse 1.4s infinite;align-self:center}
@keyframes pulse{50%{opacity:.25}}@media (prefers-reduced-motion:reduce){.node[data-s=running] .t::after{animation:none}}
svg.wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
svg.wires path{fill:none;stroke:var(--line);stroke-width:2}svg.wires path.live{stroke:var(--ok)}svg.wires path.back{stroke:var(--bad);stroke-dasharray:5 5}
.detail{border-top:1px solid var(--line);padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
.detail ul{margin:0;padding:0;list-style:none}.detail li{padding:3px 0;display:flex;gap:8px;align-items:baseline}.dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--idle);transform:translateY(-1px)}
.dot.ok{background:var(--ok)}.dot.no{background:var(--bad)}.dot.wv{background:var(--run)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mute);font-weight:600;font-size:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:16px;overflow-x:auto}
.bar{height:8px;border-radius:4px;background:var(--chip);overflow:hidden;min-width:120px}.bar i{display:block;height:100%;background:var(--accent)}
.rng{position:relative;height:8px;border-radius:4px;background:var(--chip);min-width:140px}.rng i{position:absolute;top:0;bottom:0;border-radius:4px;background:var(--accent);opacity:.45}.rng b{position:absolute;top:-3px;width:2px;height:14px;background:var(--ink)}
.note{color:var(--mute);font-size:12px;max-width:80ch}.empty{color:var(--mute);padding:24px 0}
code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--chip);padding:1px 5px;border-radius:5px}
</style></head><body>
<header><h1>__TITLE__</h1><span class="sub" id="meta"></span></header>
<nav role="tablist" id="tabs"></nav>
<main id="main"></main>
<script id="data" type="application/json">__DATA__</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent);
const h=(t,a={},...c)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a)){if(v===null||v===undefined||v===false)continue;if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v)}for(const x of c.flat())if(x!==null&&x!==undefined&&x!==false)e.append(x.nodeType?x:document.createTextNode(x));return e};
const k=n=>n==null?'—':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'k':String(n),pct=x=>x==null?'—':Math.round(x*100)+'%';
document.getElementById('meta').textContent=D.events+' events'+(D.writers.length?' · '+D.writers.length+' writer(s)':'')+' · snapshot '+D.generated.slice(0,16).replace('T',' ')+' UTC';
const table=(heads,rows)=>h('table',{},h('thead',{},h('tr',{},heads.map(x=>h('th',{text:x})))),h('tbody',{},rows.map(r=>h('tr',{},r.map(c=>h('td',{},c))))));
const range=(lo,hi,mid)=>{const r=h('div',{class:'rng',role:'img','aria-label':'between '+pct(lo)+' and '+pct(hi)});r.append(h('i',{style:'left:'+lo*100+'%;width:'+Math.max(1,(hi-lo)*100)+'%'}));if(mid!=null)r.append(h('b',{style:'left:calc('+mid*100+'% - 1px)'}));return r};
function lane(it){
  const detail=h('div',{class:'detail',hidden:''});
  const show=(s,btn)=>{row.querySelectorAll('.node').forEach(n=>n.setAttribute('aria-pressed','false'));const same=detail.dataset.step===s.id&&!detail.hidden;detail.hidden=same;detail.dataset.step=s.id;if(same)return;btn.setAttribute('aria-pressed','true');detail.replaceChildren(
    h('div',{},h('h2',{text:'Step '+s.id}),h('ul',{},[['agent',s.agent+(s.mode?' · '+s.mode:'')],['status',s.status+(s.attempts>1?' · attempt '+s.attempts:'')],['model',s.model||'—'],['time',s.minutes==null?'—':s.minutes+' min'],['tokens',k(s.tokens)]].map(([a,b])=>h('li',{},h('span',{class:'sub',text:a}),b))),s.notes.length?h('div',{},h('h2',{text:'Checkpoints',style:'margin-top:12px'}),h('ul',{},s.notes.map(n=>h('li',{text:n})))):null),
    h('div',{},h('h2',{text:it.closed?'Why '+it.label:'Rules met so far'}),h('ul',{},it.rules.map(r=>h('li',{},h('span',{class:'dot '+(r.pass?'ok':r.waived?'wv':'no')}),h('span',{},h('b',{text:'L'+r.level+' '+r.rule}),' — ',r.pass?r.why:r.waived?'waived: '+r.waived:'not met'+(r.got==null?'':' ('+r.got+')')))))),
    h('div',{},h('h2',{text:'Evidence'}),it.evidence.length?h('ul',{},it.evidence.map(e=>h('li',{},h('span',{class:'dot '+(e.stale?'wv':e.ok?'ok':'no')}),e.name+(e.value!=null?' = '+e.value:'')+(e.stale?' (stale)':'')))):h('div',{class:'sub',text:'none recorded'}),it.odd.length?h('div',{},h('h2',{text:'Looks wrong',style:'margin-top:12px'}),h('ul',{},it.odd.map(o=>h('li',{text:o})))):null))};
  const row=h('div',{class:'row'},it.steps.map(s=>{const b=h('button',{class:'node','data-s':s.status,'data-id':s.id,'aria-pressed':'false',onclick:()=>show(s,b)},h('div',{class:'t'},h('span',{text:s.id})),h('div',{class:'a',text:s.agent,title:s.agent}),h('div',{class:'m'},s.model?h('span',{text:s.model}):null,s.minutes!=null?h('span',{text:s.minutes+' min'}):null,s.tokens?h('span',{text:k(s.tokens)+' tok'}):null,s.attempts>1?h('span',{text:'×'+s.attempts}):null));return b}));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','wires');svg.setAttribute('aria-hidden','true');
  const canvas=h('div',{class:'canvas'},svg,row);
  const draw=()=>{svg.replaceChildren();const base=canvas.getBoundingClientRect();const box=n=>{const r=n.getBoundingClientRect();return{l:r.left-base.left+canvas.scrollLeft,r:r.right-base.left+canvas.scrollLeft,m:r.top-base.top+r.height/2,b:r.bottom-base.top}};const nodes=[...row.children];svg.style.width=row.scrollWidth+32+'px';
    const path=(d,c)=>{const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);if(c)p.setAttribute('class',c);svg.append(p)};
    nodes.forEach((n,i)=>{if(!i)return;const a=box(nodes[i-1]),b=box(n),dx=(b.l-a.r)/2;path('M'+a.r+','+a.m+' C'+(a.r+dx)+','+a.m+' '+(b.l-dx)+','+b.m+' '+b.l+','+b.m,it.steps[i-1].status==='done'?'live':'')});
    const judge=it.steps.findIndex(s=>s.verdict);if(it.cycles&&judge>0)it.steps.forEach((s,i)=>{if(!s.reworked||i>=judge)return;const a=box(nodes[judge]),b=box(nodes[i]),y=Math.max(a.b,b.b)+14;path('M'+(a.l+20)+','+a.b+' C'+(a.l+20)+','+y+' '+(b.r-20)+','+y+' '+(b.r-20)+','+b.b,'back')})};
  requestAnimationFrame(draw);addEventListener('resize',draw);
  return h('div',{class:'lane'},h('div',{class:'lanehead'},h('strong',{text:it.id}),it.closed?h('span',{class:'chip lvl','data-l':it.level,text:it.label}):h('span',{class:'chip',text:'in progress'}),h('span',{class:'chip',text:'tier '+it.tier}),it.cycles?h('span',{class:'chip',text:it.cycles+' rework'}):null,it.holder?h('span',{class:'chip',text:it.holder}):null,it.odd.length?h('span',{class:'chip',text:it.odd.length+' to look at'}):null),canvas,detail)}
const T=D.trust;
const views={
 Flow:()=>[h('div',{class:'kpis'},[[D.items.filter(i=>!i.closed).length,'open items'],[T.closed,'closed items'],[pct(T.firstPass),'passed without rework'],[T.waivers,'waivers'],[T.forced,'forced steps']].map(([b,s])=>h('div',{class:'kpi'},h('b',{text:String(b)}),h('span',{text:s})))),D.items.length?D.items.map(lane):h('div',{class:'empty',text:'No items yet. Open one: facet flow open <ITEM>'})],
 Trust:()=>[D.initiative?h('div',{class:'card'},h('h2',{text:'What agents noticed beyond their task'}),h('p',{},'I1: ',h('b',{text:D.initiative.I1.perItem==null?'—':String(D.initiative.I1.perItem)}),' tension(s) per closed item; ',String(D.initiative.I1.withAny),' of ',String(D.initiative.I1.items),' items have any. I5: ',h('b',{text:D.initiative.I5.value==null?'—':pct(D.initiative.I5.value)}),' of defects found after acceptance were in a file an agent had opened and said nothing about ('+D.initiative.I5.silent+' of '+D.initiative.I5.escapes+').'),h('p',{class:'note',text:'Opened is not could-have-noticed: I5 overstates blame and compares agents; it does not judge one case.'})):null,D.quality?h('div',{class:'card'},h('h2',{text:'The quality loop'}),table(['','Measure','Value','Target'],[['K1','criteria with a tool\'s result',D.quality.K1.value==null?'—':pct(D.quality.K1.value)+' ('+D.quality.K1.measured+'/'+D.quality.K1.withCheck+')','100 %'],['K2','accepted without a return to an agent',D.quality.K2.value==null?'—':pct(D.quality.K2.value),'watch'],['K3','defects after acceptance per closed item',D.quality.K3.value==null?'—':pct(D.quality.K3.value),'0'],['K4','steps between the source and where it was found (median)',D.quality.K4.value==null?'—':String(D.quality.K4.value)+' (n='+D.quality.K4.n+')','≤ 1'],['K5','sources measured or found on the chain',D.quality.K5.value==null?'—':pct(D.quality.K5.value)+' (n='+D.quality.K5.n+')','≥ 80 %'],['U6','questions after the work began, per item',D.quality.U6.value==null?'—':String(D.quality.U6.value),'falling'],['U7','returns for an assumption nobody asked about',D.quality.U7.value==null?'—':pct(D.quality.U7.value)+' (n='+D.quality.U7.n+')','low'],['U8','returns that were the brief\'s',D.quality.U8.value==null?'—':pct(D.quality.U8.value)+' (n='+D.quality.U8.n+')','≤ 30 %']]),D.quality.K1.short.length?h('p',{class:'note',text:'Criteria without a tool\'s result: '+D.quality.K1.short.join(', ')}):null):null,h('div',{class:'card'},h('h2',{text:'Packs reproduced by a witness'}),D.witnessed&&D.witnessed.packs?h('p',{},h('b',{text:pct(D.witnessed.independent/D.witnessed.packs)}),' of ',h('b',{text:String(D.witnessed.packs)}),' proof packs were reproduced by an independent witness (another machine and environment, such as CI); ',h('b',{text:String(D.witnessed.rerun)}),' only by a rerun on the same machine.'):h('p',{class:'empty',text:'No proof packs yet.'})),h('div',{class:'card'},h('h2',{text:'What the record supports'}),T.closed?h('p',{},'Of ',h('b',{text:String(T.closed)}),' closed items, ',h('b',{text:String(T.escapes.n)}),' later needed a fix. With about 80% confidence, at most ',h('b',{text:pct(T.escapes.atMost)}),' of closed items carry a defect that is found later.'):h('p',{class:'empty',text:'No closed items yet: nothing can be said about the team.'}),h('p',{class:'note',text:'A level says which evidence exists for an item, not that the evidence is enough for your risk. Defects nobody found are not counted.'})),
   h('div',{class:'card'},h('h2',{text:'Closed items by assurance level'}),table(['Level','Items',''],Object.entries(T.levels).map(([l,n])=>[l,String(n),h('div',{class:'bar'},h('i',{style:'width:'+(T.closed?n/T.closed*100:0)+'%'}))]))),
   h('div',{class:'card'},h('h2',{text:'Do the guards catch planted defects?'}),T.calibration.length?table(['Guard','Caught','Catch rate, 80% interval'],T.calibration.map(c=>[c.guard,c.caught+' of '+c.n,range(c.low,c.high,c.rate)])):h('div',{class:'empty',text:'Not calibrated yet. Plant a defect: facet canary run --files … --test "…"'})),
   D.beliefs.length?h('div',{class:'card'},h('h2',{text:'Beliefs about agents (evidence fades with age)'}),table(['Agent','Dimension','Belief, 80% interval','Evidence'],D.beliefs.map(b=>[b.agent,b.dim,range(b.low,b.high,b.mean),String(b.evidence)]))):null],
 Cost:()=>[D.cost?h('div',{class:'kpis'},[[k(D.cost.total.tokens),'tokens'],[pct(D.cost.shares.orchestration),'orchestration'],[pct(D.cost.shares.rework),'rework'],[pct(D.cost.shares.wasted),'blocked steps'],[k(D.cost.items.tokensPerClosed),'per closed item']].map(([b,s])=>h('div',{class:'kpi'},h('b',{text:String(b)}),h('span',{text:s})))):null,
   D.cost&&Object.keys(D.cost.byAgent).length?h('div',{class:'card'},h('h2',{text:'Tokens by agent'}),table(['Agent','Tokens','Output','Calls',''],Object.entries(D.cost.byAgent).sort((a,b)=>b[1].tokens-a[1].tokens).map(([a,v])=>[a,k(v.tokens),k(v.output||0),String(v.calls),h('div',{class:'bar'},h('i',{style:'width:'+v.tokens/D.cost.total.tokens*100+'%'}))]))):h('div',{class:'empty',text:'No usage yet. Import a transcript: facet cost import <file>'}),
   h('div',{class:'card'},h('h2',{text:'Agent × model, from closed items'}),D.matrix.length?table(['Agent','Model','Items','First pass, 80% interval','Blocked','Median tokens'],D.matrix.map(r=>[r.agent,r.model,r.n+(r.thin?' (thin)':''),range(r.low,r.high,r.firstPass),pct(r.blocked),k(r.tokens)])):h('div',{class:'empty',text:'Fills as items close.'}))],
 Schedule:()=>D.plan?[h('div',{class:'card'},h('h2',{text:'Versions'}),table(['Version','Items left','Likely','Safe','Milestone','Slack, days'],D.plan.forecast.map(f=>[f.version,String(f.items),f.likely,f.safe,f.due||'—',f.slackDays==null?'—':String(f.slackDays)])),h('p',{class:'note',text:'Agent time only; waiting for people is not in the forecast. Effort: '+Object.entries(D.plan.calibration.tiers).map(([t,m])=>t+' '+Math.round(m)+' min ('+D.plan.calibration.source[t]+')').join(', ')+'.'})),
   h('div',{class:'card'},h('h2',{text:'Sessions'}),table(['#','Date','Items','Minutes'],D.plan.sessions.slice(0,40).map(s=>[String(s.n),s.date,s.items.join(', '),String(Math.round(s.minutes))])))]:[h('div',{class:'empty',text:'No plan: configure a routing file with items, dependencies and versions.'})],
 Skills:()=>D.skills&&D.skills.rows.length?[h('div',{class:'kpis'},[[D.skills.total,'facets'],[D.skills.rows.length,'used in closed items'],[D.skills.rows.filter(r=>r.verdict==='works').length,'shown to work'],[D.skills.rows.filter(r=>/ignored/.test(r.verdict)).length,'ignored'],[D.skills.blind,'without a footprint']].map(([b,s])=>h('div',{class:'kpi'},h('b',{text:String(b)}),h('span',{text:s})))),
   h('div',{class:'card'},h('h2',{text:'Which rules work, and what to do about each'}),table(['Facet','Diagnosis','Followed','Clean with it','Without it','Action'],D.skills.rows.map(r=>[h('code',{text:r.facet}),r.verdict,r.adherence&&r.adherence.n?range(r.adherence.low,r.adherence.high,r.adherence.p):'not observable',r.withRule.n?pct(r.withRule.p)+' ('+r.withRule.n+')':'—',r.without.n?pct(r.without.p)+' ('+r.without.n+')':'—',r.action]))),
   h('div',{class:'card'},h('h2',{text:'Failure modes and the rules that guard them'}),D.skills.coverage.length?table(['Failure mode','Incidents','Guarded by',''],D.skills.coverage.map(c=>[c.mode,String(c.incidents),c.active.length?c.active.join(', '):'nothing loaded',c.gap?'gap':c.recurring?'recurring':''])):h('div',{class:'empty',text:'No incidents on record.'}))]:[h('div',{class:'empty',text:'Fills as items close: each step records which facets it was given.'})],
 Atlas:()=>D.atlas?[h('div',{class:'kpis'},[[D.atlas.stats.files,'modules'],[D.atlas.stats.exports,'exports'],[D.atlas.stats.edges,'imports'],[D.atlas.stats.hidden,'hidden couplings']].map(([b,s])=>h('div',{class:'kpi'},h('b',{text:String(b)}),h('span',{text:s})))),
   h('div',{class:'card'},h('h2',{text:'Hot spots: edited often and depended on by many'}),table(['File','Commits','Used by','Tests behind it'],D.atlas.hotspots.map(x=>[h('code',{text:x.file}),String(x.churn),String(x.fanIn),x.tests?String(x.tests):'none']))),
   h('div',{class:'card'},h('h2',{text:'Change together, with no import between them'}),D.atlas.hidden.length?table(['File','File','Commits together','Strength'],D.atlas.hidden.map(c=>[h('code',{text:c.a}),h('code',{text:c.b}),String(c.together),pct(c.strength)])):h('div',{class:'empty',text:'None found in the recent history.'}))]:[h('div',{class:'empty',text:'No atlas in this snapshot: facet board --atlas'})]};
const tabs=document.getElementById('tabs'),main=document.getElementById('main');
Object.keys(views).forEach((name,i)=>{const s=h('section',{role:'tabpanel',hidden:i?'':null,id:'v'+i});main.append(s);let built=false;const b=h('button',{role:'tab','aria-selected':i?'false':'true','aria-controls':'v'+i,text:name,onclick:()=>{tabs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-selected','false'));b.setAttribute('aria-selected','true');main.querySelectorAll('section').forEach(x=>x.hidden=true);s.hidden=false;if(!built){s.append(...views[name]().flat().filter(Boolean));built=true}dispatchEvent(new Event('resize'))}});tabs.append(b);if(!i){s.append(...views[name]().flat().filter(Boolean));built=true}});
</script></body></html>`;

/** The page as a string. Data is embedded; nothing is fetched. */
export function renderBoard(data) {
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const title = String(data.title).replace(/[<>&"]/g, '');
    return PAGE.replaceAll('__TITLE__', title).replace('__DATA__', () => json);
}
