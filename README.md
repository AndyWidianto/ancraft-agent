# Ancraft Agent (VS Code Extension)

**Ancraft Agent** adalah ekstensi Visual Studio Code yang menyediakan fitur agen interaktif dengan integrasi *sidebar* dan *webview*.

---

## 📁 Struktur Proyek

```text
ancraft-agent/
├── .vscode/               # Konfigurasi VS Code (debug & settings)
├── media/                 # Aset gambar, ikon, atau media webview
├── out/                   # Hasil kompilasi TypeScript (di-generate)
├── src/                   # Source code utama
│   ├── action/            # Modul eksekusi aksi
│   ├── agent/             # Logika inti agen
│   ├── config/            # Pengaturan dan konfigurasi
│   ├── executor/          # Modul eksekutor perintah
│   ├── lib/               # Utility / pustaka pendukung
│   ├── model/             # Definisi data/model
│   ├── receiveMessage/    # Pengendali pesan masuk
│   ├── test/              # Unit testing
│   ├── extension.ts       # Entry point ekstensi VS Code
│   └── SidebarProvider.ts # Provider untuk UI Sidebar VS Code
├── webview/               # Komponen/UI Webview
├── .gitignore             # File yang diabaikan oleh Git
├── .vscode-test.mjs       # Konfigurasi runner pengujian VS Code
├── .vscodeignore           # File yang diabaikan saat melakukan packaging ekstensi
├── CHANGELOG.md           # Catatan perubahan versi
├── eslint.config.mjs      # Konfigurasi linter ESLint
├── package.json           # Dependensi dan manifes ekstensi
├── README.md              # Dokumentasi proyek
├── tsconfig.json          # Konfigurasi TypeScript
└── webpack.config.js      # Konfigurasi bundling Webpack
```

---

## 🚀 Persyaratan Sistem (Prerequisites)

Sebelum memulai, pastikan Anda telah menginstal:
* [Node.js](https://nodejs.org/) (Versi LTS direkomendasikan)
* [npm](https://www.npmjs.com/) (Terinstall bersama Node.js)
* [Visual Studio Code](https://code.visualstudio.com/)

Instal juga **vsce** (VS Code Extension Manager) secara global untuk melakukan packaging:
```bash
npm install -g @vscode/vsce
```

---

## ⚙️ Cara Menjalankan & Membangun Proyek (Development)

1. **Clone Repositori:**
   ```bash
   git clone https://github.com/username/ancraft-agent.git
   cd ancraft-agent
   ```

2. **Instal Dependensi:**
   ```bash
   npm install
   ```

3. **Jalankan Mode Mode Debugging / Development:**
   - Buka folder proyek di VS Code (`code .`).
   - Tekan **`F5`** pada keyboard untuk membuka jendela *Extension Development Host*.

4. **Kompilasi / Build Kode:**
   ```bash
   npm run build
   ```
   *(Atau jalankan `npm run watch` untuk kompilasi otomatis saat ada perubahan kode).*

---

## 📦 Cara Packaging Ekstensi (`.vsix`)

Untuk membuat file paket instalasi `.vsix` (misalnya `ancraft-0.0.1.vsix`):

1. Pastikan seluruh dependensi sudah terpasang dan aplikasi bebas dari error kompilasi:
   ```bash
   npm run build
   ```

2. Jalankan perintah `vsce package`:
   ```bash
   vsce package
   ```
   *Jika Anda belum mengkonfigurasi `repository` pada `package.json`, Anda bisa menggunakan flag berikut untuk melewati peringatan:*
   ```bash
   vsce package --allow-missing-repository
   ```

3. File `.vsix` baru (contoh: `ancraft-0.0.1.vsix`) akan dihasilkan pada root directory proyek Anda.

---

## 📥 Cara Penginstalan (Installation)

Ada 2 cara untuk menginstal paket `.vsix` ke VS Code Anda:

### Metode 1: Melalui Terminal (CLI)
Jalankan perintah berikut di terminal Anda:
```bash
code --install-extension ancraft-0.0.1.vsix
```

### Metode 2: Melalui UI VS Code
1. Buka **Visual Studio Code**.
2. Masuk ke tab **Extensions** (`Ctrl+Shift+X` di Windows/Linux atau `Cmd+Shift+X` di macOS).
3. Klik ikon titik tiga (**...**) di sudut kanan atas panel Extensions.
4. Pilih **Install from VSIX...**.
5. Cari dan pilih file `ancraft-0.0.1.vsix`, lalu klik **Install**.
6. Muat ulang (reload) VS Code jika diminta.

---

## 📝 Lisensi

Proyek ini dilindungi di bawah lisensi [MIT](LICENSE).