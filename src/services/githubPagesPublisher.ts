/**
 * GitHub 'ksf' Repository & GitHub Pages Otomatik Yayınlama Servisi
 * Hem sunucu üzerinden (/api/github-publish-ksf) tüm kaynak kodları + derlenmiş paketi gönderir,
 * hem de sunucusuz (statik / file://) ortamda doğrudan GitHub REST API ile 'ksf' reposunu oluşturup
 * GitHub Pages'i (https://<kullanici>.github.io/ksf/) aktif hale getirir.
 */

export interface GitHubPublishResult {
  owner: string;
  repoName: string;
  repoUrl: string;
  pagesUrl: string;
  branch: string;
  filesCount: number;
  pagesStatus: string;
}

function encodeUtf8Base64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

const STANDALONE_GITHUB_PAGES_INDEX_HTML = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fatsa Adliyesi Akıllı Keşif Planlayıcı (Fatsa · Çamaş · Çatalpınar)</title>
    <meta name="description" content="Ordu ili Fatsa Adliyesi Sulh Hukuk Mahkemesi kalem personeli ve hakimler için konum, mesafe, güzergah optimizasyonu ve bulut senkronizasyonu destekli akıllı keşif planlama sistemi." />
    <meta property="og:title" content="Fatsa Adliyesi Akıllı Keşif Planlayıcı" />
    <meta property="og:description" content="Ordu ili Fatsa Adliyesi Sulh Hukuk Mahkemesi kalem personeli ve hakimler için konum, mesafe, güzergah optimizasyonu ve bulut senkronizasyonu destekli akıllı keşif planlama sistemi." />
    <meta property="og:type" content="website" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
    <link rel="stylesheet" href="./standalone-bundle.css" />
  </head>
  <body class="bg-slate-50 text-slate-900 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
    <div id="root"></div>
    <script src="./standalone-bundle.js"></script>
  </body>
