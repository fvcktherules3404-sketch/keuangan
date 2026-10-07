import {initializeApp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithCredential,signInWithEmailAndPassword,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getFirestore,collection,doc,setDoc,addDoc,deleteDoc,getDocs,onSnapshot,query,orderBy} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Firebase UTAMA (website) — hanya BACA order
const mainApp = initializeApp({apiKey:"AIzaSyCVL_C4opQiKC6fNG_Rw4l-519rQZICH58",authDomain:"fvcktherules-store.firebaseapp.com",projectId:"fvcktherules-store",storageBucket:"fvcktherules-store.firebasestorage.app",messagingSenderId:"382347904485",appId:"1:382347904485:web:6715a7b395d44ad07a5b0c"},"main");
// Firebase KEUANGAN (simpan data keuangan)
const kApp = initializeApp({apiKey:"AIzaSyBmm72IP9rcM1vImVr669QCVSQkmYj5m5c",authDomain:"keuangan-fvck.firebaseapp.com",projectId:"keuangan-fvck",storageBucket:"keuangan-fvck.firebasestorage.app",messagingSenderId:"49114814826",appId:"1:49114814826:web:f33f3d3acd89eb4f87ad13"});
const mAuth=getAuth(mainApp), kAuth=getAuth(kApp), mDb=getFirestore(mainApp), kDb=getFirestore(kApp);

// Pengaturan hitung pemasukan otomatis dari order
const HITUNG_ONGKIR = false;                       // false = ongkir tidak dihitung sbg pemasukan
const STATUS_PENUH = ['lunas','selesai','dikirim']; // dihitung penuh; 'dp' dihitung sebesar DP

const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>(n<0?'-':'')+'Rp'+Math.abs(Math.round(n)).toLocaleString('id-ID');
const toast=t=>{const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',3000)};
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};

let filt='', all=[], bulan=today().slice(0,7), tab='trx', editing=null, synced=false;
const GRUP_LABEL={umum:'Umum',vendor:'Kaos · Vendor',kaos_lain:'Kaos · Lain',kaos:'Kaos',lain:'Lainnya'};

// ── LOGIN ─────────────────────────────
async function loginGoogle(){
  const r=await signInWithPopup(mAuth,new GoogleAuthProvider());
  await signInWithCredential(kAuth,GoogleAuthProvider.credentialFromResult(r));
}
$('#bGoogle').onclick=()=>loginGoogle().catch(e=>$('#lErr').textContent=e.code||e.message);
$('#bEmail').onclick=async()=>{try{const e=$('#lEmail').value.trim(),p=$('#lPass').value;
  await signInWithEmailAndPassword(mAuth,e,p);await signInWithEmailAndPassword(kAuth,e,p);}catch(x){$('#lErr').textContent=x.code||x.message}};
document.querySelectorAll('[data-out]').forEach(b=>b.onclick=async()=>{await signOut(mAuth);await signOut(kAuth)});

let unsub=null;
onAuthStateChanged(kAuth,u=>{
  $('#login').classList.toggle('hide',!!u);$('#app').classList.toggle('hide',!u);
  if(unsub){unsub();unsub=null}
  if(!u){all=[];synced=false;return}
  $('#mIn').value=bulan;
  unsub=onSnapshot(collection(kDb,'transaksi'),s=>{all=s.docs.map(d=>({id:d.id,...d.data()}));render();
    if(!synced){synced=true;sync(true)}},e=>toast('Gagal baca data: '+(e.code||e.message)));
});

