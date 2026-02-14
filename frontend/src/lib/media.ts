const IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'svg', 'jp2', 'j2k'
])

const VIDEO_EXTENSIONS = new Set([
    'mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'mpeg', 'mpg', 'wmv', 'flv', '3gp'
])

const PDF_EXTENSIONS = new Set([
    'pdf'
])

function getExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    if (dot < 0 || dot === fileName.length - 1) return ''
    return fileName.slice(dot + 1).toLowerCase()
}

export function isImageFileName(fileName: string): boolean {
    return IMAGE_EXTENSIONS.has(getExtension(fileName))
}

export function isVideoFileName(fileName: string): boolean {
    return VIDEO_EXTENSIONS.has(getExtension(fileName))
}

export function isPdfFileName(fileName: string): boolean {
    return PDF_EXTENSIONS.has(getExtension(fileName))
}

export function isMediaFileName(fileName: string): boolean {
    return isImageFileName(fileName) || isVideoFileName(fileName)
}

export function isLikelyMediaDocument(doc: { file_name: string; file_type?: string | null }): boolean {
    const type = (doc.file_type || '').toLowerCase()
    if (type === 'image' || type === 'video') return true
    return isMediaFileName(doc.file_name)
}

export function isLikelyVisualDocument(doc: { file_name: string; file_type?: string | null }): boolean {
    const type = (doc.file_type || '').toLowerCase()
    if (type === 'image' || type === 'video' || type === 'pdf') return true
    return isImageFileName(doc.file_name) || isVideoFileName(doc.file_name) || isPdfFileName(doc.file_name)
}
