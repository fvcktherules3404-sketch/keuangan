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
$('#bOut').onclick=async()=>{await signOut(mAuth);await signOut(kAuth)};

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
  $('#syncIc').classList.add('spin');
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
  }catch(e){toast('Gagal tarik order: '+(e.code||e.message))}finally{$('#syncIc').classList.remove('spin')}
}
$('#bSync').onclick=()=>sync(false);

// ── RENDER ────────────────────────────
const sum=a=>a.reduce((t,x)=>t+Number(x.nominal||0),0);
const HARI=['Min','Sen','Sel','Rab','Kam','Jum','Sab'],BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const tgl=s=>{const d=new Date(s+'T00:00');return isNaN(d)?s:`${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]}`};
function itemHTML(x){const m=x.tipe==='masuk';
  return `<div class="item" data-edit="${x.id}"><div class="dot ${m?'in':'out'}">${m?'↓':'↑'}</div><div class="t"><div>${esc(x.ket)}</div><div class="tag">${GRUP_LABEL[x.grup]||''}${x.sumber==='auto'?' · otomatis':''}${m&&x.qty?` · ${x.qty} pcs`:''}</div></div><div class="n ${m?'g':'r'}">${m?'+':'-'}${rp(x.nominal)}</div></div>`}
const list=(a,empty='Belum ada catatan di bulan ini. Tekan + Catat untuk mulai.')=>{if(!a.length)return `<div class="empty">${empty}</div>`;let last='';
  return a.map(x=>{const h=x.tanggal!==last?`<div class="day">${tgl(x.tanggal)}</div>`:'';last=x.tanggal;return h+itemHTML(x)}).join('')};
const brk=(rows,tot,c)=>rows.map(([l,v])=>{const p=tot?Math.round(v/tot*100):0;return `<div class="bk"><i class="${c}" style="width:${p}%"></i><span>${l}</span><b>${rp(v)}</b></div>`}).join('');
const addM=(ym,d)=>{let [y,m]=ym.split('-').map(Number);m+=d;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')};
function trend(data){const ms=[5,4,3,2,1,0].map(i=>addM(bulan,-i));
  const v=ms.map(m=>[sum(data.filter(x=>x.bulan===m&&x.tipe==='masuk')),sum(data.filter(x=>x.bulan===m&&x.tipe==='keluar'))]);
  const mx=Math.max(1,...v.flat());
  $('#trend').innerHTML=ms.map((m,i)=>`<div class="col"><div class="bars"><i class="g" style="height:${v[i][0]/mx*100}%"></i><i class="r" style="height:${v[i][1]/mx*100}%"></i></div><span>${BLN[+m.slice(5)-1]}</span></div>`).join('')}
function render(){
  const data=all.filter(x=>!x.deleted), bln=data.filter(x=>x.bulan===bulan).sort((a,b)=>b.tanggal.localeCompare(a.tanggal));
  const masuk=sum(bln.filter(x=>x.tipe==='masuk')), keluar=bln.filter(x=>x.tipe==='keluar');
  const umum=sum(keluar.filter(x=>x.grup==='umum')), vendor=sum(keluar.filter(x=>x.grup==='vendor')), lain=sum(keluar.filter(x=>x.grup==='kaos_lain'));
  const totKeluar=umum+vendor+lain;
  const saldo=sum(data.filter(x=>x.bulan<=bulan&&x.tipe==='masuk'))-sum(data.filter(x=>x.bulan<=bulan&&x.tipe==='keluar'));
  $('#sSaldo').textContent=rp(saldo);$('#sMasuk').textContent=rp(masuk);$('#sKeluar').textContent=rp(totKeluar);
  $('#sUmum').textContent=rp(umum);$('#sKaos').textContent=rp(vendor+lain);
  const sisa=masuk-totKeluar;$('#sSisa').textContent=rp(sisa);$('#sSisa').className=sisa>=0?'g':'r';
  const pct=masuk>0?Math.min(100,Math.round(totKeluar/masuk*100)):(totKeluar?100:0);$('#sBar').style.width=pct+'%';$('#sPct').textContent=masuk>0?pct+'% pemasukan terpakai':'Belum ada pemasukan bulan ini';
  const mm=bln.filter(x=>x.tipe==='masuk');
  $('#lRecent').innerHTML=list(bln.slice(0,5));$('#lMasuk').innerHTML=list(mm);$('#lKeluar').innerHTML=list(keluar);
  $('#pMasuk').textContent=rp(masuk);$('#pKeluar').textContent=rp(totKeluar);
  $('#bkMasuk').innerHTML=brk([['Kaos',sum(mm.filter(x=>x.grup==='kaos'))],['Lainnya',sum(mm.filter(x=>x.grup!=='kaos'))]],masuk,'g');
  $('#bkKeluar').innerHTML=brk([['Umum',umum],['Kaos · Vendor',vendor],['Kaos · Perlengkapan lain',lain]],totKeluar,'r');
  trend(data);
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
  $('#ttl').textContent=JUDUL[v];document.body.classList.remove('nav-open');scrollTo(0,0)}
window.addEventListener('hashchange',()=>show(location.hash.slice(1)));
$('#bMenu').onclick=()=>document.body.classList.toggle('nav-open');
$('#scrim').onclick=()=>document.body.classList.remove('nav-open');

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
  const t=e.target.closest('[data-add],[data-edit],[data-del],[data-chip],[data-f],[data-go],[data-nav]');if(!t)return;
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

show(location.hash.slice(1));