// ── SINKRON DARI WEBSITE UTAMA ─────────
async function sync(silent){
  if(!mAuth.currentUser){if(!silent)toast('Login ulang dulu (Keluar → Masuk) agar bisa tarik order');return}
  document.querySelectorAll('.syncIc').forEach(e=>e.classList.add('spin'));
  try{
    const snap=await getDocs(query(collection(mDb,'orders'),orderBy('createdAt','desc')));
    const ex=new Map(all.map(x=>[x.id,x])); let n=0; const jobs=[];
    for(const d of snap.docs){
      const o=d.data(), st=String(o.status||'').toLowerCase(), id='order_'+d.id, old=ex.get(id);
      if(old&&(old.edited||old.deleted))continue;
      let nom=0;
      if(st==='dp')nom=Number(o.dpNominal||0);
      else if(STATUS_PENUH.includes(st))nom=Number(o.totalAkhir||0)-(HITUNG_ONGKIR?0:Number(o.ongkir||0));
      if(nom<=0){if(old){jobs.push(deleteDoc(doc(kDb,'transaksi',id)));n++}continue}
      const qty=Array.isArray(o.produk)?o.produk.length:1;
      const nama=o.produkText||(Array.isArray(o.produk)?o.produk.map(p=>p.nama).join(', '):o.produk)||'Order';
      const tgl=String(o.createdAt||'').slice(0,10)||today();
      if(old&&old.nominal===nom&&old.qty===qty)continue;
      jobs.push(setDoc(doc(kDb,'transaksi',id),{tipe:'masuk',grup:'kaos',bulan:tgl.slice(0,7),tanggal:tgl,
        ket:nama+(o.kodePelunasan?' ('+o.kodePelunasan+')':'')+(st==='dp'?' · DP':''),nominal:nom,qty,sumber:'auto',orderId:d.id,createdAt:old?.createdAt||Date.now()}));
      n++;
    }
    await Promise.all(jobs);
    if(!silent||n)toast(n?`${n} order disinkronkan`:'Sudah paling baru');
  }catch(e){toast('Gagal tarik order: '+(e.code||e.message))}finally{document.querySelectorAll('.syncIc').forEach(e=>e.classList.remove('spin'))}
}
document.querySelectorAll('[data-sync]').forEach(b=>b.onclick=()=>sync(false));

// ── RENDER ────────────────────────────
const sum=a=>a.reduce((t,x)=>t+Number(x.nominal||0),0);
const HARI=['Min','Sen','Sel','Rab','Kam','Jum','Sab'],BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const tgl=s=>{const d=new Date(s+'T00:00');return isNaN(d)?s:`${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]}`};
function itemHTML(x){const m=x.tipe==='masuk';
  return `<div class="item" data-edit="${x.id}"><div class="dot ${m?'in':'out'}">${m?'↓':'↑'}</div><div class="t"><div>${esc(x.ket)}</div><div class="tag">${GRUP_LABEL[x.grup]||''}${x.sumber==='auto'?' · otomatis':''}${m&&x.qty?` · ${x.qty} pcs`:''}</div></div><div class="n ${m?'g':'r'}">${m?'+':'-'}${rp(x.nominal)}</div></div>`}
const list=(a,empty='Belum ada catatan di bulan ini. Tekan “+ Catat” untuk mulai.')=>{if(!a.length)return `<div class="empty">${empty}</div>`;let last='';
  return a.map(x=>{const h=x.tanggal!==last?`<div class="day">${tgl(x.tanggal)}</div>`:'';last=x.tanggal;return h+itemHTML(x)}).join('')};
