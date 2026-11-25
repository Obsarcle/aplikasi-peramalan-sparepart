/**
 * MODUL PERAMALAN
 * Dijalankan di peramban, tidak memanggil server sama sekali.
 *
 * Metode yang dibandingkan:
 *   - Regresi linear sederhana   Y = a + bX
 *   - Moving average ordo 3
 *   - Moving average ordo 5
 *
 * Ukuran ketepatan: MAD, MSE, MAPE (kriteria Lewis, 1982).k
 */

(function (global) {
  'use strict';

  var MIN_PERIODE = 8;    // data minimal agar layak diramalkan
  var BULAN_TIGA_TAHUN = 36; // jendela pemeriksaan bulan pemakaian 0 (3 tahun)

  /* ---------------------------------------------------------- periode */

  function periodeSetelah(per) {
    var t = parseInt(per.slice(0, 4), 10);
    var b = parseInt(per.slice(5, 7), 10) + 1;
    if (b > 12) { b = 1; t += 1; }
    return t + '-' + (b < 10 ? '0' + b : b);
  }

  function periodeSebelum(per) {
    var t = parseInt(per.slice(0, 4), 10);
    var b = parseInt(per.slice(5, 7), 10) - 1;
    if (b < 1) { b = 12; t -= 1; }
    return t + '-' + (b < 10 ? '0' + b : b);
  }

  /**
   * Periode terakhir yang dipakai untuk analisis: bulan yang sudah selesai.
   * Bulan berjalan (yang masih diisi gudang) tidak dipakai, supaya barang
   * yang belum dicatat bulan ini tidak dianggap pemakaian 0.
   */
  function batasAnalisis(periodeTerakhir, hariIni) {
    if (!periodeTerakhir) return '';
    var d = hariIni || new Date();
    var bulanIni = d.getFullYear() + '-' + ((d.getMonth() + 1) < 10 ? '0' : '') + (d.getMonth() + 1);
    var bulanLalu = periodeSebelum(bulanIni);
    return periodeTerakhir < bulanLalu ? periodeTerakhir : bulanLalu;
  }

  /**
   * Banyaknya bulan pemakaian 0 dalam 36 bulan terakhir deret.
   * Bila `ada` diberikan, hanya bulan yang benar-benar dicatat (diisi 0) yang dihitung;
   * bulan tanpa catatan dihitung sebagai data hilang (hitungBulanHilang).
   */
  function hitungBulanNol(deret, ada) {
    var awal = Math.max(0, deret.length - BULAN_TIGA_TAHUN), n = 0;
    for (var i = awal; i < deret.length; i++) {
      if (ada && !ada[i]) continue;
      if (!(deret[i] > 0)) n += 1;
    }
    return n;
  }

  /** Banyaknya bulan tanpa catatan (data hilang) dalam 36 bulan terakhir. */
  function hitungBulanHilang(susun) {
    return susun.ada.slice(-BULAN_TIGA_TAHUN).filter(function (x) { return !x; }).length;
  }

  function deretPeriode(awal, akhir) {
    var hasil = [], p = awal;
    for (var i = 0; i < 600 && p <= akhir; i++) { hasil.push(p); p = periodeSetelah(p); }
    return hasil;
  }

  var NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function namaPeriode(per) {
    if (!per || per.length < 7) return '-';
    return NAMA_BULAN[parseInt(per.slice(5, 7), 10) - 1] + ' ' + per.slice(0, 4);
  }

  /* ---------------------------------------------------------- metode */

  /** Regresi linear sederhana atas y[0..n-1] dengan X = 1..n. */
  function regresi(y) {
    var n = y.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) {
      var x = i + 1;
      sx += x; sy += y[i]; sxy += x * y[i]; sxx += x * x;
    }
    var pembagi = n * sxx - sx * sx;
    var b = pembagi === 0 ? 0 : (n * sxy - sx * sy) / pembagi;
    var a = (sy - b * sx) / n;
    return { a: a, b: b, pada: function (x) { return a + b * x; } };
  }

  /** Rata-rata n nilai aktual sebelum indeks i. */
  function movingAverage(y, i, n) {
    if (i - n < 0) return null;
    var jum = 0;
    for (var k = i - n; k < i; k++) jum += y[k];
    return jum / n;
  }

  /* ---------------------------------------------------------- akurasi */

  function akurasi(aktual, ramal) {
    var n = 0, sumAbs = 0, sumKuadrat = 0, sumPersen = 0, nPersen = 0;
    for (var i = 0; i < aktual.length; i++) {
      if (ramal[i] === null || ramal[i] === undefined) continue;
      var e = aktual[i] - ramal[i];
      n += 1;
      sumAbs += Math.abs(e);
      sumKuadrat += e * e;
      if (aktual[i] !== 0) { sumPersen += Math.abs(e / aktual[i]); nPersen += 1; }
    }
    if (n === 0) return null;
    return {
      n: n,
      mad: sumAbs / n,
      mse: sumKuadrat / n,
      mape: nPersen > 0 ? (sumPersen / nPersen) * 100 : null
    };
  }

  function kategoriLewis(mape) {
    if (mape === null || mape === undefined || !isFinite(mape)) return 'Belum dapat dinilai';
    if (mape <= 10) return 'Sangat akurat';
    if (mape <= 20) return 'Baik';
    if (mape <= 50) return 'Wajar';
    return 'Tidak akurat';
  }

  /* ---------------------------------------------------------- pemilihan */

  function pilihTerbaik(daftar) {
    var layak = daftar.filter(function (m) {
      return m.akurasi && m.akurasi.mape !== null && isFinite(m.akurasi.mape);
    });
    var pakai = layak.length ? layak : daftar.filter(function (m) { return m.akurasi; });
    if (!pakai.length) return null;

    // Metode terbaik = MAPE terkecil (MAD dan MSE hanya sebagai pelengkap).
    return pakai.reduce(function (x, y) { return y.akurasi.mape < x.akurasi.mape ? y : x; });
  }

  /* ---------------------------------------------------------- utama */

  /**
   * deret  : array angka, berurutan bulanan tanpa bolong
   * periode: array label periode yang sepadan dengan deret
   */
  function hitung(deret, periode) {
    // Hanya 36 bulan (3 tahun) terakhir yang dipakai: 30 data latih + 6 data uji,
    // sama dengan skripsi. Data yang lebih lama tidak ikut dihitung.
    deret = deret.slice(-BULAN_TIGA_TAHUN);
    periode = periode.slice(-BULAN_TIGA_TAHUN);
    var n = deret.length;
    if (n < MIN_PERIODE) {
      return { cukup: false, n: n, minimal: MIN_PERIODE };
    }

    // Item di luar sampel: ada bulan pemakaian 0 dalam 3 tahun (36 bulan) terakhir,
    // sehingga MAPE tidak terdefinisi. Tidak diramalkan sampai tidak ada bulan 0.
    var bulanNol = hitungBulanNol(deret);
    if (bulanNol > 0) {
      return { cukup: false, luarSampel: true, bulanNol: bulanNol, n: n, minimal: MIN_PERIODE };
    }

    // Pembagian data: maksimal 6 periode uji, minimal 2.
    var nUji = Math.max(2, Math.min(6, Math.round(n * 0.2)));
    var batas = n - nUji;                       // indeks awal data uji
    var aktualUji = deret.slice(batas);

    // Regresi one-step-ahead: a dan b dihitung ulang dari seluruh data aktual
    // sebelum bulan yang diramal (30 data untuk bulan uji pertama, 31 untuk
    // bulan berikutnya, dan seterusnya), sama dengan perhitungan di skripsi.
    var metode = [
      { nama: 'Regresi linear sederhana', kunci: 'RL',
        ramal: aktualUji.map(function (_, k) {
          return regresi(deret.slice(0, batas + k)).pada(batas + k + 1);
        }) },
      { nama: 'Moving average n = 3', kunci: 'MA3',
        ramal: aktualUji.map(function (_, k) { return movingAverage(deret, batas + k, 3); }) },
      { nama: 'Moving average n = 5', kunci: 'MA5',
        ramal: aktualUji.map(function (_, k) { return movingAverage(deret, batas + k, 5); }) }
    ];

    metode.forEach(function (m) {
      m.akurasi = akurasi(aktualUji, m.ramal);
      m.kategori = m.akurasi ? kategoriLewis(m.akurasi.mape) : 'Belum dapat dinilai';
    });

    var terbaik = pilihTerbaik(metode);

    // Ramalan periode berikutnya memakai seluruh data yang tersedia.
    var rlPenuh = regresi(deret);
    var ramalan = {
      RL:  rlPenuh.pada(n + 1),
      MA3: movingAverage(deret, n, 3),
      MA5: movingAverage(deret, n, 5)
    };

    var nilai = terbaik ? ramalan[terbaik.kunci] : null;
    if (nilai !== null && nilai !== undefined && nilai < 0) nilai = 0;

    var mad = terbaik && terbaik.akurasi ? terbaik.akurasi.mad : null;

    return {
      cukup: true,
      n: n,
      nUji: nUji,
      periodeUji: periode.slice(batas),
      aktualUji: aktualUji,
      metode: metode,
      terbaik: terbaik,
      ramalanTiapMetode: ramalan,
      ramalan: nilai,
      bulat: nilai === null ? null : Math.ceil(nilai - 1e-9),   // dibulatkan ke atas: sparepart dibeli dalam satuan utuh
      mad: mad,
      mape: terbaik && terbaik.akurasi ? terbaik.akurasi.mape : null,
      kategori: terbaik ? terbaik.kategori : 'Belum dapat dinilai',
      periodeTarget: periode.length ? periodeSetelah(periode[periode.length - 1]) : ''
    };
  }

  /**
   * Menyusun deret bulanan utuh untuk satu item:
   * dari bulan pertama yang tercatat sampai periodeAkhir (batas analisis),
   * bulan yang tidak tercatat bernilai 0 di `deret` tetapi ditandai false di `ada`
   * (data hilang), sehingga dapat dibedakan dari pemakaian 0 yang memang diisi.
   * Catatan sesudah periodeAkhir (bulan berjalan) tidak dipakai.
   */
  function susunDeret(pemakaianItem, periodeAkhir) {
    if (!pemakaianItem.length) return { periode: [], deret: [], ada: [] };

    var peta = {};
    var awal = null;
    pemakaianItem.forEach(function (x) {
      if (periodeAkhir && x.periode > periodeAkhir) return;
      peta[x.periode] = (peta[x.periode] || 0) + (Number(x.jumlah) || 0);
      if (awal === null || x.periode < awal) awal = x.periode;
    });
    if (awal === null) return { periode: [], deret: [], ada: [] };

    var periode = deretPeriode(awal, periodeAkhir || awal);
    var deret = periode.map(function (p) { return peta[p] || 0; });
    var ada = periode.map(function (p) { return peta.hasOwnProperty(p); });
    return { periode: periode, deret: deret, ada: ada };
  }

  var API = {
    MIN_PERIODE: MIN_PERIODE,
    BULAN_TIGA_TAHUN: BULAN_TIGA_TAHUN,
    hitung: hitung,
    susunDeret: susunDeret,
    regresi: regresi,
    movingAverage: movingAverage,
    akurasi: akurasi,
    kategoriLewis: kategoriLewis,
    periodeSetelah: periodeSetelah,
    periodeSebelum: periodeSebelum,
    batasAnalisis: batasAnalisis,
    hitungBulanNol: hitungBulanNol,
    hitungBulanHilang: hitungBulanHilang,
    deretPeriode: deretPeriode,
    namaPeriode: namaPeriode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Peramalan = API;

})(typeof window !== 'undefined' ? window : this);
