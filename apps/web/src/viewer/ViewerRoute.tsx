import { getPdfjs } from '@cifras/pdf';
import { useParams, useSearchParams } from 'react-router';
import type { CatalogApi } from '../catalog/catalogApi';
import '../lib/pdfWorker';
import type { PdfDocument } from './PdfPages';
import { ViewerPage } from './ViewerPage';

// fontExtraProperties: real font names are needed to read chords with readTextLinesFromDocument.
const openPdf = (bytes: Uint8Array): Promise<PdfDocument> =>
  getPdfjs().getDocument({ data: bytes, verbosity: 0, fontExtraProperties: true })
    .promise as unknown as Promise<PdfDocument>;

// Lazy entry point: together with the upload route, the only place that pulls in pdf.js.
export default function ViewerRoute({ api }: { api: CatalogApi }) {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return <ViewerPage api={api} songId={songId} tomSlug={params.get('tom')} openPdf={openPdf} />;
}
