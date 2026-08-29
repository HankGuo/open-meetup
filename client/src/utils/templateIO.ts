import JSZip from 'jszip';
import { createPageId } from '../meetingConfig';
import { buildServerApiUrl } from '../serverUrl';
import { LayoutTemplate, MeetingPageDefinition, PageContent } from '../types';

export const TEMPLATE_ENTRY = 'template.json';
export const TEMPLATE_ASSET_PREFIX = 'assets/';

export interface TemplatePreview {
  name: string | null;
  version: number;
  pageCount: number;
  canvasCount: number;
  showcaseCount: number;
  assetCount: number;
  exportedAt: string | null;
}

export interface ParsedTemplateZip {
  zip: JSZip;
  template: LayoutTemplate;
  preview: TemplatePreview;
  fileName: string;
}

export interface TemplateResolveProgress {
  done: number;
  total: number;
}

export class TemplateReadError extends Error {}

function mimeToExtension(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'image/avif') return '.avif';
  if (mime === 'image/bmp') return '.bmp';
  return '.bin';
}

function extensionFromPath(urlPath: string): string {
  const match = urlPath.match(/(\.[a-zA-Z0-9]+)$/);
  return match ? match[1] : '.bin';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToDataUrl(data: Uint8Array, mime: string): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function guessMimeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}

function normalizeResponseMimeType(value: string | null): string {
  if (!value) {
    return '';
  }
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function extractInlineAsset(dataUrl: string): { mimeType: string; data: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1] || 'application/octet-stream',
    data: base64ToUint8Array(match[2]),
  };
}

/** 读取模板 ZIP：校验 template.json、统计预览信息 */
export async function readTemplateZip(file: File): Promise<ParsedTemplateZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new TemplateReadError('无法读取模板文件，请确认为有效的 ZIP 格式。');
  }

  const templateFile = zip.file(TEMPLATE_ENTRY);
  if (!templateFile) {
    throw new TemplateReadError('无效的模板 ZIP：缺少 template.json。');
  }

  let parsed: LayoutTemplate;
  try {
    parsed = JSON.parse(await templateFile.async('text')) as LayoutTemplate;
  } catch {
    throw new TemplateReadError('template.json 解析失败，文件可能已损坏。');
  }

  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.pages)) {
    throw new TemplateReadError('模板版本不受支持，请用最新版 Open Meetup 重新导出。');
  }
  if (parsed.pages.length === 0) {
    throw new TemplateReadError('该模板没有任何页面，无法导入。');
  }

  let assetCount = 0;
  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    assetsFolder.forEach((_relativePath, fileEntry) => {
      if (!fileEntry.dir) {
        assetCount += 1;
      }
    });
  }

  return {
    zip,
    template: parsed,
    preview: {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null,
      version: parsed.version,
      pageCount: parsed.pages.length,
      canvasCount: parsed.pages.filter((page) => page.kind === 'canvas').length,
      showcaseCount: parsed.pages.filter((page) => page.kind === 'showcase').length,
      assetCount,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
    },
    fileName: file.name,
  };
}

