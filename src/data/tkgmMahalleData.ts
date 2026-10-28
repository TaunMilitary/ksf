import { CourtDistrict } from "../types";

export interface TkgmMahalleItem {
  id: number;
  text: string;
  district: CourtDistrict;
}

export const TKGM_ILCE_IDS: Record<CourtDistrict, number> = {
  Fatsa: 761,
  Çamaş: 758,
  Çatalpınar: 759,
};

// TKGM MEGSİS Resmi Mahalle ID Veri Tabanı (Ordu: Fatsa [761], Çamaş [758], Çatalpınar [759])
export const TKGM_MAHALLE_LIST: TkgmMahalleItem[] = [
  // --- FATSA (761) - 98 Mahalle ---
  { id: 204344, text: "Ahmetler", district: "Fatsa" },
  { id: 152119, text: "Arpalik", district: "Fatsa" },
  { id: 157203, text: "Aşağiardiç", district: "Fatsa" },
  { id: 155942, text: "Aşağitepe", district: "Fatsa" },
  { id: 202574, text: "Aşağiyavaş", district: "Fatsa" },
  { id: 207520, text: "Aslancami", district: "Fatsa" },
  { id: 206607, text: "Ayazli", district: "Fatsa" },
  { id: 153961, text: "Bacanak", district: "Fatsa" },
  { id: 155483, text: "Bağlarca", district: "Fatsa" },
  { id: 153270, text: "Bahçeler", district: "Fatsa" },
  { id: 205506, text: "Başköy", district: "Fatsa" },
  { id: 155472, text: "Beyceli", district: "Fatsa" },
  { id: 154470, text: "Bolaman", district: "Fatsa" },
  { id: 154519, text: "Bozdaği", district: "Fatsa" },
  { id: 155283, text: "Bucakli", district: "Fatsa" },
  { id: 152511, text: "Buhari", district: "Fatsa" },
  { id: 154261, text: "Bülbül", district: "Fatsa" },
  { id: 151396, text: "Büyükkoç", district: "Fatsa" },
  { id: 157505, text: "Çömlekli", district: "Fatsa" },
  { id: 152120, text: "Çoteli", district: "Fatsa" },
  { id: 151407, text: "Demirci", district: "Fatsa" },
  { id: 133976, text: "Dereyurt", district: "Fatsa" },
  { id: 206608, text: "Dolunay", district: "Fatsa" },
  { id: 152482, text: "Duayeri", district: "Fatsa" },
  { id: 154508, text: "Düğünlük", district: "Fatsa" },
  { id: 155732, text: "Dumlupinar", district: "Fatsa" },
  { id: 204343, text: "Eskiordu", district: "Fatsa" },
  { id: 152913, text: "Evkaf", district: "Fatsa" },
  { id: 208358, text: "Fatih", district: "Fatsa" },
  { id: 155539, text: "Geyikçeli Bld/Fatih", district: "Fatsa" },
  { id: 155626, text: "Geyikçeli Bld/Merkez", district: "Fatsa" },
  { id: 202582, text: "Geyikçeli-Kurtuluş", district: "Fatsa" },
  { id: 202583, text: "Geyikçeli-Orhangazi", district: "Fatsa" },
  { id: 202581, text: "Geyikçeli-Sakarya", district: "Fatsa" },
  { id: 202580, text: "Geyikçeli-Yavuzselim", district: "Fatsa" },
  { id: 134831, text: "Gölköy", district: "Fatsa" },
  { id: 205730, text: "Güvercinlik", district: "Fatsa" },
  { id: 154227, text: "Haciköy", district: "Fatsa" },
  { id: 134962, text: "Hamlik", district: "Fatsa" },
  { id: 205739, text: "Hatipli", district: "Fatsa" },
  { id: 152318, text: "Hidirbeyli", district: "Fatsa" },
  { id: 153580, text: "Hoylu", district: "Fatsa" },
  { id: 153074, text: "Ilica", district: "Fatsa" },
  { id: 152914, text: "Inönü", district: "Fatsa" },
  { id: 134033, text: "Islamdağ", district: "Fatsa" },
  { id: 133977, text: "Kabakdaği", district: "Fatsa" },
  { id: 133847, text: "Kaleönü", district: "Fatsa" },
  { id: 134832, text: "Karataş", district: "Fatsa" },
  { id: 205740, text: "Kargucak", district: "Fatsa" },
  { id: 205741, text: "Karşiyaka", district: "Fatsa" },
  { id: 205731, text: "Kavraz", district: "Fatsa" },
  { id: 155643, text: "Kayaca", district: "Fatsa" },
  { id: 205727, text: "Kayaköy/Akçakese", district: "Fatsa" },
  { id: 133995, text: "Kilavuzömer", district: "Fatsa" },
  { id: 151745, text: "Kiliçli", district: "Fatsa" },
  { id: 154854, text: "Konakbaşi", district: "Fatsa" },
  { id: 134947, text: "Kösebucaği Bld/Müezzinoğlu", district: "Fatsa" },
  { id: 154082, text: "Kösebucaği Bld/Soğukpinar", district: "Fatsa" },
  { id: 157506, text: "Kösebucaği/Fatih", district: "Fatsa" },
  { id: 134412, text: "Kösebucaği/Gültepe", district: "Fatsa" },
  { id: 202579, text: "Kösebucaği-Yavuzselim", district: "Fatsa" },
  { id: 154694, text: "Küçükkoç", district: "Fatsa" },
  { id: 155972, text: "Kulak", district: "Fatsa" },
  { id: 133754, text: "Küpdüşen", district: "Fatsa" },
  { id: 153922, text: "Kurtuluş", district: "Fatsa" },
  { id: 133848, text: "M.K.Paşa", district: "Fatsa" },
  { id: 153817, text: "Mehmetakif", district: "Fatsa" },
  { id: 152121, text: "Meşebükü", district: "Fatsa" },
  { id: 151616, text: "Oluklu", district: "Fatsa" },
  { id: 155375, text: "Örencik", district: "Fatsa" },
  { id: 205732, text: "Palazli/Kömürlük", district: "Fatsa" },
  { id: 134833, text: "Sakarya", district: "Fatsa" },
  { id: 153486, text: "Salihli", district: "Fatsa" },
  { id: 155062, text: "Saraytepe", district: "Fatsa" },
  { id: 151759, text: "Sazcilar", district: "Fatsa" },
  { id: 153920, text: "Sefaköy", district: "Fatsa" },
  { id: 154562, text: "Şerefiye", district: "Fatsa" },
  { id: 153921, text: "Sudere", district: "Fatsa" },
  { id: 133914, text: "Tahtabaş", district: "Fatsa" },
  { id: 155931, text: "Taşlica", district: "Fatsa" },
  { id: 136508, text: "Tayali", district: "Fatsa" },
  { id: 151788, text: "Tepecik", district: "Fatsa" },
  { id: 205728, text: "Uzundere", district: "Fatsa" },
  { id: 153075, text: "Yaliköy", district: "Fatsa" },
  { id: 153929, text: "Yaprakli", district: "Fatsa" },
  { id: 153893, text: "Yassibahçe", district: "Fatsa" },
  { id: 152497, text: "Yassitaş", district: "Fatsa" },
  { id: 156986, text: "Yavaş", district: "Fatsa" },
  { id: 153030, text: "Yenidoğan", district: "Fatsa" },
  { id: 151583, text: "Yenikent", district: "Fatsa" },
  { id: 205733, text: "Yenipazar", district: "Fatsa" },
  { id: 154704, text: "Yeniyurt", district: "Fatsa" },
  { id: 205729, text: "Yeşilköy", district: "Fatsa" },
  { id: 204345, text: "Yeşiltepe", district: "Fatsa" },
  { id: 153736, text: "Yukariardiç", district: "Fatsa" },
  { id: 154672, text: "Yukaribahçeler", district: "Fatsa" },
  { id: 153253, text: "Yukaritepe", district: "Fatsa" },
  { id: 153245, text: "Yusuflu", district: "Fatsa" },

  // --- ÇAMAŞ (758) - 23 Mahalle ---
  { id: 16112, text: "Akköy", district: "Çamaş" },
  { id: 154964, text: "Akpinar", district: "Çamaş" },
  { id: 15885, text: "Budak", district: "Çamaş" },
  { id: 155367, text: "Burhangüneyi", district: "Çamaş" },
  { id: 16099, text: "Çavuşbaşi", district: "Çamaş" },
  { id: 16413, text: "Danişman", district: "Çamaş" },
  { id: 15868, text: "Edirli", district: "Çamaş" },
  { id: 16745, text: "Giden", district: "Çamaş" },
  { id: 16190, text: "Gümüşlü", district: "Çamaş" },
  { id: 15979, text: "Hisarbey", district: "Çamaş" },
  { id: 15772, text: "Kemalpaşa", district: "Çamaş" },
  { id: 16459, text: "Kestaneyokuşu", district: "Çamaş" },
  { id: 205508, text: "Kocaman", district: "Çamaş" },
  { id: 16348, text: "Örmeli", district: "Çamaş" },
  { id: 153889, text: "Sakargeriş", district: "Çamaş" },
  { id: 134047, text: "Sariyakup", district: "Çamaş" },
  { id: 15109, text: "Söken", district: "Çamaş" },
  { id: 208159, text: "Sucuali", district: "Çamaş" },
  { id: 16196, text: "Taşoluk", district: "Çamaş" },
  { id: 15812, text: "Tepeli", district: "Çamaş" },
  { id: 16892, text: "Uzunali", district: "Çamaş" },
  { id: 16706, text: "Yeni", district: "Çamaş" },
  { id: 16473, text: "Yeşilvadi", district: "Çamaş" },

  // --- ÇATALPINAR (759) - 27 Mahalle ---
  { id: 155641, text: "Akkaya", district: "Çatalpınar" },
  { id: 16111, text: "Dere", district: "Çatalpınar" },
  { id: 16052, text: "Elmaköy", district: "Çatalpınar" },
  { id: 208387, text: "Göller", district: "Çatalpınar" },
  { id: 151771, text: "Göller Durakli", district: "Çatalpınar" },
  { id: 154881, text: "Göller Karşiyaka", district: "Çatalpınar" },
  { id: 153942, text: "Göller Kaynar", district: "Çatalpınar" },
  { id: 153892, text: "Göller Yukari", district: "Çatalpınar" },
  { id: 154518, text: "Gündoğdu", district: "Çatalpınar" },
  { id: 208388, text: "Güney", district: "Çatalpınar" },
  { id: 181563, text: "Güneyce", district: "Çatalpınar" },
  { id: 16360, text: "Haşal", district: "Çatalpınar" },
  { id: 15828, text: "Hatipler", district: "Çatalpınar" },
  { id: 208389, text: "Incirli", district: "Çatalpınar" },
  { id: 155862, text: "Karahamza", district: "Çatalpınar" },
  { id: 15694, text: "Karahasan", district: "Çatalpınar" },
  { id: 151556, text: "Karşiyaka", district: "Çatalpınar" },
  { id: 16475, text: "Kayatepe", district: "Çatalpınar" },
  { id: 16684, text: "Keçili", district: "Çatalpınar" },
  { id: 16705, text: "Kiran", district: "Çatalpınar" },
  { id: 136518, text: "Maden", district: "Çatalpınar" },
  { id: 15537, text: "Merkez", district: "Çatalpınar" },
  { id: 155246, text: "Ortaköy", district: "Çatalpınar" },
  { id: 155455, text: "Sayacatürk", district: "Çatalpınar" },
  { id: 16626, text: "Şirinköy", district: "Çatalpınar" },
  { id: 16629, text: "Terimli", district: "Çatalpınar" },
  { id: 151787, text: "Yenimahalle", district: "Çatalpınar" },
];

