/**
 * MODUL PERAMALAN
 * Dijalankan di peramban, tidak memanggil server sama sekali.
 *
 * Metode yang dibandingkan:
 *   - Regresi linear sederhana   Y = a + bX
 *   - Moving average ordo 3
 *   - Moving average ordo 5
 *
 * Ukuran ketepatan: MAD, MSE, MAPE (kriteria Lewis, 1982).
 */

(function (global) {
  'use strict';

  var MIN_PERIODE = 8;    // data minimal agar layak diramalkan
  var AMBANG_MAPE = 1.0;  // selisih MAPE (persen) yang dianggap setara

  /* ---------------------------------------------------------- periode */

  function periodeSetelah(per) {
    var t = parseInt(per.slice(0, 4), 10);
    var b = parseInt(per.slice(5, 7), 10) + 1;
    if (b > 12) { b = 1; t += 1; }
    return t + '-' + (b < 10 ? '0' + b : b);
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
    if (mape <= 10) return 'Sangat baik';
    if (mape <= 20) return 'Baik';
    if (mape <= 50) return 'Cukup';
    return 'Kurang akurat';
  }

  /* ---------------------------------------------------------- pemilihan */

  function pilihTerbaik(daftar) {
    var layak = daftar.filter(function (m) {
      return m.akurasi && m.akurasi.mape !== null && isFinite(m.akurasi.mape);
    });
    var pakai = layak.length ? layak : daftar.filter(function (m) { return m.akurasi; });
    if (!pakai.length) return null;

    var minMape = Math.min.apply(null, pakai.map(function (m) { return m.akurasi.mape; }));
    var kandidat = pakai.filter(function (m) { return m.akurasi.mape - minMape < AMBANG_MAPE; });
    if (kandidat.length === 1) return kandidat[0];

    // Selisih MAPE dianggap setara: MAD dan MSE menjadi penentu.
    var minMad = Math.min.apply(null, kandidat.map(function (m) { return m.akurasi.mad; }));
    var minMse = Math.min.apply(null, kandidat.map(function (m) { return m.akurasi.mse; }));
    kandidat.forEach(function (m) {
      m.skor = (m.akurasi.mape === minMape ? 1 : 0) +
               (m.akurasi.mad  === minMad  ? 1 : 0) +
               (m.akurasi.mse  === minMse  ? 1 : 0);
    });
    return kandidat.reduce(function (a, b) {
      if (b.skor !== a.skor) return b.skor > a.skor ? b : a;
      return b.akurasi.mape < a.akurasi.mape ? b : a;
    });
  }

  /* ---------------------------------------------------------- utama */

  /**
   * deret  : array angka, berurutan bulanan tanpa bolong
   * periode: array label periode yang sepadan dengan deret
   */
  function hitung(deret, periode) {
    var n = deret.length;
    if (n < MIN_PERIODE) {
      return { cukup: false, n: n, minimal: MIN_PERIODE };
    }

    // Pembagian data: maksimal 6 periode uji, minimal 2.
    var nUji = Math.max(2, Math.min(6, Math.round(n * 0.2)));
    var batas = n - nUji;                       // indeks awal data uji
    var latih = deret.slice(0, batas);
    var aktualUji = deret.slice(batas);

    var rl = regresi(latih);
    var metode = [
      { nama: 'Regresi linear sederhana', kunci: 'RL',
        ramal: aktualUji.map(function (_, k) { return rl.pada(batas + k + 1); }) },
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
    var rentang = null;
    if (nilai !== null && mad !== null) {
      rentang = [Math.max(0, Math.round(nilai - mad)), Math.round(nilai + mad)];
    }

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
      bulat: nilai === null ? null : Math.round(nilai),
      mad: mad,
      mape: terbaik && terbaik.akurasi ? terbaik.akurasi.mape : null,
      kategori: terbaik ? terbaik.kategori : 'Belum dapat dinilai',
      rentang: rentang,
      periodeTarget: periode.length ? periodeSetelah(periode[periode.length - 1]) : ''
    };
  }

  /**
   * Menyusun deret bulanan utuh untuk satu item:
   * dari bulan pertama yang tercatat sampai periode terakhir keseluruhan,
   * bulan yang tidak tercatat dianggap nol pemakaian.
   */
  function susunDeret(pemakaianItem, periodeAkhir) {
    if (!pemakaianItem.length) return { periode: [], deret: [] };

    var peta = {};
    var awal = null;
    pemakaianItem.forEach(function (x) {
      peta[x.periode] = (peta[x.periode] || 0) + x.jumlah;
      if (awal === null || x.periode < awal) awal = x.periode;
    });

    var akhir = periodeAkhir;
    Object.keys(peta).forEach(function (p) { if (p > akhir) akhir = p; });

    var periode = deretPeriode(awal, akhir);
    var deret = periode.map(function (p) { return peta[p] || 0; });
    return { periode: periode, deret: deret };
  }

  var API = {
    MIN_PERIODE: MIN_PERIODE,
    AMBANG_MAPE: AMBANG_MAPE,
    hitung: hitung,
    susunDeret: susunDeret,
    regresi: regresi,
    movingAverage: movingAverage,
    akurasi: akurasi,
    kategoriLewis: kategoriLewis,
    periodeSetelah: periodeSetelah,
    deretPeriode: deretPeriode,
    namaPeriode: namaPeriode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Peramalan = API;

})(typeof window !== 'undefined' ? window : this);