/** 把模板打包为 ZIP：canvas 内联素材与 /uploads 图片都会被抽到 assets/ 目录 */
export async function buildTemplateZip(
  name: string,
  pages: MeetingPageDefinition[],
  pageContents: Array<[string, PageContent]>,
): Promise<{ blob: Blob; assetCount: number }> {
  const zip = new JSZip();
  const assetsFolder = zip.folder('assets')!;
  let assetIndex = 0;

  const validPageIds = new Set(pages.map((page) => page.id));
  const resolvedContents: Array<[string, PageContent]> = [];

  for (const [pageId, pageContent] of pageContents) {
    if (!validPageIds.has(pageId)) {
      continue;
    }
    if (pageContent.type === 'canvas') {
      const { content: rewritten, extractedAssets } = await extractExcalidrawAssets(pageContent.content);
      for (const asset of extractedAssets) {
        assetsFolder.file(asset.fileName, asset.data);
        assetIndex += 1;
      }
      resolvedContents.push([pageId, { type: 'canvas', content: rewritten }]);
    } else if (pageContent.type === 'image' && pageContent.content.startsWith('/uploads/')) {
      const assetFileName = `img-${assetIndex++}${extensionFromPath(pageContent.content)}`;
      const blob = await fetch(buildServerApiUrl(pageContent.content)).then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to read asset: ${r.status}`);
        }
        return r.blob();
      });
      assetsFolder.file(assetFileName, blob);
      resolvedContents.push([pageId, { type: 'image', content: `assets/${assetFileName}` }]);
    } else {
      resolvedContents.push([pageId, pageContent]);
    }
  }

  const exportPayload: LayoutTemplate = {
    version: 1,
    name: name.trim() || '未命名模板',
    app: 'open-meetup',
    exportedAt: new Date().toISOString(),
    pages,
    pageContents: resolvedContents,
  };
  zip.file(TEMPLATE_ENTRY, JSON.stringify(exportPayload, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, assetCount: assetIndex };
}

/**
 * 导入前处理：把 ZIP 内 assets/ 下的素材并行上传到当前房间，
 * 返回可直接提交给 layout:import 的模板。onProgress 汇报上传进度。
 */
export async function resolveTemplateAssets(
  zip: JSZip,
  template: LayoutTemplate,
  ticket: string,
  onProgress?: (progress: TemplateResolveProgress) => void,
): Promise<LayoutTemplate> {
  if (!template.pageContents || template.pageContents.length === 0) {
    onProgress?.({ done: 0, total: 0 });
    return template;
  }

  // 预读 ZIP 中全部素材
  const assetCache = new Map<string, Uint8Array>();
  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    const assetFiles: Array<{ name: string; file: JSZip.JSZipObject }> = [];
    assetsFolder.forEach((relativePath, fileEntry) => {
      if (!fileEntry.dir) {
        assetFiles.push({ name: relativePath, file: fileEntry });
      }
    });
    for (const { name, file } of assetFiles) {
      assetCache.set(`${TEMPLATE_ASSET_PREFIX}${name}`, await file.async('uint8array'));
    }
  }

  // 需要上传的素材集合（按内容路径去重，多个页面引用同一素材只上传一次）
  const uploads = new Map<string, { data: Uint8Array; mime: string }>();
  for (const [, pageContent] of template.pageContents) {
    if (pageContent.type === 'image' && pageContent.content.startsWith(TEMPLATE_ASSET_PREFIX)) {
      const assetData = assetCache.get(pageContent.content);
      if (assetData && !uploads.has(pageContent.content)) {
        uploads.set(pageContent.content, {
          data: assetData,
          mime: guessMimeFromFileName(pageContent.content),
        });
      }
    }
  }

  const total = uploads.size;
  onProgress?.({ done: 0, total });
  const uploadedUrls = new Map<string, string>();
  let done = 0;
  let lastError: unknown = null;

  const uploadQueue = Array.from(uploads.entries());
  const workers = Array.from({ length: Math.min(4, Math.max(uploadQueue.length, 1)) }, async () => {
    for (;;) {
      const next = uploadQueue.shift();
      if (!next) {
        return;
      }
      const [assetPath, asset] = next;
      try {
        const blob = new Blob([new Uint8Array(asset.data) as BlobPart], { type: asset.mime });
        uploadedUrls.set(assetPath, await uploadTemplateAssetToServer(blob, asset.mime, ticket));
      } catch (error) {
        lastError = error;
      }
      done += 1;
      onProgress?.({ done, total });
      if (lastError) {
        return;
      }
    }
  });
  await Promise.all(workers);

  if (lastError) {
    throw new Error(
      lastError instanceof Error && lastError.message.includes('过于频繁')
        ? '上传素材过于频繁，请等待一分钟后重试'
        : '上传模板素材失败，请检查网络后重试',
    );
  }

  const resolvedContents: Array<[string, PageContent]> = [];
  for (const [pageId, pageContent] of template.pageContents) {
    if (pageContent.type === 'canvas') {
      const content = await restoreExcalidrawAssets(pageContent.content, assetCache);
      resolvedContents.push([pageId, { type: 'canvas', content }]);
    } else if (pageContent.type === 'image' && pageContent.content.startsWith(TEMPLATE_ASSET_PREFIX)) {
      const serverUrl = uploadedUrls.get(pageContent.content);
      if (!serverUrl) {
        throw new Error('模板素材上传不完整，导入已取消');
      }
      resolvedContents.push([pageId, { type: 'image', content: serverUrl }]);
    } else {
      resolvedContents.push([pageId, pageContent]);
    }
  }

  return { ...template, pageContents: resolvedContents };
}

/** 合并模式：导入页面追加到当前编排末尾，页面 ID 全部重新映射避免冲突 */
export function mergeTemplateWithCurrent(
  currentPages: MeetingPageDefinition[],
  currentContents: Array<[string, PageContent]>,
  resolved: LayoutTemplate,
): LayoutTemplate {
  const idMap = new Map<string, string>();
  const newPages = resolved.pages.map((page) => {
    const newId = createPageId();
    idMap.set(page.id, newId);
    return { ...page, id: newId };
  });

  const remappedContents: Array<[string, PageContent]> = [];
  for (const [pageId, content] of resolved.pageContents ?? []) {
    const mapped = idMap.get(pageId);
    if (mapped) {
      remappedContents.push([mapped, content]);
    }
  }

  const currentPageIds = new Set(currentPages.map((page) => page.id));
  return {
    version: 1,
    name: resolved.name,
    pages: [...currentPages, ...newPages],
    pageContents: [...currentContents.filter(([pageId]) => currentPageIds.has(pageId)), ...remappedContents],
  };
}

async function uploadTemplateAssetToServer(blob: Blob, mimeType: string, ticket: string): Promise<string> {
  const response = await fetch(buildServerApiUrl('/api/uploads/template-asset'), {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      'X-Open-Meetup-Ticket': ticket,
    },
    body: blob,
  });
  if (response.status === 429) {
    throw new Error('上传素材过于频繁，请等待一分钟后重试');
  }
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
  const data = (await response.json()) as { url?: string };
  if (typeof data.url !== 'string' || !data.url.startsWith('/uploads/')) {
    throw new Error('Invalid upload response');
  }
  return data.url;
}

async function extractExcalidrawAssets(
  serialized: string,
): Promise<{ content: string; extractedAssets: Array<{ fileName: string; data: Uint8Array }> }> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return { content: serialized, extractedAssets: [] };
  }

  const files = parsed.files as
    Record<string, { id: string; dataURL: string; mimeType?: string }> | undefined;
  if (!files || typeof files !== 'object') {
    return { content: serialized, extractedAssets: [] };
  }

  const assets: Array<{ fileName: string; data: Uint8Array }> = [];
  const rewrittenFiles: Record<string, unknown> = {};

  for (const [fileId, fileData] of Object.entries(files)) {
    if (!fileData?.dataURL || typeof fileData.dataURL !== 'string') {
      rewrittenFiles[fileId] = fileData;
      continue;
    }
    const dataUrl = fileData.dataURL;
    const inlineAsset = extractInlineAsset(dataUrl);
    if (inlineAsset) {
      const mime = inlineAsset.mimeType || fileData.mimeType || 'application/octet-stream';
      const fileName = `exc-${fileId}${mimeToExtension(mime)}`;
      assets.push({ fileName, data: inlineAsset.data });
      rewrittenFiles[fileId] = { ...fileData, dataURL: `assets/${fileName}` };
      continue;
    }

    if (!dataUrl.startsWith('/uploads/')) {
      rewrittenFiles[fileId] = fileData;
      continue;
    }

    const response = await fetch(buildServerApiUrl(dataUrl));
    if (!response.ok) {
      throw new Error(`Failed to read canvas asset: ${response.status}`);
    }
    const mime =
      fileData.mimeType ||
      normalizeResponseMimeType(response.headers.get('content-type')) ||
      guessMimeFromFileName(dataUrl);
    const binary = new Uint8Array(await response.arrayBuffer());
    const fileName = `exc-${fileId}${mimeToExtension(mime) || extensionFromPath(dataUrl)}`;
    assets.push({ fileName, data: binary });
    rewrittenFiles[fileId] = { ...fileData, dataURL: `assets/${fileName}` };
  }

  if (assets.length === 0) {
    return { content: serialized, extractedAssets: [] };
  }

  parsed.files = rewrittenFiles;
  return { content: JSON.stringify(parsed), extractedAssets: assets };
}

async function restoreExcalidrawAssets(
  serialized: string,
  assetCache: Map<string, Uint8Array>,
): Promise<string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return serialized;
  }

  const files = parsed.files as
    Record<string, { id: string; dataURL: string; mimeType?: string }> | undefined;
  if (!files || typeof files !== 'object') {
    return serialized;
  }

  let changed = false;
  const restoredFiles: Record<string, unknown> = {};

  for (const [fileId, fileData] of Object.entries(files)) {
    if (!fileData?.dataURL || typeof fileData.dataURL !== 'string') {
      restoredFiles[fileId] = fileData;
      continue;
    }

    const dataUrl = fileData.dataURL;
    if (dataUrl.startsWith(TEMPLATE_ASSET_PREFIX)) {
      const assetData = assetCache.get(dataUrl);
      if (assetData) {
        const mime = fileData.mimeType || guessMimeFromFileName(dataUrl);
        restoredFiles[fileId] = { ...fileData, dataURL: uint8ArrayToDataUrl(assetData, mime) };
        changed = true;
      } else {
        restoredFiles[fileId] = fileData;
      }
    } else if (dataUrl.startsWith('/uploads/')) {
      const mime = fileData.mimeType || guessMimeFromFileName(dataUrl);
      try {
        const resp = await fetch(buildServerApiUrl(dataUrl));
        if (resp.ok) {
          const assetData = new Uint8Array(await resp.arrayBuffer());
          restoredFiles[fileId] = { ...fileData, dataURL: uint8ArrayToDataUrl(assetData, mime) };
          changed = true;
        } else {
          restoredFiles[fileId] = fileData;
        }
      } catch {
        restoredFiles[fileId] = fileData;
      }
    } else {
      restoredFiles[fileId] = fileData;
    }
  }

  if (!changed) {
    return serialized;
  }

  parsed.files = restoredFiles;
  return JSON.stringify(parsed);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}
