/**
 * APLIKASI PERAMALAN KEBUTUHAN SPAREPART
 * Lapisan penyajian - dijalankan di hosting sendiri.
 *
 * Situs ini tidak menyimpan data apa pun. Seluruh data dibaca dan ditulis
 * melalui Google Apps Script, dan seluruh perhitungan dilakukan di peramban.
 */

/* ============================================================
   1. KONFIGURASI  -  ISI BAGIAN INI SETELAH MENERBITKAN APPS SCRIPT
   ============================================================ */

var API_URL = 'https://script.google.com/macros/s/AKfycbzBF4dh9HErj9CQKS6c7HP1hU_VNuMDAuVVFE_3PCcR77PQ0ZEjHiiH52Udavm4OYwG7A/exec';   // .../exec

/* ============================================================
   2. KEADAAN APLIKASI
   ============================================================ */

var sesi   = { token: '', nama: '', peran: '' };
var data   = { barang: [], pemakaian: [], periodeTerakhir: '' };
var hasil  = {};       // kode barang -> hasil perhitungan
var pilihan = null;    // barang yang sedang dipilih di form input

var TAB = {
  admin:    [['tRencana', 'Rencana Pembelian'], ['tInput', 'Input & Koreksi'],
             ['tAnalisis', 'Analisis Metode'], ['tBarang', 'Data Barang'],
             ['tPengguna', 'Pengguna']],
  logistik: [['tRencana', 'Rencana Pembelian']],
  gudang:   [['tInput', 'Input Pemakaian']]
};

var SEMUA_TAB = ['tRencana', 'tInput', 'tAnalisis', 'tBarang', 'tPengguna'];

var $ = function (id) { return document.getElementById(id); };

/** Nama pengguna selalu disimpan dan ditampilkan dalam huruf besar. */
function paksaHurufBesar(id) {
  var el = $(id);
  el.addEventListener('input', function () {
    var posisi = el.selectionStart;
    el.value = el.value.toUpperCase();
    try { el.setSelectionRange(posisi, posisi); } catch (e) { /* abaikan */ }
  });
}
paksaHurufBesar('namaMasuk');
paksaHurufBesar('uNama');

/* ============================================================
   3. PENGHUBUNG KE SERVER
   ============================================================ */

function tunggu(nyala) { $('tunggu').classList.toggle('sembunyi', !nyala); }

/* ------------------------- tanda sambungan ------------------------- */

var KEADAAN = {
  memeriksa: ['Memeriksa sambungan\u2026', 'Memeriksa\u2026',
              'Sedang menghubungi server.'],
  sambung:   ['Terhubung ke server', 'Terhubung',
              'Aplikasi terhubung ke Google Apps Script. Data tersimpan ke Google Sheets.'],
  putus:     ['Server tidak dapat dihubungi', 'Tidak terhubung',
              'Periksa sambungan internet, atau alamat Web App pada app.js.'],
  lambat:    ['Server tidak menjawab', 'Tidak menjawab',
              'Permintaan tidak dijawab dalam 15 detik. Coba muat ulang halaman.'],
  contoh:    ['Mode contoh \u2014 data tidak tersimpan', 'Mode contoh',
              'Alamat Web App belum diisi, jadi aplikasi memakai data contoh di memori.']
};

var keadaanKini = '';

function tandaiSambungan(keadaan) {
  if (keadaan === keadaanKini) return;
  keadaanKini = keadaan;
  var k = KEADAAN[keadaan];

  var a = $('statusMasuk');
  a.className = 'status-koneksi ' + keadaan;
  a.title = k[2];
  a.lastElementChild.textContent = k[0];

  var b = $('lencanaKoneksi');
  b.className = 'lencana lencana-koneksi ' + keadaan;
  b.title = k[2];
  b.lastElementChild.textContent = k[1];
}

/** Dipanggil setiap kali ada jawaban, agar tanda selalu mutakhir. */
function catatSambungan(j) {
  if (MODE_CONTOH) return j;
  if (j && j.luring) tandaiSambungan('putus');
  else if (j) tandaiSambungan('sambung');
  return j;
}

/** Selama URL belum diisi, aplikasi berjalan dengan data contoh di memori. */
var MODE_CONTOH = (API_URL.indexOf('http') !== 0);

function ambil(aksi, isian, diam) {
  var janji;
  if (MODE_CONTOH) {
    janji = Contoh.jawab(aksi, Object.assign({ token: sesi.token }, isian || {}));
  } else {
    var q = new URLSearchParams(Object.assign({ aksi: aksi, token: sesi.token }, isian || {}));
    janji = fetch(API_URL + '?' + q.toString())
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, luring: true, pesan: 'Tidak dapat menghubungi server.' }; });
  }
  return diam ? janji : periksaSesi(janji);
}

/** Bila server menyatakan sesi berakhir, kembalikan pengguna ke halaman masuk. */
function periksaSesi(janji) {
  return janji.then(function (j) {
    catatSambungan(j);
    if (j && j.sesiHabis) {
      alert(j.pesan || 'Sesi berakhir. Silakan masuk kembali.');
      location.reload();
    }
    return j;
  });
}

function kirim(aksi, isian) {
  if (MODE_CONTOH) return periksaSesi(Contoh.jawab(aksi, Object.assign({ token: sesi.token }, isian || {})));

  // Content-Type text/plain agar peramban tidak melakukan permintaan pendahuluan
  // (preflight), yang tidak dilayani oleh Google Apps Script.
  return periksaSesi(fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ aksi: aksi, token: sesi.token }, isian || {}))
  })
    .then(function (r) { return r.json(); })
    .catch(function () { return { ok: false, luring: true, pesan: 'Tidak dapat menghubungi server.' }; }));
}

