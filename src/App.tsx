import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SIZE_PRESETS,
  VRC_MAX_EDGE,
  canvasToBlob,
  compose,
  loadBitmap,
  outputName,
  isPortrait,
  type ComposeOptions,
  type OutputFormat,
  type RotateDir,
} from './compose'

interface Item {
  id: string
  file: File
  bitmap: ImageBitmap
  url?: string
  blob?: Blob
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [sizeIdx, setSizeIdx] = useState(0)
  const [rotate, setRotate] = useState<RotateDir>('cw')
  const [format, setFormat] = useState<OutputFormat>('image/png')
  const [quality, setQuality] = useState(0.92)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<Item[]>([])
  itemsRef.current = items

  const size = SIZE_PRESETS[sizeIdx]

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) {
      setError('画像ファイルを選んでください')
      return
    }
    const loaded: Item[] = []
    for (const file of list) {
      try {
        const bitmap = await loadBitmap(file)
        loaded.push({ id: crypto.randomUUID(), file, bitmap })
      } catch {
        setError(`${file.name} を読み込めませんでした（対応していない形式の可能性があります）`)
      }
    }
    setItems((prev) => [...prev, ...loaded])
  }, [])

  // 設定または画像が変わったら再合成
  const settingsKey = JSON.stringify([sizeIdx, rotate, format, quality])
  const idsKey = items.map((i) => i.id).join(',')
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const opts: ComposeOptions = { width: size.width, height: size.height, rotate }
      const canvas = document.createElement('canvas')
      for (const item of itemsRef.current) {
        if (cancelled) return
        compose(canvas, item.bitmap, opts)
        const blob = await canvasToBlob(canvas, format, quality)
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        setItems((prev) =>
          prev.map((p) => {
            if (p.id !== item.id) return p
            if (p.url) URL.revokeObjectURL(p.url)
            return { ...p, url, blob }
          }),
        )
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey, idsKey])

  const remove = (id: string) =>
    setItems((prev) => {
      const t = prev.find((p) => p.id === id)
      if (t?.url) URL.revokeObjectURL(t.url)
      t?.bitmap.close()
      return prev.filter((p) => p.id !== id)
    })

  const download = (item: Item) => {
    if (!item.url) return
    const a = document.createElement('a')
    a.href = item.url
    a.download = outputName(item.file.name, format, size.width, size.height)
    a.click()
  }

  const downloadAll = async () => {
    for (const item of items) {
      download(item)
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  // クリップボードからの貼り付けにも対応
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  return (
    <div className="app">
      <header className="header">
        <h1>
          VRC <span className="accent">16:9</span> Frame
        </h1>
        <p className="lead">
          縦長や正方形の画像に黒枠をつけて 16:9 に。縦長の画像は横向きに回転します。VRChat の上限（{VRC_MAX_EDGE}px）内に収めて書き出します。
          <br />
          画像はブラウザの中だけで処理され、どこにも送信されません。
        </p>
      </header>

      <main className="layout">
        <aside className="panel">
          <section>
            <h2>出力サイズ</h2>
            {SIZE_PRESETS.map((p, i) => (
              <label key={p.label} className="radio">
                <input type="radio" checked={sizeIdx === i} onChange={() => setSizeIdx(i)} />
                {p.label}
              </label>
            ))}
          </section>

          <section>
            <h2>縦長画像の回転</h2>
            <div className="seg">
              <button className={rotate === 'cw' ? 'on' : ''} onClick={() => setRotate('cw')}>
                右に90°
              </button>
              <button className={rotate === 'ccw' ? 'on' : ''} onClick={() => setRotate('ccw')}>
                左に90°
              </button>
            </div>
            <p className="note">縦長の画像は自動で横向きにしてから、黒背景の 16:9 に配置します。</p>
          </section>

          <section>
            <h2>形式</h2>
            <div className="seg">
              <button className={format === 'image/png' ? 'on' : ''} onClick={() => setFormat('image/png')}>
                PNG
              </button>
              <button className={format === 'image/jpeg' ? 'on' : ''} onClick={() => setFormat('image/jpeg')}>
                JPEG
              </button>
            </div>
            {format === 'image/jpeg' && (
              <label className="range">
                画質 <span>{Math.round(quality * 100)}</span>
                <input
                  type="range"
                  min={0.6}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => setQuality(+e.target.value)}
                />
              </label>
            )}
          </section>
        </aside>

        <section className="workspace">
          <div
            className={`drop ${dragging ? 'over' : ''} ${items.length ? 'compact' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <div className="drop-icon" aria-hidden>
              <span />
            </div>
            <p>
              <strong>画像をドロップ</strong> / クリックして選択 / Ctrl+V で貼り付け
            </p>
            <p className="sub">複数枚まとめて変換できます</p>
          </div>

          {error && <p className="error">{error}</p>}

          {items.length > 0 && (
            <div className="toolbar">
              <span>{items.length} 枚</span>
              <div className="spacer" />
              <button className="ghost" onClick={() => items.forEach((i) => remove(i.id))}>
                すべてクリア
              </button>
              <button className="primary" onClick={downloadAll} disabled={items.some((i) => !i.url)}>
                すべてダウンロード
              </button>
            </div>
          )}

          <div className="grid">
            {items.map((item) => (
              <figure key={item.id} className="card">
                <div className="preview">{item.url ? <img src={item.url} alt={item.file.name} /> : <div className="loading" />}</div>
                <figcaption>
                  <div className="name" title={item.file.name}>
                    {item.file.name}
                  </div>
                  <div className="meta">
                    {item.bitmap.width}×{item.bitmap.height}
                    {isPortrait(item.bitmap) && <>（{rotate === 'cw' ? '右' : '左'}に回転）</>} → {size.width}×{size.height}
                    {item.blob && <> ・ {formatBytes(item.blob.size)}</>}
                  </div>
                  <div className="actions">
                    <button className="ghost" onClick={() => remove(item.id)}>
                      削除
                    </button>
                    <button className="primary" onClick={() => download(item)} disabled={!item.url}>
                      ダウンロード
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <a href="https://github.com/abemaru/vrc-169-frame" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  )
}
