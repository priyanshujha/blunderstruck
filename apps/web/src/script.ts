/**
 * The page's one inline script, as written: no build step, no external request, no `eval`, no
 * inline handlers. It only adds animation and conveniences to a page that is complete without
 * it: boards play once when 60% in view (never while the report is provisional, never under
 * reduced motion), buttons and sentences step through a board, and on narrow screens second
 * examples fold behind a button and unfold when a link points into them.
 *
 * Each example carries its steps in an escaped `data-b` attribute (JSON). A step is
 * `[from, to, flags?]`: `g` a move the game did not play (with `w`, the note to show: `a` or
 * `f`), `x` the square of a piece taken elsewhere (en passant), `r` the rook's squares when
 * castling, `q` the piece a pawn becomes, `o` a pause with no move. Arrows and marks are
 * already in the board as hidden groups keyed `p<i>` and `b<i>`; the script shows them.
 */
export const SCRIPT = `(()=>{
const d=document,R=d.documentElement,B=d.body;R.classList.add("js");
const still=matchMedia("(prefers-reduced-motion: reduce)").matches;
const T=(f,ms)=>setTimeout(f,ms);
const bs=[...d.querySelectorAll(".ex[data-b]")].map((ex,i)=>{
let data;try{data=JSON.parse(ex.dataset.b)}catch(e){return null}
const svg=ex.querySelector("svg.board");if(!svg)return null;
const pc=[...svg.querySelectorAll(".pc")].map(e=>({e,s0:e.dataset.sq,h0:e.getAttribute("href")}));
const b={i,ex,svg,d:data,pc,ov:[...svg.querySelectorAll(".ov")],ln:[...ex.querySelectorAll(".line[data-v]")],
cp:[...ex.querySelectorAll(".cap .c")],no:[...ex.querySelectorAll(".bnote")],v:"",n:0,run:0,t:0};
b.pc.forEach(p=>p.e.style.transform=tr(p.s0,data.f));
ex.querySelectorAll(".ctl button").forEach(x=>x.addEventListener("click",()=>{take(b);const k=x.dataset.do;
k==="all"?seq(b):play(b,k)}));
b.ln.forEach(l=>{l.tabIndex=0;l.setAttribute("role","button");
const go=()=>{take(b);b.run++;clearTimeout(b.t);show(b,l.dataset.v,+l.dataset.n)};
l.addEventListener("click",go);l.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}})});
return b}).filter(Boolean);
function tr(s,f){const x=s.charCodeAt(0)-97,y=+s[1];return "translate("+(f?7-x:x)*10+"px,"+(f?y-1:8-y)*10+"px)"}
function show(b,v,n){b.v=v;b.n=n;const st=v?b.d[v]:[];let last=-1;
for(let i=0;i<n;i++){const o=st[i][2]||{};if(!o.g&&!o.o)last=i}
const at={},app=new Set();let note="";
b.pc.forEach(p=>{p.s=p.s0;p.dead=0;p.gh=0;p.h=p.h0;at[p.s]=p});
for(let i=0;i<n;i++){const m=st[i],o=m[2]||{};if(o.o||(o.g&&i<last))continue;
const p=at[m[0]];if(!p)continue;const x=o.x||m[1];
if(at[x]&&at[x]!==p){at[x].dead=1;delete at[x]}
delete at[m[0]];at[m[1]]=p;p.s=m[1];if(o.q)p.h="#p"+o.q;
if(o.g){p.gh=1;app.add(i);note=o.w}
if(o.r){const r=at[o.r[0]];if(r){delete at[o.r[0]];at[o.r[1]]=r;r.s=o.r[1];if(o.g)r.gh=1}}}
b.svg.classList.toggle("snap",n===0);
b.pc.forEach(p=>{p.e.style.transform=tr(p.s,b.d.f);p.e.style.opacity=p.dead?"0":p.gh?".45":"";
if(p.e.getAttribute("href")!==p.h)p.e.setAttribute("href",p.h)});
b.ov.forEach(g=>{const k=g.dataset.k,i=+k.slice(1),on=v?k[0]===v&&i<n:k==="r",cur=on&&i===n-1;
g.classList.toggle("on",on);g.classList.toggle("cur",cur);g.classList.toggle("old",on&&!cur&&k!=="r");g.classList.toggle("app",on&&app.has(i))});
b.no.forEach(e=>e.hidden=e.dataset.w!==note);
let act=null;if(n>0)b.ln.forEach(l=>{const ln=+l.dataset.n;if(l.dataset.v===v&&ln>=n&&(!act||ln<+act.dataset.n))act=l});
b.ln.forEach(l=>l.classList.toggle("on",l===act));
const ai=act?b.ln.indexOf(act):-1;b.cp.forEach((c,j)=>c.classList.toggle("on",j===ai+1));
b.ex.querySelectorAll(".ctl button[aria-pressed]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.do===v)))}
function play(b,v,then){const st=b.d[v]||[],mine=++b.run;clearTimeout(b.t);
if(!st.length){if(then)then();return}
if(still){show(b,v,b.v===v&&b.n<st.length?b.n+1:1);return}
let n=0;show(b,v,0);const next=()=>{b.t=T(()=>{if(b.run!==mine)return;show(b,v,++n);
if(n<st.length)next();else if(then)b.t=T(()=>{if(b.run===mine)then()},2200)},n?1250:700)};next()}
function seq(b,done){play(b,"p",()=>play(b,"b",()=>{show(b,"",0);if(done)done()}))}
let q=[],busy=0,io=null;
function take(b){q=[];busy=0;if(io){io.disconnect();io=null}
bs.forEach(o=>{if(o!==b){o.run++;clearTimeout(o.t);if(o.v||o.n)show(o,"",0)}})}
function pump(){if(busy||!q.length)return;busy=1;const b=q.shift();seq(b,()=>{busy=0;pump()})}
if(B.dataset.auto==="1"&&!still&&"IntersectionObserver" in window){
io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;io.unobserve(e.target);
const b=bs.find(x=>x.svg===e.target);if(b){q.push(b);q.sort((x,y)=>x.i-y.i);pump()}}),{threshold:.6});
bs.forEach(b=>io.observe(b.svg))}
function open(ex){if(!ex||!ex.classList.contains("shut"))return;ex.classList.remove("shut");
const btn=d.querySelector('.morebtn[data-open="'+ex.id+'"]');if(btn)btn.hidden=true}
d.querySelectorAll(".ex[data-fold]").forEach(ex=>ex.classList.add("shut"));
d.querySelectorAll(".morebtn").forEach(x=>x.addEventListener("click",()=>{const ex=d.getElementById(x.dataset.open);open(ex);if(ex)ex.scrollIntoView()}));
const reveal=h=>{if(!h||h.length<2)return null;let t=null;try{t=d.getElementById(decodeURIComponent(h.slice(1)))}catch(e){}
if(t)open(t.closest(".ex"));return t};
d.addEventListener("click",e=>{const a=e.target.closest&&e.target.closest('a[href^="#"]');if(a)reveal(a.getAttribute("href"))});
addEventListener("hashchange",()=>{const t=reveal(location.hash);if(t)t.scrollIntoView()});
const t0=reveal(location.hash);if(t0)t0.scrollIntoView()
})();`;