/** Masuk memakai nama dan kata sandi, bukan token. */
function masukKe(nama, sandi) {
  var isian = { aksi: 'masuk', nama: nama, sandi: sandi };
  if (MODE_CONTOH) return Contoh.jawab('masuk', isian);
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(isian)
  })
    .then(function (r) { return r.json(); })
    .catch(function () { return { ok: false, luring: true, pesan: 'Tidak dapat menghubungi server.' }; })
    .then(catatSambungan);
}


/* ============================================================
   3b. JENDELA (dialog di dalam halaman)
   ============================================================ */

var jendelaAksi = null;

function bukaJendela(judul, isi, labelSimpan, aksi) {
  $('judulJendela').textContent = judul;
  $('isiJendela').innerHTML = isi;
  $('jSimpan').textContent = labelSimpan || 'Simpan';
  $('jSimpan').classList.toggle('sembunyi', !aksi);
  $('jBatal').textContent = aksi ? 'Batal' : 'Tutup';
  jendelaAksi = aksi || null;
  $('tirai').classList.remove('sembunyi');

  var pertama = $('isiJendela').querySelector('input');
  if (pertama) pertama.focus();

  Array.prototype.forEach.call($('isiJendela').querySelectorAll('[data-lihat]'), function (b) {
    b.onclick = function () {
      var t = $(b.getAttribute('data-lihat'));
      var tampak = t.type === 'text';
      t.type = tampak ? 'password' : 'text';
      b.textContent = tampak ? 'lihat' : 'sembunyikan';
    };
  });

  Array.prototype.forEach.call($('isiJendela').querySelectorAll('[data-salin]'), function (b) {
    b.onclick = function () { salinTeks(b.getAttribute('data-salin'), b); };
  });
}

function tutupJendela() {
  $('tirai').classList.add('sembunyi');
  $('isiJendela').innerHTML = '';
  jendelaAksi = null;
}

function pesanJendela(teks, gagal) {
  var el = $('isiJendela').querySelector('.pesan');
  if (el) { el.className = 'pesan ' + (gagal ? 'gagal' : 'ok'); el.textContent = teks; }
}

$('jBatal').addEventListener('click', tutupJendela);
$('jSimpan').addEventListener('click', function () { if (jendelaAksi) jendelaAksi(); });
$('tirai').addEventListener('mousedown', function (e) { if (e.target === $('tirai')) tutupJendela(); });
document.addEventListener('keydown', function (e) {
  if ($('tirai').classList.contains('sembunyi')) return;
  if (e.key === 'Escape') tutupJendela();
  if (e.key === 'Enter' && jendelaAksi && e.target.tagName === 'INPUT') { e.preventDefault(); jendelaAksi(); }
});

/** Jendela penegasan, pengganti confirm() bawaan peramban. */
function konfirmasi(judul, teks, labelYa, aksi) {
  bukaJendela(judul, '<p class="catatan">' + aman(teks) + '</p>', labelYa, function () {
    tutupJendela();
    aksi();
  });
}

function isianSandi(id, label, nilai, petunjuk) {
  return '<div class="baris-isi"><label for="' + id + '">' + label + '</label>' +
         '<div class="isi-sandi"><input type="password" id="' + id + '" autocomplete="off" value="' +
         aman(nilai || '') + '" placeholder="' + aman(petunjuk || '') + '">' +
         '<button type="button" data-lihat="' + id + '">lihat</button></div></div>';
}