const brk=(rows,tot,c)=>rows.map(([l,v])=>{const p=tot?Math.round(v/tot*100):0;return `<div class="bk"><i class="${c}" style="width:${p}%"></i><span>${l}</span><b>${rp(v)}</b></div>`}).join('');
const addM=(ym,d)=>{let [y,m]=ym.split('-').map(Number);m+=d;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')};
const short=n=>{const a=Math.abs(n),s=n<0?'-':'';
  if(a>=1e9)return s+(a/1e9).toFixed(1).replace('.0','')+'M';
  if(a>=1e6)return s+(a/1e6).toFixed(1).replace('.0','')+'jt';
  if(a>=1e3)return s+Math.round(a/1e3)+'rb';return s+a};
const lastSix=()=>[5,4,3,2,1,0].map(i=>addM(bulan,-i));
function trend(data){const ms=lastSix();
  const v=ms.map(m=>[sum(data.filter(x=>x.bulan===m&&x.tipe==='masuk')),sum(data.filter(x=>x.bulan===m&&x.tipe==='keluar'))]);
  const mx=Math.max(1,...v.flat());
  $('#trend').innerHTML=ms.map((m,i)=>`<button type="button" class="col${m===bulan?' on':''}" data-month="${m}" aria-label="${BLN[+m.slice(5)-1]}"><div class="val">${m===bulan?`<span class="g">${short(v[i][0])}</span><span class="r">${short(v[i][1])}</span>`:''}</div><div class="bars"><i class="g" style="height:${v[i][0]/mx*100}%"></i><i class="r" style="height:${v[i][1]/mx*100}%"></i></div><span>${BLN[+m.slice(5)-1]}</span></button>`).join('')}
function lineChart(data){const ms=lastSix();
  const pts=ms.map(m=>sum(data.filter(x=>x.bulan<=m&&x.tipe==='masuk'))-sum(data.filter(x=>x.bulan<=m&&x.tipe==='keluar')));
  const W=320,H=150,L=8,R=8,T=26,B=24, mn=Math.min(0,...pts), mxv=Math.max(1,...pts), rg=(mxv-mn)||1;
  const X=i=>L+i*(W-L-R)/5, Y=v=>T+(1-(v-mn)/rg)*(H-T-B);
  const line=pts.map((v,i)=>`${i?'L':'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area=`${line} L${X(5)} ${Y(mn)} L${X(0)} ${Y(mn)}Z`;
  const zero=mn<0?`<line x1="${L}" x2="${W-R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#ffffff30" stroke-dasharray="3 4"/>`:'';
  $('#sLine').innerHTML=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik total kas 6 bulan">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd34d" stop-opacity=".35"/><stop offset="1" stop-color="#ffd34d" stop-opacity="0"/></linearGradient></defs>
    <line x1="${L}" x2="${W-R}" y1="${Y(mn)}" y2="${Y(mn)}" stroke="#ffffff1a"/>${zero}
    <path d="${area}" fill="url(#lg)"/><path d="${line}" fill="none" stroke="#ffd34d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="${i===5?5:3}" fill="${i===5?'#ffd34d':'#0a1510'}" stroke="#ffd34d" stroke-width="2"/>`).join('')}
    <text class="v" x="${X(5)}" y="${Y(pts[5])-11}" text-anchor="end">${short(pts[5])}</text>
    ${ms.map((m,i)=>`<text x="${X(i)}" y="${H-6}" text-anchor="${i===0?'start':i===5?'end':'middle'}">${BLN[+m.slice(5)-1]}</text>`).join('')}</svg>`}
function donut(parts,tot){const C=2*Math.PI*40; let off=0;
  const segs=tot>0?parts.map(p=>{const len=p.v/tot*C,e=`<circle cx="50" cy="50" r="40" fill="none" stroke="${p.c}" stroke-width="14" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>`;off+=len;return e}).join(''):'';
  $('#sDonut').innerHTML=`<div class="donut"><svg viewBox="0 0 100 100" role="img" aria-label="Komposisi pengeluaran"><circle cx="50" cy="50" r="40" fill="none" stroke="#ffffff12" stroke-width="14"/>${segs}
    <text x="50" y="49" text-anchor="middle" fill="#8da296" font-size="8">Keluar</text><text x="50" y="62" text-anchor="middle" fill="#f1f5ee" font-size="12" font-weight="800">${short(tot)}</text></svg>
    <div class="dl">${parts.map(p=>`<div><i class="sq" style="background:${p.c};margin:0"></i><span>${p.l}<br><small>${tot?Math.round(p.v/tot*100):0}%</small></span><b>${rp(p.v)}</b></div>`).join('')}</div></div>`}
function render(){
  const data=all.filter(x=>!x.deleted), bln=data.filter(x=>x.bulan===bulan).sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
  const masuk=sum(bln.filter(x=>x.tipe==='masuk')), keluar=bln.filter(x=>x.tipe==='keluar');
  const umum=sum(keluar.filter(x=>x.grup==='umum')), vendor=sum(keluar.filter(x=>x.grup==='vendor')), lain=sum(keluar.filter(x=>x.grup==='kaos_lain'));
  const totKeluar=umum+vendor+lain;
  const saldo=sum(data.filter(x=>x.bulan<=bulan&&x.tipe==='masuk'))-sum(data.filter(x=>x.bulan<=bulan&&x.tipe==='keluar'));
  $('#sSaldo').textContent=rp(saldo);$('#sSaldo').classList.toggle('neg',saldo<0);
  $('#sBlnLbl').textContent=BLN[+bulan.slice(5)-1]+' '+bulan.slice(0,4);$('#sMasuk').textContent=rp(masuk);$('#sKeluar').textContent=rp(totKeluar);
  $('#sUmum').textContent=rp(umum);$('#sKaos').textContent=rp(vendor+lain);
  const sisa=masuk-totKeluar;$('#sSisa').textContent=rp(sisa);$('#sSisa').className=sisa>=0?'g':'r';
  $('#sDelta').innerHTML=sisa===0?'<span class="mut">Belum ada perubahan bulan ini</span>':`<span class="${sisa>0?'g':'r'}">${sisa>0?'▲ +':'▼ '}${rp(sisa)}</span><span class="mut">bulan ini</span>`;
  const pct=masuk>0?Math.min(100,Math.round(totKeluar/masuk*100)):(totKeluar?100:0);$('#sBar').style.width=pct+'%';$('#sPct').textContent=masuk>0?pct+'% pemasukan terpakai':'Belum ada pemasukan bulan ini';
  const mm=bln.filter(x=>x.tipe==='masuk');
  $('#lRecent').innerHTML=list(bln.slice(0,5));$('#lMasuk').innerHTML=list(mm);$('#lKeluar').innerHTML=list(keluar);
  $('#pMasuk').textContent=rp(masuk);$('#pKeluar').textContent=rp(totKeluar);
  $('#bkMasuk').innerHTML=brk([['Kaos',sum(mm.filter(x=>x.grup==='kaos'))],['Lainnya',sum(mm.filter(x=>x.grup!=='kaos'))]],masuk,'g');
  $('#bkKeluar').innerHTML=brk([['Umum',umum],['Kaos · Vendor',vendor],['Kaos · Perlengkapan lain',lain]],totKeluar,'r');
  trend(data);lineChart(data);
  donut([{l:'Umum',v:umum,c:'#6cb2ff'},{l:'Vendor kaos',v:vendor,c:'#ffd34d'},{l:'Perlengkapan',v:lain,c:'#c58bff'}],totKeluar);
  // Rekap kaos
  const kIn=bln.filter(x=>x.tipe==='masuk'&&x.grup==='kaos'), kMasuk=sum(kIn), laba=kMasuk-vendor-lain;
  $('#kQty').textContent=kIn.reduce((t,x)=>t+Number(x.qty||0),0);$('#kMasuk').textContent=rp(kMasuk);
  $('#kVendor').textContent=rp(vendor);$('#kLain').textContent=rp(lain);
  $('#kLaba').textContent=rp(laba);$('#kLaba').className='big '+(laba>=0?'g':'r');
  $('#lVendor').innerHTML=list(keluar.filter(x=>x.grup==='vendor'));
  $('#lLain').innerHTML=list(keluar.filter(x=>x.grup==='kaos_lain'));
  $('#lKaosIn').innerHTML=list(kIn);
}
function setMonth(m){bulan=m;$('#mIn').value=m;render()}
const shift=d=>{let [y,m]=bulan.split('-').map(Number);m+=d;if(m<1){m=12;y--}if(m>12){m=1;y++}setMonth(y+'-'+String(m).padStart(2,'0'))};
$('#mPrev').onclick=()=>shift(-1);$('#mNext').onclick=()=>shift(1);$('#mIn').onchange=e=>e.target.value&&setMonth(e.target.value);
const VIEWS=['dash','masuk','keluar','kaos'],JUDUL={dash:'Dasbor',masuk:'Pemasukan',keluar:'Pengeluaran',kaos:'Rekap Kaos'};let cur='dash';
function show(v){if(!VIEWS.includes(v))v='dash';cur=v;
  VIEWS.forEach(x=>$('#v-'+x).classList.toggle('hide',x!==v));
  document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('on',b.dataset.nav===v));
  $('#ttl').textContent=JUDUL[v];scrollTo(0,0)}
window.addEventListener('hashchange',()=>show(location.hash.slice(1)));

// ── FORM TAMBAH / EDIT ────────────────
const CHIPS={umum:['Iklan','Follower','Website','Packing'],vendor:['DP vendor','Pelunasan vendor'],kaos_lain:['Stiker','Label','Plastik','Packing'],kaos:['Penjualan kaos'],lain:['Lainnya']};
function setTipe(t){$('#fTipe').value=t;document.querySelectorAll('#fSeg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t))}
function fillGrup(tipe,val){
  const opt=tipe==='masuk'?[['kaos','Kaos'],['lain','Lainnya']]:[['umum','Umum (iklan, website, dll)'],['vendor','Kaos · Vendor'],['kaos_lain','Kaos · Perlengkapan lain']];
  $('#fGrup').innerHTML=opt.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');if(val)$('#fGrup').value=val;
  $('#fQtyW').classList.toggle('hide',!(tipe==='masuk'&&$('#fGrup').value==='kaos'));
  $('#fChips').innerHTML=(CHIPS[$('#fGrup').value]||[]).map(c=>`<button type="button" data-chip="${esc(c)}">${esc(c)}</button>`).join('');
}
function openForm(x,preGrup){
  editing=x?.id||null;
  const tipe=x?.tipe||(preGrup==='kaos'?'masuk':'keluar');
  $('#fTitle').textContent=x?'Edit catatan':'Catat baru';setTipe(tipe);fillGrup(tipe,x?.grup||preGrup);
  $('#fTgl').value=x?.tanggal||(bulan===today().slice(0,7)?today():bulan+'-01');
  $('#fKet').value=x?.ket||'';$('#fNom').value=x?.nominal??'';$('#fQty').value=x?.qty??0;
  $('#fDel').classList.toggle('hide',!x);$('#sheet').classList.add('on');
  if(!x)setTimeout(()=>$('#fNom').focus(),60);
}
document.querySelectorAll('#fSeg button').forEach(b=>b.onclick=()=>{setTipe(b.dataset.t);fillGrup(b.dataset.t)});
$('#fGrup').onchange=()=>fillGrup($('#fTipe').value,$('#fGrup').value);
$('#fDel').onclick=async()=>{const id=editing;$('#sheet').classList.remove('on');await hapus(id)};
$('#fCancel').onclick=()=>$('#sheet').classList.remove('on');
$('#bAdd').onclick=()=>openForm(null,{kaos:'vendor',masuk:'kaos',keluar:'umum'}[cur]||null);
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-add],[data-edit],[data-del],[data-chip],[data-f],[data-go],[data-nav],[data-month],[data-ex],[data-cs],[data-ce],[data-cx]');if(!t)return;
  if(t.dataset.ex){$('#chatIn').value=t.dataset.ex;$('#chatIn').focus();return}
  if(t.dataset.cs){chatSave(t.dataset.cs,t);return}
  if(t.dataset.cx){delete pend[t.dataset.cx];t.closest('.bub').textContent='Dibatalkan.';return}
  if(t.dataset.ce){const d=pend[t.dataset.ce];if(d){popSet(false);openForm(d);$('#fDel').classList.add('hide');$('#fTitle').textContent='Periksa catatan';t.closest('.bub').textContent='Dibuka di form.'}return}
  if(t.dataset.month){setMonth(t.dataset.month);return}
  if(t.dataset.chip!==undefined){$('#fKet').value=t.dataset.chip;return}
  if(t.dataset.f!==undefined){filt=t.dataset.f;document.querySelectorAll('[data-f]').forEach(b=>b.classList.toggle('on',b===t));render();return}
  if(t.dataset.go||t.dataset.nav){const v=t.dataset.go||t.dataset.nav;location.hash=v;show(v);return}
  if(t.dataset.add)openForm(null,t.dataset.add);
  if(t.dataset.edit)openForm(all.find(x=>x.id===t.dataset.edit));
  if(t.dataset.del)hapus(t.dataset.del);
});
$('#fForm').onsubmit=async e=>{
  e.preventDefault();
  const old=all.find(x=>x.id===editing), tipe=$('#fTipe').value, grup=$('#fGrup').value, tgl=$('#fTgl').value;
  const d={tipe,grup,tanggal:tgl,bulan:tgl.slice(0,7),ket:$('#fKet').value.trim(),nominal:Number($('#fNom').value||0),
    qty:(tipe==='masuk'&&grup==='kaos')?Number($('#fQty').value||0):0,sumber:old?.sumber||'manual'};
  if(old?.sumber==='auto'){d.edited=true;d.orderId=old.orderId}
  try{
    if(editing)await setDoc(doc(kDb,'transaksi',editing),{...d,createdAt:old?.createdAt||Date.now()});
    else await addDoc(collection(kDb,'transaksi'),{...d,createdAt:Date.now()});
    $('#sheet').classList.remove('on');setMonth(d.bulan);toast('Tersimpan');
  }catch(x){toast('Gagal simpan: '+(x.code||x.message))}
};
async function hapus(id){
  const x=all.find(i=>i.id===id);if(!x||!confirm('Hapus "'+x.ket+'"?'))return;
  try{
    if(x.sumber==='auto')await setDoc(doc(kDb,'transaksi',id),{deleted:true,sumber:'auto',bulan:x.bulan,tipe:x.tipe,nominal:0}); // tanda agar tidak ditarik ulang
    else await deleteDoc(doc(kDb,'transaksi',id));
    toast('Dihapus');
  }catch(e){toast('Gagal hapus: '+(e.code||e.message))}
}

// ── CATAT CEPAT (CHATBOT ATURAN) ───────
const KW={
  vendor:/\b(vendor|konveksi|sablon|pelunasan|dp)\b/i,
  kaos_lain:/\b(stiker|sticker|label|plastik|packing|hangtag|tag|kardus|polybag|lakban)\b/i,
  umum:/\b(iklan|ads|follower|followers|website|web|domain|hosting|ongkir|admin)\b/i,
  masuk:/\b(masuk|terima|dapat|dapet|jual|terjual|laku|pemasukan|income|bayar dari)\b/i,
  kaos:/\b(kaos|jual|terjual|laku)\b/i
};
function parseChat(raw){
  let t=raw.trim(); if(!t)return null;
  let plus=/^\+/.test(t); t=t.replace(/^[+\-]\s*/,'');
  // qty
  let qty=0; const mq=t.match(/(\d+)\s*(pcs|pc|biji|buah)\b/i); if(mq){qty=+mq[1];t=t.replace(mq[0],' ')}
  // nominal
  const re=/(\d+(?:[.,]\d+)*)\s*(jt|juta|rb|ribu|k)?(?![a-z])/gi; let best=null,m;
  while((m=re.exec(t))){const suf=(m[2]||'').toLowerCase();let n=m[1],v;
    if(suf){v=parseFloat(n.replace(',','.'))*(/^(jt|juta)$/.test(suf)?1e6:1e3)}
    else v=parseFloat(n.replace(/[.,]/g,''));
    const sc=(suf?1e12:0)+v; if(!best||sc>best.sc)best={sc,v:Math.round(v),tok:m[0]};}
  if(!best||!(best.v>0))return {err:'Nominalnya belum ketemu. Coba tulis seperti: stiker 30k'};
  let ket=t.replace(best.tok,' ');
  // tanggal
  let d=new Date(); const mt=ket.match(/\b(?:tgl|tanggal)\s*(\d{1,2})\b/i);
  if(/\bkemarin\b/i.test(ket)){d.setDate(d.getDate()-1);ket=ket.replace(/\bkemarin\b/i,' ')}
  else if(mt){const [y,mo]=bulan.split('-').map(Number);d=new Date(y,mo-1,Math.min(31,+mt[1]));ket=ket.replace(mt[0],' ')}
  const tanggal=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  let tipe='keluar',grup='umum';
  if(plus||KW.masuk.test(t)){tipe='masuk';grup=(KW.kaos.test(t)||qty)?'kaos':'lain'}
  else if(KW.vendor.test(t))grup='vendor';
  else if(KW.kaos_lain.test(t))grup='kaos_lain';
  else if(KW.umum.test(t))grup='umum';
  ket=ket.replace(/\b(beli|bayar|untuk|buat|tadi|hari ini|masuk|terima|dapat|dapet|rp)\b/gi,' ').replace(/\s+/g,' ').trim();
  if(!ket)ket=GRUP_LABEL[grup];
  ket=ket.charAt(0).toUpperCase()+ket.slice(1);
  return {tipe,grup,tanggal,bulan:tanggal.slice(0,7),ket,nominal:best.v,qty:(tipe==='masuk'&&grup==='kaos')?qty:0,sumber:'chat'};
}
const pend={};let pid=0;
function bub(cls,html){const l=$('#chatLog');l.insertAdjacentHTML('beforeend',`<div class="bub ${cls}">${html}</div>`);while(l.children.length>14)l.firstChild.remove();l.scrollTop=l.scrollHeight;return l.lastElementChild}
function chatInit(){$('#chatLog').innerHTML='';bub('bot','Halo! Ketik catatannya, kelompoknya saya yang atur.')}
$('#chatForm').onsubmit=e=>{e.preventDefault();const v=$('#chatIn').value.trim();if(!v)return;
  bub('me',esc(v));$('#chatIn').value='';
  const r=parseChat(v);
  if(!r||r.err){bub('bot',esc(r?.err||'Tulis dulu catatannya.'));return}
  const id=++pid;pend[id]=r;const m=r.tipe==='masuk';
  bub('bot',`<div class="pv"><span>${esc(r.ket)}</span><b class="${m?'g':'r'}">${m?'+':'-'}${rp(r.nominal)}</b><span class="tag">${m?'Pemasukan':'Pengeluaran'} · ${GRUP_LABEL[r.grup]}${r.qty?` · ${r.qty} pcs`:''} · ${tgl(r.tanggal)}</span></div><div class="acts"><button class="pri" data-cs="${id}">Simpan</button><button data-ce="${id}">Ubah</button><button data-cx="${id}">Batal</button></div>`)};
async function chatSave(id,btn){const d=pend[id];if(!d)return;
  try{await addDoc(collection(kDb,'transaksi'),{...d,createdAt:Date.now()});delete pend[id];
    btn.closest('.bub').innerHTML=`✓ Tersimpan: <b>${esc(d.ket)}</b> ${d.tipe==='masuk'?'+':'-'}${rp(d.nominal)}`;
    if(d.bulan!==bulan)setMonth(d.bulan);toast('Tersimpan')}
  catch(x){toast('Gagal simpan: '+(x.code||x.message))}}
chatInit();
const popSet=o=>{$('#chatPop').classList.toggle('hide',!o);$('#bBot').setAttribute('aria-expanded',o);if(o)setTimeout(()=>$('#chatIn').focus(),60)};
$('#bBot').onclick=()=>popSet($('#chatPop').classList.contains('hide'));
$('#bBotX').onclick=()=>popSet(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')popSet(false)});

// ── SEMBUNYIKAN NOMINAL ───────────────
const eyeSet=h=>{document.body.classList.toggle('hide-bal',h);const u=$('#bEye use');if(u)u.setAttribute('href',h?'#i-eyeoff':'#i-eye');try{localStorage.setItem('hideBal',h?'1':'')}catch{}};
$('#bEye').onclick=()=>eyeSet(!document.body.classList.contains('hide-bal'));
try{eyeSet(!!localStorage.getItem('hideBal'))}catch{}

show(location.hash.slice(1));