export function normalizeMahalleKey(raw: string): string {
  return raw
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0307/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\bmahallesi\b/g, "")
    .replace(/\bmahalle\b/g, "")
    .replace(/\bmah\.?\b/g, "")
    .replace(/\bköyü\b/g, "")
    .replace(/\bköy\b/g, "")
    .replace(/mustafa kemal paşa/g, "m.k.pasa")
    .replace(/madenözü/g, "maden")
    .replace(/burhanettin/g, "burhanguneyi")
    .replace(/eskiköy/g, "eskiordu")
    .replace(/ören\b/g, "ormeli")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * İlçe ve mahalle adından resmi TKGM Mahalle ID'sini bulur
 */
export function resolveTkgmMahalle(
  district: CourtDistrict,
  neighborhoodName: string
): TkgmMahalleItem | null {
  const key = normalizeMahalleKey(neighborhoodName);
  if (!key) return null;

  const districtPool = TKGM_MAHALLE_LIST.filter(
    (m) => m.district === district
  );
  const allPool = TKGM_MAHALLE_LIST;

  // 1. Tam eşleşme (İlçe içinde)
  const exactInDistrict = districtPool.find(
    (m) => normalizeMahalleKey(m.text) === key
  );
  if (exactInDistrict) return exactInDistrict;

  // 2. Tam eşleşme (Tüm ilçelerde)
  const exactAny = allPool.find((m) => normalizeMahalleKey(m.text) === key);
  if (exactAny) return exactAny;

  // 3. İçeren eşleşme (İlçe içinde — uzun eşleşmeye öncelik ver)
  const partialMatches = districtPool
    .filter((m) => {
      const mk = normalizeMahalleKey(m.text);
      return mk.includes(key) || key.includes(mk);
    })
    .sort(
      (a, b) =>
        Math.abs(normalizeMahalleKey(a.text).length - key.length) -
        Math.abs(normalizeMahalleKey(b.text).length - key.length)
    );
  if (partialMatches.length > 0) return partialMatches[0];

  // 4. Tüm ilçelerde kısmi eşleşme
  const anyMatch = allPool.find((m) => {
    const mk = normalizeMahalleKey(m.text);
    return mk.includes(key) || key.includes(mk);
  });
  return anyMatch || null;
}