function salinTeks(teks, tombol) {
  var selesai = function () {
    var asli = tombol.textContent;
    tombol.textContent = 'tersalin';
    setTimeout(function () { tombol.textContent = asli; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(teks).then(selesai, function () { salinCadangan(teks, selesai); });
  } else {
    salinCadangan(teks, selesai);
  }
}

function salinCadangan(teks, selesai) {
  var t = document.createElement('textarea');
  t.value = teks;
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  try { document.execCommand('copy'); selesai(); } catch (e) { /* abaikan */ }
  document.body.removeChild(t);
}

/** Menampilkan nama dan sandi baru agar dapat dicatat atau disalin. */
function jendelaKredensial(judul, nama, sandi, catatan) {
  bukaJendela(judul,
    '<div class="baris-kredensial"><span>Nama pengguna</span><span><strong>' + aman(nama) + '</strong></span></div>' +
    '<div class="kotak-sandi">' + aman(sandi) + '</div>' +
    '<div class="jendela-tombol" style="margin-top:0">' +
    '<button type="button" class="tombol-kecil" data-salin="' + aman(sandi) + '">Salin sandi</button></div>' +
    '<p class="catatan">' + aman(catatan) + '</p>', '', null);
}

/* ============================================================
   4. MASUK DAN KELUAR
   ============================================================ */

$('formMasuk').addEventListener('submit', function (e) {
  e.preventDefault();
  var nama = $('namaMasuk').value.trim().toUpperCase();
  var sandi = $('sandiMasuk').value;
  if (!nama || !sandi) return;

  $('pesanMasuk').textContent = '';
  $('tombolMasuk').disabled = true;
  tunggu(true);

  masukKe(nama, sandi).then(function (j) {
    tunggu(false);
    $('tombolMasuk').disabled = false;
    if (!j.ok) { $('pesanMasuk').textContent = j.pesan || 'Nama pengguna atau kata sandi salah.'; return; }
    sesi = { token: j.token, nama: j.nama, peran: j.peran };
    $('sandiMasuk').value = '';
    bukaAplikasi();
  });
});

$('tombolKeluar').addEventListener('click', function () {
  kirim('keluar').then(function () { location.reload(); });
});

$('tombolSandiku').addEventListener('click', function () {
  bukaJendela('Ganti kata sandi',
    isianSandi('gsLama', 'Kata sandi lama') +
    isianSandi('gsBaru', 'Kata sandi baru (minimal 8 karakter)') +
    isianSandi('gsUlang', 'Ketik ulang kata sandi baru') +
    '<p class="pesan"></p>',
    'Simpan', function () {
      var lama  = $('gsLama').value;
      var baru  = $('gsBaru').value;
      var ulang = $('gsUlang').value;

      if (!lama) return pesanJendela('Kata sandi lama wajib diisi.', true);
      if (baru.length < 8) return pesanJendela('Kata sandi baru minimal 8 karakter.', true);
      if (baru !== ulang) return pesanJendela('Ketikan ulang tidak sama.', true);
      if (baru === lama) return pesanJendela('Kata sandi baru harus berbeda dari yang lama.', true);

      tunggu(true);
      kirim('ubahSandi', { nama: sesi.nama, sandiLama: lama, sandi: baru }).then(function (j) {
        tunggu(false);
        if (!j.ok) return pesanJendela(j.pesan || 'Gagal mengubah kata sandi.', true);
        tutupJendela();
        bukaJendela('Kata sandi diperbarui',
          '<p class="catatan">Kata sandi Anda sudah diganti. Pakai kata sandi baru ' +
          'pada saat masuk berikutnya.</p>', '', null);
      });
    });
});

function bukaAplikasi() {
  $('layarMasuk').classList.add('sembunyi');
  $('layarAplikasi').classList.remove('sembunyi');
  $('labelPengguna').textContent = sesi.nama + ' \u00b7 ' +
    sesi.peran.charAt(0).toUpperCase() + sesi.peran.slice(1);
  susunTab();
  isiPilihanPeriode();
  muatData();
}

function susunTab() {
  var daftar = TAB[sesi.peran] || [];
  var baris = $('barisTab');
  baris.innerHTML = '';

  SEMUA_TAB.forEach(function (id) { $(id).classList.add('sembunyi'); });

  daftar.forEach(function (t, i) {
    var b = document.createElement('button');
    b.textContent = t[1];
    b.onclick = function () { gantiTab(t[0], b); };
    baris.appendChild(b);
    if (i === 0) gantiTab(t[0], b);
  });

  baris.classList.toggle('sembunyi', daftar.length < 2);
}

function gantiTab(id, tombol) {
  SEMUA_TAB.forEach(function (x) { $(x).classList.add('sembunyi'); });
  $(id).classList.remove('sembunyi');
  Array.prototype.forEach.call($('barisTab').children, function (b) { b.classList.remove('aktif'); });
  if (tombol) tombol.classList.add('aktif');
}

/* ============================================================
   5. MEMUAT DAN MENGHITUNG
   ============================================================ */
var waktuMuat = 0;          // kapan data terakhir diambil dari server
var JEDA_SEGAR = 15 * 60000; // 15 menit

function muatData() {
  tunggu(true);
  return ambil('data', { periode: $('isiPeriode').value || '' }).then(function (j) {
    tunggu(false);
    waktuMuat = Date.now();
    if (!j.ok) { bukaJendela('Gagal memuat data', '<p class="catatan">' + aman(j.pesan || '') + '</p>', '', null); return; }

    data.barang = j.barang || [];
    data.pemakaian = j.pemakaian || [];
    data.periodeTerakhir = j.periodeTerakhir || '';

    if (sesi.peran !== 'gudang') hitungSemua();

    if (sesi.peran === 'gudang' || sesi.peran === 'admin') gambarInput();
    if (sesi.peran === 'admin' || sesi.peran === 'logistik') gambarRencana();
    if (sesi.peran === 'admin') { isiPilihanItem(); gambarBarang(); muatPengguna(); }
  });
}

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  if (!sesi.token || !waktuMuat) return;
  if (Date.now() - waktuMuat < JEDA_SEGAR) return;
  muatData();
});

$('tombolSegarkan').addEventListener('click', function () {
  var t = $('tombolSegarkan');
  t.disabled = true;
  t.textContent = 'Memuat\u2026';
  muatData().then(function () {
    t.disabled = false;
    t.textContent = 'Muat ulang data';
  });
});

function hitungSemua() {
  hasil = {};
  var perItem = {};
  data.pemakaian.forEach(function (x) {
    (perItem[x.kode] = perItem[x.kode] || []).push(x);
});

  data.barang.forEach(function (b) {
    var deret = Peramalan.susunDeret(perItem[b.kode] || [], data.periodeTerakhir);
    hasil[b.kode] = deret.deret.length
      ? Peramalan.hitung(deret.deret, deret.periode)
      : { cukup: false, n: 0, minimal: Peramalan.MIN_PERIODE };
    hasil[b.kode].deret = deret;
  });
}

/* ============================================================
   6. TAMPILAN RENCANA PEMBELIAN
   ============================================================ */

