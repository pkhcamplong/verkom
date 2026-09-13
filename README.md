# CSV ke Word

Aplikasi statis untuk mengubah satu atau beberapa CSV verifikasi komitmen pendidikan menjadi dokumen `.docx` dengan mempertahankan template `FORM.docx`.

## Menjalankan lokal

Buka `index.html` di browser, atau jalankan server statis sederhana seperti Live Server di VS Code. Aplikasi memakai JSZip melalui CDN untuk mempertahankan struktur asli `FORM.docx`, jadi koneksi internet diperlukan saat halaman pertama kali dibuka.

Template harus berada di folder yang sama dengan `index.html` dan bernama `FORM.docx`.

## Deploy ke GitHub Pages

1. Buat repository GitHub dan unggah `index.html`, `styles.css`, `app.js`, serta `README.md`.
2. Buka **Settings → Pages**.
3. Pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu simpan.

CSV diproses sepenuhnya di browser. Tidak ada file yang dikirim ke server aplikasi. Jika memilih beberapa CSV, satu tombol akan memulai unduhan satu DOCX untuk setiap CSV.

## Log Google Sheets (opsional)

1. Buat Google Sheet baru.
2. Buka **Extensions → Apps Script**.
3. Salin isi `apps-script.gs` ke editor Apps Script dan simpan.
4. Pilih **Deploy → New deployment → Web app**.
5. Pilih **Execute as: Me** dan akses **Anyone**.
6. Salin URL Web App hasil deployment.
7. Masukkan URL tersebut ke konstanta `LOG_ENDPOINT` di `app.js`.

Log ditulis ke sheet `Log` setelah DOCX berhasil dibuat. Data yang dicatat: nama sekolah, NPSN, alamat, desa/kelurahan, kecamatan, kabupaten/kota, provinsi, dan timestamp. Template Word tetap menggunakan format alamat seperti sebelumnya.