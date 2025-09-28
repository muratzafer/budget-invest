import { prisma } from "@/lib/db";
import natural from "natural";

const tokenizer = new natural.WordTokenizer();

function toText(desc?: string | null, merchant?: string | null) {
  return `${(merchant ?? "").toLowerCase()} ${(desc ?? "").toLowerCase()}`.trim();
}

type Centroid = { categoryId: string; vec: Map<string, number>; norm: number };

// ---- Simple in-memory cache for centroids (rebuild at most every 5 minutes)
let _centroidCache: { builtAt: number; centroids: Centroid[] } | null = null;
const REBUILD_MS = 5 * 60_000; // 5 dk

export async function buildCentroids(): Promise<Centroid[]> {
  // Kullanıcı tarafından onaylanmış (veya son hali) etiketli datayı al
  const rows = await prisma.transaction.findMany({
    where: { categoryId: { not: null } },
    select: { categoryId: true, description: true, merchant: true },
    take: 10000, // hafif tut
  });

  // TF hesapla
  const perCatTF: Record<string, Map<string, number>> = {};
  for (const r of rows) {
    const text = toText(r.description, r.merchant);
    if (!text) continue;
    const tokens = tokenizer.tokenize(text).filter(t => t.length > 1);
    const cat = r.categoryId!;
    perCatTF[cat] ??= new Map();
    const m = perCatTF[cat];
    for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  }

  // IDF
  const df = new Map<string, number>();
  const cats = Object.keys(perCatTF);
  for (const cat of cats) {
    for (const term of perCatTF[cat].keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const N = cats.length || 1;

  // Centroid = kategori vektörünün normalize edilmiş tf-idf'i
  const centroids: Centroid[] = [];
  for (const cat of cats) {
    const tf = perCatTF[cat];
    const vec = new Map<string, number>();
    let norm = 0;
    tf.forEach((tfv, term) => {
      const idf = Math.log(1 + N / (df.get(term) ?? 1));
      const w = tfv * idf;
      vec.set(term, w);
      norm += w * w;
    });
    centroids.push({ categoryId: cat, vec, norm: Math.sqrt(norm) || 1 });
  }
  return centroids;
}

export async function buildCentroidsCached(): Promise<Centroid[]> {
  if (_centroidCache && Date.now() - _centroidCache.builtAt < REBUILD_MS) {
    return _centroidCache.centroids;
  }
  const centroids = await buildCentroids();
  _centroidCache = { builtAt: Date.now(), centroids };
  return centroids;
}

function cosine(a: Map<string, number>, an: number, b: Map<string, number>, bn: number) {
  let dot = 0;
  for (const [term, w] of a) {
    const v = b.get(term);
    if (v) dot += w * v;
  }
  return dot / (an * bn);
}

export async function mlSuggestCategoryId(input: {
  description?: string | null;
  merchant?: string | null;
}): Promise<{ categoryId: string | null; confidence: number }> {
  const text = toText(input.description, input.merchant);
  if (!text) return { categoryId: null, confidence: 0 };

  const centroids = await buildCentroidsCached();
  if (centroids.length === 0) return { categoryId: null, confidence: 0 };

  // Sorgu vektörü
  const tf = new Map<string, number>();
  for (const t of tokenizer.tokenize(text).filter(t => t.length > 1)) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  // İD’leri tekrar hesaplamamak için centroid’teki idf ile yakınlaştırıyoruz: term kesişiminde iş görür
  const qnorm = Math.sqrt(Array.from(tf.values()).reduce((s, x) => s + x * x, 0)) || 1;

  let best: { id: string | null; score: number } = { id: null, score: 0 };
  for (const c of centroids) {
    // sadece kesişen terimler ile yaklaşık cosine
    const score = cosine(tf, qnorm, c.vec, c.norm);
    if (score > best.score) best = { id: c.categoryId, score };
  }
  // eşik: 0.35 (başlangıç için iyi), UI’den ayarlanabilir yaparız
  const confidence = Math.min(Math.max(best.score, 0), 1);
  return confidence >= 0.35 ? { categoryId: best.id, confidence } : { categoryId: null, confidence };
}