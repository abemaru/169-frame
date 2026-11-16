export type OutputFormat = 'image/png' | 'image/jpeg'
export type RotateDir = 'cw' | 'ccw'

export interface ComposeOptions {
  width: number
  height: number
  /** 縦長画像を横向きにするときの回転方向 */
  rotate: RotateDir
}

export const SIZE_PRESETS = [
  { label: '2048 × 1152（VRChat上限内で最大）', width: 2048, height: 1152 },
  { label: '1920 × 1080（フルHD）', width: 1920, height: 1080 },
  { label: '1280 × 720（HD・軽量）', width: 1280, height: 720 },
] as const

/** VRChat にアップロードできる最大辺 */
export const VRC_MAX_EDGE = 2048

type Source = HTMLCanvasElement | ImageBitmap

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  // EXIF の向き情報を反映して読み込む
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

export function isPortrait(img: { width: number; height: number }) {
  return img.height > img.width
}

/** 縦長なら90°回転して横長にする */
function toLandscape(img: ImageBitmap, dir: RotateDir): Source {
  if (!isPortrait(img)) return img
  const c = document.createElement('canvas')
  c.width = img.height
  c.height = img.width
  const ctx = c.getContext('2d')!
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(dir === 'cw' ? Math.PI / 2 : -Math.PI / 2)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  return c
}

export function compose(canvas: HTMLCanvasElement, img: ImageBitmap, opts: ComposeOptions) {
  const { width: W, height: H } = opts
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D が使えません')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const src = toLandscape(img, opts.rotate)
  const scale = Math.min(W / src.width, H / src.height)
  const dw = Math.round(src.width * scale)
  const dh = Math.round(src.height * scale)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(stepDown(src, dw, dh), Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh)
}

/** 大幅縮小時のジャギー対策として段階的に縮小 */
function stepDown(img: Source, tw: number, th: number): Source {
  let w = img.width
  let h = img.height
  let src: Source = img
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

export function canvasToBlob(canvas: HTMLCanvasElement, format: OutputFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の書き出しに失敗しました'))), format, quality)
  })
}

export function outputName(original: string, format: OutputFormat, w: number, h: number) {
  const base = original.replace(/\.[^.]+$/, '')
  const ext = format === 'image/png' ? 'png' : 'jpg'
  return `${base}_16x9_${w}x${h}.${ext}`
}
