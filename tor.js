/**
 * MODUL KLASIFIKASI FSN - TURN OVER RATIO (TOR)
 * Dijalankan di peramban, tidak memanggil server sama sekali.
 *
 * Rumus (Hudori & Tarigan, 2019; Amalia et al., 2023), dihitung per tahun:
 *   Pak  = Paw + Pms - Ppk        persediaan akhir
 *   Prt  = (Paw + Pak) / 2        rata-rata persediaan
 *   TORp = Ppk / Prt              perputaran dalam tahun itu
 *   Wsp  = Jhp / TORp             lama penyimpanan (hari), Jhp 365 atau 366
 *   TOR  = 365 / Wsp              TOR tahunan
 * Persediaan akhir suatu tahun menjadi persediaan awal tahun berikutnya.
 *
 * TOR rata-rata = rata-rata TOR dari 3 tahun lengkap terakhir.
 * Klasifikasi: TOR > 3 Fast moving, 1 <= TOR <= 3 Slow moving, TOR < 1 Non moving.
 *
 * Aturan khusus (sama dengan Kalkulator_TOR_FSN):
 *   - Pemakaian setahun = 0 (stok ada)         -> TOR tahun itu 0, tetap dirata-ratakan.
 *   - Prt = 0 (atau kurang) dan ada pemakaian  -> TOR tak hingga, tidak dirata-ratakan.
 *   - Prt = 0 di semua tahun dan ada pemakaian -> TOR rata-rata tak hingga, Fast moving.
 *   - Prt = 0 dan pemakaian 0                  -> tahun itu tidak dapat dihitung.
 *
 * Masuk sampel peramalan = Fast moving dan tidak ada satu bulan pun dengan
 * pemakaian 0 pada tahun-tahun yang dipakai untuk TOR rata-rata.
 */

