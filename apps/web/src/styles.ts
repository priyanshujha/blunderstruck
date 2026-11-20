/**
 * The page's one inline stylesheet. System fonts only; light and dark follow
 * `prefers-color-scheme`. Widths, heights and positions that come from data are SVG attributes,
 * so the markup carries no `style` attribute and the policy allows this sheet alone.
 */
export const STYLE = `:root{color-scheme:light dark;
--paper:#EEF0F2;--card:#FFFFFF;--ink:#10141C;--muted:#4E5663;--line:#C9CFD8;--soft:#DEE2E8;--dot:#B9C1CC;
--cobalt:#2447D8;--red:#C8283C;--red-text:#B01F33;--red-soft:#F6DDE1;--green:#0E6B4A;--green-soft:#CFE6DA;--focus:#2447D8;
--sq-l:#E4E8ED;--sq-d:#A1ABBA;--b-red:#C8283C;--b-green:#0E6B4A;--b-ink:#10141C;--b-halo:#FFFFFF;
--serif:ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
--sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--paper:#0E1117;--card:#1A1F29;--ink:#E8ECF2;--muted:#A3ACBA;--line:#343C4A;--soft:#262D3A;--dot:#505A6E;
--cobalt:#7C96FF;--red:#F06273;--red-text:#F47A89;--red-soft:#3B1A23;--green:#45C493;--green-soft:#123B2C;--focus:#7C96FF;--sq-l:#D5DAE1;--sq-d:#8E99A9}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.55 var(--sans);text-wrap:pretty;-webkit-text-size-adjust:100%}
a{color:inherit;text-decoration-color:var(--cobalt);text-underline-offset:3px;text-decoration-thickness:1.5px}
a:hover{color:var(--cobalt)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:4px}
:where(h1,h2,h3,p,ol,ul,dl,dd,figure){margin:0}
:where(ol,ul){padding:0;list-style:none}
code{font:14px var(--mono);color:var(--muted);white-space:nowrap}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
.sprite{position:absolute;width:0;height:0;overflow:hidden}
.sl{fill:var(--sq-l)}
.sd{fill:none;stroke:var(--sq-d);stroke-width:10;stroke-dasharray:10}
.pf{fill:var(--pf);stroke:var(--ps);stroke-width:1.5;stroke-linejoin:round}
.pl{fill:none;stroke:var(--pd);stroke-width:1.8;stroke-linecap:round}
.w{--pf:#FFFFFF;--ps:#10141C;--pd:#10141C}
.b{--pf:#10141C;--ps:#10141C;--pd:#F5F6F5}
.bd{display:grid;grid-template-columns:14px minmax(0,1fr);gap:3px 4px}
.rk{display:flex;flex-direction:column}
.rk span{flex:1 1 0;display:flex;align-items:center;justify-content:center}
.fl{grid-column:2;display:flex}
.fl span{flex:1 1 0;text-align:center}
.rk,.fl{font:700 11.5px/1.25 var(--sans);color:var(--muted)}
.bsq{min-width:0}
.bn{grid-column:2;min-height:26px;display:flex;align-items:center;justify-content:center}
.bnote{background:var(--sq-l);color:var(--b-ink);border:1.5px dashed var(--b-ink);border-radius:99px;padding:0 10px;font:700 12px/1.7 var(--sans)}
.bnote[hidden]{display:none}
.pw{white-space:nowrap}
.pi{width:1.35em;height:1.35em;vertical-align:-.32em;border-radius:4px;margin:0 .05em}
.pi.b{background:var(--sq-l)}
.pi.w{background:var(--sq-d)}
.board{display:block;width:100%;height:auto;aspect-ratio:1;border-radius:8px;border:1px solid var(--line);background:var(--sq-l)}
.hl{opacity:.32}
.hl.bad{fill:var(--b-red)}
.hl.good{fill:var(--b-green)}
.ar{stroke:var(--b-halo);stroke-width:.8;stroke-linejoin:round;paint-order:stroke}
.ar.bad{fill:var(--b-red)}
.ar.good{fill:var(--b-green)}
.ar.them,.ar.ghost{fill:var(--b-ink)}
.arc{fill:none;stroke:var(--b-halo);stroke-width:.6;stroke-linecap:round}
.old .ar,.old .arc{opacity:.3}
.ring{fill:none;stroke:var(--b-red);stroke-width:.9}
.ring.good{stroke:var(--b-green)}
.ring.dash{stroke-dasharray:1.6 1.1}
.ring.halo{stroke:var(--b-halo);stroke-width:2;stroke-dasharray:none}
.ray{stroke:var(--b-red);stroke-width:.7;stroke-dasharray:1.5 1.2;fill:none}
.ray.good{stroke:var(--b-green)}
.ray.halo{stroke:var(--b-halo);stroke-width:1.6;stroke-dasharray:none}
.ov:not(.on),.ov:not(.cur) .last,.ov:not(.app) .wt{display:none}
.board .pc{transition:transform .55s cubic-bezier(.3,.1,.2,1),opacity .25s .3s}
.board.snap .pc{transition:none}
@media (prefers-reduced-motion:reduce){.board .pc{transition:none}}
.mast{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;padding:18px 0 10px;border-bottom:3px double var(--ink)}
.brand{font:700 20px var(--serif);letter-spacing:.01em;text-decoration:none;display:inline-flex;align-items:center;gap:8px;min-height:44px}
.brand .pi{width:1.5em;height:1.5em;vertical-align:0;background:var(--cobalt)}
.mast-meta{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.banner{background:var(--soft);border-radius:12px;padding:12px 16px;margin-top:20px;font-size:15px;color:var(--muted)}
.banner b{color:var(--ink)}
.bar{display:block;width:100%;max-width:420px;height:6px;margin:9px 0 2px}
.bar .t{fill:var(--line)}.bar .f{fill:var(--ink)}
.hero{padding:36px 0 8px}
.eyebrow,.tag,h3{font:600 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
h1{font:700 clamp(30px,4.6vw,50px)/1.08 var(--serif);letter-spacing:-.01em;margin:10px 0 12px;max-width:21ch;overflow-wrap:anywhere}
.lede{font-size:18px;max-width:60ch;color:var(--muted)}
.lede b,.overall b,.aim b,.note b,.stand b{color:var(--ink)}
.index{display:none}
.cards{display:grid;gap:18px;margin-top:26px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 0 var(--line);min-width:0}
.top{display:flex;gap:14px;align-items:flex-start}
.top>div{min-width:0}
.num{font:italic 700 42px/1 var(--serif);color:var(--cobalt);min-width:.7em}
h2{font:700 23px/1.2 var(--serif);margin-top:3px;overflow-wrap:anywhere}
.mid{display:flex;gap:16px;align-items:center;justify-content:space-between}
.big{font-size:16px;color:var(--muted);line-height:1.25}
.big b{display:block;font:700 58px/1 var(--serif);color:var(--ink);letter-spacing:-.02em}
.about{margin-top:6px;font-weight:650;font-size:17px}
.vdrow{margin-top:10px}
.mini{flex:0 0 clamp(112px,34%,156px);display:block;border-radius:8px}
.dots{display:block;width:100%;max-width:470px;height:auto}
.d-on{fill:var(--red)}.d-cut{fill:var(--card);stroke:var(--red);stroke-width:1.6}.d-off{fill:var(--dot)}
.ringkey{font-size:14px;color:var(--muted);margin-top:-6px}
.key{display:inline-block;width:.72em;height:.72em;border-radius:50%;border:.2em solid var(--red);vertical-align:-.02em;margin-right:.35em}
.aim{font-size:15px;color:var(--muted)}
.links{display:flex;flex-wrap:wrap;gap:4px 22px}
.more{display:inline-flex;align-items:center;min-height:44px;font-weight:650;font-size:15px}
.more.quiet{font-weight:500;color:var(--muted)}
.overall{margin-top:22px;padding:14px 0;border-top:1px solid var(--line);color:var(--muted);font-size:16px;max-width:80ch}
.since{padding-top:26px}
.verdicts li{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;padding:14px 0;border-bottom:1px solid var(--line)}
.vd{display:inline-flex;align-items:center;gap:6px;justify-self:start;font:700 12px var(--sans);letter-spacing:.07em;text-transform:uppercase;border-radius:99px;padding:4px 10px 4px 8px;border:1.5px solid;white-space:nowrap}
.vd svg{width:12px;height:12px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.vd.up{color:var(--green);background:var(--green-soft)}
.vd.down{color:var(--red-text);background:var(--red-soft);border-radius:4px}
.vd.flat{color:var(--muted);border-radius:4px}
.vd.wait{color:var(--muted);border-style:dashed}
.done{display:flex;gap:16px;align-items:center;background:var(--green-soft);border:1px solid var(--green);border-radius:14px;padding:16px 18px;margin-top:6px}
.stamp{flex:none;font:italic 700 17px var(--serif);color:var(--green);border:2px solid var(--green);border-radius:8px;padding:4px 10px;transform:rotate(-4deg)}
.focus{padding:44px 0 8px;border-top:3px double var(--ink);margin-top:36px}
.focus>.top .num{font-size:54px}
.focus>.top h2{font-size:clamp(24px,3.4vw,34px)}
.reason{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:8px;font-size:14.5px;color:var(--muted)}
.pips{display:inline-flex;gap:3px}
.pips i{width:8px;height:8px;border-radius:50%;background:var(--red)}
.pips i.no{background:none;border:1.5px solid var(--muted)}
.why{font:18.5px/1.5 var(--serif);max-width:62ch;margin-top:18px}
h3{margin:34px 0 12px}
.habit{margin-top:28px;background:var(--card);border:1.5px solid var(--ink);border-radius:14px;padding:22px;box-shadow:5px 5px 0 var(--soft)}
.habit-k{font:700 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--green)}
.habit-t{font:700 clamp(23px,2.8vw,29px)/1.18 var(--serif);margin-top:4px}
.habit-s{font-size:15px;color:var(--muted);margin-top:8px;max-width:66ch}
.colk{display:none}
.steps{margin-top:14px;border-top:1px solid var(--line)}
.step{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;padding:20px 0;border-bottom:1px solid var(--line)}
.step>*{min-width:0}
.spot-k{font:700 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--ink)}
.spot-name{font:700 19px/1.25 var(--serif);margin-top:3px;max-width:22em}
.spot-n{display:flex;align-items:baseline;gap:8px;margin-top:8px;font-size:15px;color:var(--muted)}
.spot-n b{font:700 36px/1 var(--serif);color:var(--red-text)}
.cmp{display:block;width:100%;max-width:290px;height:18px;margin-top:5px;overflow:visible}
.cmp .t{fill:var(--soft)}.cmp .f{fill:var(--red)}.cmp .k{fill:var(--ink);stroke:var(--card);stroke-width:1.5;paint-order:stroke}
.spot-vs{font-size:14px;color:var(--muted);margin-top:5px}
.tk{display:inline-block;width:3px;height:.95em;background:var(--ink);border-radius:2px;vertical-align:-.12em;margin-right:7px}
.spot-ref{font-size:14px;margin-top:2px;padding-left:10px}
.spot .more{font-size:14px}
.join{display:flex;color:var(--muted);padding:2px 0 2px 2px}
.join svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;transform:rotate(90deg)}
.do-k{font:700 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--green)}
.do-t{font:20px/1.42 var(--serif);margin-top:4px;max-width:36em}
.drill{margin-top:20px}
.drill-k{font:700 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.drill-t{font:17.5px/1.55 var(--serif);border-left:3px solid var(--green);padding-left:16px;margin-top:8px;max-width:70ch}
.ex{display:grid;gap:18px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
.ex>*,.two>*,.cols>*{min-width:0}
.bwrap{max-width:400px}
.cap,.ctl,.morebtn{display:none}
.morebtn{width:100%;min-height:48px;align-items:center;justify-content:center;font:650 15px var(--sans);color:var(--ink);background:var(--card);border:1px dashed var(--muted);border-radius:14px;cursor:pointer;margin-bottom:18px}
.akey{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-size:13px;color:var(--muted)}
.akey span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.ak{width:42px;height:18px;flex:none;background:var(--sq-l);border-radius:4px}
.js .ctl{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.ctl button{font:600 14px var(--sans);color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:99px;padding:8px 14px;min-height:44px;cursor:pointer;white-space:nowrap}
.ctl button:hover{border-color:var(--ink)}
.ctl .bp[aria-pressed=true]{background:var(--red-soft);border-color:var(--red)}
.ctl .bb[aria-pressed=true]{background:var(--green-soft);border-color:var(--green)}
.ctl .ba{margin-left:auto}
.exspots{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-bottom:8px}
.exspots .lab{font:700 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--ink)}
.spotchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:6px;padding:2px 10px;font:600 13px/1.25 var(--sans);text-decoration:none;min-height:44px}
a.spotchip{color:var(--ink)}
.spotchip i{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:4px;background:var(--soft);font-style:normal;font-weight:700}
.extitle{font:italic 700 21px/1.2 var(--serif)}
.exmeta{font-size:13.5px;color:var(--muted);margin:4px 0 12px}
.exmeta a{display:inline-block;padding:14px 0;margin:-14px 0}
.line{display:grid;grid-template-columns:4.2em minmax(0,1fr);gap:10px;width:100%;padding:9px 10px;border-radius:10px;border:1px solid transparent;min-height:44px}
.js .line{cursor:pointer}
.js .line:hover{background:var(--paper)}
.line.on{background:var(--red-soft);border-color:var(--red)}
.line.g.on{background:var(--green-soft);border-color:var(--green)}
.who{font:700 11.5px/1.9 var(--sans);letter-spacing:.08em;text-transform:uppercase;text-align:center;border-radius:6px;align-self:start;margin-top:2px;border:1.5px solid}
.who.you{color:var(--red-text)}.who.they{color:var(--ink)}.who.good{color:var(--green)}
.motif{font:600 11.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:1px 6px;white-space:nowrap}
.bettersep{border-top:1px dashed var(--line);margin:6px 0}
.swing{margin-top:12px;padding:0 10px;font-size:16px;font-weight:650}
.plainex{font-size:16px}
.two{display:grid;gap:18px;margin-top:8px}
.chart{max-width:540px}
.chead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 12px;font-size:13px;color:var(--muted)}
.chead .gk{display:inline-flex;align-items:center;gap:7px;color:var(--ink);font-weight:700;white-space:nowrap}
.chead .gk i{width:22px;border-top:1.5px dashed var(--ink)}
.plot{display:block;width:100%;height:112px;margin-top:5px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow:visible}
.plot .cb{fill:var(--red)}.plot .few{fill:none;stroke:var(--red);stroke-width:1.5;stroke-dasharray:4 3}
.plot .gl{stroke:var(--ink);stroke-width:1.5;stroke-dasharray:5 4}
.cx{display:flex;margin-top:6px}
.cx span{flex:1 1 0;text-align:center;font-size:13px;line-height:1.3;color:var(--muted);min-width:0}
.cx b{display:block;color:var(--ink);font-weight:650;white-space:nowrap}
.note{font-size:14px;color:var(--muted);margin-top:8px;max-width:60ch}
.stand{font-size:16px;color:var(--muted);max-width:44ch}
.track{margin-top:6px;max-width:520px}
.track+.stand{margin-top:16px}
.rail{margin:4px 9px}
.rail svg{display:block;width:100%;height:18px;overflow:visible}
.rail .t{fill:var(--line)}.rail .f{fill:var(--muted)}.rail .f.good{fill:var(--green)}
.rail .end{fill:var(--paper);stroke:var(--ink);stroke-width:2.5}
.rail .now{fill:var(--red);stroke:var(--paper);stroke-width:3}.rail .nowr{fill:var(--red)}
.card .rail .end{fill:var(--card)}.card .rail .now{stroke:var(--card)}
.ends{display:flex;justify-content:space-between;gap:12px;font-size:14px;color:var(--muted)}
.ends b{display:block;color:var(--ink)}
.ends span:last-child{text-align:right}
.rest{padding:44px 0 0;border-top:3px double var(--ink);margin-top:44px}
.rest h2{font-size:24px}
.pats{margin-top:16px;max-width:760px}
.pats li{display:grid;grid-template-columns:minmax(0,15em) minmax(40px,1fr) 5.2em;gap:12px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:15px}
.pbar{display:block;width:100%;height:8px}
.pbar .t{fill:var(--soft)}.pbar .f{fill:var(--muted)}
.pats li.f .pbar .f{fill:var(--ink)}
.pats em{font:600 11.5px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-left:6px;white-space:nowrap}
.pats .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
.cols{display:grid;gap:26px;margin-top:30px}
.cols h3{margin-top:0}
.facts{display:grid;grid-template-columns:minmax(0,7.5em) minmax(0,1fr);gap:6px 16px;font-size:15px}
.facts dt{color:var(--muted)}
.facts dd{overflow-wrap:anywhere}
.rlist li{font-size:15px}
.rlist a,.rlist span{display:inline-flex;align-items:center;min-height:44px}
.cmd{display:block;overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:4px 0 10px}
details{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:0 16px;margin-top:34px}
summary{cursor:pointer;font-weight:650;padding:13px 0;font-size:15px;min-height:44px}
details[open]{padding-bottom:14px}
.dlines li{font-size:14.5px;padding:3px 0;font-variant-numeric:tabular-nums}
.tcap{font-size:14px;font-weight:650;margin-top:14px}
.tbl{overflow-x:auto}
table{border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums;margin:4px 0 6px}
th,td{border-bottom:1px solid var(--line);padding:5px 10px;text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left;padding-left:0}
th{font-weight:650}
.foot{margin-top:48px;padding:18px 0 40px;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
@media (min-width:520px){.verdicts li{grid-template-columns:13em minmax(0,1fr);gap:6px 16px;align-items:center}}
@media (min-width:760px){
.ex{grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:28px;padding:22px}
.two{grid-template-columns:5fr 6fr;gap:36px;align-items:start}
.cols{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}}
@media (min-width:860px){
.cards{grid-template-columns:1fr 1fr}
.cards.one{grid-template-columns:minmax(0,560px)}
.habit{padding:26px 30px}
.colk{display:grid;grid-template-columns:minmax(0,5fr) 44px minmax(0,7fr);gap:0 16px;margin-top:18px;font:600 12px var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.colk span:last-child{grid-column:3}
.steps{margin-top:8px}
.step{grid-template-columns:minmax(0,5fr) 44px minmax(0,7fr);gap:0 16px;align-items:start;padding:22px 0}
.join{justify-content:center;padding:34px 0 0}
.join svg{transform:none}
.do-t{font-size:21px}}
@media (max-width:859px){
.index{display:block;margin-top:14px;border-top:1px solid var(--line)}
.index a{display:grid;grid-template-columns:1.3em minmax(0,1fr) auto;gap:8px;align-items:baseline;min-height:44px;padding:9px 0;border-bottom:1px solid var(--line);text-decoration:none}
.ix-n{font:italic 700 22px/1 var(--serif);color:var(--cobalt)}
.ix-t{font:700 16.5px/1.25 var(--serif);overflow-wrap:anywhere}
.ix-c{font-size:13.5px;color:var(--muted);white-space:nowrap}
.cards{margin-top:20px}}
@media (max-width:759px){
.js .ex.shut{display:none}
.js .morebtn{display:flex}
.morebtn[hidden]{display:none!important}
.js .cap{display:grid;margin-top:8px;padding:9px 10px;border-radius:10px;background:var(--soft);font-size:15.5px;line-height:1.45}
.cap .c{grid-area:1/1;visibility:hidden}
.cap .c.on{visibility:visible}
.cap .c.hint{color:var(--muted);font-size:14px}
.cap .who{display:inline-block;padding:0 8px;margin-right:8px}}
@media (max-width:519px){
.wide{display:none}
.line{grid-template-columns:minmax(0,1fr);gap:4px}
.who{justify-self:start;padding:0 9px}
.pats li{grid-template-columns:minmax(0,1fr) 4.6em;gap:2px 10px}
.pats .pbar{grid-column:1/-1;grid-row:2}
.habit{padding:18px 16px;box-shadow:3px 3px 0 var(--soft)}
.done{flex-direction:column;align-items:flex-start;gap:10px}
.facts{grid-template-columns:minmax(0,1fr);gap:0}
.facts dt{margin-top:8px}
.ctl{gap:6px}
.ctl .ba{margin-left:0}
.ctl button{padding:8px 11px;font-size:13.5px}
.banner{padding:10px 14px}}
`;