/**
 * Bir mahalle sorgusu için aday TKGM Mahalle ID listesini öncelik sırasıyla döndürür.
 * Böylece Geyikçeli (6 alt mahalle), Kösebucağı (5 alt mahalle), Göller (5 alt mahalle),
 * Fatsa Merkez (Fatih / Dumlupınar birleşik kadastro kayıtları) veya Bolaman (Yenipazar)
 * gibi çoklu TKGM kaydı olan yerlerde parsel %100 doğru mahalleden yakalanır.
 */
export function resolveCandidateTkgmMahalles(
  district?: CourtDistrict,
  neighborhoodName?: string,
  preferredId?: number
): TkgmMahalleItem[] {
  const result: TkgmMahalleItem[] = [];
  const pushUnique = (item?: TkgmMahalleItem | null) => {
    if (!item) return;
    if (!result.some((r) => r.id === item.id)) {
      result.push(item);
    }
  };

  if (preferredId) {
    const byId = TKGM_MAHALLE_LIST.find((m) => m.id === preferredId);
    pushUnique(byId);
  }

  const key = normalizeMahalleKey(neighborhoodName || "");
  const activeDistrict: CourtDistrict = district || "Fatsa";
  const districtPool = TKGM_MAHALLE_LIST.filter(
    (m) => m.district === activeDistrict
  );

  if (key) {
    const primary = resolveTkgmMahalle(activeDistrict, neighborhoodName || "");
    pushUnique(primary);

    // Aynı kök adı paylaşan alt mahalleleri ekle (Örn: Geyikçeli, Kösebucağı, Göller, Fatih, Kurtuluş, Sakarya)
    for (const m of districtPool) {
      const mk = normalizeMahalleKey(m.text);
      if (mk === key || mk.includes(key) || key.includes(mk)) {
        pushUnique(m);
      }
    }

    // Fatsa Merkez mahallelerinde 22/A sonrası Fatih (208358) ve Dumlupınar (155732) kayıtlarını da aday olarak ekle
    if (
      activeDistrict === "Fatsa" &&
      [
        "mkpasa",
        "sakarya",
        "kurtulus",
        "serefiye",
        "dumlupinar",
        "ayazli",
        "dolunay",
        "evkaf",
        "fatih",
        "karsiyaka",
      ].some((k) => key.includes(k))
    ) {
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 208358)); // Fatih
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 155732)); // Dumlupinar
    }

    // Bolaman bölgesi için Yenipazar (205733) ve Palazlı/Kömürlük (205732) adaylarını ekle
    if (activeDistrict === "Fatsa" && key.includes("bolaman")) {
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 205733)); // Yenipazar
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 205732)); // Palazli/Kömürlük
    }

    // Çamaş Merkez / Sarıyakup için Kocaman (205508) ve Sucuali (208159) adaylarını ekle
    if (
      activeDistrict === "Çamaş" &&
      ["sariyakup", "merkez", "yeni", "kocaman"].some((k) => key.includes(k))
    ) {
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 205508)); // Kocaman
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 208159)); // Sucuali
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 16706)); // Yeni
    }

    // Çatalpınar Merkez / Göller için Güney (208388) ve İncirli (208389) adaylarını ekle
    if (
      activeDistrict === "Çatalpınar" &&
      ["merkez", "guney", "incirli"].some((k) => key.includes(k))
    ) {
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 208388)); // Güney
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 208389)); // Incirli
      pushUnique(TKGM_MAHALLE_LIST.find((m) => m.id === 15537)); // Merkez
    }
  }

  return result;
}

