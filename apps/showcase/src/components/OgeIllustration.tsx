import images from "../content/image-index.json";
export const topicIllustrations: Record<string, string> = {
  osnova: "06-sentence-scheme",
  sintaksis: "06-sentence-scheme",
  "punktuacionnye-pravila": "04-comma-leaves",
  "punktuacionnyy-analiz": "12-punctuation-leaves",
  odnorodnye: "12-punctuation-leaves",
  "orfograficheskiy-analiz": "05-word-roots-tree",
  "glasnye-v-tekste": "05-word-roots-tree",
  "formy-slov": "07-editing-pencil",
  slovosochetaniya: "13-word-chain",
  "analiz-teksta": "11-text-search",
  vyrazitelnost: "19-bird-letters",
  leksika: "22-dictionary",
  izlozhenie: "23-book-speech",
  sochinenie: "21-quill-ink",
};
export function OgeIllustration({
  id,
  priority = false,
}: {
  id: string;
  priority?: boolean;
}) {
  const asset = images.assets.find((image) => image.id === id);
  if (!asset || asset.kind !== "illustration") return null;
  const source =
    asset.variants.find((image) => image.width === 320) ?? asset.variants[0];
  const base = import.meta.env.BASE_URL;
  return (
    <img
      className="oge-illustration"
      src={base + source.url}
      srcSet={asset.variants
        .map((image) => base + image.url + " " + image.width + "w")
        .join(", ")}
      sizes="(max-width: 600px) 88px, 128px"
      width={source.width}
      height={source.height}
      alt=""
      aria-hidden="true"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  );
}
