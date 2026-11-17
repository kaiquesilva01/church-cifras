import { getPdfjs, readTextLinesFromDocument } from '@cifras/pdf';
import { useParams, useSearchParams } from 'react-router';
import type { CatalogApi } from '../catalog/catalogApi';
import '../lib/pdfWorker';
import type { PdfDocument } from './PdfPages';
import { createSharedWorker } from './sharedWorker';
import { ViewerPage } from './ViewerPage';

// fontExtraProperties: real font names are needed to read chords with readTextLinesFromDocument.
// A single PDFWorker serves every document: one worker thread (and one copy of pdf.js in memory)
// instead of one per opened key.
const pdfWorker = createSharedWorker(() => new (getPdfjs().PDFWorker)());

const openPdf = (bytes: Uint8Array): Promise<PdfDocument> =>
  getPdfjs().getDocument({
    data: bytes,
    verbosity: 0,
    fontExtraProperties: true,
    worker: pdfWorker(),
  }).promise as unknown as Promise<PdfDocument>;

const readLines = (doc: PdfDocument) =>
  readTextLinesFromDocument(doc as unknown as Parameters<typeof readTextLinesFromDocument>[0]);

// Lazy entry point: together with the upload route, the only place that pulls in pdf.js.
export default function ViewerRoute({ api }: { api: CatalogApi }) {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <ViewerPage
      api={api}
      songId={songId}
      tomSlug={params.get('tom')}
      setlistId={params.get('repertorio')}
      itemId={params.get('item')}
      openPdf={openPdf}
      readLines={readLines}
    />
  );
}