</html>
`;

export async function publishProjectToGitHubPagesKsf(
  githubToken: string,
  repoName = "ksf",
  onProgress?: (stepMessage: string) => void
): Promise<GitHubPublishResult> {
  const cleanToken = (githubToken || "").trim();
  const cleanRepo = (repoName || "ksf").trim().replace(/^\/+|\/+$/g, "") || "ksf";

  if (!cleanToken) {
    throw new Error(
      "GitHub hesabınıza yayınlamak için lütfen 'repo' yetkisine sahip bir GitHub Personal Access Token (ghp_... veya github_pat_...) giriniz."
    );
  }

  onProgress?.("GitHub hesabı doğrulanıyor ve proje dosyaları hazırlanıyor...");

  // 1. Önce yerel Express sunucusu (/api/github-publish-ksf) üzerinden tam kaynak kod + bundle gönderimini dene
  if (
    typeof window !== "undefined" &&
    window.location.protocol.startsWith("http") &&
    !window.location.hostname.endsWith("github.io")
  ) {
    try {
      const serverRes = await fetch("/api/github-publish-ksf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: cleanToken,
          repoName: cleanRepo,
        }),
      });
      const data = await serverRes.json();
      if (serverRes.ok && data.success) {
        return {
          owner: data.owner,
          repoName: data.repoName,
          repoUrl: data.repoUrl,
          pagesUrl: data.pagesUrl,
          branch: data.branch || "main",
          filesCount: data.filesCount || 0,
          pagesStatus: data.pagesStatus || "Aktif",
        };
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      // Eğer sunucu hata mesajı döndürdüyse (ör. geçersiz token) doğrudan ilet
      if (err?.message && (err.message.includes("Token") || err.message.includes("GitHub") || err.message.includes("401") || err.message.includes("403"))) {
        throw err;
      }
      // Aksi halde tarayıcı tabanlı doğrudan GitHub REST API yedek yöntemine geç
    }
  }

  // 2. Tarayıcı üzerinden doğrudan GitHub REST API ile yayınlama (Sunucusuz / Statik ortam desteği)
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${cleanToken}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  onProgress?.("GitHub kullanıcı bilgileri alınıyor...");
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) {
    const errJson = await userRes.json().catch(() => ({}));
    throw new Error(
      `GitHub kimlik doğrulaması başarısız (HTTP ${userRes.status}): ${
        errJson.message || "Token geçersiz veya süresi dolmuş."
      }`
    );
  }
  const userData = await userRes.json();
  const owner: string = userData.login;
  const pagesUrl = `https://${owner}.github.io/${cleanRepo}/`;
  const repoUrl = `https://github.com/${owner}/${cleanRepo}`;

  onProgress?.(`'${owner}/${cleanRepo}' deposu kontrol ediliyor / oluşturuluyor...`);
  let defaultBranch = "main";
  const repoCheckRes = await fetch(
    `https://api.github.com/repos/${owner}/${cleanRepo}`,
    { headers }
  );

  if (repoCheckRes.status === 404) {
    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: cleanRepo,
        description:
          "T.C. Fatsa Sulh Hukuk Mahkemesi (Fatsa, Çamaş, Çatalpınar) Akıllı Keşif Planlama ve CBS Sistemi",
        homepage: pagesUrl,
        private: false,
        has_pages: true,
        auto_init: true,
      }),
    });
    if (!createRes.ok) {
      const errJson = await createRes.json().catch(() => ({}));
      throw new Error(
        `'${cleanRepo}' deposu oluşturulamadı (HTTP ${createRes.status}): ${
          errJson.message || "Token'da 'repo' (Classic) veya 'Administration: Read and write' izni açık olmalıdır."
        }`
      );
    }
    const createdRepo = await createRes.json();
    defaultBranch = createdRepo.default_branch || "main";
    // GitHub'ın ilk commit'i hazırlaması için kısa bekleme
    await new Promise((r) => setTimeout(r, 1500));
  } else if (repoCheckRes.ok) {
    const existingRepo = await repoCheckRes.json();
    defaultBranch = existingRepo.default_branch || "main";
    if (existingRepo.private) {
      // GitHub Pages ücretsiz hesaplarda public repo gerektirir
      await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ private: false, homepage: pagesUrl }),
      }).catch(() => {});
    }
  } else {
    const errJson = await repoCheckRes.json().catch(() => ({}));
    throw new Error(
      `Repo kontrol hatası (HTTP ${repoCheckRes.status}): ${
        errJson.message || "Bilinmeyen hata"
      }`
    );
  }

  onProgress?.("Uygulama paketleri (index.html, standalone-bundle.js, standalone-bundle.css) hazırlanıyor...");

  const filesToUpload: { path: string; content: string }[] = [
    { path: ".nojekyll", content: "" },
    { path: "index.html", content: STANDALONE_GITHUB_PAGES_INDEX_HTML },
    {
      path: "README.md",
      content: `# T.C. Fatsa Sulh Hukuk Mahkemesi — Akıllı Keşif Planlayıcı\n\nFatsa, Çamaş ve Çatalpınar ilçeleri için TKGM Ada/Parsel CBS destekli keşif planlama sistemi.\n\n🔗 **Canlı GitHub Pages Adresi:** [${pagesUrl}](${pagesUrl})\n`,
    },
  ];

  // Mevcut sayfadaki standalone-bundle.css ve standalone-bundle.js dosyalarını oku
  try {
    const cssRes = await fetch("./standalone-bundle.css");
    if (cssRes.ok) {
      filesToUpload.push({
        path: "standalone-bundle.css",
        content: await cssRes.text(),
      });
    }
  } catch {
    // ignore
  }

  try {
    const jsRes = await fetch("./standalone-bundle.js");
    if (jsRes.ok) {
      filesToUpload.push({
        path: "standalone-bundle.js",
        content: await jsRes.text(),
      });
    }
  } catch {
    // ignore
  }

  onProgress?.(`Dosyalar '${owner}/${cleanRepo}' (${defaultBranch}) deposuna yükleniyor...`);

  for (const file of filesToUpload) {
    const contentApiUrl = `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${file.path}`;
    let existingSha: string | undefined;
    try {
      const getFileRes = await fetch(
        `${contentApiUrl}?ref=${encodeURIComponent(defaultBranch)}&_t=${Date.now()}`,
        { headers }
      );
      if (getFileRes.ok) {
        const fData = await getFileRes.json();
        existingSha = fData.sha;
      }
    } catch {
      // dosya henüz yok
    }

    const putBody: Record<string, any> = {
      message: `Yayın güncellemesi: ${file.path}`,
      content: encodeUtf8Base64(file.content),
      branch: defaultBranch,
    };
    if (existingSha) putBody.sha = existingSha;

    const putRes = await fetch(contentApiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(putBody),
    });
    if (!putRes.ok) {
      const errJson = await putRes.json().catch(() => ({}));
      throw new Error(
        `'${file.path}' yüklenemedi (HTTP ${putRes.status}): ${
          errJson.message || "Yazma yetkisini kontrol edin."
        }`
      );
    }
  }

  onProgress?.("GitHub Pages servisi aktifleştiriliyor...");
  let pagesStatus = "Aktif (GitHub Pages)";
  try {
    const pagesRes = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/pages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          source: {
            branch: defaultBranch,
            path: "/",
          },
        }),
      }
    );
    if (pagesRes.status === 409) {
      // Zaten aktifse kaynağı güncelle ve yeniden derleme tetikle
      await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/pages`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          source: {
            branch: defaultBranch,
            path: "/",
          },
        }),
      }).catch(() => {});
      await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/pages/builds`,
        {
          method: "POST",
          headers,
        }
      ).catch(() => {});
    }
  } catch {
    pagesStatus = "Repo güncellendi (Settings > Pages altından kontrol edebilirsiniz)";
  }

  return {
    owner,
    repoName: cleanRepo,
    repoUrl,
    pagesUrl,
    branch: defaultBranch,
    filesCount: filesToUpload.length,
    pagesStatus,
  };
}
