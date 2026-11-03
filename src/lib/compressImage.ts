import type { PhotoQuality } from './photoPrefs'

const MAX_DISPLAY = 2048
const MAX_PREVIEW = 1600
const MAX_THUMB = 480
const MIN_SIZE = 200 * 1024

interface Variants {
  main: File
  preview: File | null
  thumb: File | null
}

let webpSupport: boolean | null = null

function supportsWebp() {
  if (webpSupport !== null) return webpSupport
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupport = false
  }
  return webpSupport
}

async function decode(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* 回退到 img */
    }
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode_failed'))
    }
    image.src = url
  })
}

async function render(
  source: ImageBitmap | HTMLImageElement,
  maxEdge: number,
  quality: number,
  name: string,
): Promise<File | null> {
  const width = source.width
  const height = source.height
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(source, 0, 0, targetWidth, targetHeight)

  const type = supportsWebp() ? 'image/webp' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
  if (!blob) return null

  const extension = type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `${name}.${extension}`, { type })
}

export async function makeThumb(file: File): Promise<File | null> {
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml' ||
    /hei[cf]/i.test(file.type)
  ) {
    return null
  }

  try {
    const source = await decode(file)
    const thumb = await render(source, MAX_THUMB, 0.76, 'thumb')
    if ('close' in source) source.close()
    return thumb
  } catch {
    return null
  }
}

export async function makePhotoVariants(
  file: File,
  quality: PhotoQuality,
): Promise<Variants> {
  const fallback: Variants = { main: file, preview: null, thumb: null }

  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml' ||
    /hei[cf]/i.test(file.type) ||
    file.size < MIN_SIZE
  ) {
    return fallback
  }

  try {
    const source = await decode(file)
    const preview = await render(source, MAX_PREVIEW, 0.8, 'preview')
    const thumb = await render(source, MAX_THUMB, 0.76, 'thumb')

    let display: File | null = null
    if (quality !== 'preview') {
      display = await render(source, MAX_DISPLAY, 0.84, 'display')
    }

    if ('close' in source) source.close()

    const usefulPreview =
      preview && preview.size < file.size * 1.05 ? preview : null
    const usefulThumb = thumb && thumb.size < file.size ? thumb : null
    const usefulDisplay =
      display && display.size < file.size * 0.95 ? display : null

    if (quality === 'preview') {
      return {
        main: usefulPreview ?? file,
        preview: null,
        thumb: usefulThumb,
      }
    }

    if (quality === 'raw') {
      return {
        main: file,
        preview: usefulPreview,
        thumb: usefulThumb,
      }
    }

    return {
      main: usefulDisplay ?? file,
      preview: usefulPreview,
      thumb: usefulThumb,
    }
  } catch {
    return fallback
  }
}
