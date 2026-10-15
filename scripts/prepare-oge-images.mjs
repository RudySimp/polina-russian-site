import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const planPath = resolve(root, "docs/OGE_ASSETS_PLAN_2026-10-14.json");
const manifestPath = resolve(root, "content/oge-images.json");
const indexPath = resolve(root, "apps/showcase/src/content/image-index.json");
const publicDirectory = "apps/showcase/public/images/oge";
const widths = [160, 320, 640, 960];
const encoding = {
  format: "webp",
  quality: 85,
  alphaQuality: 100,
  effort: 6,
  smartSubsample: true,
};
const publicOnly = process.argv.includes("--check-public");
const checkOnly = publicOnly || process.argv.includes("--check");
assert(
  process.argv
    .slice(2)
    .every((arg) => arg === "--check" || arg === "--check-public"),
  "Допустимые параметры: --check, --check-public",
);
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const safeRelative = (path) => {
  assert(
    typeof path === "string" &&
      !path.includes("..") &&
      !path.includes(":") &&
      !path.startsWith("/"),
    "Некорректный относительный путь",
  );
  const absolute = resolve(root, path);
  assert(
    !relative(root, absolute).startsWith(".." + sep),
    "Путь выходит за пределы проекта",
  );
  return absolute;
};
const plan = JSON.parse(await readFile(planPath, "utf8"));
assert(
  plan.date === "2026-10-14" &&
    Array.isArray(plan.assets) &&
    plan.assets.length === 42,
  "Ожидается полный план из 42 изображений",
);
assert(
  plan.assets.filter((asset) => asset.kind === "illustration").length === 30,
  "Ожидается 30 предметных иллюстраций",
);
assert(
  plan.assets.filter((asset) => asset.kind === "portrait").length === 12,
  "Ожидается 12 портретов",
);
assert(
  new Set(plan.assets.map((asset) => asset.proposedStem)).size ===
    plan.assets.length,
  "Повторяются идентификаторы изображений",
);
let previous;
try {
  previous = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (checkOnly) assert(previous, "Manifest ещё не подготовлен");
const assets = [];
for (const item of plan.assets) {
  assert(
    /^[a-z0-9-]+$/.test(item.proposedStem),
    "Некорректное имя веб-изображения",
  );
  assert(
    item.kind === "portrait" || item.kind === "illustration",
    "Неизвестный тип изображения",
  );
  assert(
    item.sourceLocalPath.startsWith("artifacts/audit-2026-10-14/images/"),
    "Исходник должен находиться в закрытых артефактах аудита",
  );
  assert(
    (item.proposedPublicDirectory.endsWith("/")
      ? item.proposedPublicDirectory.slice(0, -1)
      : item.proposedPublicDirectory) === publicDirectory,
    "Неожиданная папка публикации",
  );
  const source = publicOnly
    ? null
    : await readFile(safeRelative(item.sourceLocalPath));
  if (source) {
    assert.equal(
      digest(source),
      item.sourceSha256,
      item.proposedStem + ": SHA-256 исходника не совпадает с планом",
    );
    assert.equal(
      source.byteLength,
      item.sourceBytes,
      item.proposedStem + ": размер исходника не совпадает с планом",
    );
  }
  const original = source
    ? await sharp(source).metadata()
    : {
        format: "png",
        width: item.width,
        height: item.height,
        hasAlpha: item.alphaChannel,
      };
  assert.equal(original.format, "png", "Исходник должен быть PNG");
  assert.equal(
    original.width,
    item.width,
    item.proposedStem + ": неверная ширина исходника",
  );
  assert.equal(
    original.height,
    item.height,
    item.proposedStem + ": неверная высота исходника",
  );
  assert(
    original.hasAlpha && item.alphaChannel,
    item.proposedStem + ": отсутствует прозрачность",
  );
  const old = previous?.assets.find((asset) => asset.id === item.proposedStem);
  if (old)
    assert.equal(
      old.source.sha256,
      item.sourceSha256,
      "Исходник существующего изображения изменён: нужна явная новая редакция",
    );
  const variants = [];
  for (const width of widths) {
    assert(width <= original.width, "Увеличение исходника запрещено");
    const file =
      publicDirectory + "/" + item.proposedStem + "-" + width + ".webp";
    const absolute = safeRelative(file);
    let output;
    if (checkOnly) {
      output = await readFile(absolute);
    } else {
      output = await sharp(source)
        .resize({
          width,
          withoutEnlargement: true,
          fit: "inside",
          kernel: "lanczos3",
        })
        .webp({
          quality: encoding.quality,
          alphaQuality: encoding.alphaQuality,
          effort: encoding.effort,
          smartSubsample: encoding.smartSubsample,
        })
        .toBuffer();
      await mkdir(resolve(root, publicDirectory), { recursive: true });
      await writeFile(absolute, output);
    }
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp", "Неверный формат веб-версии");
    assert.equal(metadata.width, width, "Неверная ширина веб-версии");
    assert.equal(
      metadata.height,
      Math.round((original.height * width) / original.width),
      "Пропорции веб-версии нарушены",
    );
    assert(metadata.hasAlpha, "Веб-версия потеряла alpha");
    const statistics = await sharp(output).stats();
    assert(!statistics.isOpaque, "Веб-версия потеряла прозрачные пиксели");
    const variant = {
      width: metadata.width,
      height: metadata.height,
      bytes: output.byteLength,
      sha256: digest(output),
      format: "webp",
      hasAlpha: true,
      file,
      url: "images/oge/" + item.proposedStem + "-" + width + ".webp",
    };
    if (checkOnly)
      assert.deepEqual(
        variant,
        old?.variants.find((entry) => entry.width === width),
        item.proposedStem + ": веб-версия расходится с manifest",
      );
    variants.push(variant);
  }
  const portrait = item.kind === "portrait";
  const usage = old?.usage ?? {
    status: portrait ? "reserve-unverified-attribution" : "prepared-reserve",
    usedOn: [],
    reason: portrait
      ? "Имя взято из имени исходного файла; достоверность портрета и связь с авторством текущих текстов не подтверждены. Портрет не установлен в интерфейс."
      : "Веб-версии подготовлены; установка выбирается по учебной роли без загрузки всего набора на первом экране.",
  };
  assert(
    Array.isArray(usage.usedOn) &&
      usage.usedOn.every(
        (route) =>
          typeof route === "string" &&
          route.startsWith("/") &&
          !route.includes("?"),
      ),
    "Использование должно содержать локальные маршруты",
  );
  if (portrait)
    assert(
      usage.usedOn.length === 0 &&
        usage.status === "reserve-unverified-attribution",
      "Неподтверждённый портрет нельзя автоматически установить",
    );
  assets.push({
    id: item.proposedStem,
    kind: item.kind,
    subject: portrait
      ? {
          name: item.author,
          attributionStatus: "filename-only-unverified",
          depiction: "stylized-illustration",
        }
      : null,
    decorative: !portrait,
    alt: portrait
      ? "Стилизованная иллюстрация: предполагаемый " +
        item.author +
        "; атрибуция не подтверждена"
      : "",
    role: item.proposedRole,
    captionRule: item.captionRule,
    source: {
      file: item.sourceLocalPath,
      filename: item.sourceFilename,
      sha256: item.sourceSha256,
      bytes: item.sourceBytes,
      width: item.width,
      height: item.height,
      hasAlpha: true,
      provenance: "user-provided-google-drive-assets",
      driveId: item.driveId,
      rightsEvidence: "not-stated-in-provided-plan",
      creator: null,
    },
    usage,
    variants,
  });
}
const publicFiles = await readdir(resolve(root, publicDirectory));
const expectedFiles = assets
  .flatMap((asset) =>
    asset.variants.map((variant) => variant.url.slice("images/oge/".length)),
  )
  .sort();
assert.deepEqual(
  publicFiles.sort(),
  expectedFiles,
  "В публичной папке должны находиться только 168 зарегистрированных WebP; исходники и посторонние файлы не публикуются",
);

const manifest = {
  schemaVersion: 1,
  sourcePlan: "docs/OGE_ASSETS_PLAN_2026-10-14.json",
  sourceDate: plan.date,
  encoding,
  preparation: {
    preserveAlpha: true,
    preserveAspectRatio: true,
    withoutEnlargement: true,
    widths,
    portraitAttributionConfirmed: false,
    sourceOriginalsPublished: false,
    signedUrlsIncluded: false,
  },
  totals: {
    assets: assets.length,
    illustrations: assets.filter((asset) => asset.kind === "illustration")
      .length,
    portraits: assets.filter((asset) => asset.kind === "portrait").length,
    variants: assets.reduce((sum, asset) => sum + asset.variants.length, 0),
    originalBytes: assets.reduce((sum, asset) => sum + asset.source.bytes, 0),
    webBytes: assets.reduce(
      (sum, asset) =>
        sum +
        asset.variants.reduce((bytes, variant) => bytes + variant.bytes, 0),
      0,
    ),
  },
  assets,
};
assert.equal(
  manifest.totals.originalBytes,
  plan.sourceBytes,
  "Общий размер исходников расходится с планом",
);
const index = {
  schemaVersion: 1,
  assets: assets.map(({ id, kind, alt, decorative, variants }) => ({
    id,
    kind,
    alt,
    decorative,
    variants: variants.map(({ width, height, url }) => ({
      width,
      height,
      url,
    })),
  })),
};
if (checkOnly) {
  assert.deepEqual(
    manifest,
    previous,
    "Manifest расходится с исходным планом или актуальными веб-версиями",
  );
  assert.deepEqual(
    index,
    JSON.parse(await readFile(indexPath, "utf8")),
    "Публичный индекс расходится с manifest",
  );
} else {
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
}
console.log(
  JSON.stringify(
    {
      mode: publicOnly
        ? "verified-public-web"
        : checkOnly
          ? "verified-source-and-web"
          : "prepared",
      ...manifest.totals,
      sizes: assets[0].variants.map(({ width, height }) => ({ width, height })),
      portraitSizes: assets
        .find((asset) => asset.kind === "portrait")
        .variants.map(({ width, height }) => ({ width, height })),
      sourceOriginalsPublished: false,
      alphaPreserved: true,
    },
    null,
    2,
  ),
);
