export const buildPromptAnalysis = (
  promptUser: string,
) => {

  return `
Bertindaklah sebagai Senior System Analyst dan Software Architect. Tugasmu adalah menganalisis permintaan pengguna/klien di bawah ini, lalu menyusun spesifikasi fitur dan rekomendasi tech stack secara terstruktur.

[PERMINTAAN PENGGUNA]
${promptUser}

Silakan berikan hasil analisis dengan struktur berikut:

1. Ringkasan Kebutuhan
   - Tujuan utama aplikasi.
   - Siapa pengguna utamanya (target user).

2. Analisis Fitur
   - Fitur Utama (MVP): Fitur mendasar yang wajib ada agar aplikasi berfungsi.
   - Fitur Tambahan (Pengembangan): Fitur pendukung untuk meningkatkan nilai tambah aplikasi.

3. Arsitektur & Tech Stack
   - Default Stack (Gunakan ini sebagai fondasi utama):
     • Framework: Next.js (App Router)
     • Styling: Tailwind CSS
     • Iconry: Lucide React
     • State Management: Zustand
   - Rekomendasi Stack Tambahan (Sesuaikan dengan kebutuhan spesifik aplikasi, misalnya: Database, Authentication, Form Handling, UI Component Library, Deployment, dll.).

4. Catatan Implementasi & Alur Data (Singkat)
   - Potensi tantangan teknis yang perlu diwaspadai.
   - Rekomendasi langkah awal pengerjaan (Roadmap singkat).`;
};