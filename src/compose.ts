export type Background =
  | { kind: 'color'; color: string }
  | { kind: 'blur'; strength: number; dim: number }

export type OutputFormat = 'image/png' | 'image/jpeg'

export interface ComposeOptions {
  width: number
  height: number
  /** 画像の周囲に空ける余白（短辺に対する割合 0〜0.3） */
  padding: number
  background: Background
  /** 元画像より大きく拡大することを許可するか */
  allowUpscale: boolean
}

export const SIZE_PRESETS = [
  { label: '2048 × 1152（VRChat上限内で最大）', width: 2048, height: 1152 },
  { label: '1920 × 1080（フルHD）', width: 1920, height: 1080 },
  { label: '1280 × 720（HD・軽量）', width: 1280, height: 720 },
] as const

/** VRChat にアップロードできる最大辺 */
export const VRC_MAX_EDGE = 2048

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  // EXIF の向き情報を反映して読み込む
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

export function compose(
  canvas: HTMLCanvasElement,
  img: ImageBitmap,
  opts: ComposeOptions,
): { drawWidth: number; drawHeight: number } {
  const { width: W, height: H } = opts
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D が使えません')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 背景
  if (opts.background.kind === 'color') {
    ctx.fillStyle = opts.background.color
    ctx.fillRect(0, 0, W, H)
  } else {
    const { strength, dim } = opts.background
    // 画面を覆うように拡大した画像をぼかして敷く
    // ctx.filter 非対応ブラウザ（一部 Safari）でも効くよう、縮小→拡大でぼかす
    const cover = Math.max(W / img.width, H / img.height) * 1.1
    const cw = img.width * cover
    const ch = img.height * cover
    const factor = 1 + strength / 2
    const sw = Math.max(4, Math.round(W / factor))
    const sh = Math.max(4, Math.round(H / factor))
    const small = document.createElement('canvas')
    small.width = sw
    small.height = sh
    const sctx = small.getContext('2d')!
    sctx.imageSmoothingQuality = 'high'
    const k = sw / W
    sctx.drawImage(img, ((W - cw) / 2) * k, ((H - ch) / 2) * k, cw * k, ch * k)
    ctx.save()
    if ('filter' in ctx) ctx.filter = `blur(${Math.max(2, strength / 4)}px)`
    ctx.drawImage(small, -W * 0.02, -H * 0.02, W * 1.04, H * 1.04)
    ctx.restore()
    ctx.fillStyle = `rgba(0,0,0,${dim})`
    ctx.fillRect(0, 0, W, H)
  }

  // 前景（アスペクト比を保ったまま収める）
  const pad = Math.round(Math.min(W, H) * opts.padding)
  const areaW = W - pad * 2
  const areaH = H - pad * 2
  let scale = Math.min(areaW / img.width, areaH / img.height)
  if (!opts.allowUpscale) scale = Math.min(scale, 1)
  const dw = Math.round(img.width * scale)
  const dh = Math.round(img.height * scale)
  const dx = Math.round((W - dw) / 2)
  const dy = Math.round((H - dh) / 2)

  // 大幅縮小時のジャギー対策として段階的に縮小
  const source = stepDown(img, dw, dh)
  ctx.drawImage(source, dx, dy, dw, dh)

  return { drawWidth: dw, drawHeight: dh }
}

function stepDown(img: ImageBitmap, tw: number, th: number): CanvasImageSource {
  let w = img.width
  let h = img.height
  if (w <= tw * 2 && h <= th * 2) return img
  let src: CanvasImageSource = img
  while (w / 2 >= tw && h / 2 >= th) {
    w = Math.round(w / 2)
    h = Math.round(h / 2)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const cx = c.getContext('2d')!
    cx.imageSmoothingQuality = 'high'
    cx.drawImage(src, 0, 0, w, h)
    src = c
  }
  return src
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('画像の書き出しに失敗しました'))),
      format,
      quality,
    )
  })
}

export function outputName(original: string, format: OutputFormat, w: number, h: number) {
  const base = original.replace(/\.[^.]+$/, '')
  const ext = format === 'image/png' ? 'png' : 'jpg'
  return `${base}_16x9_${w}x${h}.${ext}`
}