function gambarRencana() {
  var target = data.periodeTerakhir ? Peramalan.periodeSetelah(data.periodeTerakhir) : '';
  $('ketRencana').textContent = target
    ? 'Perkiraan kebutuhan ' + Peramalan.namaPeriode(target) +
      ', berdasarkan data pemakaian sampai ' + Peramalan.namaPeriode(data.periodeTerakhir) + '.'
    : 'Belum ada data pemakaian.';

  var admin = sesi.peran === 'admin';
  var kolom = ['Kode', 'Nama barang', '3 bulan terakhir', 'Perkiraan',
               'Rentang wajar', 'Ketepatan', 'Usulan beli'];
  if (admin) kolom = kolom.concat(['MAPE', 'Metode terpilih']);

  var html = '<thead><tr>' + kolom.map(function (k, i) {
    return '<th class="' + (i >= 3 && i <= 4 ? 'angka' : '') + '">' + k + '</th>';
  }).join('') + '</tr></thead><tbody>';

  var aktif = data.barang.filter(function (b) { return b.aktif; });
  if (!aktif.length) {
    html += '<tr><td colspan="' + kolom.length + '">Belum ada data barang.</td></tr>';
  }

  aktif.forEach(function (b) {
    var h = hasil[b.kode] || { cukup: false };
    var tiga = h.deret && h.deret.deret.length
      ? h.deret.deret.slice(-3).join(' · ') : '—';

    html += '<tr>';
    html += '<td>' + aman(b.kode) + '</td>';
    html += '<td>' + aman(b.nama) + '</td>';
    html += '<td class="angka">' + tiga + '</td>';

    if (!h.cukup) {
      html += '<td class="angka">—</td><td class="angka">—</td>';
      html += '<td><span class="label belum">Data belum cukup (' + (h.n || 0) +
              '/' + Peramalan.MIN_PERIODE + ' bulan)</span></td>';
      html += '<td class="angka">—</td>';
      if (admin) html += '<td class="angka">—</td><td>—</td>';
    } else {
      html += '<td class="angka tebal">' + h.bulat + '</td>';
      html += '<td class="angka">' + (h.rentang ? h.rentang[0] + ' – ' + h.rentang[1] : '—') + '</td>';
      html += '<td>' + lencanaKategori(h.kategori) + '</td>';
      html += '<td class="angka tebal">' + h.bulat + '</td>';
      if (admin) {
        html += '<td class="angka">' + (h.mape === null ? '—' : h.mape.toFixed(2) + '%') + '</td>';
        html += '<td>' + (h.terbaik ? aman(h.terbaik.nama) : '—') + '</td>';
      }
    }
    html += '</tr>';
  });

  $('tabelRencana').innerHTML = html + '</tbody>';
}

function lencanaKategori(k) {
  var kelas = { 'Sangat baik': 'sangat-baik', 'Baik': 'baik', 'Cukup': 'cukup',
                'Kurang akurat': 'kurang' }[k] || 'belum';
  return '<span class="label ' + kelas + '">' + k + '</span>';
}

