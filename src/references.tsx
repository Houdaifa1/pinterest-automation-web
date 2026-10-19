import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { api, upload } from "./api";
import type { Message } from "./i18n";
type Reference = { id: string; url: string };
async function compress(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15000000
  )
    throw Error("Choose a JPG, PNG or WebP image under 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / bitmap.width, 1800 / bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("This browser could not open the image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.75, 0.6, 0.45]) {
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", quality),
      );
      if (blob && blob.size <= 300000) return blob;
    }
    throw Error("Choose a smaller image.");
  } finally {
    bitmap.close();
  }
}
export function References({
  accountId,
  flush,
  t,
}: {
  accountId: string;
  flush: () => Promise<void>;
  t: (key: Message) => string;
}) {
  const { id } = useParams();
  const [items, setItems] = useState<Reference[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [styles, setStyles] = useState<any[]>([]),
    [restoreId, setRestoreId] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const base = `/api/automations/${id}`;
  const load = async () => {
    await flush();
    const result = await api(`${base}/accounts/${accountId}/media`);
    setItems(result.media);
    const history = await api(`${base}/accounts/${accountId}/styles`);
    setStyles(history.styles);
  };
  useEffect(() => {
    void load().catch(() => setError(true));
  }, [id, accountId]);
  return (
    <section className="references">
      <h3>{t("style")}</h3>
      <p>{t("styleCopy")}</p>
      <p className="reference-help">{t("referenceLimit")}</p>
      <div className="reference-grid">
        {items.map((item) => (
          <div className="reference" key={item.id}>
            <img src={item.url} alt={t("style")} width={100} height={150} />
            <button
              aria-label={t("remove")}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`${base}/media/${item.id}`, "DELETE");
                  await load();
                } catch {
                  setError(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {items.length < 6 && (
          <button
            className="reference-add"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Plus size={22} />
            <span>{busy ? t("saving") : t("addImages")}</span>
          </button>
        )}
      </div>
      {styles.length > 1 && (
        <details>
          <summary>{t("styleHistory")}</summary>
          <label className="field">
            <span>{t("styleHistory")}</span>
            <select
              value={restoreId}
              onChange={(e) => setRestoreId(e.target.value)}
            >
              <option value="">{t("select")}</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.createdAt * 1000).toLocaleString()} · {s.count}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || !restoreId}
            onClick={async () => {
              setBusy(true);
              try {
                await api(
                  `${base}/accounts/${accountId}/styles/${restoreId}/restore`,
                  "POST",
                  {},
                );
                await load();
              } catch {
                setError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("restore")}
          </button>
        </details>
      )}
      <input
        className="sr-only"
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label={t("addImages")}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length + items.length > 6) {
            setError(true);
            return;
          }
          setBusy(true);
          setError(false);
          try {
            await flush();
            for (const file of files)
              await upload(
                `${base}/accounts/${accountId}/media`,
                await compress(file),
              );
            await load();
          } catch {
            setError(true);
          } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
          }
        }}
      />
      {error && (
        <p role="alert" className="image-error">
          {t("error")} · {t("addImages")}
        </p>
      )}
    </section>
  );
}
