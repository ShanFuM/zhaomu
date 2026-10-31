export function isHeicImage(file: File) {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
}
