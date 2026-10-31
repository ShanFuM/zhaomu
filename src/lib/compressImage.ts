const MAX_EDGE = 1600
const QUALITY = 0.82
const MIN_SIZE = 500 * 1024

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

export async function makePreview(file: File): Promise<File | null> {
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml' ||
    /hei[cf]/i.test(file.type)
  ) {
    return null
  }

  if (file.size < MIN_SIZE) return null

  try {
    const source = await decode(file)
    const width = source.width
    const height = source.height
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(source, 0, 0, targetWidth, targetHeight)

    if ('close' in source) source.close()

    const type = supportsWebp() ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, QUALITY)
    })

    if (!blob || blob.size >= file.size * 0.92) return null

    const extension = type === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `preview.${extension}`, { type })
  } catch {
    return null
  }
}
