/**
 * DATA CONTOH
 *
 * Berkas ini hanya dipakai selama API_URL di app.js belum diisi, supaya
 * tampilan aplikasi dapat dicoba tanpa memasang Apps Script lebih dulu.
 * Setelah URL Web App diisi, berkas ini tidak pernah dijalankan dan
 * boleh dihapus dari hosting.
 *
 * Akun mode contoh:
 *   ADMIN  / admin12345      (admin)
 *   SARI   / sari12345       (logistik)
 *   BUDI   / budi12345       (gudang)
 */

var Contoh = (function () {
  'use strict';

  var pengguna = [
    { nama: 'ADMIN', sandi: 'admin12345', peran: 'admin',    aktif: true, dibuat: '01/09/2026' },
    { nama: 'SARI',  sandi: 'sari12345',  peran: 'logistik', aktif: true, dibuat: '01/09/2026' },
    { nama: 'BUDI',  sandi: 'budi12345',  peran: 'gudang',   aktif: true, dibuat: '01/09/2026' }
  ];

  var sesi = {};   // token -> { nama, peran }

  var barang = [
    { kode: 'FIL01', nama: 'Filter oli mesin (eks DTRUCK31)', satuan: 'pcs', aktif: true },
    { kode: 'FIL02', nama: 'Filter solar',                    satuan: 'pcs', aktif: true },
    { kode: 'BRK11', nama: 'Kampas rem depan',                satuan: 'set', aktif: true },
    { kode: 'LMP03', nama: 'Lampu utama',                     satuan: 'pcs', aktif: true },
    { kode: 'BAT07', nama: 'Kepala baterai',                  satuan: 'pcs', aktif: true },
    { kode: 'SLG09', nama: 'Selang radiator (tidak dipakai)', satuan: 'pcs', aktif: false }
  ];

  var pola = {
    FIL01: [12, 15, 11, 14, 13, 16, 12, 10, 14, 15, 13, 12, 16, 14, 11, 13, 15, 12,
            14, 16, 13, 11, 12, 15, 14, 13, 16, 12, 11, 14, 13, 15, 12, 14, 13, 16],
    FIL02: [8, 9, 7, 10, 8, 9, 11, 8, 7, 9, 10, 8, 9, 11, 8, 10, 9, 7,
            8, 10, 9, 8, 11, 9, 10, 8, 9, 11, 10, 9, 8, 10, 9, 11, 10, 9],
    BRK11: [4, 6, 5, 8, 6, 7, 5, 9, 6, 7, 8, 5, 6, 9, 7, 6, 8, 5,
            7, 9, 6, 8, 7, 5, 6, 9, 8, 7, 6, 9, 7, 8, 6, 9, 7, 8],
    LMP03: [2, 5, 3, 1, 4, 6, 2, 3, 5, 1, 4, 2, 6, 3, 2, 5, 1, 4,
            3, 6, 2, 4, 1, 5, 3, 2, 6, 4, 1, 3, 5, 2, 4, 3, 5, 2],
    BAT07: [1, 0, 2, 1, 0, 1]                                  // sengaja kurang dari 8 periode
  };

  var pemakaian = [];
  Object.keys(pola).forEach(function (kode) {
    var deret = pola[kode];
    var periode = Peramalan.deretPeriode('2023-10', '2026-09');
    var mulai = periode.length - deret.length;
    deret.forEach(function (jumlah, i) {
      pemakaian.push({ kode: kode, periode: periode[mulai + i], jumlah: jumlah });
    });
  });

  var periodeTerakhir = '2026-09';

  /* ------------------------------------------------------------ */

  function jawab(aksi, p) {
    var hasil;

    if (aksi === 'masuk') {
      hasil = masuk(p);
    } else {
      var s = sesi[p.token];
      if (!s) {
        hasil = { ok: false, sesiHabis: true, pesan: 'Sesi berakhir. Silakan masuk kembali.' };
      } else {
        hasil = jalankan(aksi, p, s);
      }
    }

    return new Promise(function (selesai) { setTimeout(function () { selesai(hasil); }, 120); });
  }

  function masuk(p) {
    var u = cari(p.nama);
    if (!u || u.sandi !== String(p.sandi || '')) {
      return { ok: false, pesan: 'Nama pengguna atau kata sandi salah.' };
    }
    if (!u.aktif) return { ok: false, pesan: 'Akun ini dinonaktifkan. Hubungi admin.' };

    var token = 'contoh-' + Math.random().toString(36).slice(2);
    sesi[token] = { nama: u.nama, peran: u.peran };
    return { ok: true, token: token, nama: u.nama, peran: u.peran };
  }

  function jalankan(aksi, p, s) {
    switch (aksi) {
      case 'keluar':
        delete sesi[p.token];
        return { ok: true };

      case 'data':
        var daftar = pemakaian;
        if (s.peran === 'gudang') {
          daftar = pemakaian.filter(function (x) { return x.periode === String(p.periode || ''); });
        }
        return { ok: true, peran: s.peran, nama: s.nama, barang: salin(barang),
                 pemakaian: salin(daftar), periodeTerakhir: periodeTerakhir };

      case 'simpanPemakaian':
        if (s.peran === 'logistik') return { ok: false, pesan: 'Peran ini tidak berhak menyimpan.' };
        return simpanPemakaian(p);

      case 'hapusPemakaian':
        if (s.peran !== 'admin') return { ok: false, pesan: 'Hanya admin yang boleh menghapus.' };
        pemakaian = pemakaian.filter(function (x) {
          return !(x.kode === p.kodeBarang && x.periode === p.periode);
        });
        return { ok: true, pesan: 'Baris dihapus (mode contoh).' };

      case 'simpanBarang':
        if (s.peran !== 'admin') return { ok: false, pesan: 'Hanya admin.' };
        return simpanBarang(p);

      case 'ubahAktif':
        if (s.peran !== 'admin') return { ok: false, pesan: 'Hanya admin.' };
        barang.forEach(function (b) { if (b.kode === p.kodeBarang) b.aktif = !!p.aktif; });
        return { ok: true, pesan: 'Status barang diubah (mode contoh).' };

      case 'daftarPengguna':
        if (s.peran !== 'admin') return { ok: false, pesan: 'Hanya admin.' };
        return { ok: true, pengguna: pengguna.map(function (u) {
          return { nama: u.nama, peran: u.peran, aktif: u.aktif, dibuat: u.dibuat };
        }) };

      case 'simpanPengguna':
        if (s.peran !== 'admin') return { ok: false, pesan: 'Hanya admin.' };
        if (cari(p.nama)) return { ok: false, pesan: 'Nama pengguna sudah dipakai.' };
        pengguna.push({ nama: String(p.nama).toUpperCase(), sandi: p.sandi, peran: p.peran, aktif: true,
                        dibuat: tanggalHariIni() });
        return { ok: true, pesan: 'Pengguna "' + p.nama + '" ditambahkan (mode contoh).' };

      case 'ubahSandi':
        return ubahSandi(p, s);

      case 'ubahAktifPengguna':
        if (s.peran !== 'admin') return { ok: false, pesan: 'Hanya admin.' };
        return ubahAktifPengguna(p, s);

      default:
        return { ok: false, pesan: 'Aksi tidak dikenal.' };
    }
  }

  /* ------------------------------------------------------------ */

  function ubahSandi(p, s) {
    var u = cari(p.nama);
    if (!u) return { ok: false, pesan: 'Pengguna tidak ditemukan.' };

    var sendiri = u.nama.toLowerCase() === s.nama.toLowerCase();
    if (!sendiri && s.peran !== 'admin') return { ok: false, pesan: 'Tidak berhak.' };
    if (sendiri && u.sandi !== String(p.sandiLama || '')) {
      return { ok: false, pesan: 'Kata sandi lama salah.' };
    }
    if (String(p.sandi || '').length < 8) return { ok: false, pesan: 'Kata sandi minimal 8 karakter.' };

    u.sandi = p.sandi;
    return { ok: true, pesan: 'Kata sandi "' + u.nama + '" diperbarui (mode contoh).' };
  }

  function ubahAktifPengguna(p, s) {
    var u = cari(p.nama);
    if (!u) return { ok: false, pesan: 'Pengguna tidak ditemukan.' };

    var aktif = (p.aktif === true || p.aktif === 'true');
    var peran = p.peran || u.peran;

    if (u.nama.toLowerCase() === s.nama.toLowerCase() && (!aktif || peran !== 'admin')) {
      return { ok: false, pesan: 'Akun yang sedang dipakai tidak dapat dinonaktifkan atau diturunkan perannya.' };
    }
    var adminAktif = pengguna.filter(function (x) { return x.peran === 'admin' && x.aktif; }).length;
    if (u.peran === 'admin' && (!aktif || peran !== 'admin') && adminAktif <= 1) {
      return { ok: false, pesan: 'Harus ada sekurang-kurangnya satu admin yang aktif.' };
    }

    u.aktif = aktif;
    u.peran = peran;
    return { ok: true, pesan: 'Data pengguna "' + u.nama + '" diperbarui (mode contoh).' };
  }

  function simpanPemakaian(p) {
    var ada = null;
    pemakaian.forEach(function (x) {
      if (x.kode === p.kodeBarang && x.periode === p.periode) ada = x;
    });
    if (ada) {
      var lama = ada.jumlah;
      ada.jumlah = Number(p.jumlah);
      return { ok: true, pesan: 'Data diperbarui (sebelumnya ' + lama + ') — mode contoh.' };
    }
    pemakaian.push({ kode: p.kodeBarang, periode: p.periode, jumlah: Number(p.jumlah) });
    if (p.periode > periodeTerakhir) periodeTerakhir = p.periode;
    return { ok: true, pesan: 'Data tersimpan (mode contoh).' };
  }

  function simpanBarang(p) {
    var ada = null;
    barang.forEach(function (b) { if (b.kode === p.kodeBarang) ada = b; });
    if (ada) {
      if (p.baru === true) return { ok: false, pesan: 'Kode sudah dipakai. Satu item satu kode.' };
      ada.nama = p.nama; ada.satuan = p.satuan;
      return { ok: true, pesan: 'Data barang diperbarui (mode contoh).' };
    }
    barang.push({ kode: p.kodeBarang, nama: p.nama, satuan: p.satuan, aktif: true });
    return { ok: true, pesan: 'Barang baru ditambahkan (mode contoh).' };
  }

  function cari(nama) {
    nama = String(nama || '').trim().toLowerCase();
    for (var i = 0; i < pengguna.length; i++) {
      if (pengguna[i].nama.toLowerCase() === nama) return pengguna[i];
    }
    return null;
  }

  function tanggalHariIni() {
    var d = new Date();
    var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  function salin(x) { return JSON.parse(JSON.stringify(x)); }

  return { jawab: jawab };
})();
