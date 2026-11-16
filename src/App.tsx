import { Download, ImagePlus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import {
  SIZE_PRESETS,
  canvasToBlob,
  compose,
  isPortrait,
  loadBitmap,
  outputName,
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

const ICON = { size: 16, strokeWidth: 1.5 }

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 空の状態の図：縦長の写真が90°回って、16:9 の黒台紙に横向きで収まる */
function EmptyFigure({ rotate }: { rotate: RotateDir }) {
  const cw = rotate === 'cw'
  return (
    <svg className="empty-figure" viewBox="0 0 320 180" aria-hidden>
      <rect x="0" y="0" width="320" height="180" className="fig-mat" />
      {/* 回転後の横長写真 */}
      <g>
        <rect x="88" y="26" width="144" height="96" rx="2" className="fig-photo" />
        <path d="M 96 114 L 136 74 L 160 96 L 180 80 L 224 114 Z" className="fig-hill" />
        <circle cx="200" cy="52" r="8" className="fig-sun" />
      </g>
      {/* 回転前の縦長写真（点線） */}
      <rect x="112" y="8" width="96" height="144" rx="2" className="fig-ghost" />
      <path d={cw ? 'M 214 14 A 40 40 0 0 1 252 52' : 'M 106 14 A 40 40 0 0 0 68 52'} className="fig-arc" />
      <polyline points={cw ? '246,46 252,54 258,46' : '62,46 68,54 74,46'} className="fig-arc" />
      <text x="160" y="170" className="fig-dim">
        16 : 9
      </text>
    </svg>
  )
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
        setError(`${file.name} を読み込めませんでした。対応していない形式の可能性があります`)
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

  const clearAll = () =>
    setItems((prev) => {
      prev.forEach((p) => {
        if (p.url) URL.revokeObjectURL(p.url)
        p.bitmap.close()
      })
      return []
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

  // クリップボードからの貼り付け
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const openPicker = () => inputRef.current?.click()
  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      addFiles(e.dataTransfer.files)
    },
  }

  return (
    <div className="app">
      <header className="header">
        <div className="wordmark">
          <span className="mark" aria-hidden />
          16:9 Frame
        </div>
        <a className="repo" href="https://github.com/abemaru/169-frame" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </header>

      <main className="layout">
        <aside className="panel">
          <section>
            <h2>出力サイズ</h2>
            <div className="options" role="radiogroup">
              {SIZE_PRESETS.map((p, i) => (
                <label key={p.label} className={`option ${sizeIdx === i ? 'on' : ''}`}>
                  <input type="radio" name="size" checked={sizeIdx === i} onChange={() => setSizeIdx(i)} />
                  <span className="dim">{p.label}</span>
                  <span className="hint">{p.hint}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2>縦長画像の回転</h2>
            <div className="seg" role="radiogroup">
              {(['cw', 'ccw'] as const).map((d) => (
                <button key={d} role="radio" aria-checked={rotate === d} className={rotate === d ? 'on' : ''} onClick={() => setRotate(d)}>
                  {d === 'cw' ? '右に 90°' : '左に 90°'}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>形式</h2>
            <div className="seg" role="radiogroup">
              {(['image/png', 'image/jpeg'] as const).map((f) => (
                <button key={f} role="radio" aria-checked={format === f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>
                  {f === 'image/png' ? 'PNG' : 'JPEG'}
                </button>
              ))}
            </div>
            {format === 'image/jpeg' && (
              <label className="range">
                <span className="range-label">
                  画質<span className="num">{Math.round(quality * 100)}</span>
                </span>
                <input type="range" min={0.6} max={1} step={0.01} value={quality} onChange={(e) => setQuality(+e.target.value)} />
              </label>
            )}
          </section>

          <p className="privacy">画像はブラウザの中だけで処理され、どこにも送信されません</p>
        </aside>

        <section className="workspace">
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

          {items.length === 0 ? (
            <div
              className={`drop ${dragging ? 'over' : ''}`}
              role="button"
              tabIndex={0}
              onClick={openPicker}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
              {...dropHandlers}
            >
              <div className="crop">
                <EmptyFigure rotate={rotate} />
              </div>
              <div className="drop-text">
                <h1>縦長や正方形の写真を、黒帯つきの 16:9 に</h1>
                <p className="sub">
                  縦長の画像は横向きに回して、VRChat に上げられる <span className="num">{size.label}</span> で書き出します
                </p>
                <p className="how">
                  ドロップ、クリックで選択、<span className="nowrap"><kbd>Ctrl</kbd> <kbd>V</kbd> で貼り付け</span>
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className={`toolbar ${dragging ? 'over' : ''}`} {...dropHandlers}>
                <span className="count num">{items.length} 枚</span>
                <button className="secondary" onClick={openPicker}>
                  <ImagePlus {...ICON} />
                  追加
                </button>
                <div className="spacer" />
                <button className="text" onClick={clearAll}>
                  すべてクリア
                </button>
                <button className="primary" onClick={downloadAll} disabled={items.some((i) => !i.url)}>
                  <Download {...ICON} />
                  すべて保存
                </button>
              </div>

              <div className="grid">
                {items.map((item) => (
                  <figure key={item.id} className="card">
                    <div className="crop">
                      <div className="preview">
                        {item.url ? <img src={item.url} alt={item.file.name} /> : <div className="loading" />}
                      </div>
                      <span className="crop-dim num">{size.label}</span>
                    </div>
                    <figcaption>
                      <div className="info">
                        <div className="name" title={item.file.name}>
                          {item.file.name}
                        </div>
                        <div className="meta num">
                          {item.bitmap.width} × {item.bitmap.height}
                          {isPortrait(item.bitmap) && <>　{rotate === 'cw' ? '右' : '左'}に回転</>}
                          {item.blob && <>　{formatBytes(item.blob.size)}</>}
                        </div>
                      </div>
                      <button className="icon" onClick={() => remove(item.id)} aria-label={`${item.file.name} を削除`}>
                        <Trash2 {...ICON} />
                      </button>
                      <button className="secondary" onClick={() => download(item)} disabled={!item.url}>
                        <Download {...ICON} />
                        保存
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
              <button className="icon" onClick={() => setError(null)} aria-label="閉じる">
                <X {...ICON} />
              </button>
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