(function (global) {
  'use strict';

  var JUMLAH_TAHUN = 3;   // banyaknya tahun lengkap terakhir yang dirata-ratakan
  var BATAS_FAST = 3;
  var BATAS_SLOW = 1;

  var KELAS = {
    fast:  'Fast moving',
    slow:  'Slow moving',
    non:   'Non moving',
    tidak: 'Tidak dapat dihitung',
    belum: 'Persediaan belum diisi'
  };

  function hariSetahun(tahun) {
    return ((tahun % 4 === 0 && tahun % 100 !== 0) || tahun % 400 === 0) ? 366 : 365;
  }

  function duaDigit(b) { return b < 10 ? '0' + b : String(b); }

  /**
   * Tahun yang datanya lengkap Januari sampai Desember, dilihat dari seluruh
   * data pemakaian (bukan per item, karena bulan tanpa catatan berarti pemakaian 0).
   */
  function tahunLengkap(periodeAwal, periodeAkhir) {
    if (!periodeAwal || !periodeAkhir) return [];
    var awal = parseInt(periodeAwal.slice(0, 4), 10);
    if (periodeAwal.slice(5, 7) !== '01') awal += 1;
    var akhir = parseInt(periodeAkhir.slice(0, 4), 10);
    if (periodeAkhir.slice(5, 7) !== '12') akhir -= 1;
    var hasil = [];
    for (var t = awal; t <= akhir; t++) hasil.push(t);
    return hasil;
  }

  /**
   * Menghitung TOR satu item.
   *   pemakaian  : [{ periode: 'YYYY-MM', jumlah }]
   *   persediaan : [{ tahun, stokAwal (angka atau null), masuk }]
   *   lengkap    : daftar tahun lengkap (hasil tahunLengkap)
   */
  function hitungItem(pemakaian, persediaan, lengkap) {
    var jendela = lengkap.slice(-JUMLAH_TAHUN);

    var pakaiBulan = {};
    pemakaian.forEach(function (x) {
      pakaiBulan[x.periode] = (pakaiBulan[x.periode] || 0) + (Number(x.jumlah) || 0);
    });

    var masuk = {}, stokAwal = {};
    persediaan.forEach(function (x) {
      var t = Number(x.tahun);
      if (!t) return;
      masuk[t] = (masuk[t] || 0) + (Number(x.masuk) || 0);
      if (x.stokAwal !== null && x.stokAwal !== undefined && x.stokAwal !== '') {
        stokAwal[t] = Number(x.stokAwal) || 0;
      }
    });

    // Tahun awal rantai persediaan = tahun pertama yang stok awalnya diisi.
    var tahunStok = Object.keys(stokAwal).map(Number).sort(function (a, b) { return a - b; });
    var tahunAwal = tahunStok.length ? tahunStok[0] : null;

    // Bulan dengan pemakaian 0 pada tahun-tahun jendela.
    var bulanNol = 0;
    jendela.forEach(function (t) {
      for (var b = 1; b <= 12; b++) if (!(pakaiBulan[t + '-' + duaDigit(b)] > 0)) bulanNol += 1;
    });

    var dasar = {
      tahunAwal: tahunAwal,
      tahunDipakai: jendela,
      bulanNol: bulanNol,
      perTahun: [],
      peringatan: []
    };

    if (tahunAwal === null || !jendela.length) {
      dasar.rata = null;
      dasar.kelas = tahunAwal === null ? KELAS.belum : KELAS.tidak;
      dasar.kunci = tahunAwal === null ? 'belum' : 'tidak';
      dasar.sampel = false;
      return dasar;
    }

    // Rantai persediaan dari tahun awal sampai tahun terakhir yang dibutuhkan.
    var tahunAkhir = Math.max(jendela[jendela.length - 1], tahunAwal);
    var paw = stokAwal[tahunAwal];
    var rinci = {};

    for (var t = tahunAwal; t <= tahunAkhir; t++) {
      var ppk = 0;
      for (var b = 1; b <= 12; b++) ppk += pakaiBulan[t + '-' + duaDigit(b)] || 0;
      var pms = masuk[t] || 0;
      var pak = paw + pms - ppk;
      var prt = (paw + pak) / 2;
      var jhp = hariSetahun(t);

      var r = { tahun: t, jhp: jhp, paw: paw, pms: pms, ppk: ppk, pak: pak, prt: prt,
                torp: null, wsp: null, tor: null, status: 'angka' };

      if (prt <= 0) {
        r.status = ppk > 0 ? 'takHingga' : 'tidak';
        if (ppk > 0) r.tor = Infinity;
      } else if (ppk === 0) {
        r.torp = 0;
        r.tor = 0;
      } else {
        r.torp = ppk / prt;
        r.wsp = jhp / r.torp;
        r.tor = 365 / r.wsp;
      }

      if (pak < 0) dasar.peringatan.push('Persediaan akhir ' + t + ' negatif (' + pak + '). Periksa stok awal, barang masuk, atau pemakaian.');
      rinci[t] = r;
      paw = pak;
    }

    // Hanya tahun jendela yang ditampilkan dan dirata-ratakan.
    var jumlah = 0, n = 0, adaTakHingga = false;
    jendela.forEach(function (t) {
      var r = rinci[t];
      if (!r) {
        r = { tahun: t, jhp: hariSetahun(t), status: 'sebelumAwal', tor: null };
      } else if (r.status === 'angka') {
        jumlah += r.tor; n += 1;
      } else if (r.status === 'takHingga') {
        adaTakHingga = true;
      }
      dasar.perTahun.push(r);
    });

    var rata = n > 0 ? jumlah / n : (adaTakHingga ? Infinity : null);
    dasar.rata = rata;

    if (rata === null) { dasar.kunci = 'tidak'; }
    else if (rata > BATAS_FAST) { dasar.kunci = 'fast'; }
    else if (rata >= BATAS_SLOW) { dasar.kunci = 'slow'; }
    else { dasar.kunci = 'non'; }

    dasar.kelas = KELAS[dasar.kunci];
    dasar.sampel = dasar.kunci === 'fast' && bulanNol === 0;
    return dasar;
  }

  /**
   * Menghitung semua barang.
   *   barang     : [{ kode, ... }]
   *   pemakaian  : [{ kode, periode, jumlah }]
   *   persediaan : [{ kode, tahun, stokAwal, masuk }]
   */
  function hitungSemua(barang, pemakaian, persediaan) {
    var awal = '', akhir = '';
    pemakaian.forEach(function (x) {
      if (!awal || x.periode < awal) awal = x.periode;
      if (!akhir || x.periode > akhir) akhir = x.periode;
    });
    var lengkap = tahunLengkap(awal, akhir);

    var pakai = {}, sedia = {};
    pemakaian.forEach(function (x) { (pakai[x.kode] = pakai[x.kode] || []).push(x); });
    persediaan.forEach(function (x) { (sedia[x.kode] = sedia[x.kode] || []).push(x); });

    var hasil = {};
    barang.forEach(function (b) {
      hasil[b.kode] = hitungItem(pakai[b.kode] || [], sedia[b.kode] || [], lengkap);
    });

    return {
      tahunLengkap: lengkap,
      tahunDipakai: lengkap.slice(-JUMLAH_TAHUN),
      tahunPertama: awal ? parseInt(awal.slice(0, 4), 10) : null,
      tahunTerakhir: akhir ? parseInt(akhir.slice(0, 4), 10) : null,
      item: hasil
    };
  }

  var API = {
    JUMLAH_TAHUN: JUMLAH_TAHUN,
    KELAS: KELAS,
    hariSetahun: hariSetahun,
    tahunLengkap: tahunLengkap,
    hitungItem: hitungItem,
    hitungSemua: hitungSemua
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.TOR = API;

})(typeof window !== 'undefined' ? window : this);