$('tombolUnduh').addEventListener('click', function () {
  var t = $('tabelRencana');
  var baris = [];
  Array.prototype.forEach.call(t.querySelectorAll('tr'), function (tr) {
    var sel = [];
    Array.prototype.forEach.call(tr.children, function (td) {
      sel.push('"' + td.textContent.replace(/"/g, '""').trim() + '"');
    });
    baris.push(sel.join(';'));
  });

  var target = data.periodeTerakhir ? Peramalan.periodeSetelah(data.periodeTerakhir) : 'rencana';
  var isi = '﻿' + baris.join('\r\n');
  var tautan = document.createElement('a');
  tautan.href = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
  tautan.download = 'rencana-pembelian-' + target + '.csv';
  tautan.click();
  URL.revokeObjectURL(tautan.href);
});

/* ============================================================
   7. INPUT PEMAKAIAN
   ============================================================ */

function isiPilihanPeriode() {
  var sel = $('isiPeriode');
  var kini = new Date();
  var p = kini.getFullYear() + '-' + (kini.getMonth() < 9 ? '0' : '') + (kini.getMonth() + 1);
  var daftar = [];
  for (var i = 0; i < 24; i++) { daftar.push(p); p = periodeSebelum(p); }

  sel.innerHTML = daftar.map(function (x) {
    return '<option value="' + x + '">' + Peramalan.namaPeriode(x) + '</option>';
  }).join('');

  sel.value = daftar[1];              // bawaan: bulan lalu
  sel.onchange = function () { pilihan = null; muatData(); };
}

function periodeSebelum(per) {
  var t = parseInt(per.slice(0, 4), 10);
  var b = parseInt(per.slice(5, 7), 10) - 1;
  if (b < 1) { b = 12; t -= 1; }
  return t + '-' + (b < 10 ? '0' + b : b);
}

function cariBarang(kode) {
  kode = String(kode || '').trim().toUpperCase().replace(/\s+/g, '');
  for (var i = 0; i < data.barang.length; i++) {
    if (data.barang[i].kode.toUpperCase().replace(/\s+/g, '') === kode) return data.barang[i];
  }
  return null;
}

function setelahPilih(b) {
  pilihan = b;
  var s = $('statusBarang');

  if (!b) {
    $('isiNama').value = '';
    $('labelSatuan').textContent = '';
    s.className = 'status-barang gagal';
    s.textContent = $('isiKode').value.trim() ? 'Kode tidak terdaftar.' : '';
    $('tombolSimpan').disabled = true;
    return;
  }

  $('isiKode').value = b.kode;
  $('isiNama').value = b.nama;
  $('labelSatuan').textContent = b.satuan || '';
  $('tombolSimpan').disabled = false;

  var per = $('isiPeriode').value;
  var ada = null;
  data.pemakaian.forEach(function (x) {
    if (x.kode === b.kode && x.periode === per) ada = x.jumlah;
  });

  s.className = 'status-barang ok';
  s.innerHTML = 'Barang ditemukan.' + (ada === null ? '' :
    '<span class="ingat">Periode ini sudah diisi: ' + ada + ' ' + aman(b.satuan) +
    '. Menyimpan akan mengganti angka tersebut.</span>');
  if (ada !== null && !$('isiJumlah').value) $('isiJumlah').value = ada;
}

$('isiKode').addEventListener('input', function () {
  setelahPilih(cariBarang(this.value));
});

/* ------------------------- pencarian nama ------------------------- */

(function pencarian() {
  var kotak = $('saranBarang');
  var input = $('isiNama');
  var sorot = -1;

  function tutup() { kotak.classList.add('sembunyi'); sorot = -1; }

  function cocok(kata) {
    kata = kata.trim().toLowerCase();
    if (!kata) return [];
    return data.barang.filter(function (b) {
      return b.aktif &&
        ((b.nama + ' ' + b.kode).toLowerCase().indexOf(kata) >= 0);
    }).slice(0, 12);
  }

  function gambar(daftar) {
    if (!daftar.length) {
      kotak.innerHTML = '<div class="kosong">Tidak ada barang yang cocok.</div>';
    } else {
      kotak.innerHTML = daftar.map(function (b, i) {
        return '<div data-i="' + i + '"><span class="kode">' + aman(b.kode) +
               '</span><span>' + aman(b.nama) + '</span></div>';
      }).join('');
      Array.prototype.forEach.call(kotak.children, function (el) {
        el.onmousedown = function (ev) {
          ev.preventDefault();
          setelahPilih(daftar[Number(el.getAttribute('data-i'))]);
          tutup();
          $('isiJumlah').focus();
        };
      });
    }
    kotak.classList.remove('sembunyi');
  }

  input.addEventListener('input', function () { gambar(cocok(this.value)); });
  input.addEventListener('focus', function () { if (this.value) gambar(cocok(this.value)); });
  input.addEventListener('blur', function () { setTimeout(tutup, 120); });

  input.addEventListener('keydown', function (e) {
    var anak = kotak.querySelectorAll('div[data-i]');
    if (kotak.classList.contains('sembunyi') || !anak.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sorot = (sorot + (e.key === 'ArrowDown' ? 1 : anak.length - 1)) % anak.length;
      Array.prototype.forEach.call(anak, function (el, i) { el.classList.toggle('sorot', i === sorot); });
      anak[sorot].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && sorot >= 0) {
      e.preventDefault();
      anak[sorot].onmousedown(e);
    } else if (e.key === 'Escape') {
      tutup();
    }
  });
})();

/* ------------------------- menyimpan ------------------------- */

$('formPakai').addEventListener('submit', function (e) {
  e.preventDefault();
  var pesan = $('pesanSimpan');

  if (!pilihan) { pesan.className = 'pesan gagal'; pesan.textContent = 'Pilih barang terlebih dahulu.'; return; }

  var jumlah = $('isiJumlah').value;
  if (jumlah === '' || Number(jumlah) < 0 || !isFinite(Number(jumlah))) {
    pesan.className = 'pesan gagal';
    pesan.textContent = 'Jumlah harus diisi dengan angka nol atau lebih.';
    return;
  }

  $('tombolSimpan').disabled = true;
  tunggu(true);

  kirim('simpanPemakaian', {
    kodeBarang: pilihan.kode,
    periode: $('isiPeriode').value,
    jumlah: Number(jumlah)
  }).then(function (j) {
    tunggu(false);
    $('tombolSimpan').disabled = false;
    pesan.className = 'pesan ' + (j.ok ? 'ok' : 'gagal');
    pesan.textContent = j.pesan || (j.ok ? 'Tersimpan.' : 'Gagal menyimpan.');
    if (j.ok) {
      $('isiKode').value = ''; $('isiNama').value = ''; $('isiJumlah').value = '';
      $('labelSatuan').textContent = ''; $('statusBarang').textContent = '';
      pilihan = null;
      muatData().then(function () { $('isiKode').focus(); });
    }
  });
});

function gambarInput() {
  var per = $('isiPeriode').value;
  $('judulTerisi').textContent = 'Sudah diisi pada ' + Peramalan.namaPeriode(per);

  var isi = data.pemakaian.filter(function (x) { return x.periode === per; });
  var admin = sesi.peran === 'admin';

  var html = '<thead><tr><th>Kode</th><th>Nama barang</th><th class="angka">Jumlah</th>' +
             (admin ? '<th></th>' : '') + '</tr></thead><tbody>';

  if (!isi.length) {
    html += '<tr><td colspan="' + (admin ? 4 : 3) + '">Belum ada data untuk periode ini.</td></tr>';
  }

  isi.sort(function (a, b) { return a.kode < b.kode ? -1 : 1; }).forEach(function (x) {
    var b = cariBarang(x.kode);
    html += '<tr><td>' + aman(x.kode) + '</td><td>' + aman(b ? b.nama : '(tidak terdaftar)') +
            '</td><td class="angka">' + x.jumlah + '</td>';
    if (admin) {
      html += '<td><button class="tombol-tabel bahaya" data-kode="' + aman(x.kode) +
              '" data-per="' + aman(x.periode) + '">hapus</button></td>';
    }
    html += '</tr>';
  });

  var t = $('tabelTerisi');
  t.innerHTML = html + '</tbody>';

  Array.prototype.forEach.call(t.querySelectorAll('button[data-kode]'), function (b) {
    b.onclick = function () {
      konfirmasi('Hapus data pemakaian',
        'Hapus data ' + b.dataset.kode + ' periode ' +
        Peramalan.namaPeriode(b.dataset.per) + '? Tindakan ini tidak dapat dibatalkan, ' +
        'tetapi tetap tercatat pada sheet LOG.',
        'Hapus', function () {
          tunggu(true);
          kirim('hapusPemakaian', { kodeBarang: b.dataset.kode, periode: b.dataset.per })
            .then(function (j) {
              tunggu(false);
              if (!j.ok) bukaJendela('Gagal menghapus', '<p class="catatan">' + aman(j.pesan) + '</p>', '', null);
              muatData();
            });
        });
    };
  });
}

/* ============================================================
   8. ANALISIS PERBANDINGAN METODE
   ============================================================ */

function isiPilihanItem() {
  var sel = $('pilihItem');
  sel.innerHTML = data.barang.filter(function (b) { return b.aktif; })
    .map(function (b) { return '<option value="' + aman(b.kode) + '">' + aman(b.kode) + ' — ' + aman(b.nama) + '</option>'; })
    .join('');
  sel.onchange = gambarAnalisis;
  gambarAnalisis();
}

function gambarAnalisis() {
  var kode = $('pilihItem').value;
  var h = hasil[kode];
  var wadah = $('isiAnalisis');

  if (!h) { wadah.innerHTML = '<p class="catatan">Pilih item terlebih dahulu.</p>'; return; }

  if (!h.cukup) {
    wadah.innerHTML = '<p class="catatan">Item ini baru memiliki ' + h.n +
      ' periode data. Peramalan memerlukan sekurang-kurangnya ' +
      Peramalan.MIN_PERIODE + ' periode.</p>';
    return;
  }

  var html = '<div class="kartu-ringkas">' +
    kartu('Jumlah data', h.n + ' periode') +
    kartu('Data latih', (h.n - h.nUji) + ' periode') +
    kartu('Data uji', h.nUji + ' periode') +
    kartu('Metode terpilih', h.terbaik.nama) +
    '</div>';

  // Tabel ramalan tiap periode uji
  html += '<h3>Perbandingan hasil ramalan pada data uji</h3><div class="gulir"><table><thead><tr>' +
          '<th>Periode</th><th class="angka">Aktual</th>' +
          h.metode.map(function (m) { return '<th class="angka">' + aman(m.nama) + '</th>'; }).join('') +
          '</tr></thead><tbody>';

  h.periodeUji.forEach(function (p, i) {
    html += '<tr><td>' + Peramalan.namaPeriode(p) + '</td>' +
            '<td class="angka">' + h.aktualUji[i] + '</td>' +
            h.metode.map(function (m) {
              var r = m.ramal[i];
              return '<td class="angka">' + (r === null ? '—' : r.toFixed(2)) + '</td>';
            }).join('') + '</tr>';
  });

  html += '</tbody></table></div>';

  // Tabel ketepatan
  html += '<h3>Tingkat ketepatan</h3><div class="gulir"><table><thead><tr>' +
          '<th>Metode</th><th class="angka">MAD</th><th class="angka">MSE</th>' +
          '<th class="angka">MAPE</th><th>Kategori</th><th>Keterangan</th>' +
          '</tr></thead><tbody>';

  h.metode.forEach(function (m) {
    var a = m.akurasi;
    html += '<tr' + (m === h.terbaik ? ' class="tebal"' : '') + '>' +
            '<td>' + aman(m.nama) + '</td>' +
            '<td class="angka">' + (a ? a.mad.toFixed(4) : '—') + '</td>' +
            '<td class="angka">' + (a ? a.mse.toFixed(4) : '—') + '</td>' +
            '<td class="angka">' + (a && a.mape !== null ? a.mape.toFixed(2) + '%' : '—') + '</td>' +
            '<td>' + lencanaKategori(m.kategori) + '</td>' +
            '<td>' + (m === h.terbaik ? 'Metode terpilih' : '') + '</td></tr>';
  });

  html += '</tbody></table></div>';

  // Ramalan periode berikutnya
  html += '<h3>Ramalan ' + Peramalan.namaPeriode(h.periodeTarget) + '</h3><div class="gulir"><table><thead><tr>' +
          '<th>Metode</th><th class="angka">Nilai ramalan</th></tr></thead><tbody>';
  h.metode.forEach(function (m) {
    var r = h.ramalanTiapMetode[m.kunci];
    html += '<tr' + (m === h.terbaik ? ' class="tebal"' : '') + '><td>' + aman(m.nama) +
            '</td><td class="angka">' + (r === null ? '—' : r.toFixed(4)) + '</td></tr>';
  });
  html += '</tbody></table></div>';

  html += '<p class="catatan">Metode terpilih adalah yang memiliki MAPE terkecil. ' +
          'Apabila selisih MAPE antarmetode kurang dari ' + Peramalan.AMBANG_MAPE +
          '%, penentuan dilakukan berdasarkan MAD dan MSE terkecil. ' +
          'Ramalan periode berikutnya dihitung menggunakan seluruh data yang tersedia.</p>';

  wadah.innerHTML = html;
}

function kartu(judul, nilai) {
  return '<div><span>' + aman(judul) + '</span><strong>' + aman(String(nilai)) + '</strong></div>';
}

/* ============================================================
   9. DATA BARANG
   ============================================================ */

$('formBarang').addEventListener('submit', function (e) {
  e.preventDefault();
  var pesan = $('pesanBarang');
  var kode = $('bKode').value.trim().toUpperCase();
  var nama = $('bNama').value.trim();

  if (!kode || !nama) {
    pesan.className = 'pesan gagal';
    pesan.textContent = 'Kode dan nama barang wajib diisi.';
    return;
  }

  var sudahAda = !!cariBarang(kode);
  if (sudahAda) {
    konfirmasi('Kode sudah terdaftar',
      'Kode ' + kode + ' sudah ada. Perbarui nama dan satuannya?',
      'Perbarui', function () { simpanDataBarang(kode, nama, true); });
    return;
  }
  simpanDataBarang(kode, nama, false);
});

function simpanDataBarang(kode, nama, sudahAda) {
  var pesan = $('pesanBarang');
  tunggu(true);
  kirim('simpanBarang', {
    kodeBarang: kode,
    nama: nama,
    satuan: $('bSatuan').value.trim() || 'pcs',
    baru: !sudahAda
  }).then(function (j) {
    tunggu(false);
    pesan.className = 'pesan ' + (j.ok ? 'ok' : 'gagal');
    pesan.textContent = j.pesan || '';
    if (j.ok) { $('bKode').value = ''; $('bNama').value = ''; $('bSatuan').value = 'pcs'; muatData(); }
  });
}

function gambarBarang() {
  var html = '<thead><tr><th>Kode</th><th>Nama barang</th><th>Satuan</th>' +
             '<th class="angka">Periode tercatat</th><th>Status</th><th></th></tr></thead><tbody>';

  if (!data.barang.length) html += '<tr><td colspan="6">Belum ada data barang.</td></tr>';

  data.barang.forEach(function (b) {
    var h = hasil[b.kode] || {};
    html += '<tr class="' + (b.aktif ? '' : 'mati') + '">' +
            '<td>' + aman(b.kode) + '</td><td>' + aman(b.nama) + '</td><td>' + aman(b.satuan) + '</td>' +
            '<td class="angka">' + (h.deret ? h.deret.deret.length : 0) + '</td>' +
            '<td>' + (b.aktif ? 'Aktif' : 'Nonaktif') + '</td>' +
            '<td><button class="tombol-tabel" data-ubah="' + aman(b.kode) + '">ubah</button>' +
            '<button class="tombol-tabel" data-aktif="' + aman(b.kode) + '" data-nilai="' +
            (b.aktif ? 'tidak' : 'ya') + '">' + (b.aktif ? 'nonaktifkan' : 'aktifkan') +
            '</button></td></tr>';
  });

  var t = $('tabelBarang');
  t.innerHTML = html + '</tbody>';

  Array.prototype.forEach.call(t.querySelectorAll('button[data-ubah]'), function (btn) {
    btn.onclick = function () {
      var b = cariBarang(btn.dataset.ubah);
      if (!b) return;
      $('bKode').value = b.kode; $('bNama').value = b.nama; $('bSatuan').value = b.satuan;
      $('bNama').focus();
    };
  });

  Array.prototype.forEach.call(t.querySelectorAll('button[data-aktif]'), function (btn) {
    btn.onclick = function () {
      tunggu(true);
      kirim('ubahAktif', { kodeBarang: btn.dataset.aktif, aktif: btn.dataset.nilai === 'ya' })
        .then(function (j) {
          tunggu(false);
          if (!j.ok) bukaJendela('Gagal', '<p class="catatan">' + aman(j.pesan) + '</p>', '', null);
          muatData();
        });
    };
  });
}


/* ============================================================
   9b. PENGGUNA  (hanya admin)
   ============================================================ */

var daftarPengguna = [];

function muatPengguna() {
  return ambil('daftarPengguna').then(function (j) {
    if (!j.ok) { $('tabelPengguna').innerHTML = ''; return; }
    daftarPengguna = j.pengguna || [];
    gambarPengguna();
  });
}

function gambarPengguna() {
  var html = '<thead><tr><th>Nama pengguna</th><th>Peran</th><th>Status</th>' +
             '<th>Dibuat</th><th></th></tr></thead><tbody>';

  if (!daftarPengguna.length) html += '<tr><td colspan="5">Belum ada pengguna.</td></tr>';

  daftarPengguna.forEach(function (u) {
    var sendiri = u.nama.toLowerCase() === String(sesi.nama).toLowerCase();
    html += '<tr class="' + (u.aktif ? '' : 'mati') + '">' +
            '<td>' + aman(u.nama) + (sendiri ? ' <span class="anak-judul">(Anda)</span>' : '') + '</td>' +
            '<td><select data-peran="' + aman(u.nama) + '"' + (sendiri ? ' disabled' : '') + '>' +
              ['gudang', 'logistik', 'admin'].map(function (r) {
                return '<option value="' + r + '"' + (u.peran === r ? ' selected' : '') + '>' +
                       r.charAt(0).toUpperCase() + r.slice(1) + '</option>';
              }).join('') +
            '</select></td>' +
            '<td>' + (u.aktif ? 'Aktif' : 'Nonaktif') + '</td>' +
            '<td>' + aman(u.dibuat) + '</td>' +
            '<td><button class="tombol-tabel" data-sandi="' + aman(u.nama) + '">atur ulang sandi</button>' +
            (sendiri ? '' :
              '<button class="tombol-tabel' + (u.aktif ? ' bahaya' : '') + '" data-status="' + aman(u.nama) +
              '" data-nilai="' + (u.aktif ? 'tidak' : 'ya') + '">' +
              (u.aktif ? 'nonaktifkan' : 'aktifkan') + '</button>') +
            '</td></tr>';
  });

  var t = $('tabelPengguna');
  t.innerHTML = html + '</tbody>';

  Array.prototype.forEach.call(t.querySelectorAll('select[data-peran]'), function (sel) {
    sel.onchange = function () {
      var u = cariPengguna(sel.dataset.peran);
      simpanStatusPengguna(sel.dataset.peran, u ? u.aktif : true, sel.value);
    };
  });

  Array.prototype.forEach.call(t.querySelectorAll('button[data-status]'), function (btn) {
    btn.onclick = function () {
      var aktif = btn.dataset.nilai === 'ya';
      if (aktif) return simpanStatusPengguna(btn.dataset.status, true, '');
      konfirmasi('Nonaktifkan akun',
        'Nonaktifkan akun "' + btn.dataset.status + '"? Akun tidak dihapus dan ' +
        'jejaknya pada sheet LOG tetap utuh, tetapi tidak dapat dipakai masuk lagi.',
        'Nonaktifkan', function () { simpanStatusPengguna(btn.dataset.status, false, ''); });
    };
  });

  Array.prototype.forEach.call(t.querySelectorAll('button[data-sandi]'), function (btn) {
    btn.onclick = function () {
      var nama = btn.dataset.sandi;
      var sendiri = nama.toLowerCase() === String(sesi.nama).toLowerCase();
      if (sendiri) { $('tombolSandiku').click(); return; }

      bukaJendela('Atur ulang sandi \u00b7 ' + nama,
        '<p class="catatan">Sandi lama tidak diperlukan. Sandi baru langsung berlaku, ' +
        'dan sebaiknya diminta diganti sendiri oleh yang bersangkutan setelah masuk.</p>' +
        isianSandi('rsBaru', 'Kata sandi baru', '', 'minimal 8 karakter') +
        '<p class="pesan"></p>',
        'Atur ulang', function () {
          var baru = $('rsBaru').value;
          if (baru.length < 8) return pesanJendela('Kata sandi minimal 8 karakter.', true);

          tunggu(true);
          kirim('ubahSandi', { nama: nama, sandi: baru }).then(function (j) {
            tunggu(false);
            if (!j.ok) return pesanJendela(j.pesan || 'Gagal mengubah kata sandi.', true);
            tutupJendela();
            jendelaKredensial('Sandi baru untuk ' + nama, nama, baru,
              'Catat atau salin sekarang. Sandi ini tidak dapat dilihat lagi ' +
              'setelah jendela ini ditutup, karena yang tersimpan hanyalah ringkasannya.');
          });
        });
    };
  });
}

function cariPengguna(nama) {
  nama = String(nama).toLowerCase();
  for (var i = 0; i < daftarPengguna.length; i++) {
    if (daftarPengguna[i].nama.toLowerCase() === nama) return daftarPengguna[i];
  }
  return null;
}

function simpanStatusPengguna(nama, aktif, peran) {
  tunggu(true);
  kirim('ubahAktifPengguna', { nama: nama, aktif: aktif, peran: peran }).then(function (j) {
    tunggu(false);
    var pesan = $('pesanPengguna');
    pesan.className = 'pesan ' + (j.ok ? 'ok' : 'gagal');
    pesan.textContent = j.pesan || '';
    muatPengguna();
  });
}

$('formPengguna').addEventListener('submit', function (e) {
  e.preventDefault();
  var pesan = $('pesanPengguna');
  var nama  = $('uNama').value.trim().toUpperCase();
  var sandi = $('uSandi').value;

  if (!nama || sandi.length < 8) {
    pesan.className = 'pesan gagal';
    pesan.textContent = 'Nama pengguna wajib diisi dan kata sandi minimal 8 karakter.';
    return;
  }

  tunggu(true);
  kirim('simpanPengguna', { nama: nama, sandi: sandi, peran: $('uPeran').value }).then(function (j) {
    tunggu(false);
    pesan.className = 'pesan ' + (j.ok ? 'ok' : 'gagal');
    pesan.textContent = j.pesan || '';
    if (j.ok) {
      jendelaKredensial('Akun baru dibuat', nama, sandi,
        'Catat atau salin sekarang, lalu sampaikan kepada yang bersangkutan. ' +
        'Sandi ini tidak dapat dilihat lagi setelah jendela ini ditutup, ' +
        'karena yang tersimpan hanyalah ringkasannya.');
      $('uNama').value = ''; $('uSandi').value = '';
      muatPengguna();
    }
  });
});

/* ============================================================
   10. PEMBANTU
   ============================================================ */

function aman(teks) {
  return String(teks === null || teks === undefined ? '' : teks)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Memeriksa sambungan ke server begitu halaman dibuka. */
(function periksaKoneksi() {
  if (MODE_CONTOH) { tandaiSambungan('contoh'); return; }
  tandaiSambungan('memeriksa');

  // Jangan biarkan tanda menggantung bila server tidak menjawab sama sekali.
  var selesai = false;
  var batas = setTimeout(function () {
    if (!selesai && keadaanKini === 'memeriksa') tandaiSambungan('lambat');
  }, 15000);

  fetch(API_URL + '?aksi=cek')
    .then(function (r) { return r.json(); })
    .then(function (j) { selesai = true; clearTimeout(batas); tandaiSambungan(j && j.ok ? 'sambung' : 'putus'); })
    .catch(function () { selesai = true; clearTimeout(batas); tandaiSambungan('putus'); });
})();

/* Token sesi hanya disimpan di memori halaman, tidak di peramban.
   Akibatnya setiap kali halaman dibuka atau dimuat ulang, nama pengguna dan
   kata sandi selalu diminta kembali. Ini disengaja, karena aplikasi dipakai
   pada komputer yang mungkin dipakai bergantian. */
